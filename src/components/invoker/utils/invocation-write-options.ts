// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The clearance and guard an Invocation or Trigger saved from the invoker stores, and what a
 * loaded Invocation puts back into the invoker's Options. Kept free of React so it
 * can be checked without a page.
 */
import {
  type GuardValues,
  NO_GUARD_VALUES,
  clearanceRecording,
  guardStamp,
} from '@/components/guarded-write/guardValues';
import { guardsNotCleared } from '@/utility/clearance-functions';
import type { Clearance, GuardStamp } from '@confighub/rtk-query';

/** The guard of a stored Invocation the invoker shows: one, as the invoker records one. */
export const shownGuardKey = (guards: GuardStamp | undefined | null): string | undefined =>
  Object.keys(guards ?? {}).sort()[0];

/** The invoker's guard for a stored Invocation's guards. */
export function storedGuardValues(guards: GuardStamp | undefined | null): GuardValues {
  const key = shownGuardKey(guards);
  if (key === undefined) return NO_GUARD_VALUES;
  return { enabled: true, key, value: guards?.[key] ?? '', inherited: false };
}

/**
 * The clearance to store: what was stated, and what covers the guard recorded when that does not
 * already, since the server refuses an entity whose clearance does not cover its guards. A loaded
 * Invocation's clearance covers its guard already, so saving it again adds nothing.
 */
export function storedClearance(
  clearance: Clearance | undefined,
  values: GuardValues,
): Clearance | undefined {
  const stated = clearance ?? [];
  const covered = guardsNotCleared(guardStamp(values), stated).length === 0;
  const stored = covered ? stated : (clearanceRecording(stated, values) ?? []);
  return stored.length > 0 ? stored : undefined;
}

/**
 * The Guards of a merge patch of an Invocation: the guard stated, and the removal of the one the
 * invoker showed when it no longer states it. Guards the invoker did not show are left as they are.
 */
export function guardsPatch(
  loaded: GuardStamp | undefined | null,
  values: GuardValues,
): Record<string, string | null> | undefined {
  const patch: Record<string, string | null> = { ...guardStamp(values) };
  const shown = shownGuardKey(loaded);
  if (shown !== undefined && !(shown in patch)) patch[shown] = null;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/** Why the guard stated cannot be saved on an Invocation or Trigger, if it cannot. */
export function guardSaveBlockedReason(values: GuardValues): string | undefined {
  if (!values.enabled) return undefined;
  if (values.key.trim() === '') return 'The guard needs a key.';
  if (values.inherited) return "Invocations and Triggers can't record an inherited guard.";
  return undefined;
}
