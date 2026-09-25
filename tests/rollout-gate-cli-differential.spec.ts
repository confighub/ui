// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// ══ A DIFFERENTIAL TEST BETWEEN `cub` AND THIS APP'S GATE ══════════════════
//
// There is NO server-side stage gate. `validateStageEntryGates`
// (public/cmd/cub/variant_promote.go) is the specification, and on the UI's
// promote path this app's own gate is the only one a promotion passes. So the
// two must decide alike: where `cub` REFUSES, the UI must BLOCK; where `cub`
// PASSES, the UI must not withhold Promote. The one deliberate difference is
// the SHAPE of a refusal — `cub` errors, the UI may render a gate as
// `evaluated: false`, which also blocks — never the DECISION.
//
// BOTH DIRECTIONS ARE DEFECTS. A UI that passes what `cub` refuses promotes
// unverified configuration to production. A UI that blocks what `cub` allows
// withdraws Promote from a correct action, which teaches operators to click
// through the override reflexively — and an override everybody clicks is an
// override nobody reads when it finally matters.
//
// ── HOW THE `cub` COLUMN WAS PRODUCED ─────────────────────────────────────
//
// Every `cub` verdict below is RECORDED OUTPUT, not a reading of the source.
// `cub variant promote --change-order <co> --target-stage <stage> --dry-run`
// evaluates the entry gates and changes nothing (the gates run before any
// promotion, and the dry run was confirmed to leave `ResolvedSpaceIDs`
// untouched), so it is a read-only gate decision. `cub changeorder get` prints
// `Completed`, which is `ChangeOrder.Stage` = `Completed`, recorded by the
// server's `advanceChangeOrderStages` — `evaluatePrerequisites` read against
// `Final`.
//
// To regenerate, against a server on :9090 with `bin/cub` built:
//
//   cub space create gd-workflow
//   cub variant upload --component gdx --variant base \
//       --namespace confighubplaceholder test-data/release-test/
//   cub space update --patch gdx-base --label Stage=Base
//   cub variant create dev gdx-base
//   cub space update --patch gdx-dev --label Stage=Development
//   cub changeworkflow create --space gd-workflow <wf> --from-stdin < <spec>
//   cub changeorder create --space gdx-base <co> --change-workflow gd-workflow/<wf>
//   cub variant promote --change-order gdx-base/<co> --target-stage <stage> --dry-run
//
// A Space's live status is set by hand rather than by argobot:
//   cub space update --patch <space> --annotation 'confighub.com/live-status={...}'
//
// Cases needing a real ReleaseTargetID (a released, healthy previous stage)
// cannot be built without a cluster; those `cub` verdicts are what
// `evaluatePrerequisites` (internal/views/promote_gates.go), the function the
// server's promotion gates call, answers for them. They are marked below.
//
// Pure derivation — no page, no browser.

import { test, expect } from './fixtures/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import { LIVE_STATUS_ANNOTATION_KEY, type LiveStatus } from '../src/pages/x/apps/liveStatus';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import { gatesOpen, blockingGateCount, gateStateFor } from '../src/pages/x/apps/rollout/rolloutGates';
import {
  actionFor,
  buildConsoleRow,
  canAbortRollout,
  type ConsoleRow,
  type ConsoleSpace,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';

const HEALTHY: LiveStatus = {
  syncStatus: 'Synced',
  operationPhase: 'Succeeded',
  healthStatus: 'Healthy',
};
const DEGRADED: LiveStatus = {
  syncStatus: 'OutOfSync',
  operationPhase: 'Failed',
  healthStatus: 'Degraded',
};

const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'gdx' };
/** The Space the ChangeOrder lives in — `gdx-base` in the recorded fixture. */
const BASE = 'base-1';
const ORDER = 'co-gated';

interface SpaceFixture {
  spaceId: string;
  stage: string;
  liveStatus: LiveStatus | null;
  /** A Space with no ReleaseTargetID releases nothing, ever. */
  targeted?: boolean;
  annotations?: Record<string, string>;
}

/**
 * The Spaces of a fixture, including the base.
 *
 * `baseStage` is the `Stage` label the base carries. In the shipped rollout
 * (test/scripts/test-previous-stage.sh) the base IS the workflow's first stage,
 * so the default puts it there; pass `null` for a workflow whose stages do not
 * cover it.
 */
