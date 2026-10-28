// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useListAllUnitsChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { type UnitDiff, useListAllUnitsQuery } from '@confighub/rtk-query';

import type { HistoryPerson } from '../changeOrderHistory';
import {
  useGetDraftRevisionsQuery,
  useGetDraftSourceDiffQuery,
} from '../changeOrderImageDiffApi';
import {
  DRAFT_BASE_UNIT_SELECT,
  DRAFT_RANGE_REVISION_SELECT,
  DRAFT_START_REVISION_SELECT,
  DRAFT_VARIANT_UNIT_SELECT,
  type DraftBaseUnit,
  type DraftCardInclusion,
  type DraftCardSummary,
  type DraftChangeCardBase,
  type DraftChangeSet,
  type DraftEndOption,
  type DraftResolvedEnd,
  type DraftRevision,
  type DraftUnitRange,
  type DraftUnitStart,
  type DraftVariantUnit,
  buildChangeCards,
  cardDiffItems,
  cardInclusion,
  cardSummaryOf,
  carriesNothing,
  changeSetsOfRevisions,
  deriveUnitRanges,
  deriveUnitStarts,
  draftRevisionOf,
  endTagRevisionsWhere,
  foreignUpstreamSpaceIds,
  rangeRevisionsWheres,
  startRevisionByUnitId,
  startRevisionsWheres,
  suggestedEnd,
  uniqueRevisions,
  validEnds,
} from './draftChangeCards';
import { draftCopy } from './draftCopy';
import type { DraftEndChoice } from './draftDecisions';
import type { DraftDerivedStatus, DraftProblem, DraftUpdateType } from './draftTypes';
import { useDraftPeople } from './useDraftPeople';
import { useRetry } from './useRetry';

/** One change waiting in the base, ready to draw. */
export interface DraftChangeCard extends DraftChangeCardBase {
  author: HistoryPerson;
  summary: DraftCardSummary;
  /** Inside the change as it now ends; `unknown` until the end and the ranges are known. */
  inclusion: DraftCardInclusion;
}

/** The end the decisions name, once the base's ChangeSets are known. */
export type DraftEndResolution =
  | { status: 'loading' }
  /** `endTagId` is `null` for each Unit's head: the create request sends none. */
  | { status: 'resolved'; end: DraftResolvedEnd; endTagId: string | null }
  /** A ChangeSet slug that names no closed ChangeSet of the waiting changes. */
  | { status: 'notFound'; slug: string }
  /** A ChangeSet end, while what is waiting cannot be said (`DraftChangeCards.status`). */
  | { status: 'undetermined' }
  /** A read the end is looked up in failed: `DraftChangeCards.retry` asks it again. */
  | { status: 'failed' };

export interface DraftChangeCards {
  /**
   * `resolved` once every read the cards and ranges need has landed. Card summaries load on
   * their own. `undetermined`: what is waiting cannot be said — no variant in scope to start
   * from, or a MergeUnits change, whose start the Units do not record (`reason`). The ribbon and
   * How much read "Could not establish"; `cards` may still list what is known.
   */
  status: DraftDerivedStatus;
  /** Why `undetermined`, in the page's words. */
  reason: string | undefined;
  /** Asks again every read that failed. Does nothing while none has. */
  retry: () => void;
  /** Oldest first. */
  cards: DraftChangeCard[];
  /** ChangeSets the waiting changes were made in, with the cards each brackets. */
  changeSets: DraftChangeSet[];
  /** Head first, then each closed ChangeSet. */
  ends: DraftEndOption[];
  end: DraftEndResolution;
  /** The one-click end beside the ribbon: "End at release-1.15", or "End at latest". */
  suggestedEnd: DraftEndOption | undefined;
  /** Per base Unit: where its change starts, from what the in-scope variants have taken. */
  starts: DraftUnitStart[];
  /**
   * Per base Unit: what it carries under the end, worked out from the Revisions and the
   * variants' pointers. Empty until the end resolves. The create dry run's `SkippedUnits`
   * corrects it (`reconcileRanges`), which `useChangeOrderDraft` applies.
   */
  ranges: DraftUnitRange[];
  /**
   * The ranges as an UpgradeUnit change would bound them: `ranges` itself for an UpgradeUnit
   * draft. A MergeUnits change carries the same waiting changes by another route, so the
   * description is suggested from these while its own ranges are `unknown`.
   */
  boundingRanges: DraftUnitRange[];
  /**
   * In-scope variants that take the change from another Space than the base: what they would
   * hold cannot be established from here.
   */
  foreignSpaceIds: ReadonlySet<string>;
  /** `unitId@start-end` per range: what the dry runs' answers rest on, for their cache keys. */
  basis: string;
  baseUnits: DraftBaseUnit[];
  /** Every variant's Units, in scope or not. */
  variantUnits: DraftVariantUnit[];
  /** Start disagreements, an end that names nothing: all on How much. */
  problems: DraftProblem[];
}

