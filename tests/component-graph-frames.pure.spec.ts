// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A graph that spans several Components (a click on an Owner group in the left
// nav) draws each Component's tree in a labelled frame, and names the Component
// on every Base. Every Component's Bases are called "base", "dev", "prod", so
// without both the trees cannot be told apart. A graph of one Component must
// stay exactly as it was.
import { expect, test } from '@playwright/test';
import type { Node } from 'reactflow';

import type { ComponentDeployment, Stage } from '../src/pages/x/apps/componentTypes';
import {
  FRAME_GAP,
  FRAME_HEADER_H,
  FRAME_PAD_BOTTOM,
  FRAME_PAD_X,
  type ComponentFrameNodeData,
  componentFrameId,
  componentGroups,
  frameAriaLabel,
  frameHeaderScale,
  frameHeaderText,
  placeFrames,
  withComponentName,
} from '../src/pages/x/apps/flow-graph/componentFrames';
import type { DeploymentFlowNodeData } from '../src/pages/x/apps/flow-graph/DeploymentFlowNode';
import { searchDeployments } from '../src/pages/x/apps/flow-graph/fold/canvasSearch';
import { SEARCH_MAX_RESULTS } from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  type FoldLayout,
  type FoldLayoutNode,
  computeFoldedLayout,
} from '../src/pages/x/apps/flow-graph/fold/foldLayout';
import {
  type FoldModel,
  buildFoldModel,
  foldMembers,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  type FoldElementsContext,
  type StackNodeData,
  toFlowElements,
} from '../src/pages/x/apps/flow-graph/fold/foldNodes';
import type { PromotionEdgeData } from '../src/pages/x/apps/flow-graph/PromotionEdge';
import { solveFoldedFit } from '../src/pages/x/apps/flow-graph/fold/foldViewport';
import { defaultGroupKey } from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { stackToggleLabel } from '../src/pages/x/apps/flow-graph/fold/markStyle';
import { STAGE_GAP, computeLayout, showsPromotionBadge } from '../src/pages/x/apps/flow-graph/flowLayout';
import { type MeridianComponentName, meridianComponent } from './fixtures/meridianFoldFixture';

const SCREEN = { width: 1224, height: 796 };
const NONE: ReadonlySet<string> = new Set();

/** A Meridian Component as one Component of a bigger graph: its ids are made unique. */
function inComponent(
  name: MeridianComponentName,
  owner: string | undefined,
): ComponentDeployment[] {
  return meridianComponent(name).map((d) => ({
    ...d,
    deploymentId: `${name}/${d.deploymentId}`,
    parentDeploymentId: d.parentDeploymentId === null ? null : `${name}/${d.parentDeploymentId}`,
    componentId: `cid-${name}`,
    componentName: name,
    ...(owner !== undefined && { owner }),
  }));
}

const certManager = () => inComponent('cert-manager', 'platform-team');
const traefik = () => inComponent('traefik', 'platform-team');
const checkout = () => inComponent('checkout', 'retail-eng');

function modelOf(deployments: ComponentDeployment[]): FoldModel {
  return buildFoldModel({
    deployments,
    groupKey: defaultGroupKey(foldMembers(deployments)),
  });
}

function framedLayout(
  deployments: ComponentDeployment[],
  expanded: ReadonlySet<string> = NONE,
  frozenFrom?: FoldLayout,
) {
  const model = modelOf(deployments);
  const components = componentGroups(deployments);
  const fit =
    frozenFrom?.frozen ??
    solveFoldedFit(
      (availableWidth) =>
        computeFoldedLayout(deployments, model, {
          availableWidth,
          expandedGroupIds: NONE,
          components,
        }),
      SCREEN,
    ).frozen;
  const layout = computeFoldedLayout(deployments, model, {
    availableWidth: fit.availableWidth,
    frozen: fit,
    expandedGroupIds: expanded,
    components,
  });
  return { model, components, layout, frozen: fit };
}

const frameOf = (layout: FoldLayout, key: string): FoldLayoutNode =>
  layout.nodes.find((n) => n.id === componentFrameId(key))!;
const contains = (outer: FoldLayoutNode, inner: FoldLayoutNode): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

// ── Which graphs have frames ────────────────────────────────────────────────

