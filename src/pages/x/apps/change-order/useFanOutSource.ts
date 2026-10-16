// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Where a fan-out ChangeOrder's change was made: the Units outside its scope that it
 * takes from, each with the configuration it held before the change and after it.
 *
 * A TransformPaths, Upsert or Insert ChangeOrder is promoted by resolving Links from the
 * Units in its scope to Units elsewhere — the facts a registry bot writes, say. The change
 * is made there, and creating the ChangeOrder marks each of those source Units with its
 * start Tag (the Revision before the change) and its end Tag (the Revision the change ends
 * at). Promoting marks the Revisions it writes in scope with the same Tags, so the sources
 * are the marked Revisions outside `InScopeSpaceIDs`.
 *
 * ONE QUERY, UNDEDUPED. The list across Spaces returns one Revision per Unit unless told
 * otherwise, and a `Tags.*` term is evaluated after that, so asking for both Tags at once
 * without `distinct_on=Off` keeps only the newer of each Unit's two Revisions.
 *
 * For a TransformPaths ChangeOrder it also reads the in-scope Links that take from each source
 * Unit, to know which of its paths the change can carry (`linkedSourcePaths`).
 */

import { useMemo } from 'react';

import { useListAllRevisionsQuery, useSearchListLinksQuery, type LinkRead } from '@confighub/rtk-query';
import { useRevisionDataMap } from '@/hooks/useUnitData';

import { linkedSourcePaths } from './linkedSourcePaths';

/** One source Unit of a fan-out ChangeOrder. */
export interface FanOutSourceUnit {
  unitId: string;
  slug: string;
  spaceId: string;
  toolchainType?: string;
  /** Configuration at the start Tag: before the change. */
  before: string;
  /** Configuration at the end Tag: the change as made. */
  after: string;
  /**
   * The paths the ChangeOrder's Links read from this Unit, when they read nothing else: the
   * only part of the change that reaches the Spaces it is promoted into. Absent when any of
   * the Unit can (`linkedSourcePaths`).
   */
  linkedPaths?: string[];
}

export interface FanOutSource {
  /**
   * `loading` until the Revisions and their configuration have arrived; `failed` when the
   * Revisions could not be read, which says nothing about whether there are sources.
   */
  status: 'loading' | 'resolved' | 'failed';
  units: FanOutSourceUnit[];
  /** The Spaces the source Units are in, in the order first seen. */
  spaceIds: string[];
  spaceNameBySpaceId: ReadonlyMap<string, string>;
}

/** Far more than one ChangeOrder marks: two Revisions per source Unit. */
export const SOURCE_REVISION_LIMIT = 1000;

/**
 * The Revisions the ChangeOrder's two Tags mark outside its scope: the source Units, at the start and at the end.
 * `undefined` until both Tags are known. `inScope` is sorted, so equal scopes read equal.
 */
export function fanOutRevisionWhere(
  startTagId: string | undefined,
  endTagId: string | undefined,
  inScope: readonly string[],
): string | undefined {
  if (startTagId === undefined || endTagId === undefined) return undefined;
  const tags = `Tags.*.TagID IN ('${startTagId}', '${endTagId}')`;
  return inScope.length === 0 ? tags : `${tags} AND SpaceID NOT IN (${inScope.map((id) => `'${id}'`).join(', ')})`;
}

/**
 * The in-scope Links that take from the source Units, which say which of their paths the change can carry.
 * Only a TransformPaths Link reads named paths; every other kind carries the whole Unit, so there is nothing to ask.
 */
export function fanOutLinkWhere(
  updateType: string | undefined,
  inScope: readonly string[],
  unitIds: readonly string[],
): string | undefined {
  if (updateType !== 'TransformPaths' || inScope.length === 0 || unitIds.length === 0) return undefined;
  return (
    `UpdateType = 'TransformPaths' AND ToUnitID IN (${[...unitIds].sort().map((id) => `'${id}'`).join(', ')})`
    + ` AND SpaceID IN (${inScope.map((id) => `'${id}'`).join(', ')})`
  );
}

const EMPTY: FanOutSource = { status: 'loading', units: [], spaceIds: [], spaceNameBySpaceId: new Map() };

