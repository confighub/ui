// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The state the change starts FROM — the yardstick a local override is measured
 * against.
 *
 * WHY NOT JUST COMPARE AGAINST THE BASE AS IT IS NOW. Because the base is where
 * the change was made, so its current data already contains the change. A Space
 * that has not yet been promoted therefore differs from it on exactly the paths
 * the ChangeOrder carries — and calling those differences "local overrides" is
 * calling the pending change an override. That mistake reported ~30 overrides in
 * a fixture that had none, and, far worse, told a Space whose pinned image was
 * about to be replaced that "the promote does not touch it".
 *
 * A local override is a value a Space holds that differs from the SHARED
 * STARTING POINT — what the base looked like immediately before the change.
 * Match that, and the Space is simply un-promoted. Differ from it, and the Space
 * has genuinely claimed its own value.
 *
 * That state has a name in the API: `Before:ChangeOrder:<id>`, the same
 * reference a promotion's clone step uses to decide what a downstream Space
 * starts from. Resolved here via a bulk DRY-RUN restore
 * (`restore=Before:ChangeOrder:<id>`, `dry_run=true`, scoped to the base Space) —
 * the server resolves the reference and returns each unit's resolved Data
 * without persisting anything.
 *
 * NOT VIA THE REVISION HISTORY (an earlier version of this hook, and how the
 * doc comment above used to read). `/api/revision` for a given Unit returns
 * only its CURRENT head row, not an archive of every past edit — confirmed
 * empirically by making further edits to a unit and watching the row count
 * stay at 1 while RevisionNum climbed. A hook that scans for "the Revision
 * immediately before the one carrying this ChangeOrder" therefore never finds
 * more than the one row already at hand, and permanently reports `unresolvable`
 * — which is exactly what shipped and is what this rewrite fixes.
 *
 * WHEN IT CANNOT BE RESOLVED AT ALL, NO OVERRIDE IS CLAIMED. Not "probably
 * none", not a fallback to comparing against the current base — nothing. This
 * feature's whole job is telling someone whether their local value survives a
 * promote, and a guess there is the one thing worse than silence. A 207 whose
 * items are individually errored degrades per unit instead: an errored unit's
 * slug is simply absent from `dataBySlug`, which callers already treat as "no
 * baseline for this one" (see `rolloutMergedUnits.ts`).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useBulkPatchUnitsMutation, type UnitCreateOrUpdateResponseRead } from '@confighub/rtk-query';

export interface UseRolloutBaselineArgs {
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
 * one boolean means the UI announces "overrides cannot be determined" during
 * every ordinary fetch — claiming an ignorance it does not yet have, which is
 * the same fault as claiming knowledge it does not have. Not knowing YET and
 * not being able to know are different things and the reader deserves the
 * difference.
 */
export type RolloutBaselineStatus = 'loading' | 'resolved' | 'unresolvable';

export interface RolloutBaseline {
  /** Resource slug → its configuration data immediately before the change. */
  dataBySlug: ReadonlyMap<string, string>;
  status: RolloutBaselineStatus;
}

const EMPTY: ReadonlyMap<string, string> = new Map();

export function useRolloutBaseline(args: UseRolloutBaselineArgs): RolloutBaseline {
  const { changeOrderId, baseSpaceId, baseUnitSlugById, skip } = args;

  const [restorePatch] = useBulkPatchUnitsMutation();
  const [dataByUnitId, setDataByUnitId] = useState<ReadonlyMap<string, string>>(() => new Map());
  // `undefined` until the first attempt for the current scope settles — see
  // `useRolloutChanges.ts`'s identical `dryRunOutcomeByKey` for why this needs
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
     * `useRolloutChanges.ts` keys its cache.
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
