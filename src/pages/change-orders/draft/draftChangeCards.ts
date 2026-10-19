// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The changes waiting in a base Space since what its variants have taken, as the draft's
 * "How much" ribbon shows them: one card per change, the ChangeSets that bracket them, and
 * where the change can end.
 *
 * WHERE EACH UNIT'S CHANGE STARTS IS WHAT ITS VARIANTS HAVE TAKEN, read off each variant
 * Unit's `UpstreamRevisionNum` — the rule the server applies when the ChangeOrder is
 * created ("the start is the Revision each target has already taken"). Variants that
 * disagree on a Unit are not averaged: the server refuses that ChangeOrder, so the draft
 * names the Unit instead of guessing a start for it.
 *
 * REVISION NUMBERS ARE PER UNIT, so the cards are not numbered. A card is the Revisions one
 * author made as one change: the same author, ChangeSet and description, written within
 * `DRAFT_SAME_CHANGE_MS` of each other — a pipeline that moves two Units' image tags writes
 * one Revision per Unit, seconds apart.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type { ExtendedRevisionRead, UnitDiff } from '@confighub/rtk-query';

import { imageChangesFromUnitDiffs } from '../imageChange';
import type { DraftReadStatus, DraftUpdateType } from './draftTypes';

/**
 * How far apart in time the Revisions of one change may be.
 *
 * Wider than the ChangeOrder history's `HISTORY_SAME_WRITE_MS`, which joins the records of
 * one server transaction. These are separate writes the author's tooling makes, one per
 * Unit and seconds apart, and the same author, ChangeSet and description are what make them
 * one change; the window only stops a description reused days later from joining them.
 */
export const DRAFT_SAME_CHANGE_MS = 60_000;

/** The fields each read selects. */
export const DRAFT_BASE_UNIT_SELECT = 'UnitID,Slug,SpaceID,HeadRevisionNum';
export const DRAFT_VARIANT_UNIT_SELECT =
  'UnitID,Slug,SpaceID,UpstreamUnitID,UpstreamRevisionNum';
export const DRAFT_START_REVISION_SELECT = 'RevisionID,UnitID,RevisionNum,CreatedAt,Tags';
/** ChangeSetID is what `include` expands, so it has to be selected for the ChangeSet to come back. */
export const DRAFT_RANGE_REVISION_SELECT =
  'RevisionID,UnitID,RevisionNum,CreatedAt,UserID,Description,ChangeSetID,Tags';

/** The server's own suffix on a description, naming the functions that made the Revision. */
const FUNCTIONS_SUFFIX = /\s*\|\s*Functions:.*$/s;

/** The author's words: the description without the suffix the server adds for the functions it ran. */
export function authoredDescription(description: string | undefined): string {
  return (description ?? '').replace(FUNCTIONS_SUFFIX, '').trim();
}

// ---------------------------------------------------------------------------
// Inputs, as the reads return them
// ---------------------------------------------------------------------------

export interface DraftBaseUnit {
  unitId: string;
  slug: string;
  headRevisionNum: number;
}

export interface DraftVariantUnit {
  unitId: string;
  slug: string;
  spaceId: string;
  /** Absent for a Unit the variant made for itself. */
  upstreamUnitId: string | undefined;
  upstreamRevisionNum: number;
}

/** A Revision of the base, normalized from `ExtendedRevisionRead`. */
export interface DraftRevision {
  revisionId: string;
  unitId: string;
  revisionNum: number;
  createdAt: string;
  userId: string | undefined;
  description: string;
  changeSetId: string | undefined;
  /** The Tags that mark this Revision, by id. */
  tagIds: string[];
}

/** A ChangeSet of the base, from the Revisions' `ChangeSetID` expansion. */
export interface DraftChangeSet {
  changeSetId: string;
  slug: string;
  description: string;
  state: string | undefined;
  /** Set once it is closed: the Tag on each Unit's last Revision in it, and the end it offers. */
  endTagId: string | undefined;
  /** Closed with an end Tag: a valid end for the draft. */
  closed: boolean;
  /** The cards wholly made in it, in time order: what its bracket spans. */
  cardIds: string[];
}

