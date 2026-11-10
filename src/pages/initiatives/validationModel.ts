// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the Validation page shows of each validating Trigger: where its enforcement stands, what selects
 * it, and how the Units it applies to fared. Everything is computed from one list each of Triggers,
 * Spaces, Targets and Units; nothing is stored but the Trigger's own enforcement annotations.
 */
import type { TriggerRead, ValidationResultList } from '@confighub/rtk-query';

import {
  ENFORCED_AT_ANNOTATION,
  ENFORCED_BY_ANNOTATION,
  type EnforcementStage,
  type TriggerPriority,
  type UnitVerdict,
  enforcementStage,
  triggerPriority,
  unitVerdicts,
} from '../../utility/triggerEnforcement';

/** What the page reads of a Space. */
export interface ScopeSpace {
  id: string;
  slug: string;
  name: string;
  componentId?: string;
  labels?: Record<string, string>;
  triggerIds: string[];
}

/** What the page reads of a Target. */
export interface ScopeTarget {
  id: string;
  spaceId: string;
  slug: string;
  name: string;
  triggerIds: string[];
}

/** What the page reads of a Unit. */
export interface ScopeUnit {
  id: string;
  slug: string;
  spaceId: string;
  targetId?: string;
  toolchainType?: string;
  validationErrors?: Record<string, boolean>;
  validationWarnings?: Record<string, boolean>;
  validationTriggerIds?: Record<string, string>;
  headRevisionNum?: number;
  lastChangeDescription?: string;
}

/** A Unit's outcome under one Trigger: its verdict, or NotEvaluated when the Trigger has none. */
export type UnitOutcome = UnitVerdict | 'NotEvaluated';

/**
 * Why a Unit in a Trigger's scope has no verdict from it.
 *
 * - TriggerDisabled: the Trigger is disabled, so it runs nowhere.
 * - NoResults: the Unit's head Revision recorded no Trigger results at all. A Revision made
 *   without running Triggers, such as one setting path protection, starts with none.
 * - OnlyFailures: the head Revision kept the failing results of other Triggers and no passes,
 *   the same loss: passes are not carried to a Revision made without running Triggers.
 * - NotRunSince: other Triggers have results and this one has none. It was selected, enabled or
 *   changed after the Unit was last evaluated; a change to a Trigger re-evaluates only the Units
 *   of the Space it is in.
 */
export type NotEvaluatedReason =
  | 'TriggerDisabled'
  | 'NoResults'
  | 'OnlyFailures'
  | 'NotRunSince';

export const NOT_EVALUATED_TEXT: Record<NotEvaluatedReason, string> = {
  TriggerDisabled: 'The Trigger is disabled.',
  NoResults:
    'Its head Revision recorded no Trigger results: it was made without running Triggers, such as by setting path protection.',
  OnlyFailures:
    'Its head Revision kept only the failing results of other Triggers: it was made without running Triggers, which drops passes.',
  NotRunSince:
    'The Trigger has not run on it since the Trigger was selected, enabled or changed. A change to a Trigger re-evaluates only the Units of its own Space.',
};

export interface PolicyUnit {
  unit: ScopeUnit;
  outcome: UnitOutcome;
  /** The gate names the Trigger's verdict is under, for reading its results. */
  gates: string[];
  /** Why there is no verdict, for a NotEvaluated Unit. */
  reason?: NotEvaluatedReason;
}

/** Why a Unit in scope has no verdict from a Trigger. */
export const notEvaluatedReason = (
  unit: ScopeUnit,
  triggerDisabled: boolean,
): NotEvaluatedReason => {
  if (triggerDisabled) return 'TriggerDisabled';
  const gates = Object.keys(unit.validationTriggerIds ?? {});
  if (gates.length === 0) return 'NoResults';
  const failing = (gate: string) =>
    !!unit.validationErrors?.[gate] || !!unit.validationWarnings?.[gate];
  return gates.every(failing) ? 'OnlyFailures' : 'NotRunSince';
};

/** Counts of things by outcome. A group fails when any Unit in it fails. */
export interface OutcomeCounts {
  total: number;
  passed: number;
  warning: number;
  error: number;
  notEvaluated: number;
}

export const emptyCounts = (): OutcomeCounts => ({
  total: 0,
  passed: 0,
  warning: 0,
  error: 0,
  notEvaluated: 0,
});

export const failingOf = (c: OutcomeCounts): number => c.warning + c.error;

export interface ValidationPolicy {
  trigger: TriggerRead;
  id: string;
  name: string;
  spaceSlug: string;
  stage: EnforcementStage;
  priority: TriggerPriority;
  enforcedBy?: string;
  enforcedAt?: string;
  /** The Spaces and Targets whose Trigger lists include this Trigger. */
  spaces: ScopeSpace[];
  targets: ScopeTarget[];
  /** The Units it applies to, with how each fared. */
  units: PolicyUnit[];
  unitCounts: OutcomeCounts;
}

