// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A ChangeOrder whose stages cannot be shown has no promotion path. Exercised
// directly: no page, no browser.
//
// The list and the detail page draw the path, its pips and its "N of M" from
// one row. A row with no stages has none of them, so the detail page withholds
// all three and says why, as the list does. Drawing a Complete step or a rail
// of its own beside "0 of 0" is two different paths for one ChangeOrder.

import { expect, test } from '@playwright/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import { stageWhereSpace } from '../src/pages/x/apps/change-order/changeOrderWorkflow';
import {
  buildConsoleRow,
  hasPromotionPath,
  type ConsoleChangeOrder,
  type ConsoleSpace,
} from '../src/pages/x/apps/change-order/changeOrdersConsoleModel';
import { changeOrdersConsoleCopy } from '../src/pages/x/apps/change-order/changeOrdersConsoleCopy';

const BASE = 'base-1';
const PROD = 'prod-1';
const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };

const WORKFLOW: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'" },
  ],
};

function rowFor(governing: ConsoleChangeOrder['governing'], component: ComponentRead | undefined) {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {};
  for (const stage of WORKFLOW.Stages) {
    stageSpaces[stageWhereSpace(stage)] =
      stage.Name === 'prod' ? [{ Space: { SpaceID: PROD } } as ExtendedSpaceRead] : [];
  }
  const spaces: ConsoleSpace[] = [
    { spaceId: BASE, slug: 'myapp-base', component },
    { spaceId: PROD, slug: 'myapp-prod', component },
  ];
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: [BASE],
      inScopeSpaceIds: [BASE, PROD],
      governing,
    },
    spaces,
    stageSpaces,
  );
}

test.describe('a ChangeOrder with no stage sequence has no path to draw or count', () => {
  test('no workflow governs it', () => {
    const row = rowFor({ state: 'ungoverned' }, COMPONENT);
    expect(hasPromotionPath(row)).toBe(false);
    expect(row.stages).toHaveLength(0);
    expect(row.stagesTotal).toBe(0);
    expect(row.blocker).toBe(changeOrdersConsoleCopy.noWorkflow);
  });

  test('the workflow is named but its rules did not come with the order', () => {
    const row = rowFor({ state: 'unresolved', changeWorkflowId: 'wf-1' }, COMPONENT);
    expect(hasPromotionPath(row)).toBe(false);
    expect(row.stagesTotal).toBe(0);
    expect(row.blocker).toBe(changeOrdersConsoleCopy.workflowUnavailable);
  });

});

test('a base Space with no component still has a path: stages select within the scope', () => {
  // A stage's Spaces are its selector among the ChangeOrder's in-scope Spaces,
  // so no component is needed to draw or count them.
  const row = rowFor({ state: 'governed', workflow: WORKFLOW, changeWorkflowId: 'wf-1' }, undefined);
  expect(hasPromotionPath(row)).toBe(true);
  expect(row.stagesTotal).toBe(4);
});

test('a ChangeOrder with stages has a path, and its total is every step of it', () => {
  const row = rowFor({ state: 'governed', workflow: WORKFLOW, changeWorkflowId: 'wf-1' }, COMPONENT);
  expect(hasPromotionPath(row)).toBe(true);
  // base, dev, prod and Complete.
  expect(row.stagesTotal).toBe(row.stages.length + 1);
  expect(row.stagesTotal).toBe(4);
});
