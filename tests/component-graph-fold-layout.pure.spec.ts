// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Where a folded Component graph puts its nodes, and how Fit and the pan-only
// helpers move the viewport. The data is the Meridian demo the design was
// reviewed on: cert-manager must fit a 1440 x 900 screen (a 1224 x 796
// canvas) at a readable zoom. If that fails, the geometry differs from the
// reviewed design: fix the geometry, not the number.
import { expect, test } from '@playwright/test';

import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import {
  BLOCK_GAP,
  CARD_W,
  FIT_TOP,
  FOLD_GAP,
  FOLD_HEAD,
  FOLD_HEAD_CHIP_H,
  FOLD_HEAD_LINE_H,
  FOLD_HEAD_PAD_BOTTOM,
  FOLD_HEAD_PAD_TOP,
  FOLD_HEAD_ROW_GAP,
  READABLE_ZOOM_FLOOR,
  TREE_GAP,
  TREE_NODE_W,
} from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import { STAGE_GAP } from '../src/pages/x/apps/flow-graph/flowLayout';
import {
  type FoldLayout,
  type FoldLayoutNode,
  type FrozenFoldParams,
  computeFoldedLayout,
  foldFrameId,
} from '../src/pages/x/apps/flow-graph/fold/foldLayout';
import {
  type FoldModel,
  buildFoldModel,
  foldMembers,
  shouldFold,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  type Size,
  ensureVisibleViewport,
  hiddenBelowPx,
  panDownViewport,
  solveFoldedFit,
} from '../src/pages/x/apps/flow-graph/fold/foldViewport';
import { defaultGroupKey } from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { type MeridianComponentName, meridianComponent } from './fixtures/meridianFoldFixture';

const FOLDED: MeridianComponentName[] = [
  'cert-manager',
  'traefik',
  'checkout',
  'fraud-scoring',
];
/** 1440 x 900 minus the app shell. */
const SCREEN: Size = { width: 1224, height: 796 };
const NONE: ReadonlySet<string> = new Set();

function modelOf(deployments: ComponentDeployment[], groupKey?: string | null): FoldModel {
  const key = groupKey === undefined ? defaultGroupKey(foldMembers(deployments)) : groupKey;
  return buildFoldModel({ deployments, groupKey: key });
}

/** Fit, then return the model, the frozen params and the fitted layout. */
function fitted(
  deployments: ComponentDeployment[],
  container: Size,
  groupKey?: string | null,
) {
  const model = modelOf(deployments, groupKey);
  const fit = solveFoldedFit(
    (availableWidth) =>
      computeFoldedLayout(deployments, model, { availableWidth, expandedGroupIds: NONE }),
    container,
  );
  const layout = computeFoldedLayout(deployments, model, {
    availableWidth: fit.frozen.availableWidth,
    frozen: fit.frozen,
    expandedGroupIds: NONE,
  });
  return { model, fit, layout };
}

const byNodeId = (layout: FoldLayout): Map<string, FoldLayoutNode> =>
  new Map(layout.nodes.map((n) => [n.id, n]));

const intersects = (a: FoldLayoutNode, b: FoldLayoutNode): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const contains = (outer: FoldLayoutNode, inner: FoldLayoutNode): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** The frame a node is drawn inside, if any. */
function frameOf(node: FoldLayoutNode, layout: FoldLayout): FoldLayoutNode[] {
  const frames: FoldLayoutNode[] = [];
  const nodes = byNodeId(layout);
  const inFold =
    node.kind === 'stack' ||
    node.kind === 'expandFrame' ||
    node.placement === 'loose' ||
    node.placement === 'member';
  if (inFold && node.baseId) frames.push(nodes.get(foldFrameId(node.baseId))!);
  if (node.placement === 'member' && node.groupId) {
    frames.push(nodes.get(`frame:${node.groupId}`)!);
  }
  return frames;
}

/** Nodes overlap only where a frame holds its own cells and members. */
function expectNoOverlaps(layout: FoldLayout): void {
  for (const node of layout.nodes) {
    for (const frame of frameOf(node, layout)) {
      expect(frame, `frame of ${node.id}`).toBeDefined();
      expect(contains(frame, node), `${frame.id} holds ${node.id}`).toBe(true);
    }
  }
  const nodes = layout.nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!intersects(a, b)) continue;
      const nested = frameOf(a, layout).includes(b) || frameOf(b, layout).includes(a);
      expect(nested, `${a.id} overlaps ${b.id}`).toBe(true);
    }
  }
}