const outcomeRank: Record<UnitOutcome, number> = {
  NotEvaluated: 0,
  Passed: 1,
  Warning: 2,
  Error: 3,
};

const addOutcome = (c: OutcomeCounts, outcome: UnitOutcome) => {
  c.total++;
  if (outcome === 'Passed') c.passed++;
  else if (outcome === 'Warning') c.warning++;
  else if (outcome === 'Error') c.error++;
  else c.notEvaluated++;
};

/**
 * The outcome of a group of Units: the worst verdict among them, so a Space with one Unit failing
 * fails, and NotEvaluated only when none of them has a verdict.
 */
const groupOutcome = (outcomes: UnitOutcome[]): UnitOutcome =>
  outcomes.reduce<UnitOutcome>(
    (worst, o) => (outcomeRank[o] > outcomeRank[worst] ? o : worst),
    'NotEvaluated',
  );

/** Counts of the groups `keyOf` puts the Units in, each with its group outcome. */
export const groupCounts = (
  units: PolicyUnit[],
  keyOf: (u: PolicyUnit) => string | undefined,
): OutcomeCounts => {
  const groups = new Map<string, UnitOutcome[]>();
  for (const u of units) {
    const key = keyOf(u);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), u.outcome]);
  }
  const counts = emptyCounts();
  for (const outcomes of groups.values()) addOutcome(counts, groupOutcome(outcomes));
  return counts;
};

/**
 * Every validating Trigger, with its enforcement stage, its scope and the outcome on each Unit in it.
 *
 * A Trigger is selected by the Spaces and Targets whose Trigger lists include it, but for the Space
 * it resides in when that Space holds no Units of its toolchain, as a policy Space does not.
 *
 * A Unit is in a Trigger's scope when the Trigger has a verdict on it, or when its Space, or the
 * Target it is bound to, selects the Trigger and the Unit is of the Trigger's toolchain. A Trigger
 * narrowed further by WhereUnit or a Unit Filter applies to fewer of those, so some of them stay
 * NotEvaluated; the page says so.
 */
export const buildPolicies = (
  triggers: TriggerRead[],
  spaces: ScopeSpace[],
  targets: ScopeTarget[],
  units: ScopeUnit[],
): ValidationPolicy[] => {
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const selectingSpaces = new Map<string, ScopeSpace[]>();
  for (const s of spaces) {
    for (const id of s.triggerIds)
      selectingSpaces.set(id, [...(selectingSpaces.get(id) ?? []), s]);
  }
  const selectingTargets = new Map<string, ScopeTarget[]>();
  for (const t of targets) {
    for (const id of t.triggerIds)
      selectingTargets.set(id, [...(selectingTargets.get(id) ?? []), t]);
  }
  const verdictsByUnit = new Map(
    units.map((u) => [
      u.id,
      unitVerdicts({
        ValidationTriggerIDs: u.validationTriggerIds,
        ValidationErrors: u.validationErrors,
        ValidationWarnings: u.validationWarnings,
      }),
    ]),
  );

  // A Space selects its own Triggers unless told otherwise, so a policy Space selects every rule
  // written in it. That is not a enforcement: the Space it resides in counts only when it holds Units
  // the Trigger could check.
  const toolchainsBySpace = new Map<string, Set<string>>();
  for (const u of units) {
    if (!u.toolchainType) continue;
    const set = toolchainsBySpace.get(u.spaceId) ?? new Set<string>();
    set.add(u.toolchainType);
    toolchainsBySpace.set(u.spaceId, set);
  }

  return triggers.flatMap((trigger) => {
    const id = trigger.TriggerID;
    if (!id) return [];
    const policySpaces = (selectingSpaces.get(id) ?? []).filter(
      (s) =>
        s.id !== trigger.SpaceID ||
        (!!trigger.ToolchainType && !!toolchainsBySpace.get(s.id)?.has(trigger.ToolchainType)),
    );
    const policyTargets = selectingTargets.get(id) ?? [];
    const spaceIds = new Set(policySpaces.map((s) => s.id));
    const targetIds = new Set(policyTargets.map((t) => t.id));

    const policyUnits: PolicyUnit[] = [];
    const unitCounts = emptyCounts();
    for (const unit of units) {
      const verdict = verdictsByUnit.get(unit.id)?.get(id);
      const selected =
        (spaceIds.has(unit.spaceId) || (!!unit.targetId && targetIds.has(unit.targetId))) &&
        (!trigger.ToolchainType || unit.toolchainType === trigger.ToolchainType);
      if (!verdict && !selected) continue;
      const outcome: UnitOutcome = verdict?.verdict ?? 'NotEvaluated';
      policyUnits.push({
        unit,
        outcome,
        gates: verdict?.gates ?? [],
        reason: verdict ? undefined : notEvaluatedReason(unit, !!trigger.Disabled),
      });
      addOutcome(unitCounts, outcome);
    }

    return [
      {
        trigger,
        id,
        name: trigger.DisplayName || trigger.Slug || '',
        spaceSlug: spaceById.get(trigger.SpaceID ?? '')?.slug ?? '',
        stage: enforcementStage(trigger, policySpaces.length + policyTargets.length > 0),
        priority: triggerPriority(trigger.Annotations),
        enforcedBy: trigger.Annotations?.[ENFORCED_BY_ANNOTATION] || undefined,
        enforcedAt: trigger.Annotations?.[ENFORCED_AT_ANNOTATION] || undefined,
        spaces: policySpaces,
        targets: policyTargets,
        units: policyUnits,
        unitCounts,
      },
    ];
  });
};

