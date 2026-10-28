// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `splitDryRunItems` (entryBuilders.ts): an upgrade dry-run batch that succeeds can still
// fail some of its Units. Such an item carries an Error and no configuration or Diff, so
// the Unit has no entry to show, and has to show the error instead of nothing.
//
// Takes no `page` fixture and starts no browser:
//   cd ui && npx playwright test -c playwright.pure.config.ts component-dry-run-errors

import { expect, test } from '@playwright/test';

import type { UnitCreateOrUpdateResponseRead, UnitRead } from '@confighub/rtk-query';

import { splitDryRunItems } from '../src/pages/x/apps/entryBuilders';

const unit = (UnitID: string) => ({ UnitID }) as UnitRead;

test.describe('splitDryRunItems', () => {
  test('a Unit whose item has an Error is an error, not a result', () => {
    const ok: UnitCreateOrUpdateResponseRead = { Unit: unit('a'), ConfigData: 'x: 1\n', Diff: {} };
    const failed: UnitCreateOrUpdateResponseRead = { Unit: unit('b'), Error: { Message: 'diff failed', Status: 500 } };

    const { results, errors } = splitDryRunItems(['a', 'b'], [ok, failed]);

    expect(results).toEqual([ok]);
    expect(errors).toEqual([{ unitId: 'b', message: 'diff failed' }]);
  });

  test('an Error that names no Unit belongs to each Unit of the batch with no result', () => {
    const ok: UnitCreateOrUpdateResponseRead = { Unit: unit('a'), Diff: {} };
    const failed: UnitCreateOrUpdateResponseRead = { Error: { Message: 'merge failed' } };

    const { errors } = splitDryRunItems(['a', 'b', 'c'], [ok, failed]);

    expect(errors).toEqual([
      { unitId: 'b', message: 'merge failed' },
      { unitId: 'c', message: 'merge failed' },
    ]);
  });

  test('an Error with no message still says the preview failed', () => {
    const { errors } = splitDryRunItems(['a'], [{ Unit: unit('a'), Error: {} }]);
    expect(errors).toEqual([{ unitId: 'a', message: 'The upgrade preview failed' }]);
  });
});
