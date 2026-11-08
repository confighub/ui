// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The stage the ChangeOrder page opens on when the URL names none: the first
 * stage, in order, with work left. That is a stage with a release Target that is
 * promoted and not yet released (its Release is still to do), or the next stage
 * to promote into. With neither, the page opens on Complete. A stage with no
 * release Target is done once promoted.
 *
 * The page waits on a stage until its Release is done because the next stage's
 * entry gate needs this stage released: moving on after Promote opens a stage
 * the reader cannot promote yet, and they must go back to release.
 *
 * Whether a stage has a release Target is the rail's own answer
 * (`ConsoleStage.hasReleaseTargets`), so the card and the rail agree: it holds
 * when the ChangeOrder's scope is unknown and when a Space is labelled
 * `Stage=none`, both of which the page's scoped Space list leaves out.
 */
import { expect, test } from '@playwright/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import {
  type OpenStageInput,
  defaultOpenStageId,
  railReleaseTargets,
} from '../src/pages/change-orders/changeOrderOpenStage';
import { buildConsoleRow, type ConsoleSpace, stageReleaseSpaceIds } from '../src/pages/x/apps/change-order/changeOrdersConsoleModel';
import { stageWhereSpace } from '../src/pages/x/apps/change-order/changeOrderWorkflow';
import { carryingReleases } from './fixtures/running-release';

function input(over: Partial<OpenStageInput> = {}): OpenStageInput {
  return {
    nextStageId: null,
    stageStates: [
      { stageId: 'dev', verdict: 'released' },
      { stageId: 'prod', verdict: 'promoted' },
    ],
    stageHasReleaseTargets: (id) => id === 'prod',
    ...over,
  };
}

test('the next stage to promote into is open when no stage before it has a Release to do', () => {
  expect(defaultOpenStageId(input({ nextStageId: 'dev' }))).toBe('dev');
});

/** dev, staging and prod; staging is the next stage to promote into. */
function threeStages(dev: 'promoted' | 'released', devHasTarget = true): OpenStageInput {
  return {
    nextStageId: 'staging',
    stageStates: [
      { stageId: 'base', verdict: 'source' },
      { stageId: 'dev', verdict: dev },
      { stageId: 'staging', verdict: 'waiting' },
      { stageId: 'prod', verdict: 'waiting' },
    ],
    stageHasReleaseTargets: (id) => id !== 'base' && (id !== 'dev' || devHasTarget),
  };
}

test('after Promote, a stage with a release Target stays open until its Release is done', () => {
  expect(defaultOpenStageId(threeStages('promoted'))).toBe('dev');
});

test('after Release, the page moves on to the next stage', () => {
  expect(defaultOpenStageId(threeStages('released'))).toBe('staging');
});

test('a promoted stage with no release Target is done: the page moves on to the next stage', () => {
  expect(defaultOpenStageId(threeStages('promoted', false))).toBe('staging');
});

test('a stage being promoted, with a release Target, stays open', () => {
  const state = threeStages('promoted');
  expect(
    defaultOpenStageId({
      ...state,
      stageStates: state.stageStates.map((s) => (s.stageId === 'dev' ? { ...s, verdict: 'in-progress' as const } : s)),
    }),
  ).toBe('dev');
});

test('a last stage promoted and not released, with a release Target, is opened instead of Complete', () => {
  expect(defaultOpenStageId(input())).toBe('prod');
});

test('a promoted stage with no release Target is done: Complete', () => {
  expect(defaultOpenStageId(input({ stageHasReleaseTargets: () => false }))).toBeNull();
});

test('every stage released: Complete', () => {
  expect(
    defaultOpenStageId(
      input({
        stageStates: [
          { stageId: 'dev', verdict: 'released' },
          { stageId: 'prod', verdict: 'released' },
        ],
      }),
    ),
  ).toBeNull();
});

test('a stage the rail does not know has no release Target', () => {
  expect(railReleaseTargets(undefined)('prod')).toBe(false);
  expect(railReleaseTargets([{ stageId: 'dev', hasReleaseTargets: true }])('prod')).toBe(false);
  expect(railReleaseTargets([{ stageId: 'prod', hasReleaseTargets: true }])('prod')).toBe(true);
});

// ---------------------------------------------------------------------------
// From the console row the rail draws
// ---------------------------------------------------------------------------

const BASE = 'base-1';
const DEV = 'dev-1';
const PROD = 'prod-1';
const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };
const WORKFLOW: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'prod', WhereSpace: "Labels.Tier = 'prod'" },
  ],
};

/**
 * dev is released; prod is promoted. `released` names the Spaces the server records as released;
 * `prodLabels` are prod's Space's labels; `inScope` is the ChangeOrder's scope (`undefined`: unknown).
 */
