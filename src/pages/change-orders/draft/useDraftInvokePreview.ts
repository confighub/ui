// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useSearchUnitDataChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { getApiErrorMessage } from '@/utility/error-functions';
import type { FunctionInvocationsRequest, FunctionInvocationsResponse, UnitCreateOrUpdateResponseRead, UnitDiff } from '@confighub/rtk-query';

import { buildChangeOrderSequence } from '../../x/apps/change-order/changeOrderStages';
import { useWorkflowStageSpaces } from '../../x/apps/change-order/useWorkflowStageSpaces';
import type { DraftVariantUnit } from './draftChangeCards';
import { draftCopy } from './draftCopy';
import { INVOKE_IDS } from './draftInvoke';
import { containerUsesOf, functionErrorText, rangeRefusalOf } from './draftKinds';
import type { DraftWorkflowChoice } from './draftDecisions';
import type { DraftResolveRequest } from './draftFanOut';
import { useGetDraftResolveDryRunQuery } from './draftFanOutApi';
import { useGetDraftFunctionDryRunQuery } from './draftInvokeApi';
import { type DraftInvokeSourceGroup, assembleInvokePreview } from './draftInvokePreview';
import { type DraftPreviewUnit, type DraftStageInput, outsideEveryStage } from './draftPreview';
import type { DraftProblem, DraftVariant } from './draftTypes';
import { isRefusal } from './draftValidation';
import { DRAFT_PREVIEW_SETTLE_MS, DRAFT_SCOPE_STAGE_ID, type DraftPreview } from './useDraftPreview';
import { useRetry } from './useRetry';
import { useSettledValue } from './useSettledValue';

export interface DraftInvokePreview extends DraftPreview {
  /** "At the source": the variants grouped by the change they take. */
  sourceGroups: DraftInvokeSourceGroup[];
  /** The representatives' diffs, for the hero. */
  sourceDiffs: UnitDiff[];
  /** Every changed Unit's diff, by variant. */
  diffsBySpaceId: ReadonlyMap<string, UnitDiff[]>;
  /** The call changes nothing in any variant in scope. */
  nothingChanges: boolean;
  /** The run could not say what the call does in any variant on the path. */
  noneEstablished: boolean;
  /** The tag most variants in scope run each container at now, by container name: what an image change moves from. */
  currentTags: ReadonlyMap<string, string>;
  /** Each tag the variants in scope run each container at, with how many run it: what the tag input suggests. */
  tagsInScope: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** The server refused the call itself (a 4xx): said on the kind's row. */
  refusal: DraftProblem | undefined;
  /** True once the run answered for exactly this call: what Create waits for, for an inline call. */
  settled: boolean;
}

export interface UseDraftInvokePreviewArgs {
  baseSpaceId: string | undefined;
  inScopeSpaceIds: readonly string[];
  variants: readonly DraftVariant[];
  workflow: DraftWorkflowChoice | undefined;
  /** Every variant's Units, from `useDraftChangeCards`. */
  variantUnits: readonly DraftVariantUnit[];
  whereUnit: string;
  /** The call (`DraftInvoke.previewRequest`); `undefined` while it is not whole. */
  request: FunctionInvocationsRequest | undefined;
  /**
   * A Transform paths draft's run instead (`DraftFanOut.previewRequest`): each followed Link
   * resolved in its variant, to the end. Read through the same classification as a call's.
   */
  resolve?: DraftResolveRequest;
  skip?: boolean;
  /** What the outcome says while there is no whole call: "Nothing changes yet". */
  idleText: string;
  /** The argument inputs' ids by argument name, for a refusal that is about one argument's value. */
  argIds?: ReadonlyMap<string, string>;
}

interface PreviewKey {
  spaceIds: string[];
  whereUnit: string;
  request: FunctionInvocationsRequest;
  resolve?: DraftResolveRequest;
}

/** A resolve dry run's answer for a Unit, as a function run's: the classification reads either. */
function asRunResult(item: UnitCreateOrUpdateResponseRead): FunctionInvocationsResponse {
  return {
    UnitID: item.Unit?.UnitID,
    SpaceID: item.Unit?.SpaceID,
    ConfigData: item.ConfigData,
    Diff: item.Diff,
    Conflicts: item.Conflicts,
    Error: item.Error,
    Success: item.Error === undefined || item.Error === null,
  };
}

const NO_GROUPS: DraftInvokeSourceGroup[] = [];
const NO_DIFFS: UnitDiff[] = [];
const NO_DIFFS_BY_SPACE: ReadonlyMap<string, UnitDiff[]> = new Map();

/** Each tag each container runs at in the Units given, by container name, with how many variants run it. */
function tagsInScopeOf(units: readonly DraftPreviewUnit[]): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const spaces = new Map<string, Map<string, Set<string>>>();
  for (const unit of units) {
    for (const use of containerUsesOf(unit.slug, unit.data)) {
      if (use.tag === undefined) continue;
      const byTag = spaces.get(use.name) ?? new Map<string, Set<string>>();
      byTag.set(use.tag, (byTag.get(use.tag) ?? new Set<string>()).add(unit.spaceId));
      spaces.set(use.name, byTag);
    }
  }
  return new Map([...spaces].map(([name, byTag]) => [name, new Map([...byTag].map(([tag, ids]) => [tag, ids.size]))]));
}

