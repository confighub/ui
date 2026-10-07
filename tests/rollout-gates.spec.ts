// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';
import {
  applyServerGates,
  blockingGates,
  buildGatesForStage,
  gateStateFor,
  gatesOpen,
  onlyTheServerEvaluates,
  partitionBlockingGates,
} from '../src/pages/x/apps/rollout/rolloutGates';
import { gatesBlockPromotion } from '../src/pages/x/apps/rollout/rolloutFooterModel';
import type { RolloutStage, RolloutProgress } from '../src/pages/x/apps/rollout/rolloutTypes';
import { SOURCE_STAGE_ID, buildRolloutSequence } from '../src/pages/x/apps/rollout/rolloutStages';
import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import {
  gateSpaceInput,
  previousStageGateSpaces,
} from '../src/pages/rollouts/useRolloutDetail';
import { runningRelease } from './fixtures/running-release';

function stage(overrides: Partial<RolloutStage>): RolloutStage {
  return { id: 'staging', previousStageId: 'dev', spaceIds: ['s1'], index: 2, isSource: false, isFirst: false, prerequisites: [], ...overrides };
}
const progress: RolloutProgress = {
  availability: 'available',
  resolvedSpaceIds: new Set(['d1']),
  releasedSpaceIds: new Set(),
  carryingReleases: new Map(),
  restoredSpaceIds: new Set(),
  releasedRestoredSpaceIds: new Set(),
};

test('a stage with no declared prerequisites only checks promoted', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: [] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates.map((g) => g.id)).toEqual(['check/promoted']);
  // The verdict, not just the row: d1 has taken the change, so the one gate
  // this stage runs is satisfied and the stage really is promotable.
  expect(gates[0].ok).toBe(true);
  expect(gates[0].evaluated).toBe(true);
  expect(gates[0].reason).toMatch(/is the previous stage and has 1 Space/);
});

/*
 * The mandatory gate carries the taken-the-change check `evaluatePrerequisites`
 * opens with, which runs for every Space of the previous stage BEFORE it looks
 * at the stage's own
 * prerequisites. A stage declaring none is the case that has nothing else to
 * hold it: with only "the previous stage exists" behind `check/promoted`, the
 * Promote button is enabled (`blockingGateCount === 0`) for a stage whose
 * predecessor never received the change — a bulk clone+upgrade `cub variant
 * promote` would refuse.
 */
test('the promoted gate fails when a previous-stage Space has not taken the change', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: [] }),
    previousStageSpaces: [
      { spaceId: 'd1', loaded: true, variantName: 'dev', release: null },
      { spaceId: 'd2', loaded: true, variantName: 'dev-canary', release: null },
    ],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates.map((g) => g.id)).toEqual(['check/promoted']);
  expect(gates[0].evaluated).toBe(true);
  expect(gates[0].ok).toBe(false);
  // `cub`: "Variant '%s' has not taken change order '%s'", naming the first
  // Space that has not.
  expect(gates[0].reason).toBe("dev-canary has not taken 'co-1'.");
});

test('the promoted gate is not evaluated when progress is unavailable', () => {
  // Nothing is known about where the change has got to, so "has not taken it"
  // would be a refusal built on data never read.
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: [] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null }],
    progress: {
      availability: 'unavailable',
      resolvedSpaceIds: new Set(),
      releasedSpaceIds: new Set(),
      carryingReleases: new Map(),
      restoredSpaceIds: new Set(),
      releasedRestoredSpaceIds: new Set(),
    },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates[0].evaluated).toBe(false);
  expect(gates[0].ok).toBe(false);
  expect(gates[0].reason).toMatch(/progress is unavailable/i);
});

test('the promoted gate reports a previous stage that selects no Space', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: [] }),
    previousStageSpaces: [],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates[0].ok).toBe(false);
  expect(gates[0].reason).toMatch(/selects no Space/);
});

test('a Released prerequisite adds exactly the released gate', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Released'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null, releaseTargetId: 't1' }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates.map((g) => g.id)).toEqual(['check/promoted', 'check/released']);
});

test('Released and Healthy both declared adds both gates', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Released', 'Healthy'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null, releaseTargetId: 't1' }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates.map((g) => g.id)).toEqual(['check/promoted', 'check/released', 'check/healthy']);
});

