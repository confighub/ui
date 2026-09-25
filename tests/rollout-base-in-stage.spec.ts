// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * THE CHANGEORDER'S OWN SPACE, INSIDE A REAL STAGE.
 *
 * `buildRolloutSequence` stopped withholding the base from a stage whose
 * selector covers it, because `stageSpaces` in
 * `public/cmd/cub/variant_promote.go` filters by scope and by nothing else.
 * That was right FOR GATING: the base is one of the Variants every entry gate
 * to the next stage quantifies over.
 *
 * It settled one question and three consumers went on answering a different
 * one. Membership-for-gating is not membership-for-evidence, and neither is
 * membership-for-action:
 *
 *   EVIDENCE — the reported-health channel read the base's live-status
 *              annotation as this rollout's health and withdrew Promote.
 *   ACTION   — the promote and release call sites wrote into the base, which
 *              `cub`'s own loop skips by name.
 *   POSITION — `viewerPositionIn` placed the base in the synthetic source row,
 *              which is the row the graph DROPS.
 *
 * Pure derivation — no page, no browser.
 */
import { test, expect } from './fixtures/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import { LIVE_STATUS_ANNOTATION_KEY, type LiveStatus } from '../src/pages/x/apps/liveStatus';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import { promotionTargets } from '../src/pages/x/apps/rollout/rolloutStages';
import {
  actionFor,
  buildConsoleRow,
  viewerPositionIn,
  type ConsoleChangeOrder,
  type ConsoleSpace,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';

const HEALTHY: LiveStatus = { syncStatus: 'Synced', operationPhase: 'Succeeded', healthStatus: 'Healthy' };
/** The shape argobot leaves behind on a Space nothing reconciles any more. */
const STALE_FAILING: LiveStatus = {
  syncStatus: 'OutOfSync',
  operationPhase: 'Failed',
  healthStatus: 'Degraded',
};

const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'gdx' };
const BASE = 'base-1';
const DEV = 'dev-1';
const PROD = 'prod-1';

function space(
  spaceId: string,
  slug: string,
  stage: string | null,
  liveStatus: LiveStatus | null,
  targeted: boolean,
): ConsoleSpace {
  return {
    spaceId,
    slug,
    component: COMPONENT,
    labels: stage === null ? {} : { Stage: stage },
    releaseTargetId: targeted ? `target-${spaceId}` : undefined,
    annotations:
      liveStatus === null ? undefined : { [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify(liveStatus) },
  };
}

function rowFor(
  workflow: ChangeWorkflowSpec,
  stageMembers: string[][],
  spaces: ConsoleSpace[],
  progress: Pick<ConsoleChangeOrder, 'resolvedSpaceIds' | 'releasedSpaceIds' | 'inScopeSpaceIds'>,
) {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {};
  workflow.Stages.forEach((stage, i) => {
    stageSpaces[stageWhereSpace(stage, COMPONENT)] = (stageMembers[i] ?? []).map(
      (spaceId) => ({ Space: { SpaceID: spaceId } }) as ExtendedSpaceRead,
    );
  });
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'gdx-base',
      governing: { state: 'governed', workflow, changeWorkflowId: 'wf-1' },
      ...progress,
    },
    spaces,
    stageSpaces,
  );
}

/**
 * ONE STAGE, NO SELECTOR — the shipped `whole-component` shape, and the
 * product's simplest workflow. An empty `WhereSpace` means every Space of the
 * component, so the base is a member of the only stage there is.
 */
const WHOLE_COMPONENT: ChangeWorkflowSpec = { Stages: [{ Name: 'everywhere', WhereSpace: '' }] };

/**
 * THE BASE IS THE FIRST STAGE — the shape `test/scripts/test-previous-stage.sh`
 * seeds, where the workflow's first stage's selector covers the Space the
 * ChangeOrder was authored in.
 */
const BASE_IS_FIRST_STAGE: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'Development'" },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'Production'" },
  ],
};

// ── A1. THE BASE'S OWN ANNOTATION IS NOT THIS ROLLOUT'S HEALTH ──────────────

