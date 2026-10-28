// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The state the change starts FROM: the base Space's Units immediately before
 * the change. The ChangeOrder console reads it for the resource identity of its
 * source rows, because a change that alters identity (a rename, a namespace
 * rewrite) leaves the old spelling only on this side, and the stage rows are
 * keyed from it.
 *
 * That state has a name in the API: `Before:ChangeOrder:<id>`, the same
 * reference a promotion's clone step uses to decide what a downstream Space
 * starts from. Resolved here via a bulk DRY-RUN restore
 * (`restore=Before:ChangeOrder:<id>`, `dry_run=true`, scoped to the base Space) —
 * the server resolves the reference and returns each unit's resolved Data
 * without persisting anything.
 *
 * NOT VIA THE REVISION HISTORY. `/api/revision` for a given Unit returns only
 * its CURRENT head row, not an archive of every past edit, so a scan for "the
 * Revision immediately before the one carrying this ChangeOrder" never finds
 * more than the one row already at hand.
 *
 * WHEN IT CANNOT BE RESOLVED AT ALL, NOTHING IS CLAIMED: no fallback to the
 * base as it stands now, which already contains the change. A 207 whose items
 * are individually errored degrades per unit instead: an errored unit's slug is
 * simply absent from `dataBySlug`, and the caller then keys that row from the
 * Unit's current data (see `useChangeOrderConsoleChanges.ts`).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useBulkPatchUnitsMutation, type UnitCreateOrUpdateResponseRead } from '@confighub/rtk-query';

export interface UseChangeOrderBaselineArgs {
  changeOrderId: string | undefined;
  /** The Space the ChangeOrder resides in. */
  baseSpaceId: string | undefined;
  /** Unit id → slug, for the base's Units, so the result can be keyed by name. */
  baseUnitSlugById: ReadonlyMap<string, string>;
  skip: boolean;
}

/**
 * Three states, not two.
 *
 * `loading` is deliberately distinct from `unresolvable`. Collapsing them into
 * one boolean means the UI announces "cannot be determined" during
 * every ordinary fetch — claiming an ignorance it does not yet have, which is
 * the same fault as claiming knowledge it does not have. Not knowing YET and
 * not being able to know are different things and the reader deserves the
 * difference.
 */
export type ChangeOrderBaselineStatus = 'loading' | 'resolved' | 'unresolvable';

export interface ChangeOrderBaseline {
  /** Resource slug → its configuration data immediately before the change. */
  dataBySlug: ReadonlyMap<string, string>;
  status: ChangeOrderBaselineStatus;
}

const EMPTY: ReadonlyMap<string, string> = new Map();

export function useChangeOrderBaseline(args: UseChangeOrderBaselineArgs): ChangeOrderBaseline {
  const { changeOrderId, baseSpaceId, baseUnitSlugById, skip } = args;

  const [restorePatch] = useBulkPatchUnitsMutation();
  const [dataByUnitId, setDataByUnitId] = useState<ReadonlyMap<string, string>>(() => new Map());
  // `undefined` until the first attempt for the current scope settles — see
  // `useChangeOrderChanges.ts`'s identical `dryRunOutcomeByKey` for why this needs
  // to be tri-state rather than a plain "loaded" boolean (rule 16).
  const [outcome, setOutcome] = useState<'succeeded' | 'failed' | undefined>(undefined);

  const scopeKey = skip || baseSpaceId === undefined || changeOrderId === undefined
    ? ''
    : `${baseSpaceId}|${changeOrderId}`;

  // Guards against re-issuing the same mutation-shaped request on every
  // render — a bulk PATCH used as a read does not cache/dedupe like an RTK
  // Query query would.
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    if (scopeKey === '') return;
    if (lastKeyRef.current === scopeKey) return;
    lastKeyRef.current = scopeKey;
    setOutcome(undefined);

    /*
     * Switching ChangeOrder mid-flight leaves the previous request still in the
     * air. Its response must not land on the newer scope's state — and nothing
     * downstream would catch it if it did, because two ChangeOrders over a
     * shared base Space resolve the SAME unit ids, so a stale baseline merges
     * in silently and reads as real drift. Keyed the same way
     * `useChangeOrderChanges.ts` keys its cache.
     */
    const requestedKey = scopeKey;

    restorePatch({
      where: `SpaceID = '${baseSpaceId}'`,
      restore: `Before:ChangeOrder:${changeOrderId}`,
      dryRun: true,
      // A dry run stores nothing, so the resolved configuration comes back on
      // the response only when asked for — it is no longer a field of Unit
      // itself (config Data and MutationSources moved to their own APIs).
      include: 'ConfigData',
      // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
      body: JSON.stringify({}),
    })
      .unwrap()
      .then((results: UnitCreateOrUpdateResponseRead[]) => {
        if (lastKeyRef.current !== requestedKey) return;
        // 207 Multi-Status carries per-item Error fields that a bare status
        // check does not surface — an errored item must not contribute a
        // baseline value, silently or otherwise.
        const next = new Map<string, string>();
        for (const result of results) {
          if (result?.Error) continue;
          const unitId = result.Unit?.UnitID;
          const data = result.ConfigData;
          if (unitId !== undefined && data !== undefined) next.set(unitId, data);
        }
        setDataByUnitId(next);
        setOutcome('succeeded');
      })
      .catch(() => {
        if (lastKeyRef.current !== requestedKey) return;
        // A request-level failure (as opposed to a per-item 207 error) leaves
        // no baseline at all for this scope — see the "unresolvable" note above.
        setOutcome('failed');
      });
  }, [scopeKey, baseSpaceId, changeOrderId, restorePatch]);

  return useMemo(() => {
    if (scopeKey === '' || outcome === undefined) {
      return { dataBySlug: EMPTY, status: 'loading' as const };
    }

    const dataBySlug = new Map<string, string>();
    for (const [unitId, data] of dataByUnitId) {
      const slug = baseUnitSlugById.get(unitId);
      if (slug !== undefined) dataBySlug.set(slug, data);
    }

    /*
     * Resolving nothing is not a baseline — reporting it as resolved would let
     * every Space's whole configuration read as drift. Covers both a
     * request-level failure (`outcome === 'failed'`) and a 207 whose every
     * item errored (`outcome === 'succeeded'` but `dataBySlug` still empty).
     */
    return { dataBySlug, status: dataBySlug.size > 0 ? 'resolved' as const : 'unresolvable' as const };
  }, [scopeKey, outcome, dataByUnitId, baseUnitSlugById]);
}
