// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What a folded Component graph draws: the names a stack previews, the
// reactflow nodes and edges the folded layout becomes, and a check that the
// unfolded layout (Group by Off, or fewer than 10 Deployments) did not move when its card
// builder was shared with the folded one.
import type { Edge, Node } from 'reactflow';

import { expect, test } from '@playwright/test';

import { componentTheme } from '../src/pages/x/apps/componentTheme';
import type { ComponentDeployment, Stage } from '../src/pages/x/apps/componentTypes';
import type { DeploymentFlowNodeData } from '../src/pages/x/apps/flow-graph/DeploymentFlowNode';
import { computeLayout } from '../src/pages/x/apps/flow-graph/flowLayout';
import { computeFoldedLayout } from '../src/pages/x/apps/flow-graph/fold/foldLayout';
import {
  buildFoldModel,
  foldMembers,
  shouldFold,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  type ExpandFrameNodeData,
  type FoldElementsContext,
  type FoldFrameNodeData,
  type StackNodeData,
  toFlowElements,
} from '../src/pages/x/apps/flow-graph/fold/foldNodes';
import { solveFoldedFit } from '../src/pages/x/apps/flow-graph/fold/foldViewport';
import { defaultGroupKey } from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { stackToggleLabel, stripSummary } from '../src/pages/x/apps/flow-graph/fold/markStyle';
import {
  NAMES_SEPARATOR,
  fitNamesPreview,
  moreLabel,
} from '../src/pages/x/apps/flow-graph/fold/namePreview';
import { waveKey } from '../src/pages/x/apps/flow-graph/fold/waveActions';
import { meridianComponent } from './fixtures/meridianFoldFixture';

// ── fitNamesPreview ─────────────────────────────────────────────────────────

/** A fake font: every character is 8 px wide. */
const measure = (text: string): number => text.length * 8;
const lineWidth = (shown: readonly string[]): number => measure(shown.join(NAMES_SEPARATOR));

test.describe('fitNamesPreview', () => {
  test('shows whole names in order, then a "+N" that fits', () => {
    const names = ['alpha', 'beta', 'gamma', 'delta'];
    expect(fitNamesPreview(names, 100, measure)).toEqual({ shown: ['alpha'], more: 3 });
    expect(fitNamesPreview(names, 120, measure)).toEqual({
      shown: ['alpha', 'beta'],
      more: 2,
    });
    // alpha, beta, gamma, delta = 200 px exactly: no room is kept for a "+N"
    // that is not needed.
    expect(fitNamesPreview(names, 200, measure)).toEqual({ shown: names, more: 0 });
  });

  test('always shows at least one name, even one wider than the line', () => {
    const names = ['ap-northeast-logistics-prod1', 'us-west-logistics-prod1'];
    expect(fitNamesPreview(names, 40, measure)).toEqual({ shown: [names[0]], more: 1 });
    expect(fitNamesPreview([], 200, measure)).toEqual({ shown: [], more: 0 });
  });

  test('never cuts a name, and "+N" fits after the last name for every width', () => {
    const names = [
      'ap-northeast-retail-prod1',
      'ap-northeast-retail-prod2',
      'eu-central-retail-prod1',
      'eu-north-retail-prod1',
      'sa-east-retail-prod1',
      'us-east-retail-prod1',
      'us-east-retail-prod2',
      'us-west-retail-prod1',
    ];
    for (let maxWidth = 40; maxWidth <= 1400; maxWidth += 7) {
      const { shown, more } = fitNamesPreview(names, maxWidth, measure);
      expect(shown.length).toBeGreaterThanOrEqual(1);
      // Whole names, in their order: the preview is a prefix of the list.
      expect(shown).toEqual(names.slice(0, shown.length));
      expect(more).toBe(names.length - shown.length);
      if (more === 0) continue;
      if (measure(names[0]) + measure(moreLabel(names.length - 1)) <= maxWidth) {
        expect(lineWidth(shown) + measure(moreLabel(more))).toBeLessThanOrEqual(maxWidth);
      }
      // As many as fit: one more name (with its own "+N") would not.
      const next = [...shown, names[shown.length]];
      const reserve = more - 1 > 0 ? measure(moreLabel(more - 1)) : 0;
      expect(lineWidth(next) + reserve).toBeGreaterThan(maxWidth);
    }
  });
});

