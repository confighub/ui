// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What a promote dry run says each Unit would hold — `readPromotionPreview`. Pure
// derivation, no page, no browser.
//
// The stage tree reads "no configuration back" in two ways that must not be confused: a
// Unit the promotion does not write keeps what it holds, and a Unit it would write but
// gave nothing for is undetermined. The first renders as unchanged; the second must never.

import { expect, test } from '@playwright/test';

import type { PromoteResult } from '@confighub/rtk-query';
import { readPromotionPreview } from '../src/pages/x/apps/rollout/rolloutChanges';

const SPACE = 'space-1';

function result(units: NonNullable<PromoteResult['Spaces']>[number]['Units'], action = 'Promote'): PromoteResult {
  return { DryRun: true, Spaces: [{ SpaceID: SPACE, Action: action, Units: units }] };
}

test('a Unit the promotion writes carries what it would hold', () => {
  const preview = readPromotionPreview(
    result([{ UnitID: 'web', Action: 'Resolve', ConfigData: 'image: nginx:v1.1.0\n' }]),
  );
  expect(preview.dataByUnitId.get('web')).toBe('image: nginx:v1.1.0\n');
  expect(preview.unchangedUnitIds.size).toBe(0);
  expect(preview.undeterminedUnitIds.size).toBe(0);
});

test('a Unit the promotion marks, skips or leaves alone is unchanged', () => {
  const preview = readPromotionPreview(
    result([
      { UnitID: 'marked', Action: 'Mark' },
      { UnitID: 'skipped', Action: 'Skip', Reason: 'NotCovered' },
      { UnitID: 'level', Action: 'Unchanged' },
    ]),
  );
  expect([...preview.unchangedUnitIds].sort()).toEqual(['level', 'marked', 'skipped']);
  expect(preview.undeterminedUnitIds.size).toBe(0);
});

test('a Unit the promotion would write and gave nothing for is undetermined', () => {
  const preview = readPromotionPreview(result([{ UnitID: 'web', Action: 'Upgrade' }]));
  expect(preview.undeterminedUnitIds.has('web')).toBe(true);
  expect(preview.unchangedUnitIds.has('web')).toBe(false);
});

test('a Unit with an error is undetermined, whatever its action', () => {
  const preview = readPromotionPreview(
    result([{ UnitID: 'web', Action: 'Skip', Error: { Message: 'merge conflict' } }]),
  );
  expect(preview.undeterminedUnitIds.has('web')).toBe(true);
  expect(preview.unchangedUnitIds.has('web')).toBe(false);
});

test('what the promotion would withhold is kept per Unit', () => {
  const preview = readPromotionPreview(
    result([
      {
        UnitID: 'web',
        Action: 'Resolve',
        ConfigData: 'image: nginx:v1.1.0\n',
        Conflicts: [{ Reason: 'Guarded', Path: 'spec.replicas' }],
      },
    ]),
  );
  expect(preview.conflictsByUnitId.get('web')).toEqual([
    expect.objectContaining({ reason: 'Guarded', path: 'spec.replicas', blocks: true }),
  ]);
});

/*
 * A dry run cannot plan a Space that takes from another Space of the same promotion, and
 * returns it Blocked with no Units. Its Units have no answer, which is not "no change".
 */
test('a Space the dry run could not plan leaves its Units undetermined', () => {
  const preview = readPromotionPreview(result(undefined, 'Blocked'));
  expect(preview.undeterminedSpaceIds.has(SPACE)).toBe(true);
  expect(readPromotionPreview(result(undefined, 'Failed')).undeterminedSpaceIds.has(SPACE)).toBe(true);
  expect(readPromotionPreview(result(undefined, 'Promote')).undeterminedSpaceIds.size).toBe(0);
});

test('a clone the dry run would make has no Unit to stand beside, and is left out', () => {
  const preview = readPromotionPreview(result([{ Slug: 'cache', Action: 'Clone', ConfigData: 'x: 1\n' }]));
  expect(preview.dataByUnitId.size).toBe(0);
});