/** The tag each container runs at in the most variants. */
function currentTagsOf(tagsInScope: ReadonlyMap<string, ReadonlyMap<string, number>>): ReadonlyMap<string, string> {
  return new Map([...tagsInScope].map(([name, byTag]) => [name, [...byTag].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]));
}

/**
 * The server's refusal of the call, on the kind's row: in the function's own words, without the
 * run's wrapper; on the argument it is about when it names one ("replicas: 0 or more").
 */
function refusalProblem(message: string, argIds: ReadonlyMap<string, string> | undefined): DraftProblem {
  const range = rangeRefusalOf(message);
  const focusId = range === undefined ? undefined : argIds?.get(range.name);
  if (range !== undefined && focusId !== undefined) {
    const said = draftCopy.invoke.problems.argRefused(range.name, range.message);
    return { row: 'what', code: 'call-refused', message: said, source: 'server', blocks: true, blockerLabel: said, focusId };
  }
  return { row: 'what', code: 'call-refused', message: draftCopy.invoke.problems.refused(functionErrorText(message)), source: 'server', blocks: true, focusId: INVOKE_IDS.function };
}

/**
 * What an Invoke draft would write into each variant in scope, stage by stage, before anything is
 * saved: the function dry run of the call the ChangeOrder will run (`getDraftFunctionDryRun`),
 * once the call and the scope have been still for `DRAFT_PREVIEW_SETTLE_MS`, with each variant
 * Unit's current data and each stage's members (`useWorkflowStageSpaces`, the detail view's own),
 * read into `DraftPreview`'s shape by `assembleInvokePreview`.
 */