test('the source stage has no gates', () => {
  const gates = buildGatesForStage({
    stage: stage({ isSource: true, previousStageId: null }),
    previousStageSpaces: [],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates).toEqual([]);
});

// ── Vocabulary and classification ───────────────────────────────────────────

/*
 * The built-in names are CAPITALISED, because that is how the server spells
 * them. A build matching the old lowercase spelling matches nothing a server
 * now sends and says nothing about it: the gate simply never appears, and the
 * stage reads as declaring less than it does. The lowercase case is asserted
 * from the other side for exactly that reason.
 */
test('a lowercase built-in name is not the built-in', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['released'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null, releaseTargetId: 't1' }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates.map((g) => g.id)).toEqual(['check/promoted', 'unrecognized-prerequisite:released']);
  // Refused rather than ignored: `cub` fails the promotion on a name it does
  // not know, so a page that dropped it would permit what the CLI refuses.
  expect(gates[1].evaluated).toBe(true);
  expect(gates[1].ok).toBe(false);
});

test('a declared custom prerequisite is a gate of its own, carrying its description', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['QA sign-off'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
    customPrerequisites: [
      {
        Name: 'QA sign-off',
        Description: 'A tester has recorded a pass against this Space.',
        Expression: 'cel:Space.Annotations["qa"] == "yes"',
      },
    ],
  });
  expect(gates.map((g) => g.id)).toEqual(['check/promoted', 'custom-prerequisite:QA sign-off']);
  expect(gates[1].name).toBe('check/QA sign-off');
  expect(gates[1].reason).toContain('A tester has recorded a pass against this Space.');
  // NOT EVALUATED, and that is the whole claim. `ui/` has no CEL evaluator, so
  // neither `ok: true` nor a failed verdict would be true of it.
  expect(gates[1].evaluated).toBe(false);
  expect(gates[1].ok).toBe(false);
});

/*
 * ⚠️ THE CASE THIS FILE EXISTS TO PIN.
 *
 * Routing custom prerequisites to a separate informational list would leave a
 * stage gating only on CEL with an EMPTY gate array — and `gatesOpen([])` is
 * true while `gateStateFor(0, 0)` is 'none'. An open padlock and a
 * clear-to-promote stage, on a stage nothing has checked. "Unknown renders as
 * pass" by omission is the worst outcome available here, so the gate array,
 * the padlock and the blocking count are all asserted together.
 */
test('a stage gating only on a custom prerequisite is not clear to promote', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['QA sign-off'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
    customPrerequisites: [
      { Name: 'QA sign-off', Expression: 'cel:Space.Annotations["qa"] == "yes"' },
    ],
  });
  expect(gates).not.toEqual([]);
  expect(gatesOpen(gates)).toBe(false);
  expect(blockingGates(gates).map((g) => g.id)).toContain('custom-prerequisite:QA sign-off');
  // Neither 'none' (no padlock, nothing to wait for) nor 'open' (checked and
  // clear). Both would read as promotable.
  expect(gateStateFor(gates)).not.toBe('none');
  expect(gateStateFor(gates)).not.toBe('open');
  expect(gateStateFor(gates)).toBe('unknown');
});

test('a name neither built in nor declared is unrecognised, not custom', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Approved'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
    customPrerequisites: [{ Name: 'QA sign-off', Expression: 'cel:true' }],
  });
  expect(gates.map((g) => g.id)).toEqual(['check/promoted', 'unrecognized-prerequisite:Approved']);
});

test('a declared custom prerequisite named on Final is classified the same way', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Released', 'QA sign-off'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null, releaseTargetId: 't1' }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
    customPrerequisites: [{ Name: 'QA sign-off', Expression: 'cel:true' }],
  });
  // Declared order is preserved, so a reader matches rows to workflow lines.
  expect(gates.map((g) => g.id)).toEqual([
    'check/promoted',
    'check/released',
    'custom-prerequisite:QA sign-off',
  ]);
});

// ── Unknown is not failed, and neither is a pass ────────────────────────────

const evaluatedOk = { id: 'a', name: 'a', ok: true, evaluated: true, reason: 'fine' };
const evaluatedBad = { id: 'b', name: 'b', ok: false, evaluated: true, reason: 'it failed' };
const unchecked = { id: 'c', name: 'c', ok: false, evaluated: false, reason: 'nobody looked' };

test('the padlock tells a failure from a check nobody made', () => {
  expect(gateStateFor([])).toBe('none');
  expect(gateStateFor([evaluatedOk])).toBe('open');
  expect(gateStateFor([evaluatedBad])).toBe('held');
  expect(gateStateFor([unchecked])).toBe('unknown');
  // A definite refusal outranks an unknown: the stage IS held, whatever else
  // is unresolved beside it.
  expect(gateStateFor([unchecked, evaluatedBad])).toBe('held');
  expect(gateStateFor([evaluatedOk, unchecked])).toBe('unknown');
});

/*
 * ⚠️ THE B6 DEFECT, PINNED.
 *
 * `blockingGates` returns failures and unmade checks mixed in declared order,
 * so quoting its first entry quotes whichever the workflow happened to list
 * first. With a CEL custom ahead of a failing `Released`, the screen said "not
 * checked" while the real, known cause went unmentioned — and the override the
 * user then wrote was justified against a cause that was never the cause.
 */
