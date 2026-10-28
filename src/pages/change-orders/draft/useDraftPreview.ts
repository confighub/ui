// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import {
  MAX_PARALLEL_CHUNKS,
  inParallel,
  useSearchRevisionDataChunkedQuery,
  useSearchUnitDataChunkedQuery,
} from '@/hooks/chunkedQueriesApi';
import { configDiffApi, isNothingToDiff } from '@/hooks/configDiffApi';
import { type ConfigDiff, confighubApi } from '@confighub/rtk-query';

import { buildChangeOrderSequence } from '../../x/apps/change-order/changeOrderStages';
import type { ChangeOrderSequence } from '../../x/apps/change-order/changeOrderTypes';
import { useWorkflowStageSpaces } from '../../x/apps/change-order/useWorkflowStageSpaces';
import { useGetUnitUpgradePreviewQuery } from '../../x/apps/upgradePreviewApi';
import type { DraftUnitRange, DraftVariantUnit } from './draftChangeCards';
import { draftCopy } from './draftCopy';
import type { DraftWorkflowChoice } from './draftDecisions';
import {
  type DraftOutlier,
  type DraftPreviewTotals,
  type DraftPreviewUnit,
  type DraftStageInput,
  type DraftStagePreview,
  assembleDraftPreview,
  outsideEveryStage,
} from './draftPreview';
import type {
  DraftDerivedStatus,
  DraftReadStatus,
  DraftUpdateType,
  DraftUpstream,
  DraftVariant,
} from './draftTypes';
import { useRetry } from './useRetry';
import { useSettledValue } from './useSettledValue';

/** The one stage a draft with no workflow previews: every variant in scope. Never shown. */
export const DRAFT_SCOPE_STAGE_ID = '__draft_scope__';

/** How long the draft waits after the last change of scope or end before previewing again. */
export const DRAFT_PREVIEW_SETTLE_MS = 400;

/**
 * A Unit the promotion clones into a variant: the base Unit's data at the end, before
 * `set-namespace` places it.
 */
export interface DraftClone {
  spaceId: string;
  baseUnitId: string;
  slug: string;
  /** The base Unit's configuration at the Revision the change ends at. `undefined` unless read. */
  data: string | undefined;
  /** `failed`: the data could not be read — "Could not establish", never an empty resource. */
  dataStatus: DraftReadStatus;
  /** The server's diff from nothing to the base Unit at the end: each resource a whole Add. `undefined` unless read. */
  diff: ConfigDiff | undefined;
  /** `failed`: the diff could not be read, so what the clone writes is not determined. */
  diffStatus: DraftReadStatus;
}

/** A base Unit at the Revision a change ends at, which the promotion clones into variants. */
interface DraftCloneDiffItem {
  unitId: string;
  revisionId: string;
}

const cloneDiffKey = (item: DraftCloneDiffItem) => `${item.unitId}@${item.revisionId}`;

/**
 * By `cloneDiffKey`. `undefined` only for an item whose read failed; a Revision that names
 * nothing writes nothing, which is an empty diff.
 */
type DraftCloneDiffs = Record<string, ConfigDiff | undefined>;

/*
 * What each clone would write, from nothing to its base Unit at the end, as the server diffs
 * it. One `getConfigDiff` per base Unit, so each is its own cache entry and a scope that gains
 * a Unit reads only that one; a read that fails is an item without a diff rather than a failed
 * whole, so one Unit that cannot be read leaves the others' counts standing.
 */
const draftCloneDiffApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    getDraftCloneDiffs: build.query<DraftCloneDiffs, { items: DraftCloneDiffItem[] }>({
      queryFn: async ({ items }, api) => {
        const diffs = await inParallel(items, MAX_PARALLEL_CHUNKS, async (item) => {
          const result = await api.dispatch(
            configDiffApi.endpoints.getConfigDiff.initiate(
              {
                diffRequest: {
                  From: {},
                  To: { UnitID: item.unitId, Revision: item.revisionId },
                },
              },
              { subscribe: false },
            ),
          );
          if (result.data === undefined) return undefined;
          return isNothingToDiff(result.data) ? {} : (result.data.Diff ?? {});
        });
        const data: DraftCloneDiffs = {};
        items.forEach((item, at) => {
          data[cloneDiffKey(item)] = diffs[at];
        });
        return { data };
      },
    }),
  }),
  overrideExisting: false,
});

