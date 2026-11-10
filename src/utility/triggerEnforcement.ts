// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The enforcement of a validating Trigger's policy. A policy starts in audit (Warn true), so what fails
 * it gets ValidationWarnings; its warnings are worked down by fixing configuration or adding
 * exceptions; then it is enforced (Warn false), and what still fails it gets ValidationErrors.
 *
 * Where a Trigger stands is computed from it and from the Spaces and Targets that select it. Only
 * what cannot be computed is stored, as annotations on the Trigger, under the keys the SDK's
 * constants package names, so that cub and the manager tools read and write the same ones.
 */
import type { TriggerRead, UnitRead } from '@confighub/rtk-query';
import dayjs from 'dayjs';

export const PRIORITY_ANNOTATION = 'Priority';
export const ENFORCED_BY_ANNOTATION = 'EnforcedBy';
export const ENFORCED_AT_ANNOTATION = 'EnforcedAt';

/** The annotations a Trigger form shows as their own fields rather than as annotation rows. */
export const ENFORCEMENT_ANNOTATIONS = [
  PRIORITY_ANNOTATION,
  ENFORCED_BY_ANNOTATION,
  ENFORCED_AT_ANNOTATION,
];

export type TriggerPriority = 'High' | 'Medium' | 'Low' | 'Unspecified';

/** Most urgent first. Unspecified is not stored: choosing it removes the annotation. */
export const TRIGGER_PRIORITIES: TriggerPriority[] = ['High', 'Medium', 'Low', 'Unspecified'];

export const PRIORITY_COLORS: Record<TriggerPriority, { bg: string; color: string }> = {
  High: { bg: '#ffebee', color: '#c62828' },
  Medium: { bg: '#fff3e0', color: '#e65100' },
  Low: { bg: '#f5f5f5', color: '#616161' },
  Unspecified: { bg: 'transparent', color: '#9e9e9e' },
};

/** A Trigger's priority, matched without regard to case as the CLI matches it. */
export const triggerPriority = (
  annotations?: Record<string, string> | null,
): TriggerPriority => {
  const value = annotations?.[PRIORITY_ANNOTATION]?.toLowerCase();
  return TRIGGER_PRIORITIES.find((p) => p.toLowerCase() === value) ?? 'Unspecified';
};

export type EnforcementStage = 'Created' | 'Audited' | 'Enforced' | 'Disabled';

export const ENFORCEMENT_STAGES: EnforcementStage[] = [
  'Created',
  'Audited',
  'Enforced',
  'Disabled',
];

export const ENFORCEMENT_STAGE_INFO: Record<
  EnforcementStage,
  { label: string; dotColor: string; description: string }
> = {
  Created: {
    label: 'Created',
    dotColor: '#9E9E9E',
    description: 'No Space or Target selects the Trigger, so it checks nothing yet.',
  },
  Audited: {
    label: 'Audited',
    dotColor: '#ed6c02',
    description: 'Selected, and warns: configuration that fails it gets ValidationWarnings.',
  },
  Enforced: {
    label: 'Enforced',
    dotColor: '#2e7d32',
    description: 'Selected, and blocks: configuration that fails it gets ValidationErrors.',
  },
  Disabled: {
    label: 'Disabled',
    dotColor: '#757575',
    description: 'Disabled, so it checks nothing wherever it is selected.',
  },
};

/** The stage of a Trigger that `selected` says some Space or Target selects. */
export const enforcementStage = (
  trigger: Pick<TriggerRead, 'Disabled' | 'Warn'>,
  selected: boolean,
): EnforcementStage => {
  if (trigger.Disabled) return 'Disabled';
  if (!selected) return 'Created';
  return trigger.Warn ? 'Audited' : 'Enforced';
};

/**
 * A enforcement time as stored: RFC 3339 in UTC, as every time in the API is written. A date picked in
 * a form (2026-12-31) is the start of that day in UTC. Empty returns empty, which removes it.
 */
export const toEnforcementTime = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00Z`)
    : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString().replace(/\.\d{3}Z$/, 'Z');
};

/** The date of a stored enforcement time, for a date input (2026-12-31), or empty. */
export const enforcementDate = (value?: string): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

/**
 * The EnforcedAt a Trigger should have after a change of Warn: the time it was enforced while it
 * stays enforced, now when it becomes enforced -- including when it is created blocking -- and none
 * while it warns.
 */
export const enforcedAtAfter = (
  before: Pick<TriggerRead, 'Warn' | 'Annotations'> | undefined,
  warn: boolean,
  now: Date = new Date(),
): string | undefined => {
  if (warn) return undefined;
  if (before && !before.Warn) return before.Annotations?.[ENFORCED_AT_ANNOTATION];
  return toEnforcementTime(now.toISOString());
};

/** The verdict of a validating Trigger on a Unit's head Revision. */
export type UnitVerdict = 'Error' | 'Warning' | 'Passed';

const VERDICT_RANK: Record<UnitVerdict, number> = { Passed: 0, Warning: 1, Error: 2 };

/**
 * The verdict of each Trigger that ran on a Unit, by Trigger ID, with the gate names it ran under.
 *
 * ValidationTriggerIDs maps each gate in ValidationErrors and ValidationWarnings, and in the head
 * Revision's ValidationPassed, to the Trigger that wrote it, so a gate in neither of the first two
 * passed. A Trigger renamed since can have passed under its old name and fail under its new one, so
 * a failure under any of its names wins.
 */
export const unitVerdicts = (
  unit: Pick<UnitRead, 'ValidationTriggerIDs' | 'ValidationErrors' | 'ValidationWarnings'>,
): Map<string, { verdict: UnitVerdict; gates: string[] }> => {
  const out = new Map<string, { verdict: UnitVerdict; gates: string[] }>();
  for (const [gate, triggerId] of Object.entries(unit.ValidationTriggerIDs ?? {})) {
    const verdict: UnitVerdict = unit.ValidationErrors?.[gate]
      ? 'Error'
      : unit.ValidationWarnings?.[gate]
        ? 'Warning'
        : 'Passed';
    const seen = out.get(triggerId);
    if (!seen) {
      out.set(triggerId, { verdict, gates: [gate] });
      continue;
    }
    seen.gates.push(gate);
    if (VERDICT_RANK[verdict] > VERDICT_RANK[seen.verdict]) seen.verdict = verdict;
  }
  return out;
};

/**
 * A stored enforcement time for display, by its date in UTC, as it was set: an EnforcedBy of
 * 2026-11-01 reads Nov 1 wherever the reader is, not Oct 31 to the west of UTC.
 */
export const formatEnforcementDate = (value: string | undefined, format = 'MMM D'): string => {
  const date = enforcementDate(value);
  return date ? dayjs(date).format(format) : '';
};