function consoleSpaces(
  baseStatus: LiveStatus | null,
  members: SpaceFixture[],
  baseStage: string | null = 'Base',
): ConsoleSpace[] {
  return [
    {
      spaceId: BASE,
      slug: 'gdx-base',
      component: COMPONENT,
      labels: baseStage === null ? {} : { Stage: baseStage },
      annotations:
        baseStatus === null ? {} : { [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify(baseStatus) },
    },
    ...members.map(({ spaceId, stage, liveStatus, targeted = true, annotations = {} }) => ({
      spaceId,
      slug: `gdx-${spaceId}`,
      component: COMPONENT,
      labels: { Stage: stage },
      releaseTargetId: targeted ? `target-${spaceId}` : undefined,
      annotations:
        liveStatus === null
          ? annotations
          : { ...annotations, [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify(liveStatus) },
    })),
  ];
}

function rowFor(
  workflow: ChangeWorkflowSpec,
  spaces: ConsoleSpace[],
  /** Space ids each stage's selector resolves to, in stage order — what `stageSpaces` returns in `cub`. */
  stageSpaceIds: string[][],
  progress: { resolved: string[]; released: string[] },
  /** `ChangeOrder.Stage` as the server recorded it. Absent is no stage recorded. */
  stage?: string,
): ConsoleRow {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {};
  workflow.Stages.forEach((stage, i) => {
    stageSpaces[stageWhereSpace(stage, COMPONENT)] = stageSpaceIds[i].map(
      (id) => ({ Space: { SpaceID: id } }) as ExtendedSpaceRead,
    );
  });
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: ORDER,
      spaceId: BASE,
      spaceSlug: 'gdx-base',
      resolvedSpaceIds: progress.resolved,
      releasedSpaceIds: progress.released,
      inScopeSpaceIds: [BASE, ...stageSpaceIds.flat()],
      governing: { state: 'governed', workflow, changeWorkflowId: 'wf-1' },
      stage,
    },
    spaces,
    stageSpaces,
  );
}

/** The UI's decision for one stage: does the app offer the promotion `cub` was asked about? */
function uiVerdict(row: ConsoleRow, stageId: string) {
  const stage = row.stages.find((s) => s.stageId === stageId);
  if (stage === undefined) throw new Error(`no stage '${stageId}' in the row`);
  return {
    gatesOpen: gatesOpen(stage.gates),
    blockingGateCount: blockingGateCount(stage.gates),
    gateState: gateStateFor(stage.gates),
    reasons: stage.gates.filter((g) => !(g.evaluated && g.ok)).map((g) => g.reason),
    decision: gatesOpen(stage.gates) ? ('PASS' as const) : ('BLOCK' as const),
  };
}

const GATED_TWO_STAGE: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'base', WhereSpace: "Labels.Stage = 'Base'" },
    { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'", Prerequisites: ['Released', 'Healthy'] },
  ],
};

const UNGATED_TWO_STAGE: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'base', WhereSpace: "Labels.Stage = 'Base'" },
    { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
  ],
};

/*
 * ══ CASE 1 ═════════════════════════════════════════════════════════════════
 * Previous stage is the base: no ReleaseTargetID, GREEN live status. The stage
 * being entered declares Released + Healthy.
 *
 * cub:  REFUSE
 *   $ cub variant promote --change-order gdx-base/co-gated --target-stage dev --dry-run
 *   Failed: unable to promote to stage 'dev', Variant 'base' cannot have any
 *           released changes, missing ReleaseTargetID
 */
test('case 1 — targetless previous stage with a green annotation: cub refuses, UI blocks', () => {
  const row = rowFor(
    GATED_TWO_STAGE,
    consoleSpaces(HEALTHY, [{ spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY }]),
    [[BASE], ['dev-1']],
    { resolved: [BASE], released: [] },
  );
  const ui = uiVerdict(row, 'dev');
  expect(ui.decision).toBe('BLOCK'); // AGREES with cub's REFUSE
  expect(ui.blockingGateCount).toBeGreaterThan(0);

  /*
   * AND FOR `cub`'s OWN REASON. Both refusals are about the base's missing
   * release target. This case once agreed by accident: the sequence hid the
   * ChangeOrder's own Space from the stage that selects it, so the UI refused
   * on an empty previous stage — the same cause that made case 2b too strict
   * and case 15 too permissive.
   */
  expect(ui.reasons.join(' ')).toContain('gdx-base has no release target');
  expect(ui.reasons.join(' ')).not.toContain('selects no Space');
});