export interface DraftPreview {
  /**
   * `unavailable`: the draft cannot be previewed at all (a MergeUnits change resolves Links,
   * which the upgrade dry run does not run; an end that names nothing) — every outcome reads
   * "Could not establish", with no retry. `loading`: nothing is said yet. `failed`: a read the
   * preview needs failed; `retry` asks again.
   */
  status: 'loading' | 'resolved' | 'failed' | 'unavailable';
  /** Why `unavailable`, in the page's words. */
  reason: string | undefined;
  /** Asks again every read that failed. Does nothing while none has. */
  retry: () => void;
  /**
   * In-scope variants no stage of the workflow selects, in scope order: a promotion along it
   * never reaches them, so they are in no stage, no outlier and no count. Known once the
   * stages' members are, before the dry runs answer. Empty with no workflow.
   */
  outsideStageSpaceIds: string[];
  /** The path as the rail draws it, the source row first. `undefined` with no workflow. */
  sequence: ChangeOrderSequence | undefined;
  /**
   * One per stage of the path (or one for the whole scope without a workflow), in path order.
   * Empty until `resolved`.
   */
  stages: DraftStagePreview[];
  /** One per in-scope variant with a real difference: a value it keeps, or a resource it lacks. */
  outliers: DraftOutlier[];
  /** In-scope variants whose change nobody could read. */
  undeterminedSpaceIds: string[];
  /**
   * "N of M same". `undefined` until `resolved`, and when the change carries nothing
   * (`nothingToCarry`): there is no count of a change that is not there.
   */
  totals: DraftPreviewTotals | undefined;
  /** No base Unit carries anything under the end. */
  nothingToCarry: boolean;
  /**
   * A resolved preview with nothing to show yet, and why, in the page's words ("Nothing changes
   * yet", "Nothing changes"): the outcome line says it, the stage bars are drawn empty, and the
   * stage card has no outcome to give. Absent whenever there is an outcome.
   */
  idle?: string;
  clones: DraftClone[];
  /** For the stage cards' trees and labels. */
  nameBySpaceId: ReadonlyMap<string, string>;
  currentDataByUnitId: ReadonlyMap<string, { slug: string; spaceId: string; data?: string }>;
}

export interface UseDraftPreviewArgs {
  baseSpaceId: string | undefined;
  inScopeSpaceIds: readonly string[];
  variants: readonly DraftVariant[];
  workflow: DraftWorkflowChoice | undefined;
  updateType: DraftUpdateType;
  /** Per base Unit: `useDraftChangeCards`'s, corrected by the create dry run where it has landed. */
  ranges: readonly DraftUnitRange[];
  /** Every variant's Units, from `useDraftChangeCards`. */
  variantUnits: readonly DraftVariantUnit[];
  /** In-scope variants that take the change from elsewhere, from `useDraftChangeCards`. */
  foreignSpaceIds: ReadonlySet<string>;
  /** `useDraftChangeCards`' `basis`: a write to the base asks the dry runs again. */
  basis: string;
  /** `null` for each Unit's head; `undefined` while the end has not resolved. */
  endTagId: string | null | undefined;
  /** From `useDraftSourceDiff`: what the change carries. `null` while it is read. */
  carriedResourceKeys: ReadonlySet<string> | null;
  sourceStatus: DraftDerivedStatus;
  /** Why the draft cannot be previewed, when the caller knows (an end that names nothing). */
  unavailableReason?: string;
  /** The ranges' and the source's reads: when they failed, so does the preview, with their retry. */
  upstream?: DraftUpstream;
  skip?: boolean;
}

