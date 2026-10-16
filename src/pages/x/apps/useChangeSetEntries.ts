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
 * id), and that Revision's configuration.
 */

import { useMemo } from 'react';

import { type ExtendedUnitRead, useListAllRevisionsQuery } from '@confighub/rtk-query';

import { useRevisionDataMap } from '@/hooks/useUnitData';

import { changeSetLabel, changeSetUnitIds } from './changeSets';
import type { ComponentDeployment, UpgradeEntry } from './componentTypes';
import { buildPaths, computeFieldDiffs } from './entryBuilders';

/** A ChangeSet's change to one unit, as an upgrade-shaped entry, with the configuration it started from. */
export interface ChangeSetEntry extends UpgradeEntry {
  changeSetId: string;
  /** The unit's configuration before the ChangeSet: what the pane shows as the current value. */
  beforeData: string;
}

/** Revisions are listed one page at a time; this covers a ChangeSet over every unit a node can show. */
const REVISION_LIMIT = 1000;

const quoted = (ids: Iterable<string | number>) => [...ids].map((id) => (typeof id === 'number' ? `${id}` : `'${id}'`)).join(',');

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
  unitDataFor: (unitId?: string) => string;
  isUnitDataFetching: boolean;
}): { entries: ChangeSetEntry[]; isLoading: boolean } {
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

  const isLoading =
    unitIds.length > 0 &&
    (inChangeSet === undefined || inChangeSetFetching || beforeFetching || !beforeDataReady || isUnitDataFetching);

  const entries = useMemo(() => {
    // Never diff against a side that has not arrived: an absent side reads as every field changed.
    if (isLoading) return [];
    const result: ChangeSetEntry[] = [];
    for (const [unitId, firstNum] of firstNumByUnit) {
      const c = covered.get(unitId);
      if (!c) continue;
      const beforeNum = firstNum - 1;
      const beforeRevisionId = beforeRevisionIdByUnit.get(unitId);
      // A unit created in the ChangeSet started from nothing; any other unit needs its prior Revision.
      if (beforeNum > 0 && !beforeRevisionId) continue;
      const beforeData = beforeNum > 0 ? revisionDataFor(beforeRevisionId) : '';
      const afterData = unitDataFor(unitId);
      const unit = unitById.get(unitId)?.Unit;
      result.push({
        unitId,
        changeSetId: c.changeSetId,
        beforeData,
        slug: unit?.Slug ?? unitId,
        deploymentId: c.deployment.deploymentId,
        deploymentName: c.deployment.displayName,
        parentDeploymentName: `ChangeSet ${c.label}`,
        upstreamRevisionNum: beforeNum,
        upstreamHeadRevisionNum: unit?.HeadRevisionNum ?? firstNum,
        fieldDiffs: computeFieldDiffs(beforeData, afterData),
        allPaths: buildPaths(beforeData),
        upstreamDescription: c.description,
      });
    }
    return result;
  }, [isLoading, firstNumByUnit, covered, beforeRevisionIdByUnit, revisionDataFor, unitDataFor, unitById]);

  return { entries, isLoading };
}