export interface UseDraftChangeCardsArgs {
  baseSpaceId: string | undefined;
  /** Every variant of the base, in scope or not: one read serves every scope. */
  variantSpaceIds: readonly string[];
  inScopeSpaceIds: readonly string[];
  end: DraftEndChoice | undefined;
  updateType: DraftUpdateType;
  skip?: boolean;
}

const EMPTY_DIFFS: UnitDiff[] = [];
const NO_WHERES: string[] = [];

const hasDiffError = (diff: UnitDiff) => diff.Error !== undefined;

const revisionKey = (unitId: string, revisionNum: number) => `${unitId}@${revisionNum}`;

const revisionsOf = (entries: readonly Parameters<typeof draftRevisionOf>[0][] | undefined) =>
  (entries ?? [])
    .map(draftRevisionOf)
    .filter((revision): revision is DraftRevision => revision !== undefined);

/**
 * The changes waiting in the base Space since what its variants have taken, as cards; the
 * ChangeSets bracketing them; where the change can end; and what each base Unit carries under
 * the end the draft names.
 *
 * READS, in order, each waiting on the one before:
 * 1. The base's Units (head Revision), and every variant's Units with their `UpstreamUnitID`
 *    and `UpstreamRevisionNum` — where each Unit's change starts (`deriveUnitStarts`).
 * 2. Each Unit's start Revision, for its time and Tags.
 * 3. The base's Revisions past the starts (`rangeRevisionsWheres`), every page, with their
 *    ChangeSet expanded; and, for a ChangeSet end, every Revision its end Tag marks.
 * 4. Each waiting Revision's diff from the one before it, for the cards' summaries, one cache
 *    entry per Revision.
 */
