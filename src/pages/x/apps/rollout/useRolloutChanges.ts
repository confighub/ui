// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The before/after values for the SELECTED rollout stage.
 *
 * Fetched for the selected stage only, since both sources are relatively
 * expensive and there is only ever one stage on screen at a time (D2). Keyed by
 * stage id in the return value for continuity with callers that loop over the
 * whole sequence (e.g. the override-callout derivation), but in practice holds
 * at most one entry.
 *
 * TWO SOURCES, chosen PER SPACE by whether that Space has already taken the
 * change — see `takenSpaceIds` below, and U16:
 *
 *  - NOT YET PROMOTED — a dry-run of the real promotion
 *    (`upgrade=true`, `change_order=<id>`, `dry_run=true`). The server computes
 *    the merged result and returns it without persisting, so the "incoming"
 *    value is what the promote would genuinely write, not a guess assembled in
 *    the browser. This is the same mechanism the upgrade preview in this view
 *    already uses.
 *
 *  - ALREADY PROMOTED — the Revisions that carry the ChangeOrder in that
 *    Space. Their `Data` is what was actually written (the "after" side), so
 *    it is a record rather than a re-derivation. The "before" side is NOT
 *    `currentDataByUnitId` — that is the unit's CURRENT, already-promoted
 *    data, which equals the written revision's own data for any unit
 *    nothing has touched since, silently diffing as "no change" instead of
 *    showing the promotion that actually happened. The real "before" is the
 *    revision immediately PRECEDING the one that carries the ChangeOrder,
 *    for the SAME unit (`priorDataByUnitId`) — this works identically for
 *    the source stage too, since its own ChangeSet-closing revision is
 *    found by the exact same `ChangeOrders ? '<id>'` query.
 *
 * Both read real configuration data. Neither infers what changed from
 * `ResolvedSpaceIDs`, which is a claim about Link pointers and can legitimately
 * disagree with the bytes — see the header of `rolloutChanges.ts`.
 *
 * PARTITIONED PER SPACE, NOT PER STAGE (U16). An earlier version of this hook
 * scoped BOTH fetches on a single stage-level "is this stage written" flag,
 * inherited from `rolloutState.ts`'s aggregate stage verdict (`'promoted'`
 * requires EVERY Space of the stage). Promote is two calls (clone, then
 * upgrade), and a mid-sequence failure (predecessor §9.3) can leave a stage
 * with some Spaces written and others not — which the stage-level scoping
 * defeated in a specific way: the written-Revision query was scoped to ALL of
 * the stage's Spaces or NONE of them, so a part-promoted stage never queried
 * Revisions for ANY of its Spaces, including the one that genuinely was
 * written. Every unit in that stage then fell through to the dry-run path and
 * read as not-written — the mirror image of the bug `RolloutChangeGroup.written`
 * was written to prevent (an UN-written unit marked written), landing on
 * WRITTEN units marked un-written instead, because the fix that carries
 * provenance per unit was still fed by a scope decided per stage.
 *
 * The two fetch scopes now partition the stage's Spaces by `takenSpaceIds`
 * directly, so a mixed stage queries both sources at once: written data for
 * the Spaces that have taken the change, a dry run for the ones that have not.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  useBulkPatchUnitsMutation,
  useListAllRevisionsQuery,
  type UnitCreateOrUpdateResponseRead,
} from '@confighub/rtk-query';
import { useRevisionDataMap } from '@/hooks/useUnitData';

import { buildRolloutChangeGroups, conflictBlocks, type RolloutChangeSource } from './rolloutChanges';
import type { RolloutChangeGroup, RolloutResourceConflict, RolloutStage } from './rolloutTypes';

