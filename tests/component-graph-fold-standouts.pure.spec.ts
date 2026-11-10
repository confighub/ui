// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Variant that matters stays in its stack, but first and by name: a
// Variant that keeps a value on merge, or one over the card cap with a
// condition the others do not share. A condition that is a wave on its Base
// sets no Variant apart, so a gate wave across every Variant folds as before.
import type { ExtendedSpaceRead, ExtendedUnitRead, UnitRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { buildComponentData } from '../src/pages/x/apps/componentData';
import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import { computeFoldedLayout } from '../src/pages/x/apps/flow-graph/fold/foldLayout';
import { type FoldModel, buildFoldModel } from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  type FoldElementsContext,
  type StackNodeData,
  toFlowElements,
} from '../src/pages/x/apps/flow-graph/fold/foldNodes';
import { standoutNote } from '../src/pages/x/apps/flow-graph/fold/namePreview';

const NONE: ReadonlySet<string> = new Set();
const GATED = { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 1 };

interface Member {
  name: string;
  /** The Region label; `eu` when not given. */
  region?: string;
  gated?: boolean;
  degraded?: boolean;
  kept?: boolean;
}

/** A root Base with leaf Variants below it, all of one Department unless named. */
function component(members: Member[]): ComponentDeployment[] {
  const root: ComponentDeployment = {
    deploymentId: 'root',
    slug: 'root',
    displayName: 'root',
    type: 'Base',
    targets: [],
    parentDeploymentId: null,
    stage: 0,
    upgradeableCount: 0,
    unappliedCount: 0,
    unitCount: 1,
    labels: {},
    configSignals: { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 },
  };
  return [
    root,
    ...members.map(
      (m): ComponentDeployment => ({
        deploymentId: m.name,
        slug: m.name,
        displayName: m.name,
        type: 'Deployment',
        targets: [{ targetId: `target-${m.name}`, name: m.name, label: m.name }],
        parentDeploymentId: 'root',
        stage: 1,
        upgradeableCount: 0,
        unappliedCount: 0,
        unitCount: 1,
        liveStatus: { Sync: 'Synced', Health: m.degraded ? 'Degraded' : 'Healthy' },
        labels: { Region: m.region ?? 'eu' },
        configSignals: m.gated ? GATED : { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 },
        ...(m.kept && { keptValueUnits: 1 }),
      }),
    ),
  ];
}

