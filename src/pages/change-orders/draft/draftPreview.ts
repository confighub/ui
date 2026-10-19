// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a draft ChangeOrder would write into each variant, before it exists: the bulk upgrade
 * dry run read into the detail view's own shapes, then classified by the detail view's own
 * pure functions, stage by stage.
 *
 * WHY THE UPGRADE DRY RUN AND NOT `/promote`. `/promote` cannot preview a ChangeOrder that does
 * not exist: without one it refuses a Component that requires a workflow, and has no end
 * boundary. `PATCH /unit?upgrade=true&dry_run=true&merge_end=…` is not gated by the policy and
 * takes the end. What it does not do is clone: a Unit a variant lacks is found here, from the
 * variants' Units, and reported as added (`DraftUnitRange.cloneSpaceIds`). The matrix holds no
 * row for a resource nobody in the stage has yet, so a variant the change adds a resource to is
 * raised to `adds` here wherever the matrix alone would call it `same`.
 *
 * TWO DRY RUNS, BECAUSE A REPLAYED ONE'S DIFF IS OF ITS LAST REVISION ONLY. An upgrade replays
 * the range a source Revision at a time, and its `ConfigData` is where the whole replay lands,
 * but its `Diff` runs from the last replayed Revision. A squashed dry run of the same range
 * diffs the whole of it. So the data is the replay's — what the promotion writes — and the diff
 * is the squash's, used only where the two land on the same configuration. Where they do not,
 * nobody has a diff of what the replay writes, and the Unit is undetermined.
 *
 * VALUES, NEVER COUNTS, AND NEVER A GUESS. Everything here reads configuration and server diffs;
 * a Unit nobody could get an answer for is `unknown`, never `same`, and nothing is built before
 * its dry run lands. A variant that takes the change from another Space than the base (its
 * Units' upstreams are not the base's) is `unknown` too: the base's dry run cannot speak for it.
 *
 * OUTLIERS ARE ABSOLUTE. The stage outcome says how a variant compares with the stage's
 * canonical variant, which can be a variant with its own override; a variant's chip says what
 * is true of it alone — a value a merge withholds, or a resource it does not have yet — read
 * from the dry run's conflicts and from which Units it holds.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type {
  ConfigDiff,
  MutationConflict,
  UnitCreateOrUpdateResponseRead,
} from '@confighub/rtk-query';

import {
  serverPathContainer,
  serverPathField,
} from '../../../components/config-diff/configDiffTree';
import {
  type ChangeOrderChangeSource,
  type PromotionPreview,
  buildChangeOrderChangeGroups,
  conflictBlocks,
  resourceConflictOf,
} from '../../x/apps/change-order/changeOrderChanges';
import {
  type ChangeOrderStageMatrix,
  buildStageMatrix,
} from '../../x/apps/change-order/changeOrderMatrix';
import type { ChangeOrderChangeGroup } from '../../x/apps/change-order/changeOrderTypes';
import {
  type ChangeOrderOutcome,
  type ChangeOrderOutcomeKind,
  buildChangeOrderOutcome,
} from '../changeOrderOutcome';
import type { DraftUnitRange } from './draftChangeCards';
import { draftCopy } from './draftCopy';

/** The diff of a Unit the change leaves as it is. */
const NO_CHANGE: ConfigDiff = { Resources: [] };

// ---------------------------------------------------------------------------
// The dry run, read
// ---------------------------------------------------------------------------

/** A value a variant keeps that the change would otherwise overwrite, as the dry run reported it. */
export interface DraftKeptValue {
  /** The variant's Unit. */
  unitId: string;
  /** The resource, without its namespace: `payments-config`. */
  resourceName: string | undefined;
  /** `v1/ConfigMap`. */
  resourceType: string | undefined;
  /** The path as the server names it: `spec.template.spec.containers.?name=api;@0.resources.limits.memory`. */
  path: string;
  /** Its last field: `memory`, `RETRY_LIMIT`. */
  field: string;
  /** The container the path runs through, if any: `api`. */
  container: string | undefined;
  /** What the variant keeps, as configuration writes it: `1Gi`, `"4"`. Absent when the server sent none. */
  value: string | undefined;
  /** What the base would write there. */
  incoming: string | undefined;
  /** The server's reason, verbatim: `ProtectedPath`, `Subtracted`, … */
  reason: string;
}