/*
 * ══ CASE 2 ═════════════════════════════════════════════════════════════════
 * Same, but the annotation says DEGRADED. `cub` never reads it: the missing
 * ReleaseTargetID is answered first.
 *
 * cub:  REFUSE
 *   Failed: unable to promote to stage 'dev', Variant 'base' cannot have any
 *           released changes, missing ReleaseTargetID
 */
test('case 2 — targetless previous stage reporting degraded: cub refuses, UI blocks', () => {
  const row = rowFor(
    GATED_TWO_STAGE,
    consoleSpaces(DEGRADED, [{ spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY }]),
    [[BASE], ['dev-1']],
    { resolved: [BASE], released: [] },
  );
  const ui = uiVerdict(row, 'dev');
  expect(ui.decision).toBe('BLOCK'); // AGREES
  /*
   * The same reason as case 1, and `cub`'s: the missing release target is
   * answered before anything reads the annotation, so the degraded report
   * changes no gate. It does reach the row's reported-health channel, which is
   * a separate question from what the gate decided.
   */
  expect(ui.reasons.join(' ')).toContain('gdx-base has no release target');
  expect(ui.reasons.join(' ')).not.toContain('selects no Space');
});

/*
 * ══ CASE 2b — THE SHIPPED Base → Development HOP ═══════════════════════════
 *
 * The base releases nothing and no live status is ever written for it, so the
 * shipped workflow (test/scripts/test-previous-stage.sh) declares NO
 * prerequisites on Development: the base can only be asked whether it has taken
 * the change, which it has by construction — the ChangeOrder lives there.
 *
 * cub:  PASS
 *   $ cub variant promote --change-order gdx-base/co-ungated-dev --target-stage dev --dry-run
 *   Promoting gdx-dev into stage dev...
 *   Bulk upgrade operation completed:
 *     Success: 3 unit(s)
 */
test('case 2b — the ungated hop out of the base stage: cub passes, UI passes', () => {
  const row = rowFor(
    UNGATED_TWO_STAGE,
    consoleSpaces(HEALTHY, [{ spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY }]),
    [[BASE], ['dev-1']],
    { resolved: [BASE], released: [] },
  );
  const ui = uiVerdict(row, 'dev');

  /*
   * `cub` resolves stage `base` to the base Space and gates on it; the base has
   * taken the change by construction — the ChangeOrder lives there — and `dev`
   * declares no prerequisite, so the hop passes. The UI now resolves the same
   * stage to the same Space and reaches the same verdict.
   *
   * IT ONCE REFUSED, AND THE REASON WAS A FICTION. `buildRolloutSequence` used
   * to drop the ChangeOrder's own Space from every real stage so the synthetic
   * source lane could own that id alone. `stageSpaces` in `variant_promote.go`
   * does no such thing, so the UI was left with an EMPTY previous stage and
   * reported the precondition `cub` reserves for a selector that matched
   * nothing — "its previous stage '%s' selects no Space" — about a stage that
   * selected exactly one. Every first promotion of the shipped rollout shape
   * demanded an override for a correct action.
   */
  expect(ui.decision).toBe('PASS'); // AGREES with cub's PASS
  expect(ui.gateState).toBe('open');
  expect(ui.reasons).toEqual([]);
  expect(row.state).toBe('ready');
  expect(actionFor(row).label).toBe('Promote');
});

/*
 * ══ CASE 15 — THE SAME ROOT CAUSE, POINTING THE OTHER WAY ══════════════════
 *
 * The first workflow stage covers the base AND a second Space. That second
 * Space has taken the change, released it and is healthy; the base has no
 * ReleaseTargetID and never will.
 *
 * `cub` quantifies over BOTH and refuses on the base. The UI used to drop the
 * base from the stage, judge the one Space left, find every gate satisfied and
 * offer Promote — the same hidden-source-Space cause as case 2b, with the
 * decisions no longer matching.
 *
 * cub:  REFUSE
 *   $ cub variant promote --change-order gdx-base/co-gated --target-stage dev --dry-run
 *   Failed: unable to promote to stage 'dev', Variant 'base' cannot have any
 *           released changes, missing ReleaseTargetID
 */
