// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What an Invoke draft would write into each variant, before it exists: the function dry run of
 * the very call the ChangeOrder will run, read into the detail view's shapes and classified by
 * the detail view's own functions, stage by stage (`buildChangeOrderChangeGroups` →
 * `buildStageMatrix` → `buildChangeOrderOutcome`), so the words are the ones the ChangeOrder's
 * page will use once it exists.
 *
 * A Unit the selection does not reach is one the ChangeOrder marks and leaves as it is: unchanged,
 * as the detail view reads a Mark. A Unit the run answered with an error is undetermined, never
 * unchanged.
 *
 * OUTLIERS ARE ABSOLUTE, as for Base changes: a variant's chip says what is true of it alone — a
 * value a merge withholds, or that the function finds nothing to change there — never how it
 * compares with the stage's canonical variant.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type { ConfigDiff, FunctionInvocationsResponse, UnitDiff } from '@confighub/rtk-query';

import {
  type ChangeOrderChangeSource,
  buildChangeOrderChangeGroups,
  changeEntriesOf,
  conflictBlocks,
  resourceConflictOf,
} from '../../x/apps/change-order/changeOrderChanges';
import { buildStageMatrix } from '../../x/apps/change-order/changeOrderMatrix';
import type { ChangeOrderChangeGroup } from '../../x/apps/change-order/changeOrderTypes';
import { type ChangeOrderOutcome, buildChangeOrderOutcome, carriedResourceKeysOf } from '../changeOrderOutcome';
import { draftCopy } from './draftCopy';
import {
  type DraftOutlier,
  type DraftOutlierFact,
  type DraftPreviewTotals,
  type DraftPreviewUnit,
  type DraftStageInput,
  type DraftStagePreview,
  draftKeptValueOf,
  orderStageMembers,
  outsideEveryStage,
  totalsOf,
} from './draftPreview';

const NO_CHANGE: ConfigDiff = { Resources: [] };

/** The id of the one comparison "At the source" is read from: every variant in scope. Never shown. */
const SOURCE_COMPARISON_ID = '__draft_invoke_source__';

/** One "At the source" diff: the variants that make the same change, and that change. */
export interface DraftInvokeSourceGroup {
  /** The variants it stands for, by display name: "In dev, staging-eu, …". */
  names: string[];
  spaceIds: string[];
  representativeSpaceId: string;
  /** The representative's resources the call changes (or is refused in). */
  groups: ChangeOrderChangeGroup[];
}

export interface DraftInvokeAssembly {
  stages: DraftStagePreview[];
  outliers: DraftOutlier[];
  undeterminedSpaceIds: string[];
  /** `undefined` when nothing changes anywhere: there is no count of a change that is not there. */
  totals: DraftPreviewTotals | undefined;
  /** The call changes nothing in any variant in scope. */
  nothingChanges: boolean;
  /** The run could not say what the call does in any variant on the path. */
  noneEstablished: boolean;
  outsideStageSpaceIds: string[];
  /** "At the source": the variants grouped by the change they take. */
  sourceGroups: DraftInvokeSourceGroup[];
  /** The representatives' diffs, for the image hero and its counts. */
  sourceDiffs: UnitDiff[];
  /** Every Unit's diff the run returned, by variant: what "In N variants" counts. */
  diffsBySpaceId: ReadonlyMap<string, UnitDiff[]>;
}

/**
 * An Invoke outcome with no "Adds resources": an Invoke promotion runs its Invocation on the
 * resources a variant has and clones nothing, so a variant without one of its peers' resources
 * takes a different change, never an added resource. Its variants join "Differs", in order.
 */
export function withoutAdds(outcome: ChangeOrderOutcome): ChangeOrderOutcome {
  const adds = outcome.groups.find((group) => group.kind === 'adds');
  if (adds === undefined) return outcome;
  const differs = outcome.groups.find((group) => group.kind === 'differs');
  const merged = {
    kind: 'differs' as const,
    spaceIds: [...(differs?.spaceIds ?? []), ...adds.spaceIds],
    labels: [...(differs?.labels ?? []), ...adds.labels],
    representativeSpaceId: differs?.representativeSpaceId ?? adds.representativeSpaceId,
  };
  const groups = outcome.groups.filter((group) => group.kind !== 'adds' && group.kind !== 'differs');
  return { ...outcome, groups: [merged, ...groups] };
}