/** `readPromotionPreview`'s shape, plus the conflicts as the server sent them, for the chips. */
export interface DraftUpgradePreview extends PromotionPreview {
  keptByUnitId: Map<string, DraftKeptValue[]>;
  /** Units the dry runs named at all. A Unit asked about and absent from both is undetermined. */
  answeredUnitIds: Set<string>;
}

/** A conflict's value as configuration writes it, without the document's trailing newline. */
const scalarOf = (value: string | undefined) =>
  value === undefined ? undefined : value.replace(/\n+$/, '');

/** The last field of a server path, past any merge-keyed element. */
export function lastFieldOf(path: string): string {
  return serverPathField(path);
}

/** A value the variant keeps, as the outlier chip and its popover state it. */
function draftKeptValueOf(unitId: string, conflict: MutationConflict): DraftKeptValue {
  const path = conflict.Path ?? '';
  return {
    unitId,
    resourceName:
      conflict.Resource?.ResourceNameWithoutScope ||
      conflict.Resource?.ResourceName ||
      undefined,
    resourceType: conflict.Resource?.ResourceType,
    path,
    field: lastFieldOf(path),
    container: serverPathContainer(path),
    value: scalarOf(conflict.Target?.Value),
    incoming: scalarOf(conflict.Source?.Value),
    reason: conflict.Reason ?? '',
  };
}

/**
 * The two upgrade dry runs (replayed, and squashed) read into `PromotionPreview`, the shape the
 * detail view's stage tree reads, keyed by the variants' Unit ids. See the file header for why
 * there are two.
 */
export function readUpgradePreview(
  replayed: readonly UnitCreateOrUpdateResponseRead[] | undefined,
  squashed: readonly UnitCreateOrUpdateResponseRead[] | undefined,
): DraftUpgradePreview {
  const preview: DraftUpgradePreview = {
    dataByUnitId: new Map(),
    diffByUnitId: new Map(),
    conflictsByUnitId: new Map(),
    unchangedUnitIds: new Set(),
    undeterminedUnitIds: new Set(),
    undeterminedSpaceIds: new Set(),
    keptByUnitId: new Map(),
    answeredUnitIds: new Set(),
  };
  const squashedByUnitId = new Map<string, UnitCreateOrUpdateResponseRead>();
  for (const item of squashed ?? []) {
    const unitId = item.Unit?.UnitID;
    if (unitId !== undefined) squashedByUnitId.set(unitId, item);
  }
  for (const item of replayed ?? []) {
    const unitId = item.Unit?.UnitID;
    if (unitId === undefined) continue;
    preview.answeredUnitIds.add(unitId);
    const conflicts = item.Conflicts ?? [];
    if (conflicts.length > 0)
      preview.conflictsByUnitId.set(unitId, conflicts.map(resourceConflictOf));
    const kept = conflicts
      .filter((conflict) => conflictBlocks(conflict.Reason))
      .map((c) => draftKeptValueOf(unitId, c));
    if (kept.length > 0) preview.keptByUnitId.set(unitId, kept);
    if (item.Error !== undefined || item.ConfigData === undefined || item.ConfigData === '') {
      preview.undeterminedUnitIds.add(unitId);
      continue;
    }
    const twin = squashedByUnitId.get(unitId);
    if (
      twin === undefined ||
      twin.Error !== undefined ||
      twin.Diff === undefined ||
      twin.ConfigData !== item.ConfigData
    ) {
      preview.undeterminedUnitIds.add(unitId);
      continue;
    }
    preview.dataByUnitId.set(unitId, item.ConfigData);
    preview.diffByUnitId.set(unitId, twin.Diff);
  }
  return preview;
}

// ---------------------------------------------------------------------------
// Per stage
// ---------------------------------------------------------------------------