test('case 15 — a base sharing its stage is judged, not skipped: cub refuses, UI blocks', () => {
  const row = rowFor(
    GATED_TWO_STAGE,
    consoleSpaces(HEALTHY, [
      { spaceId: 'base-peer', stage: 'Base', liveStatus: HEALTHY },
      { spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY },
    ]),
    [[BASE, 'base-peer'], ['dev-1']],
    { resolved: [BASE, 'base-peer'], released: ['base-peer'] },
    'base',
  );
  const ui = uiVerdict(row, 'dev');

  /*
   * THIS IS THE DIRECTION THAT PROMOTES TO PRODUCTION. The UI's gate is the
   * only gate on its promote path; there is no server-side check behind it, so
   * a Space the UI does not see is a Space nothing judges — and absent read as
   * satisfied. The base is in the stage now, and its missing release target
   * holds the gate exactly as it holds `cub`'s.
   */
  expect(ui.decision).toBe('BLOCK'); // AGREES with cub's REFUSE
  expect(ui.reasons.join(' ')).toContain('gdx-base has no release target');
  expect(row.state).toBe('blocked');
  expect(actionFor(row).label).toBe('Resolve'); // not 'Promote'
});

/*
 * ══ CASE 3 ═════════════════════════════════════════════════════════════════
 * The previous stage HAS a target and is green, but has NOT taken the change.
 * The taken-the-change check `evaluatePrerequisites` opens with runs before
 * every prerequisite.
 *
 * cub:  REFUSE
 *   $ cub variant promote --change-order gdx-base/co-notaken2 --target-stage base --dry-run
 *   Failed: unable to promote to stage 'base', Variant 'dev' has not taken
 *           change order 'co-notaken2'
 */
test('case 3 — previous stage green but has not taken the change: cub refuses, UI blocks', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
      { Name: 'staging', WhereSpace: "Labels.Stage = 'Staging'", Prerequisites: ['Released', 'Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(
      HEALTHY,
      [
        { spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY },
        { spaceId: 'stg-1', stage: 'Staging', liveStatus: HEALTHY },
      ],
      null,
    ),
    [['dev-1'], ['stg-1']],
    { resolved: [BASE], released: [] },
  );
  const ui = uiVerdict(row, 'staging');
  expect(ui.decision).toBe('BLOCK'); // AGREES
  expect(ui.reasons.join(' ')).toContain('has not taken');
});

/*
 * ══ CASE 4 ═════════════════════════════════════════════════════════════════
 * A FIRST stage that declares built-in prerequisites. `validateStageEntryGates`
 * returns nil the moment `previousStage == nil`, so they are never evaluated.
 *
 * cub:  PASS
 *   $ cub variant promote --change-order gdx-base/co-firststage --target-stage dev --dry-run
 *   Promoting gdx-dev into stage dev...
 *   Bulk upgrade operation completed:
 *     Success: 3 unit(s)
 */
test('case 4 — a first stage declaring Released and Healthy is ungated: cub passes, UI passes', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'", Prerequisites: ['Released', 'Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(HEALTHY, [{ spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY }], null),
    [['dev-1']],
    { resolved: [BASE], released: [] },
  );
  const ui = uiVerdict(row, 'dev');
  expect(ui.decision).toBe('PASS'); // AGREES
  expect(ui.gateState).toBe('none');
});

/*
 * ══ CASE 5 — THE NORMAL CASE ═══════════════════════════════════════════════
 * Three stages mid-flight: the first has taken the change, released it and is
 * healthy; the second is next; everything is healthy.
 *
 * cub:  PASS  (per `evaluatePrerequisites` — a released, healthy
 *       previous stage needs a real ReleaseTargetID and so a cluster)
 */
test('case 5 — three-stage rollout mid-flight, everything healthy: cub passes, UI passes', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
      { Name: 'staging', WhereSpace: "Labels.Stage = 'Staging'", Prerequisites: ['Released', 'Healthy'] },
      { Name: 'prod', WhereSpace: "Labels.Stage = 'Production'", Prerequisites: ['Released', 'Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(
      HEALTHY,
      [
        { spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY },
        { spaceId: 'stg-1', stage: 'Staging', liveStatus: HEALTHY },
        { spaceId: 'prod-1', stage: 'Production', liveStatus: HEALTHY },
      ],
      null,
    ),
    [['dev-1'], ['stg-1'], ['prod-1']],
    { resolved: [BASE, 'dev-1'], released: ['dev-1'] },
  );
  const ui = uiVerdict(row, 'staging');
  expect(ui.decision).toBe('PASS'); // AGREES
  expect(row.state).toBe('ready');
  expect(actionFor(row).label).toBe('Promote');
});

