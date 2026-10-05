// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What a console row OFFERS, as opposed to what it says. Pure derivation, no
// page, no browser — same pattern as `rollout-completion.spec.ts`.
//
// Two rules are asserted here, and both are about a row and its own controls
// agreeing with each other:
//
//  - which of the two end-rollout controls a row offers: "Roll back" (abort,
//    then restore every Space that took the change) and "Abort" (abort alone),
//    each barred by a different fact;
//  - a row whose chip says Complete while a stage still has not taken the change
//    must say so and must offer a way to act on it.

import { test, expect } from './fixtures/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import type { LiveStatus } from '../src/pages/x/apps/liveStatus';
import { carryingReleases, runningRelease } from './fixtures/running-release';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import {
  actionFor,
  buildConsoleRow,
  rolloutIntents,
  type ConsoleSpace,
  type ConsoleState,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';
import type { RolloutProgress } from '../src/pages/x/apps/rollout/rolloutTypes';

const HEALTHY: LiveStatus = {
  Sync: 'Synced',
  Operation: 'Succeeded',
  Health: 'Healthy',
};

// ── What a row offers to END the rollout ──────────────────────────────

/**
 * A progress reading with the given Spaces resolved and the given ones already
 * restored — the only two terms `rolloutIntents` reads out of it.
 */
function progressWith(resolved: string[], restored: string[] = []): RolloutProgress {
  return {
    availability: 'available',
    resolvedSpaceIds: new Set(resolved),
    releasedSpaceIds: new Set<string>(),
    carryingReleases: new Map(),
    restoredSpaceIds: new Set(restored),
    releasedRestoredSpaceIds: new Set<string>(),
  };
}

const UNAVAILABLE: RolloutProgress = {
  availability: 'unavailable',
  resolvedSpaceIds: new Set<string>(),
  releasedSpaceIds: new Set<string>(),
  carryingReleases: new Map(),
  restoredSpaceIds: new Set<string>(),
  releasedRestoredSpaceIds: new Set<string>(),
};

const LANDED = progressWith(['space-base', 'space-prod']);

/*
 * THE BARS, AND WHAT EACH ONE IS FOR.
 *
 * Aborting is reversible in general: clearing `AbortedReason` "is what puts it
 * back on its way, so it is writable at almost any point in a ChangeOrder's
 * life" (`validateChangeOrderFields`, internal/views/changeorder.go). The
 * server refuses the clearing once something has been RESTORED
 * (`RestoreTagID != uuid.Nil`), and a rollout already aborted has nothing to
 * decide twice.
 *
 * COMPLETION IS NOT A BAR. The server permits abort in every
 * state including Released (internal/models/changeorder.go), and `cub variant
 * demote` needs an `AbortedReason` and nothing else, so a finished rollout is
 * exactly as endable as one still in progress: rolling a landed release back
 * needs an entry point in the UI.
 */
test('a rollout still under way offers both ways to end it', () => {
  expect(rolloutIntents({ abortedReason: '', restored: false, progress: LANDED })).toEqual({
    rollBack: true,
    abort: true,
  });
});

test('a rollout already aborted offers no second decision, but still offers the undoing', () => {
  /*
   * THE CLI'S OWN ORDER OF OPERATIONS. `cub variant demote` REFUSES a
   * ChangeOrder with no `AbortedReason` — "change order '%s' has not been
   * aborted" — so aborting is the precondition for rolling back, never an
   * alternative to it. Withdrawing Roll back here would make "Abort" a trap
   * that locks the reader out of the only undo there is.
   */
  expect(
    rolloutIntents({ abortedReason: 'superseded', restored: false, progress: LANDED }),
  ).toEqual({ rollBack: true, abort: false });
});

/*
 * THE ONE-WAY DOOR, WHERE IT ACTUALLY IS. Once something has been restored the
 * server will not let the reason be cleared, so the rollout cannot be put back
 * on its way and cannot be promoted again. Neither control is offered: there is
 * no decision left to take and no undoing left to do.
 */
test('a restored rollout offers neither action', () => {
  expect(rolloutIntents({ abortedReason: '', restored: true, progress: LANDED })).toEqual({
    rollBack: false,
    abort: false,
  });
  expect(
    rolloutIntents({ abortedReason: 'rolled back', restored: true, progress: LANDED }),
  ).toEqual({ rollBack: false, abort: false });
});

test('a rollout the workflow calls finished can still be rolled back', () => {
  // `workflowComplete` is not a term of the answer at all — the row is not even
  // asked for it.
  expect(rolloutIntents({ abortedReason: '', restored: false, progress: LANDED }).rollBack).toBe(
    true,
  );
});

/*
 * A SCOPE NOBODY CAN STATE IS NOT A SCOPE TO WRITE OVER. `ResolvedSpaceIDs` is
 * derived server-side and its derivation failure is swallowed, so an absent
 * field is 200-with-no-answer rather than "nothing has been promoted". A
 * rollback run over that empty set would restore nothing and report that the
 * change had been taken back out. Abort needs no scope and stays.
 */
test('a rollout whose Spaces cannot be determined offers no rollback', () => {
  expect(rolloutIntents({ abortedReason: '', restored: false, progress: UNAVAILABLE })).toEqual({
    rollBack: false,
    abort: true,
  });
});

test('a rollout every Space of which has already been restored offers no rollback', () => {
  const progress = progressWith(['space-base', 'space-prod'], ['space-base', 'space-prod']);
  expect(rolloutIntents({ abortedReason: '', restored: false, progress }).rollBack).toBe(false);
});

// ── A row that is complete and still has a stage left behind ────────────────

const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };
const BASE = 'base-1';
const DEV_A = 'dev-a';
const DEV_B = 'dev-b';
const PROD = 'prod-1';

