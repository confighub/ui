// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// ══ A DIFFERENTIAL TEST BETWEEN `cub` AND THIS APP'S GATE ══════════════════
//
// The server gates promotion (`evaluatePrerequisites`,
// internal/views/promote_gates.go), and `cub variant promote` prints its
// verdicts. This app evaluates the gates it can from the data it holds, so that
// the list of rollouts can say which are ready, and the two must decide alike:
// where `cub` REFUSES, the UI must not offer Promote as ready; where `cub`
// PASSES, the UI must not withhold it. A gate this app cannot evaluate is
// `evaluated: false` — not ready, but not refused either: the page showing one
// rollout fills it in from the server's dry run, and a promote asks the server.
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
// A Space's live status is set by hand rather than by argobot, by patching
// `LiveStatus` onto the Release it is running:
//   cub release update --patch <release-id> --from-stdin <<< '{"LiveStatus": {...}}'
//
// Cases needing a real ReleaseTargetID (a released, healthy previous stage)
// cannot be built without a cluster; those `cub` verdicts are what
// `evaluatePrerequisites` (internal/views/promote_gates.go), the function the
// server's promotion gates call, answers for them. They are marked below.
//
// Pure derivation — no page, no browser.

import { test, expect } from './fixtures/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import type { LiveStatus } from '../src/pages/x/apps/liveStatus';
import { carryingReleases, runningRelease } from './fixtures/running-release';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import { gatesOpen, blockingGateCount, gateStateFor, partitionBlockingGates } from '../src/pages/x/apps/rollout/rolloutGates';
import type { ServerGatesByStage } from '../src/pages/x/apps/rollout/useServerStageGates';
import {
  actionFor,
  buildConsoleRow,
  canAbortRollout,
  type ConsoleRow,
  type ConsoleSpace,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';

const HEALTHY: LiveStatus = {
  Sync: 'Synced',
  Operation: 'Succeeded',
  Health: 'Healthy',
};
const DEGRADED: LiveStatus = {
  Sync: 'OutOfSync',
  Operation: 'Failed',
  Health: 'Degraded',
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
      // The base has no release Target. It is handed a Release anyway, so the
      // cases over it prove the gate refuses on the Target before it reads one.
      release: runningRelease(baseStatus),
    },
    ...members.map(({ spaceId, stage, liveStatus, targeted = true, annotations = {} }) => ({
      spaceId,
      slug: `gdx-${spaceId}`,
      component: COMPONENT,
      labels: { Stage: stage },
      releaseTargetId: targeted ? `target-${spaceId}` : undefined,
      annotations,
      // `null` is a published Release its deploying tool has not reported on.
      release: targeted ? runningRelease(liveStatus) : undefined,
    })),
  ];
}