/** What a preview that has nothing to say holds: no stage, no outlier, no count. */
const nothingSaid = (): Pick<
  DraftPreview,
  'stages' | 'outliers' | 'undeterminedSpaceIds' | 'totals' | 'nothingToCarry'
> => ({
  stages: [],
  outliers: [],
  undeterminedSpaceIds: [],
  totals: undefined,
  nothingToCarry: false,
});

interface PreviewKey {
  spaceIds: string[];
  upstreamUnitIds: string[];
  mergeEnd: string | undefined;
  basis: string;
}

/**
 * What creating and promoting the draft would write into each variant in scope, stage by stage,
 * before the ChangeOrder exists (see `draftPreview.ts` for how, and why it is the upgrade dry
 * run).
 *
 * READS: the upgrade dry run over the in-scope variants' Units whose upstream is a base Unit
 * that carries the change, twice (replayed for what lands, squashed for its diff), through
 * `getUnitUpgradePreview` — untagged, keyed on the scope, the Units, the end and the basis, and
 * asked once the scope and end have been still for `DRAFT_PREVIEW_SETTLE_MS`; each variant
 * Unit's current data; each stage's members (`useWorkflowStageSpaces`, the detail view's own);
 * the base's data at the end for every Unit a variant does not have yet; and the server's diff
 * from nothing to that data, for what each such clone writes.
 */
