// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';

import type { ResourceViewRow } from '../adapters/resource-row';
import { fieldById, isUpgradable, STATUS_LABEL, statusesFor, type EntityRow } from '../model/fields';
import { EMPTY_GROUP_VALUE, type GroupNode } from '../model/grouping';
import type { EntityKind, LensSpec, StatusKind } from '../model/types';

/**
 * What a group header says beyond its name and count, and the filter a group
 * stands for (for a peek at it).
 */

export interface GroupStep {
  field: string;
  value: string;
}

/** Each group's path from the top level, by group key. */
export function groupPaths<R>(tree: readonly GroupNode<R>[]): Map<string, GroupStep[]> {
  const out = new Map<string, GroupStep[]>();
  const walk = (nodes: readonly GroupNode<R>[], parent: GroupStep[]) => {
    for (const n of nodes) {
      const path = [...parent, { field: n.field, value: n.value }];
      out.set(n.key, path);
      walk(n.children, path);
    }
  };
  walk(tree, []);
  return out;
}

const STATUS_BY_LABEL = new Map<string, StatusKind>(
  (Object.entries(STATUS_LABEL) as Array<[StatusKind, string]>).map(([k, label]) => [label, k]),
);

/** One group step as a lens, or null when no lens can say it (a computed column). */
export function stepLens(entity: EntityKind, step: GroupStep): LensSpec | null {
  const field = fieldById(entity, step.field);
  if (!field) return null;
  if (field.type === 'status') {
    const status = STATUS_BY_LABEL.get(step.value);
    return status ? { kind: 'status', status } : null;
  }
  if (entity === 'Unit' && (field.id === 'UnreleasedChanges' || field.id === 'UpgradeNeeded') && step.value === 'Yes') {
    return { kind: 'status', status: field.id === 'UnreleasedChanges' ? 'unreleased' : 'upgradable' };
  }
  if (!field.where) return null;
  if (step.value === EMPTY_GROUP_VALUE) {
    if (field.ops.includes('empty')) return { kind: 'field', field: field.id, op: 'empty', values: [] };
    // No Target is a status of its own (Not targeted), not an empty Target lens.
    if (field.nullWhere === 'TargetID' && statusesFor(entity).includes('untargeted')) return { kind: 'status', status: 'untargeted' };
    return null;
  }
  return { kind: 'field', field: field.id, op: 'is', values: [step.value] };
}

export function pathLenses(entity: EntityKind, path: readonly GroupStep[]): LensSpec[] {
  return path.map((s) => stepLens(entity, s)).filter((l): l is LensSpec => l !== null);
}

export interface GroupMix {
  unreleased: number;
  upgradable: number;
  /** For Spaces, the counts are of Units in the group's Spaces. */
  ofUnits: boolean;
}

/** How many rows in a group need attention: unreleased and upgradable. */
export function groupMix(entity: EntityKind, rows: readonly EntityRow[]): GroupMix {
  let unreleased = 0;
  let upgradable = 0;
  for (const row of rows) {
    if (entity === 'Unit') {
      const eu = row as ExtendedUnitRead;
      const u = eu.Unit;
      if (u?.TargetID && (u.HeadRevisionNum ?? 0) > (u.LastReleasedRevisionNum ?? 0)) unreleased++;
      if (isUpgradable(eu)) upgradable++;
    } else if (entity === 'Resource') {
      const r = row as ResourceViewRow;
      if (r.TargetSlug && (r.UnitHeadRevisionNum ?? 0) > (r.UnitLastReleasedRevisionNum ?? 0)) unreleased++;
    } else {
      const s = row as ExtendedSpaceRead;
      unreleased += s.UnreleasedUnitCount ?? 0;
      upgradable += s.UpgradableUnitCount ?? 0;
    }
  }
  return { unreleased, upgradable, ofUnits: entity === 'Space' };
}

/** A group header repeats nothing its own value already says. */
export function mixIsRedundant(field: string): boolean {
  return field === 'Status' || field === 'UnreleasedChanges' || field === 'UpgradeNeeded';
}

export function groupValueText(value: string): string {
  return value === EMPTY_GROUP_VALUE ? '' : value;
}