function rowFor(
  workflow: ChangeWorkflowSpec,
  spaces: ConsoleSpace[],
  /** Space ids each stage's selector resolves to, in stage order — what `stageSpaces` returns in `cub`. */
  stageSpaceIds: string[][],
  /**
   * `carrying` is the Spaces `ChangeOrder.Releases` names, which is every
   * released one unless a carrying Release was withdrawn.
   */
  progress: { resolved: string[]; released: string[]; carrying?: string[] },
  /** `ChangeOrder.Stage` as the server recorded it. Absent is no stage recorded. */
  stage?: string,
  /** The server's dry-run verdicts, by stage, as the page showing one rollout has them. */
  serverGates?: ServerGatesByStage,
): ConsoleRow {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {};
  workflow.Stages.forEach((stage, i) => {
    stageSpaces[stageWhereSpace(stage)] = stageSpaceIds[i].map(
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
      releases: carryingReleases(progress.carrying ?? progress.released),
      inScopeSpaceIds: [BASE, ...stageSpaceIds.flat()],
      governing: { state: 'governed', workflow, changeWorkflowId: 'wf-1' },
      stage,
    },
    spaces,
    stageSpaces,
    serverGates,
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
 *   Failed: Variant 'base' has no ReleaseTargetID, so its health cannot be
 *           determined
 */
test('case 1 — targetless previous stage with a green status: cub refuses, UI blocks', () => {
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
 * Same, but the status says DEGRADED. `cub` never reads it: the missing
 * ReleaseTargetID is answered first, by Healthy. Released passes the base,
 * which has nothing to release.
 *
 * cub:  REFUSE
 *   Failed: Variant 'base' has no ReleaseTargetID, so its health cannot be
 *           determined
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
   * answered before anything reads the status, so the degraded report
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
 *   Failed: Variant 'base' has no ReleaseTargetID, so its health cannot be
 *           determined
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
  // The check that holds it is Healthy, not Released (a targetless Space passes
  // `Released` on taking the change), so the chip does not claim a missing
  // Release.
  expect(row.state).toBe('held');
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
 *   Failed: Variant 'base' has no ReleaseTargetID, so its health cannot be
 *           determined
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
   * AGREES WITH `cub`: the chip says what `cub changeorder get` says. No `Final`
   * asked about the last stage's health, so the chip is the unverified half of
   * Complete, and the failing workload is still named in the Blocker cell and
   * drawn on its segment.
   */
  expect(row.state).toBe('complete-unverified'); // cub: Completed true
  expect(row.blocker).toContain('gdx-prod-1');
  expect(row.stages.at(-1)?.segmentTone).toBe('degraded');

  /*
   * And the controls follow the same reading:
   *
   *  - the ACTION is `Open`, not `Resolve`. There is no stage left to enter, so
   *    the gate channel offers no promotion;
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
 * An empty selector is not an empty stage: it covers EVERY Space the
 * ChangeOrder is headed for — including ones further down the rollout that
 * have not taken the change.
 *
 * cub:  REFUSE
 *   $ cub variant promote --change-order gdx-base/co-emptywhere --target-stage dev --dry-run
 *   Failed: unable to promote to stage 'dev', Variant 'dev' has not taken
 *           change order 'co-emptywhere'
 */
test('case 9 — an empty WhereSpace widens the previous stage to the whole scope', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'everything', WhereSpace: '' },
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'", Prerequisites: ['Released', 'Healthy'] },
    ],
  };
  const row = rowFor(
    workflow,
    consoleSpaces(HEALTHY, [{ spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY }]),
    // The empty selector covers every in-scope Space, base included.
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
 * `ui/` has no CEL evaluator, so a custom prerequisite is `evaluated: false`
 * until the server's verdict replaces it. Without one — the list of rollouts —
 * the stage is not ready and not refused; with one — the page showing the
 * rollout — the UI decides as `cub` does.
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

function celRow(signoff: string | undefined, serverGates?: ServerGatesByStage): ConsoleRow {
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
    undefined,
    serverGates,
  );
}

function celVerdict(satisfied: boolean): ServerGatesByStage {
  return {
    staging: [
      { Prerequisite: 'Promoted', SpaceID: 'dev-1', Satisfied: true },
      {
        Prerequisite: 'signed-off',
        SpaceID: 'dev-1',
        Satisfied: satisfied,
        Message: satisfied ? undefined : "unable to promote to stage 'staging', prerequisite 'signed-off' is not satisfied",
      },
    ],
  };
}

test('case 10a — custom CEL unsatisfied: cub refuses, UI blocks', () => {
  expect(uiVerdict(celRow(undefined), 'staging').decision).toBe('BLOCK'); // AGREES
  const ui = uiVerdict(celRow(undefined, celVerdict(false)), 'staging');
  expect(ui.decision).toBe('BLOCK'); // AGREES, now as a verdict
  expect(ui.gateState).toBe('held');
});

/*
 * Without the server's verdict the stage is not ready — nobody made the check —
 * but nothing refuses its promotion either: the promote asks the server. With
 * the verdict, the UI passes what `cub` passes.
 */
test('case 10b — custom CEL satisfied: cub passes, UI passes once the server has answered', () => {
  const unanswered = celRow('true');
  const before = uiVerdict(unanswered, 'staging');
  expect(before.decision).toBe('BLOCK'); // not ready: unknown
  expect(before.gateState).toBe('unknown'); // not `held`: nobody made the check
  const stage = unanswered.stages.find((s) => s.stageId === 'staging');
  expect(partitionBlockingGates(stage?.gates ?? []).failed).toEqual([]); // and not refused

  const ui = uiVerdict(celRow('true', celVerdict(true)), 'staging');
  expect(ui.decision).toBe('PASS'); // AGREES
  expect(ui.gateState).toBe('open');
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
 * cub:  REFUSE — "Variant 'web-stg' release 1 is not synced (OutOfSync)"
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
 * The Release the previous stage is running carries the change, and its
 * deploying tool has not reported on it.
 *
 * cub:  REFUSE — "Variant 'web-dev' has no live status for release 1 yet"
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
  expect(ui.reasons.join(' ')).toContain('gdx-dev-1 has no live status for release 1 yet');
});

/*
 * ══ CASE 14b — AN OLDER RELEASE'S GREEN IS NOT THIS ONE'S ══════════════════
 * The previous stage published a new Release after the one its deploying tool
 * reported Healthy on. The status belongs to the Release, so the Space has not
 * been shown healthy: the green is about a configuration it no longer runs.
 *
 * cub:  REFUSE — "Variant 'web-dev' has no live status for release 2 yet"
 *       (per `evaluatePrerequisites`)
 */
test('case 14b — a newer Release not yet reported on: cub refuses, UI blocks', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
      { Name: 'staging', WhereSpace: "Labels.Stage = 'Staging'", Prerequisites: ['Healthy'] },
    ],
  };
  const spaces = consoleSpaces(
    HEALTHY,
    [
      { spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY },
      { spaceId: 'stg-1', stage: 'Staging', liveStatus: HEALTHY },
    ],
    null,
  ).map((space) => (space.spaceId === 'dev-1' ? { ...space, release: runningRelease(null, 2) } : space));
  const row = rowFor(workflow, spaces, [['dev-1'], ['stg-1']], {
    resolved: [BASE, 'dev-1'],
    released: ['dev-1'],
  });
  const ui = uiVerdict(row, 'staging');
  expect(ui.decision).toBe('BLOCK'); // AGREES
  expect(ui.reasons.join(' ')).toContain('gdx-dev-1 has no live status for release 2 yet');
});

