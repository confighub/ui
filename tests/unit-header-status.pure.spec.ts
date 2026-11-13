// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The statuses a Unit header shows as icons (unitHeaderStatus.ts): which appear, in what order,
// and what their peeks say. Takes no `page` fixture and starts no browser:
//   cd ui && npx playwright test -c playwright.pure.config.ts unit-header-status

import { expect, test } from '@playwright/test';

import type { MergedUnit } from '../src/pages/x/apps/componentTypes';
import { unitHeaderAriaLabel, unitHeaderStatuses } from '../src/pages/x/apps/unitHeaderStatus';

const unit = (over: Partial<MergedUnit> = {}): MergedUnit => ({
  unitId: 'u1',
  slug: 'app',
  spaceId: 's1',
  hasUpstream: true,
  isUpgradeLoading: false,
  hasAction: false,
  ...over,
});

const upgradeEntry = (fieldCount: number): MergedUnit['upgradeEntry'] =>
  ({
    unitId: 'u1',
    slug: 'app',
    deploymentId: 's1',
    deploymentName: 's',
    parentDeploymentName: 'p',
    upstreamRevisionNum: 2,
    upstreamHeadRevisionNum: 3,
    fieldDiffs: Array.from({ length: fieldCount }, (_, i) => ({
      path: `a.b${i}`,
      key: `a.b${i}`,
      oldValue: '1',
      newValue: '2',
    })),
    allPaths: [],
  }) as MergedUnit['upgradeEntry'];

const applyEntry = (fieldCount: number): MergedUnit['applyEntry'] =>
  ({
    unitId: 'u1',
    slug: 'app',
    deploymentId: 's1',
    deploymentName: 's',
    headRevision: 2,
    appliedRevision: 1,
    fieldDiffs: Array.from({ length: fieldCount }, (_, i) => ({ path: `x.y${i}`, key: `x.y${i}`, oldValue: '1', newValue: '2' })),
    allPaths: [],
    isGated: false,
    gateKeys: [],
  }) as MergedUnit['applyEntry'];

const kinds = (u: MergedUnit, expanded = false, held = false) =>
  unitHeaderStatuses(u, { expanded, held }).map((s) => s.kind);

test('a healthy Unit has no status icon', () => {
  expect(kinds(unit())).toEqual([]);
});

test('icons come in the node card order, read states first', () => {
  const u = unit({
    isUpgradeLoading: true,
    targetId: 't1',
    upgradeEntry: undefined,
    applyEntry: applyEntry(1),
    validationErrors: { 'sp/gate/fn': true },
    validationWarnings: { 'sp/warn/fn': true },
  });
  expect(kinds(u)).toEqual(['loading', 'unreleased', 'warnings', 'gated']);
});

test('a Stale peek names the revisions, and the number of fields only from two changes', () => {
  const one = unitHeaderStatuses(unit({ upgradeEntry: upgradeEntry(1) }), { expanded: false, held: false });
  expect(one[0].lines).toEqual(['Behind upstream: r2→r3']);
  const many = unitHeaderStatuses(unit({ upgradeEntry: upgradeEntry(3) }), { expanded: false, held: false });
  expect(many[0].lines).toEqual(['Behind upstream: r2→r3', '3 fields change']);
});

test('an Unreleased changes peek names the revisions, and needs a Target', () => {
  const withTarget = unitHeaderStatuses(unit({ targetId: 't1', applyEntry: applyEntry(2) }), { expanded: false, held: false });
  expect(withTarget[0].lines).toEqual([
    'Local edits not yet released',
    'Head r2, last released r1',
    '2 fields changed',
  ]);
  expect(kinds(unit({ applyEntry: applyEntry(2) }))).toEqual([]);
});

test('a held Unit is Not read yet only while it is closed', () => {
  expect(kinds(unit(), false, true)).toEqual(['not-read']);
  expect(kinds(unit(), true, true)).toEqual([]);
});

test('a failed read shows the error and the Unit name and statuses are in the accessible name', () => {
  const statuses = unitHeaderStatuses(unit({ upgradeError: 'boom', validationErrors: { g: true } }), {
    expanded: false,
    held: false,
  });
  expect(statuses.map((s) => s.kind)).toEqual(['error', 'gated']);
  expect(statuses[0].lines).toEqual(['The changes to this Unit could not be read: boom']);
  expect(unitHeaderAriaLabel('dev', 'app', statuses)).toBe('dev/app, Not read: failed, Gated');
});

test('Gated and Warnings icons link to the Unit Overview', () => {
  const [gated] = unitHeaderStatuses(unit({ validationErrors: { g: true } }), { expanded: false, held: false });
  expect(gated.href).toContain('/units/s1/u1');
  expect(gated.href).toContain('gate=g');
});
