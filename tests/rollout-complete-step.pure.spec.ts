// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `completeStepTone` / `buildCompleteConsoleStage` (rolloutCompleteStep.ts) —
// the Complete step, exercised directly, same pure-derivation pattern as
// `rollout-outcome.pure.spec.ts`: no page, no browser, no fixtures.
//
// WHY THIS FILE IS THE WHOLE TEST FOR THE STEP. The Complete step is a
// SYNTHETIC segment: it corresponds to no rollout stage, so nothing in the
// stage derivations can vouch for it. Its only claim is the tone it picks, and
// that claim is a precedence ladder — `restored`, then a complete `state`,
// then `nextStageId`, then the rest of `state`. A ladder read in the wrong order is silent: every rung still
// returns a legal `SegmentTone`, and the page still draws a segment. The two
// reversals that actually change what a reader is told are asserted by name
// below:
//
//   - a rollout that was taken back out must read `restored`, not the `done`
//     its `state === 'complete'` would otherwise earn — the false green
//     `deriveSpaceVerdict` already refuses for the same reason.
//   - a rollout the server calls finished reads complete, even when a stage
//     is still named as next: the page says what `cub changeorder get` says.
//   - any other rollout with a stage still ahead of it must read `gated`,
//     because `Final.Prerequisites` are evaluated over the LAST stage and a
//     rollout that has not reached it has not been asked.
//   - an `aborted` rollout must NOT fall to the catch-all: it can never satisfy
//     `Final`, so the treatment that says "there is something to do here" is a
//     lie about it. It takes the terminal treatment and its own word.

import { expect, test } from '@playwright/test';

import {
  COMPLETE_SEGMENT_STAGE_ID,
  COMPLETE_STAGE_ID,
  COMPLETE_STEP_LABEL,
  buildCompleteConsoleStage,
  completeStepLabel,
  completeStepTone,
  isCompleteStepAbandoned,
  type CompleteStepRow,
} from '../src/pages/rollouts/rolloutCompleteStep';
import { stageDisplayName } from '../src/pages/x/apps/rollout/rolloutCopy';
import type { ConsoleStage, ConsoleState } from '../src/pages/x/apps/rollout/rolloutsConsoleModel';

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

/**
 * The hover title `RolloutStageStrip` composes for a segment, stated here in the
 * same terms the strip states it. The strip is handed a plain `ConsoleStage[]`
 * and is not changed for this step, so what a reader is told about the Complete
 * step is decided entirely by the segment this file builds — and it is decided
 * in a field no text scan of the page can reach.
 */
function segmentTitle(stage: ConsoleStage): string {
  return `${stageDisplayName(stage.stageId, stage.isSource)}: ${stage.state.label}`;
}