/**
 * An outcome with the variants the call finds nothing to change in as a group of their own:
 * "Nothing to change here", never a "Differs" of no fields. Only what the dry run said moves.
 */
export function withNothingHere(outcome: ChangeOrderOutcome, nothingSpaceIds: ReadonlySet<string>): ChangeOrderOutcome {
  if (nothingSpaceIds.size === 0) return outcome;
  const moved: { spaceId: string; label: string }[] = [];
  const groups = outcome.groups.flatMap((group) => {
    const keep = group.spaceIds.map((spaceId, index) => ({ spaceId, label: group.labels[index] ?? '' }));
    const staying = keep.filter((member) => !nothingSpaceIds.has(member.spaceId));
    moved.push(...keep.filter((member) => nothingSpaceIds.has(member.spaceId)));
    if (staying.length === 0) return [];
    if (staying.length === keep.length) return [group];
    const ids = staying.map((member) => member.spaceId);
    return [{ ...group, spaceIds: ids, labels: staying.map((member) => member.label), representativeSpaceId: ids.includes(group.representativeSpaceId) ? group.representativeSpaceId : ids[0] }];
  });
  if (moved.length === 0) return outcome;
  const nothing = { kind: 'nothing' as const, spaceIds: moved.map((member) => member.spaceId), labels: moved.map((member) => member.label), representativeSpaceId: moved[0].spaceId };
  // Worst first, as a stage reads: whatever differs or is unknown, then nothing to change, then same.
  const same = groups.filter((group) => group.kind === 'same');
  return { ...outcome, groups: [...groups.filter((group) => group.kind !== 'same'), nothing, ...same] };
}

/** A dry-run answer with no error. */
const answered = (result: FunctionInvocationsResponse) => (result.Error === undefined || result.Error === null) && result.Success !== false;

/**
 * An answer that the function ran and wrote nothing: the server sends no configuration back
 * for a Unit it would leave as it is (`HasNewMutations` false), which is unchanged, not unknown.
 */
const wroteNothing = (result: FunctionInvocationsResponse) =>
  answered(result) && (result.ConfigData === undefined || result.ConfigData === '') && result.HasNewMutations === false;

/** Whether a dry-run answer changes anything. */
const changes = (result: FunctionInvocationsResponse) => result.Diff !== undefined && changeEntriesOf(result.Diff).length > 0;

/** Each in-scope Unit's source for the classifier, from the run's answer for it. */
export function invokeSourcesOf(
  units: readonly DraftPreviewUnit[],
  resultByUnitId: ReadonlyMap<string, FunctionInvocationsResponse>,
): ChangeOrderChangeSource[] {
  return units.map((unit): ChangeOrderChangeSource => {
    const result = resultByUnitId.get(unit.unitId);
    const conflicts = result?.Conflicts?.map(resourceConflictOf);
    const base = { unitId: unit.unitId, slug: unit.slug, beforeData: unit.data, written: false, conflicts };
    // Not selected: the ChangeOrder marks it and leaves it as it is.
    if (result === undefined) return { ...base, afterData: unit.data, diff: NO_CHANGE, cannotDetermineAfter: false };
    if (!answered(result)) return { ...base, afterData: undefined, diff: undefined, cannotDetermineAfter: true };
    if (wroteNothing(result)) return { ...base, afterData: unit.data, diff: NO_CHANGE, cannotDetermineAfter: false };
    if (result.ConfigData === undefined || result.ConfigData === '' || result.Diff === undefined)
      return { ...base, afterData: undefined, diff: undefined, cannotDetermineAfter: true };
    return { ...base, afterData: result.ConfigData, diff: result.Diff, cannotDetermineAfter: false };
  });
}

/**
 * Everything the preview says, from the run's answers: each in-scope variant's Units with their
 * data, and the stages in path order (one stage of the whole scope without a workflow).
 */