/** A variant's Unit, as the preview reads it. */
export interface DraftPreviewUnit {
  unitId: string;
  slug: string;
  spaceId: string;
  /** The base Unit it upgrades from; absent for a Unit the variant made for itself. */
  upstreamUnitId: string | undefined;
  /** Its configuration now. `undefined` or `''` while it has not been read. */
  data: string | undefined;
}

/** One stage of the path, as the draft previews it. */
export interface DraftStageInput {
  stageId: string;
  /** In-scope members, in any order: `buildDraftStagePreview` orders them. */
  spaceIds: readonly string[];
}

/** What one stage's promotion would write, in the detail view's terms. */
export interface DraftStagePreview {
  stageId: string;
  /** The members in the order the matrix reads them: the canonical variant first. */
  spaceIds: string[];
  groups: ChangeOrderChangeGroup[];
  matrix: ChangeOrderStageMatrix | null;
  outcome: ChangeOrderOutcome;
}

/** The facts a variant's outlier chip states. */
export type DraftOutlierFact =
  | { kind: 'adds'; baseUnitId: string; slug: string }
  | ({ kind: 'kept' } & DraftKeptValue);

export interface DraftOutlier {
  spaceId: string;
  name: string;
  facts: DraftOutlierFact[];
  /** `memory stays 1Gi`; `adds payments-worker · keeps RETRY_LIMIT "4"`. */
  text: string;
}

/** The sources one variant contributes, from the preview where its Units are previewed. */
function sourcesOf(
  units: readonly DraftPreviewUnit[],
  rangeByBaseUnitId: ReadonlyMap<string, DraftUnitRange>,
  preview: DraftUpgradePreview,
  foreignSpaceIds: ReadonlySet<string>,
): ChangeOrderChangeSource[] {
  return units.map((unit): ChangeOrderChangeSource => {
    const range =
      unit.upstreamUnitId === undefined
        ? undefined
        : rangeByBaseUnitId.get(unit.upstreamUnitId);
    const conflicts = preview.conflictsByUnitId.get(unit.unitId);
    const unchanged = (): ChangeOrderChangeSource => ({
      unitId: unit.unitId,
      slug: unit.slug,
      beforeData: unit.data,
      afterData: unit.data,
      diff: NO_CHANGE,
      written: false,
      cannotDetermineAfter: false,
      conflicts,
    });
    const undetermined = (): ChangeOrderChangeSource => ({
      unitId: unit.unitId,
      slug: unit.slug,
      beforeData: unit.data,
      afterData: undefined,
      diff: undefined,
      written: false,
      cannotDetermineAfter: true,
      conflicts,
    });
    if (foreignSpaceIds.has(unit.spaceId)) return undetermined();
    // A Unit the variant made for itself has no upstream for the change to come from.
    if (unit.upstreamUnitId === undefined) return unchanged();
    // Its upstream is not in the base: it takes from a Space that has not taken the change yet.
    if (range === undefined) return undetermined();
    if (range.carry === 'unknown' || range.carry === 'disagrees') return undetermined();
    // Every other carry is a Unit the change positively does not write.
    if (range.carry !== 'carries') return unchanged();
    const data = preview.dataByUnitId.get(unit.unitId);
    const diff = preview.diffByUnitId.get(unit.unitId);
    if (data === undefined || diff === undefined) return undetermined();
    return {
      unitId: unit.unitId,
      slug: unit.slug,
      beforeData: unit.data,
      afterData: data,
      diff,
      written: false,
      cannotDetermineAfter: false,
      conflicts,
    };
  });
}

/**
 * The stage's members in the order the matrix reads them: variants with no outlier fact
 * first, then the outliers, then those nobody could read, each part in the order given.
 *
 * The matrix measures every variant against the first one that contributed, and an outcome of
 * "same" is "same as that one". With a variant that keeps an override first, the variants that
 * take the change as the base wrote it would read as differing from it. Ordering the input is
 * the whole fix: the classifier is not changed.
 */
