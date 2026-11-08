// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a write to a guarded Unit would withhold, or did. A guarded path the write is not cleared
 * for is not written: the server reports it as a Guarded conflict, naming the guards, and writes
 * the rest. Kept free of React so it can be checked without a page.
 */
import { guardText } from '@/utility/clearance-functions';
import type { MutationConflict, WithheldGuard } from '@confighub/rtk-query';

/** One change a guard withheld, or would withhold. */
export interface GuardedChange {
  /** Which Unit, as `space/unit` where the Unit alone does not identify it. */
  unitLabel: string;
  /** The Unit's Space and the Unit, where known, to read the current value and guards from. */
  unit?: GuardedUnit;
  resourceType: string;
  resourceName: string;
  /** The path the change was to; empty for the resource as a whole. */
  path: string;
  /** The value the change would have written; none for a change to the path's guards. */
  value?: string;
  /** A change to the path's guards rather than its value: one an upgrade or a restore makes. */
  guardChange?: boolean;
  /** Every guard at the path the write was not cleared for. */
  guards: WithheldGuard[];
}

/** A Unit written to, by its Space and its own ID. */
export interface GuardedUnit {
  spaceId: string;
  unitId: string;
}

/**
 * The changes a guard withheld among one Unit's conflicts. Given the Unit, the dialog that asks
 * about them shows each path's current value and which of its guards are inherited.
 */
export function guardedChanges(
  conflicts: readonly MutationConflict[] | null | undefined,
  unitLabel: string,
  unit?: GuardedUnit,
): GuardedChange[] {
  return (conflicts ?? [])
    .filter((conflict) => conflict.Reason === 'Guarded' || conflict.Reason === 'GuardWithheld')
    .map((conflict) => ({
      unitLabel,
      unit,
      resourceType: conflict.Resource?.ResourceType ?? '',
      resourceName: conflict.Resource?.ResourceName ?? '',
      path: conflict.Path ?? '',
      value: conflict.Reason === 'Guarded' ? conflict.Source?.Value : undefined,
      guardChange: conflict.Reason === 'GuardWithheld' || undefined,
      guards: conflict.Guards ?? (conflict.Guard ? [conflict.Guard] : []),
    }));
}

/** The changes withheld by one guard. */
export interface GuardGroup {
  guard: WithheldGuard;
  /** The guard as it is written, `key=value`, which is also its identity. */
  text: string;
  changes: GuardedChange[];
}

/**
 * The changes grouped by the guards that withheld them, a change under each of its guards, in key
 * and then value order. Acknowledging a guard is about every change it withheld.
 */
export function guardGroups(changes: readonly GuardedChange[]): GuardGroup[] {
  const groups = new Map<string, GuardGroup>();
  for (const change of changes) {
    for (const guard of change.guards) {
      if (!guard.Key) continue;
      const text = guardText(guard);
      const group = groups.get(text) ?? {
        guard: { Key: guard.Key, Value: guard.Value },
        text,
        changes: [],
      };
      group.changes.push(change);
      groups.set(text, group);
    }
  }
  // By code point, as the server orders guard keys, so the two list them alike.
  const compare = (a = '', b = '') => (a < b ? -1 : a > b ? 1 : 0);
  return [...groups.values()].sort(
    (a, b) => compare(a.guard.Key, b.guard.Key) || compare(a.guard.Value, b.guard.Value),
  );
}

/** A count of withheld changes in words, for a notice: what guards withheld, or would. */
export const withheldSummary = (changes: readonly GuardedChange[], would = false): string =>
  `Guards ${would ? 'would withhold' : 'withheld'} ${changes.length} change${
    changes.length === 1 ? '' : 's'
  }`;

/** The key of a field among a Unit's: its resource and path. */
export const fieldKey = (resourceType: string, resourceName: string, path: string): string =>
  [resourceType, resourceName, path].join('\u0000');

/** What a guarded path holds now, and which of its guards are inherited. */
export interface GuardedFieldState {
  value?: string;
  inheritedGuardKeys: ReadonlySet<string>;
}

/** Whether a guard is inherited at the paths it withheld changes to. */
export type GuardInheritance = 'inherited' | 'local' | 'mixed' | 'unknown';

/**
 * Whether a guard is inherited at every path it withheld a change to, at none, or at some. A
 * guard is inherited or not where it is recorded, and one key and value can be recorded in
 * several Units and resources, so the answer is about all of them.
 */
export function guardInheritance(
  group: GuardGroup,
  stateOf: (change: GuardedChange) => GuardedFieldState | undefined,
): GuardInheritance {
  let inherited = 0;
  let local = 0;
  for (const change of group.changes) {
    const state = stateOf(change);
    if (!state) return 'unknown';
    if (state.inheritedGuardKeys.has(group.guard.Key ?? '')) inherited++;
    else local++;
  }
  if (inherited > 0 && local > 0) return 'mixed';
  return inherited > 0 ? 'inherited' : 'local';
}
