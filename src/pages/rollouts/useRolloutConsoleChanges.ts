// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the selected stage's promotion would write, as `MergedUnit[]` ready for
 * `ComponentValuesSection`.
 *
 * Assembles the shipped pipeline rather than reproducing any part of it:
 * `useRolloutChanges` for the before/after values, `useRolloutBaseline` for the
 * state the change starts from, and `buildRolloutMergedUnits` for the adapter
 * into the tree's own shape. Nothing here diffs anything itself.
 *
 * READS VALUES, NEVER COUNTS. `rolloutChanges.ts` is explicit that
 * `ResolvedSpaceIDs` is a claim about Link pointers and can legitimately
 * disagree with the bytes — a Space can count as resolved while its data still
 * shows the old values. Everything below reads real configuration data for that
 * reason, and `takenSpaceIds` is used only to choose WHICH source to read per
 * Space, never as an answer about what changed.
 *
 * ⚠️ `select` ON THE UNITS QUERY IS SAFE AND IS NOT THE `/change_order` RULE.
 * Configuration is no longer a selectable field — it comes from the data
 * endpoints, keyed by Revision id — so this asks for metadata plus those ids and
 * reads the data through `useUnitDataMap`. The no-`select` rule that governs
 * `/change_order` is about COMPUTED fields on that route specifically; it does
 * not generalise to `/unit`, and conflating the two would fetch tens of MB per
 * stage entry for no reason.
 */

import { useMemo } from 'react';

import { useUnitDataMap } from '@/hooks/useUnitData';
import { useListAllUnitsQuery } from '@confighub/rtk-query';

import { buildPaths, computeFieldDiffs } from '../x/apps/entryBuilders';
import { buildStageMatrix } from '../x/apps/rollout/rolloutMatrix';
import type { RolloutStageMatrix } from '../x/apps/rollout/rolloutMatrix';
import { buildRolloutMergedUnits } from '../x/apps/rollout/rolloutMergedUnits';
import { useRolloutBaseline } from '../x/apps/rollout/useRolloutBaseline';
import { useRolloutChanges } from '../x/apps/rollout/useRolloutChanges';
import { resourceIdentityJoinKeysOf, resourceIdentityKeyOf } from '../x/apps/rollout/rolloutChanges';
import type { RolloutChangeGroup, RolloutStage } from '../x/apps/rollout/rolloutTypes';
import type { MergedUnit } from '../x/apps/componentTypes';
import type { RolloutSpace } from './useRolloutDetail';

export interface RolloutConsoleChanges {
  units: MergedUnit[];
  groupsByUnitId: ReadonlyMap<string, RolloutChangeGroup>;
  writtenUnitIds: ReadonlySet<string>;
  /** Unit ids whose incoming change could not be established — render a note, never nothing. */
  undeterminedUnitIds: ReadonlySet<string>;
  spaceNameBySpaceId: ReadonlyMap<string, string>;
  /**
   * Unit id -> its slug, for anywhere a unit is named to a person.
   *
   * A unit id is an internal identity. Printing one is the same defect as
   * printing `SOURCE_STAGE_ID`: correct, unique, and meaningless to the reader.
   */
  slugByUnitId: ReadonlyMap<string, string>;
  /** Unit id -> the Space it lives in, for anywhere a unit needs a `/units/:spaceId/:id` link built. */
  spaceIdByUnitId: ReadonlyMap<string, string>;
  /**
   * The change AS AUTHORED, at the base — the subject of the page.
   *
   * ⚠️ NOT THE SAME QUESTION AS THE STAGE TREES BELOW IT, and the reference is
   * explicit that the pairing is the point: *"this is the value as authored,
   * that is the value as each target reported it… the reader compares two
   * trees, not a table against a list."* One states what the ChangeOrder
   * carries; the other states what promoting into a given stage would write.
   * They overlap in field names and answer different questions.
   *
   * Stage-invariant by construction, so it costs no extra request: the two
   * sides are the base before the change (`useRolloutBaseline`) and the base as
   * it stands now, both already fetched for the override machinery. Deriving it
   * from a second `useRolloutChanges` pinned to the source stage would re-run
   * the whole dry-run pipeline for an answer that cannot vary by stage.
   */
  sourceUnits: MergedUnit[];
  /**
   * `sourceUnits`' own diffs, keyed by unit id — same shape and same reason as
   * `groupsByUnitId` above, so the source tree and the stage trees can be fed
   * to `TreeDiffSection` the same way.
   */
  sourceGroupsByUnitId: ReadonlyMap<string, RolloutChangeGroup>;
  /**
   * Resources omitted from the source card for want of a recorded starting
   * point. Returned rather than logged: a console warning is invisible to the
   * person the omission is about, and the card is not the whole change when
   * this is non-zero.
   */
  sourceDropped: number;
  /**
   * Resource identities this ChangeOrder CREATES — present at the base with no
   * recorded starting point.
   *
   * Separate from `sourceGroupsByUnitId` because such a resource has no honest
   * diff to render (diffing against absence reports every path as new), so it is
   * deliberately absent from the source tree. It is still part of what the
   * change carries, and the outcome filter must hear about it: a variant that
   * does not hold a resource the change creates is the "Adds resources" case
   * this page exists to report, and a filter that never sees it reports that
   * variant as taking the change identically.
   */
  sourceCreatedResourceKeys: ReadonlySet<string>;
  /** The stage's variant matrix, or null when there is nothing to compare. */
  matrix: RolloutStageMatrix | null;
  isLoading: boolean;
}

