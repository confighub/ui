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
 */

import { useMemo } from 'react';

import { useListAllRevisionsQuery } from '@confighub/rtk-query';
import { useRevisionDataMap } from '@/hooks/useUnitData';

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
const SOURCE_REVISION_LIMIT = 1000;

const EMPTY: FanOutSource = { status: 'loading', units: [], spaceIds: [], spaceNameBySpaceId: new Map() };

export function useFanOutSource(args: {
  startTagId: string | undefined;
  endTagId: string | undefined;
  inScopeSpaceIds: readonly string[] | undefined;
  skip: boolean;
}): FanOutSource {
  const { startTagId, endTagId, inScopeSpaceIds, skip } = args;

  const where = useMemo(() => {
    if (startTagId === undefined || endTagId === undefined) return undefined;
    const tags = `Tags.*.TagID IN ('${startTagId}', '${endTagId}')`;
    const inScope = [...(inScopeSpaceIds ?? [])].sort();
    return inScope.length === 0
      ? tags
      : `${tags} AND SpaceID NOT IN (${inScope.map((id) => `'${id}'`).join(', ')})`;
  }, [startTagId, endTagId, inScopeSpaceIds]);

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

  return useMemo((): FanOutSource => {
    if (skip || where === undefined) return EMPTY;
    if (isError) return { ...EMPTY, status: 'failed' };
    if (revisions === undefined || !ready) return EMPTY;

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
      });
    }
    return { status: 'resolved', units, spaceIds, spaceNameBySpaceId };
  }, [skip, where, isError, revisions, ready, dataFor, startTagId, endTagId]);
}
