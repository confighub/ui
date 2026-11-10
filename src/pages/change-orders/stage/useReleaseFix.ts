// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The reads and the action behind a fix made outside the ChangeOrder (`stageFix.ts`).
 *
 * `useChangeMarks` reads, for the Spaces of a stage the change reached, the Revisions the
 * ChangeOrder's release Tag and end Tag mark, and the Releases published at the release
 * Tag. The stale-problem filter and the "Release the fix" offer both read them.
 *
 * `useReleaseFix` runs the offer: it moves the release Tag as
 * `cub unit tag ChangeOrder:<slug> --move --revision <n>` does, and then releases the
 * Spaces it moved in exactly as "Release again" does. Nothing moves until the person
 * confirms, and only to the Revisions the confirm showed.
 */

import { useCallback, useMemo, useState } from 'react';

import { useBulkTagUnitsMutation, useListAllReleasesQuery } from '@confighub/rtk-query';

import { getApiErrorMessage } from '@/utility/error-functions';
import type { ChangeOrderActionResult } from '../../x/apps/change-order/useChangeOrderActions';
import { taggedRevisionWheres } from '../../x/apps/change-order/taggedRevisionReads';
import { useGetTaggedRevisionsQuery } from '../../x/apps/change-order/taggedRevisionsApi';
import { releaseFixCopy, unitName } from './releaseFixCopy';
import { moveOutcome, moveRequestsOf, sameFix, type ChangeMarks, type FixSpace, type ReleaseFix, type TagMark } from './stageFix';
import type { OutcomeFocusTarget } from './useOutcomeFocus';

const NO_MARKS: ChangeMarks = { release: new Map(), end: new Map() };
const NO_SPACES: ReadonlySet<string> = new Set();

const quoted = (ids: readonly string[]) =>
  [...ids]
    .sort()
    .map((id) => `'${id}'`)
    .join(', ');

export interface UseChangeMarksArgs {
  releaseTagId: string | undefined;
  endTagId: string | undefined;
  /** The stage's Spaces the change reached or is released in. Empty: nothing is read. */
  spaceIds: readonly string[];
  /** The Spaces a release publishes, for the Releases already published at the Tag. */
  releaseSpaceIds: readonly string[];
  /** Read only once the change has arrived in the stage. */
  enabled: boolean;
}

export interface ChangeMarksRead {
  marks: ChangeMarks;
  /** Spaces where a Release was published at the release Tag: its marks there are fixed. */
  releasedAtTagSpaceIds: ReadonlySet<string>;
  /** Both reads have answered. Until then, and when either fails, nothing is offered. */
  ready: boolean;
  /** Either read failed: what the card says it could not decide is said with this. */
  error: unknown;
  refetch: () => void;
}

/** Each Unit's mark, the highest Revision when a Tag marks more than one, as the server's `RevisionsMarkedBy` keeps it. */
function keepHighest(map: Map<string, TagMark>, unitId: string, mark: TagMark) {
  const had = map.get(unitId);
  if (had === undefined || mark.revisionNum > had.revisionNum) map.set(unitId, mark);
}