test.describe('componentGroups', () => {
  test('one Component has no frame, however large', () => {
    expect(componentGroups(certManager())).toEqual([]);
    expect(componentGroups([])).toEqual([]);
  });

  test('Deployments with no Component do not make a second Component', () => {
    const orphan = { ...traefik()[0], componentId: undefined, componentName: undefined };
    expect(componentGroups([...certManager(), orphan])).toEqual([]);
  });

  test('two Components give two groups in A to Z order, whatever the input order', () => {
    const a = componentGroups([...traefik(), ...certManager()]);
    const b = componentGroups([...certManager(), ...traefik()].reverse());
    expect(a.map((g) => g.name)).toEqual(['cert-manager', 'traefik']);
    expect(b.map((g) => g.name)).toEqual(['cert-manager', 'traefik']);
  });

  test('a group holds its Deployments, and roots', () => {
    const cm = certManager();
    const [group] = componentGroups([...cm, ...traefik()]);
    expect(group.deploymentIds).toHaveLength(cm.length);
    expect(group.rootIds).toEqual(['cert-manager/base']);
    expect(group.owner).toBe('platform-team');
  });

  test('a Component with no Owner label reads as Unassigned, as in the left nav', () => {
    const groups = componentGroups([...certManager(), ...inComponent('traefik', undefined)]);
    expect(groups.find((g) => g.name === 'traefik')?.owner).toBe('Unassigned');
  });

  test('the header shows the Owner on every frame when the Owners differ, with no variant count', () => {
    const groups = componentGroups([...certManager(), ...checkout()]);
    expect(groups.map(frameHeaderText)).toEqual([
      'cert-manager · platform-team',
      'checkout · retail-eng',
    ]);
    expect(frameAriaLabel(groups[0])).toBe('Component cert-manager, Owner platform-team');
  });

  test('the header is only the Component name when every frame has the same Owner', () => {
    const groups = componentGroups([...certManager(), ...traefik()]);
    expect(groups.map((g) => g.showOwner)).toEqual([false, false]);
    expect(groups.map(frameHeaderText)).toEqual(['cert-manager', 'traefik']);
    expect(frameAriaLabel(groups[0])).toBe('Component cert-manager');
  });

  test('a Component with no Owner is its own value, so the Owner shows on every frame', () => {
    const groups = componentGroups([...certManager(), ...inComponent('traefik', undefined)]);
    expect(groups.map(frameHeaderText)).toEqual([
      'cert-manager · platform-team',
      'traefik · Unassigned',
    ]);
  });

  test('Components that all have no Owner share Unassigned, so no frame shows an Owner', () => {
    const groups = componentGroups([
      ...inComponent('cert-manager', undefined),
      ...inComponent('traefik', undefined),
    ]);
    expect(groups.map(frameHeaderText)).toEqual(['cert-manager', 'traefik']);
  });
});

test.describe('placeFrames', () => {
  test('frames stack in order with one width, and a taller tree moves only the later ones down', () => {
    const before = placeFrames([
      { width: 500, height: 300 },
      { width: 700, height: 200 },
      { width: 400, height: 100 },
    ]);
    const after = placeFrames([
      { width: 500, height: 450 },
      { width: 700, height: 200 },
      { width: 400, height: 100 },
    ]);
    expect(new Set(before.frames.map((f) => f.width))).toEqual(new Set([700 + 2 * FRAME_PAD_X]));
    expect(before.frames[0].height).toBe(FRAME_HEADER_H + 300 + FRAME_PAD_BOTTOM);
    expect(before.frames[1].y).toBe(before.frames[0].y + before.frames[0].height + FRAME_GAP);
    expect(after.frames[0].y).toBe(before.frames[0].y);
    expect(after.frames[1].y - before.frames[1].y).toBe(150);
    expect(after.frames[2].y - before.frames[2].y).toBe(150);
    for (let i = 0; i < 3; i++) expect(after.frames[i].x).toBe(before.frames[i].x);
    expect(after.offsets[1].x).toBe(before.offsets[1].x);
  });

  test('the header text keeps its size down to the readable zoom, then grows back, up to a cap', () => {
    expect(frameHeaderScale(1)).toBe(1);
    expect(frameHeaderScale(0.8)).toBe(1);
    expect(frameHeaderScale(0.5)).toBeCloseTo(1.6, 5);
    expect(frameHeaderScale(0.4)).toBeCloseTo(2, 5);
    expect(frameHeaderScale(0.05)).toBe(2.2);
  });
});

