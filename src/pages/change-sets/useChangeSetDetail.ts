// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Everything the ChangeSet page shows of one ChangeSet, read from its address.
 *
 * - The ChangeSet: by slug, matched to the Space slug the URL names.
 * - Its Revisions (`ChangeSetID = <id>`), with the Attestations that cover them and
 *   the ChangeOrders that carried them. Closing a ChangeSet takes its Units out of
 *   it but leaves its Revisions marked, so these are its record either way.
 * - Its Units: the ones it is open on, and the ones its Revisions are of.
 * - The diff of those Units from before the ChangeSet to it: `ChangeSet:<id>` is
 *   each Unit's head while the ChangeSet is open, and its end once closed.
 *
 * While the ChangeSet is open its change can still move, so the reads poll. The diff
 * also carries the generated `Unit` tag, so a write made from this app refetches it.
 */

import { useMemo } from 'react';

import {
  useListAllChangeSetsQuery,
  useListAllRevisionsQuery,
  useListAllUnitsQuery,
  useSearchUnitDiffQuery,
  type ChangeSetRead,
  type ConfigDiff,
  type ExtendedRevisionRead,
} from '@confighub/rtk-query';

import { serverDiffGroupParts } from '../x/apps/change-order/changeOrderChanges';
import { SOURCE_REVISION_LIMIT } from '../x/apps/change-order/useFanOutSource';
import { imageChangesOfRead, type ImageChanges } from '../change-orders/imageChange';
import { findChangeSet, isSlugSegment } from './changeSetAddress';

/** How often an open ChangeSet is read again. */
const OPEN_POLL_MS = 30_000;

export interface ChangeSetUnit {
  unitId: string;
  slug: string;
  spaceId: string;
  spaceSlug: string;
}

/** One Unit's change, as the diff rows draw it. */
export interface ChangeSetDiffRow {
  unit: ChangeSetUnit;
  /** The changed resources only. */
  diff: ConfigDiff;
  changeCount: number;
  resourceKind?: string;
}

export interface ChangeSetLinkedChangeOrder {
  changeOrderId: string;
  slug: string;
  spaceSlug?: string;
}

export interface ChangeSetDetail {
  status: 'loading' | 'notFound' | 'error' | 'found';
  changeSet?: ChangeSetRead;
  open: boolean;
  /** Undefined until read. */
  revisions?: ExtendedRevisionRead[];
  /** The Units the ChangeSet is open on now, and their Spaces. */
  openUnitIds: string[];
  openSpaceIds: string[];
  /** The Units the ChangeSet changed, and the Spaces they are in: what a decision covers. */
  changedUnitIds: string[];
  changedSpaceIds: string[];
  diff: {
    status: 'loading' | 'resolved' | 'failed';
    rows: ChangeSetDiffRow[];
    /** Units in the ChangeSet in which no field differs. */
    unchangedCount: number;
    /** Units whose diff could not be read. */
    droppedCount: number;
    changeCount: number;
  };
  imageChanges: ImageChanges;
  changeOrders: ChangeSetLinkedChangeOrder[];
  refetch: () => void;
}

const inList = (ids: readonly string[]) => `(${ids.map((id) => `'${id}'`).join(', ')})`;
const EMPTY: never[] = [];

