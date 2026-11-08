// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The clearance and guards of an Invoke ChangeOrder's Invocation: which guards the panel says
 * withhold the change, how a stored clearance and guards read, and when an edit can still take
 * effect.
 */
import { expect, test } from '@playwright/test';

import type { MutationConflict } from '@confighub/rtk-query';

import {
  guardStampTexts,
  guardsNotCovered,
  invocationEditTakesEffect,
  requirementText,
  spacesToPromote,
} from '../src/pages/change-orders/invocationClearance';

const guarded = (guards: { Key: string; Value: string }[], reason = 'Guarded'): MutationConflict => ({ Reason: reason, Guards: guards }) as MutationConflict;

test.describe('the guards that withhold the change', () => {
  test('each guard once, in key and then value order; a conflict no guard caused names none', () => {
    const conflicts = [
      guarded([{ Key: 'Scale', Value: 'RegionSpecific' }]),
      guarded([{ Key: 'RunAsRoot', Value: 'LegacyImage' }, { Key: 'Scale', Value: 'RegionSpecific' }]),
      guarded([{ Key: 'Owner', Value: 'Platform' }], 'GuardWithheld'),
      { Reason: 'ProtectedPath' } as MutationConflict,
    ];
    expect(guardsNotCovered(conflicts, []).map((g) => `${g.Key}=${g.Value}`)).toEqual(['Owner=Platform', 'RunAsRoot=LegacyImage', 'Scale=RegionSpecific']);
  });

  test('a guard the Invocation is already cleared for is not named again', () => {
    const conflicts = [guarded([{ Key: 'Scale', Value: 'RegionSpecific' }, { Key: 'Scale', Value: 'Pinned' }])];
    const named = guardsNotCovered(conflicts, [{ Key: 'Scale', Operator: 'In', Values: ['RegionSpecific'] }]);
    expect(named.map((g) => `${g.Key}=${g.Value}`)).toEqual(['Scale=Pinned']);
    expect(guardsNotCovered(conflicts, [{ Key: 'Scale', Operator: 'Exists' }])).toEqual([]);
  });
});

test.describe('a stored clearance and guards, as written', () => {
  test('each operator as cub --clearance takes it', () => {
    expect(
      [
        { Key: 'Scale', Operator: 'Exists' },
        { Key: 'Scale', Operator: 'In', Values: ['RegionSpecific', 'Pinned'] },
        { Key: 'Owner', Operator: 'NotIn', Values: ['Team'] },
        { Key: 'Legacy', Operator: 'DoesNotExist' },
      ].map(requirementText),
    ).toEqual(['Scale', 'Scale=RegionSpecific;Pinned', 'Owner!=Team', '!Legacy']);
  });

  test('guards in key order, and none as none', () => {
    expect(guardStampTexts({ Scale: 'RegionSpecific', Owner: 'Platform', Bare: '' })).toEqual(['Bare', 'Owner=Platform', 'Scale=RegionSpecific']);
    expect(guardStampTexts(undefined)).toEqual([]);
  });
});

test.describe('when an edit of the Invocation takes effect', () => {
  test('while a Space in scope is still to promote, and the ChangeOrder is not aborted', () => {
    const resolved = new Set(['one']);
    expect(spacesToPromote(['one', 'two'], resolved)).toEqual(['two']);
    expect(invocationEditTakesEffect({ inScopeSpaceIds: ['one', 'two'], resolvedSpaceIds: resolved, abortedReason: '' })).toBe(true);
    expect(invocationEditTakesEffect({ inScopeSpaceIds: ['one'], resolvedSpaceIds: resolved, abortedReason: '' })).toBe(false);
    expect(invocationEditTakesEffect({ inScopeSpaceIds: ['one', 'two'], resolvedSpaceIds: resolved, abortedReason: 'superseded' })).toBe(false);
    expect(invocationEditTakesEffect({ inScopeSpaceIds: undefined, resolvedSpaceIds: resolved, abortedReason: '' })).toBe(false);
  });
});