// ── The folded layout ───────────────────────────────────────────────────────

test.describe('framed folded layout', () => {
  test('a frame wraps every node of its Component: Bases, cards and fold blocks', () => {
    const deployments = [...certManager(), ...traefik(), ...checkout()];
    const { layout, components } = framedLayout(deployments);
    expect(layout.nodes.filter((n) => n.kind === 'componentFrame')).toHaveLength(3);
    for (const group of components) {
      const frame = frameOf(layout, group.key);
      const own = new Set(group.deploymentIds);
      const inside = layout.nodes.filter(
        (n) =>
          n.kind !== 'componentFrame' &&
          (own.has(n.id) || (n.baseId !== undefined && own.has(n.baseId))),
      );
      expect(inside.some((n) => n.kind === 'foldFrame')).toBe(true);
      expect(inside.some((n) => n.kind === 'stack')).toBe(true);
      for (const n of inside) expect(contains(frame, n), `${n.id} in ${group.name}`).toBe(true);
    }
  });

  test('in a frame the edge between columns is at least STAGE_GAP, and the frame wraps the wider layout', () => {
    const { layout, components } = framedLayout([...certManager(), ...checkout()]);
    for (const group of components) {
      const frame = frameOf(layout, group.key);
      const own = new Set(group.deploymentIds);
      const inside = layout.nodes.filter(
        (n) => n.kind !== 'componentFrame' && (own.has(n.id) || (n.baseId !== undefined && own.has(n.baseId))),
      );
      const trees = inside.filter((n) => n.placement === 'tree');
      for (const edge of layout.edges.filter((e) => own.has(e.source) && e.kind !== 'fold')) {
        const from = trees.find((n) => n.id === edge.source)!;
        const to = layout.nodes.find((n) => n.id === edge.target)!;
        expect(to.x - (from.x + from.width), edge.id).toBeGreaterThanOrEqual(STAGE_GAP);
      }
      for (const edge of layout.edges.filter((e) => e.kind === 'fold' && own.has(e.source))) {
        const from = trees.find((n) => n.id === edge.source)!;
        const to = layout.nodes.find((n) => n.id === edge.target)!;
        expect(to.x - (from.x + from.width), edge.id).toBeGreaterThanOrEqual(STAGE_GAP);
      }
      const right = Math.max(...inside.map((n) => n.x + n.width));
      expect(frame.x + frame.width - right).toBeGreaterThanOrEqual(FRAME_PAD_X);
    }
    const slack = components.map((g) => {
      const frame = frameOf(layout, g.key);
      const own = new Set(g.deploymentIds);
      const right = Math.max(
        ...layout.nodes
          .filter((n) => n.kind !== 'componentFrame' && (own.has(n.id) || (n.baseId !== undefined && own.has(n.baseId))))
          .map((n) => n.x + n.width),
      );
      return frame.x + frame.width - right;
    });
    expect(Math.min(...slack)).toBe(FRAME_PAD_X);
  });

  test('a frame holds nothing of another Component', () => {
    const { layout, components } = framedLayout([...certManager(), ...traefik()]);
    const [first, second] = components;
    const a = frameOf(layout, first.key);
    const b = frameOf(layout, second.key);
    expect(a.y + a.height).toBeLessThanOrEqual(b.y);
    expect(a.x).toBe(b.x);
    expect(a.width).toBe(b.width);
    const secondIds = new Set(second.deploymentIds);
    for (const n of layout.nodes) {
      if (n.kind === 'componentFrame' || !secondIds.has(n.baseId ?? n.id)) continue;
      expect(n.y, n.id).toBeGreaterThanOrEqual(b.y);
    }
  });

  test('the frames sit in the layout size, so Fit sees them', () => {
    const { layout } = framedLayout([...certManager(), ...traefik()]);
    let bottom = 0;
    for (const n of layout.nodes) bottom = Math.max(bottom, n.y + n.height);
    expect(layout.height).toBe(bottom);
    expect(layout.width).toBe(frameOf(layout, 'cid-cert-manager').width);
  });

  test('opening a stack grows its frame, and the frames below move only down', () => {
    const deployments = [...certManager(), ...traefik(), ...checkout()];
    const closed = framedLayout(deployments);
    const stack = closed.layout.nodes.find((n) => n.kind === 'stack')!;
    const open = framedLayout(deployments, new Set([stack.id]), closed.layout);

    const frames = closed.components.map((g) => [
      frameOf(closed.layout, g.key),
      frameOf(open.layout, g.key),
    ]);
    const grown = frames.findIndex(([c, o]) => o.height > c.height);
    expect(grown).toBeGreaterThanOrEqual(0);
    const delta = frames[grown][1].height - frames[grown][0].height;
    frames.forEach(([c, o], i) => {
      expect(o.x).toBe(c.x);
      expect(o.width).toBe(c.width);
      if (i <= grown) expect(o.y).toBe(c.y);
      else expect(o.y - c.y).toBe(delta);
    });
    // The expanded stack's frame and members are inside the grown frame.
    const grownKey = closed.components[grown].key;
    const grownFrame = frameOf(open.layout, grownKey);
    const opened = open.layout.nodes.filter(
      (n) => n.groupId === stack.id && (n.kind === 'expandFrame' || n.placement === 'member'),
    );
    expect(opened.length).toBeGreaterThan(1);
    for (const n of opened) expect(contains(grownFrame, n), n.id).toBe(true);
    // Nothing else moves sideways.
    const closedById = new Map(closed.layout.nodes.map((n) => [n.id, n]));
    for (const n of open.layout.nodes) {
      const was = closedById.get(n.id);
      if (was) expect(n.x, n.id).toBe(was.x);
    }
  });

  test('the same input in another order gives the same frames in the same places', () => {
    const forward = framedLayout([...certManager(), ...traefik()]);
    const backward = framedLayout([...traefik(), ...certManager()]);
    const rects = (l: FoldLayout) =>
      l.nodes.filter((n) => n.kind === 'componentFrame').map((n) => [n.id, n.x, n.y, n.width, n.height]);
    expect(rects(backward.layout)).toEqual(rects(forward.layout));
  });

  test('without Components the layout is the one it always was', () => {
    const deployments = meridianComponent('cert-manager');
    const model = modelOf(deployments);
    const plain = computeFoldedLayout(deployments, model, {
      availableWidth: 1100,
      expandedGroupIds: NONE,
    });
    const empty = computeFoldedLayout(deployments, model, {
      availableWidth: 1100,
      expandedGroupIds: NONE,
      components: [],
    });
    expect(empty).toEqual(plain);
    expect(plain.nodes.some((n) => n.kind === 'componentFrame')).toBe(false);
  });
});