/** Each Deployment is drawn once: as a node, or inside a closed stack. */
function expectEachDeploymentOnce(
  deployments: ComponentDeployment[],
  model: FoldModel,
  layout: FoldLayout,
  expanded: ReadonlySet<string>,
): void {
  const seen = new Map<string, number>();
  const see = (id: string) => seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const node of layout.nodes) if (node.kind === 'deployment') see(node.id);
  for (const base of model.bases.values()) {
    for (const group of base.groups) {
      if (group.kind !== 'loose' && !expanded.has(group.id)) group.memberIds.forEach(see);
    }
  }
  for (const d of deployments) expect(seen.get(d.deploymentId), d.deploymentId).toBe(1);
  expect(seen.size).toBe(deployments.length);
}

const allStackIds = (model: FoldModel): Set<string> =>
  new Set(
    [...model.bases.values()].flatMap((b) =>
      b.groups.filter((g) => g.kind !== 'loose').map((g) => g.id),
    ),
  );

test.describe('the folded layout of every folded Meridian Component', () => {
  test('fraud-scoring (14 Deployments) folds, and keeps today’s layout with ?graphGroup=off', () => {
    expect(shouldFold(meridianComponent('fraud-scoring'))).toBe(true);
    expect(shouldFold(meridianComponent('fraud-scoring'), 'off')).toBe(false);
  });

  for (const name of FOLDED) {
    test(`${name}: no overlaps, and each Deployment drawn once`, () => {
      const deployments = meridianComponent(name);
      expect(shouldFold(deployments)).toBe(true);
      for (const groupKey of [undefined, 'Region', 'Department', null]) {
        const { model, fit, layout } = fitted(deployments, SCREEN, groupKey);
        expectNoOverlaps(layout);
        expectEachDeploymentOnce(deployments, model, layout, NONE);

        const expanded = allStackIds(model);
        const open = computeFoldedLayout(deployments, model, {
          availableWidth: fit.frozen.availableWidth,
          frozen: fit.frozen,
          expandedGroupIds: expanded,
        });
        expectNoOverlaps(open);
        expectEachDeploymentOnce(deployments, model, open, expanded);

        for (const width of [700, 2400]) {
          const free = computeFoldedLayout(deployments, model, {
            availableWidth: width,
            expandedGroupIds: NONE,
          });
          expectNoOverlaps(free);
        }
      }
    });
  }
});

