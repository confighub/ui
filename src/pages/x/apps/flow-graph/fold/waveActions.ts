// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ExtendedUnitRead } from '@confighub/rtk-query';

import { chunkIds, inClause } from '../../../../../hooks/inClauseChunks';
import type { ComponentDeployment } from '../../componentTypes';
import type { WaveCondition } from './deploymentCondition';
import type { Wave } from './foldModel';

/** The words on a wave's one bulk action. */
export function waveActionLabel(condition: WaveCondition, count: number): string {
  switch (condition) {
    case 'stale':
      return `Upgrade ${count}`;
    case 'unreleased':
      return `Release ${count}`;
    case 'gated':
      return 'Review gates';
  }
}

/** Names one wave of one Base, to mark its bulk action as running. */
export function waveKey(baseId: string, condition: WaveCondition): string {
  return `${baseId}:${condition}`;
}

/** The words on a wave's bulk action while it runs. */
export function runningWaveLabel(condition: WaveCondition): string {
  return condition === 'stale' ? 'Upgrading…' : 'Releasing…';
}

/** What a click on a wave's action asks the page to do. */
export interface WaveActionRequest {
  baseId: string;
  wave: Wave;
  /**
   * Opens a Deployment's stack in place and pans to its card, without a
   * refit. With `select: false` the caller selects it itself (for example to
   * open the side pane on a given tab).
   */
  reveal: (id: string, opts: { openedBy: 'search' | 'you'; select?: boolean }) => void;
}

export interface WaveUpgradePlan {
  /** The upgradable Units of the wave's Deployments. */
  unitIds: string[];
  /** The Deployments (Spaces) that have at least one upgradable Unit, in member order. */
  spaceIds: string[];
  /**
   * `UnitID IN (...)` clauses that cover `unitIds` once each. Each one fits
   * the server's query-string and row limits, so a caller sends one request
   * per clause.
   */
  wheres: string[];
  /** The Unit ids of each clause in `wheres`, so a failed request names its Deployments. */
  unitIdChunks: string[][];
}

/**
 * The Units an "Upgrade N" on a Stale wave merges. A Unit is upgradable when
 * its upstream Unit is loaded and has a newer head Revision than the one the
 * Unit last merged: the same rule the side pane uses for one Deployment, so
 * the bulk action never touches a Unit the pane would not offer.
 */
export function planWaveUpgrade(
  memberIds: readonly string[],
  units: readonly ExtendedUnitRead[],
  unitById: ReadonlyMap<string, ExtendedUnitRead>,
): WaveUpgradePlan {
  const members = new Set(memberIds);
  const unitIds: string[] = [];
  const spaces = new Set<string>();
  for (const u of units) {
    const unit = u.Unit;
    if (!unit?.UnitID || !unit.UpstreamUnitID) continue;
    if (!unit.SpaceID || !members.has(unit.SpaceID)) continue;
    const upstream = unitById.get(unit.UpstreamUnitID);
    if (!upstream) continue;
    if ((unit.UpstreamRevisionNum ?? 0) < (upstream.Unit?.HeadRevisionNum ?? 0)) {
      unitIds.push(unit.UnitID);
      spaces.add(unit.SpaceID);
    }
  }
  const unitIdChunks = chunkIds('UnitID', unitIds);
  return {
    unitIds,
    spaceIds: memberIds.filter((id) => spaces.has(id)),
    wheres: unitIdChunks.map((chunk) => inClause('UnitID', chunk)),
    unitIdChunks,
  };
}

/**
 * The Deployments a "Release N" on an Unreleased changes wave publishes: the
 * members that release to a Target and have Units not released yet. A member
 * without a release Target has nothing to publish to.
 */
export function planWaveRelease(
  memberIds: readonly string[],
  deploymentsById: ReadonlyMap<string, ComponentDeployment>,
): string[] {
  return memberIds.filter((id) => {
    const d = deploymentsById.get(id);
    return !!d?.releaseTargetId && d.configSignals.unreleasedUnits > 0;
  });
}

/**
 * The member "Review gates" opens: the first by name, so the same click
 * always lands on the same Deployment.
 */
export function firstGatedMember(
  wave: Pick<Wave, 'memberIds'>,
  deploymentsById: ReadonlyMap<string, ComponentDeployment>,
): string | null {
  let first: ComponentDeployment | null = null;
  for (const id of wave.memberIds) {
    const d = deploymentsById.get(id);
    if (!d) continue;
    if (first === null || d.displayName.localeCompare(first.displayName) < 0) first = d;
  }
  return first?.deploymentId ?? null;
}