test('the principal reason is a failure when there is one, whatever the order', () => {
  const report = partitionBlockingGates([unchecked, evaluatedBad, evaluatedOk]);
  expect(report.failed.map((g) => g.id)).toEqual(['b']);
  expect(report.notEvaluated.map((g) => g.id)).toEqual(['c']);
  // NOT `unchecked`, which is what sorting first would have produced.
  expect(report.principal?.id).toBe('b');
});

test('with nothing failed, the unmade check is the whole story', () => {
  const report = partitionBlockingGates([evaluatedOk, unchecked]);
  expect(report.failed).toEqual([]);
  expect(report.principal?.id).toBe('c');
});

test('nothing blocking reports no principal at all', () => {
  const report = partitionBlockingGates([evaluatedOk]);
  expect(report.failed).toEqual([]);
  expect(report.notEvaluated).toEqual([]);
  expect(report.principal).toBeUndefined();
});

test('the summary states both counts, not just the one it quotes', () => {
  const report = partitionBlockingGates([unchecked, evaluatedBad]);
  const line = rolloutCopy.blockedBy(
    report.failed.length,
    report.notEvaluated.length,
    report.principal?.reason ?? '',
  );
  expect(line).toContain('it failed');
  expect(line).toContain('1 failed');
  expect(line).toContain('1 not checked');
});

// ── Unread is not exempt, and it is never a pass ────────────────────────────

/*
 * ⚠️ THE FAULT THESE THREE PIN.
 *
 * Both optional gates exempt a Space with no `ReleaseTargetID`: it publishes
 * nothing, so it cannot be asked to have released or to be reporting healthy.
 * But `releaseTargetId` is a field off the SPACE READ, and a Space that has not
 * been read carries `undefined` there too — so an unread Space is shaped
 * exactly like an exempt one. A gate that partitions on it BEFORE checking
 * whether anything was read drops every unread Space into the exempt half and
 * then reports a pass over the empty remainder.
 *
 * With nothing read at all that is a green gate over zero examined Spaces,
 * which is this whole feature's worst failure: unknown rendered as pass.
 */
const unreadSpace = (spaceId: string) => ({
  spaceId,
  loaded: false,
  variantName: spaceId,
  release: null,
});

test('a healthy gate over Spaces none of which have been read is not a pass', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: [unreadSpace('d1'), unreadSpace('d2')],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  const healthy = gates.find((g) => g.id === 'check/healthy');
  expect(healthy).toBeDefined();
  // NOT `ok: true`. Nothing was examined, so there is nothing to pass.
  expect(healthy?.ok).toBe(false);
  expect(healthy?.evaluated).toBe(false);
  // And it holds the stage, which is what `evaluated: false` has to mean.
  expect(blockingGates(gates).map((g) => g.id)).toContain('check/healthy');
});

test('a released gate over an unread Space does not excuse it as targetless', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Released'] }),
    // Resolved, so the "has taken the change" half passes and the targetless
    // exemption is the next thing reached — which is where an unread Space
    // slipped through.
    previousStageSpaces: [unreadSpace('d1')],
    progress: { ...progress, resolvedSpaceIds: new Set(['d1']) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  const released = gates.find((g) => g.id === 'check/released');
  expect(released).toBeDefined();
  expect(released?.ok).toBe(false);
  expect(released?.evaluated).toBe(false);
  expect(blockingGates(gates).map((g) => g.id)).toContain('check/released');
});

test('one unread Space among read ones is enough to withhold the verdict', () => {
  const read = {
    spaceId: 'd1',
    loaded: true,
    variantName: 'dev',
    release: runningRelease({ Sync: 'Synced', Operation: 'Succeeded', Health: 'Healthy' }),
    releaseTargetId: 't1',
  } as const;
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: [read, unreadSpace('d2')],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  // The read Space is green, but the stage is not: a gate is over EVERY Space
  // of the previous stage, and one of them has not been looked at.
  expect(gates.find((g) => g.id === 'check/healthy')?.evaluated).toBe(false);
});

// ── A Space the index does not hold is unread, never absent ─────────────────

/*
 * Stage membership comes from the workflow's own server-side `WhereSpace`
 * query, so it can name a Space the page's own Space list does not cover.
 * Dropping such a Space shrinks the previous stage: the gates then judge fewer
 * Spaces than the workflow declares and can report green over the remainder,
 * which is the same "unknown as pass" fault one level up.
 *
 * Both surfaces answer this one question, and they have to answer it the same
 * way or a rollout is judged differently depending on which screen is open.
 */