export function orderStageMembers(
  spaceIds: readonly string[],
  outlierSpaceIds: ReadonlySet<string>,
  undeterminedSpaceIds: ReadonlySet<string>,
): string[] {
  const rank = (spaceId: string) =>
    undeterminedSpaceIds.has(spaceId) ? 2 : outlierSpaceIds.has(spaceId) ? 1 : 0;
  return spaceIds
    .map((spaceId, index) => ({ spaceId, index }))
    .sort((a, b) => rank(a.spaceId) - rank(b.spaceId) || a.index - b.index)
    .map((entry) => entry.spaceId);
}

/** Each in-scope variant's facts: the resources the change adds to it, then the values it keeps. */
export function extractOutliers(input: {
  inScopeSpaceIds: readonly string[];
  nameBySpaceId: ReadonlyMap<string, string>;
  ranges: readonly DraftUnitRange[];
  units: readonly DraftPreviewUnit[];
  preview: DraftUpgradePreview;
  /** Variants nobody here can speak for (`foreignUpstreamSpaceIds`): they get no facts. */
  foreignSpaceIds?: ReadonlySet<string>;
}): DraftOutlier[] {
  const {
    inScopeSpaceIds,
    nameBySpaceId,
    ranges,
    units,
    preview,
    foreignSpaceIds = new Set(),
  } = input;
  const factsBySpace = new Map<string, DraftOutlierFact[]>(
    inScopeSpaceIds
      .filter((spaceId) => !foreignSpaceIds.has(spaceId))
      .map((spaceId) => [spaceId, []]),
  );
  for (const range of ranges) {
    if (range.carry !== 'carries') continue;
    for (const spaceId of range.cloneSpaceIds) {
      factsBySpace
        .get(spaceId)
        ?.push({ kind: 'adds', baseUnitId: range.unitId, slug: range.slug });
    }
  }
  const carriedBaseUnitIds = new Set(
    ranges.filter((range) => range.carry === 'carries').map((range) => range.unitId),
  );
  // Kept values are listed in the base's order, the order the change itself lists its Units in.
  const baseOrder = new Map(ranges.map((range, index) => [range.unitId, index]));
  const rank = (unit: DraftPreviewUnit) =>
    baseOrder.get(unit.upstreamUnitId ?? '') ?? ranges.length;
  const byBaseOrder = [...units].sort((a, b) => rank(a) - rank(b));
  for (const unit of byBaseOrder) {
    // A value is kept from a change only where the change reaches the Unit.
    if (unit.upstreamUnitId === undefined || !carriedBaseUnitIds.has(unit.upstreamUnitId))
      continue;
    const facts = factsBySpace.get(unit.spaceId);
    if (facts === undefined) continue;
    for (const kept of preview.keptByUnitId.get(unit.unitId) ?? []) {
      const known = facts.some(
        (fact) =>
          fact.kind === 'kept' && fact.unitId === kept.unitId && fact.path === kept.path,
      );
      if (!known) facts.push({ kind: 'kept', ...kept });
    }
  }
  const outliers: DraftOutlier[] = [];
  for (const spaceId of inScopeSpaceIds) {
    const facts = factsBySpace.get(spaceId) ?? [];
    if (facts.length === 0) continue;
    outliers.push({
      spaceId,
      name: nameBySpaceId.get(spaceId) ?? '',
      facts,
      text: outlierText(facts),
    });
  }
  return outliers;
}

/**
 * A chip's words. One kept value reads as a fact about the field (`memory stays 1Gi`); several
 * facts read as what the variant does (`adds payments-worker · keeps RETRY_LIMIT "4"`).
 */
export function outlierText(facts: readonly DraftOutlierFact[]): string {
  const only = facts.length === 1 ? facts[0] : undefined;
  // Without the value the server kept, the fact is that the field is kept, and nothing more.
  if (only?.kind === 'kept' && only.value !== undefined)
    return draftCopy.outlier.stays(only.field, only.value);
  return facts
    .map((fact) =>
      fact.kind === 'adds'
        ? draftCopy.outlier.adds(fact.slug)
        : draftCopy.outlier.keeps(fact.field, fact.value),
    )
    .join(draftCopy.outlier.separator);
}

