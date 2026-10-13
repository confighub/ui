// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `completeStepTone` / `buildCompleteConsoleStage` (changeOrderCompleteStep.ts) —
// the Complete step, exercised directly, same pure-derivation pattern as
// `change-order-outcome.pure.spec.ts`: no page, no browser, no fixtures.
//
// WHY THIS FILE IS THE WHOLE TEST FOR THE STEP. The Complete step is a
// SYNTHETIC segment: it corresponds to no ChangeOrder stage, so nothing in the
// stage derivations can vouch for it. Its only claim is the tone it picks, and
// that claim is a precedence ladder — `restored`, then a complete `state`,
// then `nextStageId`, then the rest of `state`. A ladder read in the wrong order is silent: every rung still
// returns a legal `SegmentTone`, and the page still draws a segment. The two
// reversals that actually change what a reader is told are asserted by name
// below:
//
//   - a ChangeOrder that was taken back out must read `restored`, not the `done`
//     its `state === 'complete'` would otherwise earn — the false green
//     `deriveSpaceVerdict` already refuses for the same reason.
//   - a ChangeOrder the server calls finished reads complete, even when a stage
//     is still named as next: the page says what `cub changeorder get` says.
//   - any other ChangeOrder with a stage still ahead of it must read `gated`,
//     because `Final.Prerequisites` are evaluated over the LAST stage and a
//     ChangeOrder that has not reached it has not been asked.
//   - an `aborted` ChangeOrder must NOT fall to the catch-all: it can never satisfy
//     `Final`, so the treatment that says "there is something to do here" is a
//     lie about it. It takes the terminal treatment and its own word.

import { expect, test } from '@playwright/test';

import {
  COMPLETE_SEGMENT_STAGE_ID,
  buildCompleteConsoleStage,
  completeStepLabel,
  completeStepTone,
  isCompleteStepAbandoned,
  type CompleteStepRow,
} from '../src/pages/change-orders/changeOrderCompleteStep';
import type { ConsoleState } from '../src/pages/x/apps/change-order/changeOrdersConsoleModel';

/** The three fields the step reads, and nothing else — `nextStageId: null` is "reached the last stage". */
function row(spec: {
  state: ConsoleState;
  nextStageId?: string | null;
  restored?: boolean;
}): CompleteStepRow {
  return {
    state: spec.state,
    nextStageId: spec.nextStageId ?? null,
    restored: spec.restored ?? false,
  };
}