export function assembleInvokePreview(input: {
  stages: readonly DraftStageInput[];
  inScopeSpaceIds: readonly string[];
  nameBySpaceId: ReadonlyMap<string, string>;
  units: readonly DraftPreviewUnit[];
  results: readonly FunctionInvocationsResponse[];
}): DraftInvokeAssembly {
  const { stages, inScopeSpaceIds, nameBySpaceId, units, results } = input;
  const resultByUnitId = new Map(results.flatMap((result) => (result.UnitID === undefined ? [] : [[result.UnitID, result] as const])));
  const outsideStageSpaceIds = outsideEveryStage(stages, inScopeSpaceIds);
  const outside = new Set(outsideStageSpaceIds);
  const pathSpaceIds = inScopeSpaceIds.filter((spaceId) => !outside.has(spaceId));
  const unitsOf = (spaceId: string) => units.filter((unit) => unit.spaceId === spaceId);

  // Per variant: undetermined, changed, or the call finds nothing there.
  const undetermined = new Set<string>();
  const changed = new Set<string>();
  for (const spaceId of pathSpaceIds) {
    for (const unit of unitsOf(spaceId)) {
      const result = resultByUnitId.get(unit.unitId);
      if (result === undefined) continue;
      if (wroteNothing(result)) continue;
      if (!answered(result) || result.ConfigData === undefined || result.ConfigData === '') undetermined.add(spaceId);
      else if (changes(result)) changed.add(spaceId);
    }
  }
  const nothingChanges = changed.size === 0 && undetermined.size === 0;

  // The resources the call changes somewhere, by slug: a variant without one of them is told so.
  const slugOf = new Map(units.map((unit) => [unit.unitId, unit.slug]));
  const changedSlugs = new Set(results.flatMap((result) => (result.UnitID !== undefined && changes(result) ? [slugOf.get(result.UnitID) ?? ''] : [])));
  changedSlugs.delete('');

  // Variants the call finds nothing to change in, while it changes others: their own neutral class.
  const nothingHere = new Set(nothingChanges ? [] : pathSpaceIds.filter((spaceId) => !changed.has(spaceId) && !undetermined.has(spaceId)));
  const outliers: DraftOutlier[] = [];
  for (const spaceId of pathSpaceIds) {
    if (undetermined.has(spaceId)) continue;
    const facts: DraftOutlierFact[] = [];
    const own = new Set(unitsOf(spaceId).map((unit) => unit.slug));
    // A variant without a resource the call changes elsewhere is told which; one that has them all and is not changed, that nothing changes.
    for (const slug of changedSlugs) if (!own.has(slug) && (changed.has(spaceId) || nothingHere.has(spaceId))) facts.push({ kind: 'lacks', slug });
    for (const unit of unitsOf(spaceId)) {
      const result = resultByUnitId.get(unit.unitId);
      for (const conflict of result?.Conflicts ?? [])
        if (conflictBlocks(conflict.Reason)) facts.push({ kind: 'kept', ...draftKeptValueOf(unit.unitId, conflict) });
    }
    if (nothingHere.has(spaceId) && facts.length === 0) facts.push({ kind: 'nothing' });
    if (facts.length === 0) continue;
    outliers.push({ spaceId, name: nameBySpaceId.get(spaceId) ?? '', facts, text: invokeOutlierText(facts) });
  }
  const outlierSpaceIds = new Set(outliers.map((outlier) => outlier.spaceId));

  const sources = invokeSourcesOf(units, resultByUnitId);
  const groups = buildChangeOrderChangeGroups(sources);
  const spaceIdByUnitId = new Map(units.map((unit) => [unit.unitId, unit.spaceId]));
  // Variants in the order a promotion reaches them: by stage along the path, then as the scope lists them.
  const scopeOrder = new Map(inScopeSpaceIds.map((spaceId, index) => [spaceId, index]));
  const stageOrder = new Map<string, number>();
  stages.forEach((stage, index) => stage.spaceIds.forEach((spaceId) => stageOrder.has(spaceId) || stageOrder.set(spaceId, index)));
  const byScope = (ids: readonly string[]) =>
    [...ids].sort(
      (a, b) =>
        (stageOrder.get(a) ?? stages.length) - (stageOrder.get(b) ?? stages.length) || (scopeOrder.get(a) ?? 0) - (scopeOrder.get(b) ?? 0),
    );

  // "At the source", as the detail view reads an Invoke ChangeOrder's: the variants grouped as a
  // stage is, each group shown once, by its representative.
  const sourceGroups: DraftInvokeSourceGroup[] = [];
  const representativeGroups: ChangeOrderChangeGroup[] = [];
  const ordered = orderStageMembers(byScope(pathSpaceIds), outlierSpaceIds, undetermined);
  if (ordered.length > 0) {
    const matrix = buildStageMatrix({ groups, spaceIds: ordered, spaceIdByUnitId, spaceNameBySpaceId: nameBySpaceId, stageId: SOURCE_COMPARISON_ID });
    for (const group of withNothingHere(withoutAdds(buildChangeOrderOutcome(matrix)), nothingHere).groups) {
      if (group.kind === 'unknown' || group.kind === 'nothing' || group.spaceIds.length === 0) continue;
      const own = groups.filter((unitGroup) => spaceIdByUnitId.get(unitGroup.unitId) === group.representativeSpaceId);
      representativeGroups.push(...own);
      const shown = own.filter((unitGroup) => unitGroup.fieldDiffs.length > 0 || (unitGroup.conflicts ?? []).some((conflict) => conflict.blocks));
      const members = byScope(group.spaceIds);
      sourceGroups.push({
        names: members.map((spaceId) => nameBySpaceId.get(spaceId) ?? ''),
        spaceIds: members,
        representativeSpaceId: group.representativeSpaceId,
        groups: shown,
      });
    }
  }
  // The change most variants take first.
  sourceGroups.sort((a, b) => Number(b.groups.length > 0) - Number(a.groups.length > 0) || b.spaceIds.length - a.spaceIds.length);
  const carriedResourceKeys = carriedResourceKeysOf(representativeGroups);

  const stagePreviews = stages.map((stage): DraftStagePreview => {
    const spaceIds = orderStageMembers(byScope(stage.spaceIds), outlierSpaceIds, undetermined);
    const members = new Set(spaceIds);
    const stageGroups = groups.filter((group) => members.has(spaceIdByUnitId.get(group.unitId) ?? ''));
    const matrix =
      spaceIds.length === 0
        ? null
        : buildStageMatrix({ groups: stageGroups, spaceIds, spaceIdByUnitId, spaceNameBySpaceId: nameBySpaceId, stageId: stage.stageId });
    return { stageId: stage.stageId, spaceIds, groups: stageGroups, matrix, outcome: withNothingHere(withoutAdds(buildChangeOrderOutcome(matrix, carriedResourceKeys)), nothingHere) };
  });

  const sourceDiffs: UnitDiff[] = representativeGroups.flatMap((group) =>
    group.diff === undefined || group.fieldDiffs.length === 0 ? [] : [{ UnitID: group.unitId, SpaceID: spaceIdByUnitId.get(group.unitId), Diff: group.diff }],
  );
  const diffsBySpaceId = new Map<string, UnitDiff[]>();
  for (const result of results) {
    if (result.SpaceID === undefined || result.Diff === undefined || !changes(result)) continue;
    diffsBySpaceId.set(result.SpaceID, [...(diffsBySpaceId.get(result.SpaceID) ?? []), { UnitID: result.UnitID, SpaceID: result.SpaceID, Diff: result.Diff }]);
  }

  return {
    stages: stagePreviews,
    outliers,
    undeterminedSpaceIds: pathSpaceIds.filter((spaceId) => undetermined.has(spaceId)),
    totals: nothingChanges || pathSpaceIds.length === 0 ? undefined : totalsOf(stagePreviews, inScopeSpaceIds),
    nothingChanges,
    noneEstablished: pathSpaceIds.length > 0 && undetermined.size === pathSpaceIds.length,
    outsideStageSpaceIds,
    sourceGroups,
    sourceDiffs,
    diffsBySpaceId,
  };
}

/** A chip's words: one kept value as a fact about the field; nothing to change as itself. */
export function invokeOutlierText(facts: readonly DraftOutlierFact[]): string {
  const only = facts.length === 1 ? facts[0] : undefined;
  if (only?.kind === 'nothing') return draftCopy.outlier.nothingHere;
  if (only?.kind === 'kept' && only.value !== undefined) return draftCopy.outlier.stays(only.field, only.value);
  return facts
    .map((fact) => {
      if (fact.kind === 'kept') return draftCopy.outlier.keeps(fact.field, fact.value);
      if (fact.kind === 'adds') return draftCopy.outlier.adds(fact.slug);
      if (fact.kind === 'lacks') return draftCopy.outlier.lacks(fact.slug);
      return draftCopy.outlier.nothingHere;
    })
    .join(draftCopy.outlier.separator);
}