export function useDraftChangeCards(args: UseDraftChangeCardsArgs): DraftChangeCards {
  const {
    baseSpaceId,
    variantSpaceIds,
    inScopeSpaceIds,
    end,
    updateType,
    skip = false,
  } = args;
  const ready = !skip && baseSpaceId !== undefined;

  const baseUnitsRead = useListAllUnitsQuery(
    { where: `SpaceID = '${baseSpaceId ?? ''}'`, select: DRAFT_BASE_UNIT_SELECT },
    { skip: !ready },
  );
  const variantUnitsRead = useListAllUnitsChunkedQuery(
    { spaceIds: [...variantSpaceIds], select: DRAFT_VARIANT_UNIT_SELECT },
    { skip: !ready || variantSpaceIds.length === 0 },
  );

  const baseUnits = useMemo(
    () =>
      (baseUnitsRead.currentData ?? []).flatMap((entry): DraftBaseUnit[] => {
        const unit = entry.Unit;
        if (unit?.UnitID === undefined) return [];
        return [
          { unitId: unit.UnitID, slug: unit.Slug, headRevisionNum: unit.HeadRevisionNum ?? 0, toolchainType: unit.ToolchainType || undefined },
        ];
      }),
    [baseUnitsRead.currentData],
  );
  const variantUnits = useMemo(
    () =>
      (variantUnitsRead.currentData ?? []).flatMap((entry): DraftVariantUnit[] => {
        const unit = entry.Unit;
        if (unit?.UnitID === undefined || unit.SpaceID === undefined) return [];
        return [
          {
            unitId: unit.UnitID,
            slug: unit.Slug,
            spaceId: unit.SpaceID,
            upstreamUnitId: unit.UpstreamUnitID || undefined,
            upstreamRevisionNum: unit.UpstreamRevisionNum ?? 0,
          },
        ];
      }),
    [variantUnitsRead.currentData],
  );
  const unitsLanded =
    baseUnitsRead.currentData !== undefined &&
    (variantSpaceIds.length === 0 || variantUnitsRead.currentData !== undefined);

  const foreignSpaceIds = useMemo(
    () => foreignUpstreamSpaceIds(baseUnits, variantUnits, inScopeSpaceIds),
    [baseUnits, variantUnits, inScopeSpaceIds],
  );
  const starts = useMemo(
    () =>
      unitsLanded
        ? deriveUnitStarts(baseUnits, variantUnits, inScopeSpaceIds, foreignSpaceIds)
        : [],
    [unitsLanded, baseUnits, variantUnits, inScopeSpaceIds, foreignSpaceIds],
  );

  const startWheres = useMemo(() => startRevisionsWheres(starts), [starts]);
  const startRead = useGetDraftRevisionsQuery(
    { wheres: startWheres, select: DRAFT_START_REVISION_SELECT },
    { skip: !ready || startWheres.length === 0 },
  );
  const startsLanded =
    unitsLanded && (startWheres.length === 0 || startRead.currentData !== undefined);
  const startRevisionList = useMemo(
    () => revisionsOf(startRead.currentData),
    [startRead.currentData],
  );
  const startRevisions = useMemo(
    () => startRevisionByUnitId(starts, startRevisionList),
    [starts, startRevisionList],
  );

  const rangeWheres = useMemo(
    () =>
      baseSpaceId === undefined || !startsLanded
        ? NO_WHERES
        : rangeRevisionsWheres(baseSpaceId, starts, startRevisions),
    [baseSpaceId, startsLanded, starts, startRevisions],
  );
  const rangeRead = useGetDraftRevisionsQuery(
    { wheres: rangeWheres, select: DRAFT_RANGE_REVISION_SELECT, include: 'ChangeSetID' },
    { skip: !ready || rangeWheres.length === 0 },
  );
  const rangeEntries = rangeRead.currentData;
  const revisions = useMemo(() => uniqueRevisions(revisionsOf(rangeEntries)), [rangeEntries]);
  const revisionsLanded =
    startsLanded && (rangeWheres.length === 0 || rangeEntries !== undefined);

  const unitSlugById = useMemo(
    () => new Map(baseUnits.map((unit) => [unit.unitId, unit.slug])),
    [baseUnits],
  );
  const cardBases = useMemo(
    () => buildChangeCards(revisions, starts, unitSlugById),
    [revisions, starts, unitSlugById],
  );
  const changeSets = useMemo(
    () => changeSetsOfRevisions(rangeEntries ?? [], cardBases),
    [rangeEntries, cardBases],
  );
  const ends = useMemo(() => validEnds(changeSets, cardBases), [changeSets, cardBases]);

  // Where no Unit's start can be said, no Revision is read, so a ChangeSet cannot be looked for.
  const startsUndetermined = starts.some((start) => start.undetermined);
  const lookupFailed = [baseUnitsRead, variantUnitsRead, startRead, rangeRead].some(
    (read) => read.isError,
  );
  const endResolution = useMemo((): DraftEndResolution => {
    if (lookupFailed) return { status: 'failed' };
    if (!revisionsLanded || end === undefined) return { status: 'loading' };
    if (end.kind === 'head')
      return { status: 'resolved', end: { kind: 'head' }, endTagId: null };
    if (startsUndetermined) return { status: 'undetermined' };
    const changeSet = changeSets.find(
      (candidate) => candidate.slug === end.slug && candidate.closed,
    );
    if (changeSet?.endTagId === undefined) return { status: 'notFound', slug: end.slug };
    return {
      status: 'resolved',
      end: { kind: 'tag', tagId: changeSet.endTagId, changeSet },
      endTagId: changeSet.endTagId,
    };
  }, [lookupFailed, revisionsLanded, end, changeSets, startsUndetermined]);

  // Where the end Tag sits on Units whose start is past it: what tells "taken past the end".
  const endTagId = endResolution.status === 'resolved' ? endResolution.endTagId : null;
  const endTagRead = useGetDraftRevisionsQuery(
    {
      wheres:
        baseSpaceId === undefined || endTagId === null
          ? NO_WHERES
          : [endTagRevisionsWhere(baseSpaceId, endTagId)],
      select: DRAFT_START_REVISION_SELECT,
    },
    { skip: !ready || baseSpaceId === undefined || endTagId === null },
  );
  const endTagRevisions = useMemo(
    () => revisionsOf(endTagRead.currentData),
    [endTagRead.currentData],
  );
  const endTagLanded = endTagId === null || endTagRead.currentData !== undefined;

  const rangesOf = useMemo(
    () => (type: DraftUpdateType) =>
      endResolution.status !== 'resolved' || !endTagLanded
        ? []
        : deriveUnitRanges({
            starts,
            revisions,
            startRevisions,
            end: endResolution.end,
            endTagRevisions,
            updateType: type,
          }),
    [endResolution, endTagLanded, starts, revisions, startRevisions, endTagRevisions],
  );
  const ranges = useMemo(() => rangesOf(updateType), [rangesOf, updateType]);
  const boundingRanges = useMemo(
    () => (updateType === 'UpgradeUnit' ? ranges : rangesOf('UpgradeUnit')),
    [updateType, ranges, rangesOf],
  );
  const rangeByUnitId = useMemo(
    () => new Map(ranges.map((range) => [range.unitId, range])),
    [ranges],
  );
  const basis = useMemo(
    () =>
      ranges
        .map((range) => `${range.unitId}@${range.start ?? '?'}-${range.end ?? range.carry}`)
        .sort()
        .join(','),
    [ranges],
  );

  // Every card's Revisions, each from the Revision before it.
  const diffItems = useMemo(() => cardBases.flatMap(cardDiffItems), [cardBases]);
  const diffsRead = useGetDraftSourceDiffQuery(
    { spaceId: baseSpaceId ?? '', diffs: diffItems },
    { skip: !ready || diffItems.length === 0 },
  );
  const diffByRevision = useMemo(() => {
    const index = new Map<string, UnitDiff>();
    (diffsRead.currentData ?? EMPTY_DIFFS).forEach((diff, at) => {
      const item = diffItems[at];
      if (item !== undefined) index.set(revisionKey(item.unitId, Number(item.to)), diff);
    });
    return index;
  }, [diffsRead.currentData, diffItems]);

  const { personOf } = useDraftPeople(
    useMemo(() => cardBases.map((card) => card.userId), [cardBases]),
  );

  const cards = useMemo(
    () =>
      cardBases.map((card): DraftChangeCard => {
        const diffs =
          diffsRead.currentData === undefined
            ? undefined
            : card.revisions.flatMap((revision) => {
                const diff = diffByRevision.get(
                  revisionKey(revision.unitId, revision.revisionNum),
                );
                return diff === undefined ? [] : [diff];
              });
        return {
          ...card,
          author: personOf(card.userId),
          summary: cardSummaryOf(diffs, diffsRead.isError),
          inclusion: ranges.length === 0 ? 'unknown' : cardInclusion(card, rangeByUnitId),
        };
      }),
    [
      cardBases,
      diffsRead.currentData,
      diffsRead.isError,
      diffByRevision,
      personOf,
      ranges,
      rangeByUnitId,
    ],
  );

  const problems = useMemo(() => {
    const list: DraftProblem[] = [];
    const add = (code: string, message: string, blocks: boolean) =>
      list.push({ row: 'howMuch', code, message, source: 'client', blocks });
    for (const start of starts) {
      if (start.start === undefined && !start.undetermined)
        add('start-disagrees', draftCopy.problems.startDisagrees(start.slug), true);
    }
    if (endResolution.status === 'notFound')
      list.push({
        row: 'howMuch',
        code: 'end-not-found',
        message: draftCopy.problems.endNotFound(endResolution.slug),
        source: 'client',
        blocks: true,
        fix: { label: draftCopy.fixes.endAtLatest, patch: { end: null } },
      });
    if (carriesNothing(ranges))
      add('nothing-to-carry', draftCopy.problems.nothingToCarry, false);
    return list;
  }, [starts, endResolution, ranges]);

  const failed = lookupFailed || endTagRead.isError;
  const landed = revisionsLanded && endTagLanded;
  let reason: string | undefined;
  if (landed && !failed) {
    if (inScopeSpaceIds.length === 0) reason = draftCopy.undetermined.noScope;
    else if (startsUndetermined) reason = draftCopy.undetermined.noStart;
    else if (updateType === 'MergeUnits') reason = draftCopy.undetermined.mergeUnits;
  }
  let status: DraftDerivedStatus = 'loading';
  if (failed) status = 'failed';
  else if (reason !== undefined) status = 'undetermined';
  else if (landed) status = 'resolved';
  const retry = useRetry([
    baseUnitsRead,
    variantUnitsRead,
    startRead,
    rangeRead,
    endTagRead,
    // A card's diff that failed is an error in its item, not in the read.
    {
      isError: diffsRead.isError || (diffsRead.currentData ?? []).some(hasDiffError),
      isUninitialized: diffsRead.isUninitialized,
      refetch: diffsRead.refetch,
    },
  ]);

  return {
    status,
    reason,
    retry,
    cards,
    changeSets,
    ends,
    end: endResolution,
    suggestedEnd:
      endResolution.status === 'resolved' && !startsUndetermined
        ? suggestedEnd(endResolution.end, ends, cardBases)
        : undefined,
    starts,
    ranges,
    boundingRanges,
    foreignSpaceIds,
    basis,
    baseUnits,
    variantUnits,
    problems,
  };
}
