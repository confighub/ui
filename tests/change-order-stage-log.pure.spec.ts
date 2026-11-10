// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * THE STAGE LOG: WHAT HAPPENED, IN TIME ORDER, ABOVE NOW; WHAT STILL HAS TO
 * HAPPEN BELOW IT; AND THE ONE PILL THAT SAYS THE STATE.
 *
 * Each case breaks one rule of `stageLogModel.ts`: time order with the
 * untimed lines last, a failed prerequisite as a red line that locks Promote,
 * the release waiting for the promote and its review, and the pill's order
 * (failure, then busy, then warning, then "Your turn").
 */
import { expect, test } from '@playwright/test';

import { segmentsText, stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';
import {
  type StageLogInput,
  type StageLogLine,
  deriveStageLog,
  gateDetail,
  releaseRanCount,
  releaseReviewHolds,
  stageLogPill,
  warnProblemsOf,
} from '../src/pages/change-orders/stage/stageLogModel';
import {
  AWAITING_TRIGGERS_GATE,
  gateLabels,
  gateNamesOf,
  splitGatedItems,
  triggerNamesByGate,
} from '../src/pages/change-orders/stage/stageFailure';
import { hasTheChangeIds } from '../src/pages/change-orders/stage/stageHasTheChange';
import type {
  PropagationProblem,
  StageCardState,
  StageFailure,
} from '../src/pages/change-orders/stage/stageTypes';

const T = (hhmm: string) => Date.parse(`2026-10-26T${hhmm}:00Z`);

const soak = {
  id: 'custom-prerequisite:soak-1h',
  name: 'soak-1h',
  passed: true,
  evaluated: true,
  description: '1 hour in Test, no restarts',
  failedIn: [],
};
const window = {
  id: 'custom-prerequisite:change-window',
  name: 'change-window',
  passed: true,
  evaluated: true,
  description: 'open Mon–Thu 09:00–16:00 UTC',
  failedIn: [],
};

function input(state: StageCardState, over: Partial<StageLogInput> = {}): StageLogInput {
  return {
    state,
    stage: { id: 'prod', name: 'Public' },
    previousStage: { stageId: 'staging', name: 'Test' },
    arrival: { at: T('13:58'), person: { name: 'Charles Ewing', isYou: true } },
    spaceCount: 7,
    targetCount: 7,
    stageHasTargets: true,
    gates: [soak, window],
    gatesUnread: false,
    gateCheckedAt: T('14:30'),
    approvals: [
      {
        at: T('14:20'),
        person: { name: 'Jesper', isYou: false },
        note: 'Checked image tag 1.43.1 against the release notes.',
      },
    ],
    approvalsRequired: 1,
    releaseApprovals: [],
    releaseReviewOpen: ['release-ok'],
    dryRunUnavailable: false,
    dryRunRunning: false,
    busy: null,
    problems: [],
    ...over,
  };
}

const ids = (lines: readonly StageLogLine[]) => lines.map((l) => l.testId);

test('ready: history in time order, then the promote prompt and the locked release', () => {
  const view = deriveStageLog(input({ kind: 'ready', approvedByYou: false }));
  expect(ids(view.history)).toEqual([
    'log-arrival',
    'log-approval-1',
    'log-gate-1',
    'log-gate-2',
  ]);
  expect(view.history.map((l) => l.at)).toEqual([
    T('13:58'),
    T('14:20'),
    T('14:30'),
    T('14:30'),
  ]);
  expect(view.open.map((o) => o.testId)).toEqual(['open-promote', 'open-release']);
  const [promote, release] = view.open;
  expect(promote?.kind === 'promote' && promote.locked).toBeUndefined();
  expect(release?.kind === 'release' && release.locked).toEqual({
    after: true,
    waits: [{ kind: 'promote' }, { kind: 'releaseReview', name: 'release-ok' }],
  });
  expect(
    stageLogPill({
      view,
      state: { kind: 'ready', approvedByYou: false },
      stageName: 'Public',
      waitingOn: [],
      viewerPrompted: false,
      busy: false,
    }),
  ).toEqual({
    tone: 'neutral',
    label: 'Your turn',
  });
});

test('a failed prerequisite is a red line, locks Promote, and names the pill', () => {
  const failed = {
    ...soak,
    passed: false,
    failedIn: [{ spaceId: 's1', name: 'staging-use2-confighub-app' }],
  };
  const state: StageCardState = { kind: 'gateFailed', gates: [], waiting: [] };
  const view = deriveStageLog(input(state, { gates: [failed, window], approvals: [] }));
  const red = view.history.find((l) => l.testId === 'log-gate-1');
  expect(red?.tone).toBe('bad');
  const promote = view.open.find((o) => o.kind === 'promote');
  expect(promote?.kind === 'promote' && promote.locked).toEqual({
    why: 'waits',
    waits: [{ kind: 'gate', name: 'soak-1h' }],
  });
  const pill = stageLogPill({
    view,
    state,
    stageName: 'Public',
    waitingOn: [],
    viewerPrompted: false,
    busy: false,
  });
  expect(pill).toEqual({ tone: 'error', label: 'soak-1h failed', target: red?.anchor });
});

test('two failed gates: the pill counts them, with the other red lines after a plus', () => {
  const a = { ...soak, passed: false };
  const b = { ...window, passed: false };
  const rejection = {
    rejecter: { userId: 'j', name: 'Jesper', initials: 'J', isYou: false },
    note: 'no',
    createdAt: '2026-10-26T14:00:00Z',
    requirementName: 'prod-approval',
  };
  const state: StageCardState = {
    kind: 'reviewRejected',
    rejection,
    failedGates: [],
    action: 'promote',
    gateKey: 'entry:prod',
    flow: {
      kind: 'notEligible',
      types: [],
      own: [],
      nothingRecordable: false,
      ownNotCounted: [],
    },
    problems: [],
  };
  const view = deriveStageLog(input(state, { gates: [a, b], approvals: [] }));
  const pill = stageLogPill({
    view,
    state,
    stageName: 'Public',
    rejecterName: 'Jesper',
    waitingOn: [],
    viewerPrompted: false,
    busy: false,
  });
  expect(pill.label).toBe('2 gates failed · +1');
  expect(pill.tone).toBe('error');
});

test('an abort and a restore have no time: they sort last, and an aborted stage offers nothing', () => {
  const view = deriveStageLog(input({ kind: 'aborted', reason: 'Rolled out by mistake.' }));
  expect(ids(view.history).at(-1)).toBe('log-aborted');
  expect(view.history.at(-1)?.at).toBeUndefined();
  expect(view.open).toEqual([]);
  const restored = deriveStageLog(
    input({ kind: 'restored', verdict: 'restore-released', problems: [] }),
  );
  expect(ids(restored.history).slice(-2)).toEqual(['log-restored', 'log-restore-released']);
  expect(restored.end).toEqual({ kind: 'nothingLeft' });
});

test('aborted then restored: the abort line, then the restore line; pill Restored; nothing to do', () => {
  const state: StageCardState = { kind: 'restored', verdict: 'restored', problems: [], abortedReason: 'UnitsRecreated' };
  const view = deriveStageLog(input(state));
  expect(ids(view.history).slice(-2)).toEqual(['log-aborted', 'log-restored']);
  const aborted = view.history.find((l) => l.testId === 'log-aborted');
  expect(aborted?.body).toEqual({ kind: 'aborted', reason: 'UnitsRecreated' });
  expect(view.open).toEqual([]);
  expect(stageLogPill({ view, state, stageName: 'Public', waitingOn: [], viewerPrompted: false, busy: false }).label).toBe('Restored');
  const released = deriveStageLog(
    input({ kind: 'restored', verdict: 'restore-released', problems: [], abortedReason: 'UnitsRecreated' }),
  );
  expect(ids(released.history).slice(-3)).toEqual(['log-aborted', 'log-restored', 'log-restore-released']);
  expect(released.end).toEqual({ kind: 'nothingLeft' });
});

test('restored, not released: no promote is offered, because the server refuses to promote a restored ChangeOrder', () => {
  const state: StageCardState = { kind: 'restored', verdict: 'restored', problems: [] };
  const view = deriveStageLog(input(state));
  expect(ids(view.history).at(-1)).toBe('log-restored');
  expect(view.open).toEqual([]);
  expect(view.end).toBeUndefined();
  const pill = stageLogPill({
    view,
    state,
    stageName: 'Public',
    waitingOn: [],
    viewerPrompted: false,
    busy: false,
  });
  expect(pill.label).toBe('Restored');
});

test('promoted: the release prompt is open once its review is approved; a release review keeps it locked', () => {
  const promoted = { at: T('14:02'), person: { name: 'Charles Ewing', isYou: true } };
  const open = deriveStageLog(
    input({ kind: 'promoted', took: [] }, { promoted, releaseReviewOpen: [] }),
  );
  expect(open.open.map((o) => o.testId)).toEqual(['open-release']);
  expect(open.open[0]?.kind === 'release' && open.open[0].locked).toBeUndefined();
  const waiting = deriveStageLog(input({ kind: 'promoted', took: [] }, { promoted }));
  expect(waiting.open[0]?.kind === 'release' && waiting.open[0].locked).toEqual({
    after: false,
    waits: [{ kind: 'releaseReview', name: 'release-ok' }],
  });
});

test('the release line is absent when no Space of the stage has a release Target', () => {
  const view = deriveStageLog(
    input({ kind: 'ready', approvedByYou: false }, { stageHasTargets: false }),
  );
  expect(view.open.map((o) => o.testId)).toEqual(['open-promote']);
  const done = deriveStageLog(
    input({ kind: 'promotedNoTargets' }, { stageHasTargets: false }),
  );
  expect(done.end).toEqual({ kind: 'noTargets' });
});

test('loading, empty and error each look different', () => {
  const loading = deriveStageLog(input({ kind: 'loading' }));
  expect(loading.loading).toBe(true);
  expect(ids(loading.history)).toEqual(['log-arrival']);
  const empty = deriveStageLog(input({ kind: 'noSpaces' }));
  expect(ids(empty.history)).toEqual(['log-arrival', 'log-empty']);
  expect(empty.hideChangeCard).toBe(true);
  const error = deriveStageLog(
    input(
      { kind: 'ready', approvedByYou: false },
      { dryRunUnavailable: true, now: T('12:40') },
    ),
  );
  expect(ids(error.history)).toEqual(['log-arrival', 'log-error']);
  expect(error.history[1]?.at).toBe(T('12:40'));
  expect(error.open).toEqual([]);
  expect(
    stageLogPill({
      view: error,
      state: { kind: 'ready', approvedByYou: false },
      stageName: 'Test',
      waitingOn: [],
      viewerPrompted: false,
      busy: false,
    }),
  ).toMatchObject({
    tone: 'error',
    label: "Can't check Test",
  });
});

test('a stage promoted, released or restored has nothing left to plan: no "can\'t tell" line, other warnings stay', () => {
  const unplanned: PropagationProblem = { kind: 'unknown', spaceIds: ['s'], cause: 'unplanned' };
  const kept: PropagationProblem = {
    kind: 'kept',
    spaceId: 's',
    unitId: 'u',
    resourceName: 'api-gateway',
    path: 'spec.replicas',
    label: 'spec.replicas',
    value: '6',
    valueText: '6',
    reason: 'Subtracted',
  };
  const both = [unplanned, kept];
  expect(warnProblemsOf({ kind: 'released', took: both }, false)).toEqual([kept]);
  expect(warnProblemsOf({ kind: 'promoted', took: both }, false)).toEqual([kept]);
  expect(warnProblemsOf({ kind: 'restored', verdict: 'restored', problems: both, abortedReason: 'x' }, false)).toEqual([kept]);
  // A stage that can still be promoted keeps it: its dry run could not plan a Space it is about to write.
  expect(warnProblemsOf({ kind: 'problem', problems: both }, false)).toEqual(both);
});

test('a warning is amber in the pill and offers Promote anyway; a failure outranks it', () => {
  const problems: PropagationProblem[] = [
    {
      kind: 'kept',
      spaceId: 's',
      unitId: 'u',
      resourceName: 'api-gateway',
      path: 'spec.replicas',
      label: 'spec.replicas',
      value: '6',
      valueText: '6',
      reason: 'Subtracted',
    },
  ];
  const state: StageCardState = { kind: 'problem', problems };
  const view = deriveStageLog(input(state, { problems }));
  const promote = view.open.find((o) => o.kind === 'promote');
  expect(promote?.kind === 'promote' && promote.anyway).toBe(true);
  expect(
    stageLogPill({
      view,
      state,
      stageName: 'Public',
      warningTitle: '1 Space keeps its own value',
      waitingOn: [],
      viewerPrompted: false,
      busy: false,
    }),
  ).toMatchObject({
    tone: 'warning',
    label: '1 Space keeps its own value',
  });
  expect(
    stageLogPill({
      view,
      state,
      stageName: 'Public',
      warningTitle: '1 Space keeps its own value',
      waitingOn: [],
      viewerPrompted: false,
      busy: true,
    }).label,
  ).toBe('Working…');
});

test('a failed promotion: a red line, and Retry in the prompt', () => {
  const failure: StageFailure = {
    action: 'promote',
    source: 'record',
    failedSpaces: [],
    landedCount: 2,
    spaceCount: 3,
    outOfScope: false,
    message: '',
    at: T('14:05'),
  };
  const state: StageCardState = { kind: 'failed', failure, canRetry: true };
  const view = deriveStageLog(input(state));
  expect(view.history.find((l) => l.testId === 'log-promote-failed')?.tone).toBe('bad');
  const promote = view.open.find((o) => o.kind === 'promote');
  expect(promote?.kind === 'promote' && promote.verb).toBe('retry');
  expect(
    stageLogPill({
      view,
      state,
      stageName: 'Test',
      waitingOn: [],
      viewerPrompted: false,
      busy: false,
    }).label,
  ).toBe('Promote failed');
});

test('the prerequisite read refused (403): each prerequisite reads "not checked", and none locks Promote', () => {
  const view = deriveStageLog(input({ kind: 'noPermission' }, { gatesUnread: true }));
  expect(view.history.filter((l) => l.body.kind === 'gateUnread').map((l) => l.at)).toEqual([
    undefined,
    undefined,
  ]);
  const promote = view.open.find((o) => o.kind === 'promote');
  expect(promote?.kind === 'promote' && promote.locked).toEqual({ why: 'noPermission' });
});

test('a release that failed: the release line retries it, and no promote is offered again', () => {
  const failure: StageFailure = {
    action: 'release',
    source: 'record',
    failedSpaces: [],
    landedCount: 6,
    spaceCount: 7,
    outOfScope: false,
    message: '',
  };
  const promoted = { at: T('14:02'), person: { name: 'Charles Ewing', isYou: true } };
  const view = deriveStageLog(
    input({ kind: 'failed', failure, canRetry: true }, { promoted, releaseReviewOpen: [] }),
  );
  expect(view.open.map((o) => o.testId)).toEqual(['open-release']);
  const release = view.open[0];
  expect(release?.kind === 'release' && release.retry).toBe(true);
  expect(release?.kind === 'release' && release.locked).toBeUndefined();
  expect(
    stageLogPill({
      view,
      state: { kind: 'failed', failure, canRetry: true },
      stageName: 'Public',
      waitingOn: [],
      viewerPrompted: false,
      busy: false,
    }).label,
  ).toBe('Release failed');
});

test('a stage waiting on the one before: Promote waits for that stage, and the pill names it', () => {
  const promotedGate = {
    id: 'promoted',
    name: 'promoted',
    passed: false,
    evaluated: true,
    waiting: true,
    onStageBefore: true,
    failedIn: [],
  };
  const state: StageCardState = {
    kind: 'gateWaiting',
    gates: [],
    waitFor: 'promoted',
    previousStage: { stageId: 'staging', name: 'Test' },
  };
  const view = deriveStageLog(input(state, { gates: [promotedGate], approvals: [] }));
  const promote = view.open.find((o) => o.kind === 'promote');
  expect(promote?.kind === 'promote' && promote.locked).toEqual({
    why: 'waits',
    waits: [{ kind: 'stage', stageId: 'staging', name: 'Test' }],
  });
  expect(
    stageLogPill({
      view,
      state,
      stageName: 'Public',
      waitingOn: [],
      viewerPrompted: false,
      busy: false,
    }),
  ).toEqual({ tone: 'neutral', label: 'Waiting on Test' });
});

test('a stage that waits for the one before to take the change waits for it, although the promoted gate is not a log line', () => {
  const state: StageCardState = {
    kind: 'gateWaiting',
    gates: [],
    waitFor: 'promoted',
    previousStage: { stageId: 'staging', name: 'Test' },
  };
  const view = deriveStageLog(input(state, { gates: [], approvals: [] }));
  const promote = view.open.find((o) => o.kind === 'promote');
  expect(promote?.kind === 'promote' && promote.locked).toEqual({
    why: 'waits',
    waits: [{ kind: 'stage', stageId: 'staging', name: 'Test' }],
  });
  expect(
    stageLogPill({
      view,
      state,
      stageName: 'Public',
      waitingOn: [],
      viewerPrompted: false,
      busy: false,
    }).label,
  ).toBe('Waiting on Test');
});

test('after an approval, a prerequisite that waits on the stage before still makes Promote wait for that stage, not for the check', () => {
  const released = {
    id: 'released',
    name: 'released',
    passed: false,
    evaluated: true,
    waiting: true,
    onStageBefore: true,
    failedIn: [],
  };
  const healthy = {
    id: 'soak',
    name: 'soak-1h',
    passed: false,
    evaluated: true,
    waiting: true,
    failedIn: [],
  };
  const state = { kind: 'reviewApproved', waitingGates: [] } as unknown as StageCardState;
  const view = deriveStageLog(input(state, { gates: [released, healthy], approvals: [] }));
  const promote = view.open.find((o) => o.kind === 'promote');
  expect(promote?.kind === 'promote' && promote.locked).toEqual({
    why: 'waits',
    waits: [
      { kind: 'stage', stageId: 'staging', name: 'Test' },
      { kind: 'gate', name: 'soak-1h' },
    ],
  });
  // The review is approved, so the pill names what Promote waits on, not the review.
  expect(
    stageLogPill({
      view,
      state,
      stageName: 'Public',
      waitingOn: ['review'],
      viewerPrompted: false,
      busy: false,
    }).label,
  ).toBe('Waiting on Test or soak-1h');
});

test('the warning stays in the log after the promote, and no second promote is offered', () => {
  const problems: PropagationProblem[] = [
    {
      kind: 'kept',
      spaceId: 's',
      unitId: 'u',
      resourceName: 'api-gateway',
      path: 'spec.replicas',
      label: 'spec.replicas',
      value: '6',
      valueText: '6',
      reason: 'Subtracted',
    },
  ];
  const promoted = { at: T('14:02'), person: { name: 'Charles Ewing', isYou: true } };
  const view = deriveStageLog(
    input({ kind: 'promoted', took: problems }, { promoted, problems, releaseReviewOpen: [] }),
  );
  expect(view.history.some((l) => l.testId === 'log-warn')).toBe(true);
  expect(view.open.find((o) => o.kind === 'promote')).toBeUndefined();
});

test('a prerequisite that only waits (the stage before has not released) is a calm line below Now, never red, and does not count as failed', () => {
  const released = {
    id: 'released',
    name: 'released',
    passed: false,
    evaluated: true,
    waiting: true,
    onStageBefore: true,
    reason: 'staging has not released it.',
    failedIn: [],
  };
  const state: StageCardState = {
    kind: 'gateWaiting',
    gates: [],
    waitFor: 'released',
    previousStage: { stageId: 'staging', name: 'Test' },
  };
  const view = deriveStageLog(input(state, { gates: [released], approvals: [] }));
  // It has not happened, so it is not history: below Now, right above the promote it holds (H4).
  expect(view.history.some((l) => l.testId === 'log-gate-1')).toBe(false);
  expect(view.open.map((o) => o.testId)).toEqual([
    'log-gate-1',
    'open-promote',
    'open-release',
  ]);
  const waiting = view.open[0];
  expect(waiting?.kind === 'line' && waiting.line.tone).toBe('open');
  expect(waiting?.kind === 'line' && waiting.line.body.kind).toBe('gateWaiting');
  expect(view.history.some((l) => l.tone === 'bad')).toBe(false);
  const promote = view.open.find((o) => o.kind === 'promote');
  expect(promote?.kind === 'promote' && promote.locked).toEqual({
    why: 'waits',
    waits: [{ kind: 'stage', stageId: 'staging', name: 'Test' }],
  });
  expect(
    stageLogPill({
      view,
      state,
      stageName: 'Public',
      waitingOn: [],
      viewerPrompted: false,
      busy: false,
    }).label,
  ).toBe('Waiting on Test');
});

test('a waiting custom gate says its author\'s description; the server reason only when there is no description', () => {
  const soak = {
    id: 'soak-1h',
    name: 'soak-1h',
    passed: false,
    evaluated: true,
    waiting: true,
    description: '1 hour in Test, no restarts',
    reason: 'unable to promote: Variant staging does not satisfy prerequisite soak-1h',
    failedIn: [],
  };
  const state: StageCardState = {
    kind: 'gateWaiting',
    gates: [],
    waitFor: 'healthy',
    previousStage: { stageId: 'staging', name: 'Test' },
  };
  const view = deriveStageLog(input(state, { gates: [soak], approvals: [] }));
  const line = view.open.find((o) => o.kind === 'line' && o.line.body.kind === 'gateWaiting');
  const gate = line?.kind === 'line' && line.line.body.kind === 'gateWaiting' ? line.line.body.gate : undefined;
  expect(gate).toBeDefined();
  if (gate === undefined) return;
  expect(gateDetail(gate)).toBe('1 hour in Test, no restarts');
  expect(gateDetail({ reason: gate.reason })).toBe(gate.reason);
  expect(gateDetail({})).toBeUndefined();
});

test('a failed promotion names who made it, as the other action lines do', () => {
  const failure: StageFailure = {
    action: 'promote',
    source: 'record',
    failedSpaces: [],
    landedCount: 2,
    spaceCount: 3,
    outOfScope: false,
    message: '',
    at: T('14:02'),
  };
  const state: StageCardState = { kind: 'failed', failure, canRetry: true };
  const line = deriveStageLog(
    input(state, { failurePerson: { name: 'Charles Ewing', isYou: true } }),
  ).history.find((l) => l.testId === 'log-promote-failed');
  expect(line?.meta).toEqual({
    kind: 'person',
    person: { name: 'Charles Ewing', isYou: true },
  });
  const unnamed = deriveStageLog(input(state)).history.find(
    (l) => l.testId === 'log-promote-failed',
  );
  expect(unnamed?.meta).toEqual({ kind: 'none' });
});

test('a server failure sentence that names the Space is said once, with the Space and the Unit as links', () => {
  const space = { spaceId: 's1', name: 'staging-euw1' };
  const parts = stageCardCopy.problem.failedMessage(
    space,
    { unitId: 'u1', name: 'api-gateway' },
    'api-gateway keeps spec.replicas 0 in staging-euw1. Set it to 1 or more, then retry.',
  );
  expect(parts.map((p) => p.text).join('')).toBe(
    'api-gateway keeps spec.replicas 0 in staging-euw1. Set it to 1 or more, then retry.',
  );
  expect(parts.filter((p) => p.kind === 'link').map((p) => p.text)).toEqual([
    'api-gateway',
    'staging-euw1',
  ]);
  expect(parts.find((p) => p.text === 'staging-euw1')).toMatchObject({
    kind: 'link',
    ref: { to: 'space', spaceId: 's1' },
  });
  // A Unit name is a name: never code font, as a link or not.
  const unitLink = parts.find((p) => p.text === 'api-gateway');
  expect(unitLink?.kind).toBe('link');
  expect(unitLink !== undefined && 'code' in unitLink ? unitLink.code : undefined).toBeUndefined();
  // No Unit id: the Unit is plain text, not a link.
  const noId = stageCardCopy.problem.failedMessage(
    space,
    { name: 'api-gateway' },
    'api-gateway keeps spec.replicas 0 in staging-euw1.',
  );
  expect(noId[0]).toEqual({ kind: 'text', text: 'api-gateway' });
  // A sentence that does not name the Space: the Space leads it.
  const plain = stageCardCopy.problem.failedMessage(space, {}, 'timed out');
  expect(plain.map((p) => p.text).join('')).toBe('staging-euw1: timed out');
});

test('a failure sentence links whole names only: a slug inside another word stays text', () => {
  const space = { spaceId: 's1', name: 'staging-euw1' };
  const links = (parts: ReturnType<typeof stageCardCopy.problem.failedMessage>) =>
    parts.filter((p) => p.kind === 'link').map((p) => p.text);
  const apply = stageCardCopy.problem.failedMessage(
    space,
    { unitId: 'u1', name: 'app' },
    'app keeps spec.replicas 0 in staging-euw1. Fix it, then apply again.',
  );
  expect(links(apply)).toEqual(['app', 'staging-euw1']);
  expect(apply.map((p) => p.text).join('')).toBe(
    'app keeps spec.replicas 0 in staging-euw1. Fix it, then apply again.',
  );
  expect(apply.some((p) => p.kind === 'text' && p.text.includes('apply again.'))).toBe(true);
  const hook = stageCardCopy.problem.failedMessage(
    space,
    { unitId: 'u2', name: 'web' },
    'webhook rejected the change in staging-euw1.',
  );
  expect(links(hook)).toEqual(['staging-euw1']);
  expect(hook[0]).toEqual({ kind: 'text', text: 'webhook rejected the change in ' });
  // A Space name inside a longer Space name is not the Space.
  const longer = stageCardCopy.problem.failedMessage(
    space,
    {},
    'staging-euw1-canary refused it.',
  );
  expect(longer.map((p) => p.text).join('')).toBe(
    'staging-euw1: staging-euw1-canary refused it.',
  );
});

test('Release stays locked until the release requirement is checked: fail closed after the promote (#6154)', () => {
  const req = (
    over: Partial<{ satisfied: boolean; evaluated: boolean; notEvaluated: string }>,
  ) => ({ name: 'release-ok', satisfied: false, evaluated: false, ...over });
  // Promoted, the release check has not answered yet: Release waits for the review.
  expect(releaseReviewHolds([req({ notEvaluated: 'notReached' })], true)).toEqual([
    'release-ok',
  ]);
  // The release check failed to read: still locked.
  expect(releaseReviewHolds([req({ notEvaluated: 'error' })], true)).toEqual(['release-ok']);
  // Evaluated and unmet: locked. Satisfied: free.
  expect(releaseReviewHolds([req({ evaluated: true })], true)).toEqual(['release-ok']);
  expect(releaseReviewHolds([req({ evaluated: true, satisfied: true })], true)).toEqual([]);
  // Nothing new to release, or a check the viewer may not run (the server decides): free.
  expect(releaseReviewHolds([req({ notEvaluated: 'unchanged' })], true)).toEqual([]);
  expect(releaseReviewHolds([req({ notEvaluated: 'noPermission' })], true)).toEqual([]);
  // Before the promote every unmet one is named.
  expect(releaseReviewHolds([req({ notEvaluated: 'notReached' })], false)).toEqual([
    'release-ok',
  ]);
  // And the release line is locked on it.
  const promoted = { at: T('14:02'), person: { name: 'Charles Ewing', isYou: true } };
  const view = deriveStageLog(
    input({ kind: 'promoted', took: [] } as StageCardState, {
      promoted,
      releaseReviewOpen: releaseReviewHolds([req({ notEvaluated: 'notReached' })], true),
    }),
  );
  const release = view.open.find((o) => o.kind === 'release');
  expect(release?.kind === 'release' && release.locked).toEqual({
    after: false,
    waits: [{ kind: 'releaseReview', name: 'release-ok' }],
  });
});

// ---------------------------------------------------------------------------
// The released line counts the Targets that ran the release
// ---------------------------------------------------------------------------

const releasedBy = { at: T('14:40'), person: { name: 'Charles Ewing', isYou: true } };
const promotedBy = { at: T('14:02'), person: { name: 'Charles Ewing', isYou: true } };
const releaseFailure: StageFailure = {
  action: 'release',
  source: 'record',
  failedSpaces: [],
  landedCount: 54,
  spaceCount: 55,
  outOfScope: false,
  message: '',
};

function releasedBody(view: ReturnType<typeof deriveStageLog>) {
  const line = view.history.find((l) => l.testId === 'log-released');
  return line?.body.kind === 'released' ? line.body : undefined;
}

test('a release that failed in 1 of 55 Spaces: the released line says 54 of 55 Targets ran it', () => {
  const view = deriveStageLog(
    input(
      { kind: 'failed', failure: releaseFailure, canRetry: true },
      { spaceCount: 55, targetCount: 55, promoted: promotedBy, released: { ...releasedBy, ranCount: 54 }, releaseReviewOpen: [] },
    ),
  );
  expect(releasedBody(view)).toEqual({ kind: 'released', targetCount: 55, ranCount: 54 });
  expect(stageCardCopy.log.releasedStatus(54, 55)).toBe('54 of 55 Targets ran it');
});

test('a release that every Target ran keeps "55 Targets ran it"', () => {
  const view = deriveStageLog(
    input({ kind: 'released', took: [] }, { spaceCount: 55, targetCount: 55, promoted: promotedBy, released: { ...releasedBy, ranCount: 55 } }),
  );
  expect(releasedBody(view)).toEqual({ kind: 'released', targetCount: 55, ranCount: 55 });
  expect(stageCardCopy.log.releasedStatus(55, 55)).toBe('55 Targets ran it');
});

test('while the release runs, its first Releases do not show the stage as released', () => {
  const view = deriveStageLog(
    input(
      { kind: 'promoted', took: [] },
      { spaceCount: 55, targetCount: 55, promoted: promotedBy, released: { ...releasedBy, ranCount: 12 }, busy: { method: 'release' }, releaseReviewOpen: [] },
    ),
  );
  expect(releasedBody(view)).toBeUndefined();
  const release = view.open.find((o) => o.kind === 'release');
  expect(release?.kind === 'release' && release.busy).toBe(true);
});

test('a release that no Target ran has no released line; the failure line says what happened', () => {
  const view = deriveStageLog(
    input(
      { kind: 'failed', failure: { ...releaseFailure, landedCount: 0 }, canRetry: true },
      { spaceCount: 55, targetCount: 55, promoted: promotedBy, released: { ...releasedBy, ranCount: 0 }, releaseReviewOpen: [] },
    ),
  );
  expect(releasedBody(view)).toBeUndefined();
  expect(view.history.some((l) => l.testId === 'log-promote-failed')).toBe(true);
});

// ---------------------------------------------------------------------------
// A release refused by gates names the gates, not the server's text
// ---------------------------------------------------------------------------

/** The server's text for the refusal, as a promotion record keeps it. */
const gatedRecord = [
  'outstanding ValidationErrors; triggers re-queued for evaluation',
  'Metadata:',
  '  Validation Errors: cert-manager-base/cert-manager-v1-17-in-prod/vet-images,cert-manager-base/no-placeholders/no-placeholders:2',
  '',
].join('\n');

test('the gates of a refused Unit are read from the server text, and any other failure has none', () => {
  expect(gateNamesOf(gatedRecord)).toEqual([
    'cert-manager-base/cert-manager-v1-17-in-prod/vet-images',
    'cert-manager-base/no-placeholders/no-placeholders:2',
  ]);
  // The same text with its lines run together, as a page shows it.
  expect(gateNamesOf(gatedRecord.replace(/\s+/g, ' '))).toEqual([
    'cert-manager-base/cert-manager-v1-17-in-prod/vet-images',
    'cert-manager-base/no-placeholders/no-placeholders:2',
  ]);
  // A message without the metadata list: gated, with no names.
  expect(gateNamesOf('outstanding ValidationErrors; triggers re-queued for evaluation')).toEqual([]);
  expect(gateNamesOf('webhook keeps image tag at v1.16.2 in cert-manager-eu-west-prod1.')).toBeUndefined();
});

test('each gate is named by its Trigger: the DisplayName when known, else the Trigger slug, never the function', () => {
  const gates = gateNamesOf(gatedRecord) ?? [];
  expect(gateLabels(gates)).toEqual(['cert-manager-v1-17-in-prod', 'no-placeholders']);
  expect(
    gateLabels(gates, (gate) =>
      gate.includes('cert-manager-v1-17-in-prod') ? 'cert-manager v1.17 or later in prod' : undefined,
    ),
  ).toEqual(['cert-manager v1.17 or later in prod', 'no-placeholders']);
  // Two functions of one Trigger are one gate to the reader.
  expect(gateLabels(['base/vet/vet-images:1', 'base/vet/vet-images:2'])).toEqual(['vet']);
  expect(gateLabels([AWAITING_TRIGGERS_GATE])).toEqual(['its Triggers still run']);
});

test('the gated line is one short sentence that names the Unit, the Space and its gates', () => {
  const space = { spaceId: 'eu', name: 'cert-manager-eu-west-prod1' };
  const webhook = { unitId: 'u-webhook', name: 'webhook' };
  const line = stageCardCopy.problem.gated(space, webhook, ['cert-manager v1.17 or later in prod']);
  expect(segmentsText(line)).toBe('webhook in cert-manager-eu-west-prod1 is gated: cert-manager v1.17 or later in prod.');
  expect(line[0]).toEqual({
    kind: 'link',
    text: 'webhook',
    ref: { to: 'unit', spaceId: 'eu', unitId: 'u-webhook', tab: 'config' },
  });
  expect(segmentsText(stageCardCopy.problem.gated(space, {}, ['vet', 'no-placeholders']))).toBe(
    'cert-manager-eu-west-prod1 is gated: vet and no-placeholders.',
  );
  expect(segmentsText(stageCardCopy.problem.gated(space, {}, []))).toBe('cert-manager-eu-west-prod1 is gated.');
  expect(stageCardCopy.problem.openGatesOf('cert-manager-eu-west-prod1')).toBe(
    'Open the Gates tab of cert-manager-eu-west-prod1',
  );
});

test('a failed Space splits into one gated line per Unit and its other failures, in order', () => {
  const other = { message: 'webhook keeps image tag at v1.16.2 in cert-manager-eu-west-prod1.', unitSlug: 'cainjector' };
  const split = splitGatedItems([
    { message: gatedRecord, unitSlug: 'webhook', unitId: 'u-webhook' },
    other,
    // A second refusal of the same Unit adds its gates to the same line.
    {
      message: 'outstanding ValidationErrors\nMetadata:\n  Validation Errors: cert-manager-base/vet/vet-images',
      unitSlug: 'webhook',
      unitId: 'u-webhook',
    },
    // An answer that names no Unit is its own line.
    { message: 'outstanding ValidationErrors; triggers re-queued for evaluation' },
  ]);
  expect(split.others).toEqual([other]);
  expect(split.gated.map((g) => [g.unitSlug, g.unitId, g.gates, g.messages.length])).toEqual([
    [
      'webhook',
      'u-webhook',
      [
        'cert-manager-base/cert-manager-v1-17-in-prod/vet-images',
        'cert-manager-base/no-placeholders/no-placeholders:2',
        'cert-manager-base/vet/vet-images',
      ],
      2,
    ],
    [undefined, undefined, [], 1],
  ]);
  expect(splitGatedItems([other])).toEqual({ gated: [], others: [other] });
});

test('a gate is named by the Trigger its Unit records for it, not by the slugs in the gate name', () => {
  const units = [
    { ValidationTriggerIDs: { 'base-a/vet/vet-images': 't-a', 'base-a/old-name/cel-validate': 't-renamed' } },
    // Another Space has a Trigger with the same slug, `vet`: its ID tells them apart.
    { ValidationTriggerIDs: { 'base-b/vet/vet-images': 't-b', 'base-b/gone/no-placeholders': 't-gone' } },
    {},
  ];
  const triggers = [
    { TriggerID: 't-a', DisplayName: 'Images from our registry' },
    { TriggerID: 't-b', DisplayName: 'Images signed for prod' },
    // Renamed since the gate was written: still found by its ID.
    { TriggerID: 't-renamed', DisplayName: 'Replicas at least 3' },
    { TriggerID: 't-blank', DisplayName: '  ' },
  ];
  const names = triggerNamesByGate(units, triggers);
  expect(Object.fromEntries(names)).toEqual({
    'base-a/vet/vet-images': 'Images from our registry',
    'base-b/vet/vet-images': 'Images signed for prod',
    'base-a/old-name/cel-validate': 'Replicas at least 3',
  });
  // A gate whose Trigger is gone falls back to the Trigger slug in its name.
  expect(gateLabels(['base-b/gone/no-placeholders', 'base-b/vet/vet-images'], (g) => names.get(g))).toEqual([
    'gone',
    'Images signed for prod',
  ]);
});

test('the release count takes only the stage\'s Spaces with a release Target, from the server\'s progress', () => {
  const targetOf = (id: string) => (id === 'no-target' ? undefined : `target-${id}`);
  const stageSpaces = ['a', 'b', 'c', 'no-target', 'base'];
  const progress = (released: string[]) => ({ availability: 'available', releasedSpaceIds: new Set(released) });
  // A Space of another stage, the Space with no Target, and the passed-over base Space are not counted.
  expect(releaseRanCount(stageSpaces, 'base', targetOf, progress(['a', 'b', 'other-stage', 'no-target', 'base']))).toBe(2);
  expect(releaseRanCount(stageSpaces, 'base', targetOf, progress(['a', 'b', 'c']))).toBe(3);
  expect(releaseRanCount(stageSpaces, 'base', targetOf, progress([]))).toBe(0);
  expect(
    releaseRanCount(stageSpaces, 'base', targetOf, { availability: 'unavailable', releasedSpaceIds: new Set(['a']) }),
  ).toBeUndefined();
  // Without progress, the line keeps the Target count.
  const view = deriveStageLog(
    input({ kind: 'released', took: [] }, { targetCount: 3, promoted: promotedBy, released: releasedBy }),
  );
  expect(releasedBody(view)).toEqual({ kind: 'released', targetCount: 3, ranCount: 3 });
});

// ---------------------------------------------------------------------------
// "Already have the change" leaves out a Space the same line names a problem for
// ---------------------------------------------------------------------------

test('a pinned Space that resolved during the promote is not listed as having the change', () => {
  const pinned: PropagationProblem = {
    kind: 'kept',
    spaceId: 'eu-west',
    unitId: 'webhook',
    resourceName: 'webhook',
    path: 'spec.template.spec.containers.0.image',
    label: 'image tag',
    value: 'quay.io/jetstack/cert-manager-webhook:v1.16.2',
    valueText: 'v1.16.2',
    reason: 'ProtectedPath',
  };
  const unread: PropagationProblem = { kind: 'unknown', spaceIds: ['ap-south'], cause: 'unreadable' };
  const marks = new Map([
    ['us-east', { kind: 'hasIt' }],
    ['ap-south', { kind: 'hasIt' }],
    ['eu-north', { kind: 'differs' }],
  ]);
  expect(hasTheChangeIds(marks, ['us-east', 'eu-west', 'ap-southeast'], [pinned, unread])).toEqual([
    'us-east',
    'ap-southeast',
  ]);
  // With no problem, every Space that holds it is listed once.
  expect(hasTheChangeIds(marks, ['us-east', 'eu-west'], [])).toEqual(['us-east', 'ap-south', 'eu-west']);
});