// ── The nodes ───────────────────────────────────────────────────────────────

function elementsOf(deployments: ComponentDeployment[]) {
  const { model, layout, components } = framedLayout(deployments);
  const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
  const ctx: FoldElementsContext = {
    node: {
      selectedDeploymentIds: NONE,
      activeUpgrades: NONE,
      onDeploymentToggle: () => {},
      onUpgradeToggle: () => {},
    },
    edge: { selectedDeploymentIds: NONE, activeUpgrades: NONE, deploymentById: byId },
    expandedGroupIds: NONE,
    onToggleStack: () => {},
    components,
    frameActions: { onSelectRoot: () => {} },
  };
  return toFlowElements(layout, model, byId, ctx);
}
const ofType = (nodes: Node[], type: string) => nodes.filter((n) => n.type === type);
const data = (n: Node) => n.data as DeploymentFlowNodeData;

test.describe('framed nodes', () => {
  test('there is one frame node per Component, under the folds, with an accessible name', () => {
    const { nodes } = elementsOf([...certManager(), ...traefik()]);
    const frames = ofType(nodes, 'componentFrameNode');
    expect(frames.map((n) => (n.data as ComponentFrameNodeData).componentName)).toEqual([
      'cert-manager',
      'traefik',
    ]);
    for (const f of frames) {
      expect(f.zIndex).toBe(-2);
      expect(f.selectable).toBe(false);
      expect((f.data as ComponentFrameNodeData).ariaLabel).toMatch(/^Component [^,]+$/);
    }
    for (const fold of ofType(nodes, 'foldFrameNode')) expect(fold.zIndex).toBe(-1);
  });

  test('a Base names its Component, and a card does not', () => {
    const { nodes } = elementsOf([...certManager(), ...traefik()]);
    const bases = ofType(nodes, 'deploymentNode').filter((n) => data(n).deployment.type === 'Base');
    expect(bases.length).toBeGreaterThanOrEqual(10);
    for (const b of bases) {
      expect(data(b).componentName).toBe(data(b).deployment.componentName);
    }
    const cards = ofType(nodes, 'deploymentNode').filter((n) => data(n).deployment.type === 'Deployment');
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) expect(data(c).componentName).toBeUndefined();
  });

  test('a graph of one Component has no frame and no name on its Bases', () => {
    const deployments = certManager();
    const model = modelOf(deployments);
    const layout = computeFoldedLayout(deployments, model, {
      availableWidth: 1100,
      expandedGroupIds: NONE,
      components: componentGroups(deployments),
    });
    const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
    const { nodes } = toFlowElements(layout, model, byId, {
      node: {
        selectedDeploymentIds: NONE,
        activeUpgrades: NONE,
        onDeploymentToggle: () => {},
        onUpgradeToggle: () => {},
      },
      edge: { selectedDeploymentIds: NONE, activeUpgrades: NONE, deploymentById: byId },
      expandedGroupIds: NONE,
      onToggleStack: () => {},
      components: componentGroups(deployments),
    });
    expect(ofType(nodes, 'componentFrameNode')).toHaveLength(0);
    for (const n of ofType(nodes, 'deploymentNode')) expect(data(n).componentName).toBeUndefined();
    for (const s of ofType(nodes, 'stackNode')) {
      expect((s.data as StackNodeData).componentName).toBeUndefined();
    }
  });

  test('a stack names its Component in its toggle label, so two "retail" stacks differ', () => {
    const { nodes } = elementsOf([...certManager(), ...traefik()]);
    const names = new Set(
      ofType(nodes, 'stackNode').map((n) => (n.data as StackNodeData).componentName),
    );
    expect(names).toEqual(new Set(['cert-manager', 'traefik']));
    expect(stackToggleLabel(false, 'retail', 13, 'cert-manager')).toBe(
      'Expand stack retail, 13 Deployments in cert-manager',
    );
    expect(stackToggleLabel(true, 'retail', 1, 'traefik')).toBe(
      'Collapse stack retail, 1 Deployment in traefik',
    );
    expect(stackToggleLabel(false, 'retail', 13)).toBe('Expand stack retail, 13 Deployments');
  });
});