export function useChangeMarks(args: UseChangeMarksArgs): ChangeMarksRead {
  const { releaseTagId, endTagId, spaceIds, releaseSpaceIds, enabled } = args;
  // A ChangeOrder with no release Tag still has an end Tag.
  const wheres = useMemo(() => {
    if (!enabled || endTagId === undefined) return undefined;
    return taggedRevisionWheres(releaseTagId ?? endTagId, endTagId, { in: spaceIds });
  }, [enabled, releaseTagId, endTagId, spaceIds]);
  /*
   * Not `live`: that reads every page again on each Revision write anywhere, and a write
   * moves no mark. What moves one is this page's own move (read again after it), a
   * promotion (which enables the read), or the resolve processor, which no write here
   * would announce either. Read again on each visit to the stage instead.
   */
  const revisions = useGetTaggedRevisionsQuery(
    { wheres: wheres ?? [], select: 'RevisionID,UnitID,SpaceID,RevisionNum,Tags,ValidationErrors' },
    { skip: wheres === undefined, refetchOnMountOrArgChange: true },
  );
  const releaseWhere =
    enabled && releaseTagId !== undefined && releaseSpaceIds.length > 0
      ? `TagID = '${releaseTagId}' AND SpaceID IN (${quoted(releaseSpaceIds)})`
      : undefined;
  const releases = useListAllReleasesQuery({ where: releaseWhere ?? '' }, { skip: releaseWhere === undefined });

  const marks = useMemo((): ChangeMarks => {
    if (revisions.currentData === undefined) return NO_MARKS;
    const release = new Map<string, TagMark>();
    const end = new Map<string, TagMark>();
    for (const row of revisions.currentData) {
      const revision = row.Revision;
      if (revision?.UnitID === undefined || revision.RevisionNum === undefined || revision.RevisionID === undefined) continue;
      const mark = {
        revisionNum: revision.RevisionNum,
        revisionId: revision.RevisionID,
        gated: Object.keys(revision.ValidationErrors ?? {}).length > 0,
      };
      const tags = revision.Tags ?? {};
      if (releaseTagId !== undefined && releaseTagId in tags) keepHighest(release, revision.UnitID, mark);
      if (endTagId !== undefined && endTagId in tags) keepHighest(end, revision.UnitID, mark);
    }
    return { release, end };
  }, [revisions.currentData, releaseTagId, endTagId]);

  const releasedAtTagSpaceIds = useMemo(() => {
    const ids = (releases.currentData ?? []).map((r) => r.Release?.SpaceID).filter((id): id is string => id !== undefined);
    return ids.length === 0 ? NO_SPACES : new Set(ids);
  }, [releases.currentData]);

  const refetchRevisions = revisions.refetch;
  const refetchReleases = releases.refetch;
  const revisionsSkipped = wheres === undefined;
  const releasesSkipped = releaseWhere === undefined;
  const refetch = useCallback(() => {
    if (!revisionsSkipped) void refetchRevisions();
    if (!releasesSkipped) void refetchReleases();
  }, [revisionsSkipped, releasesSkipped, refetchRevisions, refetchReleases]);

  return {
    marks,
    releasedAtTagSpaceIds,
    ready: revisions.currentData !== undefined && (releasesSkipped || releases.currentData !== undefined),
    error: (revisionsSkipped ? undefined : revisions.error) ?? (releasesSkipped ? undefined : releases.error),
    refetch,
  };
}

/** What the confirm says after Confirm, when it stays open. */
export interface ReleaseFixOutcome {
  /** The Spaces that were released, when others were not. */
  released?: string;
  /** What was not done, and why. */
  failed: string[];
}

export interface UseReleaseFixArgs {
  offer: ReleaseFix | undefined;
  releaseTagId: string | undefined;
  stageName: string;
  nameOfSpace: (spaceId: string) => string;
  /** Publishes the Spaces as "Release again" does, the box steady meanwhile; `quiet` leaves the outcome to the caller. */
  releaseTo: (spaceIds: string[], options?: { quiet?: boolean }) => Promise<ChangeOrderActionResult>;
  announce: (text: string) => void;
  focusAfter: (target: OutcomeFocusTarget) => void;
  /** Reads the marks again once the Tag has moved: the move writes no Revision, so nothing else refreshes them. */
  refetchMarks: () => void;
}

export interface ReleaseFixControl {
  /** What can be offered now. */
  offer: ReleaseFix | undefined;
  /** What the open confirm shows: the offer as it was when it was opened, or reviewed again. */
  shown: ReleaseFix | undefined;
  /** The offer changed since the confirm showed it: Confirm is off until it is reviewed again. */
  stale: boolean;
  open: () => void;
  close: () => void;
  reviewAgain: () => void;
  confirm: () => Promise<void>;
  working: boolean;
  outcome: ReleaseFixOutcome | undefined;
  releaseTagId: string | undefined;
}

