// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Where each reference in the field details goes in the Component side pane (PLAN.md U4, R4,
// D10): in view, a jump in place that pushes; otherwise the thing's own page. While the pane
// holds staged changes, a link that leaves the page opens a new tab.
import { expect, test } from '@playwright/test';

import type { ViewParamsPatch } from '../src/pages/x/apps/appTypes';
import { type PaneLinkContext, resolveComponentFieldRef } from '../src/pages/x/apps/field-diagnosis/componentFieldLinks';

const PROD = 'space-prod';
const STAGING = 'space-staging';
const OTHER = 'space-other-component';

function ctx(patch: Partial<PaneLinkContext> = {}) {
  const pushed: ViewParamsPatch[] = [];
  const value: PaneLinkContext = {
    inViewSpaceIds: new Set([PROD, STAGING]),
    field: { path: 'spec.replicas', fres: 'apps/v1/Deployment|ns/web', spaceId: PROD, unitId: 'unit-prod' },
    staged: 0,
    hrefFor: (p) => `/components?${new URLSearchParams(Object.entries(p).filter(([, v]) => typeof v === 'string') as [string, string][]).toString()}`,
    go: (p, options) => {
      if (options?.push) pushed.push(p);
    },
    ...patch,
  };
  return { value, pushed };
}

test.describe('Unit', () => {
  test('in view: the same field there, a jump that pushes', () => {
    const { value, pushed } = ctx();
    const target = resolveComponentFieldRef({ kind: 'unit', label: 'staging', spaceId: STAGING, unitId: 'unit-staging' }, value);
    expect(target.href).toContain(`space=${STAGING}`);
    expect(target.href).toContain('unit=unit-staging');
    expect(target.href).toContain('field=spec.replicas');
    target.jump?.();
    expect(pushed).toEqual([
      { space: STAGING, unit: 'unit-staging', field: 'spec.replicas', fres: 'apps/v1/Deployment|ns/web', tab: null, gate: null },
    ]);
  });

  test('in view, naming another field: that field', () => {
    const { value } = ctx();
    const target = resolveComponentFieldRef(
      { kind: 'unit', label: 'ns', spaceId: PROD, unitId: 'unit-ns', field: 'metadata.name', fres: 'v1/Namespace|' },
      value,
    );
    expect(target.href).toContain('field=metadata.name');
  });

  test('out of view: the Unit page, no jump', () => {
    const target = resolveComponentFieldRef({ kind: 'unit', label: 'x', spaceId: OTHER, unitId: 'u' }, ctx().value);
    expect(target.href?.startsWith(`/units/${OTHER}/u?`)).toBe(true);
    expect(target.jump).toBeUndefined();
    expect(target.newTab).toBeUndefined();
  });

  test('out of view while edits are staged: a new tab (D10)', () => {
    const target = resolveComponentFieldRef({ kind: 'unit', label: 'x', spaceId: OTHER, unitId: 'u' }, ctx({ staged: 2 }).value);
    expect(target.newTab).toBe(true);
    expect(target.note).toBe('Opens in a new tab: 2 staged changes');
  });

  test('another Space while changes are staged: a new tab, no jump, with a note (decision (b))', () => {
    const target = resolveComponentFieldRef({ kind: 'unit', label: 's', spaceId: STAGING, unitId: 'u' }, ctx({ staged: 2 }).value);
    expect(target.newTab).toBe(true);
    expect(target.jump).toBeUndefined();
    expect(target.note).toBe('Opens in a new tab: 2 staged changes');
    expect(target.href).toContain(`space=${STAGING}`);
  });

  test('the same Space while changes are staged: still in place (the edits stay)', () => {
    const target = resolveComponentFieldRef({ kind: 'unit', label: 'ns', spaceId: PROD, unitId: 'unit-ns' }, ctx({ staged: 1 }).value);
    expect(target.newTab).toBeUndefined();
    expect(target.jump).toBeDefined();
  });

  test('one staged change: the note says one', () => {
    const target = resolveComponentFieldRef({ kind: 'unit', label: 's', spaceId: STAGING, unitId: 'u' }, ctx({ staged: 1 }).value);
    expect(target.note).toBe('Opens in a new tab: 1 staged change');
  });

  test('without ids: plain text', () => {
    expect(resolveComponentFieldRef({ kind: 'unit', label: 'Upstream' }, ctx().value)).toEqual({});
  });
});

test.describe('gate', () => {
  test("the field's own Unit is in view: the Gates tab with that gate, a jump that pushes", () => {
    const { value, pushed } = ctx();
    const target = resolveComponentFieldRef({ kind: 'gate', label: 'no-root-user', triggerId: 't1' }, value);
    expect(target.href).toContain('tab=gates');
    expect(target.href).toContain('gate=t1');
    target.jump?.();
    expect(pushed).toEqual([{ tab: 'gates', gate: 't1', field: null, fres: null }]);
  });

  test('out of view: the gate page', () => {
    const { value } = ctx({ inViewSpaceIds: new Set() });
    expect(resolveComponentFieldRef({ kind: 'gate', label: 'g', triggerId: 't1' }, value)).toEqual({ href: '/validation/t1' });
  });

  test('no Trigger id: plain text', () => {
    expect(resolveComponentFieldRef({ kind: 'gate', label: 'g' }, ctx().value)).toEqual({});
  });
});

test.describe('Link', () => {
  test("in view: the provider Unit's metadata.name (a resource-name attribute), a jump", () => {
    const { value, pushed } = ctx();
    const target = resolveComponentFieldRef(
      { kind: 'link', label: 'Link web-to-ns', name: 'web-to-ns', providerUnitId: 'unit-ns', spaceId: PROD, attribute: 'resource-name', resourceType: 'v1/Namespace' },
      value,
    );
    target.jump?.();
    expect(pushed).toEqual([{ space: PROD, unit: 'unit-ns', field: 'metadata.name', fres: 'v1/Namespace|', tab: null, gate: null }]);
  });

  test("out of view, or no provider: this Unit's Links tab", () => {
    const target = resolveComponentFieldRef({ kind: 'link', label: 'Link x', name: 'x', spaceId: OTHER }, ctx().value);
    expect(target.href?.startsWith(`/units/${PROD}/unit-prod?`)).toBe(true);
    expect(target.jump).toBeUndefined();
  });
});

test.describe('revision, ChangeOrder, user', () => {
  test('a revision: the revision page', () => {
    const target = resolveComponentFieldRef({ kind: 'revision', label: 'rev 3', spaceId: STAGING, unitId: 'u', num: 3 }, ctx().value);
    expect(target.href).toContain(`/units/${STAGING}/u?`);
    expect(target.href).toContain('revision=3');
    expect(resolveComponentFieldRef({ kind: 'revision', label: 'rev 3', spaceId: STAGING, unitId: 'u', num: 3 }, ctx({ staged: 2 }).value).newTab).toBe(true);
  });

  test('a ChangeOrder: its page', () => {
    expect(resolveComponentFieldRef({ kind: 'changeOrder', label: 'co-1', space: 'fd-prod', slug: 'co-1' }, ctx().value)).toEqual({
      href: '/change-orders/fd-prod/co-1',
    });
  });

  test('a person: plain text', () => {
    expect(resolveComponentFieldRef({ kind: 'user', label: 'admin', user: 'admin@x' }, ctx().value)).toEqual({});
  });
});
