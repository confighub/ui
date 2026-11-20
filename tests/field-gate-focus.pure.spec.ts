// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A gate link (`?tab=gates&gate=<TriggerID>`) opens that gate in the Gates tab, whether it is a
// failing gate or a warning (review item 5: warnings are keyed `w:`, gates `e:`).
import { expect, test } from '@playwright/test';

import { type Gate, gateOpenKey, gateOpenKeyForTrigger } from '../src/pages/x/apps/gates/gateModel';

const gate = (key: string, warning: boolean): Gate =>
  ({ key, gateName: `space/${key}/vet`, gateNames: [], warning, units: [] }) as Gate;

test('a failing gate opens as e:<id>', () => {
  expect(gateOpenKeyForTrigger([gate('t1', false)], [gate('t2', true)], 't1')).toBe('e:t1');
});

test('a warning opens as w:<id>', () => {
  expect(gateOpenKeyForTrigger([gate('t1', false)], [gate('t2', true)], 't2')).toBe('w:t2');
});

test('a Trigger the tab does not list opens nothing', () => {
  expect(gateOpenKeyForTrigger([gate('t1', false)], [], 't9')).toBeUndefined();
});

test("gateOpenKey is the Gates tab's own key", () => {
  expect(gateOpenKey(gate('t2', true))).toBe('w:t2');
  expect(gateOpenKey(gate('t1', false))).toBe('e:t1');
});