export function useFanOutSource(args: {
  startTagId: string | undefined;
  endTagId: string | undefined;
  inScopeSpaceIds: readonly string[] | undefined;
  /** `ChangeOrder.UpdateType`: the kind of Link the change travels over. */
  updateType: string | undefined;
  skip: boolean;
}): FanOutSource {
  const { startTagId, endTagId, inScopeSpaceIds, updateType, skip } = args;

  const inScope = useMemo(() => [...(inScopeSpaceIds ?? [])].sort(), [inScopeSpaceIds]);

  const where = useMemo(() => fanOutRevisionWhere(startTagId, endTagId, inScope), [startTagId, endTagId, inScope]);

  const { data: revisions, isError } = useListAllRevisionsQuery(
    {
      where,
      distinctOn: 'Off',
      limit: SOURCE_REVISION_LIMIT,
      select: 'RevisionID,UnitID,SpaceID,RevisionNum,Tags',
      include: 'UnitID,SpaceID',
    },
    { skip: skip || where === undefined },
  );

  const { dataFor, ready } = useRevisionDataMap((revisions ?? []).map((r) => r.Revision?.RevisionID));

  // Only a TransformPaths Link reads named paths; every other kind carries the whole Unit.
  const linkWhere = useMemo(() => {
    const unitIds = [...new Set((revisions ?? []).map((r) => r.Revision?.UnitID).filter((id) => id !== undefined))];
    return fanOutLinkWhere(updateType, inScope, unitIds);
  }, [updateType, inScope, revisions]);
  const { data: links, isError: linksFailed } = useSearchListLinksQuery(
    { where: linkWhere },
    { skip: skip || linkWhere === undefined },
  );

  return useMemo((): FanOutSource => {
    if (skip || where === undefined) return EMPTY;
    if (isError) return { ...EMPTY, status: 'failed' };
    if (revisions === undefined || !ready) return EMPTY;
    // Without the Links every source Unit is shown whole, so a failure to read them is not
    // a failure of the source: it only loses the narrowing.
    if (linkWhere !== undefined && links === undefined && !linksFailed) return EMPTY;
    const linksByUnitId = new Map<string, LinkRead[]>();
    for (const entry of links ?? []) {
      const link = entry.Link;
      if (link === undefined) continue;
      linksByUnitId.set(link.ToUnitID, [...(linksByUnitId.get(link.ToUnitID) ?? []), link]);
    }

    const byUnitId = new Map<string, Partial<FanOutSourceUnit> & { unitId: string }>();
    const spaceIds: string[] = [];
    const spaceNameBySpaceId = new Map<string, string>();
    for (const entry of revisions) {
      const revision = entry.Revision;
      const unitId = revision?.UnitID;
      const spaceId = revision?.SpaceID;
      const revisionId = revision?.RevisionID;
      if (unitId === undefined || spaceId === undefined || revisionId === undefined) continue;
      const unit = byUnitId.get(unitId) ?? {
        unitId,
        spaceId,
        slug: entry.Unit?.Slug ?? unitId,
        toolchainType: entry.Unit?.ToolchainType ?? undefined,
      };
      const tags = revision?.Tags ?? {};
      if (startTagId !== undefined && startTagId in tags) unit.before = dataFor(revisionId);
      if (endTagId !== undefined && endTagId in tags) unit.after = dataFor(revisionId);
      byUnitId.set(unitId, unit);
      if (!spaceNameBySpaceId.has(spaceId)) {
        spaceIds.push(spaceId);
        spaceNameBySpaceId.set(spaceId, entry.Space?.DisplayName || entry.Space?.Slug || spaceId);
      }
    }

    // A Unit is a source only with both ends: the change is the difference between them.
    const units: FanOutSourceUnit[] = [];
    for (const unit of byUnitId.values()) {
      if (unit.before === undefined || unit.after === undefined || unit.slug === undefined) continue;
      units.push({
        unitId: unit.unitId,
        slug: unit.slug,
        spaceId: unit.spaceId ?? '',
        toolchainType: unit.toolchainType,
        before: unit.before,
        after: unit.after,
        linkedPaths:
          linkWhere === undefined || linksFailed
            ? undefined
            : linkedSourcePaths(linksByUnitId.get(unit.unitId) ?? []),
      });
    }
    return { status: 'resolved', units, spaceIds, spaceNameBySpaceId };
  }, [skip, where, isError, revisions, ready, dataFor, startTagId, endTagId, linkWhere, links, linksFailed]);
}