export function useDraftInvokePreview(args: UseDraftInvokePreviewArgs): DraftInvokePreview {
  const { baseSpaceId, inScopeSpaceIds, variants, workflow, variantUnits, whereUnit, request, resolve, skip = false, idleText } = args;
  const nameBySpaceId = useMemo(() => new Map(variants.map((variant) => [variant.spaceId, variant.name])), [variants]);
  const inScope = useMemo(() => new Set(inScopeSpaceIds), [inScopeSpaceIds]);
  const scopeUnits = useMemo(() => variantUnits.filter((unit) => inScope.has(unit.spaceId)), [variantUnits, inScope]);

  const asked = !skip && (request !== undefined || resolve !== undefined) && inScopeSpaceIds.length > 0;
  const keyText = asked ? JSON.stringify({ spaceIds: [...inScopeSpaceIds].sort(), whereUnit, request: request ?? {}, resolve }) : '';
  const settledText = useSettledValue(keyText, DRAFT_PREVIEW_SETTLE_MS);
  const settledKey = useMemo(() => (settledText === '' ? undefined : (JSON.parse(settledText) as PreviewKey)), [settledText]);
  const settling = keyText !== settledText;
  const called = useGetDraftFunctionDryRunQuery(settledKey ?? { spaceIds: [], whereUnit: '', request: {} }, { skip: settledKey === undefined || settledKey.resolve !== undefined });
  const resolved = useGetDraftResolveDryRunQuery(
    settledKey?.resolve === undefined ? { fromUnitIds: [], linkWhere: '', mergeEnd: undefined, basis: '' } : { ...settledKey.resolve, basis: settledText },
    { skip: settledKey?.resolve === undefined },
  );
  const resolvedResults = useMemo(() => (resolved.currentData === undefined ? undefined : resolved.currentData.map(asRunResult)), [resolved.currentData]);
  const run = settledKey?.resolve === undefined ? called : { ...resolved, currentData: resolvedResults };

  const scopeUnitIds = useMemo(() => scopeUnits.map((unit) => unit.unitId), [scopeUnits]);
  const unitDataRead = useSearchUnitDataChunkedQuery({ unitIds: scopeUnitIds }, { skip: skip || scopeUnitIds.length === 0 });
  const unitDataById = useMemo(
    () => new Map((unitDataRead.currentData ?? []).flatMap((row) => (row.UnitID ? [[row.UnitID, row.Data ?? ''] as const] : []))),
    [unitDataRead.currentData],
  );
  const unitDataPending = scopeUnitIds.length > 0 && unitDataRead.currentData === undefined && !unitDataRead.isError;

  const workflowStages = workflow?.kind === 'workflow' ? workflow.workflow.stages : undefined;
  const { stageSpaces, isLoading: stagesLoading, error: stagesError } = useWorkflowStageSpaces(workflowStages, inScopeSpaceIds);
  const sequence = useMemo(() => {
    if (workflow?.kind !== 'workflow' || baseSpaceId === undefined) return undefined;
    return buildChangeOrderSequence(workflow.workflow.spec, stageSpaces, [baseSpaceId]);
  }, [workflow, baseSpaceId, stageSpaces]);
  const outsideStageSpaceIds = useMemo(
    () =>
      sequence === undefined || stagesLoading || stagesError !== undefined
        ? []
        : outsideEveryStage(sequence.stages.filter((stage) => !stage.isSource), inScopeSpaceIds),
    [sequence, stagesLoading, stagesError, inScopeSpaceIds],
  );

  const units = useMemo(
    () =>
      scopeUnits.map(
        (unit): DraftPreviewUnit => ({
          unitId: unit.unitId,
          slug: unit.slug,
          spaceId: unit.spaceId,
          upstreamUnitId: unit.upstreamUnitId,
          data: unitDataById.get(unit.unitId) || undefined,
        }),
      ),
    [scopeUnits, unitDataById],
  );
  const currentDataByUnitId = useMemo(
    () => new Map(units.map((unit) => [unit.unitId, { slug: unit.slug, spaceId: unit.spaceId, data: unit.data }])),
    [units],
  );
  // Read once per answer of the variants' data, never per keystroke.
  const tagsInScope = useMemo(() => tagsInScopeOf(units), [units]);
  const currentTags = useMemo(() => currentTagsOf(tagsInScope), [tagsInScope]);

  const retry = useRetry([called, resolved, unitDataRead]);
  const runStatus = (run.error as { status?: unknown } | undefined)?.status;
  const refused = run.isError && isRefusal(runStatus);
  const refusalMessage = refused ? getApiErrorMessage(run.error) : undefined;
  const refusalArgIds = args.argIds;

  return useMemo((): DraftInvokePreview => {
    const common = {
      sequence,
      clones: [],
      nameBySpaceId,
      currentDataByUnitId,
      retry,
      outsideStageSpaceIds,
      sourceGroups: NO_GROUPS,
      sourceDiffs: NO_DIFFS,
      diffsBySpaceId: NO_DIFFS_BY_SPACE,
      nothingChanges: false,
      noneEstablished: false,
      currentTags,
      tagsInScope,
      refusal: undefined,
      settled: false,
    };
    const nothing = { stages: [], outliers: [], undeterminedSpaceIds: [], totals: undefined, nothingToCarry: false };
    if (refusalMessage !== undefined && !settling) {
      return { status: 'resolved', reason: undefined, ...nothing, ...common, refusal: refusalProblem(refusalMessage, refusalArgIds), idle: idleText };
    }
    if ((run.isError && !refused) || unitDataRead.isError || stagesError !== undefined) return { status: 'failed', reason: undefined, ...nothing, ...common };
    // No whole call yet: nothing runs, and nothing is said about what it would do.
    if (!asked) return { status: 'resolved', reason: undefined, ...nothing, ...common, idle: idleText };
    if (settling || run.currentData === undefined || run.isFetching || unitDataPending || stagesLoading)
      return { status: 'loading', reason: undefined, ...nothing, ...common };
    const stageInputs: DraftStageInput[] =
      sequence === undefined
        ? [{ stageId: DRAFT_SCOPE_STAGE_ID, spaceIds: [...inScopeSpaceIds] }]
        : sequence.stages.filter((stage) => !stage.isSource).map((stage) => ({ stageId: stage.id, spaceIds: stage.spaceIds }));
    const assembly = assembleInvokePreview({ stages: stageInputs, inScopeSpaceIds, nameBySpaceId, units, results: run.currentData });
    // A call that changes nothing anywhere has no outcome to show: the stages are drawn empty.
    if (assembly.nothingChanges)
      return { status: 'resolved', reason: undefined, ...nothing, ...common, nothingChanges: true, settled: true, idle: draftCopy.invoke.problems.nothingChanges };
    return {
      status: 'resolved',
      reason: undefined,
      stages: assembly.stages,
      outliers: assembly.outliers,
      undeterminedSpaceIds: assembly.undeterminedSpaceIds,
      totals: assembly.totals,
      nothingToCarry: false,
      ...common,
      outsideStageSpaceIds: assembly.outsideStageSpaceIds.length > 0 ? assembly.outsideStageSpaceIds : outsideStageSpaceIds,
      sourceGroups: assembly.sourceGroups,
      sourceDiffs: assembly.sourceDiffs,
      diffsBySpaceId: assembly.diffsBySpaceId,
      nothingChanges: false,
      noneEstablished: assembly.noneEstablished,
      settled: true,
    };
  }, [
    sequence,
    nameBySpaceId,
    currentDataByUnitId,
    retry,
    outsideStageSpaceIds,
    currentTags,
    tagsInScope,
    idleText,
    refusalArgIds,
    refusalMessage,
    settling,
    run.isError,
    refused,
    unitDataRead.isError,
    stagesError,
    asked,
    run.currentData,
    run.isFetching,
    unitDataPending,
    stagesLoading,
    inScopeSpaceIds,
    units,
  ]);
}
