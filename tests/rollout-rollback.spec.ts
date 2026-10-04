// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Rolling a rollout back: the scope it is run over, what each of the two
// intents actually writes, and how a partly-rejected bulk restore is reported.
// Pure derivation, no page, no browser — same pattern as
// `rollout-row-actions.spec.ts`.
//
// The one thing every assertion here is ultimately about: a rollback is N
// requests that can land differently, and the screen must not turn that into
// one cheerful sentence. `bulkPatchUnits` answers a partly-rejected request
// with 207 Multi-Status and per-entry errors, and `.unwrap()` resolves it
// happily — treating that as success is a defect this codebase has shipped
// before.

import { test, expect } from './fixtures/test';

import {
  restoreTargets,
  retryTargets,
  rollbackReport,
  rollbackScope,
  summariseRestore,
  type SpaceOutcome,
} from '../src/pages/x/apps/rollout/rolloutRollback';
import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import type { RolloutProgress } from '../src/pages/x/apps/rollout/rolloutTypes';
import type { UnitCreateOrUpdateResponseRead } from '@confighub/rtk-query';
import { carryingReleaseMap } from './fixtures/running-release';

const BASE = 'space-base';
const DEV = 'space-dev';
const PROD = 'space-prod';

function progress(resolved: string[], restored: string[] = []): RolloutProgress {
  return {
    availability: 'available',
    resolvedSpaceIds: new Set(resolved),
    releasedSpaceIds: new Set(resolved),
    carryingReleases: carryingReleaseMap(resolved),
    restoredSpaceIds: new Set(restored),
    releasedRestoredSpaceIds: new Set<string>(),
  };
}

// ── The scope: ResolvedSpaceIDs minus RestoredSpaceIDs ────────────────

/*
 * THE SET IS THE CHANGE ORDER'S OWN ANSWER, NOT A SELECTION OF OURS. `cub
 * variant demote` restores the Units of a Space its start tag marks, and the
 * Spaces worth running it over are the ones that took the change. The base
 * Space is always a member of `ResolvedSpaceIDs` ("plus the Space it resides
 * in") and is a legitimate demote target — `cub variant demote web-base` is the
 * command's own first example — so it is not filtered out.
 */
test('the scope is every Space that took the change', () => {
  expect(rollbackScope(progress([BASE, DEV, PROD]))).toEqual({
    kind: 'spaces',
    spaceIds: [BASE, DEV, PROD],
  });
});

/*
 * A restored Space STAYS in `ResolvedSpaceIDs`: the restore mints a new
 * Revision and leaves the end Tag where it was. Subtracting `RestoredSpaceIDs`
 * is what stops a re-run claiming to undo what it has already undone — the
 * same "leaving N unit(s) alone" the CLI prints.
 */
test('a Space already rolled back is not in the scope again', () => {
  expect(rollbackScope(progress([BASE, DEV, PROD], [DEV]))).toEqual({
    kind: 'spaces',
    spaceIds: [BASE, PROD],
  });
});

test('every Space already rolled back leaves nothing to do', () => {
  expect(rollbackScope(progress([BASE, DEV], [BASE, DEV]))).toEqual({ kind: 'none' });
});

/*
 * ⚠️ "NONE" AND "CANNOT SAY" ARE DIFFERENT ANSWERS. `setChangeOrderPropagation`
 * swallows its derivation failures, so a server that cannot answer returns 200
 * with the fields ABSENT. A rollback run over the empty set that produces would
 * restore nothing and report that the change had been taken back out.
 */
test('a scope the server did not derive is unavailable, not empty', () => {
  const unavailable: RolloutProgress = {
    availability: 'unavailable',
    resolvedSpaceIds: new Set<string>(),
    releasedSpaceIds: new Set<string>(),
    carryingReleases: new Map(),
    restoredSpaceIds: new Set<string>(),
    releasedRestoredSpaceIds: new Set<string>(),
  };
  expect(rollbackScope(unavailable)).toEqual({ kind: 'unavailable' });
});

// ── What each intent writes ───────────────────────────────────────────

/*
 * ABORT-ONLY MOVES NOTHING, AND THIS IS WHERE THAT IS TRUE. "Abort" sets
 * `AbortedReason` and stops; the Spaces that already took the change keep it.
 * The Spaces are still LISTED under that intent — a reader choosing between the
 * two controls has to see what stays behind — which is why the list and the
 * write targets are two separate functions.
 */
test('Abort writes into no Space, however many took the change', () => {
  const scope = rollbackScope(progress([BASE, DEV, PROD]));
  expect(scope).toEqual({ kind: 'spaces', spaceIds: [BASE, DEV, PROD] });
  expect(restoreTargets('abort', scope)).toEqual([]);
});

test('Roll back writes into every Space of the scope', () => {
  const scope = rollbackScope(progress([BASE, DEV, PROD], [DEV]));
  expect(restoreTargets('roll-back', scope)).toEqual([BASE, PROD]);
});

test('Roll back writes nowhere when the scope could not be determined', () => {
  expect(restoreTargets('roll-back', { kind: 'unavailable' })).toEqual([]);
});

// ── Reading a 207 ─────────────────────────────────────────────────────

const itemFailure = rolloutCopy.itemFailure;
const unnamed = rolloutCopy.unnamedResource;