/*
 * ══ CASE 14c — HEALTHY, BUT THE CHANGE IS NOT IN A PUBLISHED RELEASE ═══════
 * The stage declares only `Healthy`, so nothing else asks whether the change
 * was released. The health gate does: the Release whose status it reads has to
 * carry the change, or the green is about something else.
 *
 * cub:  REFUSE — "Variant 'web-dev' has not published a release carrying
 *       change order 'co-gated'" (per `evaluatePrerequisites`)
 */
test('case 14c — healthy but not released: cub refuses, UI blocks', () => {
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
  expect(ui.reasons.join(' ')).toContain(`gdx-dev-1 has not published a release carrying '${ORDER}'`);
});

/*
 * ══ CASE 14d — RELEASED, BUT THE RELEASE THAT DID IT WAS WITHDRAWN ═════════
 * The previous stage is in `ReleasedSpaceIDs`, but no published Release carries
 * the change any more, so `ChangeOrder.Releases` has no entry for it. The
 * Release it now runs is green, and is about something else.
 *
 * cub:  REFUSE — "Variant 'web-dev' has not published a release carrying
 *       change order 'co-gated'" (per `evaluatePrerequisites`)
 */
test('case 14d — the carrying Release was withdrawn: cub refuses, UI blocks', () => {
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
        { spaceId: 'dev-1', stage: 'Development', liveStatus: HEALTHY },
        { spaceId: 'stg-1', stage: 'Staging', liveStatus: HEALTHY },
      ],
      null,
    ),
    [['dev-1'], ['stg-1']],
    { resolved: [BASE, 'dev-1'], released: ['dev-1'], carrying: [] },
  );
  const ui = uiVerdict(row, 'staging');
  expect(ui.decision).toBe('BLOCK'); // AGREES
  expect(ui.reasons.join(' ')).toContain(`gdx-dev-1 has not published a release carrying '${ORDER}'`);
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
 *       arm of that loop, so the live status is never read and cannot
 *       refuse anything. The promotion goes ahead.
 *
 * THE UI MUST NOT WITHDRAW PROMOTE HERE. The status still colours the chip,
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
