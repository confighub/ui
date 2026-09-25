// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import {
  promoteAnnouncement,
  promotePrecheck,
} from '../src/pages/x/apps/rollout/useRolloutActions';
import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';

const READY = { blockingGateCount: 0 };

/*
 * ⚠️ THE WIRING, NOT JUST THE PREDICATE.
 *
 * `promoteHasNothingToDo` was tested on its own while the thing it feeds — the
 * result the promote actually returns — was not, so returning a plain `ok` from
 * the branch it guards changed nothing any test could see. A promote that wrote
 * nothing then announced itself as a completed promotion: the exact sentence
 * `didNothing` exists to prevent.
 */
test('a promote with no Space to act on stops, and says it did nothing', () => {
  const result = promotePrecheck('co-1', 'base-1', [], READY);
  expect(result).not.toBeNull();
  // Succeeded, because nothing failed. Acted, no.
  expect(result?.ok).toBe(true);
  expect(result?.didNothing).toBe(true);
});

test('a promote reached before the ChangeOrder is known does nothing either', () => {
  expect(promotePrecheck(undefined, 'base-1', ['s1'], READY)?.didNothing).toBe(true);
  expect(promotePrecheck('co-1', undefined, ['s1'], READY)?.didNothing).toBe(true);
});

test('a promote with everything it needs is allowed to proceed', () => {
  expect(promotePrecheck('co-1', 'base-1', ['s1'], READY)).toBeNull();
});

/*
 * A held gate and an empty target list both stop the promote and must never be
 * reported the same way: one is a refusal with a reason, the other a success
 * that wrote nothing.
 */
test('a held gate stops the promote as a failure, not as a no-op', () => {
  const result = promotePrecheck('co-1', 'base-1', ['s1'], { blockingGateCount: 2 });
  expect(result?.ok).toBe(false);
  expect(result?.didNothing).toBeUndefined();
  expect(result?.message).toBe(rolloutCopy.promoteHeld.refused);
});

// ── What the reader is told, for each of those results ─────────────────────

test('a promote that did nothing is never announced as a promotion', () => {
  expect(promoteAnnouncement('prod', { ok: true, message: '', didNothing: true })).toBe(
    rolloutCopy.nothingToPromote('prod'),
  );
  // And it is NOT the sentence a real promotion gets.
  expect(promoteAnnouncement('prod', { ok: true, message: '', didNothing: true })).not.toBe(
    rolloutCopy.promotedTo('prod'),
  );
});

test('a promote that wrote something is announced as one', () => {
  expect(promoteAnnouncement('prod', { ok: true, message: '' })).toBe(rolloutCopy.promotedTo('prod'));
});

/*
 * A PARTIAL PROMOTE IS ANNOUNCED IN ITS OWN WORDS, NOT IN A SUMMARY'S.
 *
 * There is no second announcement for it any more, and there must not be one:
 * a promotion converges on being run again, so every failure has the same way
 * forward and the only thing worth saying is WHICH part did not land. A
 * summary sentence here would replace the server's reason with a category.
 */
test('a partial promote reaches the reader with the server reason intact', () => {
  const partial = rolloutCopy.promotePartial(rolloutCopy.spaceCount(2), 'config: already exists');
  expect(promoteAnnouncement('prod', { ok: false, message: partial })).toContain(
    'config: already exists',
  );
  // And it is not the sentence a clean promotion gets.
  expect(promoteAnnouncement('prod', { ok: false, message: partial })).not.toBe(
    rolloutCopy.promotedTo('prod'),
  );
});

test('an ordinary failure is announced in its own words', () => {
  expect(promoteAnnouncement('prod', { ok: false, message: 'the server refused' })).toBe(
    'the server refused',
  );
});

/*
 * The end-to-end shape of the thing: what the hook decides, said the way the
 * page says it. Neither half is a promotion, and neither may read as one.
 */
test('nothing to act on reaches the reader as nothing promoted', () => {
  const result = promotePrecheck('co-1', 'base-1', [], READY);
  expect(result).not.toBeNull();
  expect(promoteAnnouncement('prod', result as { ok: boolean; message: string })).toBe(
    rolloutCopy.nothingToPromote('prod'),
  );
});