test.describe('cert-manager geometry', () => {
  const deployments = meridianComponent('cert-manager');

  test('the Base tree is compact and each block starts right of its Base', () => {
    const { layout } = fitted(deployments, SCREEN);
    const nodes = byNodeId(layout);
    expect(nodes.get('base')).toMatchObject({
      x: 0,
      placement: 'tree',
      width: 132,
      height: 56,
    });
    for (const env of ['dev', 'test', 'uat', 'prod']) {
      expect(nodes.get(env)).toMatchObject({ x: TREE_NODE_W + TREE_GAP, placement: 'tree' });
    }
    const blockX = TREE_NODE_W + TREE_GAP + TREE_NODE_W + BLOCK_GAP;
    // dev and test have no cards, so their folds start where cards would.
    expect(nodes.get(foldFrameId('dev'))!.x).toBe(blockX);
    expect(nodes.get(foldFrameId('test'))!.x).toBe(blockX);
    // uat has one card, so its fold starts right of one card column.
    expect(nodes.get('us-east-retail-uat1')).toMatchObject({ x: blockX, placement: 'card' });
    expect(nodes.get(foldFrameId('uat'))!.x).toBe(blockX + CARD_W + FOLD_GAP);
    // A card beside a fold starts below the fold's header line.
    expect(nodes.get('us-east-retail-uat1')!.y).toBe(
      nodes.get(foldFrameId('uat'))!.y + nodes.get(foldFrameId('uat'))!.headerHeight!,
    );
  });

  test('the edge between columns is as roomy as the unfolded graph: at least STAGE_GAP', () => {
    expect(TREE_GAP).toBeGreaterThanOrEqual(STAGE_GAP);
    expect(BLOCK_GAP).toBeGreaterThanOrEqual(STAGE_GAP);
    const { layout } = fitted(deployments, SCREEN);
    const nodes = byNodeId(layout);
    const gap = (from: FoldLayoutNode, to: FoldLayoutNode) => to.x - (from.x + from.width);
    const base = nodes.get('base')!;
    for (const env of ['dev', 'test', 'uat', 'prod']) {
      const tree = nodes.get(env)!;
      expect(gap(base, tree), `base to ${env}`).toBeGreaterThanOrEqual(STAGE_GAP);
      for (const n of layout.nodes) {
        if (n.baseId !== env || n.placement === 'tree') continue;
        if (n.kind === 'foldFrame' || n.placement === 'card') {
          expect(gap(tree, n), `${env} to ${n.id}`).toBeGreaterThanOrEqual(STAGE_GAP);
        }
      }
    }
  });

  test('bands run top to bottom, and each Base sits in the middle of its band', () => {
    const { layout } = fitted(deployments, SCREEN);
    const nodes = byNodeId(layout);
    const folds = ['dev', 'test', 'uat', 'prod'].map((env) => nodes.get(foldFrameId(env))!);
    expect(folds[0].y).toBe(20);
    for (let i = 1; i < folds.length; i++) {
      expect(folds[i].y).toBe(folds[i - 1].y + folds[i - 1].height + 16);
    }
    for (const fold of folds) {
      const base = nodes.get(fold.baseId!)!;
      expect(base.y + base.height / 2).toBe(fold.y + fold.height / 2);
    }
    const root = nodes.get('base')!;
    const last = folds[folds.length - 1];
    expect(root.y + 28).toBe((folds[0].y + last.y + last.height) / 2);
  });

  test('one edge from a Base into its fold; no edge to a stacked or loose Deployment', () => {
    const { model, layout } = fitted(deployments, SCREEN);
    const edgeIds = layout.edges.map((e) => e.id).sort();
    const folds = layout.edges.filter((e) => e.kind === 'fold');
    expect(folds.map((e) => [e.source, e.target])).toEqual(
      ['dev', 'test', 'uat', 'prod'].map((env) => [env, foldFrameId(env)]),
    );
    const cards = [...model.bases.values()].flatMap((b) =>
      b.cards.map((c) => `edge-${b.baseId}-${c.id}`),
    );
    const tree = ['dev', 'test', 'uat', 'prod'].map((env) => `edge-base-${env}`);
    expect(edgeIds).toEqual([...cards, ...tree, ...folds.map((e) => e.id)].sort());
  });
});

test.describe('Fit', () => {
  test('cert-manager by Department fits a 1440 x 900 screen at a readable zoom', () => {
    const { fit, layout } = fitted(meridianComponent('cert-manager'), SCREEN, 'Department');
    expect(fit.tall).toBe(false);
    expect(fit.viewport.zoom).toBeGreaterThanOrEqual(READABLE_ZOOM_FLOOR);
    expect(fit.viewport.zoom).toBeGreaterThanOrEqual(0.84);
    expect(fit.viewport.zoom).toBeLessThanOrEqual(1);
    const { zoom } = fit.viewport;
    expect(layout.height * zoom).toBeLessThanOrEqual(SCREEN.height - FIT_TOP - 28);
    expect(layout.width * zoom).toBeLessThanOrEqual(SCREEN.width - 36 + 1);
    // Centred in the space left over.
    expect(fit.viewport.x).toBeCloseTo(18 + (SCREEN.width - 36 - layout.width * zoom) / 2, 6);
    expect(fit.viewport.y).toBeCloseTo(
      FIT_TOP + (SCREEN.height - FIT_TOP - 28 - layout.height * zoom) / 2,
      6,
    );
  });

  test('the first zoom that fits wins; a lower zoom gives more stack columns', () => {
    const deployments = meridianComponent('cert-manager');
    const model = modelOf(deployments, 'Department');
    const at = (w: number) =>
      computeFoldedLayout(deployments, model, { availableWidth: w, expandedGroupIds: NONE });
    const fit = solveFoldedFit(at, SCREEN);
    const larger = Math.round((fit.viewport.zoom + 0.01) * 100) / 100;
    const tooBig = at((SCREEN.width - 36) / larger);
    expect(
      tooBig.height * larger > SCREEN.height - FIT_TOP - 28 ||
        tooBig.width * larger > SCREEN.width - 35,
    ).toBe(true);
    const narrow = at(900).frozen.stackColumnsByBase;
    const wide = at(2400).frozen.stackColumnsByBase;
    for (const [baseId, columns] of narrow) {
      expect(wide.get(baseId)!).toBeGreaterThanOrEqual(columns);
    }
  });

  test('a graph that does not fit at 80% shows its top at 80%', () => {
    for (const [groupKey, container] of [
      ['Department', { width: 1064, height: 500 }],
      ['Region', { width: 1064, height: 696 }],
    ] as const) {
      const { fit } = fitted(meridianComponent('cert-manager'), container, groupKey);
      expect(fit.tall, groupKey).toBe(true);
      expect(fit.viewport.zoom).toBe(0.8);
      expect(fit.viewport.y).toBe(FIT_TOP);
      expect(fit.frozen.availableWidth).toBeCloseTo((container.width - 36) / 0.8, 6);
    }
  });
});

