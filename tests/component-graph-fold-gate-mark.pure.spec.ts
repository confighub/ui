// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// How a card in a folded graph says it is Gated: the full chip, a small mark
// with the chip's peek, or nothing when the fold header says it for a wave.
// A member of an open stack in a Gated wave gets the mark, so the user can
// see which Variants are gated, and by which Trigger, without 55 loud chips.
import type { Node } from 'reactflow';

import { expect, test } from '@playwright/test';

import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import type {
  DeploymentFlowNodeData,
  NodeUnitSummary,
} from '../src/pages/x/apps/flow-graph/DeploymentFlowNode';
import { computeFoldedLayout } from '../src/pages/x/apps/flow-graph/fold/foldLayout';
import { buildFoldModel, foldMembers } from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  type FoldElementsContext,
  toFlowElements,
} from '../src/pages/x/apps/flow-graph/fold/foldNodes';
import { solveFoldedFit } from '../src/pages/x/apps/flow-graph/fold/foldViewport';
import { gatedMarkLabel, gatedSignal } from '../src/pages/x/apps/flow-graph/fold/gatedSignal';
import { defaultGroupKey } from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { meridianComponent } from './fixtures/meridianFoldFixture';

test.describe('gatedSignal', () => {
  test('a member of an open stack in a Gated wave gets the mark', () => {
    expect(gatedSignal({ gated: true, gatedIsWave: true, stackMember: true })).toBe('mark');
  });

  test('an own card in a Gated wave shows nothing: the fold header says it', () => {
    expect(gatedSignal({ gated: true, gatedIsWave: true, stackMember: false })).toBe('none');
  });

  test('a Gated card that is not in a wave keeps the full chip, in a stack or not', () => {
    expect(gatedSignal({ gated: true, gatedIsWave: false, stackMember: true })).toBe('chip');
    expect(gatedSignal({ gated: true, gatedIsWave: false, stackMember: false })).toBe('chip');
  });

  test('a card that is not Gated shows nothing', () => {
    for (const gatedIsWave of [true, false]) {
      for (const stackMember of [true, false]) {
        expect(gatedSignal({ gated: false, gatedIsWave, stackMember })).toBe('none');
      }
    }
  });
});

test.describe('gatedMarkLabel', () => {
  test('names each Trigger once, across the Units of the card', () => {
    expect(
      gatedMarkLabel([
        {
          gates: [
            'prod-eu/no-placeholders/vet-placeholders',
            'prod-eu/max-replicas/vet-celexpr:2',
          ],
        },
        { gates: ['prod-eu/no-placeholders/vet-placeholders'] },
        { gates: [] },
      ]),
    ).toBe('Gated: no-placeholders, max-replicas');
  });

  test('says Gated when no Unit names a gate', () => {
    expect(gatedMarkLabel([])).toBe('Gated');
  });
});

// ── In the folded graph ─────────────────────────────────────────────────────

const SCREEN = { width: 1224, height: 796 };
const NONE: ReadonlySet<string> = new Set();
const GATE = 'prod/no-placeholders/vet-placeholders';

/** cert-manager with every prod Deployment Gated, so Gated is a wave on prod, as Stale is. */
function gatedProd(): ComponentDeployment[] {
  return meridianComponent('cert-manager').map((d) =>
    d.type === 'Deployment' && d.parentDeploymentId === 'prod'
      ? { ...d, configSignals: { ...d.configSignals, gatedUnits: 1 } }
      : d,
  );
}