/**
 * The outcome with every variant the change adds a resource to raised from `same` to `adds`.
 *
 * The matrix compares the variants' resources, so a resource none of a stage's members holds
 * has no row, and a stage of one variant compares it with nothing: either way a variant about
 * to be given a resource reads `same`. Only `same` is raised; `differs` and `unknown` say worse
 * and stand. The groups stay in the classifier's order, with the same representative rule.
 */
export function raiseAddedVariants(
  outcome: ChangeOrderOutcome,
  canonicalSpaceId: string | null,
  addedSpaceIds: ReadonlySet<string>,
): ChangeOrderOutcome {
  const same = outcome.groups.find((group) => group.kind === 'same');
  const raised = same?.spaceIds.filter((spaceId) => addedSpaceIds.has(spaceId)) ?? [];
  if (same === undefined || raised.length === 0) return outcome;
  const labelOf = new Map(
    same.spaceIds.map((spaceId, index) => [spaceId, same.labels[index]]),
  );
  const adds = outcome.groups.find((group) => group.kind === 'adds');
  const addsIds = [...(adds?.spaceIds ?? []), ...raised];
  const addsLabels = [
    ...(adds?.labels ?? []),
    ...raised.map((spaceId) => labelOf.get(spaceId) ?? ''),
  ];
  const sameIds = same.spaceIds.filter((spaceId) => !addedSpaceIds.has(spaceId));
  const representative = (ids: string[]) =>
    canonicalSpaceId !== null && ids.includes(canonicalSpaceId) ? canonicalSpaceId : ids[0];
  const order: ChangeOrderOutcomeKind[] = ['differs', 'adds', 'unknown', 'same'];
  const byKind = new Map(outcome.groups.map((group) => [group.kind, group]));
  byKind.set('adds', {
    kind: 'adds',
    spaceIds: addsIds,
    labels: addsLabels,
    representativeSpaceId: representative(addsIds),
  });
  if (sameIds.length === 0) byKind.delete('same');
  else {
    byKind.set('same', {
      kind: 'same',
      spaceIds: sameIds,
      labels: sameIds.map((spaceId) => labelOf.get(spaceId) ?? ''),
      representativeSpaceId: representative(sameIds),
    });
  }
  return {
    ...outcome,
    groups: order.flatMap((kind) => {
      const group = byKind.get(kind);
      return group === undefined ? [] : [group];
    }),
  };
}

/**
 * One stage: its members ordered (`orderStageMembers`), each member's Units' sources built from
 * the preview, then the detail view's `buildChangeOrderChangeGroups` → `buildStageMatrix` →
 * `buildChangeOrderOutcome`, unchanged.
 */
export function buildDraftStagePreview(input: {
  stage: DraftStageInput;
  units: readonly DraftPreviewUnit[];
  rangeByBaseUnitId: ReadonlyMap<string, DraftUnitRange>;
  preview: DraftUpgradePreview;
  nameBySpaceId: ReadonlyMap<string, string>;
  outlierSpaceIds: ReadonlySet<string>;
  undeterminedSpaceIds: ReadonlySet<string>;
  /** Variants the change clones a carried resource into. */
  addedSpaceIds: ReadonlySet<string>;
  /** Variants that take the change from elsewhere: every one of their Units is undetermined. */
  foreignSpaceIds: ReadonlySet<string>;
  /** `carriedResourceKeysOf` of the change at the source; `null` when it could not be read. */
  carriedResourceKeys: ReadonlySet<string> | null;
}): DraftStagePreview {
  const { stage, units, rangeByBaseUnitId, preview, nameBySpaceId, carriedResourceKeys } =
    input;
  const spaceIds = orderStageMembers(
    stage.spaceIds,
    input.outlierSpaceIds,
    input.undeterminedSpaceIds,
  );
  const members = new Set(spaceIds);
  const stageUnits = units.filter((unit) => members.has(unit.spaceId));
  const sources = sourcesOf(stageUnits, rangeByBaseUnitId, preview, input.foreignSpaceIds);
  const groups = buildChangeOrderChangeGroups(sources);
  const spaceIdByUnitId = new Map(stageUnits.map((unit) => [unit.unitId, unit.spaceId]));
  const matrix =
    spaceIds.length === 0
      ? null
      : buildStageMatrix({
          groups,
          spaceIds,
          spaceIdByUnitId,
          spaceNameBySpaceId: nameBySpaceId,
          stageId: stage.stageId,
        });
  const outcome = raiseAddedVariants(
    buildChangeOrderOutcome(matrix, carriedResourceKeys),
    matrix?.canonicalSpaceId ?? null,
    input.addedSpaceIds,
  );
  return { stageId: stage.stageId, spaceIds, groups, matrix, outcome };
}

