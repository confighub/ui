// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A guard a write records on the paths it writes: the reason those paths hold what they hold,
 * which a later write has to be cleared for. The write's own clearance has to cover it too, since
 * the server refuses to record a guard the write that records it is not cleared for. Kept free of
 * React so it can be checked without a page.
 */
import { clearanceCovering } from '@/utility/clearance-functions';
import type { Clearance, GuardStamp } from '@confighub/rtk-query';

/** What a form asks about the guard to record. */
export interface GuardValues {
  /** Whether to guard the values written at all. */
  enabled: boolean;
  key: string;
  value: string;
  /** Copied to clones, and carried by merges to the Units downstream. */
  inherited: boolean;
}

export const NO_GUARD_VALUES: GuardValues = {
  enabled: false,
  key: '',
  value: '',
  inherited: false,
};

/** The guard to record, or none when the form does not ask for one or names no key. */
export function guardStamp(values: GuardValues): GuardStamp | undefined {
  const key = values.key.trim();
  if (!values.enabled || key === '') return undefined;
  return { [key]: values.value.trim() };
}

/** Whether the form can be sent: no guard asked for, or one with a key. */
export const guardValuesComplete = (values: GuardValues): boolean =>
  !values.enabled || values.key.trim() !== '';

/** The guard as the invoke API takes it: `guards`, or `inheritedGuards` for an inherited one. */
export function guardParams(values: GuardValues): {
  guards?: string;
  inheritedGuards?: string;
} {
  const stamp = guardStamp(values);
  if (!stamp) return {};
  return values.inherited
    ? { inheritedGuards: JSON.stringify(stamp) }
    : { guards: JSON.stringify(stamp) };
}

/**
 * A clearance that also covers the guard the write records, narrowly: In its value. Requirements
 * of one key are alternatives, so adding one widens nothing the clearance already said.
 */
export function clearanceRecording(
  clearance: Clearance | undefined,
  values: GuardValues,
): Clearance | undefined {
  const stamp = guardStamp(values);
  if (!stamp) return clearance;
  const covering = clearanceCovering(
    Object.entries(stamp).map(([Key, Value]) => ({ Key, Value })),
  );
  return [...(clearance ?? []), ...covering];
}