test('a previous-stage Space missing from the index is carried as unread', () => {
  const detail = gateSpaceInput('missing-1', undefined);
  expect(detail.loaded).toBe(false);
  expect(detail.spaceId).toBe('missing-1');
  // Named by its id when there is nothing better — never dropped, and never
  // given a display name it does not have.
  expect(detail.variantName).toBe('missing-1');
  expect(detail.releaseTargetId).toBeUndefined();
  expect(detail.release).toBeNull();
});

test('an unread Space withholds the gate rather than shrinking the stage', () => {
  // What the dropped-Space bug produced: a previous stage of one, judged green,
  // where the workflow named two.
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: [gateSpaceInput('present-1', undefined)],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates.find((g) => g.id === 'check/healthy')?.evaluated).toBe(false);
});

// ── Targetless is unknown, and unknown never opens a gate ───────────────────

/*
 * ⚠️ THE GATE BYPASS THESE PIN.
 *
 * A Space with no `ReleaseTargetID` was exempted from both optional gates, and
 * the exemption ran over Spaces that HAD been read. A fully-read Space
 * reporting Degraded/Failed therefore passed straight through: its live status
 * was held in hand and filtered out one line before anything read it, and both
 * gates reported a pass over the empty remainder. Downstream that enables the
 * Promote button, skips the override prompt entirely, and lets the row read a
 * Degraded stage as Complete.
 *
 * `cub variant promote` refuses this exact case on health, so the UI was
 * shipping the permissive side of the divergence. `Released` is different: a
 * targetless Space can never release, so it passes once it has taken the change.
 */
const readTargetless = {
  spaceId: 'd1',
  loaded: true,
  variantName: 'dev',
  release: null,
  releaseTargetId: undefined,
} as const;

test('a read targetless Space reporting Degraded holds the healthy gate', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Released', 'Healthy'] }),
    previousStageSpaces: [
      {
        ...readTargetless,
        release: runningRelease({ Sync: 'OutOfSync', Health: 'Degraded', Operation: 'Failed' }),
      },
    ],
    progress: { ...progress, resolvedSpaceIds: new Set(['d1']) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  const healthy = gates.find((g) => g.id === 'check/healthy');
  const released = gates.find((g) => g.id === 'check/released');
  // The status was READ. Reporting a pass here is reporting a Degraded Space as
  // healthy, which is the one thing this gate exists to prevent.
  expect(healthy?.ok).toBe(false);
  expect(released?.ok).toBe(true);
  expect(gatesOpen(gates)).toBe(false);
  expect(blockingGates(gates).map((g) => g.id)).toEqual(['check/healthy']);
});

/*
 * ⚠️ THE ORDER IS `checkSpaceIsHealthy`'s, AND THE TARGET COMES FIRST.
 *
 * The server refuses on `ReleaseTargetID == nil` BEFORE it reads any Release,
 * so a live status handed in for a targetless Space never decides anything:
 * whatever it says, health "cannot be determined". Reading the status first and
 * consulting the target only when none is reported inverts that, and a STALE
 * GREEN one then opens the gate — a Release published before a production
 * Space's Target was cleared still carries whatever was last reported on it.
 *
 * Both verdicts below hold the stage. They differ in what they claim, and only
 * one of them is a claim `cub` makes.
 */
test('a targetless Space is not judged on the status it still reports', () => {
  const green = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: [
      {
        ...readTargetless,
        release: runningRelease({ Sync: 'Synced', Health: 'Healthy', Operation: 'Succeeded' }),
      },
    ],
    progress: { ...progress, resolvedSpaceIds: new Set(['d1']) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  }).find((g) => g.id === 'check/healthy');
  // The bypass this pins: a green status on a targetless Space opening the
  // one gate standing between a change and production.
  expect(green?.ok).toBe(false);
  expect(green?.evaluated).toBe(false);
  expect(green?.reason).toContain('health cannot be determined');

  const degraded = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: [
      {
        ...readTargetless,
        release: runningRelease({ Sync: 'Synced', Health: 'Degraded', Operation: 'Succeeded' }),
      },
    ],
    progress: { ...progress, resolvedSpaceIds: new Set(['d1']) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  }).find((g) => g.id === 'check/healthy');
  // Not "is not healthy": that verdict would be read off a status the server
  // never reaches. Unknown, and unknown holds the stage just as firmly.
  expect(degraded?.ok).toBe(false);
  expect(degraded?.evaluated).toBe(false);
});

test('a targetless Space reporting nothing leaves the healthy gate unevaluated', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: [readTargetless],
    progress: { ...progress, resolvedSpaceIds: new Set(['d1']) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  const healthy = gates.find((g) => g.id === 'check/healthy');
  // Never `ok: true` over a set filtered to empty. `cub` refuses this Space's
  // health outright; the honest UI state is that nobody could check it.
  expect(healthy?.ok).toBe(false);
  expect(healthy?.evaluated).toBe(false);
  expect(blockingGates(gates).map((g) => g.id)).toContain('check/healthy');
});

