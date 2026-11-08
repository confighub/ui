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