const named = (n: number, extra: Omit<Member, 'name'> = {}, prefix = 'prod'): Member[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${String(i + 1).padStart(2, '0')}`,
    ...extra,
  }));

function rootFold(model: FoldModel) {
  const fold = model.bases.get('root');
  if (!fold) throw new Error('no fold for root');
  return fold;
}

/** The data of every stack the folded graph draws. */
function stackData(deployments: ComponentDeployment[], model: FoldModel): StackNodeData[] {
  const layout = computeFoldedLayout(deployments, model, {
    availableWidth: 1200,
    expandedGroupIds: NONE,
  });
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
  };
  return toFlowElements(layout, model, byId, ctx)
    .nodes.filter((n) => n.type === 'stackNode')
    .map((n) => n.data as StackNodeData);
}

test.describe('a Variant that keeps a value on merge', () => {
  // 55 Gated prod Variants, as a ChangeOrder waiting at prod leaves them; one
  // of them keeps an image tag. The kept one sorts last by name on purpose.
  const deployments = component([
    ...named(54, { gated: true }),
    { name: 'zz-pinned', gated: true, kept: true },
  ]);
  const model = buildFoldModel({ deployments, groupKey: 'Region' });
  const fold = rootFold(model);

  test('it gets no card of its own; the gate is one wave', () => {
    expect(fold.waves.map((w) => w.condition)).toEqual(['gated']);
    expect(fold.cards).toEqual([]);
    expect(model.location.get('zz-pinned')?.kind).toBe('stack');
  });

  test('it goes first in its stack, the rest in name order', () => {
    expect([...fold.standouts]).toEqual([['zz-pinned', 'kept']]);
    expect(fold.groups).toHaveLength(1);
    const ids = fold.groups[0].memberIds;
    expect(ids[0]).toBe('zz-pinned');
    expect(ids.slice(1)).toEqual(named(54).map((m) => m.name));
  });

  test('the closed stack shows its name first, with the reason', () => {
    const [stack] = stackData(deployments, model);
    expect(stack.label).toBe('eu');
    expect(stack.count).toBe(55);
    expect(stack.standouts).toEqual([{ name: 'zz-pinned', reason: 'Kept on merge' }]);
    expect(standoutNote(stack.standouts)).toBe('Kept on merge');
    expect(stack.previewNames).not.toContain('zz-pinned');
    expect(stack.previewNames[0]).toBe('prod01');
  });
});

test.describe('a gate wave across every Variant', () => {
  const deployments = component(named(55, { gated: true }));
  const model = buildFoldModel({ deployments, groupKey: 'Region' });
  const fold = rootFold(model);

  test('folds as before: one stack in name order, no card, nobody first', () => {
    expect(fold.waves.map((w) => w.condition)).toEqual(['gated']);
    expect(fold.cards).toEqual([]);
    expect(fold.standouts.size).toBe(0);
    expect(fold.groups.map((g) => g.memberIds)).toEqual([named(55).map((m) => m.name)]);
    const [stack] = stackData(deployments, model);
    expect(stack.standouts).toEqual([]);
    expect(standoutNote(stack.standouts)).toBe('');
    expect(stack.previewNames).toEqual(named(55).map((m) => m.name));
  });
});

test.describe('a Variant over the card cap', () => {
  test('a condition that is not a wave goes before a kept value', () => {
    // 13 Degraded: 12 cards, and the 13th stays in a stack. It is worse than
    // a kept value, so it leads the stack.
    const deployments = component([
      ...named(13, { degraded: true }, 'bad'),
      { name: 'aa-pinned', kept: true },
      ...named(10, {}, 'ok'),
    ]);
    const model = buildFoldModel({ deployments, groupKey: 'Region' });
    const fold = rootFold(model);
    expect(fold.overCapIds).toEqual(['bad13']);
    expect(fold.groups[0].memberIds.slice(0, 3)).toEqual(['bad13', 'aa-pinned', 'ok01']);
    const [stack] = stackData(deployments, model);
    expect(stack.standouts).toEqual([
      { name: 'bad13', reason: 'Degraded' },
      { name: 'aa-pinned', reason: 'Kept on merge' },
    ]);
  });
});

test.describe('two standouts in one stack', () => {
  test('each leads by name, and the note counts the second', () => {
    const deployments = component([
      ...named(20, { gated: true }),
      { name: 'zz-pinned-a', gated: true, kept: true },
      { name: 'zz-pinned-b', gated: true, kept: true },
    ]);
    const model = buildFoldModel({ deployments, groupKey: 'Region' });
    expect(rootFold(model).groups[0].memberIds.slice(0, 2)).toEqual([
      'zz-pinned-a',
      'zz-pinned-b',
    ]);
    const [stack] = stackData(deployments, model);
    expect(stack.standouts.map((m) => m.name)).toEqual(['zz-pinned-a', 'zz-pinned-b']);
    expect(stack.previewNames).not.toContain('zz-pinned-a');
    expect(stack.previewNames).not.toContain('zz-pinned-b');
    expect(stack.previewNames[0]).toBe('prod01');
    expect(standoutNote(stack.standouts)).toBe('Kept on merge +1 more');
  });
});

test.describe('a standout in a merged stack', () => {
  test('the names line holds the Variant name, not label values beside it', () => {
    // Every Region is held by one Variant, so they merge into one stack that
    // previews Region values. A Variant name must not join that list.
    const members: Member[] = named(8).map((m, i) => ({ ...m, region: `region-${i + 1}` }));
    members[3] = { ...members[3], kept: true };
    const deployments = component(members);
    const model = buildFoldModel({ deployments, groupKey: 'Region' });
    const fold = rootFold(model);
    expect(fold.groups.map((g) => g.kind)).toEqual(['other']);
    const [stack] = stackData(deployments, model);
    expect(stack.standouts).toEqual([{ name: 'prod04', reason: 'Kept on merge' }]);
    expect(stack.previewNames).toEqual([]);
  });

  test('with no standout, it previews the label values as before', () => {
    const members: Member[] = named(8).map((m, i) => ({ ...m, region: `region-${i + 1}` }));
    const deployments = component(members);
    const [stack] = stackData(
      deployments,
      buildFoldModel({ deployments, groupKey: 'Region' }),
    );
    expect(stack.standouts).toEqual([]);
    expect(stack.previewNames).toEqual(members.map((m) => m.region));
  });
});

test.describe('buildComponentData', () => {
  test('counts the kept-value units of each Space, each unit once', () => {
    const spaces: ExtendedSpaceRead[] = ['pinned', 'plain'].map((id) => ({
      Space: { SpaceID: id, Slug: id } as ExtendedSpaceRead['Space'],
    }));
    const units: ExtendedUnitRead[] = ['pinned', 'plain'].flatMap((id) =>
      ['webhook', 'controller'].map((slug) => ({
        Unit: { UnitID: `${id}-${slug}`, SpaceID: id, Slug: slug } as UnitRead,
      })),
    );
    // The two kept-value lists can both hold a unit: a protected path in a
    // protected resource. It counts once.
    const webhook = units.filter((u) => u.Unit?.UnitID === 'pinned-webhook');
    const kept = [...webhook, ...webhook];
    const { deployments } = buildComponentData(
      spaces,
      units,
      new Map(units.map((u) => [u.Unit!.UnitID!, u])),
      new Map(),
      undefined,
      undefined,
      undefined,
      undefined,
      kept,
    );
    const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
    expect(byId.get('pinned')?.keptValueUnits).toBe(1);
    expect(byId.get('plain')?.keptValueUnits).toBeUndefined();
  });
});
