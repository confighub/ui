// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the ChangeSets on the selected Deployment changed, unit by unit, in the
 * shape the side pane's Incoming view draws: an `UpgradeEntry` whose "current"
 * side is the unit before the ChangeSet and whose "upgrade" side is the unit
 * now. The pane's ChangeSet filter renders these read-only, so a ChangeSet's
 * change and an incoming upgrade read the same way (components.md, "ChangeSets
 * on the graph").
 *
 * "Before the ChangeSet" is the Revision before the unit's first Revision in
 * the ChangeSet. That is the same Revision whichever way the ChangeSet's start
 * Tag was placed: on the Revision before it (`StartTagIsPriorRevision`), or on
 * a first Revision that attaching the ChangeSet made without changing anything.
 *
 * Three reads, each for every unit at once: the unit's Revisions in its
 * ChangeSet (for the first one's number), the Revision before that (for its
 * id), and that Revision's configuration, which the pane draws. Then one read
 * per unit of what changed, as the server diffs it, from the Revision before
 * the ChangeSet to the unit's head (`useChangeSetDiffs`). The server matches
 * array elements by merge key and resources by identity, so a change to a path
 * two documents share is a change in the one document it is in. A unit the tree
 * reads as text (`treeReadsDocuments`), whose rows no server path names, is
 * compared instead with its current configuration, which is its head's.
 */

import { useCallback, useMemo } from 'react';

import { type ConfigDiff, type ExtendedUnitRead, useListAllRevisionsQuery } from '@confighub/rtk-query';

import { useRevisionDataMap } from '@/hooks/useUnitData';

import { changeSetLabel, changeSetUnitIds } from './changeSets';
import { fieldDiffsFromConfigDiff, isWholeResourceChange } from './configDiffFieldDiffs';
import type { ComponentDeployment, KeyedFieldDiff, UpgradeEntry, WholeResourceChange } from './componentTypes';
import { treeReadsDocuments } from './componentValues';
import { buildPaths, textFieldDiffs } from './entryBuilders';
import { type ChangeSetDiffRead, useChangeSetDiffs } from './useChangeSetDiffs';

/** A ChangeSet's change to one unit, as an upgrade-shaped entry, with the configuration it started from. */
export interface ChangeSetEntry extends UpgradeEntry {
  changeSetId: string;
  /** The unit's configuration before the ChangeSet: what the pane shows as the current value. */
  beforeData: string;
}

/** Revisions are listed one page at a time; this covers a ChangeSet over every unit a node can show. */
const REVISION_LIMIT = 1000;

/** The rows of one Diff, cached on it, so a rebuild with the same Diff and data re-renders no row. */
const rowsCache = new WeakMap<ConfigDiff, {
  beforeData: string;
  fieldDiffs: KeyedFieldDiff[];
  wholeResourceChanges: WholeResourceChange[] | undefined;
}>();

/**
 * The ChangeSet's changes as the tree draws them. The tree draws the unit before the
 * ChangeSet, which is the From side of the diff.
 */
function rowsOf(diff: ConfigDiff, beforeData: string) {
  const hit = rowsCache.get(diff);
  if (hit && hit.beforeData === beforeData) return hit;
  const fieldDiffs: KeyedFieldDiff[] = [];
  const whole: WholeResourceChange[] = [];
  for (const row of fieldDiffsFromConfigDiff(diff, beforeData, { treeSide: 'from' })) {
    if (isWholeResourceChange(row)) whole.push(row);
    else fieldDiffs.push(row);
  }
  const rows = { beforeData, fieldDiffs, wholeResourceChanges: whole.length > 0 ? whole : undefined };
  rowsCache.set(diff, rows);
  return rows;
}

const quoted = (ids: Iterable<string | number>) => [...ids].map((id) => (typeof id === 'number' ? `${id}` : `'${id}'`)).join(',');

export interface ChangeSetEntries {
  /** One per unit whose diff has landed; a unit still being read, or whose read failed, has none. */
  entries: ChangeSetEntry[];
  /**
   * True while any covered unit is still being read. A unit whose read failed is not
   * loading: it is in `errorByUnitId`, which the caller shows for it.
   */
  isLoading: boolean;
  /** Why each failed unit's diff could not be read, by UnitID. */
  errorByUnitId: ReadonlyMap<string, string>;
}

export function useChangeSetEntries({
  deployments,
  selectedDeploymentIds,
  unitById,
  unitDataFor,
  isUnitDataFetching,
}: {
  deployments: readonly ComponentDeployment[];
  selectedDeploymentIds: ReadonlySet<string>;
  unitById: ReadonlyMap<string, ExtendedUnitRead>;
  /** Each unit's current configuration, which is its head Revision's; read only for a unit the tree reads as text. */
  unitDataFor: (unitId?: string) => string;
  /** Whether `unitDataFor` is still loading, so an empty configuration is not taken for a cleared one. */
  isUnitDataFetching: boolean;
}): ChangeSetEntries {
  // Which ChangeSet each unit of the selected Deployments is in, or was last changed in.
  const covered = useMemo(() => {
    const byUnit = new Map<string, { changeSetId: string; deployment: ComponentDeployment; label: string; description?: string }>();
    for (const deployment of deployments) {
      if (!selectedDeploymentIds.has(deployment.deploymentId)) continue;
      for (const cs of deployment.changeSets ?? []) {
        for (const unitId of changeSetUnitIds(cs)) {
          byUnit.set(unitId, {
            changeSetId: cs.changeSetId,
            deployment,
            label: changeSetLabel(cs, deployment.slug),
            description: cs.changeSet?.Description,
          });
        }
      }
    }
    return byUnit;
  }, [deployments, selectedDeploymentIds]);

  const unitIds = useMemo(() => [...covered.keys()].sort(), [covered]);
  const changeSetIds = useMemo(() => [...new Set([...covered.values()].map((c) => c.changeSetId))].sort(), [covered]);

  const { currentData: inChangeSet, isFetching: inChangeSetFetching } = useListAllRevisionsQuery(
    {
      where: `ChangeSetID IN (${quoted(changeSetIds)}) AND UnitID IN (${quoted(unitIds)})`,
      select: 'RevisionID,UnitID,RevisionNum,ChangeSetID',
      distinctOn: 'Off',
      limit: REVISION_LIMIT,
    },
    { skip: unitIds.length === 0 },
  );

  // The unit's first Revision in its ChangeSet, and the one before it.
  const firstNumByUnit = useMemo(() => {
    const first = new Map<string, number>();
    for (const r of inChangeSet ?? []) {
      const unitId = r.Revision?.UnitID;
      const num = r.Revision?.RevisionNum;
      if (!unitId || num === undefined || covered.get(unitId)?.changeSetId !== r.Revision?.ChangeSetID) continue;
      const known = first.get(unitId);
      if (known === undefined || num < known) first.set(unitId, num);
    }
    return first;
  }, [inChangeSet, covered]);

  const beforeNums = useMemo(
    () => [...new Set([...firstNumByUnit.values()].map((n) => n - 1).filter((n) => n > 0))].sort((a, b) => a - b),
    [firstNumByUnit],
  );
  const beforeUnitIds = useMemo(
    () => [...firstNumByUnit].filter(([, n]) => n > 1).map(([unitId]) => unitId).sort(),
    [firstNumByUnit],
  );
  const { currentData: beforeRevisions, isFetching: beforeFetching } = useListAllRevisionsQuery(
    {
      where: `UnitID IN (${quoted(beforeUnitIds)}) AND RevisionNum IN (${quoted(beforeNums)})`,
      select: 'RevisionID,UnitID,RevisionNum',
      distinctOn: 'Off',
      limit: REVISION_LIMIT,
    },
    { skip: beforeUnitIds.length === 0 },
  );

  // The query names every unit with every number, so keep each unit's own.
  const beforeRevisionIdByUnit = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of beforeRevisions ?? []) {
      const unitId = r.Revision?.UnitID;
      const id = r.Revision?.RevisionID;
      if (unitId && id && r.Revision?.RevisionNum === (firstNumByUnit.get(unitId) ?? 0) - 1) m.set(unitId, id);
    }
    return m;
  }, [beforeRevisions, firstNumByUnit]);

  const { dataFor: revisionDataFor, ready: beforeDataReady } = useRevisionDataMap([...beforeRevisionIdByUnit.values()]);

  const revisionsReady =
    unitIds.length === 0 || (inChangeSet !== undefined && !inChangeSetFetching && !beforeFetching && beforeDataReady);

  // What each unit's diff runs between. Both ends are Revision numbers, which never change,
  // and the To is the head's, so a new head is a new read and an unchanged unit reads nothing.
  const reads = useMemo((): ChangeSetDiffRead[] => {
    if (!revisionsReady) return [];
    const result: ChangeSetDiffRead[] = [];
    for (const [unitId, firstNum] of firstNumByUnit) {
      const c = covered.get(unitId);
      const unit = unitById.get(unitId)?.Unit;
      if (!c) continue;
      const beforeNum = firstNum - 1;
      // Without its prior Revision's data the pane has nothing to draw as the current side.
      if (beforeNum > 0 && !beforeRevisionIdByUnit.has(unitId)) continue;
      result.push({
        spaceId: unit?.SpaceID ?? c.deployment.deploymentId,
        unitId,
        fromRevisionNum: beforeNum,
        toRevisionNum: Math.max(unit?.HeadRevisionNum ?? firstNum, firstNum),
      });
    }
    return result;
  }, [revisionsReady, firstNumByUnit, covered, unitById, beforeRevisionIdByUnit]);

  const readsText = useCallback(
    (unitId: string) => !treeReadsDocuments(unitById.get(unitId)?.Unit?.ToolchainType),
    [unitById],
  );
  const diffReads = useMemo(() => reads.filter((r) => !readsText(r.unitId)), [reads, readsText]);
  const { diffByUnitId, errorByUnitId } = useChangeSetDiffs(diffReads);

  const entries = useMemo(() => {
    const result: ChangeSetEntry[] = [];
    for (const read of reads) {
      const { unitId, fromRevisionNum, toRevisionNum } = read;
      const c = covered.get(unitId);
      if (!c) continue;
      // A unit created in the ChangeSet started from nothing, so its resources read as added.
      const beforeData = fromRevisionNum > 0 ? revisionDataFor(beforeRevisionIdByUnit.get(unitId)) : '';
      let fieldDiffs: KeyedFieldDiff[];
      let wholeResourceChanges: WholeResourceChange[] | undefined;
      if (readsText(unitId)) {
        const headData = unitDataFor(unitId);
        if (headData === '' && isUnitDataFetching) continue;
        fieldDiffs = textFieldDiffs(beforeData, headData);
      } else {
        const diff = diffByUnitId.get(unitId);
        if (!diff) continue;
        ({ fieldDiffs, wholeResourceChanges } = rowsOf(diff, beforeData));
      }
      result.push({
        unitId,
        changeSetId: c.changeSetId,
        beforeData,
        slug: unitById.get(unitId)?.Unit?.Slug ?? unitId,
        deploymentId: c.deployment.deploymentId,
        deploymentName: c.deployment.displayName,
        parentDeploymentName: `ChangeSet ${c.label}`,
        upstreamRevisionNum: fromRevisionNum,
        upstreamHeadRevisionNum: toRevisionNum,
        fieldDiffs,
        ...(wholeResourceChanges ? { wholeResourceChanges } : {}),
        allPaths: buildPaths(beforeData),
        upstreamDescription: c.description,
      });
    }
    return result;
  }, [reads, readsText, unitDataFor, isUnitDataFetching, diffByUnitId, covered, beforeRevisionIdByUnit, revisionDataFor, unitById]);

  const isLoading = unitIds.length > 0 && (!revisionsReady || entries.length + errorByUnitId.size < reads.length);

  return { entries, isLoading, errorByUnitId };
}