/*
 * ══ CASE 6 — A STAGE LITERALLY NAMED `__rollout_source__` ══════════════════
 * The server's stage-name regexp admits `_`, so a workflow author may name the
 * first stage `__rollout_source__`. `cub` knows nothing of that name: the stage
 * after it is gated exactly as it would be after any other first stage.
 *
 * cub:  REFUSE
 *   $ cub variant promote --change-order gdx-base/co-rolloutsource --target-stage dev --dry-run
 *   Failed: unable to promote to stage 'dev', Variant 'base' cannot have any
 *           released changes, missing ReleaseTargetID
 */
test('case 6 — a stage named __rollout_source__ does not disarm the next stage', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: '__rollout_source__', WhereSpace: "Labels.Stage = 'Base'" },
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'", Prerequisites: ['Released', 'Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(HEALTHY, [{ spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY }]),
    [[BASE], ['dev-1']],
    { resolved: [BASE], released: [] },
  );
  const ui = uiVerdict(row, 'dev');
  expect(ui.decision).toBe('BLOCK'); // AGREES with cub's REFUSE
  /*
   * The name did not disarm anything — `isFirst` is array position, and stage
   * `dev` sits at index 1 whatever the stage before it is called. It blocks on
   * the base's missing release target, `cub`'s own reason, which is also proof
   * the gate was evaluated rather than skipped.
   */
  expect(ui.gateState).not.toBe('none');
  expect(ui.reasons.join(' ')).toContain('gdx-base has no release target');
});

/*
 * ══ CASE 7 — NO `Final` PREREQUISITES OVER A DEGRADED LAST STAGE ═══════════
 * `changeWorkflowFinalPrerequisites(nil)` is nil, and `evaluatePrerequisites`
 * with no prerequisites asks only whether the change arrived. So a workflow that
 * declares no `Final` reports the rollout COMPLETE over a degraded last stage.
 *
 * cub:  COMPLETE
 *   $ cub changeorder get --space gdx-base co-notaken
 *   Completed          true
 */
test('case 7 — no Final prerequisites: cub calls a degraded last stage complete', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
      { Name: 'prod', WhereSpace: "Labels.Stage = 'Production'" },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(
      HEALTHY,
      [
        { spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY },
        { spaceId: 'prod-1', stage: 'Production', liveStatus: DEGRADED },
      ],
      null,
    ),
    [['dev-1'], ['prod-1']],
    { resolved: [BASE, 'dev-1', 'prod-1'], released: ['dev-1', 'prod-1'] },
    'Completed',
  );
  /*
   * ⚠️ DIVERGENCE, DECLARED IN THE MODEL, AND KEPT. `degradedReason` is asked
   * ABOVE the `complete` return, so a reported-degraded last stage outranks the
   * workflow's own reading. `cub changeorder get` prints `Completed true` for
   * exactly this rollout. It is the safer direction — the failure is shown
   * rather than hidden behind a Complete chip — and the blocker names the Space
   * to open.
   */
  expect(row.state).toBe('degraded'); // cub: Completed true
  expect(row.blocker).toContain('gdx-prod-1');

  /*
   * WHAT THE DIVERGENCE MUST NOT COST. It is a DISPLAY choice, so it decides
   * what the row SAYS and not what the reader may do. `workflowComplete`
   * carries `cub`'s reading past the health chip, and both controls follow it
   * rather than the chip:
   *
   *  - the ACTION is `Open`, not `Resolve`. There is no stage left to enter, so
   *    the gate channel offers no promotion, and the red chip withdraws nothing
   *    it would otherwise have offered;
   *  - ENDING THE ROLLOUT IS offered, because `cub` permits it: `cub variant
   *    demote` requires an `AbortedReason` and nothing else, so a finished
   *    rollout is exactly as abortable and exactly as rollback-able as an
   *    unfinished one.
   */
  expect(row.workflowComplete).toBe(true);
  expect(actionFor(row).label).toBe('Open');
  expect(canAbortRollout(row)).toBe(true);
});