test('a targetless Space that has taken the change satisfies the released gate', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Released'] }),
    previousStageSpaces: [readTargetless],
    progress: { ...progress, resolvedSpaceIds: new Set(['d1']) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  const released = gates.find((g) => g.id === 'check/released');
  // It can never release, so having taken the change is all there is to ask.
  expect(released?.ok).toBe(true);
  expect(released?.evaluated).toBe(true);
  expect(gatesOpen(gates)).toBe(true);
});

/*
 * The stage having taken the change is still asked FIRST, so a targetless Space
 * that never received it is told that — the true and more useful refusal —
 * rather than the generic "cannot be determined".
 */
test('a targetless Space that never took the change is told so', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Released'] }),
    previousStageSpaces: [readTargetless],
    progress: { ...progress, resolvedSpaceIds: new Set() },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  const released = gates.find((g) => g.id === 'check/released');
  expect(released?.evaluated).toBe(true);
  expect(released?.reason).toContain("has not taken 'co-1'");
});

/*
 * ── A TICK IS A CLAIM ABOUT THE CHANGE BEING PROMOTED ──────────────────────
 *
 * `releasedGate` repeats the taken-the-change check `evaluatePrerequisites`
 * opens with per Space because it runs before every other check; the health
 * gate did not, so a
 * previous-stage Space that is green and targeted but HAS NOT TAKEN THE CHANGE
 * rendered `Healthy ✓ satisfied` — a tick `cub` never reaches, over a workload
 * running something else entirely.
 *
 * The promote still blocks on the mandatory `promoted` gate, so this is what
 * the drawer SAYS rather than what it permits. That drawer is what an operator
 * reads while writing an override, and a green tick there is the one thing that
 * would persuade them the health question had been answered.
 */
test('the healthy gate does not tick for a Space that never took the change', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: [
      {
        spaceId: 'd1',
        loaded: true,
        variantName: 'dev',
        releaseTargetId: 't1',
        release: runningRelease({ Sync: 'Synced', Health: 'Healthy', Operation: 'Succeeded' }),
      },
    ],
    progress: { ...progress, resolvedSpaceIds: new Set() },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  const healthy = gates.find((g) => g.id === 'check/healthy');
  expect(healthy?.ok).toBe(false);
  /*
   * NOT EVALUATED, WHICH IS THE ONLY THING `cub` CAN BE SAID TO HAVE FOUND.
   * It stops at the promoted check and never reaches `checkSpaceIsHealthy`
   * for this Space, so there is no health verdict about it — and a stage the
   * change has not entered is not evidence of anything either way.
   *
   * A FAILURE here is a verdict the console files under the previous stage and
   * reads as "this rollout is unhealthy", which cost every three-or-more-stage
   * rollout mid-flight its Promote button. Withholding the tick is the whole of
   * what this check is for, and an unevaluated gate withholds it.
   */
  expect(healthy?.evaluated).toBe(false);
  // The same sentence `check/released` gives about the same Space, so the two
  // rows of the drawer do not name two different problems.
  expect(healthy?.reason).toContain("has not taken 'co-1'");
});

/*
 * AND THE TARGET IS STILL ASKED FIRST. A targetless Space that never took the
 * change is "health cannot be determined", because that is where `cub` stops:
 * `checkSpaceIsHealthy` refuses it before reading anything else about it.
 */
test('a targetless Space that never took the change is still unevaluated for health', () => {
  const healthy = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: [readTargetless],
    progress: { ...progress, resolvedSpaceIds: new Set() },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  }).find((g) => g.id === 'check/healthy');
  expect(healthy?.evaluated).toBe(false);
  expect(healthy?.reason).toContain('health cannot be determined');
});

/*
 * Whether a Space took the change is read off progress, so without progress the
 * health verdict has no honest answer either — the same refusal `check/released`
 * and `check/promoted` already give to the same missing data.
 */
test('the healthy gate is not evaluated when progress is unavailable', () => {
  const healthy = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: [
      {
        spaceId: 'd1',
        loaded: true,
        variantName: 'dev',
        releaseTargetId: 't1',
        release: runningRelease({ Sync: 'Synced', Health: 'Healthy', Operation: 'Succeeded' }),
      },
    ],
    progress: { ...progress, availability: 'unavailable', resolvedSpaceIds: new Set() },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  }).find((g) => g.id === 'check/healthy');
  expect(healthy?.ok).toBe(false);
  expect(healthy?.evaluated).toBe(false);
  expect(healthy?.reason).toMatch(/progress is unavailable/i);
});

// ── A previous stage is every Space it names, however many were read ────────

