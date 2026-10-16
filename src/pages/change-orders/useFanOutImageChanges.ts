// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import type { LinkRead } from '@confighub/rtk-query';

import { fanOutLinkWhere, fanOutRevisionWhere } from '../x/apps/change-order/useFanOutSource';
import { linkedSourcePaths } from '../x/apps/change-order/linkedSourcePaths';
import {
  useGetFanOutSourceDiffQuery,
  useGetFanOutSourceLinksQuery,
  useGetFanOutSourceRevisionsQuery,
} from './changeOrderImageDiffApi';
import {
  EMPTY_FIELD_CHANGES,
  imageChangesFromUnitDiffs,
  narrowUnitDiffsToPaths,
  type ChangeOrderImageChanges,
} from './imageChange';

export interface UseFanOutImageChangesArgs {
  changeOrderId: string | undefined;
  startTagId: string | undefined;
  endTagId: string | undefined;
  inScopeSpaceIds: readonly string[] | undefined;
  /** `ChangeOrder.UpdateType`: only TransformPaths narrows the change to the paths its Links read. */
  updateType: string | undefined;
  /** True to make no request: the row is off screen. */
  skip?: boolean;
}

const LOADING: ChangeOrderImageChanges = Object.freeze({
  status: 'loading',
  images: [],
  fieldChanges: EMPTY_FIELD_CHANGES,
  unitCount: 0,
}) as ChangeOrderImageChanges;

const UNAVAILABLE: ChangeOrderImageChanges = Object.freeze({
  status: 'unavailable',
  images: [],
  fieldChanges: EMPTY_FIELD_CHANGES,
  unitCount: 0,
}) as ChangeOrderImageChanges;

/**
 * The image and version changes of a fan-out ChangeOrder (TransformPaths, Upsert, Insert), for a list row.
 *
 * Its change is made in source Units outside its own Space, which its two Tags mark, so the diff of its own
 * Space (`useChangeOrderImageChanges`) sees nothing. Three small reads, none of them tagged for refetching:
 * the Revisions the Tags mark outside the scope (which names the source Units), the in-scope Links that take
 * from them (which say which paths the change can carry), and the Units' diff from the start Tag to the end
 * Tag. The same where-clauses the detail page's `useFanOutSource` uses, but a diff instead of two downloads of
 * every Unit's configuration.
 *
 * Any read that fails is `unavailable`, never "No image change": a failure says nothing about what changed,
 * and without the Links the change cannot be narrowed to what reaches the Spaces it is promoted into.
 */
export function useFanOutImageChanges({
  changeOrderId,
  startTagId,
  endTagId,
  inScopeSpaceIds,
  updateType,
  skip = false,
}: UseFanOutImageChangesArgs): ChangeOrderImageChanges {
  const inScope = useMemo(() => [...(inScopeSpaceIds ?? [])].sort(), [inScopeSpaceIds]);
  const revisionWhere = useMemo(() => fanOutRevisionWhere(startTagId, endTagId, inScope), [startTagId, endTagId, inScope]);
  const named = changeOrderId !== undefined && changeOrderId !== '' && revisionWhere !== undefined;

  const revisions = useGetFanOutSourceRevisionsQuery({ where: revisionWhere ?? '' }, { skip: skip || !named });
  const unitIds = useMemo(
    () => [...new Set((revisions.currentData ?? []).map((r) => r.Revision?.UnitID).filter((id): id is string => id !== undefined))].sort(),
    [revisions.currentData],
  );

  const linkWhere = useMemo(() => fanOutLinkWhere(updateType, inScope, unitIds), [updateType, inScope, unitIds]);
  const links = useGetFanOutSourceLinksQuery({ where: linkWhere ?? '' }, { skip: skip || linkWhere === undefined });

  const diff = useGetFanOutSourceDiffQuery(
    { changeOrderId: changeOrderId ?? '', unitIds },
    { skip: skip || !named || unitIds.length === 0 },
  );

  const failed = revisions.isError || links.isError || diff.isError;
  const diffs = diff.currentData;
  const linkList = links.currentData;

  return useMemo(() => {
    if (!named && !skip) return UNAVAILABLE;
    if (failed) return UNAVAILABLE;
    if (revisions.currentData === undefined) return LOADING;
    // No Unit marked outside the scope: the Tags carry no source to read, which is not "nothing changed".
    if (unitIds.length === 0) return UNAVAILABLE;
    if (diffs === undefined) return LOADING;
    if (linkWhere !== undefined && linkList === undefined) return LOADING;

    const linksByUnitId = new Map<string, LinkRead[]>();
    for (const entry of linkList ?? []) {
      const link = entry.Link;
      if (link === undefined) continue;
      linksByUnitId.set(link.ToUnitID, [...(linksByUnitId.get(link.ToUnitID) ?? []), link]);
    }
    const pathsByUnitId = new Map<string, readonly string[] | undefined>();
    for (const unitId of unitIds) {
      pathsByUnitId.set(unitId, linkWhere === undefined ? undefined : linkedSourcePaths(linksByUnitId.get(unitId) ?? []));
    }
    return imageChangesFromUnitDiffs(narrowUnitDiffsToPaths(diffs, pathsByUnitId));
  }, [named, skip, failed, revisions.currentData, unitIds, diffs, linkWhere, linkList]);
}
