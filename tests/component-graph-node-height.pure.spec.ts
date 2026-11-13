// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A Deployment card with many status chips (live status, Stale, Unreleased
// changes, Warnings, Gated) grows taller than the slot the unfolded graph
// reserves for it. Once the card is measured, the layout gives it its own
// height, so the card below it moves down instead of being covered.
import { expect, test } from '@playwright/test';

import type { ComponentDeployment, Stage } from '../src/pages/x/apps/componentTypes';
import {
  computeComposerPosition,
  computeLandingSlotPosition,
} from '../src/pages/x/apps/flow-graph/composerLayout';
import {
  NODE_GAP,
  NODE_HEIGHT,
  computeLayout,
} from '../src/pages/x/apps/flow-graph/flowLayout';
import { computeSubtreeCenteredY } from '../src/pages/x/apps/flow-graph/treeCenterLayout';

const deployment = (
  id: string,
  parent: string | null,
  stage: number,
): ComponentDeployment => ({
  deploymentId: id,
  slug: id,
  displayName: id,
  type: parent ? 'Deployment' : 'Base',
  targets: [],
  parentDeploymentId: parent,
  stage,
  upgradeableCount: 0,
  unappliedCount: 0,
  unitCount: 1,
});

// base → preview, staging, prod: three stacked siblings, as in the graph where
// staging covered prod.
const deployments = [
  deployment('base', null, 0),
  deployment('preview', 'base', 1),
  deployment('staging', 'base', 1),
  deployment('prod', 'base', 1),
];
const stages: Stage[] = [
  { label: 'Base', depth: 0, deploymentIds: ['base'] },
  { label: 'Deployments', depth: 1, deploymentIds: ['preview', 'staging', 'prod'] },
];
const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
const noop = () => {};

const layoutNodes = (nodeHeightById?: ReadonlyMap<string, number>) =>
  computeLayout(
    deployments,
    stages,
    byId,
    new Set(),
    new Set(),
    noop,
    noop,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    nodeHeightById,
  ).nodes;

const layoutY = (nodeHeightById?: ReadonlyMap<string, number>): Map<string, number> =>
  new Map(layoutNodes(nodeHeightById).map((n) => [n.id, n.position.y]));

// A card with live status, a release chip and three wrapped config chips
// renders about 162 px tall, well past NODE_HEIGHT.
const TALL = 170;

test('a tall card pushes the card below it down by its own height', () => {
  const y = layoutY(new Map([['staging', TALL]]));
  expect(y.get('prod')! - y.get('staging')!).toBeGreaterThanOrEqual(TALL + NODE_GAP);
  expect(y.get('staging')! - y.get('preview')!).toBe(NODE_HEIGHT + NODE_GAP);
});

test('the parent stays centred on its children when one child is tall', () => {
  const y = layoutY(new Map([['staging', TALL]]));
  const childrenTop = y.get('preview')!;
  const childrenBottom = y.get('prod')! + NODE_HEIGHT;
  const baseCentre = y.get('base')! + NODE_HEIGHT / 2;
  expect(baseCentre).toBe((childrenTop + childrenBottom) / 2);
});

test('a card measured shorter than NODE_HEIGHT keeps the standard slot', () => {
  expect(layoutY(new Map([['staging', 90]]))).toEqual(layoutY());
});

test('a parent taller than its one child does not reach into the next tree', () => {
  const children = new Map([
    ['a', ['a1']],
    ['b', ['b1']],
  ]);
  const heights = new Map([['a', 300]]);
  const y = computeSubtreeCenteredY(
    ['a', 'a1', 'b', 'b1'],
    children,
    ['a', 'b'],
    100,
    20,
    0,
    (id) => heights.get(id) ?? 100,
  );
  expect(y.get('a')).toBe(0);
  expect(y.get('b')!).toBeGreaterThanOrEqual(300 + 20);
});

test('uniform heights lay out exactly as without a height function', () => {
  const children = new Map([
    ['r', ['c1', 'c2', 'c3']],
    ['c2', ['g1', 'g2']],
  ]);
  const ids = ['r', 'c1', 'c2', 'c3', 'g1', 'g2', 'r2'];
  const plain = computeSubtreeCenteredY(ids, children, ['r', 'r2'], 112, 30, 20);
  const withFn = computeSubtreeCenteredY(ids, children, ['r', 'r2'], 112, 30, 20, () => 112);
  expect(withFn).toEqual(plain);
});

test('the composer landing slot goes below a tall last sibling', () => {
  const heights = new Map([['prod', TALL]]);
  const nodes = layoutNodes(heights);
  const prodY = nodes.find((n) => n.id === 'prod')!.position.y;
  const slot = computeLandingSlotPosition(nodes, 'base', heights)!;
  expect(slot.y).toBe(prodY + TALL + NODE_GAP);
  // React Flow's own measurement counts when no height map is given.
  const measured = nodes.map((n) => (n.id === 'prod' ? { ...n, height: TALL } : n));
  expect(computeLandingSlotPosition(measured, 'base')!.y).toBe(prodY + TALL + NODE_GAP);
});

test('the composer yields below the full height of a tall card', () => {
  const heights = new Map([['prod', TALL]]);
  const y = layoutY(heights);
  const nodes = layoutNodes(heights);
  // Start the composer in prod's lane, at prod's top: it must clear prod's
  // measured bottom, not the NODE_HEIGHT slot.
  const prod = nodes.find((n) => n.id === 'prod')!;
  const pos = computeComposerPosition(
    nodes,
    { x: prod.position.x, y: y.get('prod')! },
    50,
    heights,
  );
  expect(pos.y).toBe(y.get('prod')! + TALL + NODE_GAP);
});
