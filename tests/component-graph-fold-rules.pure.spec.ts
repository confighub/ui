// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The fold rules the user decided for large Component graphs, tested at their
// edges. The Meridian specs prove the reviewed numbers on real data; these
// prove each rule where it switches on or off (9 vs 10 Deployments, 4 vs 5
// members in a wave, 3 vs 4 groups of 1, 59.999 s vs 60 s), and hold the
// layout and Fit rules for every stack and many screen sizes, so a change
// that keeps the Meridian numbers but moves a boundary still fails here.
import { expect, test } from '@playwright/test';

import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import {
  type ConditionKind,
  stripMark,
} from '../src/pages/x/apps/flow-graph/fold/deploymentCondition';
import {
  CARD_CAP,
  FIT_TOP,
  MORE_BELOW_MIN_HIDDEN,
  READABLE_ZOOM_FLOOR,
  RECOVERED_HOLD_MS,
} from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  type FoldLayout,
  computeFoldedLayout,
} from '../src/pages/x/apps/flow-graph/fold/foldLayout';
import {
  type BaseFold,
  type FoldModel,
  buildFoldModel,
  foldMembers,
  shouldFold,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import { stepFoldStability } from '../src/pages/x/apps/flow-graph/fold/foldStability';
import {
  type Size,
  hiddenBelowPx,
  panDownViewport,
  solveFoldedFit,
} from '../src/pages/x/apps/flow-graph/fold/foldViewport';
import { defaultGroupKey, groupByOptions } from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { waveActionLabel } from '../src/pages/x/apps/flow-graph/fold/waveActions';
import type { LiveStatus } from '../src/pages/x/apps/liveStatus';
import { type MeridianComponentName, meridianComponent } from './fixtures/meridianFoldFixture';

// ── A synthetic Component: root Base -> class Bases -> leaf Deployments ─────

type Condition = ConditionKind;

interface Leaf {
  name: string;
  is?: Condition[];
  labels?: Record<string, string>;
}

const QUIET = { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 };

function node(
  id: string,
  parent: string | null,
  type: 'Base' | 'Deployment',
  stage: number,
): ComponentDeployment {
  return {
    deploymentId: id,
    slug: id,
    displayName: id,
    type,
    targets: type === 'Deployment' ? [{ targetId: `t-${id}`, name: id, label: id }] : [],
    parentDeploymentId: parent,
    stage,
    upgradeableCount: 0,
    unappliedCount: 0,
    unitCount: 1,
    liveStatusProvider: type === 'Deployment' ? 'argocd' : 'unknown',
    labels: {},
    configSignals: QUIET,
  };
}

function leaf(parent: string, stage: number, spec: Leaf): ComponentDeployment {
  const is = new Set(spec.is ?? []);
  const liveStatus: LiveStatus = {
    Sync: is.has('outOfSync') ? 'OutOfSync' : 'Synced',
    Health: is.has('degraded')
      ? 'Degraded'
      : is.has('progressing')
        ? 'Progressing'
        : 'Healthy',
  };
  return {
    ...node(spec.name, parent, 'Deployment', stage),
    liveStatus,
    labels: spec.labels ?? {},
    configSignals: {
      staleUnits: is.has('stale') ? 1 : 0,
      unreleasedUnits: is.has('unreleased') ? 1 : 0,
      gatedUnits: is.has('gated') ? 1 : 0,
    },
  };
}

/** Leaves directly under one root Base. */
function flat(leaves: Leaf[]): ComponentDeployment[] {
  return [node('root', null, 'Base', 0), ...leaves.map((l) => leaf('root', 1, l))];
}

/** A root Base with one class Base per key, each holding its leaves. */
function tree(bases: Record<string, Leaf[]>): ComponentDeployment[] {
  const out = [node('root', null, 'Base', 0)];
  for (const [baseId, leaves] of Object.entries(bases)) {
    out.push(node(baseId, 'root', 'Base', 1));
    out.push(...leaves.map((l) => leaf(baseId, 2, l)));
  }
  return out;
}

/** n leaves named `<prefix>01`..., with the same conditions and labels. */
function leaves(
  n: number,
  prefix: string,
  is: Condition[] = [],
  labels: Record<string, string> = {},
): Leaf[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${String(i + 1).padStart(2, '0')}`,
    is,
    labels,
  }));
}

function fold(model: FoldModel, baseId: string): BaseFold {
  const f = model.bases.get(baseId);
  if (!f) throw new Error(`no fold for Base ${baseId}`);
  return f;
}

const waveKinds = (f: BaseFold) => f.waves.map((w) => w.condition);
const cardIds = (f: BaseFold) => f.cards.map((c) => c.id);

// ── by the user's choice, else at 10 Deployments ──────────────────────────

test.describe('the fold threshold', () => {
  test('9 Deployments do not fold; 10 fold', () => {
    expect(shouldFold(flat(leaves(9, 'd')))).toBe(false);
    expect(shouldFold(flat(leaves(10, 'd')))).toBe(true);
  });

  test('Bases are not Deployments: 9 leaves under 5 Bases still do not fold', () => {
    const deployments = tree({
      a: leaves(3, 'a'),
      b: leaves(2, 'b'),
      c: leaves(2, 'c'),
      d: leaves(2, 'd'),
    });
    expect(deployments.filter((d) => d.type === 'Base')).toHaveLength(5);
    expect(shouldFold(deployments)).toBe(false);
  });

  test('a problem on every one of 9 Deployments still does not fold', () => {
    expect(shouldFold(flat(leaves(9, 'd', ['degraded'])))).toBe(false);
  });

  test('?graphGroup=off keeps a large Component unfolded', () => {
    expect(shouldFold(flat(leaves(99, 'd')), 'off')).toBe(false);
    expect(shouldFold(flat(leaves(10, 'd')), 'off')).toBe(false);
  });

  test('?graphGroup=<key> folds a small Component, down to one Deployment', () => {
    const split = (n: number, labels: Record<string, string>[]) =>
      flat(
        Array.from(
          { length: n },
          (_, i) => leaves(1, `d${i}`, [], labels[i % labels.length])[0],
        ),
      );
    const regions = [{ Region: 'us' }, { Region: 'eu' }];
    expect(shouldFold(split(8, regions), 'Region')).toBe(true);
    expect(shouldFold(flat(leaves(1, 'd', [], { Stage: 'prod' })), 'Stage')).toBe(true);
  });

  test('?graphGroup=OFF, Off and off all keep the layout unfolded', () => {
    for (const value of ['OFF', 'Off', 'off']) {
      expect(shouldFold(flat(leaves(99, 'd')), value)).toBe(false);
    }
  });

  test('a value that is not an offered key is no choice: the threshold decides', () => {
    for (const value of ['garbage', 'Region', '@nothing']) {
      expect(shouldFold(flat(leaves(9, 'd')), value)).toBe(false);
      expect(shouldFold(flat(leaves(10, 'd')), value)).toBe(true);
    }
  });

  test('the caller can pass the keys it offers, such as a derived key', () => {
    expect(shouldFold(flat(leaves(9, 'd')), '@released', ['Region', '@released'])).toBe(true);
    expect(shouldFold(flat(leaves(9, 'd')), '@released', ['Region'])).toBe(false);
  });

  test('an empty ?graphGroup= is no choice: the threshold decides', () => {
    expect(shouldFold(flat(leaves(9, 'd')), '')).toBe(false);
    expect(shouldFold(flat(leaves(10, 'd')), null)).toBe(true);
  });
});

// ── which Deployments earn cards ──────────────────────────────────────────

test.describe('cards, worst first, capped at 12', () => {
  test('one card per condition, in the order Degraded > Out of sync > Gated > Progressing > Unreleased', () => {
    // Names in reverse severity, so a name sort alone would give the wrong order.
    const model = buildFoldModel({
      deployments: flat([
        { name: 'a-unreleased', is: ['unreleased'] },
        { name: 'b-progressing', is: ['progressing'] },
        { name: 'c-gated', is: ['gated'] },
        { name: 'd-outofsync', is: ['outOfSync'] },
        { name: 'e-degraded', is: ['degraded'] },
        ...leaves(18, 'q'),
      ]),
      groupKey: null,
    });
    const root = fold(model, 'root');
    expect(cardIds(root)).toEqual([
      'e-degraded',
      'd-outofsync',
      'c-gated',
      'b-progressing',
      'a-unreleased',
    ]);
    expect(root.cards.map((c) => c.severity)).toEqual([5, 4, 3, 2, 1]);
    expect(root.cards.every((c) => c.reason === 'exception')).toBe(true);
  });

  test('a Deployment with two problems is ranked by its worst', () => {
    const model = buildFoldModel({
      deployments: flat([
        { name: 'a-gated', is: ['gated'] },
        { name: 'z-degraded-and-unreleased', is: ['unreleased', 'degraded'] },
        ...leaves(19, 'q'),
      ]),
      groupKey: null,
    });
    expect(cardIds(fold(model, 'root'))).toEqual(['z-degraded-and-unreleased', 'a-gated']);
  });

  test('Stale never earns a card, even when it is the only thing wrong', () => {
    // 4 Stale of 25 is under the wave share, so Stale is not hidden by a wave
    // here either: it still gets no card, only a mark in its stack's strip.
    const model = buildFoldModel({
      deployments: flat([...leaves(4, 'stale', ['stale']), ...leaves(21, 'q')]),
      groupKey: null,
    });
    const root = fold(model, 'root');
    expect(root.waves).toEqual([]);
    expect(root.cards).toEqual([]);
    for (const id of ['stale01', 'stale02', 'stale03', 'stale04']) {
      expect(model.location.get(id)?.kind).toBe('stack');
      expect(stripMark(model.conditions.get(id)!, root.waveSet)).toBe('stale');
    }
  });

  test(`the cap keeps the ${CARD_CAP} worst, and the rest stay coloured in stacks`, () => {
    // 1 Degraded + 2 Gated + 12 Unreleased = 15 exceptions; the 3 over the cap
    // must be the least severe (the last Unreleased by name).
    const model = buildFoldModel({
      deployments: flat([
        ...leaves(12, 'u', ['unreleased'], { Region: 'eu' }),
        ...leaves(2, 'g', ['gated'], { Region: 'eu' }),
        { name: 'x-degraded', is: ['degraded'], labels: { Region: 'eu' } },
        ...leaves(10, 'q', [], { Region: 'eu' }),
      ]),
      groupKey: 'Region',
    });
    const root = fold(model, 'root');
    expect(root.waves).toEqual([]);
    expect(root.cards).toHaveLength(CARD_CAP);
    expect(cardIds(root).slice(0, 3)).toEqual(['x-degraded', 'g01', 'g02']);
    expect(root.overCapIds).toEqual(['u10', 'u11', 'u12']);
    // Over-cap members are quiet in the fold, but never lose their colour.
    expect(root.quietCount).toBe(13);
    for (const id of root.overCapIds) {
      expect(model.location.get(id)?.kind).toBe('stack');
      expect(stripMark(model.conditions.get(id)!, root.waveSet)).toBe('unreleased');
    }
  });

  test('the cap is per Base, not per Component', () => {
    const model = buildFoldModel({
      deployments: tree({
        dev: leaves(13, 'dev', ['degraded']),
        prod: leaves(13, 'prod', ['degraded']),
      }),
      groupKey: null,
    });
    for (const baseId of ['dev', 'prod']) {
      expect(fold(model, baseId).cards).toHaveLength(CARD_CAP);
      expect(fold(model, baseId).overCapIds).toHaveLength(1);
    }
  });
});

// ── waves ─────────────────────────────────────────────────────────────────

test.describe('a config condition on most of a Base is one wave', () => {
  // Each case is one Base of `members` with `hit` of them Stale; a second Base
  // keeps the Component at 10 or more so it folds.
  const cases: { members: number; hit: number; wave: boolean; why: string }[] = [
    { members: 10, hit: 5, wave: true, why: 'exactly 50% and exactly 5' },
    { members: 11, hit: 5, wave: false, why: '5 but under 50%' },
    { members: 8, hit: 4, wave: false, why: '50% but only 4' },
    { members: 5, hit: 5, wave: true, why: 'all 5' },
    { members: 4, hit: 4, wave: false, why: 'all, but only 4' },
    { members: 30, hit: 15, wave: true, why: 'half of a large Base' },
    { members: 30, hit: 14, wave: false, why: 'just under half of a large Base' },
  ];
  for (const { members, hit, wave, why } of cases) {
    test(`${hit} Stale of ${members}: ${wave ? 'a wave' : 'no wave'} (${why})`, () => {
      const model = buildFoldModel({
        deployments: tree({
          a: [...leaves(hit, 's', ['stale']), ...leaves(members - hit, 'q')],
          other: leaves(21, 'o'),
        }),
        groupKey: null,
      });
      const a = fold(model, 'a');
      expect(waveKinds(a)).toEqual(wave ? ['stale'] : []);
      if (wave) {
        expect(a.waves[0].count).toBe(hit);
        expect(a.waves[0].memberIds).toHaveLength(hit);
      }
      expect(fold(model, 'other').waves).toEqual([]);
    });
  }

  for (const kind of ['degraded', 'outOfSync', 'progressing'] as const) {
    test(`live health is never a wave: ${kind} on every member`, () => {
      const model = buildFoldModel({
        deployments: flat(leaves(25, 'd', [kind])),
        groupKey: null,
      });
      const root = fold(model, 'root');
      expect(root.waves).toEqual([]);
      expect(root.cards).toHaveLength(CARD_CAP);
      expect(root.overCapIds).toHaveLength(25 - CARD_CAP);
    });
  }

  test('a Gated wave: one "Review gates" action, no Gated cards, no Gated marks', () => {
    const model = buildFoldModel({
      deployments: flat([...leaves(12, 'g', ['gated']), ...leaves(10, 'q')]),
      groupKey: null,
    });
    const root = fold(model, 'root');
    expect(root.waves).toMatchObject([{ condition: 'gated', count: 12 }]);
    expect(waveActionLabel('gated', 12)).toBe('Review gates');
    expect(root.cards).toEqual([]);
    for (const id of root.waves[0].memberIds) {
      expect(stripMark(model.conditions.get(id)!, root.waveSet)).toBe('quiet');
    }
  });

  test('the action words for each wave', () => {
    expect(waveActionLabel('stale', 55)).toBe('Upgrade 55');
    expect(waveActionLabel('unreleased', 14)).toBe('Release 14');
    expect(waveActionLabel('gated', 14)).toBe('Review gates');
  });

  test('a wave hides only its own condition: a waved member that is also Degraded keeps its card', () => {
    const model = buildFoldModel({
      deployments: flat([
        { name: 'bad', is: ['unreleased', 'degraded'] },
        ...leaves(10, 'u', ['unreleased']),
        ...leaves(10, 'q'),
      ]),
      groupKey: null,
    });
    const root = fold(model, 'root');
    expect(waveKinds(root)).toEqual(['unreleased']);
    expect(root.waves[0].count).toBe(11);
    expect(root.cards).toMatchObject([{ id: 'bad', severity: 5 }]);
    // The Unreleased-only members are covered by the wave: no card, no colour.
    expect(model.location.get('u01')?.kind).toBe('stack');
    expect(stripMark(model.conditions.get('u01')!, root.waveSet)).toBe('quiet');
  });

  test('two waves on one Base, in the order Stale, Unreleased, Gated', () => {
    const model = buildFoldModel({
      deployments: flat([
        ...leaves(12, 'b', ['gated', 'stale']),
        ...leaves(10, 'q', ['stale']),
      ]),
      groupKey: null,
    });
    expect(waveKinds(fold(model, 'root'))).toEqual(['stale', 'gated']);
  });

  test('a wave on one Base does not hide the same condition on another', () => {
    const model = buildFoldModel({
      deployments: tree({
        uat: leaves(10, 'uat', ['unreleased']),
        prod: [{ name: 'prod-u', is: ['unreleased'] }, ...leaves(12, 'prod')],
      }),
      groupKey: null,
    });
    expect(waveKinds(fold(model, 'uat'))).toEqual(['unreleased']);
    expect(fold(model, 'uat').cards).toEqual([]);
    expect(waveKinds(fold(model, 'prod'))).toEqual([]);
    expect(cardIds(fold(model, 'prod'))).toEqual(['prod-u']);
  });
});

// ── a group of 1 is never a stack ─────────────────────────────────────────

test.describe('groups of 1', () => {
  /** 18 quiet in Region "big", plus `singles` quiet ones in their own Region. */
  function withSingles(singles: number) {
    const model = buildFoldModel({
      deployments: flat([
        ...leaves(18, 'big', [], { Region: 'big' }),
        ...Array.from({ length: singles }, (_, i) => ({
          name: `one${i + 1}`,
          labels: { Region: `r${i + 1}` },
        })),
      ]),
      groupKey: 'Region',
    });
    return fold(model, 'root').groups;
  }

  for (const singles of [1, 2, 3]) {
    test(`${singles} group(s) of 1 stay plain quiet cards`, () => {
      const groups = withSingles(singles);
      expect(groups.filter((g) => g.kind === 'loose')).toHaveLength(singles);
      expect(groups.filter((g) => g.kind === 'other')).toHaveLength(0);
      expect(groups.filter((g) => g.kind === 'stack')).toHaveLength(1);
    });
  }

  for (const singles of [4, 7]) {
    test(`${singles} groups of 1 merge into one stack`, () => {
      const groups = withSingles(singles);
      expect(groups.filter((g) => g.kind === 'loose')).toHaveLength(0);
      const other = groups.filter((g) => g.kind === 'other');
      expect(other).toHaveLength(1);
      expect(other[0].memberIds).toHaveLength(singles);
      expect(other[0].label).toBe('Other regions');
    });
  }

  test('only groups of 1: "N regions, 1 each"', () => {
    const model = buildFoldModel({
      deployments: flat(
        Array.from({ length: 21 }, (_, i) => ({ name: `d${i}`, labels: { Region: `r${i}` } })),
      ),
      groupKey: 'Region',
    });
    const groups = fold(model, 'root').groups;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'other', label: '21 regions, 1 each' });
  });

  test('a card that leaves its group can turn a stack of 2 into a quiet card, never a stack of 1', () => {
    const model = buildFoldModel({
      deployments: flat([
        { name: 'pair-a', is: ['degraded'], labels: { Region: 'pair' } },
        { name: 'pair-b', labels: { Region: 'pair' } },
        ...leaves(20, 'big', [], { Region: 'big' }),
      ]),
      groupKey: 'Region',
    });
    const groups = fold(model, 'root').groups;
    expect(groups.find((g) => g.value === 'pair')).toMatchObject({
      kind: 'loose',
      memberIds: ['pair-b'],
    });
    for (const g of groups) {
      if (g.kind !== 'loose') expect(g.memberIds.length, g.id).toBeGreaterThan(1);
    }
  });
});

// ── the default Group by ──────────────────────────────────────────────────

test.describe('the default Group by is fixed', () => {
  const byLabels = (labels: Record<string, string>[]) =>
    foldMembers(flat(labels.map((l, i) => ({ name: `d${i}`, labels: l }))));

  test('Department when it has 2 or more values', () => {
    const members = byLabels([
      { Department: 'retail', Region: 'eu' },
      { Department: 'payments', Region: 'us' },
      { Department: 'retail', Region: 'ap' },
    ]);
    expect(defaultGroupKey(members)).toBe('Department');
  });

  test('Region when Department has one value', () => {
    const members = byLabels([
      { Department: 'retail', Region: 'eu' },
      { Department: 'retail', Region: 'us' },
      { Department: 'retail', Region: 'eu' },
    ]);
    expect(defaultGroupKey(members)).toBe('Region');
    expect(groupByOptions(members).map((o) => o.key)).toEqual(['Region']);
  });

  test('Department on only some members still splits them ("No department" is a value)', () => {
    const members = byLabels([
      { Department: 'retail', Region: 'eu' },
      { Department: 'retail', Region: 'us' },
      { Region: 'us' },
    ]);
    expect(defaultGroupKey(members)).toBe('Department');
  });

  test('neither: the first other option by name; nothing splits: none', () => {
    expect(
      defaultGroupKey(
        byLabels([
          { Zone: 'a', Cloud: 'x' },
          { Zone: 'b', Cloud: 'y' },
          { Zone: 'a', Cloud: 'x' },
        ]),
      ),
    ).toBe('Cloud');
    expect(defaultGroupKey(byLabels([{ Region: 'eu' }, { Region: 'eu' }]))).toBeNull();
  });

  test('a key with one Deployment per value is not offered: it makes only "1 each" stacks', () => {
    const members = byLabels([
      { Cluster: 'c1', Region: 'eu' },
      { Cluster: 'c2', Region: 'eu' },
      { Cluster: 'c3', Region: 'us' },
    ]);
    expect(groupByOptions(members).map((o) => o.key)).toEqual(['Region']);
  });

  test('the Stage label is offered even when it makes only groups of 1, but is never the default', () => {
    const members = byLabels([
      { Stage: 'dev', Region: 'eu' },
      { Stage: 'prod', Region: 'eu' },
    ]);
    expect(groupByOptions(members)).toEqual([
      { key: 'Stage', label: 'Stage', valueCount: 2, isDefault: false },
    ]);
    expect(defaultGroupKey(members)).toBeNull();
  });

  test('Stage is not the default even when its name sorts first', () => {
    const members = byLabels([
      { Stage: 'dev', Zone: 'a' },
      { Stage: 'dev', Zone: 'b' },
      { Stage: 'prod', Zone: 'a' },
    ]);
    expect(groupByOptions(members).map((o) => o.key)).toEqual(['Zone', 'Stage']);
    expect(defaultGroupKey(members)).toBe('Zone');
  });

  test('health never changes the default', () => {
    const labels = (i: number) => ({
      Department: i % 2 ? 'retail' : 'payments',
      Region: `r${i % 3}`,
    });
    const healthy = flat(
      Array.from({ length: 22 }, (_, i) => ({ name: `d${i}`, labels: labels(i) })),
    );
    const broken = flat(
      Array.from({ length: 22 }, (_, i) => ({
        name: `d${i}`,
        labels: labels(i),
        is: (i % 2 ? ['degraded'] : ['stale']) as Condition[],
      })),
    );
    expect(defaultGroupKey(foldMembers(healthy))).toBe('Department');
    expect(defaultGroupKey(foldMembers(broken))).toBe('Department');
  });
});

// ── layout and Fit on the Meridian data ───────────────────────────────────

const FOLDED: MeridianComponentName[] = ['cert-manager', 'traefik', 'checkout'];
const SCREEN: Size = { width: 1224, height: 796 };
const NONE: ReadonlySet<string> = new Set();

function fittedLayout(name: MeridianComponentName, container: Size) {
  const deployments = meridianComponent(name);
  const model = buildFoldModel({
    deployments,
    groupKey: defaultGroupKey(foldMembers(deployments)),
  });
  const fit = solveFoldedFit(
    (availableWidth) =>
      computeFoldedLayout(deployments, model, { availableWidth, expandedGroupIds: NONE }),
    container,
  );
  const layoutWith = (expandedGroupIds: ReadonlySet<string>): FoldLayout =>
    computeFoldedLayout(deployments, model, {
      availableWidth: fit.frozen.availableWidth,
      frozen: fit.frozen,
      expandedGroupIds,
    });
  return { deployments, model, fit, layoutWith };
}

const byId = (layout: FoldLayout) => new Map(layout.nodes.map((n) => [n.id, n]));

test.describe('expand a stack in place', () => {
  for (const name of FOLDED) {
    test(`${name}: for every stack, nothing moves sideways and nothing moves up`, () => {
      const { model, fit, layoutWith } = fittedLayout(name, SCREEN);
      const closed = layoutWith(NONE);
      const before = byId(closed);
      const stacks = [...model.bases.values()].flatMap((b) =>
        b.groups.filter((g) => g.kind !== 'loose'),
      );
      expect(stacks.length).toBeGreaterThan(0);

      for (const stack of stacks) {
        const open = layoutWith(new Set([stack.id]));
        const after = byId(open);
        const stackNode = before.get(stack.id)!;
        const bandTop = before.get(`fold:${stackNode.baseId}`)!.y;
        for (const node of closed.nodes) {
          const moved = after.get(node.id);
          expect(moved, `${stack.id}: ${node.id} still drawn`).toBeDefined();
          expect(moved!.x, `${stack.id}: ${node.id} x`).toBe(node.x);
          expect(moved!.y, `${stack.id}: ${node.id} y`).toBeGreaterThanOrEqual(node.y);
          // Bands above the opened one do not move at all.
          if (node.y + node.height <= bandTop && node.placement !== 'tree') {
            expect(moved!.y, `${stack.id}: ${node.id} above`).toBe(node.y);
          }
        }
        // The columns Fit chose stay frozen.
        expect(open.frozen.stackColumnsByBase).toEqual(fit.frozen.stackColumnsByBase);
        expect(open.frozen.cardColumnsByBase).toEqual(fit.frozen.cardColumnsByBase);
        expect(open.width).toBe(closed.width);
        // Closing it again puts every node back where it was.
        const reclosed = layoutWith(NONE);
        expect(reclosed.nodes).toEqual(closed.nodes);
      }
    });
  }

  test('opening every stack at once still moves nothing sideways', () => {
    const { model, layoutWith } = fittedLayout('cert-manager', SCREEN);
    const all = new Set(
      [...model.bases.values()].flatMap((b) =>
        b.groups.filter((g) => g.kind !== 'loose').map((g) => g.id),
      ),
    );
    const closed = layoutWith(NONE);
    const after = byId(layoutWith(all));
    for (const node of closed.nodes) {
      expect(after.get(node.id)!.x, node.id).toBe(node.x);
      expect(after.get(node.id)!.y, node.id).toBeGreaterThanOrEqual(node.y);
    }
  });
});

test.describe('Fit keeps a readable floor and shows "More below"', () => {
  const containers: Size[] = [];
  for (const width of [640, 900, 1064, 1224, 1600, 2200]) {
    for (const height of [360, 500, 700, 796, 1000, 1400]) containers.push({ width, height });
  }

  for (const name of FOLDED) {
    test(`${name}: zoom 80%-100% at every size, and "More below" exactly when it is tall`, () => {
      for (const container of containers) {
        const { fit, layoutWith } = fittedLayout(name, container);
        const layout = layoutWith(NONE);
        const where = `${container.width}x${container.height}`;
        const { zoom } = fit.viewport;
        expect(zoom, where).toBeGreaterThanOrEqual(READABLE_ZOOM_FLOOR);
        expect(zoom, where).toBeLessThanOrEqual(1);
        // Fit chose the columns for the zoom: the frozen width is what that zoom leaves.
        expect(fit.frozen.availableWidth, where).toBeCloseTo((container.width - 36) / zoom, 6);

        const hidden = hiddenBelowPx(fit.viewport, layout.height, container);
        if (fit.tall) {
          expect(zoom, where).toBe(READABLE_ZOOM_FLOOR);
          expect(fit.viewport.y, where).toBe(FIT_TOP);
          // Tall means it overflows at 80%: below (the cue shows) or, on a very
          // narrow canvas, only to the right (nothing is below, so no cue).
          const overflowsRight = layout.width * zoom > container.width - 36 + 1;
          expect(hidden > 0 || overflowsRight, where).toBe(true);
        } else {
          expect(hidden, where).toBe(0);
          expect(layout.height * zoom, where).toBeLessThanOrEqual(container.height - 42);
        }
      }
    });
  }

  test('"More below" pans down at the same zoom until nothing is hidden', () => {
    const container = { width: 1064, height: 500 };
    const { fit, layoutWith } = fittedLayout('cert-manager', container);
    expect(fit.tall).toBe(true);
    const layout = layoutWith(NONE);
    let viewport = fit.viewport;
    let clicks = 0;
    while (hiddenBelowPx(viewport, layout.height, container) >= MORE_BELOW_MIN_HIDDEN) {
      const next = panDownViewport(viewport, layout.height, container);
      expect(next.zoom).toBe(fit.viewport.zoom);
      expect(next.x).toBe(viewport.x);
      expect(next.y).toBeLessThan(viewport.y);
      viewport = next;
      clicks++;
      expect(clicks).toBeLessThan(20);
    }
    expect(clicks).toBeGreaterThan(0);
    expect(hiddenBelowPx(viewport, layout.height, container)).toBe(0);
    expect(panDownViewport(viewport, layout.height, container)).toBe(viewport);
  });
});

// ── stability over polls ──────────────────────────────────────────────────

test.describe('a recovered card stays 60 s; a selected card never folds', () => {
  const broken = flat([
    { name: 'flaky', is: ['degraded'], labels: { Region: 'eu' } },
    ...leaves(21, 'q', [], { Region: 'eu' }),
  ]);
  const recovered = broken.map((d) =>
    d.deploymentId === 'flaky'
      ? { ...d, liveStatus: { Sync: 'Synced' as const, Health: 'Healthy' as const } }
      : d,
  );
  const noHolds: ReadonlyMap<string, number> = new Map();
  const T0 = 1_000_000;

  function recoverAt(selectedIds: ReadonlySet<string>) {
    const first = stepFoldStability({
      deployments: broken,
      groupKey: 'Region',
      previous: null,
      holds: noHolds,
      selectedIds,
      now: T0 - 2_000,
    });
    const step = stepFoldStability({
      deployments: recovered,
      groupKey: 'Region',
      previous: first.model,
      holds: first.holds,
      selectedIds,
      now: T0,
    });
    const poll = (at: number, previous = step) =>
      stepFoldStability({
        deployments: recovered,
        groupKey: 'Region',
        previous: previous.model,
        holds: previous.holds,
        selectedIds,
        now: at,
      });
    return { first, step, poll };
  }

  const cardOf = (model: FoldModel, id: string) =>
    fold(model, 'root').cards.find((c) => c.id === id);

  test('the poll that sees it recover keeps it as a "recovered" card', () => {
    const { first, step } = recoverAt(new Set());
    expect(cardOf(first.model, 'flaky')?.reason).toBe('exception');
    expect(cardOf(step.model, 'flaky')?.reason).toBe('recovered');
    expect(step.holds.get('flaky')).toBe(T0 + RECOVERED_HOLD_MS);
  });

  test('still a card at 59.999 s; folded back into its stack at 60 s', () => {
    const { step, poll } = recoverAt(new Set());
    const justBefore = poll(T0 + RECOVERED_HOLD_MS - 1);
    expect(cardOf(justBefore.model, 'flaky')?.reason).toBe('recovered');
    const atEnd = poll(T0 + RECOVERED_HOLD_MS, justBefore);
    expect(cardOf(atEnd.model, 'flaky')).toBeUndefined();
    expect(atEnd.model.location.get('flaky')?.kind).toBe('stack');
    expect(atEnd.holds.has('flaky')).toBe(false);
    expect(step.holds.has('flaky')).toBe(true);
  });

  test('a selected card is still a card long after the hold', () => {
    const selected = new Set(['flaky']);
    const { poll } = recoverAt(selected);
    let s = poll(T0 + RECOVERED_HOLD_MS);
    for (let t = 1; t <= 5; t++) s = poll(T0 + RECOVERED_HOLD_MS + t * 60_000, s);
    expect(cardOf(s.model, 'flaky')?.reason).toBe('selected');
  });

  test('selecting a quiet stack member does not pull it out of its stack', () => {
    const s = stepFoldStability({
      deployments: broken,
      groupKey: 'Region',
      previous: null,
      holds: noHolds,
      selectedIds: new Set(['q01']),
      now: T0,
    });
    const again = stepFoldStability({
      deployments: broken,
      groupKey: 'Region',
      previous: s.model,
      holds: s.holds,
      selectedIds: new Set(['q01']),
      now: T0 + 2_000,
    });
    expect(again.model.location.get('q01')?.kind).toBe('stack');
  });
});

test.describe('label values that are odd', () => {
  const groupsOf = (labels: Record<string, string>[], key = 'Region') =>
    fold(
      buildFoldModel({
        deployments: flat(
          labels.map((l, i) => ({ name: `d${String(i).padStart(2, '0')}`, labels: l })),
        ),
        groupKey: key,
      }),
      'root',
    ).groups;

  test('a value spelled __other never shares an id with the merged stack', () => {
    // Four groups of 1 merge into the "other" stack; one more group is a pair
    // whose value is spelled like the merged stack's reserved word.
    const groups = groupsOf([
      { Region: '__other' },
      { Region: '__other' },
      { Region: 'a' },
      { Region: 'b' },
      { Region: 'c' },
      { Region: 'd' },
    ]);
    const ids = groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(groups.filter((g) => g.kind === 'other')).toHaveLength(1);
    expect(groups.find((g) => g.value === '__other')?.kind).toBe('stack');
  });

  test('a blank value is the no-value bucket, not a stack named " "', () => {
    const groups = groupsOf([
      { Region: ' ' },
      { Region: '' },
      {},
      { Region: 'eu' },
      { Region: 'eu' },
    ]);
    expect(groups.map((g) => g.label)).toEqual(['eu', 'No region']);
    expect(groups.find((g) => g.value === null)?.memberIds).toHaveLength(3);
  });

  test('surrounding spaces are not part of a value', () => {
    const groups = groupsOf([{ Region: ' eu ' }, { Region: 'eu' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('eu');
  });

  test('Retail and retail are one stack, shown as the first spelling met', () => {
    const groups = groupsOf([
      { Region: 'Retail' },
      { Region: 'retail' },
      { Region: 'RETAIL' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'stack', label: 'Retail', value: 'Retail' });
    expect(groups[0].memberIds).toHaveLength(3);
  });

  test('the Group by menu counts them the same way', () => {
    const members = flat([
      { name: 'a1', labels: { Dept: 'Retail', Region: 'x' } },
      { name: 'a2', labels: { Dept: 'retail', Region: 'x' } },
      { name: 'a3', labels: { Dept: ' ', Region: 'y' } },
      { name: 'a4', labels: { Dept: '', Region: 'y' } },
    ]);
    const options = groupByOptions(foldMembers(members));
    expect(options.find((o) => o.key === 'Dept')?.valueCount).toBe(2);
    expect(options.find((o) => o.key === 'Region')?.valueCount).toBe(2);
  });
});