// ── The sync badge ──────────────────────────────────────────────────────────

test.describe('the sync badge on a promotion edge', () => {
  test('is drawn when the edge is as long as the unfolded graph’s, and hidden when it is not', () => {
    const deployments = [...certManager(), ...traefik()];
    const { layout } = framedLayout(deployments);
    const placed = new Map(layout.nodes.map((n) => [n.id, n]));
    const { edges } = elementsOf(deployments);
    const promotion = edges.filter((e) => e.type === 'promotionEdge');
    expect(promotion.length).toBeGreaterThan(0);
    let shown = 0;
    let hidden = 0;
    for (const e of promotion) {
      const from = placed.get(e.source)!;
      const to = placed.get(e.target)!;
      const gap = to.x - (from.x + from.width);
      const hide = (e.data as PromotionEdgeData).hideBadge === true;
      expect(hide, `${e.id} gap ${gap}`).toBe(!showsPromotionBadge(gap));
      expect(showsPromotionBadge(gap)).toBe(gap === STAGE_GAP);
      if (hide) hidden++;
      else shown++;
    }
    expect(shown).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
  });

  test('a tree edge, between Base and child, is exactly STAGE_GAP, so its badge shows', () => {
    const deployments = [...certManager(), ...traefik()];
    const { layout } = framedLayout(deployments);
    const placed = new Map(layout.nodes.map((n) => [n.id, n]));
    const tree = elementsOf(deployments).edges.filter(
      (e) => e.type === 'promotionEdge' && placed.get(e.target)!.placement === 'tree',
    );
    expect(tree.length).toBeGreaterThan(0);
    for (const e of tree) expect((e.data as PromotionEdgeData).hideBadge).toBeUndefined();
  });

  test('the unfolded graph, framed or not, never hides it', () => {
    const deployments = [...certManager(), ...traefik()];
    for (const components of [componentGroups(deployments), []]) {
      const { edges } = unfolded(deployments, components);
      expect(edges.length).toBeGreaterThan(0);
      for (const e of edges) expect((e.data as PromotionEdgeData).hideBadge).toBeUndefined();
    }
  });
});

// ── The unfolded layout ─────────────────────────────────────────────────────

