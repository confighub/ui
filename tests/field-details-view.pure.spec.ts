// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Which buttons the field details show, and when they are disabled (PLAN.md U2). No inert button:
// an action without a handler is not shown. One contained button at most: the first need's
// action (R2).
import { expect, test } from '@playwright/test';

import { factsFromPath } from '../src/components/field-diagnosis/adapters';
import { explainField } from '../src/components/field-diagnosis/explainField';
import {
  editControl,
  needActionControl,
  restoreControl,
} from '../src/components/field-diagnosis/fieldDetailsControls';
import type { ExplainContext, FieldView } from '../src/components/field-diagnosis/fieldDiagnosis.types';
import { variantField } from '../src/components/field-diagnosis/variantField';
import { SEED, many, override, plain } from './fixtures/field-diagnosis/states';

const CTX: ExplainContext = { now: Date.parse('2026-11-19T14:00:00Z') };
const view = (patch: Partial<FieldView> = {}): FieldView => ({ ...explainField(factsFromPath(plain()), CTX), ...patch });

test.describe('Edit', () => {
  test('shown and enabled on a ready field with a handler', () => {
    expect(editControl(view(), true)).toEqual({ shown: true, disabled: false });
  });

  test('hidden without a handler (read-only pane): no inert button', () => {
    expect(editControl(view(), false).shown).toBe(false);
  });

  test('disabled with a reason on an absent or deleted field', () => {
    for (const state of ['absent', 'deleted'] as const) {
      const control = editControl(view({ state }), true);
      expect(control.shown).toBe(true);
      expect(control.disabled).toBe(true);
      expect(control.reason).toBeTruthy();
    }
  });

  test('not shown on a resource row', () => {
    expect(editControl(view({ state: 'resource' }), true).shown).toBe(false);
  });
});

test.describe('need actions', () => {
  const ctx: ExplainContext = { ...CTX, upstream: { unitId: SEED.stagingWebId, spaceId: SEED.stagingSpaceId, revisionNum: 3 } };

  test('only the first need with an action is contained', () => {
    const v = explainField(factsFromPath(many()), ctx);
    const states = v.needs.map((n, i) => needActionControl(v, n, i, true));
    expect(states.map((s) => s.contained)).toEqual([true, false, false, false]);
  });

  test('Apply disabled with a reason on an absent or deleted field', () => {
    const v = { ...explainField(factsFromPath(override()), ctx), state: 'absent' as const };
    const control = needActionControl(v, v.needs[0], 0, true);
    expect(control.disabled).toBe(true);
    expect(control.reason).toBeTruthy();
  });

  test('hidden without a handler', () => {
    const v = explainField(factsFromPath(override()), ctx);
    expect(needActionControl(v, v.needs[0], 0, false).shown).toBe(false);
  });
});

test.describe('Restore', () => {
  const entry = (value: string, current: boolean) => ({ value, who: 'admin', when: '2h ago', current });

  test('hidden for the current value', () => {
    expect(restoreControl(view(), entry('7', true), true).shown).toBe(false);
  });

  test('shown for an older value', () => {
    expect(restoreControl(view(), entry('3', false), true)).toEqual({ shown: true, disabled: false });
  });

  test('disabled on an absent or deleted field', () => {
    expect(restoreControl(view({ state: 'deleted' }), entry('3', false), true).disabled).toBe(true);
  });

  test('hidden without a handler', () => {
    expect(restoreControl(view(), entry('3', false), false).shown).toBe(false);
  });
});

test.describe('Variants: the same field in another Unit', () => {
  const replicas = { Ref: '7253c88', Path: 'spec.replicas', ResourceType: 'apps/v1/Deployment', ResourceNameWithoutScope: 'web' };

  test('matched by Ref, whatever the namespace', () => {
    const fields = [
      { Ref: 'other', Path: 'spec.replicas', ResourceType: 'apps/v1/Deployment', ResourceNameWithoutScope: 'api', Value: '2' },
      { Ref: '7253c88', Path: 'spec.replicas', ResourceType: 'apps/v1/Deployment', ResourceName: 'confighubplaceholder/web', Value: '7\n' },
    ];
    expect(variantField(fields, replicas)?.Value).toBe('7\n');
  });

  test('without a Ref match: by path, type and the name without its scope', () => {
    const fields = [
      { Path: 'spec.replicas', ResourceType: 'apps/v1/Deployment', ResourceNameWithoutScope: 'api', Value: '2' },
      { Path: 'spec.replicas', ResourceType: 'apps/v1/Deployment', ResourceNameWithoutScope: 'web', Value: '3' },
    ];
    expect(variantField(fields, { ...replicas, Ref: undefined })?.Value).toBe('3');
  });

  test('a Unit without the field gives undefined', () => {
    expect(variantField([], replicas)).toBeUndefined();
    expect(variantField(undefined, replicas)).toBeUndefined();
  });
});