// ── toFlowElements ──────────────────────────────────────────────────────────

const SCREEN = { width: 1224, height: 796 };
const NONE: ReadonlySet<string> = new Set();

function foldedElements(
  deployments: ComponentDeployment[],
  opts: {
    expanded?: ReadonlySet<string>;
    selected?: ReadonlySet<string>;
    runningWaveKeys?: ReadonlySet<string>;
  } = {},
) {
  const model = buildFoldModel({
    deployments,
    groupKey: defaultGroupKey(foldMembers(deployments)),
  });
  const fit = solveFoldedFit(
    (availableWidth) =>
      computeFoldedLayout(deployments, model, { availableWidth, expandedGroupIds: NONE }),
    SCREEN,
  );
  const expanded = opts.expanded ?? NONE;
  const layout = computeFoldedLayout(deployments, model, {
    availableWidth: fit.frozen.availableWidth,
    frozen: fit.frozen,
    expandedGroupIds: expanded,
  });
  const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
  const selected = opts.selected ?? NONE;
  const ctx: FoldElementsContext = {
    node: {
      selectedDeploymentIds: selected,
      activeUpgrades: NONE,
      onDeploymentToggle: () => {},
      onUpgradeToggle: () => {},
    },
    edge: { selectedDeploymentIds: selected, activeUpgrades: NONE, deploymentById: byId },
    expandedGroupIds: expanded,
    onToggleStack: () => {},
    runningWaveKeys: opts.runningWaveKeys,
  };
  return { model, layout, ...toFlowElements(layout, model, byId, ctx) };
}

const ofType = (nodes: Node[], type: string) => nodes.filter((n) => n.type === type);
const deploymentData = (n: Node) => n.data as DeploymentFlowNodeData;
const foldEdges = (edges: Edge[]) => edges.filter((e) => e.id.startsWith('foldedge-'));

