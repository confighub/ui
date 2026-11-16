// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Validation page's derivation: a validating Trigger's enforcement stage, and how
// the Units, Spaces and resources it applies to fared, from one list each of
// Triggers, Spaces, Targets and Units. Browser-free.
import { expect, test } from '@playwright/test';

import {
  type ScopeSpace,
  type ScopeUnit,
  annotationKeyOfPath,
  buildPolicies,
  exceptionAnnotationPath,
  failedResources,
  failureIssues,
  groupCounts,
  honoredExceptionPaths,
  notEvaluatedReason,
} from '../src/pages/initiatives/validationModel';
import {
  enforcedAtAfter,
  enforcementDate,
  enforcementStage,
  formatControls,
  toEnforcementTime,
  triggerControls,
  triggerPriority,
  unitVerdicts,
} from '../src/utility/triggerEnforcement';

const POLICY = 'policy-space';
const APP = 'app-space';
const OTHER = 'other-space';

const space = (id: string, triggerIds: string[], componentId?: string): ScopeSpace => ({
  id,
  slug: id,
  name: id,
  componentId,
  triggerIds,
});

const unit = (
  id: string,
  spaceId: string,
  gates: Record<string, string>,
  failing: { warn?: string[]; error?: string[] } = {},
): ScopeUnit => ({
  id,
  slug: id,
  spaceId,
  toolchainType: 'Kubernetes/YAML',
  validationTriggerIds: gates,
  validationWarnings: Object.fromEntries((failing.warn ?? []).map((g) => [g, true])),
  validationErrors: Object.fromEntries((failing.error ?? []).map((g) => [g, true])),
});

test.describe('enforcement stage', () => {
  test('is computed from Disabled, selection and Warn', () => {
    expect(enforcementStage({ Disabled: true, Warn: false }, true)).toBe('Disabled');
    expect(enforcementStage({ Disabled: false, Warn: true }, false)).toBe('Created');
    expect(enforcementStage({ Disabled: false, Warn: true }, true)).toBe('Audited');
    expect(enforcementStage({ Disabled: false, Warn: false }, true)).toBe('Enforced');
  });

  test('priority is read without regard to case, and missing is Unspecified', () => {
    expect(triggerPriority({ Priority: 'high' })).toBe('High');
    expect(triggerPriority({})).toBe('Unspecified');
    expect(triggerPriority({ Priority: 'urgent' })).toBe('Unspecified');
  });

  test('EnforcedAt is stamped on enforcing or creating blocking, kept while enforced, and removed on warning', () => {
    const now = new Date('2026-11-09T12:00:00.000Z');
    expect(enforcedAtAfter({ Warn: true }, false, now)).toBe('2026-11-09T12:00:00Z');
    // A Trigger created blocking is enforced from its creation.
    expect(enforcedAtAfter(undefined, false, now)).toBe('2026-11-09T12:00:00Z');
    expect(enforcedAtAfter(undefined, true, now)).toBeUndefined();
    expect(
      enforcedAtAfter(
        { Warn: false, Annotations: { EnforcedAt: '2026-10-01T00:00:00Z' } },
        false,
        now,
      ),
    ).toBe('2026-10-01T00:00:00Z');
    expect(
      enforcedAtAfter(
        { Warn: false, Annotations: { EnforcedAt: '2026-10-01T00:00:00Z' } },
        true,
        now,
      ),
    ).toBeUndefined();
  });

  test('a date is the start of its day in UTC, and reads back as the same date', () => {
    expect(toEnforcementTime('2026-12-31')).toBe('2026-12-31T00:00:00Z');
    expect(enforcementDate('2026-12-31T00:00:00Z')).toBe('2026-12-31');
    expect(toEnforcementTime('')).toBe('');
  });
});