/*
 * ⚠️ THE REGRESSION. `reachedStageIndices` keeps the SOURCE ROW out of the
 * reported-health channel by verdict, and that guard does nothing once a real
 * stage's selector covers the base. The base has no release target — nothing
 * reconciles it, so its annotation is stale by construction — and the reported
 * channel read it as evidence, `degradedReason` took it, `deriveConsoleState`
 * answered 'degraded' and `actionFor` offered `Resolve`.
 *
 * `cub` promotes here. `prod` is not the first stage, so `validateStageEntryGates`
 * runs over `dev`'s Spaces — and it never asks anything of the base's workload,
 * because the promotion loop skips the base before any of it is read.
 */
test('A1 — the base reporting Degraded from inside a stage does not withdraw Promote', () => {
  const row = rowFor(
    BASE_IS_FIRST_STAGE,
    [[BASE, DEV], [PROD]],
    [
      space(BASE, 'gdx-base', 'Development', STALE_FAILING, false),
      space(DEV, 'gdx-dev', 'Development', HEALTHY, true),
      space(PROD, 'gdx-prod', 'Production', HEALTHY, true),
    ],
    { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [DEV], inScopeSpaceIds: [BASE, DEV, PROD] },
  );

  expect(row.state).toBe('ready');
  expect(row.blocker).not.toContain('gdx-base');
  expect(actionFor(row).label).toBe('Promote');
});

/*
 * The same rule on the one-stage `whole-component` shape, where the stage the
 * base sits in is the ONLY stage — so there is no second stage to carry the
 * row past a verdict taken about the base.
 */
test('A1 — a whole-component stage is not degraded by its own base', () => {
  const row = rowFor(
    WHOLE_COMPONENT,
    [[BASE, DEV]],
    [
      space(BASE, 'gdx-base', null, STALE_FAILING, false),
      space(DEV, 'gdx-dev', null, HEALTHY, true),
    ],
    { resolvedSpaceIds: [BASE], inScopeSpaceIds: [BASE, DEV] },
  );

  expect(row.state).not.toBe('degraded');
  expect(row.blocker).not.toContain('gdx-base');
  expect(actionFor(row).label).not.toBe('Resolve');
  // The stage's own gate list is empty — the gate machinery agrees the stage is
  // ungated, and the display channel must not overrule it.
  expect(row.stages.find((s) => s.stageId === 'everywhere')?.gates).toEqual([]);
});

/*
 * THE OTHER HALF, so the fix cannot be "stop reading annotations". A Space that
 * is NOT the base and IS running this change still reports, from inside the
 * same stage the base sits in.
 */
test('A1 — a peer of the base in the same stage still reports its failure', () => {
  const row = rowFor(
    BASE_IS_FIRST_STAGE,
    [[BASE, DEV], [PROD]],
    [
      space(BASE, 'gdx-base', 'Development', HEALTHY, false),
      space(DEV, 'gdx-dev', 'Development', STALE_FAILING, false),
      space(PROD, 'gdx-prod', 'Production', HEALTHY, true),
    ],
    { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [DEV], inScopeSpaceIds: [BASE, DEV, PROD] },
  );

  expect(row.state).toBe('degraded');
  expect(row.blocker).toContain('gdx-dev');
});

/*
 * AND THE BASE'S OWN SEGMENT IS NOT SILENCED. Its report is the SUBJECT there —
 * a statement about the Space the change was authored in, which is what the
 * display channel exists to make — and `reachedStageIndices` already keeps the
 * source row out of the row's verdict. What changed is its reach inside a real
 * stage, where the same annotation was being read as evidence about a
 * promotion.
 */
test('A1 — the base still reports on its own segment', () => {
  const row = rowFor(
    BASE_IS_FIRST_STAGE,
    [[BASE, DEV], [PROD]],
    [
      space(BASE, 'gdx-base', 'Development', STALE_FAILING, false),
      space(DEV, 'gdx-dev', 'Development', HEALTHY, true),
      space(PROD, 'gdx-prod', 'Production', HEALTHY, true),
    ],
    { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [DEV], inScopeSpaceIds: [BASE, DEV, PROD] },
  );

  expect(row.stages[0].isSource).toBe(true);
  expect(row.stages[0].segmentTone).toBe('degraded');
  // The stage the base shares with a healthy peer draws the peer's answer.
  expect(row.stages.find((s) => s.stageId === 'dev')?.segmentTone).toBe('done');
});