export function useDraftPreview(args: UseDraftPreviewArgs): DraftPreview {
  const {
    baseSpaceId,
    inScopeSpaceIds,
    variants,
    workflow,
    updateType,
    ranges,
    variantUnits,
    foreignSpaceIds,
    basis,
    endTagId,
    carriedResourceKeys,
    sourceStatus,
    unavailableReason,
    upstream,
    skip = false,
  } = args;
  const upstreamFailed = upstream?.failed === true;

  const nameBySpaceId = useMemo(
    () => new Map(variants.map((variant) => [variant.spaceId, variant.name])),
    [variants],
  );
  const inScope = useMemo(() => new Set(inScopeSpaceIds), [inScopeSpaceIds]);
  const scopeUnits = useMemo(
    () => variantUnits.filter((unit) => inScope.has(unit.spaceId)),
    [variantUnits, inScope],
  );
  const carryingUnitIds = useMemo(
    () => ranges.filter((range) => range.carry === 'carries').map((range) => range.unitId),
    [ranges],
  );

  const mergeUnits = updateType === 'MergeUnits';
  const unavailable = mergeUnits ? draftCopy.problems.mergeUnitsPreview : unavailableReason;
  const endPending = endTagId === undefined;
  const previewSkip =
    skip ||
    unavailable !== undefined ||
    endPending ||
    inScopeSpaceIds.length === 0 ||
    carryingUnitIds.length === 0;
  // Settled as text, so a render that rebuilds equal arguments is not a change.
  const keyText = previewSkip
    ? ''
    : JSON.stringify({
        spaceIds: [...inScopeSpaceIds].sort(),
        upstreamUnitIds: [...carryingUnitIds].sort(),
        mergeEnd: endTagId === null ? undefined : `Tag:${endTagId}`,
        basis,
      });
  const settledText = useSettledValue(keyText, DRAFT_PREVIEW_SETTLE_MS);
  const settledKey = useMemo(
    () => (settledText === '' ? undefined : (JSON.parse(settledText) as PreviewKey)),
    [settledText],
  );
  const settling = keyText !== settledText;
  const replayed = useGetUnitUpgradePreviewQuery(
    {
      ...(settledKey ?? { spaceIds: [], upstreamUnitIds: [], mergeEnd: undefined, basis: '' }),
      include: 'ConfigData',
    },
    { skip: settledKey === undefined },
  );
  const squashed = useGetUnitUpgradePreviewQuery(
    {
      ...(settledKey ?? { spaceIds: [], upstreamUnitIds: [], mergeEnd: undefined, basis: '' }),
      squash: true,
      include: 'ConfigData,Diff',
    },
    { skip: settledKey === undefined },
  );

  const scopeUnitIds = useMemo(() => scopeUnits.map((unit) => unit.unitId), [scopeUnits]);
  const unitDataRead = useSearchUnitDataChunkedQuery(
    { unitIds: scopeUnitIds },
    { skip: skip || scopeUnitIds.length === 0 },
  );
  const unitDataById = useMemo(
    () =>
      new Map(
        (unitDataRead.currentData ?? []).flatMap((row) =>
          row.UnitID ? [[row.UnitID, row.Data ?? ''] as const] : [],
        ),
      ),
    [unitDataRead.currentData],
  );
  // Waited on through its data: a Unit read as `''` before it lands would diff as every path removed.
  const unitDataPending =
    scopeUnitIds.length > 0 && unitDataRead.currentData === undefined && !unitDataRead.isError;

  const cloneRanges = useMemo(
    () =>
      ranges.filter((range) => range.carry === 'carries' && range.cloneSpaceIds.length > 0),
    [ranges],
  );
  const cloneRevisionIds = useMemo(
    () =>
      cloneRanges.flatMap((range) =>
        range.endRevisionId === undefined ? [] : [range.endRevisionId],
      ),
    [cloneRanges],
  );
  const cloneDataRead = useSearchRevisionDataChunkedQuery(
    { revisionIds: cloneRevisionIds },
    { skip: skip || cloneRevisionIds.length === 0 },
  );
  const cloneDiffItems = useMemo(
    () =>
      cloneRanges
        .flatMap((range): DraftCloneDiffItem[] =>
          range.endRevisionId === undefined
            ? []
            : [{ unitId: range.unitId, revisionId: range.endRevisionId }],
        )
        .sort((a, b) => cloneDiffKey(a).localeCompare(cloneDiffKey(b))),
    [cloneRanges],
  );
  const cloneDiffRead = draftCloneDiffApi.useGetDraftCloneDiffsQuery(
    { items: cloneDiffItems },
    { skip: skip || cloneDiffItems.length === 0 },
  );

  const workflowStages = workflow?.kind === 'workflow' ? workflow.workflow.stages : undefined;
  const {
    stageSpaces,
    isLoading: stagesLoading,
    error: stagesError,
  } = useWorkflowStageSpaces(workflowStages, inScopeSpaceIds);

  const sequence = useMemo(() => {
    if (workflow?.kind !== 'workflow' || baseSpaceId === undefined) return undefined;
    return buildChangeOrderSequence(workflow.workflow.spec, stageSpaces, [baseSpaceId]);
  }, [workflow, baseSpaceId, stageSpaces]);
  const outsideStageSpaceIds = useMemo(
    () =>
      sequence === undefined || stagesLoading || stagesError !== undefined
        ? []
        : outsideEveryStage(
            sequence.stages.filter((stage) => !stage.isSource),
            inScopeSpaceIds,
          ),
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
    () =>
      new Map(
        units.map((unit) => [
          unit.unitId,
          { slug: unit.slug, spaceId: unit.spaceId, data: unit.data },
        ]),
      ),
    [units],
  );
  const clones = useMemo(() => {
    const dataById = new Map(
      (cloneDataRead.currentData ?? []).map((row) => [row.RevisionID ?? '', row.Data ?? '']),
    );
    const dataStatus = (revisionId: string | undefined): DraftReadStatus => {
      if (revisionId === undefined || cloneDataRead.isError) return 'failed';
      return cloneDataRead.currentData === undefined ? 'loading' : 'resolved';
    };
    const diffOf = (range: DraftUnitRange): Pick<DraftClone, 'diff' | 'diffStatus'> => {
      if (range.endRevisionId === undefined || cloneDiffRead.isError)
        return { diff: undefined, diffStatus: 'failed' };
      if (cloneDiffRead.currentData === undefined)
        return { diff: undefined, diffStatus: 'loading' };
      const diff =
        cloneDiffRead.currentData[
          cloneDiffKey({ unitId: range.unitId, revisionId: range.endRevisionId })
        ];
      return { diff, diffStatus: diff === undefined ? 'failed' : 'resolved' };
    };
    return cloneRanges.flatMap((range) => {
      const diff = diffOf(range);
      return range.cloneSpaceIds.map(
        (spaceId): DraftClone => ({
          spaceId,
          baseUnitId: range.unitId,
          slug: range.slug,
          data:
            range.endRevisionId === undefined
              ? undefined
              : dataById.get(range.endRevisionId) || undefined,
          dataStatus: dataStatus(range.endRevisionId),
          ...diff,
        }),
      );
    });
  }, [
    cloneRanges,
    cloneDataRead.currentData,
    cloneDataRead.isError,
    cloneDiffRead.currentData,
    cloneDiffRead.isError,
  ]);

  const retry = useRetry(
    [
      replayed,
      squashed,
      unitDataRead,
      cloneDataRead,
      // A clone's diff that failed is an item without a diff, not a failed read.
      {
        isError:
          cloneDiffRead.isError ||
          Object.values(cloneDiffRead.currentData ?? {}).some((diff) => diff === undefined),
        isUninitialized: cloneDiffRead.isUninitialized,
        refetch: cloneDiffRead.refetch,
      },
    ],
    upstream?.retry,
  );

  return useMemo((): DraftPreview => {
    const common = {
      sequence,
      clones,
      nameBySpaceId,
      currentDataByUnitId,
      retry,
      outsideStageSpaceIds,
    };
    if (unavailable !== undefined) {
      return {
        status: 'unavailable',
        reason: unavailable,
        ...nothingSaid(),
        ...common,
      };
    }
    const failed =
      upstreamFailed ||
      replayed.isError ||
      squashed.isError ||
      unitDataRead.isError ||
      stagesError !== undefined ||
      sourceStatus === 'failed';
    if (failed) return { status: 'failed', reason: undefined, ...nothingSaid(), ...common };
    const previewPending =
      !previewSkip &&
      (settling || replayed.currentData === undefined || squashed.currentData === undefined);
    if (
      skip ||
      endPending ||
      previewPending ||
      unitDataPending ||
      stagesLoading ||
      sourceStatus === 'loading'
    ) {
      return { status: 'loading', reason: undefined, ...nothingSaid(), ...common };
    }
    const stageInputs: DraftStageInput[] =
      sequence === undefined
        ? [{ stageId: DRAFT_SCOPE_STAGE_ID, spaceIds: [...inScopeSpaceIds] }]
        : sequence.stages
            .filter((stage) => !stage.isSource)
            .map((stage) => ({ stageId: stage.id, spaceIds: stage.spaceIds }));
    return {
      status: 'resolved',
      reason: undefined,
      ...assembleDraftPreview({
        stages: stageInputs,
        inScopeSpaceIds,
        nameBySpaceId,
        units,
        ranges,
        replayed: previewSkip ? [] : replayed.currentData,
        squashed: previewSkip ? [] : squashed.currentData,
        carriedResourceKeys,
        foreignSpaceIds,
      }),
      ...common,
    };
  }, [
    sequence,
    clones,
    nameBySpaceId,
    currentDataByUnitId,
    retry,
    outsideStageSpaceIds,
    unavailable,
    upstreamFailed,
    replayed.isError,
    replayed.currentData,
    squashed.isError,
    squashed.currentData,
    unitDataRead.isError,
    stagesError,
    sourceStatus,
    previewSkip,
    settling,
    skip,
    endPending,
    unitDataPending,
    stagesLoading,
    inScopeSpaceIds,
    ranges,
    units,
    carriedResourceKeys,
    foreignSpaceIds,
  ]);
}