/**
 * `dev` then `prod`, with a health check on the end so the chip can read a plain
 * `complete` rather than `complete-unverified`.
 */
const WORKFLOW: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'" },
  ],
  Final: { Prerequisites: ['Healthy'] },
};

/**
 * The rollout ran through `dev` and `prod`, and a SECOND `dev` Space was created
 * afterwards. `cub` reads completion off the last stage, so the rollout is
 * finished — and `dev-b` never took the change and never will unless somebody
 * promotes it.
 */
function rowWithLateSpace(devSpaceIds: string[], abortedReason = '', stage = 'Completed') {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {
    [stageWhereSpace(WORKFLOW.Stages[0])]: devSpaceIds.map(
      (id) => ({ Space: { SpaceID: id } }) as ExtendedSpaceRead,
    ),
    [stageWhereSpace(WORKFLOW.Stages[1])]: [
      { Space: { SpaceID: PROD } } as ExtendedSpaceRead,
    ],
  };
  const spaces: ConsoleSpace[] = [
    { spaceId: BASE, slug: 'myapp-base', component: COMPONENT },
    ...[...devSpaceIds.map((id) => [id, 'dev'] as const), [PROD, 'prod'] as const].map(
      ([spaceId, stage]) => ({
        spaceId,
        slug: `myapp-${spaceId}`,
        component: COMPONENT,
        labels: { Stage: stage },
        releaseTargetId: `target-${spaceId}`,
        release: runningRelease(HEALTHY),
      }),
    ),
  ];
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: [BASE, DEV_A, PROD],
      releasedSpaceIds: [DEV_A, PROD],
      releases: carryingReleases([DEV_A, PROD]),
      inScopeSpaceIds: [BASE, ...devSpaceIds, PROD],
      governing: { state: 'governed', workflow: WORKFLOW, changeWorkflowId: 'wf-1' },
      abortedReason,
      stage,
    },
    spaces,
    stageSpaces,
  );
}

/*
 * ⚠️ THE CHIP IS `cub`'s ANSWER AND STAYS IT. `ChangeOrder.Stage` is recorded
 * off the last stage, so a Space added to an earlier stage after the rollout
 * finished does not re-open it. What the row must not do is then say "No blocker." while
 * its own strip names a next stage, counts 1 of 2 done and draws that stage as
 * still moving — one row telling a reader three different stories, and offering
 * nothing to do about the Space that was left behind.
 */
test('a complete row with a stage left behind says so rather than "No blocker."', () => {
  const row = rowWithLateSpace([DEV_A, DEV_B]);

  // The CLI's reading, unchanged.
  expect(row.state).toBe('complete');
  // And the rest of the row agrees with what it shows.
  expect(row.nextStageId).toBe('dev');
  expect(row.blocker).not.toBe('No blocker.');
  expect(row.blocker).toMatch(/dev/);
});

test('a complete row with every Space promoted still reports no blocker', () => {
  // The control: same workflow, same fixture, nothing left behind.
  const row = rowWithLateSpace([DEV_A]);
  expect(row.state).toBe('complete');
  expect(row.nextStageId).toBeNull();
  expect(row.blocker).toBe('No blocker.');
});

/*
 * ⚠️ A NON-EMPTY `abortedReason` IS THE ABORTED STATE. There is no separate
 * flag: the reason IS the record that someone ended this rollout deliberately,
 * so it has to outrank every reading the stages produce. The fixture below
 * would otherwise derive `complete` — the case that matters, because a row
 * that shows a finished rollout hides the abort outright, and the Blocker cell
 * then argues about stages the reader stopped caring about the moment the
 * rollout was ended.
 */
test('a non-empty aborted reason outranks the reading the stages produce', () => {
  const reason = 'rolled off for the incident';
  const row = rowWithLateSpace([DEV_A], reason);

  expect(row.state).toBe('aborted');
  expect(row.abortedReason).toBe(reason);
  // The cell says the reason rather than arguing about stages.
  expect(row.blocker).toBe(reason);
  // And the row's own controls read the same fact: an already-aborted rollout
  // has nothing left to stop.
  expect(rolloutIntents(row).abort).toBe(false);
});

/** The control: the same fixture with no reason is not aborted. */
test('an empty aborted reason leaves the row reading its stages', () => {
  expect(rowWithLateSpace([DEV_A]).state).toBe('complete');
});

/** The action reads the GATE channel, so a case is stated as one. */
const gate = (state: ConsoleState) => ({ channel: 'gate-verdict', state }) as const;

test('a complete row with a stage left behind offers something to do about it', () => {
  // `Open` is the right offer on a rollout that is finished and consistent: there
  // is nothing to act on, only something to look at. It is the wrong offer when a
  // Space is sitting in a stage the change never reached, because then there IS
  // something to act on and this row is the only place it surfaces.
  expect(actionFor({ gateState: gate('complete'), nextStageId: null }).label).toBe('Open');
  expect(actionFor({ gateState: gate('complete'), nextStageId: 'dev' }).label).toBe('Resolve');
  expect(actionFor({ gateState: gate('complete-unverified'), nextStageId: 'dev' }).label).toBe('Resolve');
  // Unchanged for every other reading — `Promote` still only on `ready`.
  expect(actionFor({ gateState: gate('ready'), nextStageId: 'dev' }).label).toBe('Promote');
  expect(actionFor({ gateState: gate('blocked'), nextStageId: 'dev' }).label).toBe('Resolve');
  expect(actionFor({ gateState: gate('aborted'), nextStageId: 'dev' }).label).toBe('Open');
});