export function draftRevisionOf(entry: ExtendedRevisionRead): DraftRevision | undefined {
  const revision = entry.Revision;
  if (
    revision?.RevisionID === undefined ||
    revision.UnitID === undefined ||
    revision.RevisionNum === undefined
  ) {
    return undefined;
  }
  return {
    revisionId: revision.RevisionID,
    unitId: revision.UnitID,
    revisionNum: revision.RevisionNum,
    createdAt: revision.CreatedAt ?? '',
    userId: revision.UserID || undefined,
    description: authoredDescription(revision.Description),
    changeSetId: revision.ChangeSetID || undefined,
    tagIds: Object.keys(revision.Tags ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Where each Unit's change starts
// ---------------------------------------------------------------------------

/**
 * The Revision a Unit's change starts after. The empty Revision every Unit begins with is
 * Revision 1, and a Link that has never merged records 0: the server reads the two as one
 * state, and so does this.
 */
export const FIRST_REVISION_NUM = 1;

export interface DraftUnitStart {
  unitId: string;
  slug: string;
  headRevisionNum: number;
  /**
   * The Revision the in-scope variants have taken. `undefined` when they disagree, or when
   * nothing says (`undetermined`).
   */
  start: number | undefined;
  /** In-scope variants that hold a copy of the Unit. */
  holderSpaceIds: string[];
  /** In-scope variants that hold none: a promotion clones the Unit into them. */
  missingSpaceIds: string[];
  /** Each holder's Revision, when they disagree. Empty when they agree. */
  disagreement: { spaceId: string; revisionNum: number }[];
  /**
   * No in-scope variant can say where the change starts: none is in scope, or every one takes
   * it from another Space. Never read as the Unit's beginning, which would be a guess.
   */
  undetermined: boolean;
}

/**
 * The variants in scope that hold a Unit whose upstream is not one of the base's Units: they
 * take the change from another Space, which has not taken it yet, so what they would hold is
 * not something the base's dry run can say, and neither is which Units they lack.
 */
export function foreignUpstreamSpaceIds(
  baseUnits: readonly DraftBaseUnit[],
  variantUnits: readonly DraftVariantUnit[],
  inScopeSpaceIds: readonly string[],
): Set<string> {
  const base = new Set(baseUnits.map((unit) => unit.unitId));
  const inScope = new Set(inScopeSpaceIds);
  const foreign = new Set<string>();
  for (const unit of variantUnits) {
    if (!inScope.has(unit.spaceId) || unit.upstreamUnitId === undefined) continue;
    if (!base.has(unit.upstreamUnitId)) foreign.add(unit.spaceId);
  }
  return foreign;
}

/**
 * Where each base Unit's change starts, over the variants in scope.
 *
 * A Unit no variant in scope holds starts at its first Revision, as the server starts it:
 * the promotion clones it at that Revision and replays the rest. A variant in
 * `foreignSpaceIds` is never counted as lacking a Unit: what it holds comes from elsewhere.
 */
export function deriveUnitStarts(
  baseUnits: readonly DraftBaseUnit[],
  variantUnits: readonly DraftVariantUnit[],
  inScopeSpaceIds: readonly string[],
  foreignSpaceIds: ReadonlySet<string> = new Set(),
): DraftUnitStart[] {
  const inScope = new Set(inScopeSpaceIds);
  const holdersByUpstream = new Map<string, DraftVariantUnit[]>();
  for (const unit of variantUnits) {
    if (!inScope.has(unit.spaceId) || unit.upstreamUnitId === undefined) continue;
    const list = holdersByUpstream.get(unit.upstreamUnitId) ?? [];
    list.push(unit);
    holdersByUpstream.set(unit.upstreamUnitId, list);
  }
  return baseUnits.map((unit) => {
    const holders = holdersByUpstream.get(unit.unitId) ?? [];
    const holderSpaceIds = [...new Set(holders.map((holder) => holder.spaceId))];
    const held = new Set(holderSpaceIds);
    const missingSpaceIds = inScopeSpaceIds.filter(
      (spaceId) => !held.has(spaceId) && !foreignSpaceIds.has(spaceId),
    );
    const taken = new Set(
      holders.map((holder) => Math.max(holder.upstreamRevisionNum, FIRST_REVISION_NUM)),
    );
    const disagreement =
      taken.size > 1
        ? holders
            .map((holder) => ({
              spaceId: holder.spaceId,
              revisionNum: holder.upstreamRevisionNum,
            }))
            .sort(
              (a, b) => a.revisionNum - b.revisionNum || a.spaceId.localeCompare(b.spaceId),
            )
        : [];
    // Held by none and missing from none: no variant in scope says anything about this Unit.
    const undetermined = holders.length === 0 && missingSpaceIds.length === 0;
    let start: number | undefined = FIRST_REVISION_NUM;
    if (taken.size > 1 || undetermined) start = undefined;
    else if (taken.size === 1) start = [...taken][0];
    return {
      unitId: unit.unitId,
      slug: unit.slug,
      headRevisionNum: unit.headRevisionNum,
      start,
      holderSpaceIds,
      missingSpaceIds,
      disagreement,
      undetermined,
    };
  });
}

/**
 * The Revision the ribbon lists a Unit's changes after: its start, or, where the variants
 * disagree, the earliest Revision any of them has taken — everything some variant still lacks.
 * `undefined` when the start is `undetermined`: nothing of that Unit is listed.
 */
export function listedStartOf(start: DraftUnitStart): number | undefined {
  if (start.start !== undefined) return start.start;
  if (start.undetermined) return undefined;
  return Math.min(
    ...start.disagreement.map((d) => Math.max(d.revisionNum, FIRST_REVISION_NUM)),
  );
}

/** Ids per `UnitID IN` clause: short enough for the query-string limit with the rest of a read. */
const UNITS_PER_READ = 50;

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}

const quotedIds = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(', ');

/**
 * The reads of each Unit's listed start Revision, for its time and its Tags. The two lists of a
 * read are not paired by the server, so one can return another Unit's Revision of the same
 * number; `startRevisionByUnitId` matches each row to its own Unit.
 */
export function startRevisionsWheres(starts: readonly DraftUnitStart[]): string[] {
  const listed = starts.filter((start) => listedStartOf(start) !== undefined);
  return chunked(listed, UNITS_PER_READ).map((chunk) => {
    const nums = [...new Set(chunk.map((start) => listedStartOf(start) as number))]
      .sort((a, b) => a - b)
      .join(', ');
    return `UnitID IN (${quotedIds(chunk.map((start) => start.unitId))}) AND RevisionNum IN (${nums})`;
  });
}

/**
 * The reads of the base's Revisions past each Unit's start.
 *
 * The Units the variants hold are read together from the earliest of their start Revisions on:
 * a Unit's Revisions are made in order, so none after its start is older than it. A Unit no
 * variant holds starts at its creation, so it is read on its own, by id, rather than pulling
 * every other Unit's read back to that time; so is a held Unit whose start Revision was not
 * found. The caller keeps, per Unit, only the Revisions past its start.
 */
export function rangeRevisionsWheres(
  baseSpaceId: string,
  starts: readonly DraftUnitStart[],
  startRevisions: ReadonlyMap<string, DraftRevision>,
): string[] {
  const waiting = starts.filter((start) => {
    const listed = listedStartOf(start);
    return listed !== undefined && listed < start.headRevisionNum;
  });
  const bounded: DraftRevision[] = [];
  const byId: string[] = [];
  for (const start of waiting) {
    const revision = startRevisions.get(start.unitId);
    if (
      start.holderSpaceIds.length > 0 &&
      revision !== undefined &&
      revision.createdAt !== ''
    ) {
      bounded.push(revision);
    } else {
      byId.push(start.unitId);
    }
  }
  const wheres: string[] = [];
  if (bounded.length > 0) {
    const earliest = bounded
      .map((revision) => revision.createdAt)
      .reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
    wheres.push(`SpaceID = '${baseSpaceId}' AND CreatedAt >= '${earliest}'`);
  }
  for (const chunk of chunked(byId, UNITS_PER_READ))
    wheres.push(`UnitID IN (${quotedIds(chunk)})`);
  return wheres;
}

/** The read of the Revisions an end Tag marks in the base, wherever they are. */
export function endTagRevisionsWhere(baseSpaceId: string, tagId: string): string {
  return `SpaceID = '${baseSpaceId}' AND Tags ? '${tagId}'`;
}

/** Each Unit's listed start Revision, matched to its own Unit out of the over-fetching read. */
export function startRevisionByUnitId(
  starts: readonly DraftUnitStart[],
  revisions: readonly DraftRevision[],
): Map<string, DraftRevision> {
  const wanted = new Map(starts.map((start) => [start.unitId, listedStartOf(start)]));
  const byUnit = new Map<string, DraftRevision>();
  for (const revision of revisions) {
    if (wanted.get(revision.unitId) === revision.revisionNum)
      byUnit.set(revision.unitId, revision);
  }
  return byUnit;
}

/** The Revisions of several reads as one list, each Revision once. */
export function uniqueRevisions(revisions: readonly DraftRevision[]): DraftRevision[] {
  const seen = new Set<string>();
  return revisions.filter((revision) => {
    if (seen.has(revision.revisionId)) return false;
    seen.add(revision.revisionId);
    return true;
  });
}

// ---------------------------------------------------------------------------
// The end, and what each Unit carries under it
// ---------------------------------------------------------------------------

/** The end, resolved: each Unit's head, or the Revisions one Tag marks. */
export type DraftResolvedEnd =
  | { kind: 'head' }
  | { kind: 'tag'; tagId: string; changeSet: DraftChangeSet };

/**
 * What one base Unit carries under the end. The reasons the server's `SkippedUnits` gives each
 * have one:
 * - `carries`: Revisions after the start, up to the end.
 * - `taken` (`AlreadyTaken`): the variants are at the end already; marked, carrying nothing.
 * - `takenPastEnd` (`TakenPastEnd`): the variants are past the end; not marked.
 * - `notMarked` (`NotMarked`): the end Tag marks none of its Revisions and the variants are
 *   not at its head: the Revisions after the start are somebody else's change.
 * - `notFollowed` (`NotFollowed`), `followedByOtherLinks` (`FollowedByOtherLinks`),
 *   `noStartRevision` (`NoStartRevision`): only the server can say these.
 * - `skipped`: the server passes it over for a reason not listed here.
 * - `disagrees`: the variants have taken different Revisions of it; the server refuses.
 * - `unknown`: what it carries could not be established — a MergeUnits change, whose Links
 *   are not read here, or a Unit the server carries that the Revisions read here do not.
 */
export type DraftUnitCarry =
  | 'carries'
  | 'taken'
  | 'takenPastEnd'
  | 'notMarked'
  | 'notFollowed'
  | 'followedByOtherLinks'
  | 'noStartRevision'
  | 'skipped'
  | 'disagrees'
  | 'unknown';

export interface DraftUnitRange {
  unitId: string;
  slug: string;
  start: number | undefined;
  /** The Revision the change ends at on this Unit, when it carries anything. */
  end: number | undefined;
  carry: DraftUnitCarry;
  /** In-scope variants the promotion clones this Unit into. Only for a Unit that carries. */
  cloneSpaceIds: string[];
  /** The Revision it ends at, for its data. Only for a Unit that carries. */
  endRevisionId: string | undefined;
  /** The Revision it starts from, when it was read. */
  startRevisionId: string | undefined;
}

/** What each base Unit carries under `end`, as far as the Revisions and the pointers say. */
export function deriveUnitRanges(input: {
  starts: readonly DraftUnitStart[];
  /** The base's Revisions past each Unit's start. */
  revisions: readonly DraftRevision[];
  startRevisions: ReadonlyMap<string, DraftRevision>;
  end: DraftResolvedEnd;
  /** With a Tag end: every Revision of the base the Tag marks, before the start or after it. */
  endTagRevisions?: readonly DraftRevision[];
  updateType: DraftUpdateType;
}): DraftUnitRange[] {
  const { starts, revisions, startRevisions, end, endTagRevisions = [], updateType } = input;
  const revisionsByUnit = new Map<string, DraftRevision[]>();
  for (const revision of revisions) {
    const list = revisionsByUnit.get(revision.unitId) ?? [];
    list.push(revision);
    revisionsByUnit.set(revision.unitId, list);
  }
  const tagged = new Map<string, DraftRevision>();
  if (end.kind === 'tag') {
    for (const revision of [...endTagRevisions, ...revisions]) {
      if (revision.tagIds.includes(end.tagId)) tagged.set(revision.unitId, revision);
    }
  }
  return starts.map((start): DraftUnitRange => {
    const none = {
      unitId: start.unitId,
      slug: start.slug,
      start: start.start,
      cloneSpaceIds: [] as string[],
      startRevisionId: startRevisions.get(start.unitId)?.revisionId,
      endRevisionId: undefined,
    };
    // A MergeUnits change starts where its Links have merged, which the Units do not record.
    if (updateType === 'MergeUnits' || start.undetermined)
      return { ...none, end: undefined, carry: 'unknown' };
    if (start.start === undefined) return { ...none, end: undefined, carry: 'disagrees' };
    const from = start.start;
    let endRevision: DraftRevision | undefined;
    if (end.kind === 'head') {
      if (start.headRevisionNum <= from) return { ...none, end: from, carry: 'taken' };
      endRevision = (revisionsByUnit.get(start.unitId) ?? []).find(
        (revision) => revision.revisionNum === start.headRevisionNum,
      );
    } else {
      endRevision = tagged.get(start.unitId);
      if (endRevision === undefined) {
        if (start.headRevisionNum <= from) return { ...none, end: from, carry: 'taken' };
        return { ...none, end: undefined, carry: 'notMarked' };
      }
      if (endRevision.revisionNum === from) return { ...none, end: from, carry: 'taken' };
      if (endRevision.revisionNum < from)
        return { ...none, end: undefined, carry: 'takenPastEnd' };
    }
    return {
      ...none,
      end: endRevision?.revisionNum ?? start.headRevisionNum,
      carry: 'carries',
      cloneSpaceIds: [...start.missingSpaceIds],
      endRevisionId: endRevision?.revisionId,
    };
  });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export interface DraftCardRevision {
  revisionId: string;
  unitId: string;
  unitSlug: string;
  revisionNum: number;
  createdAt: string;
}

/** One part of a card's summary line: monospace for names and values, plain for the words between. */
export interface DraftSummaryPart {
  text: string;
  mono: boolean;
}

export interface DraftCardSummary {
  /** `loading` until the card's diffs are in; `failed` when one could not be read. */
  status: DraftReadStatus;
  /** Empty unless `resolved`. Empty and `resolved` is a change the diff shows nothing for. */
  parts: DraftSummaryPart[];
}

/** One change waiting in the base. */
export interface DraftChangeCardBase {
  /** The first Revision's id: stable while the change is. */
  cardId: string;
  revisions: DraftCardRevision[];
  userId: string | undefined;
  /** When the change was made: its first Revision's time. */
  at: string;
  /** The author's words, the server's functions suffix removed. */
  description: string;
  changeSetId: string | undefined;
}

/**
 * Group the base's Revisions past each Unit's start into changes, oldest first.
 *
 * A Revision joins the card before it when it is the same author's, in the same ChangeSet
 * (or none), with the same description, within `DRAFT_SAME_CHANGE_MS` of that card's last
 * Revision, and of a Unit the card does not hold yet — two Revisions of one Unit are two
 * changes to it.
 */
export function buildChangeCards(
  revisions: readonly DraftRevision[],
  starts: readonly DraftUnitStart[],
  unitSlugById: ReadonlyMap<string, string>,
): DraftChangeCardBase[] {
  // Where variants disagree, every Revision some variant still lacks is listed: the ribbon shows
  // what is waiting, and the disagreement is reported on its own.
  const startByUnit = new Map(starts.map((start) => [start.unitId, listedStartOf(start)]));
  const waiting = revisions
    .filter((revision) => {
      const start = startByUnit.get(revision.unitId);
      return start !== undefined && revision.revisionNum > start;
    })
    .sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        (unitSlugById.get(a.unitId) ?? '').localeCompare(unitSlugById.get(b.unitId) ?? '') ||
        a.revisionNum - b.revisionNum,
    );
  const cards: (DraftChangeCardBase & { lastAt: number })[] = [];
  for (const revision of waiting) {
    const at = Date.parse(revision.createdAt);
    const previous = cards[cards.length - 1];
    const joins =
      previous !== undefined &&
      previous.userId === revision.userId &&
      previous.changeSetId === revision.changeSetId &&
      previous.description === revision.description &&
      at - previous.lastAt <= DRAFT_SAME_CHANGE_MS &&
      previous.revisions.every((r) => r.unitId !== revision.unitId);
    const entry: DraftCardRevision = {
      revisionId: revision.revisionId,
      unitId: revision.unitId,
      unitSlug: unitSlugById.get(revision.unitId) ?? '',
      revisionNum: revision.revisionNum,
      createdAt: revision.createdAt,
    };
    if (joins) {
      previous.revisions.push(entry);
      previous.lastAt = at;
      continue;
    }
    cards.push({
      cardId: revision.revisionId,
      revisions: [entry],
      userId: revision.userId,
      at: revision.createdAt,
      description: revision.description,
      changeSetId: revision.changeSetId,
      lastAt: at,
    });
  }
  return cards.map((card) => ({
    cardId: card.cardId,
    revisions: card.revisions,
    userId: card.userId,
    at: card.at,
    description: card.description,
    changeSetId: card.changeSetId,
  }));
}

/**
 * True when every range is known and none carries a Revision: the draft has nothing waiting to
 * promote. A range nobody could establish might carry, so it keeps this false.
 */
export function carriesNothing(ranges: readonly DraftUnitRange[]): boolean {
  return (
    ranges.length > 0 &&
    ranges.every((range) => range.carry !== 'carries' && range.carry !== 'unknown')
  );
}

/**
 * Whether a card is inside the change as it now ends: all of it, none of it, part (a Tag that
 * marks one of its Units and not another), or `unknown` while the end has not resolved or a
 * Unit's range could not be established.
 */
export type DraftCardInclusion = 'all' | 'none' | 'some' | 'unknown';

export function cardInclusion(
  card: DraftChangeCardBase,
  ranges: ReadonlyMap<string, DraftUnitRange>,
): DraftCardInclusion {
  const inside: boolean[] = [];
  for (const revision of card.revisions) {
    const range = ranges.get(revision.unitId);
    if (range === undefined || range.carry === 'unknown') return 'unknown';
    inside.push(
      range.carry === 'carries' &&
        range.end !== undefined &&
        revision.revisionNum <= range.end,
    );
  }
  if (inside.every(Boolean)) return 'all';
  if (inside.some(Boolean)) return 'some';
  return 'none';
}

/**
 * The ChangeSets the waiting Revisions were made in, each with the cards it wholly holds.
 * Only the ChangeSet the read expanded is known; one it did not is left out rather than named
 * by its id.
 */
export function changeSetsOfRevisions(
  entries: readonly ExtendedRevisionRead[],
  cards: readonly DraftChangeCardBase[],
): DraftChangeSet[] {
  const byId = new Map<string, DraftChangeSet>();
  for (const entry of entries) {
    const changeSet = entry.ChangeSet;
    const changeSetId = entry.Revision?.ChangeSetID ?? changeSet?.ChangeSetID;
    if (changeSetId === undefined || changeSet === undefined || byId.has(changeSetId))
      continue;
    const endTagId = changeSet.EndTagID || undefined;
    byId.set(changeSetId, {
      changeSetId,
      slug: changeSet.Slug,
      description: changeSet.Description ?? '',
      state: changeSet.State,
      endTagId,
      closed: changeSet.State === 'Closed' && endTagId !== undefined,
      cardIds: [],
    });
  }
  for (const card of cards) {
    if (card.changeSetId === undefined) continue;
    byId.get(card.changeSetId)?.cardIds.push(card.cardId);
  }
  return [...byId.values()].filter((changeSet) => changeSet.cardIds.length > 0);
}

/** An end the draft can take: each Unit's head, or a closed ChangeSet's end Tag. */
export type DraftEndOption =
  | { kind: 'head' }
  | { kind: 'changeSet'; changeSet: DraftChangeSet };

/**
 * The cards an end option changes: for a ChangeSet, those after its last card (it leaves them
 * out); for the latest, those the current end leaves out (it takes them in). Oldest first, as
 * the cards are.
 */
export function cardsAffectedBy<T extends { cardId: string; inclusion: DraftCardInclusion }>(
  option: DraftEndOption,
  cards: readonly T[],
): T[] {
  if (option.kind === 'head') return cards.filter((card) => card.inclusion === 'none');
  const ids = new Set(option.changeSet.cardIds);
  const last = cards.reduce(
    (found, card, index) => (ids.has(card.cardId) ? index : found),
    -1,
  );
  return cards.slice(last + 1);
}

/** Head first, then each closed ChangeSet, in the order its first card was made. */
export function validEnds(
  changeSets: readonly DraftChangeSet[],
  cards: readonly DraftChangeCardBase[],
): DraftEndOption[] {
  const order = new Map(cards.map((card, index) => [card.cardId, index]));
  const firstIndex = (changeSet: DraftChangeSet) =>
    Math.min(...changeSet.cardIds.map((id) => order.get(id) ?? Number.MAX_SAFE_INTEGER));
  return [
    { kind: 'head' },
    ...changeSets
      .filter((changeSet) => changeSet.closed)
      .sort((a, b) => firstIndex(a) - firstIndex(b))
      .map((changeSet): DraftEndOption => ({ kind: 'changeSet', changeSet })),
  ];
}

/**
 * The one-click end to offer beside the ribbon. Ending at the head, it is the latest closed
 * ChangeSet that leaves some card out — the work that is finished, without what is still
 * being made; ending at a ChangeSet, it is the head, when the head has more.
 */
export function suggestedEnd(
  current: DraftResolvedEnd,
  options: readonly DraftEndOption[],
  cards: readonly DraftChangeCardBase[],
): DraftEndOption | undefined {
  if (current.kind === 'tag') {
    return current.changeSet.cardIds.length < cards.length ? { kind: 'head' } : undefined;
  }
  const changeSets = options.filter(
    (option): option is Extract<DraftEndOption, { kind: 'changeSet' }> =>
      option.kind === 'changeSet' && option.changeSet.cardIds.length < cards.length,
  );
  return changeSets[changeSets.length - 1];
}

// ---------------------------------------------------------------------------
// A card's summary line
// ---------------------------------------------------------------------------

/** At most this many changes are named on a card; the rest is a count. */
const SUMMARY_CHANGE_LIMIT = 3;

/** `spec.template.spec.containers.?name=api.resources.limits.memory` names the container `api`. */
const CONTAINER_IN_PATH =
  /(?:^|\.)(?:containers|initContainers|ephemeralContainers)\.\?name=([^.;]+)/g;

function containerInPath(path: string): string | undefined {
  let found: string | undefined;
  for (const match of path.matchAll(CONTAINER_IN_PATH)) found = match[1];
  return found;
}

/** The last segment of a short label: `resources.limits.memory` is `memory`. */
const leafOf = (label: string) => label.slice(label.lastIndexOf('.') + 1) || label;

/**
 * A card's summary from the diffs of its Revisions, each from the Revision before it:
 * the containers whose image tag moves, with the tag they move to (`api → 1.15.0`), then each
 * other field with the value it takes (`api memory 768Mi`, `RETRY_LIMIT 5`). The same reader
 * as the hero (`imageChangesFromUnitDiffs`) decides what an image change is.
 */
export function cardSummaryOf(
  diffs: readonly UnitDiff[] | undefined,
  failed: boolean,
): DraftCardSummary {
  if (failed) return { status: 'failed', parts: [] };
  if (diffs === undefined) return { status: 'loading', parts: [] };
  const changes = imageChangesFromUnitDiffs(diffs);
  if (changes.status === 'unavailable') return { status: 'failed', parts: [] };

  const lines: DraftSummaryPart[][] = [];
  const byTag = new Map<string, string[]>();
  for (const image of changes.images) {
    const tag = image.to.tag ?? image.to.digest ?? image.to.ref;
    const names = byTag.get(tag) ?? [];
    if (!names.includes(image.containerName)) names.push(image.containerName);
    byTag.set(tag, names);
  }
  for (const [tag, names] of byTag) {
    lines.push([
      ...names.map((name) => ({ text: name, mono: true })),
      { text: '→', mono: false },
      { text: tag, mono: true },
    ]);
  }
  for (const detail of changes.fieldChanges.details) {
    const container = containerInPath(detail.path);
    const line: DraftSummaryPart[] = [];
    if (container !== undefined) line.push({ text: container, mono: true });
    line.push({ text: leafOf(detail.label), mono: true });
    if (detail.to !== '') line.push({ text: detail.to, mono: true });
    lines.push(line);
  }
  const named = lines.slice(0, SUMMARY_CHANGE_LIMIT);
  const parts = named.flatMap((line, index) =>
    index === 0 ? line : [{ text: '·', mono: false }, ...line],
  );
  const total =
    changes.images.length > 0
      ? byTag.size + changes.fieldChanges.count
      : changes.fieldChanges.count;
  if (total > named.length) parts.push({ text: `+${total - named.length}`, mono: false });
  return { status: 'resolved', parts };
}

/** The per-Revision diffs a card's summary reads: each Revision from the one before it. */
export function cardDiffItems(
  card: DraftChangeCardBase,
): { unitId: string; from: string; to: string }[] {
  return card.revisions.map((revision) => ({
    unitId: revision.unitId,
    from: String(revision.revisionNum - 1),
    to: String(revision.revisionNum),
  }));
}