test.describe('toFlowElements (cert-manager)', () => {
  const deployments = meridianComponent('cert-manager');

  test('every Deployment is drawn once, as a node or as a stack member', () => {
    const { nodes } = foldedElements(deployments);
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const drawn = new Set(ofType(nodes, 'deploymentNode').map((n) => n.id));
    for (const stack of ofType(nodes, 'stackNode')) {
      const data = stack.data as StackNodeData;
      expect(data.marks).toHaveLength(data.count);
    }
    const stacked = ofType(nodes, 'stackNode').reduce(
      (n, s) => n + (s.data as StackNodeData).count,
      0,
    );
    expect(drawn.size + stacked).toBe(deployments.length);
  });

  test('one edge from each Base into its fold, none to a folded Deployment', () => {
    const { model, edges } = foldedElements(deployments);
    const folds = foldEdges(edges);
    expect(folds.map((e) => e.source).sort()).toEqual(['dev', 'prod', 'test', 'uat']);
    for (const e of folds) {
      expect(e.type).toBe('smoothstep');
      expect(e.target).toBe(`fold:${e.source}`);
      expect(e.style).toMatchObject({
        strokeDasharray: '5 4',
        stroke: componentTheme.borderDefault,
      });
    }
    for (const e of edges) {
      const loc = model.location.get(e.target);
      if (loc) expect(loc.kind).toBe('card');
    }
    // Promotion edges keep the unfolded edge's shape, so PromotionEdge works.
    const promotion = edges.filter((e) => e.type === 'promotionEdge');
    expect(promotion.length).toBeGreaterThan(0);
    for (const e of promotion) expect(e.data).toHaveProperty('targetLabel');
  });

  test('tree nodes are compact and say how many variants are downstream, at every depth', () => {
    const { nodes, model } = foldedElements(deployments);
    const variantCounts = (ns: Node[]) =>
      new Map(ofType(ns, 'deploymentNode').map((n) => [n.id, deploymentData(n)]));
    const byId = variantCounts(nodes);
    // The root counts its 4 class Bases as well as the 99 Deployments under them.
    expect(byId.get('base')).toMatchObject({ density: 'tree', variantCount: 103 });
    expect(byId.get('prod')).toMatchObject({ density: 'tree', variantCount: 55 });
    expect(byId.get('dev')).toMatchObject({ density: 'tree', variantCount: 16 });

    // The count comes from the tree, not the fold: an open stack does not change it.
    const retail = model.bases.get('prod')!.groups.find((g) => g.label === 'retail')!;
    const opened = variantCounts(
      foldedElements(deployments, { expanded: new Set([retail.id]) }).nodes,
    );
    for (const id of ['base', 'prod', 'dev']) {
      expect(opened.get(id)?.variantCount).toBe(byId.get(id)?.variantCount);
    }
  });

  test('cards are compact and do not repeat their Base wave', () => {
    const { nodes, model } = foldedElements(deployments);
    const prodCards = model.bases.get('prod')!.cards.map((c) => c.id);
    expect(prodCards.length).toBeGreaterThan(0);
    for (const id of prodCards) {
      const data = deploymentData(nodes.find((n) => n.id === id)!);
      expect(data).toMatchObject({ density: 'compact', width: 240 });
      expect(data.suppressedConditions).toEqual(['stale']);
    }
    // The prod wave is Stale, so no prod strip paints Stale.
    for (const stack of ofType(nodes, 'stackNode')) {
      const data = stack.data as StackNodeData;
      if (data.groupId.startsWith('stack:prod:')) expect(data.marks).not.toContain('stale');
    }
    // dev has no wave: its cards and loose cards suppress nothing.
    for (const n of ofType(nodes, 'deploymentNode')) {
      if (model.location.get(n.id)?.baseId === 'dev') {
        expect(deploymentData(n).suppressedConditions).toBeUndefined();
      }
    }
  });

  test('an open stack is a frame of compact member cards, opened by you', () => {
    const { model } = foldedElements(deployments);
    const retail = model.bases.get('prod')!.groups.find((g) => g.label === 'retail')!;
    const { nodes } = foldedElements(deployments, { expanded: new Set([retail.id]) });
    const frame = nodes.find((n) => n.id === `frame:${retail.id}`)!;
    expect(frame.type).toBe('expandFrameNode');
    expect(frame.zIndex).toBe(-1);
    expect(frame.data as ExpandFrameNodeData).toMatchObject({
      label: 'retail',
      count: retail.memberIds.length,
      groupLabel: 'Department',
      baseName: 'prod',
      openedBy: 'you',
    });
    for (const id of retail.memberIds) {
      const member = nodes.find((n) => n.id === id)!;
      expect(deploymentData(member)).toMatchObject({ density: 'compact', width: 226 });
    }
    const stack = nodes.find((n) => n.id === retail.id)!;
    expect((stack.data as StackNodeData).expanded).toBe(true);
  });

  test('the fold edge lights up when the selected Deployment is in that fold', () => {
    const { model } = foldedElements(deployments);
    const member = model.bases.get('prod')!.groups.find((g) => g.kind === 'stack')!
      .memberIds[0];
    const { edges } = foldedElements(deployments, { selected: new Set([member]) });
    const lit = foldEdges(edges).filter((e) => e.style?.stroke === componentTheme.done);
    expect(lit.map((e) => e.source)).toEqual(['prod']);
    expect(lit[0].style).toMatchObject({ strokeWidth: 2.5, strokeDasharray: undefined });
  });
});

// ── The unfolded layout is unchanged ────────────────────────────────────────