/**
 * The variants whose change nobody could read: a Unit the dry run answered with nothing, or did
 * not answer for, or whose upstream is not in the base.
 */
export function undeterminedSpaceIdsOf(input: {
  units: readonly DraftPreviewUnit[];
  rangeByBaseUnitId: ReadonlyMap<string, DraftUnitRange>;
  preview: DraftUpgradePreview;
  foreignSpaceIds?: ReadonlySet<string>;
}): Set<string> {
  const { units, rangeByBaseUnitId, preview, foreignSpaceIds = new Set() } = input;
  const spaces = new Set<string>(foreignSpaceIds);
  for (const unit of units) {
    if (unit.upstreamUnitId === undefined) continue;
    const range = rangeByBaseUnitId.get(unit.upstreamUnitId);
    if (range === undefined || range.carry === 'disagrees' || range.carry === 'unknown') {
      spaces.add(unit.spaceId);
      continue;
    }
    if (range.carry !== 'carries') continue;
    if (!preview.dataByUnitId.has(unit.unitId) || !preview.diffByUnitId.has(unit.unitId))
      spaces.add(unit.spaceId);
  }
  return spaces;
}

/**
 * The in-scope variants no stage of the path selects, in scope order: a promotion along it never
 * reaches them.
 */
export function outsideEveryStage(
  stages: readonly { spaceIds: readonly string[] }[],
  inScopeSpaceIds: readonly string[],
): string[] {
  const staged = new Set(stages.flatMap((stage) => stage.spaceIds));
  return inScopeSpaceIds.filter((spaceId) => !staged.has(spaceId));
}

/** "N of M same", and the rest of the partition, over every stage. */
export interface DraftPreviewTotals {
  /** In-scope variants on some stage of the path. The denominator. */
  variants: number;
  same: number;
  differs: number;
  adds: number;
  unknown: number;
  /** In scope and in no stage: nothing previews them, so they are counted in no outcome. */
  unstagedSpaceIds: string[];
}

/** A variant counts once, in the first stage that holds it, as a promotion reaches it once. */
export function totalsOf(
  stages: readonly DraftStagePreview[],
  inScopeSpaceIds: readonly string[],
): DraftPreviewTotals {
  const kindBySpace = new Map<string, ChangeOrderOutcomeKind>();
  for (const stage of stages) {
    for (const group of stage.outcome.groups) {
      for (const spaceId of group.spaceIds)
        if (!kindBySpace.has(spaceId)) kindBySpace.set(spaceId, group.kind);
    }
  }
  const totals: DraftPreviewTotals = {
    variants: 0,
    same: 0,
    differs: 0,
    adds: 0,
    unknown: 0,
    unstagedSpaceIds: [],
  };
  // A variant no stage selects is never promoted to: it is no part of "N of M".
  for (const spaceId of inScopeSpaceIds) {
    const kind = kindBySpace.get(spaceId);
    if (kind === undefined) {
      totals.unstagedSpaceIds.push(spaceId);
      continue;
    }
    totals.variants += 1;
    totals[kind] += 1;
  }
  return totals;
}