export interface SourceUnitPartition<TUnit> {
  /** Units the change rewrites, in the order they arrived. Rendered first. */
  changedUnits: TUnit[];
  /** Units already holding the value, in the order they arrived. Rendered behind one disclosure. */
  /**
   * Resources the change does not touch.
   *
   * DELIBERATELY NOT RENDERED. The card reports what the promotion does, and a
   * resource it leaves alone is not that. Kept as the third bucket because the
   * classification is what makes `blockedUnits` meaningful: without it, "no
   * changed paths" would be one undifferentiated pile again.
   */
  unchangedUnits: TUnit[];
  /**
   * How that disclosure sits before the reader touches it.
   *
   * Open only when nothing changed anywhere: a closed group would then be the
   * entire content of the region, and a reader would be looking at what reads
   * as an empty screen. Otherwise closed — the changed units are the subject.
   *
   * An undeterminable resource keeps it closed, because such a resource is
   * rendered in the open: the region has visible content, and opening a group
   * that holds nothing but the genuinely quiet units would not add any.
   */
  /**
   * Resources the change tried to alter and could not. Shown as the exception
   * they are, never as another row in the list.
   */
  blockedUnits: TUnit[];
}

/**
 * "At the source" split into the units this change rewrites and the units it
 * leaves exactly as they are.
 *
 * ⚠️ AN EMPTY `fieldDiffs` IS NOT "SKIPPED", and the two must not be merged.
 * A unit reaching here is in scope — the caller filters the skipped ones out
 * first (`visibleSourceUnits` in `RolloutsPage`, which carries the full
 * reasoning) — so an empty diff means the resource already holds the value
 * the change carries. That is a real answer a reader may need to check, so it
 * stays reachable rather than being dropped; it just does not hold a full row
 * above the resources that actually move.
 *
 * ⚠️ AND AN EMPTY `fieldDiffs` IS NOT "UNCHANGED" ON ITS OWN EITHER.
 * `buildRolloutChangeGroups` empties `fieldDiffs` whenever a resource is not
 * `determinable` — there was no "before" to diff against, or the dry run never
 * landed — so emptiness covers two states that must never be told as one:
 * "already holds the value" and "we could not work out what this does to it".
 * Only the first belongs behind a disclosure labelled `Unchanged (N)`; folding
 * the second in there both miscounts N and hides the one resource on the card
 * a reader has to notice, which is precisely what `undeterminedUnitIds` and the
 * matrix's `unknown` state exist to prevent. `determinable` is read straight
 * off the group here — the same field `undeterminedUnitIds` is built from
 * (`rolloutMergedUnits.ts`) and the same signal `RolloutUnitHeader` gives
 * precedence over its `unchanged` badge — so the group label and the row badges
 * cannot disagree.
 *
 * A unit with no group at all is the caller's `?? []` fallback and still reads
 * as unchanged: `undeterminedUnitIds` only ever holds units a group declared
 * undeterminable, so such a unit wears no "could not be established" marker on
 * its row either, and the two must keep saying the same thing.
 *
 * Relative order inside each half is the caller's and is deliberately left
 * alone: the source list arrives in the order the change itself was assembled
 * in, and re-sorting either half would throw that away for nothing.
 */
