// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `createdWithin` and `effectiveUpdateType` (changeOrdersConsoleFilters.ts):
// the console's Created and Update type filters. Pure, so no page and no
// server. Times are built in the local zone, as the date inputs read them, so
// the cases hold in any zone the suite runs in.

import { expect, test } from '@playwright/test';

import {
  createdWithin,
  DEFAULT_UPDATE_TYPE,
  effectiveUpdateType,
} from '../src/pages/x/apps/change-order/changeOrdersConsoleFilters';

/** An ISO timestamp for a local wall-clock time on 2026-10-`day`. */
const local = (day: number, hours = 0, minutes = 0, ms = 0) =>
  new Date(2026, 9, day, hours, minutes, 0, ms).toISOString();

test('no bounds matches everything, a missing creation time included', () => {
  expect(createdWithin(local(6), '', '')).toBe(true);
  expect(createdWithin(undefined, '', '')).toBe(true);
});

test('both ends are whole local days, inclusive', () => {
  expect(createdWithin(local(6, 0, 0), '2026-10-06', '2026-10-08')).toBe(true);
  expect(createdWithin(local(8, 23, 59, 999), '2026-10-06', '2026-10-08')).toBe(true);
  expect(createdWithin(local(5, 23, 59, 999), '2026-10-06', '2026-10-08')).toBe(false);
  expect(createdWithin(local(9, 0, 0), '2026-10-06', '2026-10-08')).toBe(false);
});

test('one day is a range of its own', () => {
  expect(createdWithin(local(6, 12), '2026-10-06', '2026-10-06')).toBe(true);
  expect(createdWithin(local(7, 0), '2026-10-06', '2026-10-06')).toBe(false);
});

test('either end can be open', () => {
  expect(createdWithin(local(1), '2026-10-06', '')).toBe(false);
  expect(createdWithin(local(30), '2026-10-06', '')).toBe(true);
  expect(createdWithin(local(1), '', '2026-10-06')).toBe(true);
  expect(createdWithin(local(30), '', '2026-10-06')).toBe(false);
});

test('a ChangeOrder with no readable creation time is outside any range', () => {
  expect(createdWithin(undefined, '2026-10-06', '')).toBe(false);
  expect(createdWithin('not a time', '', '2026-10-06')).toBe(false);
});

test('an absent UpdateType is the server default', () => {
  expect(effectiveUpdateType(undefined)).toBe(DEFAULT_UPDATE_TYPE);
  expect(effectiveUpdateType(null)).toBe(DEFAULT_UPDATE_TYPE);
  expect(effectiveUpdateType('')).toBe(DEFAULT_UPDATE_TYPE);
  expect(effectiveUpdateType('Invoke')).toBe('Invoke');
});