/** The preview's verdict over the whole scope: every stage, every outlier, and the count. */
export interface DraftPreviewAssembly {
  stages: DraftStagePreview[];
  outliers: DraftOutlier[];
  undeterminedSpaceIds: string[];
  /**
   * "N of M same". `undefined` when the change carries nothing: every variant would read `same`
   * of a change that is not there, so there is no count to state (`nothingToCarry`). `undefined`
   * too when no variant in scope is on the path: there is nobody to count.
   */
  totals: DraftPreviewTotals | undefined;
  /** No base Unit carries anything under the end: the draft has nothing waiting to promote. */
  nothingToCarry: boolean;
  /** In scope and on no stage of the path, in scope order: no outcome, no outlier, no count. */
  outsideStageSpaceIds: string[];
}

/**
 * Everything the preview says, from the reads it needs: the two dry runs, each in-scope variant's
 * Units with their data, each base Unit's range, and the stages in path order (one stage of the
 * whole scope without a workflow).
 */
export function assembleDraftPreview(input: {
  stages: readonly DraftStageInput[];
  inScopeSpaceIds: readonly string[];
  nameBySpaceId: ReadonlyMap<string, string>;
  units: readonly DraftPreviewUnit[];
  ranges: readonly DraftUnitRange[];
  replayed: readonly UnitCreateOrUpdateResponseRead[] | undefined;
  squashed: readonly UnitCreateOrUpdateResponseRead[] | undefined;
  carriedResourceKeys: ReadonlySet<string> | null;
  /** `foreignUpstreamSpaceIds` of the scope. */
  foreignSpaceIds?: ReadonlySet<string>;
}): DraftPreviewAssembly {
  const { stages, inScopeSpaceIds, nameBySpaceId, units, ranges, carriedResourceKeys } = input;
  const foreignSpaceIds = input.foreignSpaceIds ?? new Set<string>();
  const preview = readUpgradePreview(input.replayed, input.squashed);
  const rangeByBaseUnitId = new Map(ranges.map((range) => [range.unitId, range]));
  const outsideStageSpaceIds = outsideEveryStage(stages, inScopeSpaceIds);
  const outside = new Set(outsideStageSpaceIds);
  const pathSpaceIds = inScopeSpaceIds.filter((spaceId) => !outside.has(spaceId));
  const outliers = extractOutliers({
    inScopeSpaceIds: pathSpaceIds,
    nameBySpaceId,
    ranges,
    units,
    preview,
    foreignSpaceIds,
  });
  const outlierSpaceIds = new Set(outliers.map((outlier) => outlier.spaceId));
  const addedSpaceIds = new Set(
    outliers
      .filter((outlier) => outlier.facts.some((fact) => fact.kind === 'adds'))
      .map((o) => o.spaceId),
  );
  const undetermined = undeterminedSpaceIdsOf({
    units,
    rangeByBaseUnitId,
    preview,
    foreignSpaceIds,
  });
  // Members in the scope's own order (stage, region, slug), so the canonical variant is chosen
  // the same way every time.
  const scopeOrder = new Map(inScopeSpaceIds.map((spaceId, index) => [spaceId, index]));
  const rank = (spaceId: string) => scopeOrder.get(spaceId) ?? inScopeSpaceIds.length;
  const stagePreviews = stages.map((stage) =>
    buildDraftStagePreview({
      stage: { ...stage, spaceIds: [...stage.spaceIds].sort((a, b) => rank(a) - rank(b)) },
      units,
      rangeByBaseUnitId,
      preview,
      nameBySpaceId,
      outlierSpaceIds,
      undeterminedSpaceIds: undetermined,
      addedSpaceIds,
      foreignSpaceIds,
      carriedResourceKeys,
    }),
  );
  const nothingToCarry = ranges.every(
    (range) => range.carry !== 'carries' && range.carry !== 'unknown',
  );
  return {
    stages: stagePreviews,
    outliers,
    undeterminedSpaceIds: pathSpaceIds.filter((spaceId) => undetermined.has(spaceId)),
    totals:
      nothingToCarry || pathSpaceIds.length === 0
        ? undefined
        : totalsOf(stagePreviews, inScopeSpaceIds),
    nothingToCarry,
    outsideStageSpaceIds,
  };
}