export function partitionSourceUnitsByChange<TUnit extends { unitId: string }>(
  units: readonly TUnit[],
  groupsByUnitId: ReadonlyMap<
    string,
    Pick<RolloutChangeGroup, 'fieldDiffs' | 'determinable' | 'conflicts'>
  >,
): SourceUnitPartition<TUnit> {
  const changedUnits: TUnit[] = [];
  const blockedUnits: TUnit[] = [];
  const unchangedUnits: TUnit[] = [];
  for (const unit of units) {
    const group = groupsByUnitId.get(unit.unitId);
    const determinable = group?.determinable ?? true;
    if (!determinable || (group?.fieldDiffs.length ?? 0) > 0) {
      changedUnits.push(unit);
      continue;
    }
    /*
     * NO CHANGED PATHS HAS TWO CAUSES AND ONLY ONE IS UNREMARKABLE. A resource
     * the change does not touch and a resource the change tried to alter and was
     * refused both diff to nothing, so the refusal is read from the conflicts
     * the dry run reported rather than inferred from the empty diff — which
     * cannot distinguish them.
     */
    if ((group?.conflicts ?? []).some((conflict) => conflict.blocks)) {
      blockedUnits.push(unit);
    } else {
      unchangedUnits.push(unit);
    }
  }
  return { changedUnits, blockedUnits, unchangedUnits };
}

const EMPTY_UNITS: MergedUnit[] = [];
const EMPTY_SOURCE_GROUPS: ReadonlyMap<string, RolloutChangeGroup> = new Map();
const EMPTY_KEYS: ReadonlySet<string> = new Set();