test.describe('expanding a stack in place', () => {
  const deployments = meridianComponent('cert-manager');
  const { model, fit, layout } = fitted(deployments, SCREEN, 'Department');
  const prodStacks = model.bases.get('prod')!.groups.filter((g) => g.kind !== 'loose');

  test('cells before it keep their place; everything after moves down only', () => {
    // The first prod stack, so later cells exist to move down.
    const stack = prodStacks[0];
    const before = byNodeId(layout);
    const stackNode = before.get(stack.id)!;
    const expanded = new Set([stack.id]);
    const open = computeFoldedLayout(deployments, model, {
      availableWidth: fit.frozen.availableWidth,
      frozen: fit.frozen,
      expandedGroupIds: expanded,
    });
    const after = byNodeId(open);

    let movedDown = 0;
    for (const node of layout.nodes) {
      const now = after.get(node.id)!;
      expect(now.x, node.id).toBe(node.x);
      // Tree nodes re-centre on their grown band, so they are only held to "down".
      const isBlockNodeUpToTheStackRow = node.placement !== 'tree' && node.y <= stackNode.y;
      if (isBlockNodeUpToTheStackRow) {
        expect(now.y, node.id).toBe(node.y);
      } else {
        expect(now.y, node.id).toBeGreaterThanOrEqual(node.y);
        if (now.y > node.y) movedDown++;
      }
    }
    expect(movedDown).toBeGreaterThan(0);

    const frame = after.get(`frame:${stack.id}`)!;
    expect(frame.y).toBeGreaterThan(stackNode.y + stackNode.height);
    for (const id of stack.memberIds) {
      expect(after.get(id)).toMatchObject({ placement: 'member', groupId: stack.id });
    }
    expect(open.frozen.stackColumnsByBase).toEqual(fit.frozen.stackColumnsByBase);
    expect(open.frozen.cardColumnsByBase).toEqual(fit.frozen.cardColumnsByBase);
  });

  test('its frame spans the fold and holds its members in the fold’s columns', () => {
    const stack = prodStacks[prodStacks.length - 1];
    const open = computeFoldedLayout(deployments, model, {
      availableWidth: fit.frozen.availableWidth,
      frozen: fit.frozen,
      expandedGroupIds: new Set([stack.id]),
    });
    const nodes = byNodeId(open);
    const fold = nodes.get(foldFrameId('prod'))!;
    const frame = nodes.get(`frame:${stack.id}`)!;
    expect(frame.x).toBe(fold.x + 2);
    expect(frame.width).toBe(fold.width - 4);
    const columns = fit.frozen.stackColumnsByBase.get('prod')!;
    const xs = new Set(stack.memberIds.map((id) => nodes.get(id)!.x));
    expect(xs.size).toBe(Math.min(columns, stack.memberIds.length));
  });
});

