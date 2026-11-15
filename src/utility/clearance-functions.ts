// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Clearances built from the guards that withheld a change: what a person acknowledging those
 * guards is cleared for, and no more.
 */
import type {
  Clearance,
  GuardStamp,
  MutationConflict,
  PathAnnotationList,
  WithheldGuard,
} from '@confighub/rtk-query';

/**
 * The clearance a change that is not a merge is sent with when it states none: cleared for
 * Override guards, whatever their value. An Override guard (Override=External, Override=Upstream)
 * keeps a merge -- an upgrade, a promotion of an UpgradeUnit or MergeUnits ChangeOrder, an upload
 * -- from replacing a value someone set on purpose, as protection does, and like protection it
 * does not stand in the way of the next edit. Every write that is not a merge takes its clearance
 * from `nonMergeClearance`, so this is the one place to change what they are cleared for.
 */
export const DEFAULT_CLEARANCE: Clearance = [{ Key: 'Override', Operator: 'Exists' }];

/**
 * The clearance of a change that is not a merge: the clearance stated, or `DEFAULT_CLEARANCE`
 * where none is, with what the person acknowledged at the write added. A clearance stated
 * replaces the default, as `cub --clearance` does; an acknowledgement adds to it, since it answers
 * a dry run that was sent with the default.
 */
export function nonMergeClearance(
  stated?: Clearance | null,
  acknowledged?: Clearance | null,
): Clearance {
  const base = stated && stated.length > 0 ? stated : DEFAULT_CLEARANCE;
  return [...base, ...(acknowledged ?? [])];
}

/**
 * The guards among those given that `DEFAULT_CLEARANCE` does not clear: those a person has to
 * acknowledge before a change that is not a merge overwrites, or edits the guards of, the paths
 * they are on.
 */
export const guardsNotClearedByDefault = (guards: readonly WithheldGuard[]): WithheldGuard[] =>
  guards.filter(
    (guard) =>
      !guard.Key ||
      guardsNotCleared({ [guard.Key]: guard.Value ?? '' }, DEFAULT_CLEARANCE).length > 0,
  );

/**
 * The UpdateTypes of a ChangeOrder or Link that merge: they take the change from Revisions of a
 * source Unit, where the others resolve Links or run an Invocation. An empty UpdateType is
 * UpgradeUnit, the default.
 */
const MERGE_UPDATE_TYPES: ReadonlySet<string> = new Set(['', 'UpgradeUnit', 'MergeUnits']);

/**
 * The clearance a promotion of a ChangeOrder of the given UpdateType sends: `DEFAULT_CLEARANCE`
 * for one that runs an Invocation or resolves Links, which is not a merge, and none for one that
 * merges, or whose UpdateType is not known yet. It is the line the server draws for `Protect`.
 */
export const promotionClearance = (updateType: string | undefined): Clearance | undefined =>
  updateType === undefined || MERGE_UPDATE_TYPES.has(updateType)
    ? undefined
    : nonMergeClearance();

/** `nonMergeClearance` as the `clearance` query parameter of a write takes it: JSON. */
export const nonMergeClearanceParam = (
  stated?: Clearance | null,
  acknowledged?: Clearance | null,
): string => JSON.stringify(nonMergeClearance(stated, acknowledged));

/** The reasons whose conflicts name the guards that withheld the change. */
export const GUARD_CONFLICT_REASONS: ReadonlySet<string> = new Set([
  'Guarded',
  'GuardWithheld',
]);

/** A guard as it is written: `key=value`, or the key alone for a guard with no value. */
export const guardText = (guard: WithheldGuard): string =>
  guard.Value ? `${guard.Key}=${guard.Value}` : (guard.Key ?? '');

/** The guards that withheld a conflict's change; none for a conflict no guard caused. */
export const conflictGuards = (conflict: MutationConflict): WithheldGuard[] =>
  GUARD_CONFLICT_REASONS.has(conflict.Reason ?? '')
    ? (conflict.Guards ?? (conflict.Guard ? [conflict.Guard] : []))
    : [];