/*
 * ⚠️ THE DROPPED-SPACE HALF, COVERED WHERE IT IS DECIDED.
 *
 * `gateSpaceInput` answers for ONE Space and was tested on its own; the mapping
 * that calls it — which decided whether a Space the index cannot answer for is
 * carried or skipped — was a `flatMap` inside a `useMemo` and had no test at
 * all. Skipping those Spaces shrank the previous stage, and the gates then
 * reported a verdict over the remainder as though it were the whole stage.
 */
test('every Space a stage names produces an input, read or not', () => {
  const index = new Map([
    ['read-1', { spaceId: 'read-1', slug: 'dev-a', releaseTargetId: 't1', release: runningRelease(null) }],
  ]);
  const inputs = previousStageGateSpaces(['read-1', 'missing-1', 'missing-2'], index);
  // Three named, three carried. Never two.
  expect(inputs.map((s) => s.spaceId)).toEqual(['read-1', 'missing-1', 'missing-2']);
  expect(inputs.map((s) => s.loaded)).toEqual([true, false, false]);
});

/*
 * A Space with a release Target is not read until its Releases are: which one
 * it is running is what the health gate reads, and "runs no Release" would be a
 * refusal made before looking.
 */
test('a targeted Space whose Releases have not been read is unread', () => {
  const index = new Map([
    ['space-only', { spaceId: 'space-only', slug: 'dev-a', releaseTargetId: 't1' }],
    ['targetless', { spaceId: 'targetless', slug: 'dev-b' }],
  ]);
  const inputs = previousStageGateSpaces(['space-only', 'targetless'], index);
  // A targetless Space runs no Release, so there is nothing more to read.
  expect(inputs.map((s) => s.loaded)).toEqual([false, true]);
});

test('a stage naming no Space produces no inputs', () => {
  expect(previousStageGateSpaces(undefined, new Map())).toEqual([]);
  expect(previousStageGateSpaces([], new Map())).toEqual([]);
});