/** Every listed Space, as the page lists them; prod's carries `prodLabels`. */
function spacesWith(prodLabels: Record<string, string> = { Tier: 'prod' }): ConsoleSpace[] {
  return [
    { spaceId: BASE, slug: 'myapp-base', component: COMPONENT },
    { spaceId: DEV, slug: 'myapp-dev', component: COMPONENT, labels: { Stage: 'dev' } },
    {
      spaceId: PROD,
      slug: 'myapp-prod',
      component: COMPONENT,
      labels: prodLabels,
      releaseTargetId: 'target-prod',
    },
  ];
}

function row(opts: { released: string[]; prodLabels?: Record<string, string>; inScope?: string[] }) {
  const spaces = spacesWith(opts.prodLabels);
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {
    [stageWhereSpace(WORKFLOW.Stages[0])]: [{ Space: { SpaceID: DEV } } as ExtendedSpaceRead],
    [stageWhereSpace(WORKFLOW.Stages[1])]: [{ Space: { SpaceID: PROD } } as ExtendedSpaceRead],
  };
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-it',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: [BASE, DEV, PROD],
      releasedSpaceIds: opts.released,
      releases: carryingReleases(opts.released),
      ...(opts.inScope === undefined ? {} : { inScopeSpaceIds: opts.inScope }),
      governing: { state: 'governed', workflow: WORKFLOW, changeWorkflowId: 'wf-1' },
      stage: 'prod',
    },
    spaces,
    stageSpaces,
  );
}

/** What the page opens on, from the row: the same inputs the page passes. */
function openedFrom(r: ReturnType<typeof row>) {
  return defaultOpenStageId({
    nextStageId: r.nextStageId,
    stageStates: r.stages.map((s) => ({ stageId: s.stageId, verdict: s.state.verdict })),
    stageHasReleaseTargets: railReleaseTargets(r.stages),
  });
}

test('an unreleased last stage with a release Target stays open on that stage', () => {
  expect(openedFrom(row({ released: [DEV], inScope: [BASE, DEV, PROD] }))).toBe('prod');
});

test('a released last stage opens Complete', () => {
  expect(openedFrom(row({ released: [DEV, PROD], inScope: [BASE, DEV, PROD] }))).toBeNull();
});

test('the scope unknown: the rail selects no Space, so it offers no Release, and the card opens none', () => {
  const r = row({ released: [DEV] });
  expect(r.stages.filter((s) => s.hasReleaseTargets)).toEqual([]);
  expect(openedFrom(r)).toBeNull();
});

test('a Space labelled Stage=none: the rail still sees its release Target, so the stage stays open', () => {
  expect(openedFrom(row({ released: [DEV], prodLabels: { Tier: 'prod', Stage: 'None' }, inScope: [BASE, DEV, PROD] }))).toBe('prod');
});

/**
 * The card's open stage for each row the rail draws, written out by hand: `verdict` is the verdict
 * of the stage with work left, so the table covers a Release still to do after a full promote
 * (`promoted`) and after a partial one (`in-progress`).
 */
test('the card and the rail agree: the card opens the first stage with a Release still to do, else the next stage, else Complete', () => {
  const cases: { name: string; r: ReturnType<typeof row>; open: string | null; verdict?: string }[] = [
    { name: 'prod promoted, not released', r: row({ released: [DEV], inScope: [BASE, DEV, PROD] }), open: 'prod', verdict: 'promoted' },
    { name: 'prod released', r: row({ released: [DEV, PROD], inScope: [BASE, DEV, PROD] }), open: null },
    { name: 'scope unknown', r: row({ released: [DEV] }), open: null },
    {
      name: 'prod labelled Stage=none',
      r: row({ released: [DEV], prodLabels: { Tier: 'prod', Stage: 'None' }, inScope: [BASE, DEV, PROD] }),
      open: 'prod',
      verdict: 'promoted',
    },
    { name: 'dev promoted into one of two Spaces', r: threeRow({ resolved: [DEV_A], released: [] }), open: 'dev', verdict: 'in-progress' },
    { name: 'dev promoted, not released', r: threeRow({ resolved: [DEV_A, DEV_B], released: [] }), open: 'dev', verdict: 'promoted' },
    { name: 'dev released in one Space', r: threeRow({ resolved: [DEV_A, DEV_B], released: [DEV_A] }), open: 'dev', verdict: 'promoted' },
    { name: 'dev released', r: threeRow({ resolved: [DEV_A, DEV_B], released: [DEV_A, DEV_B] }), open: 'staging', verdict: 'waiting' },
    {
      name: 'staging promoted, not released',
      r: threeRow({ resolved: [DEV_A, DEV_B, STAGING], released: [DEV_A, DEV_B] }),
      open: 'staging',
      verdict: 'promoted',
    },
  ];
  for (const c of cases) {
    expect(openedFrom(c.r), c.name).toBe(c.open);
    if (c.verdict !== undefined) {
      expect(c.r.stages.find((s) => s.stageId === c.open)?.state.verdict, c.name).toBe(c.verdict);
    }
  }
});