test.describe('completeStepTone — the precedence ladder, rung by rung', () => {
  test('`restored` outranks every other reading, including a complete one', () => {
    expect(completeStepTone(row({ state: 'complete', restored: true }))).toBe('restored');
    expect(completeStepTone(row({ state: 'degraded', restored: true }))).toBe('restored');
    // And it outranks the rung below it too: a restored ChangeOrder still short of
    // its last stage is restored, not merely gated.
    expect(completeStepTone(row({ state: 'ready', nextStageId: 'prod', restored: true }))).toBe(
      'restored',
    );
  });

  test('a stage still ahead reads `gated`, unless the row is complete', () => {
    expect(completeStepTone(row({ state: 'ready', nextStageId: 'prod' }))).toBe('gated');
    expect(completeStepTone(row({ state: 'progressing', nextStageId: 'staging' }))).toBe('gated');
    // The reversal that matters: `state` must NOT be consulted first here. A
    // degraded middle stage is a problem in a stage, not a verdict on the
    // final checklist — nothing has evaluated that yet.
    expect(completeStepTone(row({ state: 'degraded', nextStageId: 'prod' }))).toBe('gated');
    // A complete row reads complete: the server called the ChangeOrder finished,
    // and the stage left behind is named in the row's Blocker cell instead.
    expect(completeStepTone(row({ state: 'complete', nextStageId: 'prod' }))).toBe('done');
    expect(completeStepTone(row({ state: 'complete-unverified', nextStageId: 'prod' }))).toBe('done');
  });

  test('at the last stage, the row state decides', () => {
    expect(completeStepTone(row({ state: 'complete' }))).toBe('done');
    // Drawn done like `complete`: a complete ChangeOrder fills every step, and
    // the label carries the unchecked health.
    expect(completeStepTone(row({ state: 'complete-unverified' }))).toBe('done');
    expect(completeStepLabel(row({ state: 'complete-unverified' }))).toBe('Complete, unverified');
    expect(completeStepTone(row({ state: 'degraded' }))).toBe('degraded');
  });

  test('a dead ChangeOrder is terminal, not outstanding — `aborted` never reaches the catch-all', () => {
    // The reversal this rung exists for. An aborted ChangeOrder at the last
    // stage will never satisfy `Final`, because nothing will ever be promoted
    // again. `blocked` is the accent treatment for "there is something to do
    // here", and there is nothing to do, ever.
    expect(completeStepTone(row({ state: 'aborted' }))).not.toBe('blocked');
    expect(completeStepTone(row({ state: 'aborted' }))).toBe('restored');

    // It shares the terminal treatment with the undone ChangeOrder and NOT its
    // word: the two are not the same thing, and the label is the only place
    // that difference can be told.
    expect(completeStepLabel(row({ state: 'aborted' }))).toBe('Aborted');
    expect(completeStepLabel(row({ state: 'aborted', restored: true }))).toBe('Restored');
    expect(completeStepLabel(row({ state: 'complete', restored: true }))).toBe('Restored');

    // And it stays BELOW every rung above it — the ladder is unchanged there.
    expect(completeStepTone(row({ state: 'aborted', nextStageId: 'prod' }))).toBe('gated');
  });

  test('the shared tone is asked which ChangeOrder it is before anything draws it', () => {
    // `isCompleteStepAbandoned` is what a renderer asks when the tone alone
    // would make it claim a restore. The rail node draws an undo glyph for a
    // ChangeOrder that was taken back out and a block glyph for one abandoned in
    // place; get this predicate backwards and the node tells a reader their
    // aborted ChangeOrder was undone, which it was not — whatever it promoted
    // before the abort is still promoted.
    expect(isCompleteStepAbandoned(row({ state: 'aborted' }))).toBe(true);
    expect(isCompleteStepAbandoned(row({ state: 'aborted', restored: true }))).toBe(false);
    expect(isCompleteStepAbandoned(row({ state: 'complete', restored: true }))).toBe(false);
    expect(isCompleteStepAbandoned(row({ state: 'degraded', restored: true }))).toBe(false);

    // It is asked ONLY of the tone it disambiguates. Every other reading has a
    // glyph of its own, and a true here would swap one of those for a block.
    for (const spec of [
      row({ state: 'complete' }),
      row({ state: 'complete-unverified' }),
      row({ state: 'degraded' }),
      row({ state: 'blocked' }),
      row({ state: 'ready', nextStageId: 'prod' }),
      row({ state: 'aborted', nextStageId: 'prod' }),
    ]) {
      expect(completeStepTone(spec)).not.toBe('restored');
      expect(isCompleteStepAbandoned(spec)).toBe(false);
    }

    // The predicate and the label cannot drift: they are the same question.
    for (const spec of [
      row({ state: 'aborted' }),
      row({ state: 'aborted', restored: true }),
      row({ state: 'complete', restored: true }),
    ]) {
      expect(completeStepLabel(spec) === 'Aborted').toBe(isCompleteStepAbandoned(spec));
    }
  });

  test('at the last stage, anything else is `blocked` — never a silent `done`', () => {
    // The catch-all rung. Each of these has reached the last stage and is NOT
    // finished, and the honest segment for that is the one that says something
    // is outstanding. `aborted` is deliberately absent: it cannot finish at
    // all, which is a different thing from not having finished yet.
    for (const state of [
      'ready',
      'progressing',
      'blocked',
      'no-workflow',
      'no-stages',
      'unknown',
    ] as ConsoleState[]) {
      expect(completeStepTone(row({ state }))).toBe('blocked');
      expect(completeStepLabel(row({ state }))).toBe('Not complete');
    }
  });
});

test.describe('buildCompleteConsoleStage — a segment shaped like a stage', () => {
  test('carries the printable id and the step tone', () => {
    const stage = buildCompleteConsoleStage(row({ state: 'complete' }));
    expect(stage.stageId).toBe(COMPLETE_SEGMENT_STAGE_ID);
    expect(stage.segmentTone).toBe('done');
    expect(stage.state.stageId).toBe(COMPLETE_SEGMENT_STAGE_ID);
  });
});