export interface UseRolloutChangesArgs {
  changeOrderId: string | undefined;
  stages: RolloutStage[];
  /**
   * The one stage currently in view. Only its data is fetched — there is no
   * accordion anymore (D2, D7c), so fetching for stages nobody can see would be
   * pure waste.
   */
  selectedStageId: string | null;
  /**
   * Space ids that have taken the ChangeOrder — per Space (`RolloutProgress.
   * resolvedSpaceIds`), not per stage. See the file header (U16) for why a
   * stage-level flag is the wrong granularity here specifically.
   */
  takenSpaceIds: ReadonlySet<string>;
  /** Current configuration data per Unit, keyed by unit id — the "before" side. */
  currentDataByUnitId: ReadonlyMap<string, { slug: string; spaceId: string; data?: string }>;
  skip: boolean;
}

const EMPTY_GROUPS: ReadonlyMap<string, RolloutChangeGroup[]> = new Map();

export function useRolloutChanges(args: UseRolloutChangesArgs): ReadonlyMap<string, RolloutChangeGroup[]> {
  const { changeOrderId, stages, selectedStageId, takenSpaceIds, currentDataByUnitId, skip } = args;

  const selectedStage = useMemo(
    () => stages.find((s) => s.id === selectedStageId),
    [stages, selectedStageId],
  );

  const [dryRunPatch] = useBulkPatchUnitsMutation();
  const [dryRunDataByUnitId, setDryRunDataByUnitId] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  /**
   * Units the dry run ANSWERED FOR and gave no configuration back.
   *
   * ⚠️ NOT THE SAME AS A UNIT THE RESPONSE NEVER MENTIONED, and collapsing the
   * two is what made "we could not tell" render as a confident verdict. A unit
   * absent from the response was never considered; a unit present in it with no
   * `ConfigData` and no `Error` WAS considered and produced no answer. Both used
   * to arrive downstream as an undefined `afterData`, which
   * `buildRolloutChangeGroups` reads as "this promotion changes nothing here" —
   * so the second case became an empty field-diff set, and an empty diff set is
   * a signature the variant matrix compares against its peers. A unit nobody
   * could get an answer for was reported as taking a DIFFERENT change from its
   * siblings, which is a claim with nothing behind it, on the screen a person
   * promotes from.
   *
   * Kept per unit because the failure is per unit. `dryRunFailed` is per SCOPE:
   * it can only say the whole request failed, so it can never describe one unit
   * inside a 200.
   */
  const [answeredWithNoDataUnitIds, setAnsweredWithNoDataUnitIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** What the dry run refused, per resource. Empty until a dry run reports one. */
  const [dryRunConflictsByUnitId, setDryRunConflictsByUnitId] = useState<
    ReadonlyMap<string, readonly RolloutResourceConflict[]>
  >(() => new Map());
  /**
   * The outcome of the most recent dry-run attempt for a given scope key —
   * `undefined` (absent) until the first attempt returns at all.
   *
   * Distinct from a plain "settled" boolean (which this replaces): the other
   * half of hard rule 16 is that "this promotion changes nothing here" is a
   * claim that must be EARNED, and a failed attempt earns nothing. `succeeded`
   * lets the assembly step below tell "we checked, and it changes nothing" from
   * "we tried to check and could not" — see the caller-half guard in the
   * assembly `useMemo`, and rolloutChanges.ts's `determinable` field, which is
   * where this distinction actually lands per unit.
   */
  const [dryRunOutcomeByKey, setDryRunOutcomeByKey] = useState<ReadonlyMap<string, 'succeeded' | 'failed'>>(
    () => new Map(),
  );

  // Space ids of the selected stage that have NOT taken the change yet — the
  // dry-run scope. The source stage has already taken its own change by
  // definition, so it is never part of this scope.
  const pendingSpaceIds = useMemo(() => {
    if (selectedStage === undefined || selectedStage.isSource) return [];
    return selectedStage.spaceIds.filter((id) => !takenSpaceIds.has(id)).sort((a, b) => a.localeCompare(b));
  }, [selectedStage, takenSpaceIds]);

  // Join once so the effect below depends on a primitive rather than a fresh
  // array identity every render.
  const pendingKey = pendingSpaceIds.join(',');

  // Guards against re-issuing the same dry-run when an unrelated render happens.
  const lastDryRunKeyRef = useRef<string>('');

  useEffect(() => {
    if (skip || changeOrderId === undefined || pendingKey === '') return;
    const scopeKey = `${changeOrderId}|${pendingKey}`;
    if (lastDryRunKeyRef.current === scopeKey) return;
    lastDryRunKeyRef.current = scopeKey;
    const markOutcome = (outcome: 'succeeded' | 'failed') =>
      setDryRunOutcomeByKey((prev) => {
        const next = new Map(prev);
        next.set(scopeKey, outcome);
        return next;
      });

    const where = `SpaceID IN (${pendingKey
      .split(',')
      .map((id) => `'${id}'`)
      .join(', ')})`;

    dryRunPatch({
      upgrade: true,
      dryRun: true,
      changeOrder: changeOrderId,
      where,
      // A dry run stores nothing, so the resolved configuration comes back on
      // the response only when asked for — it is no longer a field of Unit
      // itself (config Data and MutationSources moved to their own APIs).
      include: 'ConfigData',
      // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
      body: JSON.stringify({}),
    })
      .unwrap()
      .then((results: UnitCreateOrUpdateResponseRead[]) => {
        setDryRunDataByUnitId((prev) => {
          const next = new Map(prev);
          for (const result of results) {
            const unitId = result.Unit?.UnitID;
            const data = result.ConfigData;
            if (unitId !== undefined && data !== undefined) next.set(unitId, data);
          }
          return next;
        });
        // The response named these and gave nothing for them. Recording that is
        // the whole point: silently skipping them threw away the one fact that
        // separates "no answer" from "no change".
        /*
         * The refusals arrive on the SAME envelope as the configuration, keyed
         * by the resource they belong to, and were previously read off and
         * dropped. Attribution needs no name matching: the response says which
         * resource each conflict is for, so nothing here touches the row key.
         *
         * A DRY RUN DOES RETURN THESE. An upgrade sets `mergeRan`, and
         * `internal/views/unit_update.go:1499-1500` assigns the conflicts to the
         * IN-MEMORY resource before the dry-run-gated persistence call, so
         * skipping the write cannot skip them. `UnitWriteResponder`'s own doc
         * settles it: the resource it is handed is "the one the operation
         * produced -- for a dry run, held only in memory".
         *
         * What is untested is whether a real stage produces a refusal worth
         * showing. That is a question about the data, not about the transport,
         * so an empty list stays the ordinary case and must render as though
         * this feature were not here.
         */
        setDryRunConflictsByUnitId((prev) => {
          const next = new Map(prev);
          for (const result of results) {
            const unitId = result.Unit?.UnitID;
            if (unitId === undefined) continue;
            const conflicts = (result.Conflicts ?? []).map((conflict) => ({
              reason: conflict.Reason ?? '',
              resourceName: conflict.Resource?.ResourceName,
              path: conflict.Path,
              details: conflict.Details,
              blocks: conflictBlocks(conflict.Reason),
            }));
            if (conflicts.length > 0) next.set(unitId, conflicts);
            else next.delete(unitId);
          }
          return next;
        });
        setAnsweredWithNoDataUnitIds((prev) => {
          const next = new Set(prev);
          for (const result of results) {
            const unitId = result.Unit?.UnitID;
            if (unitId === undefined) continue;
            if (result.ConfigData === undefined) next.add(unitId);
            else next.delete(unitId);
          }
          return next;
        });
        markOutcome('succeeded');
      })
      .catch(() => {
        /*
         * A failed dry-run leaves the previous values in place rather than
         * blanking the tree. An empty tree would read as "this promotion writes
         * nothing", which is a much more misleading thing to show than slightly
         * stale values -- and the promote itself is guarded independently.
         *
         * Marking the outcome 'failed' (rather than leaving it unset forever)
         * is still necessary: leaving the step on "working it out" forever would
         * be its own false claim. The assembly step below uses the outcome, not
         * just its presence, to tell a real "nothing changed" apart from "we
         * could not check" for any unit that has no prior data to fall back on.
         */
        markOutcome('failed');
      });
  }, [skip, changeOrderId, pendingKey, dryRunPatch]);

  // ── Written: the Revisions that carry the ChangeOrder, for the Spaces that
  //    have actually taken it (plus the source, which always has) ───────────
  const writtenSpaceIds = useMemo(() => {
    if (selectedStage === undefined) return [];
    if (selectedStage.isSource) return [...selectedStage.spaceIds].sort((a, b) => a.localeCompare(b));
    return selectedStage.spaceIds.filter((id) => takenSpaceIds.has(id)).sort((a, b) => a.localeCompare(b));
  }, [selectedStage, takenSpaceIds]);

  const writtenWhere = useMemo(() => {
    if (changeOrderId === undefined || writtenSpaceIds.length === 0) return undefined;
    const spaces = writtenSpaceIds.map((id) => `'${id}'`).join(', ');
    return `ChangeOrders ? '${changeOrderId}' AND SpaceID IN (${spaces})`;
  }, [changeOrderId, writtenSpaceIds]);

  const { data: carryingRevisions, isLoading: revisionsLoading } = useListAllRevisionsQuery(
    { where: writtenWhere, select: 'RevisionID,UnitID,SpaceID,RevisionNum' },
    { skip: skip || writtenWhere === undefined },
  );
  // Revision configuration is its own API now, not a selectable field — see
  // useUnitData.ts's file header. Fetched for exactly the revisions the list
  // above named, in one request.
  const { dataFor: carryingDataFor, isFetching: carryingDataFetching } = useRevisionDataMap(
    (carryingRevisions ?? []).map((r) => r.Revision?.RevisionID),
  );

  /**
   * A unit can have MORE THAN ONE revision carrying the same ChangeOrder id —
   * confirmed against real data: a base unit's `change_orders` column gets
   * stamped onto every revision from the ChangeSet's own start through its
   * close, not only the final one. `writtenDataByUnitId`/
   * `writtenRevisionNumByUnitId` must resolve to the LATEST (highest
   * RevisionNum) match per unit — the actual current/head state this
   * promotion left behind — not whichever one happens to come last out of
   * the query, which silently produced the wrong "before" reference (an
   * earlier revision that ALSO already carries the ChangeOrder, so its own
   * predecessor read as no-change).
   */
  const { writtenDataByUnitId, writtenRevisionNumByUnitId } = useMemo(() => {
    const dataIndex = new Map<string, string>();
    const revisionNumIndex = new Map<string, number>();
    for (const revision of carryingRevisions ?? []) {
      const unitId = revision.Unit?.UnitID ?? revision.Revision?.UnitID;
      const revisionId = revision.Revision?.RevisionID;
      const revisionNum = revision.Revision?.RevisionNum;
      if (unitId === undefined || revisionId === undefined || revisionNum === undefined) continue;
      const existingNum = revisionNumIndex.get(unitId);
      if (existingNum !== undefined && existingNum >= revisionNum) continue;
      dataIndex.set(unitId, carryingDataFor(revisionId));
      revisionNumIndex.set(unitId, revisionNum);
    }
    return { writtenDataByUnitId: dataIndex, writtenRevisionNumByUnitId: revisionNumIndex };
  }, [carryingRevisions, carryingDataFor]);

  /**
   * A written unit's "before" is the revision immediately PRECEDING the one
   * that carries the ChangeOrder — for the SAME unit, in the SAME Space —
   * never `currentDataByUnitId`, which is the unit's CURRENT (post-promotion)
   * data and so equals the written revision's own data for any unit nothing
   * has touched since. Diffing current-against-current silently reads as "no
   * change", which is exactly the gap this fixes: "click a promoted node,
   * see what happened" needs the actual pre-promotion value, not a
   * tautology. Works identically for the SOURCE stage too — base's own
   * revision that closes the ChangeSet is found by the SAME `ChangeOrders ?
   * '<id>'` query above (`writtenSpaceIds` already includes it), so its
   * RevisionNum - 1 is the ChangeSet's own start state. No separate
   * Tag-based lookup needed for the source stage.
   *
   * `UnitID IN (...) AND RevisionNum IN (...)` over-fetches on purpose — the
   * two lists aren't paired server-side, so this can return, e.g., unit A's
   * revision at a number that was really meant for unit B. Harmless: the
   * assembly below matches every returned row against its OWN unit's target
   * RevisionNum exactly, so a mismatched cross-unit row is simply never
   * selected. Cheaper than one request per unit, and simpler than exposing a
   * per-unit "latest before X" query.
   */
  const priorWhere = useMemo(() => {
    if (writtenRevisionNumByUnitId.size === 0) return undefined;
    const unitIds = [...writtenRevisionNumByUnitId.keys()].map((id) => `'${id}'`).join(', ');
    const priorNums = [...writtenRevisionNumByUnitId.values()]
      .map((n) => n - 1)
      .filter((n) => n >= 0);
    if (priorNums.length === 0) return undefined;
    return `UnitID IN (${unitIds}) AND RevisionNum IN (${priorNums.join(', ')})`;
  }, [writtenRevisionNumByUnitId]);

  const { data: priorRevisions, isLoading: priorRevisionsLoading, isError: priorRevisionsErrored } = useListAllRevisionsQuery(
    { where: priorWhere, select: 'RevisionID,UnitID,RevisionNum' },
    { skip: skip || priorWhere === undefined },
  );
  // Same reason as carryingDataFor above: Revision configuration is fetched
  // separately from the list now.
  const { dataFor: priorDataFor, isFetching: priorDataFetching } = useRevisionDataMap(
    (priorRevisions ?? []).map((r) => r.Revision?.RevisionID),
  );

  /**
   * `isLoading` alone is not enough here — reproduced live (see the "click a
   * node, sometimes get an unfiltered treeview that clears on the next
   * click" bug report): on the VERY FIRST render where `priorWhere` goes
   * from undefined to a real value (the instant `writtenRevisionNumByUnitId`
   * arrives), this query un-skips for the first time, and `isLoading` can
   * still read `false` for that one render before RTK Query's fetch actually
   * dispatches and flips it — a real, observed one-render gap, not a
   * theoretical one. `writtenPending` gated on `isLoading` alone let
   * `stageSettled` go true for exactly that render, with `priorDataByUnitId`
   * still empty, so the written unit's `beforeData` read as `undefined`,
   * `determinable` false, `upgradeEntry` absent, `totalUpgradableFields` 0 —
   * — a settled-looking snapshot that is simply wrong. Anything that acts on
   * it once is not re-run when the real, non-zero counts land a render later.
   * Checking the DATA itself (still undefined until a real response lands)
   * is immune to that gap in a way the loading flag is not.
   */
  const priorDataPending =
    writtenRevisionNumByUnitId.size > 0 &&
    priorWhere !== undefined &&
    (priorRevisions === undefined || priorDataFetching) &&
    !priorRevisionsErrored;

  const priorDataByUnitId = useMemo(() => {
    const index = new Map<string, string>();
    for (const revision of priorRevisions ?? []) {
      const unitId = revision.Unit?.UnitID ?? revision.Revision?.UnitID;
      const revisionNum = revision.Revision?.RevisionNum;
      const revisionId = revision.Revision?.RevisionID;
      if (unitId === undefined || revisionNum === undefined || revisionId === undefined) continue;
      if (writtenRevisionNumByUnitId.get(unitId) !== revisionNum + 1) continue;
      index.set(unitId, priorDataFor(revisionId));
    }
    return index;
  }, [priorRevisions, writtenRevisionNumByUnitId, priorDataFor]);

  // ── Assemble the selected stage ─────────────────────────────────────────────
  return useMemo(() => {
    if (skip || changeOrderId === undefined || selectedStage === undefined) return EMPTY_GROUPS;

    /*
     * Hard rule 16, caller half: do not answer "what does this promotion write"
     * before BOTH sources this stage actually needs have arrived. A stage with
     * any un-taken Space waits on the dry run; a stage with any taken Space (or
     * the source) waits on the Revision query. Either half omitted here renders
     * as "working it out" rather than as a confident nothing — and, per U16,
     * only the half a Space genuinely needs is waited on, so a fully-pending
     * stage never blocks on a Revision query it has no Spaces for, and vice
     * versa.
     */
    const writtenPending =
      writtenSpaceIds.length > 0 &&
      (revisionsLoading || carryingDataFetching || priorRevisionsLoading || priorDataPending);
    const scopeKey = `${changeOrderId}|${pendingKey}`;
    const dryRunOutcome = pendingKey === '' ? undefined : dryRunOutcomeByKey.get(scopeKey);
    const dryRunPending = pendingKey !== '' && dryRunOutcome === undefined;
    if (writtenPending || dryRunPending) return EMPTY_GROUPS;

    const dryRunFailed = pendingKey !== '' && dryRunOutcome === 'failed';

    /*
     * EVERY Space in the stage, not one representative. A promote writes the
     * same change into each of a stage's Spaces, which is why an earlier
     * version of this assembly showed only the first Space that had values —
     * that was correct for a tree keyed on resource NAME (the old stepper's
     * tree), but the tree this hook now feeds is keyed on real UNIT identity,
     * one mounted section per unit (D2: "the stage owns all its Spaces"). Under
     * a mid-sequence promote failure (§9.3) a stage's Spaces can genuinely
     * differ from each other, and collapsing to one Space would silently drop
     * the others' units rather than show the disagreement.
     */
    const sources: RolloutChangeSource[] = [];
    for (const spaceId of selectedStage.spaceIds) {
      for (const [unitId, unit] of currentDataByUnitId) {
        if (unit.spaceId !== spaceId) continue;
        const writtenValue = writtenDataByUnitId.get(unitId);
        const written = writtenValue !== undefined;
        const afterData = writtenValue ?? dryRunDataByUnitId.get(unitId);
        // A written unit's "before" is its own pre-promotion revision (see
        // priorDataByUnitId above), never `unit.data` — that's the CURRENT,
        // already-promoted value, which is what afterData is too for any
        // unit nothing has touched since. Absent when no prior revision
        // could be resolved (e.g. this was the unit's very first revision);
        // `determinable` (rolloutChanges.ts) already reads a missing
        // beforeData as "cannot show this diff" rather than "no change".
        sources.push({
          unitId,
          slug: unit.slug,
          conflicts: dryRunConflictsByUnitId.get(unitId),
          beforeData: written ? priorDataByUnitId.get(unitId) : unit.data,
          afterData,
          written,
          /*
           * Undeterminable when the request failed outright, OR when this
           * specific unit came back named but empty. The second is the per-unit
           * case a scope-level flag structurally cannot express.
           */
          cannotDetermineAfter:
            !written
            && afterData === undefined
            && (dryRunFailed || answeredWithNoDataUnitIds.has(unitId)),
        });
      }
    }

    const result = new Map<string, RolloutChangeGroup[]>();
    result.set(selectedStage.id, buildRolloutChangeGroups(sources));
    return result;
  }, [
    skip,
    changeOrderId,
    selectedStage,
    currentDataByUnitId,
    writtenDataByUnitId,
    priorDataByUnitId,
    dryRunDataByUnitId,
    dryRunConflictsByUnitId,
    answeredWithNoDataUnitIds,
    writtenSpaceIds,
    revisionsLoading,
    carryingDataFetching,
    priorRevisionsLoading,
    priorDataPending,
    dryRunOutcomeByKey,
    pendingKey,
  ]);
}