// ---------------------------------------------------------------------------
// A middle stage: dev (two Spaces), staging and prod, each Space with a release Target
// ---------------------------------------------------------------------------

const DEV_A = 'dev-a';
const DEV_B = 'dev-b';
const STAGING = 'staging-1';
const [DEV_STAGE, STAGING_STAGE, PROD_STAGE] = ['dev', 'staging', 'prod'].map((name) => ({
  Name: name,
  WhereSpace: `Labels.Stage = '${name}'`,
}));
const THREE_STAGES: ChangeWorkflowSpec = { Stages: [DEV_STAGE, STAGING_STAGE, PROD_STAGE] };

/** `resolved`: the Spaces the change is promoted into; `released`: those the server records as released. */
function threeRow(opts: { resolved: string[]; released: string[] }) {
  const member = (spaceId: string, stage: string): ConsoleSpace => ({
    spaceId,
    slug: `myapp-${spaceId}`,
    component: COMPONENT,
    labels: { Stage: stage },
    releaseTargetId: `target-${spaceId}`,
  });
  const spaces: ConsoleSpace[] = [
    { spaceId: BASE, slug: 'myapp-base', component: COMPONENT },
    member(DEV_A, 'dev'),
    member(DEV_B, 'dev'),
    member(STAGING, 'staging'),
    member(PROD, 'prod'),
  ];
  const read = (ids: string[]) => ids.map((id) => ({ Space: { SpaceID: id } }) as ExtendedSpaceRead);
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {
    [stageWhereSpace(DEV_STAGE)]: read([DEV_A, DEV_B]),
    [stageWhereSpace(STAGING_STAGE)]: read([STAGING]),
    [stageWhereSpace(PROD_STAGE)]: read([PROD]),
  };
  return buildConsoleRow(
    {
      changeOrderId: 'co-3',
      slug: 'ship-it',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: [BASE, ...opts.resolved],
      releasedSpaceIds: opts.released,
      releases: carryingReleases(opts.released),
      inScopeSpaceIds: [BASE, DEV_A, DEV_B, STAGING, PROD],
      governing: { state: 'governed', workflow: THREE_STAGES, changeWorkflowId: 'wf-3' },
      stage: 'dev',
    },
    spaces,
    stageSpaces,
  );
}

test('dev promoted, not released: the page stays on dev, although staging is the next stage to promote into', () => {
  const r = threeRow({ resolved: [DEV_A, DEV_B], released: [] });
  expect(r.nextStageId).toBe('staging');
  expect(openedFrom(r)).toBe('dev');
});

test('dev released in one of its two Spaces: its Release is not done, so the page stays on dev', () => {
  expect(openedFrom(threeRow({ resolved: [DEV_A, DEV_B], released: [DEV_A] }))).toBe('dev');
});

test('dev released in every Space: the page moves on to staging', () => {
  expect(openedFrom(threeRow({ resolved: [DEV_A, DEV_B], released: [DEV_A, DEV_B] }))).toBe('staging');
});

// ---------------------------------------------------------------------------
// The card's Release reads the rail's list
// ---------------------------------------------------------------------------

/** The card's `releaseTargetOf`: every listed Space, as the page builds it (`ChangeOrderDetail.releaseTargetOf`). */
const releaseTargetOfSpaces = (spaces: readonly ConsoleSpace[]) => (spaceId: string) =>
  spaces.find((s) => s.spaceId === spaceId)?.releaseTargetId;

test('a Space labelled Stage=none with a release Target: the card offers Release for it', () => {
  const spaces = spacesWith({ Tier: 'prod', Stage: 'None' });
  const r = row({ released: [DEV], prodLabels: { Tier: 'prod', Stage: 'None' }, inScope: [BASE, DEV, PROD] });
  const prod = r.stages.find((s) => s.stageId === 'prod');
  expect(stageReleaseSpaceIds(prod?.spaceIds ?? [], undefined, releaseTargetOfSpaces(spaces))).toEqual([PROD]);
});

test('the card and the rail agree on which stages have a Release, Space by Space', () => {
  for (const prodLabels of [{ Tier: 'prod' }, { Tier: 'prod', Stage: 'None' }]) {
    const spaces = spacesWith(prodLabels);
    const r = row({ released: [DEV], prodLabels, inScope: [BASE, DEV, PROD] });
    for (const stage of r.stages) {
      const card = stageReleaseSpaceIds(stage.spaceIds, undefined, releaseTargetOfSpaces(spaces));
      expect(card.length > 0, stage.stageId).toBe(stage.hasReleaseTargets);
    }
  }
});

test('the Space the promotion passes over is never released, by the card or the rail', () => {
  expect(stageReleaseSpaceIds([PROD], PROD, releaseTargetOfSpaces(spacesWith()))).toEqual([]);
});