/*
 * ══ CASE 8 — `Final: ['Healthy']` OVER A DEGRADED LAST STAGE ═══════════════
 *
 * cub:  NOT COMPLETE
 *   $ cub changeorder get --space gdx-base co-final-healthy
 *   Completed          false
 */
test('case 8 — Final Healthy over a degraded last stage: cub says not complete', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
      { Name: 'prod', WhereSpace: "Labels.Stage = 'Production'" },
    ],
    Final: { Prerequisites: ['Healthy'] },
  };
  const row = rowFor(
    workflow,
    consoleSpaces(
      HEALTHY,
      [
        { spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY },
        { spaceId: 'prod-1', stage: 'Production', liveStatus: DEGRADED },
      ],
      null,
    ),
    [['dev-1'], ['prod-1']],
    { resolved: [BASE, 'dev-1', 'prod-1'], released: ['dev-1', 'prod-1'] },
  );
  // eslint-disable-next-line no-console
  console.log('case 8 UI row.state:', row.state, 'blocker:', row.blocker, 'action:', actionFor(row).label);
  expect(row.state).not.toBe('complete');
});

/*
 * ══ CASE 9 — A PREVIOUS STAGE WITH AN EMPTY `WhereSpace` ═══════════════════
 * An empty selector is not an empty stage: `stageWhereSpace` falls back to the
 * component alone, so the stage covers EVERY Space of the component — including
 * ones further down the rollout that have not taken the change.
 *
 * cub:  REFUSE
 *   $ cub variant promote --change-order gdx-base/co-emptywhere --target-stage dev --dry-run
 *   Failed: unable to promote to stage 'dev', Variant 'dev' has not taken
 *           change order 'co-emptywhere'
 */
test('case 9 — an empty WhereSpace widens the previous stage to the whole component', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'everything', WhereSpace: '' },
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'", Prerequisites: ['Released', 'Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(HEALTHY, [{ spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY }]),
    // The empty selector returns every Space of the component, base included.
    [[BASE, 'dev-1'], ['dev-1']],
    { resolved: [BASE], released: [] },
  );
  const ui = uiVerdict(row, 'dev');
  // eslint-disable-next-line no-console
  console.log('case 9 UI:', JSON.stringify(ui, null, 2));
  expect(ui.decision).toBe('BLOCK');
});

/*
 * ══ CASE 10 — A CUSTOM CEL PREREQUISITE ════════════════════════════════════
 * `ui/` has no CEL evaluator, so a custom prerequisite is `evaluated: false` and
 * blocks. That is the deliberate divergence in SHAPE where `cub` refuses — but
 * where `cub` PASSES it is a divergence in DECISION.
 *
 * cub, unsatisfied:  REFUSE
 *   $ cub variant promote --change-order gdx-base/co-cel --target-stage dev --dry-run
 *   Failed: unable to promote to stage 'dev', prerequisite for Variant 'base'
 *           could not be evaluated: evaluate prerequisite expression
 *           "Space.Annotations['signoff'] == 'true'": no such key: signoff
 *
 * cub, satisfied (after `cub space update --patch gdx-base --annotation signoff=true`):  PASS
 *   Promoting change order gdx-base/co-cel into units behind their upstream...
 *   Bulk upgrade operation completed:
 *     Success: 3 unit(s)
 */
const CEL_WORKFLOW: ChangeWorkflowSpec = {
  CustomPrerequisites: [
    { Name: 'signed-off', Expression: "cel:Space.Annotations['signoff'] == 'true'", Description: 'Release manager signed off' },
  ],
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
    { Name: 'staging', WhereSpace: "Labels.Stage = 'Staging'", Prerequisites: ['signed-off'] },
  ],
};

function celRow(signoff: string | undefined): ConsoleRow {
  return rowFor(
    CEL_WORKFLOW,
    consoleSpaces(
      HEALTHY,
      [
        {
          spaceId: 'dev-1',
          stage: 'Development',
          liveStatus: HEALTHY,
          annotations: signoff === undefined ? {} : { signoff },
        },
        { spaceId: 'stg-1', stage: 'Staging', liveStatus: HEALTHY },
      ],
      null,
    ),
    [['dev-1'], ['stg-1']],
    { resolved: [BASE, 'dev-1'], released: ['dev-1'] },
  );
}

test('case 10a — custom CEL unsatisfied: cub refuses, UI blocks', () => {
  expect(uiVerdict(celRow(undefined), 'staging').decision).toBe('BLOCK'); // AGREES
});