test.describe('completeStepTone — the precedence ladder, rung by rung', () => {
  test('`restored` outranks every other reading, including a complete one', () => {
    expect(completeStepTone(row({ state: 'complete', restored: true }))).toBe('restored');
    expect(completeStepTone(row({ state: 'degraded', restored: true }))).toBe('restored');
    // And it outranks the rung below it too: a restored rollout still short of
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
    // A complete row reads complete: the server called the rollout finished,
    // and the stage left behind is named in the row's Blocker cell instead.
    expect(completeStepTone(row({ state: 'complete', nextStageId: 'prod' }))).toBe('done');
    expect(completeStepTone(row({ state: 'complete-unverified', nextStageId: 'prod' }))).toBe('done');
  });

  test('at the last stage, the row state decides', () => {
    expect(completeStepTone(row({ state: 'complete' }))).toBe('done');
    // Drawn done like `complete`: a complete rollout fills every step, and
    // the label carries the unchecked health.
    expect(completeStepTone(row({ state: 'complete-unverified' }))).toBe('done');
    expect(completeStepLabel(row({ state: 'complete-unverified' }))).toBe('Complete, unverified');
    expect(completeStepTone(row({ state: 'degraded' }))).toBe('degraded');
  });

  test('a dead rollout is terminal, not outstanding — `aborted` never reaches the catch-all', () => {
    // The reversal this rung exists for. An aborted ChangeOrder at the last
    // stage will never satisfy `Final`, because nothing will ever be promoted
    // again. `blocked` is the accent treatment for "there is something to do
    // here", and there is nothing to do, ever.
    expect(completeStepTone(row({ state: 'aborted' }))).not.toBe('blocked');
    expect(completeStepTone(row({ state: 'aborted' }))).toBe('restored');

    // It shares the terminal treatment with the undone rollout and NOT its
    // word: the two are not the same thing, and the label is the only place
    // that difference can be told.
    expect(completeStepLabel(row({ state: 'aborted' }))).toBe('Aborted');
    expect(completeStepLabel(row({ state: 'aborted', restored: true }))).toBe('Restored');
    expect(completeStepLabel(row({ state: 'complete', restored: true }))).toBe('Restored');

    // And it stays BELOW every rung above it — the ladder is unchanged there.
    expect(completeStepTone(row({ state: 'aborted', nextStageId: 'prod' }))).toBe('gated');
  });

  test('the shared tone is asked which rollout it is before anything draws it', () => {
    // `isCompleteStepAbandoned` is what a renderer asks when the tone alone
    // would make it claim a restore. The rail node draws an undo glyph for a
    // rollout that was taken back out and a block glyph for one abandoned in
    // place; get this predicate backwards and the node tells a reader their
    // aborted rollout was undone, which it was not — whatever it promoted
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

test.describe('buildCompleteConsoleStage — a segment shaped like a stage, claiming nothing extra', () => {
  test('carries the printable id and the step tone', () => {
    const stage = buildCompleteConsoleStage(row({ state: 'complete' }));
    expect(stage.stageId).toBe(COMPLETE_SEGMENT_STAGE_ID);
    expect(stage.segmentTone).toBe('done');
    expect(stage.state.stageId).toBe(COMPLETE_SEGMENT_STAGE_ID);
  });

  test('names itself `Complete` on hover, and never its internal id', () => {
    // `stageDisplayName` prints a non-source id verbatim, so the id the segment
    // carries IS the name a reader gets. The routing identity stays out of it.
    expect(COMPLETE_SEGMENT_STAGE_ID).toBe(COMPLETE_STEP_LABEL);
    expect(COMPLETE_SEGMENT_STAGE_ID).not.toBe(COMPLETE_STAGE_ID);
    expect(segmentTitle(buildCompleteConsoleStage(row({ state: 'ready', nextStageId: 'prod' })))).toBe(
      'Complete: Not reached yet',
    );
    expect(segmentTitle(buildCompleteConsoleStage(row({ state: 'complete' })))).toBe(
      'Complete: Complete',
    );
    expect(segmentTitle(buildCompleteConsoleStage(row({ state: 'complete', restored: true })))).toBe(
      'Complete: Restored',
    );
    expect(segmentTitle(buildCompleteConsoleStage(row({ state: 'degraded' })))).toBe(
      'Complete: Degraded',
    );
    expect(segmentTitle(buildCompleteConsoleStage(row({ state: 'complete-unverified' })))).toBe(
      'Complete: Complete, unverified',
    );
    // The one title the tone alone cannot compose: `aborted` and `restored`
    // share a treatment, so the hover text is where a reader is told which of
    // the two this rollout is.
    expect(segmentTitle(buildCompleteConsoleStage(row({ state: 'aborted' })))).toBe(
      'Complete: Aborted',
    );
    expect(segmentTitle(buildCompleteConsoleStage(row({ state: 'blocked' })))).toBe(
      'Complete: Not complete',
    );
  });

  test('is never the source row', () => {
    // `isSource` is what every surface asks before printing a stage's name.
    // True here would label the terminal step "source".
    expect(buildCompleteConsoleStage(row({ state: 'complete' })).isSource).toBe(false);
  });

  test('claims no Spaces of its own', () => {
    // `Final.Prerequisites` are evaluated over the LAST stage's Spaces. Copying
    // those ids onto this segment would make a viewer in the last stage match
    // the Complete step as well as their own stage.
    const stage = buildCompleteConsoleStage(row({ state: 'complete' }));
    expect(stage.spaceIds).toEqual([]);
    expect(stage.spaceSlugs).toEqual([]);
    expect(stage.state.spaceCount).toBe(0);
  });

  test('carries no gates — the final checklist is read on the detail screen, not from a console row', () => {
    const stage = buildCompleteConsoleStage(row({ state: 'complete' }));
    expect(stage.gates).toEqual([]);
    expect(stage.state.gateTally).toEqual({ total: 0, satisfied: 0 });
  });

  test('promises no release — nothing is ever promoted into the Complete step', () => {
    // `hasReleaseTargets` asks whether a Space this step would be promoted INTO
    // can publish a Release. Nothing is promoted after Complete, so `true` here
    // would offer "Promote and release" on a step with no destination.
    expect(buildCompleteConsoleStage(row({ state: 'complete' })).hasReleaseTargets).toBe(false);
    expect(buildCompleteConsoleStage(row({ state: 'ready', nextStageId: 'prod' })).hasReleaseTargets).toBe(
      false,
    );
  });

  test('is labelled by its reading, and the step itself is called Complete', () => {
    expect(COMPLETE_STEP_LABEL).toBe('Complete');
    expect(buildCompleteConsoleStage(row({ state: 'complete' })).state.label).toBe('Complete');
    expect(buildCompleteConsoleStage(row({ state: 'complete-unverified' })).state.label).toBe(
      'Complete, unverified',
    );
    // The label is the row's, not the tone's — the rail node and the detail
    // panel's chip both print this field, and both must say which of the two
    // terminal readings they are looking at.
    expect(buildCompleteConsoleStage(row({ state: 'aborted' })).state.label).toBe('Aborted');
    expect(buildCompleteConsoleStage(row({ state: 'aborted', restored: true })).state.label).toBe(
      'Restored',
    );
    // Not finished, and it says so rather than borrowing the finished label.
    expect(buildCompleteConsoleStage(row({ state: 'ready', nextStageId: 'prod' })).state.label).not.toBe(
      'Complete',
    );
  });
});