const PRIORITY_ORDER: Record<TriggerPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  Unspecified: 3,
};

/**
 * The order of a stage's cards: most urgent first, then the soonest due, then the most failing.
 * Enforced and Disabled cards are done with their due dates, so they go most recently enforced
 * first instead.
 */
export const comparePolicies = (a: ValidationPolicy, b: ValidationPolicy): number => {
  if (a.stage === 'Enforced' && b.stage === 'Enforced') {
    const byEnforced = (b.enforcedAt ?? '').localeCompare(a.enforcedAt ?? '');
    if (byEnforced !== 0) return byEnforced;
  }
  const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (byPriority !== 0) return byPriority;
  if (a.enforcedBy !== b.enforcedBy) {
    if (!a.enforcedBy) return 1;
    if (!b.enforcedBy) return -1;
    return a.enforcedBy.localeCompare(b.enforcedBy);
  }
  const byFailing = failingOf(b.unitCounts) - failingOf(a.unitCounts);
  if (byFailing !== 0) return byFailing;
  return a.name.localeCompare(b.name);
};

/** Whether a policy is past the date it was due to be enforced and still is not. */
export const isOverdue = (policy: ValidationPolicy, now: Date = new Date()): boolean =>
  !!policy.enforcedBy &&
  (policy.stage === 'Created' || policy.stage === 'Audited') &&
  new Date(policy.enforcedBy).getTime() < now.getTime();

/** One resource a Trigger failed on, as its results name it. */
export interface FailedResource {
  /** The resource's type, when the result names it. */
  type?: string;
  /** Its name, namespace/name for a namespaced resource. */
  name: string;
}

// vet-cel reports a resource whose expression returned false only in a detail line, not as a
// FailedAttribute, so the line is read for the name as well.
const DETAIL_RESOURCE = /^resource (\S+) failed validation/;

/**
 * The resources a Trigger's results on a Unit name as failing, from their FailedAttributes and,
 * for functions that only describe them, their details. An empty list means the results name no
 * resource: the Unit failed as a whole, or the results are not loaded.
 */
export const failedResources = (
  results: ValidationResultList | undefined,
): FailedResource[] => {
  const seen = new Map<string, FailedResource>();
  for (const result of results ?? []) {
    if (result.Passed) continue;
    for (const attr of result.FailedAttributes ?? []) {
      const name = attr.ResourceName;
      if (!name) continue;
      seen.set(`${attr.ResourceType ?? ''}|${name}`, {
        type: attr.ResourceType || undefined,
        name,
      });
    }
    for (const detail of result.Details ?? []) {
      const name = DETAIL_RESOURCE.exec(detail)?.[1];
      if (name && ![...seen.values()].some((r) => r.name === name))
        seen.set(`|${name}`, { name });
    }
  }
  return [...seen.values()];
};

/** The messages a Trigger's results on a Unit carry, for a one-line summary of why it failed. */
export const failureMessages = (results: ValidationResultList | undefined): string[] => {
  const out: string[] = [];
  for (const result of results ?? []) {
    if (result.Passed) continue;
    for (const issue of result.Issues ?? []) if (issue.Message) out.push(issue.Message);
    for (const attr of result.FailedAttributes ?? []) {
      for (const issue of attr.Issues ?? []) if (issue.Message) out.push(issue.Message);
    }
    out.push(...(result.Details ?? []));
  }
  return [...new Set(out)];
};

/**
 * The annotation a Trigger's WhereResource excepts resources by, when it skips every resource
 * carrying one: the clause `metadata.annotations.<key> IS NULL`, as guardrail rules are written.
 * Returns the annotation path as the WhereResource writes it, or undefined.
 */
export const exceptionAnnotationPath = (whereResource?: string): string | undefined => {
  if (!whereResource) return undefined;
  for (const clause of whereResource.split(/\s+AND\s+/i)) {
    const m = /^\s*(metadata\.annotations\.\S+)\s+IS\s+NULL\s*$/i.exec(clause);
    if (m) return m[1];
  }
  return undefined;
};

/** The annotation key an exception path names, with its escaped dots restored. */
export const annotationKeyOfPath = (path: string): string =>
  path.replace(/^metadata\.annotations\./, '').replace(/~1/g, '.');