/*
 * ⚠️ DIVERGENCE — recorded, not fixed. `cub` promotes; this app cannot evaluate
 * CEL and so cannot say the gate passed. It blocks, and the override is the way
 * past it. The UI is MORE STRICT than `cub` here, by design, and that design has
 * a cost: every promotion under a CEL-gated stage demands an override, however
 * plainly satisfied the expression is.
 */
test('case 10b — DIVERGENCE: custom CEL satisfied — cub passes, UI blocks', () => {
  const ui = uiVerdict(celRow('true'), 'staging');
  expect(ui.decision).toBe('BLOCK'); // cub: PASS — the UI is stricter
  expect(ui.gateState).toBe('unknown'); // not `held`: nobody made the check
  expect(ui.reasons.join(' ')).not.toContain('satisfied');
});

/*
 * ══ CASE 10d — A PREREQUISITE NOTHING DECLARES ═════════════════════════════
 * cub:  REFUSE — "unrecognized prerequisite for Stage 'Staging': 'Approved'"
 *       (per `evaluatePrerequisites`)
 */
test('case 10d — an unrecognised prerequisite name: cub refuses, UI blocks', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
      { Name: 'staging', WhereSpace: "Labels.Stage = 'Staging'", Prerequisites: ['Approved'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(
      HEALTHY,
      [
        { spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY },
        { spaceId: 'stg-1', stage: 'Staging', liveStatus: HEALTHY },
      ],
      null,
    ),
    [['dev-1'], ['stg-1']],
    { resolved: [BASE, 'dev-1'], released: ['dev-1'] },
  );
  const ui = uiVerdict(row, 'staging');
  expect(ui.decision).toBe('BLOCK'); // AGREES
  expect(ui.gateState).toBe('held'); // a verdict, not an unknown
});

/*
 * ══ CASE 11 — A PREVIOUS STAGE THAT SELECTS NO SPACE ═══════════════════════
 * cub:  REFUSE
 *   $ cub variant promote --change-order gdx-base/co-ghost --target-stage dev --dry-run
 *   Failed: unable to promote to stage 'dev', its previous stage 'ghost'
 *           selects no Space
 */
test('case 11 — previous stage selects no Space: cub refuses, UI blocks', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'base', WhereSpace: "Labels.Stage = 'Base'" },
      { Name: 'ghost', WhereSpace: "Labels.Stage = 'NoSuchStage'" },
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'", Prerequisites: ['Released', 'Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(HEALTHY, [{ spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY }]),
    [[BASE], [], ['dev-1']],
    { resolved: [BASE], released: [] },
  );
  const ui = uiVerdict(row, 'dev');
  expect(ui.decision).toBe('BLOCK'); // AGREES
  expect(ui.reasons.join(' ').toLowerCase()).toContain('selects no');
});

/*
 * ══ CASE 12 — THE GATE QUANTIFIES OVER THE WHOLE PREVIOUS STAGE ════════════
 * Two Spaces in the previous stage, one healthy and one degraded.
 *
 * cub:  REFUSE — "Variant 'web-stg' is not synced"
 *       (per `evaluatePrerequisites`)
 */
test('case 12 — one degraded Space in a two-Space previous stage: cub refuses, UI blocks', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'staging', WhereSpace: "Labels.Stage = 'Staging'" },
      { Name: 'prod', WhereSpace: "Labels.Stage = 'Production'", Prerequisites: ['Released', 'Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(
      HEALTHY,
      [
        { spaceId: 'stg-a', stage: 'Staging', liveStatus: HEALTHY },
        { spaceId: 'stg-b', stage: 'Staging', liveStatus: DEGRADED },
        { spaceId: 'prod-1', stage: 'Production', liveStatus: HEALTHY },
      ],
      null,
    ),
    [['stg-a', 'stg-b'], ['prod-1']],
    { resolved: [BASE, 'stg-a', 'stg-b'], released: ['stg-a', 'stg-b'] },
  );
  const ui = uiVerdict(row, 'prod');
  expect(ui.decision).toBe('BLOCK'); // AGREES
  expect(ui.reasons.join(' ')).toContain('stg-b');
});

/*
 * ══ CASE 13 — TAKEN, HEALTHY, BUT NOT RELEASED ═════════════════════════════
 * cub:  REFUSE — "Variant 'web-dev' has taken change order 'release-42' but has
 *       not released it" (per `evaluatePrerequisites`)
 */