function entry(slug: string, error?: string): UnitCreateOrUpdateResponseRead {
  return error === undefined
    ? { Unit: { Slug: slug } as UnitCreateOrUpdateResponseRead['Unit'] }
    : {
        Unit: { Slug: slug } as UnitCreateOrUpdateResponseRead['Unit'],
        Error: { Message: error },
      };
}

test('every accepted entry counts as a restored resource', () => {
  expect(summariseRestore([entry('web'), entry('db')], unnamed, itemFailure)).toEqual({
    restoredUnits: 2,
    failures: [],
  });
});

/*
 * ⚠️ THE ONE THAT MATTERS. A 207 whose entries carry errors resolves through
 * `.unwrap()` exactly like a 200. An entry with an `Error` is a failure, and a
 * summary that counted it as restored would report a rollback that did not
 * happen — over a Space still running the change.
 */
test('a 207 with a rejected entry is a failure, not a success', () => {
  const summary = summariseRestore(
    [entry('web'), entry('db', 'Unit is locked'), entry('cache')],
    unnamed,
    itemFailure,
  );
  expect(summary.restoredUnits).toBe(2);
  expect(summary.failures).toEqual(['db: Unit is locked']);
});

/*
 * An `Error` with no sentence in it is still an `Error`. Reading only the
 * message and treating a blank one as "fine" is the same fault by another
 * route.
 */
test('a rejected entry with no message is still a failure', () => {
  const summary = summariseRestore(
    [{ Unit: { Slug: 'web' } as UnitCreateOrUpdateResponseRead['Unit'], Error: {} }],
    unnamed,
    itemFailure,
  );
  expect(summary.restoredUnits).toBe(0);
  expect(summary.failures).toEqual(['web: no reason given']);
});

// ── What the run as a whole is reported as ────────────────────────────

function outcome(
  spaceId: string,
  phase: SpaceOutcome['phase'],
  restoredUnits = 0,
  message = '',
): SpaceOutcome {
  return { spaceId, label: spaceId, phase, restoredUnits, message };
}

test('a run whose every Space landed is a success', () => {
  const report = rollbackReport([outcome(BASE, 'done', 3), outcome(PROD, 'done', 2)]);
  expect(report.ok).toBe(true);
  expect(report.failures).toEqual([]);
});

/*
 * A Space the start tag marks no Unit in is neither a failure nor a rollback.
 * Counting it as either misreports the run — as broken, or as having undone
 * something it never touched.
 */
test('a Space with nothing to restore does not fail the run', () => {
  expect(rollbackReport([outcome(BASE, 'done', 3), outcome(DEV, 'skipped')]).ok).toBe(true);
});

/*
 * ⚠️ THE STRANDED STATE, WHICH IS THE WHOLE REASON THE DIALOG STAYS OPEN.
 * `AbortedReason` is clearable until something is restored; after that the
 * server refuses the clearing forever. A run that restored one Space and lost
 * the next therefore leaves the rollout aborted AND partly rolled back, with no
 * UI route back to promotable.
 */
test('a partly-landed rollback is reported as failed AND as stranded', () => {
  const report = rollbackReport([
    outcome(BASE, 'done', 3),
    outcome(PROD, 'failed', 0, 'db: Unit is locked'),
  ]);
  expect(report.ok).toBe(false);
  expect(report.stranded).toBe(true);
  expect(report.failures).toEqual(['db: Unit is locked']);
});

/*
 * The other half: nothing was restored, so the decision can still be taken
 * back. Two different states, two different sentences — collapsing them would
 * tell somebody their rollout was unrecoverable when it was not, or the reverse.
 */
test('a rollback that restored nothing is failed but not stranded', () => {
  const report = rollbackReport([outcome(BASE, 'failed', 0, 'no permission')]);
  expect(report.ok).toBe(false);
  expect(report.stranded).toBe(false);
});

test('a retry acts on the Spaces that failed and the ones never reached', () => {
  expect(
    retryTargets([
      outcome(BASE, 'done', 3),
      outcome(DEV, 'failed', 0, 'boom'),
      outcome(PROD, 'pending'),
    ]),
  ).toEqual([DEV, PROD]);
});

test('a retry does not re-send a Space that had nothing to restore', () => {
  expect(retryTargets([outcome(BASE, 'skipped'), outcome(DEV, 'failed', 0, 'boom')])).toEqual([DEV]);
});

// ── What the dialog is required to say ────────────────────────────────

/*
 * THE CONSEQUENCES ARE PART OF THE FEATURE, NOT DECORATION. Each of these is
 * irreversible or easy to assume the opposite of, and the moment to say so is
 * before the reader commits. Pinned as copy so a later tidy-up cannot quietly
 * drop one.
 */
test('the rollback dialog states every consequence before the reader commits', () => {
  const lines = rolloutCopy.endRollout.rollBackConsequences.join(' ');
  expect(lines).toContain('can never be promoted again');
  expect(lines).toContain('are dropped');
  expect(lines).toContain('until a release is published');
});

test('the Abort confirmation says what it leaves behind', () => {
  const lines = rolloutCopy.endRollout.abortConsequences.join(' ');
  expect(lines).toContain('keep it');
  expect(lines).toContain('Nothing is written');
});

test('a stranded rollout is told plainly that it cannot be made promotable again', () => {
  expect(rolloutCopy.endRollout.strandedAdvice).toContain('aborted and partly rolled back');
  expect(rolloutCopy.endRollout.strandedAdvice).toContain('cannot be made promotable again');
});