/** The distinct guards among those given, in key and then value order. */
export function distinctGuards(guards: readonly WithheldGuard[]): WithheldGuard[] {
  const byText = new Map<string, WithheldGuard>();
  for (const guard of guards) {
    if (!guard.Key) continue;
    const text = guardText(guard);
    if (!byText.has(text)) byText.set(text, { Key: guard.Key, Value: guard.Value });
  }
  // By code point, as the server orders guard keys, so the two list them alike.
  const compare = (a = '', b = '') => (a < b ? -1 : a > b ? 1 : 0);
  return [...byText.values()].sort(
    (a, b) => compare(a.Key, b.Key) || compare(a.Value, b.Value),
  );
}

/** The distinct guards that withheld the given conflicts' changes, in key and then value order. */
export const withheldGuards = (conflicts: readonly MutationConflict[]): WithheldGuard[] =>
  distinctGuards(conflicts.flatMap(conflictGuards));

/**
 * The narrowest clearance that covers the given guards: for each key, In the values given, or
 * Exists for a guard with no value. Never wider than what was acknowledged, so a guard of the same
 * key with another value still withholds.
 */
export function clearanceCovering(guards: readonly WithheldGuard[]): Clearance {
  const values = new Map<string, Set<string>>();
  for (const guard of guards) {
    if (!guard.Key) continue;
    const set = values.get(guard.Key) ?? new Set<string>();
    if (guard.Value) set.add(guard.Value);
    values.set(guard.Key, set);
  }
  return [...values.keys()].sort().map((key) => {
    const keyValues = [...(values.get(key) ?? [])].sort();
    return keyValues.length > 0
      ? { Key: key, Operator: 'In', Values: keyValues }
      : { Key: key, Operator: 'Exists' };
  });
}

/**
 * Whether a Unit's path annotations hold any guard, on a resource or on a path. A write to a Unit
 * with none is never withheld by a guard, so it needs no dry run to find out.
 */
export function unitHasGuards(annotations: PathAnnotationList | null | undefined): boolean {
  const guarded = (entry: Record<string, Record<string, string>> | undefined) =>
    Object.keys(entry?.Guard ?? {}).length > 0;
  return (annotations ?? []).some(
    (resource) =>
      guarded(resource.ResourceAnnotations) ||
      Object.values(resource.PathAnnotationMap ?? {}).some(guarded),
  );
}

/** Whether any requirement of the clearance clears one guard. */
const clearsGuard = (clearance: Clearance, key: string, value: string): boolean =>
  clearance.some((requirement) => {
    if (requirement.Key !== key) return false;
    switch (requirement.Operator) {
      case 'Exists':
        return true;
      case 'In':
        return (requirement.Values ?? []).includes(value);
      case 'NotIn':
        return !(requirement.Values ?? []).includes(value);
      default:
        return false;
    }
  });

/**
 * The guards a clearance does not cover, as the server decides it: a key the clearance forbids
 * with DoesNotExist first, as a precondition, then each key no requirement clears, each group in
 * key order. Something that records guards must be cleared for them, since its own next write is
 * withheld by them otherwise, so a form that edits both checks one against the other with this.
 */
export function guardsNotCleared(guards: GuardStamp | undefined, clearance: Clearance): WithheldGuard[] {
  const keys = Object.keys(guards ?? {}).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const forbidden = new Set(
    clearance.filter((r) => r.Operator === 'DoesNotExist' && r.Key).map((r) => r.Key as string),
  );
  const preconditions: WithheldGuard[] = [];
  const uncleared: WithheldGuard[] = [];
  for (const key of keys) {
    const value = guards?.[key] ?? '';
    if (forbidden.has(key)) preconditions.push({ Key: key, Value: value, Precondition: true });
    else if (!clearsGuard(clearance, key, value)) uncleared.push({ Key: key, Value: value });
  }
  return [...preconditions, ...uncleared];
}
