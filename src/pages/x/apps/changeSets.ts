// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeSets a Deployment's units are in, or have just come out of.
 *
 * A unit is in a ChangeSet while `Unit.ChangeSetID` is set: the ChangeSet is
 * open on it, and every change made to it lands in the ChangeSet. Closing the
 * ChangeSet clears that field, so a unit read after the close names its
 * ChangeSet only through its head Revision (`HeadRevision.ChangeSetID`). That
 * second case is the one worth showing next to the open one: the ChangeSet's
 * changes are still exactly what the unit holds, and nothing has been made on
 * top of them yet. Once something has, the head Revision no longer belongs to
 * the ChangeSet and the unit drops out — what it holds is no longer the
 * ChangeSet's change alone.
 *
 * Pure: no React or RTK Query, so a Node-side spec can import it.
 */

import type { ChangeSetRead, ExtendedUnitRead } from '@confighub/rtk-query';

/** Whether a unit is still in the ChangeSet, or its head Revision is the ChangeSet's last. */
export type UnitChangeSetRelation = 'open' | 'closed-on-head';

/** One ChangeSet as a Deployment sees it: the ChangeSet, and which of the Deployment's units it covers. */
export interface DeploymentChangeSet {
  changeSetId: string;
  /** The ChangeSet, once it has loaded; absent while it has not, or when it cannot be read. */
  changeSet?: ChangeSetRead;
  /** Units the ChangeSet is open on. */
  openUnitIds: string[];
  /** Units out of the ChangeSet whose head Revision is still the ChangeSet's. */
  closedOnHeadUnitIds: string[];
}

/** The ChangeSet a unit is in or has just left, and which; undefined when neither. */
export function unitChangeSet(unit: ExtendedUnitRead): { changeSetId: string; relation: UnitChangeSetRelation } | undefined {
  const open = unit.Unit?.ChangeSetID;
  if (open) return { changeSetId: open, relation: 'open' };
  const onHead = unit.HeadRevision?.ChangeSetID;
  if (onHead) return { changeSetId: onHead, relation: 'closed-on-head' };
  return undefined;
}

/**
 * The ChangeSet open on a unit, which every write to the unit has to name:
 * the server refuses a change to a unit in a ChangeSet that does not say it
 * is part of it. Undefined when no ChangeSet is open on the unit.
 */
export function openChangeSetIdOf(unitById: ReadonlyMap<string, ExtendedUnitRead>, unitId: string): string | undefined {
  return unitById.get(unitId)?.Unit?.ChangeSetID || undefined;
}

/**
 * The open ChangeSet a unit's upgrade waits for: its upstream is partway
 * through one, the unit is behind the upstream, and the unit is not in that
 * ChangeSet itself. The server refuses to take a Revision from the middle of
 * an open ChangeSet, so neither the upgrade nor its preview can run until the
 * ChangeSet closes. Undefined when the upgrade does not wait.
 */
export function upstreamChangeSetBlocking(
  unit: ExtendedUnitRead,
  upstream: ExtendedUnitRead | undefined,
): string | undefined {
  const upstreamChangeSetId = upstream?.Unit?.ChangeSetID;
  if (!upstreamChangeSetId || upstreamChangeSetId === unit.Unit?.ChangeSetID) return undefined;
  const behind = (unit.Unit?.UpstreamRevisionNum ?? 0) < (upstream?.Unit?.HeadRevisionNum ?? 0);
  return behind ? upstreamChangeSetId : undefined;
}

/** An upgrade a Deployment cannot take until an upstream ChangeSet closes. */
export interface WaitingChangeSet {
  changeSetId: string;
  /** The ChangeSet's slug, or its id until it has loaded. */
  label: string;
  /** The upstream Deployment the ChangeSet is open on. */
  upstreamDeploymentId: string;
}

/** Every ChangeSet id the units are in or have just left, deduplicated and sorted, for one lookup query. */
export function changeSetIdsOf(units: readonly ExtendedUnitRead[]): string[] {
  const ids = new Set<string>();
  for (const unit of units) {
    const cs = unitChangeSet(unit);
    if (cs) ids.add(cs.changeSetId);
  }
  return [...ids].sort();
}

/**
 * The ChangeSets of each Space's units, keyed by SpaceID. Within a Space, the
 * ChangeSets open on a unit come first, then by slug once loaded.
 */
export function buildChangeSetsBySpace(
  units: readonly ExtendedUnitRead[],
  changeSetById: ReadonlyMap<string, ChangeSetRead>,
): Map<string, DeploymentChangeSet[]> {
  const bySpace = new Map<string, Map<string, DeploymentChangeSet>>();
  for (const unit of units) {
    const spaceId = unit.Unit?.SpaceID;
    const unitId = unit.Unit?.UnitID;
    const cs = unitChangeSet(unit);
    if (!spaceId || !unitId || !cs) continue;
    let inSpace = bySpace.get(spaceId);
    if (!inSpace) {
      inSpace = new Map();
      bySpace.set(spaceId, inSpace);
    }
    let entry = inSpace.get(cs.changeSetId);
    if (!entry) {
      entry = { changeSetId: cs.changeSetId, changeSet: changeSetById.get(cs.changeSetId), openUnitIds: [], closedOnHeadUnitIds: [] };
      inSpace.set(cs.changeSetId, entry);
    }
    (cs.relation === 'open' ? entry.openUnitIds : entry.closedOnHeadUnitIds).push(unitId);
  }
  const result = new Map<string, DeploymentChangeSet[]>();
  for (const [spaceId, inSpace] of bySpace) {
    result.set(
      spaceId,
      [...inSpace.values()].sort((a, b) => {
        const aOpen = a.openUnitIds.length > 0 ? 0 : 1;
        const bOpen = b.openUnitIds.length > 0 ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return changeSetLabel(a).localeCompare(changeSetLabel(b));
      }),
    );
  }
  return result;
}

/** Whether the ChangeSet is open on any of the Deployment's units. */
export function isChangeSetOpenHere(entry: DeploymentChangeSet): boolean {
  return entry.openUnitIds.length > 0;
}

/** Every unit the ChangeSet covers in the Deployment, open or just closed. */
export function changeSetUnitIds(entry: DeploymentChangeSet): string[] {
  return [...entry.openUnitIds, ...entry.closedOnHeadUnitIds];
}

/**
 * The ChangeSet's name, qualified with its Space when that is not the
 * Deployment's own; its id until it has loaded.
 */
export function changeSetLabel(entry: DeploymentChangeSet, deploymentSpaceSlug?: string): string {
  const cs = entry.changeSet;
  if (!cs) return entry.changeSetId;
  if (cs.SpaceSlug && deploymentSpaceSlug && cs.SpaceSlug !== deploymentSpaceSlug) return `${cs.SpaceSlug}/${cs.Slug}`;
  return cs.Slug;
}
