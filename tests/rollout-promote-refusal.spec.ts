// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import { promoteRefusal, type PromoteRequest } from '../src/pages/x/apps/rollout/useRolloutActions';

/*
 * THE BACKSTOP, TESTED WHERE IT LIVES.
 *
 * The page refuses a held promote before it calls the hook, but a page is a
 * convention rather than an enforcement: a second surface, a keyboard path or
 * anything calling the hook directly reaches the hook without it. This rule is
 * the one that holds for the caller that forgot, and it is the whole rule —
 * there is no second question and no argument that answers the first one
 * differently.
 */

test('an ordinary promote of a stage nothing holds proceeds', () => {
  expect(promoteRefusal({ blockingGateCount: 0 })).toBeNull();
});

test('a promote of a held stage is refused, however many gates hold it', () => {
  expect(promoteRefusal({ blockingGateCount: 1 })).toBe(rolloutCopy.promoteHeld.refused);
  expect(promoteRefusal({ blockingGateCount: 3 })).toBe(rolloutCopy.promoteHeld.refused);
});

/*
 * THE REGRESSION GUARD. A held gate refuses, and nothing a caller attaches to
 * the request changes that. A rule that consulted a second field could be
 * satisfied by supplying it, which is the escape hatch growing back one
 * property at a time.
 */
test('nothing a caller adds to the request makes a held stage promotable', () => {
  const decorated = {
    blockingGateCount: 1,
    stageId: 'prod',
    reason: 'incident 4812',
    override: { stageId: 'prod', reason: 'incident 4812' },
    force: true,
  } as unknown as PromoteRequest;
  expect(promoteRefusal(decorated)).toBe(rolloutCopy.promoteHeld.refused);
});

/* The refusal names the hold and claims nothing was promoted, which is true. */
test('the refusal says the stage was not promoted', () => {
  expect(promoteRefusal({ blockingGateCount: 1 })).toContain('was not promoted');
});