// ── A2. WHAT A PROMOTE WRITES INTO ─────────────────────────────────────────

/*
 * `cub`'s loop, verbatim: "Skipping %s, the space the change order was created
 * in". A dialog counting the stage's MEMBERSHIP says one more variant than the
 * promote writes, and `release` over the same list publishes a Release in the
 * base — a write the CLI never makes on this path, which reports failure over a
 * promotion that in fact succeeded when the base has no release target.
 */
test('A2 — a promote writes into every Space of the stage except the base', () => {
  const row = rowFor(
    WHOLE_COMPONENT,
    [[BASE, DEV, PROD]],
    [
      space(BASE, 'gdx-base', null, HEALTHY, false),
      space(DEV, 'gdx-dev', null, HEALTHY, true),
      space(PROD, 'gdx-prod', null, HEALTHY, true),
    ],
    { resolvedSpaceIds: [BASE], inScopeSpaceIds: [BASE, DEV, PROD] },
  );

  const stage = row.stages.find((s) => s.stageId === 'everywhere');
  // Membership is unchanged — the gates quantify over it.
  expect(stage?.spaceIds).toEqual([BASE, DEV, PROD]);
  // The write set is not membership.
  expect(promotionTargets(stage?.spaceIds ?? [], BASE)).toEqual([DEV, PROD]);
});

test('A2 — a stage that does not select the base writes into all of it', () => {
  expect(promotionTargets([DEV, PROD], BASE)).toEqual([DEV, PROD]);
});

/*
 * A fleet-wide rollout has no component and its base may be unknown to the
 * caller. Filtering on `undefined` must remove nothing rather than everything.
 */
test('A2 — an unknown base removes nothing from the write set', () => {
  expect(promotionTargets([BASE, DEV], undefined)).toEqual([BASE, DEV]);
});

// ── A3. WHERE A VIEWER SITS ────────────────────────────────────────────────

/*
 * ⚠️ THE SYNTHETIC ROW MUST LOSE TO A REAL STAGE. The base Space sits in two
 * rows whenever a stage's selector covers it, and the synthetic source row is
 * at position 0, so a plain ordered search always returns it. Reported to a
 * reader, that row names `__rollout_source__` as the stage and calls a Space
 * the workflow governs "where this change starts". These two tests pin both
 * halves of the rule: the real stage wins when there is one, and the source row
 * is still the answer when there is not.
 */
test('A3 — a viewer in the base is placed in the stage that selects it', () => {
  const row = rowFor(
    WHOLE_COMPONENT,
    [[BASE, DEV]],
    [space(BASE, 'gdx-base', null, HEALTHY, false), space(DEV, 'gdx-dev', null, HEALTHY, true)],
    { resolvedSpaceIds: [BASE], inScopeSpaceIds: [BASE, DEV] },
  );

  const position = viewerPositionIn(row, BASE);
  expect(position?.stageId).toBe('everywhere');
  expect(position?.isSource).toBe(false);
  expect(position?.isNext).toBe(true);
});

/*
 * And the source row is still the answer when it is the only one: a workflow
 * whose stages do not cover the base leaves that row with something to say.
 */
test('A3 — a base no stage selects is still placed in the source row', () => {
  const row = rowFor(
    BASE_IS_FIRST_STAGE,
    [[DEV], [PROD]],
    [
      space(BASE, 'gdx-base', null, HEALTHY, false),
      space(DEV, 'gdx-dev', 'Development', HEALTHY, true),
      space(PROD, 'gdx-prod', 'Production', HEALTHY, true),
    ],
    { resolvedSpaceIds: [BASE], inScopeSpaceIds: [BASE, DEV, PROD] },
  );

  const position = viewerPositionIn(row, BASE);
  expect(position?.stageId).toBe('__rollout_source__');
  expect(position?.isSource).toBe(true);
});
