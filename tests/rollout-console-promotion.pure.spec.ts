// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What promoting a console row would DO — `promotionFor`. Pure derivation, no
// page, no browser, same pattern as `rollout-row-actions.spec.ts`.
//
// The console promotes from a row, and a row is not a stage: it carries the
// whole sequence and has to pick the one stage a promote would write into, and
// then say three things about it that the detail page says about a stage it
// holds open. Each of the three has already been got wrong somewhere:
//
//  - WHICH SPACES the write lands in. Stage membership is not the write set —
//    the promote skips the ChangeOrder's own Space (`promotionTargets`), and a
//    base Space that a stage's selector also covers is a real topology.
//  - WHETHER "and release" is a second real path. It is only one where some
//    Space being promoted INTO can publish at all. Offering it otherwise is a
//    button whose extra step always no-ops.
//  - WHAT HOLDS IT. The gates handed on must be the ones of the stage being
//    promoted into, not of the stage the change is already in.

import { expect, test } from '@playwright/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import {
  buildConsoleRow,
  promotionFor,
  type ConsoleSpace,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';
import { carryingReleases } from './fixtures/running-release';

const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };
const BASE = 'base-1';
const DEV = 'dev-1';
const PROD = 'prod-1';

/**
 * `dev` then `prod`, with `prod` behind a `Released` check.
 *
 * Two stages and a prerequisite on the second is the smallest shape that can
 * tell "the gates of the stage being promoted into" apart from "the gates of
 * the stage the change is already in" — with one stage, or with no
 * prerequisite anywhere, both answers are the empty list.
 */
const WORKFLOW: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Released'] },
  ],
};

interface RowOptions {
  /** Spaces the ChangeOrder has already reached. `[BASE]` is a rollout that has not moved. */
  resolved: string[];
  /** Spaces given a release Target. The rest can never publish. */
  withTargets: string[];
  /** Whether the base Space is ALSO selected by the `dev` stage. */
  baseInDev?: boolean;
  /** `ChangeOrder.Stage` as the server recorded it. Absent is no stage recorded. */
  stage?: string;
}

function row({ resolved, withTargets, baseInDev = false, stage }: RowOptions) {
  const devSpaceIds = baseInDev ? [BASE, DEV] : [DEV];
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {
    [stageWhereSpace(WORKFLOW.Stages[0], COMPONENT)]: devSpaceIds.map(
      (id) => ({ Space: { SpaceID: id } }) as ExtendedSpaceRead,
    ),
    [stageWhereSpace(WORKFLOW.Stages[1], COMPONENT)]: [
      { Space: { SpaceID: PROD } } as ExtendedSpaceRead,
    ],
  };
  const spaces: ConsoleSpace[] = [
    { spaceId: BASE, slug: 'myapp-base', component: COMPONENT },
    { spaceId: DEV, slug: 'myapp-dev', component: COMPONENT, labels: { Stage: 'dev' } },
    { spaceId: PROD, slug: 'myapp-prod', component: COMPONENT, labels: { Stage: 'prod' } },
  ].map((space) =>
    withTargets.includes(space.spaceId) ? { ...space, releaseTargetId: `target-${space.spaceId}` } : space,
  );

  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: resolved,
      releasedSpaceIds: [],
      releases: carryingReleases([]),
      inScopeSpaceIds: [BASE, DEV, PROD],
      governing: { state: 'governed', workflow: WORKFLOW, changeWorkflowId: 'wf-1' },
      stage,
    },
    spaces,
    stageSpaces,
  );
}

// ── Which Spaces the promote writes into ──────────────────────────────

test('the promotion targets the stage the rollout has not reached yet', () => {
  const promotion = promotionFor(row({ resolved: [BASE], withTargets: [DEV, PROD] }));
  expect(promotion?.stageId).toBe('dev');
  expect(promotion?.spaceIds).toEqual([DEV]);
});

/*
 * THE WRITE SET IS NOT STAGE MEMBERSHIP. `cub` skips the Space the ChangeOrder
 * lives in, so a base Space a stage's selector also covers is in the stage and
 * not in the promote. Counting it would make the confirmation dialog state one
 * more variant than the promote writes to.
 */
test('the ChangeOrder’s own Space is in the stage and not in the promote', () => {
  const promotion = promotionFor(row({ resolved: [BASE], withTargets: [DEV], baseInDev: true }));
  expect(promotion?.spaceIds).toEqual([DEV]);
});

test('a rollout with nowhere left to go offers no promotion at all', () => {
  // Everything has taken the change, so there is no next stage to promote into
  // — a different answer from "a stage with no targets", which is a promote
  // that would write nothing and is reported as having done nothing.
  const promotion = promotionFor(
    row({ resolved: [BASE, DEV, PROD], withTargets: [], stage: 'Completed' }),
  );
  expect(promotion).toBeNull();
});

// ── Whether "Promote and release" is a real second path ───────────────

test('a stage whose Spaces can publish offers the release path', () => {
  expect(promotionFor(row({ resolved: [BASE], withTargets: [DEV] }))?.canRelease).toBe(true);
});

test('a stage no Space of which can publish does not', () => {
  expect(promotionFor(row({ resolved: [BASE], withTargets: [] }))?.canRelease).toBe(false);
});

/*
 * A Target on the base Space must not answer for the stage. The promote never
 * writes there, so a release path offered on its account would publish nothing
 * — the same off-by-one as counting it among the targets, in the shape that
 * reads as a working button rather than as a wrong number.
 */
test('a release Target on the ChangeOrder’s own Space does not make one', () => {
  expect(
    promotionFor(row({ resolved: [BASE], withTargets: [BASE], baseInDev: true }))?.canRelease,
  ).toBe(false);
});

// ── What holds it ─────────────────────────────────────────────────────

/*
 * The gates handed on belong to the stage being promoted INTO. `dev` declares
 * no prerequisite and `prod` declares `Released`, so a promotion reporting
 * `prod`'s gates while aiming at `dev` — or the reverse — is visible here and
 * nowhere else in this file.
 */
test('the gates carried are the ones of the stage being promoted into', () => {
  const first = promotionFor(row({ resolved: [BASE], withTargets: [DEV] }));
  expect(first?.stageId).toBe('dev');
  expect(first?.gates).toEqual([]);

  // `dev` has taken the change but published no Release, so `prod`'s entry gate
  // is the thing holding this rollout.
  const second = promotionFor(row({ resolved: [BASE, DEV], withTargets: [DEV, PROD], stage: 'dev' }));
  expect(second?.stageId).toBe('prod');
  expect(second?.gates.length).toBeGreaterThan(0);
  expect(second?.gates.every((gate) => gate.evaluated && gate.ok)).toBe(false);
});