test('case 13 — previous stage took the change but has not released it: cub refuses, UI blocks', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
      { Name: 'staging', WhereSpace: "Labels.Stage = 'Staging'", Prerequisites: ['Released', 'Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(
      HEALTHY,
      [
        { spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY },
        { spaceId: 'stg-1', stage: 'Staging', liveStatus: HEALTHY },
      ],
      null,
    ),
    [['dev-1'], ['stg-1']],
    { resolved: [BASE, 'dev-1'], released: [] },
  );
  const ui = uiVerdict(row, 'staging');
  expect(ui.decision).toBe('BLOCK'); // AGREES
  expect(ui.reasons.join(' ')).toContain('not released');
});

/*
 * ══ CASE 14 — A TARGET, BUT NO LIVE STATUS AT ALL ══════════════════════════
 * cub:  REFUSE — "live-status not found for Variant 'web-dev'"
 *       (per `evaluatePrerequisites`)
 */
test('case 14 — a targeted previous stage that reports nothing: cub refuses, UI blocks', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
      { Name: 'staging', WhereSpace: "Labels.Stage = 'Staging'", Prerequisites: ['Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(
      HEALTHY,
      [
        { spaceId: 'dev-1', stage: 'Development', liveStatus: null },
        { spaceId: 'stg-1', stage: 'Staging', liveStatus: HEALTHY },
      ],
      null,
    ),
    [['dev-1'], ['stg-1']],
    { resolved: [BASE, 'dev-1'], released: ['dev-1'] },
  );
  const ui = uiVerdict(row, 'staging');
  expect(ui.decision).toBe('BLOCK'); // AGREES
  expect(ui.gateState).toBe('held'); // a verdict: it reported nothing, which is an answer
});

/*
 * ══ CASE 16 — A DEGRADED PREVIOUS STAGE THE WORKFLOW ASKS NOTHING OF ═══════
 *
 * The stage being entered declares NO prerequisites, and the previous stage —
 * released, targeted, judgeable — reports Degraded.
 *
 * cub:  PASS — ⚠️ DERIVED FROM SOURCE, NOT EXECUTED. Every other `cub` verdict
 *       in this file was recorded from a run of the CLI or from calling
 *       `evaluatePrerequisites` in a throwaway Go test. This one was read
 *       off `public/cmd/cub/variant_promote.go` and is labelled so nobody
 *       mistakes it for either.
 *
 *       The reading: `validateStageEntryGates` has a previous stage, so it
 *       resolves that stage's Variants and calls `evaluatePrerequisites`
 *       with `currentStage.Prerequisites` — nil here. That function runs
 *       the taken-the-change check first (the change is in `dev`, so it
 *       passes) and then ranges over the prerequisite list, which is empty.
 *       `checkSpaceIsHealthy` is reached only from the `prerequisiteHealthy`
 *       arm of that loop, so the live-status annotation is never read and
 *       cannot refuse anything. The promotion goes ahead.
 *
 * THE UI MUST NOT WITHDRAW PROMOTE HERE. The annotation still colours the chip,
 * writes the Blocker sentence and tones the segment — a reader should see that
 * `dev` is unhealthy — but it decides no action. `ui/tests/
 * rollout-health-informs-gate-decides.spec.ts` holds the display half.
 */
test('case 16 — a degraded previous stage with no prerequisite declared: cub passes, UI passes', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
      { Name: 'staging', WhereSpace: "Labels.Stage = 'Staging'" },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(
      HEALTHY,
      [
        { spaceId: 'dev-1', stage: 'Development', liveStatus: DEGRADED },
        { spaceId: 'stg-1', stage: 'Staging', liveStatus: HEALTHY },
      ],
      null,
    ),
    [['dev-1'], ['stg-1']],
    { resolved: [BASE, 'dev-1'], released: ['dev-1'] },
  );
  const ui = uiVerdict(row, 'staging');
  expect(ui.decision).toBe('PASS'); // AGREES with cub's PASS
  expect(ui.reasons).toEqual([]);

  // The row says the workload is failing, and offers the promotion `cub` performs.
  expect(row.state).toBe('degraded');
  expect(row.blocker).toContain('gdx-dev-1');
  expect(actionFor(row).label).toBe('Promote');
});