function deploymentNodes(deployments: ComponentDeployment[], expanded: ReadonlySet<string>) {
  const model = buildFoldModel({
    deployments,
    groupKey: defaultGroupKey(foldMembers(deployments)),
  });
  const fit = solveFoldedFit(
    (availableWidth) =>
      computeFoldedLayout(deployments, model, { availableWidth, expandedGroupIds: NONE }),
    SCREEN,
  );
  const layout = computeFoldedLayout(deployments, model, {
    availableWidth: fit.frozen.availableWidth,
    frozen: fit.frozen,
    expandedGroupIds: expanded,
  });
  const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
  const units = new Map(
    deployments.map((d): [string, NodeUnitSummary[]] => [
      d.deploymentId,
      [
        {
          slug: 'cert-manager',
          applyStatus: d.configSignals.gatedUnits > 0 ? 'gated' : null,
          upgrading: d.configSignals.staleUnits > 0,
          gates: d.configSignals.gatedUnits > 0 ? [GATE] : [],
          warnings: [],
        },
      ],
    ]),
  );
  const ctx: FoldElementsContext = {
    node: {
      selectedDeploymentIds: NONE,
      activeUpgrades: NONE,
      onDeploymentToggle: () => {},
      onUpgradeToggle: () => {},
      unitSummariesByDeployment: units,
    },
    edge: { selectedDeploymentIds: NONE, activeUpgrades: NONE, deploymentById: byId },
    expandedGroupIds: expanded,
    onToggleStack: () => {},
  };
  const { nodes } = toFlowElements(layout, model, byId, ctx);
  return {
    model,
    nodes: new Map(
      nodes
        .filter((n: Node) => n.type === 'deploymentNode')
        .map((n) => [n.id, n.data as DeploymentFlowNodeData]),
    ),
  };
}

/** What the card draws for Gated, from its data, as DeploymentFlowNode decides it. */
const signalOf = (data: DeploymentFlowNodeData) =>
  gatedSignal({
    gated: data.units.some((u) => u.applyStatus === 'gated'),
    gatedIsWave: data.suppressedConditions?.includes('gated') ?? false,
    stackMember: !!data.stackMember,
  });

test.describe('a Gated wave in the folded graph', () => {
  const deployments = gatedProd();
  const { model } = deploymentNodes(deployments, NONE);
  const prod = model.bases.get('prod')!;
  const stack = prod.groups.find((g) => g.kind === 'stack')!;

  test('Gated and Stale are waves on prod', () => {
    expect(prod.waveSet.has('gated')).toBe(true);
    expect(prod.waveSet.has('stale')).toBe(true);
  });

  test('each member of an open stack gets the mark, named by its Trigger', () => {
    const { nodes } = deploymentNodes(deployments, new Set([stack.id]));
    expect(stack.memberIds.length).toBeGreaterThan(0);
    for (const id of stack.memberIds) {
      const data = nodes.get(id)!;
      expect(data.stackMember, id).toBe(true);
      expect(signalOf(data), id).toBe('mark');
      expect(gatedMarkLabel(data.units)).toBe('Gated: no-placeholders');
    }
  });

  test('an own card of prod shows no Gated chip or mark, as before', () => {
    const { nodes } = deploymentNodes(deployments, new Set([stack.id]));
    const cards = [...model.location.entries()]
      .filter(([, loc]) => loc.kind === 'card')
      .map(([id]) => id)
      .filter((id) => nodes.get(id)?.deployment.parentDeploymentId === 'prod');
    expect(cards.length).toBeGreaterThan(0);
    for (const id of cards) {
      const data = nodes.get(id)!;
      expect(data.stackMember, id).toBeUndefined();
      expect(signalOf(data), id).toBe('none');
    }
  });

  test('a closed stack draws no member cards, so nothing changes there', () => {
    const { nodes } = deploymentNodes(deployments, NONE);
    for (const id of stack.memberIds) expect(nodes.has(id), id).toBe(false);
    for (const data of nodes.values()) expect(data.stackMember).toBeUndefined();
  });

  test('the other waves stay suppressed on a member, as before', () => {
    const { nodes } = deploymentNodes(deployments, new Set([stack.id]));
    for (const id of stack.memberIds) {
      expect(nodes.get(id)!.suppressedConditions).toEqual(
        expect.arrayContaining(['stale', 'gated']),
      );
    }
  });
});

test('a Variant Gated where Gated is not a wave gets a card with the full chip', () => {
  const deployments = meridianComponent('cert-manager');
  const { model } = deploymentNodes(deployments, NONE);
  const memberId = model.bases.get('prod')!.groups.find((g) => g.kind === 'stack')!
    .memberIds[0];
  const one = deployments.map((d) =>
    d.deploymentId === memberId
      ? { ...d, configSignals: { ...d.configSignals, gatedUnits: 1 } }
      : d,
  );
  const gatedOne = deploymentNodes(one, NONE);
  expect(gatedOne.model.bases.get('prod')!.waveSet.has('gated')).toBe(false);
  const data = gatedOne.nodes.get(memberId);
  expect(data).toBeDefined();
  expect(data!.stackMember).toBeUndefined();
  expect(signalOf(data!)).toBe('chip');
});
