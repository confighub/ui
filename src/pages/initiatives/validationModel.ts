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
  triggerControls,
  triggerPriority,
  unitVerdicts,
} from '../../utility/triggerEnforcement';
import {
  type FindingIssue,
  extraDetails,
  findingIssues,
} from '../unit-detail/components/action-side-bar/validationFindings';

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
  /** The gates of the Triggers that had nothing to check in the Unit. */
  validationSkipped?: Record<string, boolean>;
  validationTriggerIds?: Record<string, string>;
  headRevisionNum?: number;
  lastChangeDescription?: string;
}

/**
 * A Unit's outcome under one Trigger: its verdict, or NotEvaluated when the Trigger has none. A
 * Unit the Trigger skipped, having nothing to check in it, has no outcome: it is not in scope.
 */
export type UnitOutcome = Exclude<UnitVerdict, 'Skipped'> | 'NotEvaluated';

/**
 * Why a Unit in a Trigger's scope has no verdict from it.
 *
 * - TriggerDisabled: the Trigger is disabled, so it runs nowhere.
 * - NoResults: the Unit's head Revision recorded no Trigger results at all. A Revision made
 *   without running Triggers, such as one setting path guards, starts with none.
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
    'Its head Revision recorded no Trigger results: it was made without running Triggers, such as by setting path guards.',
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

/**
 * The errors and warnings on the cards of a set of Triggers, summed: a Unit failing two of them
 * counts once for each, as it does on each card.
 */
export const failureTotals = (
  policies: ValidationPolicy[],
): Pick<OutcomeCounts, 'error' | 'warning'> =>
  policies.reduce(
    (t, p) => ({
      error: t.error + p.unitCounts.error,
      warning: t.warning + p.unitCounts.warning,
    }),
    { error: 0, warning: 0 },
  );

export interface ValidationPolicy {
  trigger: TriggerRead;
  id: string;
  name: string;
  spaceSlug: string;
  stage: EnforcementStage;
  priority: TriggerPriority;
  enforcedBy?: string;
  enforcedAt?: string;
  /** The numbers of the controls the Trigger's policy covers, from its Controls annotation. */
  controls: string[];
  /** The Spaces and Targets whose Trigger lists include this Trigger. */
  spaces: ScopeSpace[];
  targets: ScopeTarget[];
  /** The Units it applies to, with how each fared. */
  units: PolicyUnit[];
  unitCounts: OutcomeCounts;
  /** The Units the Trigger last found nothing to check in, which are not in its scope. */
  skippedUnits: ScopeUnit[];
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
 * NotEvaluated; the page says so. A Unit in which the Trigger had nothing to check -- its
 * WhereResource selects no resource there -- is not in scope, as `cub manage guardrails status`
 * does not count it.
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
        ValidationSkipped: u.validationSkipped,
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
    const skippedUnits: ScopeUnit[] = [];
    const unitCounts = emptyCounts();
    for (const unit of units) {
      const verdict = verdictsByUnit.get(unit.id)?.get(id);
      const selected =
        (spaceIds.has(unit.spaceId) || (!!unit.targetId && targetIds.has(unit.targetId))) &&
        (!trigger.ToolchainType || unit.toolchainType === trigger.ToolchainType);
      if (!verdict && !selected) continue;
      // Nothing for the Trigger to check in the Unit: it is not one the Trigger applies to.
      if (verdict?.verdict === 'Skipped') {
        skippedUnits.push(unit);
        continue;
      }
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
        controls: triggerControls(trigger.Annotations),
        spaces: policySpaces,
        targets: policyTargets,
        units: policyUnits,
        unitCounts,
        skippedUnits,
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

/**
 * The Units whose verdict from a Trigger is the kind of failure its stage does not give: an error
 * from an Audited Trigger, which warns, or a warning from an Enforced one, which blocks. Each was
 * recorded before the Trigger changed between the two, and stays until the Trigger runs on the
 * Unit again.
 */
export const staleFailures = (policy: ValidationPolicy): number =>
  policy.stage === 'Audited'
    ? policy.unitCounts.error
    : policy.stage === 'Enforced'
      ? policy.unitCounts.warning
      : 0;

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

/** A cluster-scoped resource's name may or may not start with a slash. */
const sameName = (a: string, b: string): boolean =>
  a.replace(/^\//, '') === b.replace(/^\//, '');

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
      if (name && ![...seen.values()].some((r) => sameName(r.name, name)))
        seen.set(`|${name}`, { name });
    }
  }
  return [...seen.values()];
};

/**
 * What a Trigger's results on a Unit found wrong, each once: the issues of the results and of their
 * failed attributes, with the check that found each, and the details that do not repeat them.
 */
export const failureIssues = (results: ValidationResultList | undefined): FindingIssue[] => {
  const seen = new Map<string, FindingIssue>();
  const add = (issue: FindingIssue) =>
    seen.set(`${issue.identifier ?? ''}\u0000${issue.message}`, issue);
  for (const result of results ?? []) {
    if (result.Passed) continue;
    findingIssues(result.Issues).forEach(add);
    for (const attr of result.FailedAttributes ?? []) findingIssues(attr.Issues).forEach(add);
    extraDetails(result).forEach((message) => add({ message }));
  }
  return [...seen.values()];
};