test('a partially-read previous stage withholds its gates rather than shrinking', () => {
  const index = new Map([
    [
      'read-1',
      {
        spaceId: 'read-1',
        slug: 'dev-a',
        releaseTargetId: 't1',
        release: runningRelease({ Sync: 'Synced', Health: 'Healthy', Operation: 'Succeeded' }),
      },
    ],
  ]);
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Healthy'] }),
    previousStageSpaces: previousStageGateSpaces(['read-1', 'missing-1'], index),
    progress: { ...progress, resolvedSpaceIds: new Set(['read-1', 'missing-1']) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  // The one Space the page holds is green. The stage is not: the workflow named
  // two, and a gate over a stage is over all of it.
  expect(gates.find((g) => g.id === 'check/healthy')?.evaluated).toBe(false);
});

// ── The first stage is ungated ──────────────────────────────────────────────

/*
 * `validateStageEntryGates` returns nil on `previousStage == nil`, and the model
 * says the first Stage's prerequisites "are therefore never evaluated"
 * (internal/models/changeworkflow.go). `buildRolloutSequence` hands the first
 * real stage the synthetic SOURCE row as its predecessor, so that shape means
 * the same thing and has to answer the same way.
 *
 * ⚠️ THE STAGE COMES FROM `buildRolloutSequence`, NOT FROM A HAND-BUILT ONE.
 * The branch went uncovered because the shared fixture declares no prerequisite
 * on its first stage, so no spec could reach it. A stage literal with
 * `isFirst: true` typed in by hand would prove the guard and still leave the
 * wiring untested — that the sequence builder really does mark the first stage,
 * and really does put the base Space behind it, on a stage whose prerequisites
 * really are declared.
 */
function firstStageOf(prerequisites: string[]): RolloutStage {
  const sequence = buildRolloutSequence(
    {
      Stages: [
        { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'", Prerequisites: prerequisites },
        { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'" },
      ],
    },
    { dev: [{ Space: { SpaceID: 'd1' } } as never], prod: [{ Space: { SpaceID: 'p1' } } as never] },
    'base-1',
  );
  const first = sequence.stages.find((s) => s.id === 'dev');
  if (first === undefined) throw new Error('the sequence lost its first stage');
  return first;
}

/** The base Space: no release target, so no Release and no live status, ever. */
const BASE_SPACE = {
  spaceId: 'base-1',
  loaded: true,
  variantName: 'myapp-base',
  release: null,
} as const;

test('the sequence really does make the base Space the first stage gate subject', () => {
  // The premise of every assertion below. Without it they would pass over a
  // stage that simply had no previous stage, proving nothing about this branch.
  expect(firstStageOf(['Healthy']).previousStageId).toBe(SOURCE_STAGE_ID);
  // The flag the guard actually reads. A stage name cannot reach it, which is
  // the whole reason the guard stopped reading `previousStageId`.
  expect(firstStageOf(['Healthy']).isFirst).toBe(true);
  expect(firstStageOf(['Healthy']).prerequisites).toEqual(['Healthy']);
});

test('a first stage declaring built-in prerequisites is gated on nothing', () => {
  const gates = buildGatesForStage({
    stage: firstStageOf(['Healthy', 'Released']),
    previousStageSpaces: [BASE_SPACE],
    progress: { ...progress, resolvedSpaceIds: new Set(['base-1']) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  // Not "unsatisfied", not "unknown": there is no gate. The base holds the
  // change by definition and `cub` promotes into the first stage without asking
  // it anything.
  expect(gates).toEqual([]);
  expect(gatesOpen(gates)).toBe(true);
  // `none` draws no padlock at all. `unknown` would draw one and refuse the
  // promote outright — on every first promotion there has ever been.
  expect(gateStateFor(gates)).toBe('none');
  expect(blockingGates(gates)).toEqual([]);
});

test('the mandatory promoted gate is not run on the first stage either', () => {
  // The base is not in `resolvedSpaceIds` here, which for any other stage is the
  // "has not taken the change" refusal. The first stage is promoted into from
  // the Space the change was authored in, so there is nothing to have taken.
  const gates = buildGatesForStage({
    stage: firstStageOf([]),
    previousStageSpaces: [BASE_SPACE],
    progress: { ...progress, resolvedSpaceIds: new Set() },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates).toEqual([]);
});

/*
 * The narrow reading of the rule — "a targetless Space's health is unknown, not
 * exempt" — is a property of every stage that has a real predecessor, and it is
 * what the first-stage exemption must not quietly undo. `Released` passes.
 */
test('the stage after the first still holds on a targetless predecessor', () => {
  const gates = buildGatesForStage({
    stage: stage({ id: 'prod', previousStageId: 'dev', prerequisites: ['Healthy', 'Released'] }),
    previousStageSpaces: [{ ...BASE_SPACE, spaceId: 'd1', variantName: 'dev' }],
    progress: { ...progress, resolvedSpaceIds: new Set(['d1']) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  expect(gates.find((g) => g.id === 'check/healthy')?.evaluated).toBe(false);
  expect(gates.find((g) => g.id === 'check/released')?.ok).toBe(true);
  expect(gatesOpen(gates)).toBe(false);
  expect(gateStateFor(gates)).toBe('unknown');
});

// ── Checks only the server makes ────────────────────────────────────────────

const ATTESTATIONS = [{ Name: 'Two approvals', Description: 'Two release managers approved it.', Count: 2 }];

test('a declared Attestation requirement is a gate of its own, not an unrecognised name', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Two approvals'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
    attestationPrerequisites: ATTESTATIONS,
  });
  expect(gates.map((g) => g.id)).toEqual(['check/promoted', 'attestation-prerequisite:Two approvals']);
  expect(gates[1].reason).toContain('Two release managers approved it.');
  expect(gates[1].evaluated).toBe(false);
  expect(gates[1].prerequisite).toBe('Two approvals');
  expect(gateStateFor(gates)).toBe('unknown');
});

test('Validated and declared checks are the server\'s to evaluate; the rest are not', () => {
  const custom = [{ Name: 'QA sign-off', Expression: 'cel:true' }];
  expect(onlyTheServerEvaluates('Validated', custom, ATTESTATIONS)).toBe(true);
  expect(onlyTheServerEvaluates('QA sign-off', custom, ATTESTATIONS)).toBe(true);
  expect(onlyTheServerEvaluates('Two approvals', custom, ATTESTATIONS)).toBe(true);
  expect(onlyTheServerEvaluates('Released', custom, ATTESTATIONS)).toBe(false);
  expect(onlyTheServerEvaluates('Healthy', custom, ATTESTATIONS)).toBe(false);
  expect(onlyTheServerEvaluates('Approved', custom, ATTESTATIONS)).toBe(false);
});

/*
 * A gate nobody could evaluate keeps a stage from reading as ready, and does not
 * stop the promotion: the server evaluates it when asked, and refuses with 409
 * when it does not hold. Refusing on it here made a stage gating on Validated
 * impossible to promote from the UI.
 */
test('only a failed gate refuses a promote; an unevaluated one is left to the server', () => {
  const gates = buildGatesForStage({
    stage: stage({ prerequisites: ['Validated'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
  const report = partitionBlockingGates(gates);
  expect(report.notEvaluated.map((g) => g.id)).toEqual(['validated']);
  expect(gatesOpen(gates)).toBe(false);
  expect(gatesBlockPromotion(report.failed.length)).toBe(false);
});

function validatedGates(resolved: string[]) {
  return buildGatesForStage({
    stage: stage({ prerequisites: ['Released', 'Validated'] }),
    previousStageSpaces: [
      { spaceId: 'd1', loaded: true, variantName: 'dev', release: null },
      { spaceId: 'd2', loaded: true, variantName: 'dev-2', release: null },
    ],
    progress: { ...progress, resolvedSpaceIds: new Set(resolved) },
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
  });
}

test('the server\'s pass in every Space opens a gate this page could not evaluate', () => {
  const gates = applyServerGates(
    validatedGates(['d1', 'd2']),
    [
      { Prerequisite: 'Promoted', SpaceID: 'd1', Satisfied: true },
      { Prerequisite: 'Released', SpaceID: 'd1', Satisfied: true },
      { Prerequisite: 'Validated', SpaceID: 'd1', Satisfied: true },
      { Prerequisite: 'Promoted', SpaceID: 'd2', Satisfied: true },
      { Prerequisite: 'Released', SpaceID: 'd2', Satisfied: true },
      { Prerequisite: 'Validated', SpaceID: 'd2', Satisfied: true },
    ],
    stage({}),
  );
  const validated = gates.find((g) => g.id === 'validated');
  expect(validated?.evaluated).toBe(true);
  expect(validated?.ok).toBe(true);
  expect(validated?.reason).toBe(rolloutCopy.gateReasons.satisfiedOnServer('dev'));
  expect(gatesOpen(gates)).toBe(true);
});

test('the server\'s failure is reported in its own words', () => {
  const message = "unable to promote to stage 'staging', Variant 'dev-2' has ValidationErrors";
  const gates = applyServerGates(
    validatedGates(['d1', 'd2']),
    [
      { Prerequisite: 'Promoted', SpaceID: 'd1', Satisfied: true },
      { Prerequisite: 'Validated', SpaceID: 'd1', Satisfied: true },
      { Prerequisite: 'Promoted', SpaceID: 'd2', Satisfied: true },
      { Prerequisite: 'Validated', SpaceID: 'd2', Satisfied: false, Message: message },
    ],
    stage({}),
  );
  const validated = gates.find((g) => g.id === 'validated');
  expect(validated?.evaluated).toBe(true);
  expect(validated?.ok).toBe(false);
  expect(validated?.reason).toBe(message);
  expect(gateStateFor(gates)).toBe('held');
  expect(gatesBlockPromotion(partitionBlockingGates(gates).failed.length)).toBe(true);
});

/*
 * The server evaluates nothing past `Promoted` in a Space the change has not
 * reached, so a prerequisite with no failure there has not passed there either.
 */
test('a check the server made in only some Spaces is not a pass', () => {
  const gates = applyServerGates(
    validatedGates(['d1']),
    [
      { Prerequisite: 'Promoted', SpaceID: 'd1', Satisfied: true },
      { Prerequisite: 'Validated', SpaceID: 'd1', Satisfied: true },
      { Prerequisite: 'Promoted', SpaceID: 'd2', Satisfied: false, Message: 'not taken' },
    ],
    stage({}),
  );
  expect(gates.find((g) => g.id === 'validated')?.evaluated).toBe(false);
});

test('a gate this page evaluated keeps its own verdict', () => {
  const before = validatedGates(['d1', 'd2']);
  const after = applyServerGates(
    before,
    [
      { Prerequisite: 'Promoted', SpaceID: 'd1', Satisfied: true },
      { Prerequisite: 'Released', SpaceID: 'd1', Satisfied: false, Message: 'from an older read' },
      { Prerequisite: 'Validated', SpaceID: 'd1', Satisfied: true },
    ],
    stage({}),
  );
  expect(after.find((g) => g.id === 'check/released')).toEqual(before.find((g) => g.id === 'check/released'));
});

/*
 * A prerequisite is a condition on the stage BEFORE the one being entered, so a
 * check this page cannot make is described as a condition on that stage, by
 * name, and never as something the stage being entered must have.
 */
test('a check the server makes is worded as a condition on the previous stage', () => {
  const gates = buildGatesForStage({
    stage: stage({ id: 'test', previousStageId: 'dev', prerequisites: ['Validated', 'QA sign-off', 'Two approvals'] }),
    previousStageSpaces: [{ spaceId: 'd1', loaded: true, variantName: 'dev', release: null }],
    progress,
    componentName: 'MyApp',
    changeOrderSlug: 'co-1',
    customPrerequisites: [{ Name: 'QA sign-off', Expression: 'cel:true' }],
    attestationPrerequisites: ATTESTATIONS,
  });
  const reasons = gates.slice(1).map((g) => g.reason);
  expect(reasons).toHaveLength(3);
  for (const reason of reasons) {
    expect(reason).toMatch(/(any|every) Space of 'dev'/i);
    expect(reason).not.toContain("'test'");
  }
  expect(reasons[0]).toBe(rolloutCopy.gateReasons.validated('dev'));
});
