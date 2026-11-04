// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The stage the ChangeOrder page opens on when the URL names none (#6154): a
 * last stage that is promoted and not released still has its Release to do, so
 * the page opens on it, not on Complete.
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

test('the next stage the change has not reached comes first', () => {
  expect(defaultOpenStageId(input({ nextStageId: 'dev' }))).toBe('dev');
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

test('the card and the rail agree: the card opens a stage exactly when the rail offers a Release still to do', () => {
  for (const r of [
    row({ released: [DEV], inScope: [BASE, DEV, PROD] }),
    row({ released: [DEV, PROD], inScope: [BASE, DEV, PROD] }),
    row({ released: [DEV] }),
    row({ released: [DEV], prodLabels: { Tier: 'prod', Stage: 'None' }, inScope: [BASE, DEV, PROD] }),
  ]) {
    const releaseToDo = r.stages.filter((s) => s.hasReleaseTargets && s.state.verdict === 'promoted').map((s) => s.stageId);
    const opened = openedFrom(r);
    if (r.nextStageId !== null) expect(opened).toBe(r.nextStageId);
    else expect(opened === null ? [] : [opened]).toEqual(releaseToDo.slice(0, 1));
  }
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
