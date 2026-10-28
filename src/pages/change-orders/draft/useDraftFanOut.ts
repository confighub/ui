// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useListAllChangeSetsQuery, useListAllRevisionsQuery, useListAllUnitsQuery } from '@confighub/rtk-query';

import type { DraftAddress, DraftDecisions } from './draftDecisions';
import {
  type DraftFanOut,
  type DraftFanOutAvailability,
  type DraftFanOutChangeSet,
  type DraftFanOutLink,
  type DraftFanOutRevision,
  type DraftFanOutType,
  type DraftFanOutUnit,
  fanOutAvailability,
  fanOutLinkOf,
  fanOutOffered,
  isFanOutType,
  resolveFanOutDraft,
} from './draftFanOut';
import { useListDraftFanOutLinksQuery } from './draftFanOutApi';
import type { DraftReadStatus, DraftVariant } from './draftTypes';
import { useRetry } from './useRetry';

export interface DraftFanOutRead {
  /** `undefined` unless the draft is a Transform paths one, and what it is worked out of is read. */
  fanOut: DraftFanOut | undefined;
  /** Whether the kind is offered for the scope: some variant in it reads a shared source. */
  offered: DraftFanOutAvailability;
  availability: Readonly<Record<DraftFanOutType, DraftFanOutAvailability>>;
  status: DraftReadStatus;
  retry: () => void;
}

const quoted = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(', ');

const NO_REVISIONS: DraftFanOutRevision[] = [];
const NO_CHANGE_SETS: DraftFanOutChangeSet[] = [];

/**
 * A Transform paths draft's decisions (`resolveFanOutDraft`), from what they are worked out of:
 * the variants' fan-out Links (read for every draft: they decide whether the kind is offered at
 * all), and, for a Transform paths draft, the source Units they read, those sources' Revisions
 * after what the variants have taken, and the closed ChangeSets in the sources' Spaces.
 */