test.describe('frozen columns', () => {
  const deployments = meridianComponent('cert-manager');

  test('a much narrower width does not move any card or stack', () => {
    const { model, fit, layout } = fitted(deployments, SCREEN, 'Department');
    const narrow = computeFoldedLayout(deployments, model, {
      availableWidth: 300,
      frozen: fit.frozen,
      expandedGroupIds: NONE,
    });
    const before = byNodeId(layout);
    expect(narrow.nodes.length).toBe(layout.nodes.length);
    for (const node of narrow.nodes) {
      expect([node.x, node.y], node.id).toEqual([
        before.get(node.id)!.x,
        before.get(node.id)!.y,
      ]);
    }
    const free = computeFoldedLayout(deployments, model, {
      availableWidth: 300,
      expandedGroupIds: NONE,
    });
    expect(free.nodes.some((n) => n.x !== before.get(n.id)?.x)).toBe(true);
  });

  test('a poll that breaks a quiet prod member adds a card and moves no stack sideways', () => {
    const { fit, layout } = fitted(deployments, SCREEN, 'Department');
    const model = modelOf(deployments, 'Department');
    // A member of a stack that keeps two or more members after it leaves.
    const stack = model.bases
      .get('prod')!
      .groups.find((g) => g.kind === 'stack' && g.memberIds.length >= 3)!;
    const broken = stack.memberIds[0];
    const polled = deployments.map((d) =>
      d.deploymentId === broken
        ? { ...d, liveStatus: { ...d.liveStatus!, Health: 'Degraded' as const } }
        : d,
    );
    const next = modelOf(polled, 'Department');
    expect(next.location.get(broken)?.kind).toBe('card');

    const after = computeFoldedLayout(polled, next, {
      availableWidth: fit.frozen.availableWidth,
      frozen: fit.frozen,
      expandedGroupIds: NONE,
    });
    const nodes = byNodeId(after);
    let stacks = 0;
    for (const node of layout.nodes) {
      if (node.kind !== 'stack' && node.placement !== 'loose') continue;
      const now = nodes.get(node.id);
      if (!now) continue;
      stacks++;
      expect(now.x, node.id).toBe(node.x);
    }
    expect(stacks).toBeGreaterThan(0);
    expect(nodes.get(foldFrameId('prod'))!.x).toBe(
      byNodeId(layout).get(foldFrameId('prod'))!.x,
    );
    expect(nodes.get(broken)).toMatchObject({ placement: 'card', baseId: 'prod' });
    expectNoOverlaps(after);
  });

  test('a first card in a Base that had none pushes its fold down, never right', () => {
    const { fit, layout } = fitted(deployments, SCREEN, 'Department');
    expect(fit.frozen.cardColumnsByBase.get('test')).toBe(0);
    // The loose card of the test Base breaks: it becomes the Base's first card.
    const broken = 'eu-central-logistics-test1';
    const polled = deployments.map((d) =>
      d.deploymentId === broken
        ? { ...d, liveStatus: { ...d.liveStatus!, Sync: 'OutOfSync' as const } }
        : d,
    );
    const next = modelOf(polled, 'Department');
    const after = computeFoldedLayout(polled, next, {
      availableWidth: fit.frozen.availableWidth,
      frozen: fit.frozen,
      expandedGroupIds: NONE,
    });
    const before = byNodeId(layout);
    const now = byNodeId(after);
    const foldBefore = before.get(foldFrameId('test'))!;
    const foldAfter = now.get(foldFrameId('test'))!;
    expect(foldAfter.x).toBe(foldBefore.x);
    expect(foldAfter.width).toBe(foldBefore.width);
    expect(foldAfter.y).toBeGreaterThan(foldBefore.y);

    const card = now.get(broken)!;
    expect(card).toMatchObject({ placement: 'card', x: foldBefore.x, y: foldBefore.y });
    expect(card.y + card.height).toBeLessThanOrEqual(foldAfter.y);

    // Its old cell stays empty, so the three stacks keep their columns.
    for (const group of next.bases.get('test')!.groups) {
      expect(now.get(group.id)!.x, group.id).toBe(before.get(group.id)!.x);
    }
    expect(after.frozen.cardColumnsByBase.get('test')).toBe(0);
    expectNoOverlaps(after);
  });
});