test('fraud-scoring with ?graphGroup=off does not fold, and its layout is as before', () => {
  const deployments = meridianComponent('fraud-scoring');
  expect(shouldFold(deployments, 'off')).toBe(false);
  const depths = [...new Set(deployments.map((d) => d.stage))].sort((a, b) => a - b);
  const stages: Stage[] = depths.map((depth) => ({
    label: String(depth),
    depth,
    deploymentIds: [],
  }));
  const { nodes, edges } = computeLayout(
    deployments,
    stages,
    new Map(deployments.map((d) => [d.deploymentId, d])),
    new Set(),
    new Set(),
    () => {},
    () => {},
  );
  expect(nodes.map((n) => [n.id, n.position.x, n.position.y])).toEqual([
    ['base', 0, 588],
    ['uat', 360, 91],
    ['prod', 360, 1085],
    ['ap-southeast-payments-prod1', 720, 304],
    ['ap-southeast-payments-prod2', 720, 446],
    ['eu-central-payments-prod1', 720, 588],
    ['eu-central-payments-prod2', 720, 730],
    ['eu-central-payments-prod3', 720, 872],
    ['eu-central-payments-uat1', 720, 20],
    ['eu-west-payments-prod1', 720, 1014],
    ['eu-west-payments-prod2', 720, 1156],
    ['us-east-payments-prod1', 720, 1298],
    ['us-east-payments-prod2', 720, 1440],
    ['us-east-payments-prod3', 720, 1582],
    ['us-east-payments-uat1', 720, 162],
    ['us-west-payments-prod1', 720, 1724],
    ['us-west-payments-prod2', 720, 1866],
  ]);
  // Every node is a full card, as before: no density, width or suppression.
  for (const n of nodes) {
    const data = deploymentData(n);
    expect(data.density).toBeUndefined();
    expect(data.width).toBeUndefined();
    expect(data.suppressedConditions).toBeUndefined();
  }
  expect(edges).toHaveLength(deployments.length - 1);
  for (const e of edges) {
    expect(e).toMatchObject({
      type: 'promotionEdge',
      style: {
        stroke: componentTheme.borderDefault,
        strokeWidth: 1.5,
        strokeDasharray: '5 4',
      },
      animated: false,
      zIndex: 0,
    });
  }
});

test("a stack previews its members' Deployment names, never its own label", () => {
  const deployments = meridianComponent('cert-manager');
  const { model, nodes } = foldedElements(deployments);
  const groupById = new Map(
    [...model.bases.values()].flatMap((base) => base.groups.map((g) => [g.id, g] as const)),
  );
  const nameById = new Map(deployments.map((d) => [d.deploymentId, d.displayName]));
  const stacks = ofType(nodes, 'stackNode')
    .map((n) => n.data as StackNodeData)
    .filter((data) => groupById.get(data.groupId)?.kind === 'stack');
  expect(stacks.length).toBeGreaterThan(0);
  for (const data of stacks) {
    const members = groupById.get(data.groupId)!.memberIds;
    expect(data.previewNames).toEqual(members.map((id) => nameById.get(id)));
    expect(data.previewNames).not.toContain(data.label);
  }
});

test.describe('a wave whose bulk action is running', () => {
  // A second "Upgrade 55" while the first is still in flight would upgrade
  // the same Units again, so only the running wave's button is disabled.
  const deployments = meridianComponent('cert-manager');
  const frames = (keys?: ReadonlySet<string>) =>
    ofType(foldedElements(deployments, { runningWaveKeys: keys }).nodes, 'foldFrameNode').map(
      (n) => n.data as FoldFrameNodeData,
    );

  test('nothing runs: no frame marks a wave', () => {
    for (const frame of frames()) expect(frame.runningConditions).toEqual([]);
  });

  test('only the wave that runs is marked, on its own Base', () => {
    const prod = frames().find((f) =>
      f.waves.some((w) => w.condition === 'stale' && w.count === 55),
    )!;
    const marked = frames(new Set([waveKey(prod.baseId, 'stale')]));
    for (const frame of marked) {
      expect(frame.runningConditions, frame.baseId).toEqual(
        frame.baseId === prod.baseId ? ['stale'] : [],
      );
    }
  });
});

test.describe('the words a stack gives assistive technology', () => {
  test('each caret button names its stack and its size', () => {
    expect(stackToggleLabel(false, 'retail', 13)).toBe('Expand stack retail, 13 Deployments');
    expect(stackToggleLabel(true, 'retail', 13)).toBe('Collapse stack retail, 13 Deployments');
    expect(stackToggleLabel(false, 'No department', 1)).toBe(
      'Expand stack No department, 1 Deployment',
    );
  });

  test('two stacks never share a button name', () => {
    expect(stackToggleLabel(false, 'retail', 13)).not.toBe(
      stackToggleLabel(false, 'logistics', 13),
    );
  });

  test('the strip lists each status with its count, in the order met', () => {
    expect(stripSummary(['degraded', 'degraded', 'quiet', 'unreleased', 'quiet'])).toBe(
      '2 Degraded, 2 Quiet, 1 Unreleased changes',
    );
  });
});