export function useDraftFanOut(args: {
  address: DraftAddress;
  decisions: DraftDecisions | undefined;
  variants: readonly DraftVariant[];
}): DraftFanOutRead {
  const { address, decisions, variants } = args;
  const kind = decisions?.kind.value;
  const chosen = kind === 'transformPaths';
  const scopeIds = useMemo(() => decisions?.scope.value ?? [], [decisions]);
  const variantIds = useMemo(() => variants.map((variant) => variant.spaceId), [variants]);

  const linksRead = useListDraftFanOutLinksQuery({ spaceIds: variantIds }, { skip: variantIds.length === 0 });
  const links = useMemo(
    () =>
      linksRead.currentData === undefined
        ? undefined
        : linksRead.currentData.flatMap((entry): DraftFanOutLink[] => {
            const link = fanOutLinkOf(entry.Link);
            return link === undefined ? [] : [link];
          }),
    [linksRead.currentData],
  );
  const availability = useMemo(() => fanOutAvailability(links, scopeIds), [links, scopeIds]);

  // The sources every fan-out type in scope could read: read once, whichever type is chosen.
  const followedAll = useMemo(() => {
    if (links === undefined) return [];
    const inScope = new Set(scopeIds);
    return links.filter((link) => isFanOutType(link.updateType) && inScope.has(link.spaceId) && link.toSpaceId !== link.spaceId && !inScope.has(link.toSpaceId));
  }, [links, scopeIds]);
  const sourceIds = useMemo(() => [...new Set(followedAll.map((link) => link.toUnitId))].sort(), [followedAll]);
  const lowest = useMemo(() => Math.min(...followedAll.map((link) => link.lastMergedRevisionNum), Number.MAX_SAFE_INTEGER), [followedAll]);
  const readSources = chosen && sourceIds.length > 0;

  const unitsRead = useListAllUnitsQuery(
    { where: `UnitID IN (${quoted(sourceIds)})`, select: 'UnitID,Slug,SpaceID,SpaceSlug,HeadRevisionNum' },
    { skip: !readSources },
  );
  const units = useMemo(
    () =>
      new Map(
        (unitsRead.currentData ?? []).flatMap((entry): [string, DraftFanOutUnit][] => {
          const unit = entry.Unit;
          if (unit?.UnitID === undefined || unit.SpaceID === undefined) return [];
          return [[unit.UnitID, { unitId: unit.UnitID, slug: unit.Slug, spaceId: unit.SpaceID, spaceSlug: unit.SpaceSlug ?? '', headRevisionNum: unit.HeadRevisionNum ?? 0 }]];
        }),
      ),
    [unitsRead.currentData],
  );
  const sourceSpaceIds = useMemo(() => [...new Set([...units.values()].map((unit) => unit.spaceId))].sort(), [units]);

  const revisionsRead = useListAllRevisionsQuery(
    { where: `UnitID IN (${quoted(sourceIds)}) AND RevisionNum > ${lowest === Number.MAX_SAFE_INTEGER ? 0 : lowest}`, select: 'RevisionID,UnitID,RevisionNum,Description,CreatedAt,Tags' },
    { skip: !readSources },
  );
  const revisions = useMemo(
    () =>
      revisionsRead.currentData === undefined
        ? NO_REVISIONS
        : revisionsRead.currentData.flatMap((entry): DraftFanOutRevision[] => {
            const revision = entry.Revision;
            if (revision?.RevisionID === undefined || revision.UnitID === undefined) return [];
            return [
              {
                revisionId: revision.RevisionID,
                unitId: revision.UnitID,
                revisionNum: revision.RevisionNum ?? 0,
                description: revision.Description ?? '',
                createdAt: revision.CreatedAt,
                tagIds: Object.keys(revision.Tags ?? {}),
              },
            ];
          }),
    [revisionsRead.currentData],
  );

  const changeSetsRead = useListAllChangeSetsQuery({ where: `SpaceID IN (${quoted(sourceSpaceIds)})` }, { skip: !chosen || sourceSpaceIds.length === 0 });
  const changeSets = useMemo(
    () =>
      changeSetsRead.currentData === undefined
        ? NO_CHANGE_SETS
        : changeSetsRead.currentData.flatMap((entry): DraftFanOutChangeSet[] => {
            const changeSet = entry.ChangeSet;
            // Closed: its end Tag is placed, so it names a Revision of each Unit it touched.
            if (changeSet?.EndTagID === undefined || changeSet.EndTagID === '' || changeSet.SpaceID === undefined) return [];
            return [{ slug: changeSet.Slug, spaceId: changeSet.SpaceID, spaceSlug: changeSet.SpaceSlug ?? '', endTagId: changeSet.EndTagID, description: changeSet.Description ?? '' }];
          }),
    [changeSetsRead.currentData],
  );

  const template = decisions?.template.kind === 'changeOrder' ? decisions.template.changeOrder : undefined;
  const sourcesPending = readSources && (unitsRead.currentData === undefined || revisionsRead.currentData === undefined);
  const fanOut = useMemo(() => {
    if (!chosen || decisions === undefined || sourcesPending) return undefined;
    return resolveFanOutDraft({
      address,
      last: template !== undefined && isFanOutType(template.updateType) ? template : undefined,
      links,
      scopeIds,
      variants,
      units,
      revisions,
      changeSets,
    });
  }, [chosen, decisions, sourcesPending, address, template, links, scopeIds, variants, units, revisions, changeSets]);

  const retry = useRetry([linksRead, unitsRead, revisionsRead, changeSetsRead]);
  const failed = linksRead.isError || (chosen && (unitsRead.isError || revisionsRead.isError || changeSetsRead.isError));
  let status: DraftReadStatus = 'resolved';
  if (failed) status = 'failed';
  else if (chosen && (links === undefined || sourcesPending)) status = 'loading';
  return { fanOut, offered: linksRead.isError ? 'unknown' : fanOutOffered(availability), availability, status, retry };
}