test.describe('unit verdicts', () => {
  test('a failure under any of a renamed Trigger’s gate names wins over a pass under another', () => {
    const v = unitVerdicts({
      ValidationTriggerIDs: {
        'p/old/vet-cel': 't1',
        'p/new/vet-cel': 't1',
        'p/ok/vet-cel': 't2',
      },
      ValidationWarnings: { 'p/new/vet-cel': true },
    });
    expect(v.get('t1')?.verdict).toBe('Warning');
    expect(v.get('t1')?.gates.sort()).toEqual(['p/new/vet-cel', 'p/old/vet-cel']);
    expect(v.get('t2')?.verdict).toBe('Passed');
  });

  test('a Trigger with nothing to check in the Unit is skipped there, and a failure still wins', () => {
    const v = unitVerdicts({
      ValidationTriggerIDs: {
        'p/skips/vet-cel': 't1',
        'p/old/vet-cel': 't2',
        'p/new/vet-cel': 't2',
      },
      ValidationSkipped: { 'p/skips/vet-cel': true, 'p/old/vet-cel': true },
      ValidationErrors: { 'p/new/vet-cel': true },
    });
    expect(v.get('t1')?.verdict).toBe('Skipped');
    expect(v.get('t2')?.verdict).toBe('Error');
  });
});

test.describe('policies', () => {
  const trigger = (id: string, warn = true) => ({
    TriggerID: id,
    Slug: id,
    SpaceID: POLICY,
    ToolchainType: 'Kubernetes/YAML',
    Warn: warn,
  });

  test('the policy Space selecting its own Triggers is not a enforcement', () => {
    const [p] = buildPolicies([trigger('t1')], [space(POLICY, ['t1'])], [], []);
    expect(p.stage).toBe('Created');
    expect(p.spaces).toEqual([]);
  });

  test('Units in selecting Spaces are in scope, with or without a verdict', () => {
    const gate = `${POLICY}/t1/vet-cel`;
    const units = [
      unit('passes', APP, { [gate]: 't1' }),
      unit('warns', APP, { [gate]: 't1' }, { warn: [gate] }),
      unit('not-yet', APP, {}),
      unit('elsewhere', OTHER, {}),
    ];
    const [p] = buildPolicies(
      [trigger('t1')],
      [space(POLICY, ['t1']), space(APP, ['t1'], 'comp'), space(OTHER, [])],
      [],
      units,
    );
    expect(p.stage).toBe('Audited');
    expect(p.spaces.map((s) => s.id)).toEqual([APP]);
    expect(p.unitCounts).toEqual({
      total: 3,
      passed: 1,
      warning: 1,
      error: 0,
      notEvaluated: 1,
    });
    // A Space fails when any Unit in it does.
    expect(groupCounts(p.units, (u) => u.unit.spaceId)).toMatchObject({
      total: 1,
      warning: 1,
    });
  });

  test('a Unit in which the Trigger had nothing to check is not in its scope', () => {
    const gate = `${POLICY}/t1/vet-cel`;
    const [p] = buildPolicies(
      [trigger('t1')],
      [space(POLICY, ['t1']), space(APP, ['t1'])],
      [],
      [
        unit('passes', APP, { [gate]: 't1' }),
        {
          ...unit('no-workloads', APP, { [gate]: 't1' }),
          validationSkipped: { [gate]: true },
        },
      ],
    );
    expect(p.units.map((u) => u.unit.id)).toEqual(['passes']);
    expect(p.unitCounts).toMatchObject({ total: 1, passed: 1, notEvaluated: 0 });
  });
});

test.describe('results', () => {
  test('failing resources come from FailedAttributes and from vet-cel detail lines', () => {
    const names = failedResources([
      { Passed: true, Index: 0 },
      {
        Passed: false,
        Index: 1,
        Details: ['resource shop/api failed validation', 'something else'],
        FailedAttributes: [{ ResourceName: 'shop/db', ResourceType: 'apps/v1/Deployment' }],
      },
    ]).map((r) => r.name);
    expect(names.sort()).toEqual(['shop/api', 'shop/db']);
  });

  test('the exception annotation is read from a guardrail WhereResource', () => {
    const path = exceptionAnnotationPath(
      'metadata.annotations.exceptions~1guardrails~1confighub~1com/workload-runs-nonroot IS NULL',
    );
    expect(path).toBe(
      'metadata.annotations.exceptions~1guardrails~1confighub~1com/workload-runs-nonroot',
    );
    expect(annotationKeyOfPath(path!)).toBe(
      'exceptions.guardrails.confighub.com/workload-runs-nonroot',
    );
    expect(exceptionAnnotationPath("metadata.namespace = 'x'")).toBeUndefined();
  });

  test("a rule honoring another's exceptions has its own annotation, then the other's", () => {
    const prefix = 'metadata.annotations.exceptions~1guardrails~1confighub~1com/';
    const where = `ConfigHub.ResourceType IN ('apps/v1/Deployment') AND ${prefix}workload-runs-nonroot IS NULL AND ${prefix}workload-pod-security-restricted IS NULL`;
    expect(exceptionAnnotationPath(where, 'workload-pod-security-restricted')).toBe(
      `${prefix}workload-pod-security-restricted`,
    );
    expect(honoredExceptionPaths(where, 'workload-pod-security-restricted')).toEqual([
      `${prefix}workload-runs-nonroot`,
    ]);
    // A rule named otherwise reads its first clause as its own, as before.
    expect(exceptionAnnotationPath(where, 'renamed')).toBe(`${prefix}workload-runs-nonroot`);
    expect(honoredExceptionPaths(`${prefix}only IS NULL`, 'only')).toEqual([]);
  });
});