export function useChangeSetDetail({ space, slug }: { space?: string; slug?: string }): ChangeSetDetail {
  const addressed = isSlugSegment(space) && isSlugSegment(slug);
  const changeSets = useListAllChangeSetsQuery({ where: `Slug = '${slug ?? ''}'` }, { skip: !addressed });
  const changeSet = useMemo(
    () =>
      findChangeSet(
        { space, slug },
        (changeSets.data ?? []).flatMap((entry) =>
          entry.ChangeSet === undefined ? [] : [{ ...entry.ChangeSet, changeSetId: entry.ChangeSet.ChangeSetID ?? '', slug: entry.ChangeSet.Slug, spaceSlug: entry.ChangeSet.SpaceSlug }],
        ),
      ),
    [changeSets.data, space, slug],
  );
  const id = changeSet?.changeSetId;

  // Re-read the ChangeSet itself while it was open when found: its State and ReviewRequests move.
  const live = useListAllChangeSetsQuery(
    { where: `ChangeSetID = '${id ?? ''}'` },
    { skip: id === undefined, pollingInterval: changeSet?.State === 'Open' ? OPEN_POLL_MS : 0, skipPollingIfUnfocused: true },
  );
  const current = live.data?.[0]?.ChangeSet ?? changeSet;
  const open = current?.State === 'Open';
  const poll = open ? OPEN_POLL_MS : 0;

  const revisions = useListAllRevisionsQuery(
    { where: `ChangeSetID = '${id ?? ''}'`, distinctOn: 'Off', include: 'Attestations,ChangeOrders', limit: SOURCE_REVISION_LIMIT },
    { skip: id === undefined, pollingInterval: poll, skipPollingIfUnfocused: true },
  );
  const openUnits = useListAllUnitsQuery(
    { where: `ChangeSetID = '${id ?? ''}'`, select: 'UnitID' },
    { skip: id === undefined || !open, pollingInterval: poll, skipPollingIfUnfocused: true },
  );
  const openUnitIds = useMemo(
    () => (openUnits.data ?? []).flatMap((entry) => (entry.Unit?.UnitID ? [entry.Unit.UnitID] : [])).sort(),
    [openUnits.data],
  );
  const unitIds = useMemo(() => {
    const ids = new Set(openUnitIds);
    for (const entry of revisions.data ?? []) if (entry.Revision?.UnitID) ids.add(entry.Revision.UnitID);
    return [...ids].sort();
  }, [openUnitIds, revisions.data]);

  const units = useListAllUnitsQuery(
    { where: `UnitID IN ${inList(unitIds)}`, select: 'UnitID,Slug,SpaceID', include: 'SpaceID' },
    { skip: unitIds.length === 0 },
  );
  const unitById = useMemo(() => {
    const byId = new Map<string, ChangeSetUnit>();
    for (const entry of units.data ?? []) {
      const unit = entry.Unit;
      if (unit?.UnitID === undefined) continue;
      byId.set(unit.UnitID, { unitId: unit.UnitID, slug: unit.Slug, spaceId: unit.SpaceID ?? '', spaceSlug: entry.Space?.Slug ?? unit.SpaceID ?? '' });
    }
    return byId;
  }, [units.data]);

  const diffRead = useSearchUnitDiffQuery(
    { where: `UnitID IN ${inList(unitIds)}`, from: `Before:ChangeSet:${id ?? ''}`, to: `ChangeSet:${id ?? ''}`, include: 'Context' },
    { skip: id === undefined || unitIds.length === 0, pollingInterval: poll, skipPollingIfUnfocused: true },
  );

  const diff = useMemo<ChangeSetDetail['diff']>(() => {
    if (diffRead.isError) return { status: 'failed', rows: [], unchangedCount: 0, droppedCount: 0, changeCount: 0 };
    if (revisions.data === undefined || (unitIds.length > 0 && (diffRead.currentData === undefined || units.data === undefined))) {
      return { status: 'loading', rows: [], unchangedCount: 0, droppedCount: 0, changeCount: 0 };
    }
    const rows: ChangeSetDiffRow[] = [];
    let unchangedCount = 0;
    let droppedCount = 0;
    for (const unitDiff of diffRead.currentData ?? []) {
      const unit = unitDiff.UnitID === undefined ? undefined : unitById.get(unitDiff.UnitID);
      if (unit === undefined || unitDiff.Error !== undefined) {
        droppedCount += 1;
        continue;
      }
      const parts = serverDiffGroupParts(unitDiff.Diff ?? { Resources: [] }, undefined, undefined);
      if (parts.fieldDiffs.length === 0) {
        unchangedCount += 1;
        continue;
      }
      rows.push({ unit, diff: parts.diff ?? { Resources: [] }, changeCount: parts.fieldDiffs.length, resourceKind: parts.resourceKind });
    }
    rows.sort((a, b) => a.unit.spaceSlug.localeCompare(b.unit.spaceSlug) || a.unit.slug.localeCompare(b.unit.slug));
    return {
      status: 'resolved',
      rows,
      unchangedCount,
      droppedCount,
      changeCount: rows.reduce((sum, row) => sum + row.changeCount, 0),
    };
  }, [diffRead.isError, diffRead.currentData, revisions.data, units.data, unitIds.length, unitById]);

  const imageChanges = useMemo(() => {
    if (unitIds.length === 0 && revisions.data !== undefined) return imageChangesOfRead([], false);
    return imageChangesOfRead(diffRead.currentData, diffRead.isError);
  }, [unitIds.length, revisions.data, diffRead.currentData, diffRead.isError]);

  const openSpaceIds = useMemo(
    () => [...new Set(openUnitIds.flatMap((unitId) => (unitById.get(unitId)?.spaceId ? [unitById.get(unitId)?.spaceId ?? ''] : [])))].sort(),
    [openUnitIds, unitById],
  );

  const changed = useMemo(() => {
    const unitSet = new Set<string>();
    const spaceSet = new Set<string>();
    for (const entry of revisions.data ?? []) {
      if (entry.Revision?.UnitID) unitSet.add(entry.Revision.UnitID);
      if (entry.Revision?.SpaceID) spaceSet.add(entry.Revision.SpaceID);
    }
    return { unitIds: [...unitSet].sort(), spaceIds: [...spaceSet].sort() };
  }, [revisions.data]);

  const changeOrders = useMemo(() => {
    const byId = new Map<string, ChangeSetLinkedChangeOrder>();
    for (const entry of revisions.data ?? []) {
      for (const order of entry.ChangeOrders ?? []) {
        if (order.ChangeOrderID === undefined || byId.has(order.ChangeOrderID)) continue;
        byId.set(order.ChangeOrderID, { changeOrderId: order.ChangeOrderID, slug: order.Slug, spaceSlug: order.SpaceSlug });
      }
    }
    return [...byId.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  }, [revisions.data]);

  let status: ChangeSetDetail['status'] = 'found';
  if (!addressed) status = 'notFound';
  else if (changeSets.isError) status = 'error';
  else if (changeSets.data === undefined) status = 'loading';
  else if (changeSet === undefined) status = 'notFound';

  const refetchChangeSet = live.refetch;
  const refetchRevisions = revisions.refetch;
  const refetch = useMemo(
    () => () => {
      if (id === undefined) return;
      void refetchChangeSet();
      void refetchRevisions();
    },
    [id, refetchChangeSet, refetchRevisions],
  );

  return {
    status,
    changeSet: current,
    open,
    revisions: revisions.data,
    openUnitIds: open ? openUnitIds : EMPTY,
    openSpaceIds: open ? openSpaceIds : EMPTY,
    changedUnitIds: changed.unitIds,
    changedSpaceIds: changed.spaceIds,
    diff,
    imageChanges,
    changeOrders,
    refetch,
  };
}