export function useRolloutConsoleChanges(args: {
  changeOrderId: string | undefined;
  baseSpaceId: string | undefined;
  stages: RolloutStage[];
  selectedStageId: string | null;
  scopedSpaces: RolloutSpace[] | null;
  resolvedSpaceIds: ReadonlySet<string>;
  skip: boolean;
}): RolloutConsoleChanges {
  const { changeOrderId, baseSpaceId, stages, selectedStageId, scopedSpaces, resolvedSpaceIds, skip } =
    args;

  const spaceIds = useMemo(() => (scopedSpaces ?? []).map((s) => s.spaceId), [scopedSpaces]);

  const whereClause = useMemo(
    () => (spaceIds.length > 0 ? `SpaceID IN (${spaceIds.map((id) => `'${id}'`).join(',')})` : ''),
    [spaceIds],
  );

  const { currentData: allUnits } = useListAllUnitsQuery(
    {
      where: whereClause,
      select:
        'UnitID,Slug,SpaceID,TargetID,UpstreamUnitID,UpstreamRevisionNum,HeadRevisionNum,'
        + 'LastReleasedRevisionNum,ValidationErrors,ToolchainType,DataHash,DataSize,'
        + 'HeadRevision.RevisionID,HeadRevision.CreatedAt,HeadRevision.Description,'
        + 'LastReleasedRevision.RevisionID',
      include: 'SpaceID,TargetID,UpstreamUnitID,HeadRevisionNum,LastReleasedRevisionNum',
    },
    { skip: skip || whereClause === '' },
  );

  const units = useMemo(() => allUnits ?? [], [allUnits]);
  const { dataFor: unitDataFor } = useUnitDataMap(units.map((u) => u.Unit?.UnitID));

  const currentDataByUnitId = useMemo(() => {
    const index = new Map<string, { slug: string; spaceId: string; data?: string; toolchainType?: string }>();
    for (const unit of units) {
      const unitId = unit.Unit?.UnitID;
      const slug = unit.Unit?.Slug;
      const spaceId = unit.Unit?.SpaceID;
      if (unitId === undefined || slug === undefined || spaceId === undefined) continue;
      index.set(unitId, {
        slug,
        spaceId,
        data: unitDataFor(unitId),
        toolchainType: unit.Unit?.ToolchainType ?? undefined,
      });
    }
    return index;
  }, [units, unitDataFor]);

  const spaceNameBySpaceId = useMemo(() => {
    const index = new Map<string, string>();
    for (const space of scopedSpaces ?? []) {
      index.set(space.spaceId, space.displayName ?? space.slug);
    }
    return index;
  }, [scopedSpaces]);

  const slugByUnitId = useMemo(() => {
    const index = new Map<string, string>();
    for (const [unitId, ctx] of currentDataByUnitId) index.set(unitId, ctx.slug);
    return index;
  }, [currentDataByUnitId]);

  /*
   * Same reasoning as `slugByUnitId`: a unit id names nothing to a reader, but
   * a link needs both halves of `/units/:spaceId/:id`. Reused below for
   * `buildStageMatrix`'s own `spaceIdByUnitId` argument too — it used to
   * recompute an identical map locally under that same name, which shadowed
   * this one and read as a TDZ error the one time both were referenced in the
   * same scope. One map, one name only where a name is exposed publicly (the
   * `spaceIdByUnitId` return field, below).
   */
  const unitSpaceIdIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const [unitId, ctx] of currentDataByUnitId) index.set(unitId, ctx.spaceId);
    return index;
  }, [currentDataByUnitId]);

  const baseUnitSlugById = useMemo(() => {
    const index = new Map<string, string>();
    for (const [unitId, ctx] of currentDataByUnitId) {
      if (ctx.spaceId === baseSpaceId) index.set(unitId, ctx.slug);
    }
    return index;
  }, [currentDataByUnitId, baseSpaceId]);

  const groupsByStageId = useRolloutChanges({
    changeOrderId,
    stages,
    selectedStageId,
    takenSpaceIds: resolvedSpaceIds,
    currentDataByUnitId,
    skip: skip || currentDataByUnitId.size === 0,
  });

  const baseline = useRolloutBaseline({
    changeOrderId,
    baseSpaceId,
    baseUnitSlugById,
    skip: skip || baseUnitSlugById.size === 0,
  });

  const currentBySlug = useMemo(() => {
    const index = new Map<string, string>();
    for (const ctx of currentDataByUnitId.values()) {
      if (ctx.spaceId === baseSpaceId && ctx.data !== undefined) index.set(ctx.slug, ctx.data);
    }
    return index;
  }, [currentDataByUnitId, baseSpaceId]);

  const source = useMemo((): {
    units: MergedUnit[];
    dropped: number;
    createdResourceKeys: ReadonlySet<string>;
    groupsByUnitId: ReadonlyMap<string, RolloutChangeGroup>;
  } => {
    if (baseSpaceId === undefined || baseline.status !== 'resolved') {
      return { units: EMPTY_UNITS, dropped: 0, createdResourceKeys: EMPTY_KEYS, groupsByUnitId: EMPTY_SOURCE_GROUPS };
    }
    const sourceGroups: RolloutChangeGroup[] = [];
    const createdResourceKeys = new Set<string>();
    let droppedFromSource = 0;
    for (const [unitId, ctx] of currentDataByUnitId) {
      if (ctx.spaceId !== baseSpaceId) continue;
      const before = baseline.dataBySlug.get(ctx.slug);
      /*
       * No recorded starting point means no honest diff, so the resource is
       * dropped rather than shown with every path reading as new — which is
       * what diffing against absence reports.
       *
       * ⚠️ AND THE DROP IS COUNTED. I wrote this without a trace first, which
       * is the same defect one pair over from the one fixed in
       * `useRolloutChanges`: there, "no answer" became "no change"; here,
       * "unreadable" would become "not part of the change". Dropping is the
       * right call either way — a decision that leaves no record is what makes
       * it indistinguishable from never having faced it.
       */
      if (before === undefined || ctx.data === undefined) {
        droppedFromSource += 1;
        /*
         * ⚠️ `before` IS ABSENT FOR TWO REASONS AND THIS CANNOT TELL THEM APART.
         * The resource is genuinely new, OR the baseline simply has no entry for
         * that slug -- `useRolloutBaseline` resolves on `dataBySlug.size > 0`, so
         * a partially returned baseline resolves and every slug it missed looks
         * created here. A slug renamed at the base lands here too, where
         * "created" is arguably the right reading.
         *
         * The error runs in the safe direction: a resource wrongly called
         * created enters the carried set, and a variant lacking it reads `adds`
         * rather than a quiet `same`. It is still a claim the data does not
         * support, and closing it needs a signal the baseline does not currently
         * return -- whether a slug was asked for and had no revision, as against
         * never asked for.
         *
         * NO STARTING POINT MEANS THIS CHANGE CREATES THE RESOURCE, and that is
         * a fact worth keeping even though the diff is not. The tree cannot show
         * it -- there is nothing to diff against -- but the outcome filter asks
         * a different question, "does the change carry this", and for a created
         * resource the answer is unambiguously yes. Losing it here reported a
         * variant that does not hold the resource as taking the change
         * identically, which is precisely the case the card exists to raise.
         */
        if (before === undefined && ctx.data !== undefined) {
          for (const key of resourceIdentityJoinKeysOf(ctx.data)) createdResourceKeys.add(key);
        }
        continue;
      }
      sourceGroups.push({
        unitId,
        resourceName: ctx.slug,
        resourceKind: undefined,
        // The same identity the stage rows are keyed on, so "does the change
        // carry this resource" can be asked of a stage row at all. Without it
        // the authored change and the stage grid share no vocabulary.
        resourceIdentity: resourceIdentityKeyOf(before) ?? resourceIdentityKeyOf(ctx.data),
        /*
         * EVERY spelling, both sides. A stage row keys from the BEFORE side, so
         * matching the authored change on one side alone loses exactly the
         * changes that alter identity -- a rename, a namespace rewrite, a
         * document added to a bundle -- which is the class most worth reporting.
         * A row that needed the namespace tiebreak keys on that form instead.
         * The set is only ever tested for membership, so each extra spelling
         * costs one entry and removes a near-miss.
         */
        resourceIdentityJoinKeys: resourceIdentityJoinKeysOf(before, ctx.data),
        fieldDiffs: computeFieldDiffs(before, ctx.data),
        allPaths: buildPaths(ctx.data),
        written: true,
        determinable: true,
      });
    }
    const sourceGroupsByUnitId = new Map<string, RolloutChangeGroup>();
    for (const group of sourceGroups) sourceGroupsByUnitId.set(group.unitId, group);
    if (sourceGroups.length === 0) {
      return { units: EMPTY_UNITS, dropped: droppedFromSource, createdResourceKeys, groupsByUnitId: sourceGroupsByUnitId };
    }
    const built = buildRolloutMergedUnits({
      groups: sourceGroups,
      currentDataByUnitId,
      deploymentNameBySpaceId: spaceNameBySpaceId,
      beforeChangeBySlug: baseline.dataBySlug,
      currentBySlug,
      baselineStatus: baseline.status,
      takenSpaceIds: resolvedSpaceIds,
    });
    // Both drops count: the ones this loop made for want of a starting point,
    // and the ones the builder made for want of configuration context.
    return {
      units: built.units,
      dropped: droppedFromSource + built.droppedUnitIds.size,
      createdResourceKeys,
      groupsByUnitId: sourceGroupsByUnitId,
    };
  }, [baseSpaceId, baseline.status, baseline.dataBySlug, currentDataByUnitId, spaceNameBySpaceId, currentBySlug, resolvedSpaceIds]);

  return useMemo(() => {
    const groups = selectedStageId === null ? [] : (groupsByStageId.get(selectedStageId) ?? []);
    if (groups.length === 0) {
      return {
        units: EMPTY_UNITS,
        groupsByUnitId: new Map(),
        writtenUnitIds: new Set<string>(),
        undeterminedUnitIds: new Set<string>(),
        spaceNameBySpaceId,
        slugByUnitId,
        spaceIdByUnitId: unitSpaceIdIndex,
        sourceUnits: source.units,
        sourceGroupsByUnitId: source.groupsByUnitId,
        sourceDropped: source.dropped,
        sourceCreatedResourceKeys: source.createdResourceKeys,
        matrix: null,
        isLoading: !skip && currentDataByUnitId.size === 0,
      };
    }

    const built = buildRolloutMergedUnits({
      groups,
      currentDataByUnitId,
      deploymentNameBySpaceId: spaceNameBySpaceId,
      beforeChangeBySlug: baseline.dataBySlug,
      currentBySlug,
      baselineStatus: baseline.status,
      takenSpaceIds: resolvedSpaceIds,
    });

    const groupsByUnitId = new Map<string, RolloutChangeGroup>();
    for (const group of groups) groupsByUnitId.set(group.unitId, group);

    // Columns come from the STAGE's Spaces, not from which contributed — a Space
    // holding nothing yet renders a full column of `new`, which is true of it,
    // and a part-populated stage stays visible instead of being averaged away.
    const stageSpaceIds = stages.find((s) => s.id === selectedStageId)?.spaceIds ?? [];
    const matrix =
      stageSpaceIds.length === 0
        ? null
        : buildStageMatrix({
            groups,
            spaceIds: stageSpaceIds,
            spaceIdByUnitId: unitSpaceIdIndex,
            spaceNameBySpaceId,
            stageId: selectedStageId ?? '',
          });

    return {
      units: built.units,
      groupsByUnitId,
      writtenUnitIds: built.writtenUnitIds,
      undeterminedUnitIds: built.undeterminedUnitIds,
      spaceNameBySpaceId,
      slugByUnitId,
      spaceIdByUnitId: unitSpaceIdIndex,
      sourceUnits: source.units,
      sourceGroupsByUnitId: source.groupsByUnitId,
      sourceDropped: source.dropped,
      sourceCreatedResourceKeys: source.createdResourceKeys,
      matrix,
      isLoading: false,
    };
  }, [
    stages,
    groupsByStageId,
    selectedStageId,
    currentDataByUnitId,
    spaceNameBySpaceId,
    slugByUnitId,
    unitSpaceIdIndex,
    source,
    baseline.dataBySlug,
    baseline.status,
    currentBySlug,
    resolvedSpaceIds,
    skip,
  ]);
}