test.describe('why a Unit is not evaluated', () => {
  const base = { id: 'u', slug: 'u', spaceId: APP };
  test('a disabled Trigger says so first', () => {
    expect(notEvaluatedReason({ ...base, validationTriggerIds: {} }, true)).toBe(
      'TriggerDisabled',
    );
  });
  test('a head Revision with no results at all', () => {
    expect(notEvaluatedReason({ ...base }, false)).toBe('NoResults');
  });
  test('a head Revision that kept only failures', () => {
    expect(
      notEvaluatedReason(
        { ...base, validationTriggerIds: { g: 't2' }, validationWarnings: { g: true } },
        false,
      ),
    ).toBe('OnlyFailures');
  });
  test('other Triggers passed, this one has not run', () => {
    expect(notEvaluatedReason({ ...base, validationTriggerIds: { g: 't2' } }, false)).toBe(
      'NotRunSince',
    );
  });
});

test("a Trigger's controls are read from its Controls annotation and written as the CLI writes them", () => {
  expect(triggerControls({ Controls: 'CH-0301, CH-0302,,CH-0310' })).toEqual([
    'CH-0301',
    'CH-0302',
    'CH-0310',
  ]);
  expect(triggerControls(undefined)).toEqual([]);
  expect(formatControls([])).toBe('');
  expect(formatControls(['CH-0385', 'CH-0386'])).toBe('CH-0385,CH-0386');
  expect(formatControls(['CH-0201', 'CH-0202', 'CH-0203', 'CH-0204'])).toBe('CH-0201–CH-0204');
  expect(formatControls(['CH-0312', 'CH-0313', 'CH-0315', 'CH-0316', 'CH-0317'])).toBe(
    'CH-0312,CH-0313,CH-0315–CH-0317',
  );
  expect(formatControls(['CH-0999', 'CH-1000', 'CH-1001'])).toBe('CH-0999–CH-1001');
  expect(formatControls(['CH-099', 'CH-0100', 'CH-0101'])).toBe('CH-099,CH-0100,CH-0101');
  expect(formatControls(['C-0012', 'custom', 'C-0013'])).toBe('C-0012,custom,C-0013');
});

test('a policy carries the controls its Trigger covers', () => {
  const [policy] = buildPolicies(
    [
      {
        TriggerID: 't1',
        SpaceID: POLICY,
        Slug: 'correctness',
        Validating: true,
        Annotations: { Controls: 'CH-0201,CH-0202' },
      },
    ],
    [],
    [],
    [],
  );
  expect(policy.controls).toEqual(['CH-0201', 'CH-0202']);
});

test("a Unit's failure issues are each listed once, with their checks, and details that only repeat them are left out", () => {
  expect(
    failureIssues([
      {
        Passed: false,
        Index: 0,
        Details: ['volumeMounts 0 names the volume "data", which the pod does not have'],
        FailedAttributes: [
          {
            ResourceName: 'temporal/temporal-postgres',
            Issues: [
              {
                Identifier: 'volume-references',
                Message: 'volumeMounts 0 names the volume "data", which the pod does not have',
              },
            ],
          },
          {
            ResourceName: 'temporal/temporal-postgres-2',
            Issues: [
              {
                Identifier: 'volume-references',
                Message: 'volumeMounts 0 names the volume "data", which the pod does not have',
              },
            ],
          },
        ],
      },
      { Passed: true, Index: 1, Issues: [{ Identifier: 'x', Message: 'passed' }] },
    ]),
  ).toEqual([
    {
      identifier: 'volume-references',
      message: 'volumeMounts 0 names the volume "data", which the pod does not have',
    },
  ]);
});
