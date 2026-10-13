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

import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import { componentFrameId, componentGroups } from '../src/pages/x/apps/flow-graph/componentFrames';
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
  toFlowElements,
} from '../src/pages/x/apps/flow-graph/fold/foldNodes';
import { solveFoldedFit } from '../src/pages/x/apps/flow-graph/fold/foldViewport';
import { defaultGroupKey } from '../src/pages/x/apps/flow-graph/fold/groupBy';
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
});