/**
 * The annotations a Trigger's WhereResource excepts resources by: each clause
 * `metadata.annotations.<key> IS NULL`, as guardrail rules are written, in the order written.
 */
const exceptionAnnotationPaths = (whereResource?: string): string[] =>
  (whereResource ?? '').split(/\s+AND\s+/i).flatMap((clause) => {
    const m = /^\s*(metadata\.annotations\.\S+)\s+IS\s+NULL\s*$/i.exec(clause);
    return m ? [m[1]] : [];
  });

/**
 * The annotation a Trigger's WhereResource excepts resources by, when it skips every resource
 * carrying one: its own, named after the Trigger as guardrail rules name it, else the first.
 * Returns the annotation path as the WhereResource writes it, or undefined.
 */
export const exceptionAnnotationPath = (
  whereResource?: string,
  triggerSlug?: string,
): string | undefined => {
  const paths = exceptionAnnotationPaths(whereResource);
  return (
    paths.find(
      (path) => !!triggerSlug && annotationKeyOfPath(path).endsWith(`/${triggerSlug}`),
    ) ?? paths[0]
  );
};

/**
 * The annotations of other rules a Trigger's WhereResource also skips resources by: a rule that
 * overlaps another honors its exceptions, so a resource excepted from that rule is not failed
 * by this one either.
 */
export const honoredExceptionPaths = (
  whereResource?: string,
  triggerSlug?: string,
): string[] => {
  const own = exceptionAnnotationPath(whereResource, triggerSlug);
  return exceptionAnnotationPaths(whereResource).filter((path) => path !== own);
};

/** The annotation key an exception path names, with its escaped dots restored. */
export const annotationKeyOfPath = (path: string): string =>
  path.replace(/^metadata\.annotations\./, '').replace(/~1/g, '.');

/**
 * The reason of a temporary exception starts with this: one recorded for a failure that is to be
 * fixed, so that its Trigger could be enforced without waiting for it. The SDK's guardrails
 * package, which `cub manage guardrails exception add-temporary` uses, writes the same prefix.
 */
export const TEMPORARY_EXCEPTION_PREFIX = 'ToBeFixed';

/** The reason a temporary exception records: the prefix, then why the failure is not fixed yet. */
export const temporaryReason = (reason: string): string =>
  `${TEMPORARY_EXCEPTION_PREFIX}: ${reason.trim()}`;

/** Whether an exception's reason marks it as temporary. */
export const isTemporaryException = (reason: string | undefined): boolean => {
  const trimmed = (reason ?? '').trim();
  if (!trimmed.startsWith(TEMPORARY_EXCEPTION_PREFIX)) return false;
  const rest = trimmed.slice(TEMPORARY_EXCEPTION_PREFIX.length);
  return rest === '' || rest[0] === ':' || rest[0] === ' ';
};

/** A resource of a Unit, as the resource list names it. */
export interface NamedResource {
  type: string;
  name: string;
}

/**
 * Why a failing Unit is excepted from nothing, as a kind Units can be counted by. The SDK's
 * guardrails package names the same kinds.
 */
export type NotExceptedKind = 'AlreadyExcepted' | 'Ambiguous' | 'NotHeld' | 'Unnamed';

/** What each kind means, for a group of Units. */
export const NOT_EXCEPTED_TEXT: Record<NotExceptedKind, string> = {
  Unnamed: 'Their results do not name the resource that fails, and each holds several.',
  NotHeld: 'Their results name a resource they do not hold.',
  Ambiguous:
    'Their results name a resource without its type, and each holds more than one of that name.',
  AlreadyExcepted: 'Already excepted: their verdicts are from before. Evaluate them again.',
};

/**
 * Which resources of one failing Unit to except from its Trigger: those its results name, or,
 * when they name none, its only resource. A Unit whose failures cannot all be placed is excepted
 * from nothing, and `kind` says why, so that every Unit left out is one that still fails.
 * Resources already excepted are left out; when that leaves nothing, the Unit's verdict is from
 * before the exception.
 *
 * The SDK's guardrails package has the same rule for `exception add-temporary`; the specs of
 * both run the same cases.
 */
export const resourcesToExcept = (
  failed: FailedResource[],
  all: NamedResource[],
  isExcepted: (r: NamedResource) => boolean,
):
  | { resources: NamedResource[]; kind?: undefined }
  | { resources?: undefined; kind: NotExceptedKind } => {
  const chosen: NamedResource[] = [];
  if (failed.length === 0) {
    if (all.length !== 1) return { kind: 'Unnamed' };
    chosen.push(all[0]);
  }
  for (const f of failed) {
    const matches = all.filter(
      (r) => sameName(r.name, f.name) && (!f.type || r.type === f.type),
    );
    if (matches.length === 0) return { kind: 'NotHeld' };
    if (matches.length > 1) return { kind: 'Ambiguous' };
    if (!chosen.some((r) => r.type === matches[0].type && r.name === matches[0].name))
      chosen.push(matches[0]);
  }
  const resources = chosen.filter((r) => !isExcepted(r));
  if (resources.length === 0) return { kind: 'AlreadyExcepted' };
  return { resources };
};