export function useReleaseFix(args: UseReleaseFixArgs): ReleaseFixControl {
  const { offer, releaseTagId, stageName, nameOfSpace, releaseTo, announce, focusAfter, refetchMarks } = args;
  const [bulkTag] = useBulkTagUnitsMutation();
  const [shown, setShown] = useState<ReleaseFix | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState<ReleaseFixOutcome | undefined>(undefined);

  const open = useCallback(() => {
    setOutcome(undefined);
    setShown(offer);
  }, [offer]);
  const close = useCallback(() => {
    if (working) return;
    setShown(undefined);
    setOutcome(undefined);
  }, [working]);
  // Nothing left to offer: there is nothing to review, so the confirm closes.
  const reviewAgain = offer === undefined ? close : open;

  /** Moves the Tag in one Space, to the Revisions shown: '' when every Unit moved, else why not. */
  const moveIn = useCallback(
    async (space: FixSpace, tagId: string): Promise<string> => {
      const spaceName = nameOfSpace(space.spaceId);
      const nameOf = (unitId: string) => unitName(spaceName, space.units.find((u) => u.unitId === unitId)?.slug ?? unitId);
      const reasons: string[] = [];
      // The server moves the Tag Unit by Unit, so a refusal can leave it moved on others.
      const moved: string[] = [];
      for (const request of moveRequestsOf(space, tagId)) {
        try {
          const items = await bulkTag({ where: request.where, unitTagRequest: request.unitTagRequest }).unwrap();
          const result = moveOutcome(request.unitIds, items ?? []);
          moved.push(...result.moved);
          reasons.push(...result.errors);
          if (result.missing.length > 0) reasons.push(releaseFixCopy.noAnswer(result.missing.map(nameOf)));
        } catch (error) {
          reasons.push(getApiErrorMessage(error, 'the request failed'));
        }
      }
      if (reasons.length === 0) return '';
      const notMoved = space.units.filter((u) => !moved.includes(u.unitId)).map((u) => nameOf(u.unitId));
      return moved.length === 0
        ? releaseFixCopy.notMoved(spaceName, reasons.join(' '))
        : releaseFixCopy.partlyMoved(spaceName, moved.map(nameOf), notMoved, reasons.join(' '));
    },
    [bulkTag, nameOfSpace],
  );

  const confirm = useCallback(async () => {
    if (shown === undefined || releaseTagId === undefined) return;
    setWorking(true);
    setOutcome(undefined);
    const failed: string[] = [];
    try {
      // A Space with any Unit not moved is not released: its release would bundle the old Revision.
      const moved: FixSpace[] = [];
      for (const space of shown.spaces) {
        const why = await moveIn(space, releaseTagId);
        if (why === '') moved.push(space);
        else failed.push(why);
      }
      if (moved.length > 0) refetchMarks();
      let released: string[] = [];
      if (moved.length > 0) {
        const result = await releaseTo(
          moved.map((s) => s.spaceId),
          { quiet: true },
        );
        if (result.ok) {
          released = moved.map((s) => s.spaceId);
        } else {
          const failedIds = new Set((result.failedSpaces ?? []).map((f) => f.spaceId));
          // A release that names no Space failed everywhere it was sent.
          const notReleased = failedIds.size === 0 ? moved : moved.filter((s) => failedIds.has(s.spaceId));
          released = moved.filter((s) => !notReleased.includes(s)).map((s) => s.spaceId);
          const details = (result.failedSpaces ?? []).map((f) => `${nameOfSpace(f.spaceId)}: ${f.message}`);
          failed.push(releaseFixCopy.movedReleaseFailed(notReleased.map((s) => nameOfSpace(s.spaceId)), [result.message, ...details].join(' ')));
        }
      }
      if (failed.length > 0) {
        const releasedText = released.length === 0 ? undefined : releaseFixCopy.releasedIn(released.map(nameOfSpace));
        announce([releasedText, ...failed].filter((t) => t !== undefined).join(' '));
        setOutcome({ ...(releasedText === undefined ? {} : { released: releasedText }), failed });
        return;
      }
      announce(releaseFixCopy.released(stageName));
      setShown(undefined);
      focusAfter('heading');
    } finally {
      setWorking(false);
    }
  }, [shown, releaseTagId, moveIn, refetchMarks, releaseTo, announce, stageName, focusAfter, nameOfSpace]);

  const stale = shown !== undefined && outcome === undefined && !working && !sameFix(shown, offer);
  return { offer, shown, stale, open, close, reviewAgain, confirm, working, outcome, releaseTagId };
}