test.describe('fold header', () => {
  test('two waves go on a row below the values on a narrow fold, and beside them on a wide one', () => {
    const deployments = meridianComponent('checkout');
    const model = modelOf(deployments, 'Region');
    expect(model.bases.get('prod')!.waves.length).toBe(2);
    const at = (w: number) =>
      byNodeId(
        computeFoldedLayout(deployments, model, { availableWidth: w, expandedGroupIds: NONE }),
      ).get(foldFrameId('prod'))!;
    const narrow = at(1000);
    expect(narrow.chipsBeside).toBe(false);
    // At this width the Stale and Unreleased chips take a row each.
    expect(narrow.headerHeight).toBe(
      FOLD_HEAD_PAD_TOP +
        narrow.headerLines! * FOLD_HEAD_LINE_H +
        2 * (FOLD_HEAD_ROW_GAP + FOLD_HEAD_CHIP_H) +
        FOLD_HEAD_PAD_BOTTOM,
    );
    const wide = at(2400);
    expect(wide.chipsBeside).toBe(true);
    expect(wide.headerLines).toBe(1);
    expect(wide.headerHeight).toBe(FOLD_HEAD);
  });
});

test.describe('viewport helpers', () => {
  const container: Size = { width: 1000, height: 600 };
  // Visible box: left 18, top FIT_TOP, right 982, bottom 572.

  test('hiddenBelowPx measures what is below the cue line', () => {
    expect(hiddenBelowPx({ x: 0, y: 14, zoom: 0.8 }, 1000, container)).toBeCloseTo(242, 6);
    expect(hiddenBelowPx({ x: 0, y: 14, zoom: 0.5 }, 1000, container)).toBe(0);
  });

  test('panDownViewport pans by what is hidden, at most 80% of the view', () => {
    const first = panDownViewport({ x: 5, y: 14, zoom: 0.8 }, 1000, container);
    expect(first).toEqual({ x: 5, y: 14 - 254, zoom: 0.8 });
    expect(hiddenBelowPx(first, 1000, container)).toBe(0);
    const same = { x: 5, y: -240, zoom: 0.8 };
    expect(panDownViewport(same, 1000, container)).toBe(same);
    const long = panDownViewport({ x: 0, y: 14, zoom: 0.8 }, 3000, container);
    expect(long.y).toBeCloseTo(14 - (600 - FIT_TOP - 28) * 0.8, 6);
    expect(long.zoom).toBe(0.8);
  });

  test('ensureVisibleViewport pans only, and only when needed', () => {
    const view = { x: 0, y: 0, zoom: 1 };
    const card = { width: 226, height: 84 };
    expect(ensureVisibleViewport({ x: 100, y: 100, ...card }, view, container)).toBeNull();
    // Below: the least pan that shows its bottom edge.
    expect(ensureVisibleViewport({ x: 100, y: 600, ...card }, view, container)).toEqual({
      x: 0,
      y: 572 - 684,
      zoom: 1,
    });
    // Left of the view.
    expect(ensureVisibleViewport({ x: -50, y: 100, ...card }, view, container)).toEqual({
      x: 68,
      y: 0,
      zoom: 1,
    });
    // Centred.
    expect(
      ensureVisibleViewport({ x: 100, y: 600, ...card }, view, container, { center: true }),
    ).toEqual({ x: 500 - 213, y: (FIT_TOP + 572) / 2 - 642, zoom: 1 });
    // Taller than the view: its top goes just under the top edge.
    expect(
      ensureVisibleViewport({ x: 100, y: 600, width: 226, height: 800 }, view, container),
    ).toEqual({ x: 0, y: FIT_TOP + 8 - 600, zoom: 1 });
    // The zoom never changes.
    expect(
      ensureVisibleViewport(
        { x: 100, y: 1200, ...card },
        { x: 0, y: 0, zoom: 0.5 },
        container,
      ),
    ).toEqual({ x: 0, y: 572 - 642, zoom: 0.5 });
  });
});

test('frozen params round-trip through a layout unchanged', () => {
  const deployments = meridianComponent('traefik');
  const { fit, layout } = fitted(deployments, SCREEN);
  const again: FrozenFoldParams = layout.frozen;
  expect(again.availableWidth).toBe(fit.frozen.availableWidth);
  expect(again.cardColumnsByBase).toEqual(fit.frozen.cardColumnsByBase);
  expect(again.stackColumnsByBase).toEqual(fit.frozen.stackColumnsByBase);
  expect(again.cellOrderByBase).toEqual(fit.frozen.cellOrderByBase);
  expect(again.headerLinesByBase).toEqual(fit.frozen.headerLinesByBase);
});