function unfolded(deployments: ComponentDeployment[], components = componentGroups(deployments)) {
  const depths = [...new Set(deployments.map((d) => d.stage))].sort((a, b) => a - b);
  const stages: Stage[] = depths.map((depth) => ({ label: String(depth), depth, deploymentIds: [] }));
  return computeLayout(
    deployments,
    stages,
    new Map(deployments.map((d) => [d.deploymentId, d])),
    new Set(),
    new Set(),
    () => {},
    () => {},
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
    components,
  );
}

test.describe('framed unfolded layout', () => {
  const small = () => [...inComponent('fraud-scoring', 'risk-eng'), ...checkout()];

  test('each Component sits in its own frame, one under the other', () => {
    const deployments = small();
    const { nodes } = unfolded(deployments);
    const frames = ofType(nodes, 'componentFrameNode');
    expect(frames).toHaveLength(2);
    const [a, b] = frames;
    const aData = a.data as ComponentFrameNodeData;
    expect(aData.componentName).toBe('checkout');
    expect(a.position.y + aData.height).toBeLessThanOrEqual(b.position.y);
    for (const n of ofType(nodes, 'deploymentNode')) {
      const d = data(n).deployment;
      const frame = frames.find((f) => (f.data as ComponentFrameNodeData).componentName === d.componentName)!;
      const fd = frame.data as ComponentFrameNodeData;
      expect(n.position.x).toBeGreaterThanOrEqual(frame.position.x);
      expect(n.position.y).toBeGreaterThanOrEqual(frame.position.y + FRAME_HEADER_H);
      expect(n.position.y + 112).toBeLessThanOrEqual(frame.position.y + fd.height);
      expect(n.position.x + 260).toBeLessThanOrEqual(frame.position.x + fd.width);
    }
  });

  test('only a Base names its Component', () => {
    const { nodes } = unfolded(small());
    for (const n of ofType(nodes, 'deploymentNode')) {
      const d = data(n);
      if (d.deployment.type === 'Base') expect(d.componentName).toBe(d.deployment.componentName);
      else expect(d.componentName).toBeUndefined();
    }
  });

  test('one Component has no frame and the layout it always had', () => {
    const deployments = inComponent('fraud-scoring', 'risk-eng');
    const withNone = unfolded(deployments, []);
    expect(ofType(withNone.nodes, 'componentFrameNode')).toHaveLength(0);
    for (const n of ofType(withNone.nodes, 'deploymentNode')) {
      expect(data(n).componentName).toBeUndefined();
    }
    // The same positions as the single-Component layout of the fixture.
    expect(withNone.nodes.slice(0, 2).map((n) => [n.position.x, n.position.y])).toEqual([
      [0, 588],
      [360, 91],
    ]);
  });
});

// ── Search and other places that name a node ────────────────────────────────

test.describe('naming a node out of context', () => {
  test('search says where it lives, Component first, in a graph of several', () => {
    const deployments = [...certManager(), ...traefik()];
    const model = modelOf(deployments);
    const { hits } = searchDeployments('retail-prod2', deployments, model);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.where).toMatch(/^(cert-manager|traefik) › prod Base › /);
    }
  });

  test('a Deployment in another Component is told apart by its Component', () => {
    const deployments = [...certManager(), ...traefik()];
    const model = modelOf(deployments);
    const { hits, total } = searchDeployments('prod1', deployments, model);
    expect(total).toBeGreaterThan(SEARCH_MAX_RESULTS);
    expect(new Set(hits.map((h) => h.where.split(' › ')[0])).size).toBeGreaterThanOrEqual(1);
    const root = searchDeployments('base', deployments, null).hits.find((h) => h.id === 'traefik/base');
    expect(root?.where).toBe('traefik › Root Base');
  });

  test('search in a graph of one Component is as it was', () => {
    const deployments = certManager();
    const model = modelOf(deployments);
    const { hits } = searchDeployments('retail-prod2', deployments, model);
    for (const hit of hits) expect(hit.where).toBe('prod Base › retail stack');
  });

  test('withComponentName leaves a single-Component place alone', () => {
    const [d] = certManager();
    expect(withComponentName('prod Base', d, false)).toBe('prod Base');
    expect(withComponentName('prod Base', d, true)).toBe('cert-manager › prod Base');
    expect(withComponentName('prod Base', { ...d, componentName: undefined }, true)).toBe('prod Base');
  });
});
