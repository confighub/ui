// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The decisions behind folding a large Component's flow graph: which
// Deployments get a full card, which conditions become one wave on a Base,
// and how the quiet rest stacks by one label.
//
// The numbers come from the chosen design, tried on the Meridian demo. If one of
// them fails, a rule in the model differs from the reviewed design: fix the
// rule, not the number.
import { expect, test } from '@playwright/test';

import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import {
  cardSeverity,
  conditionsOf,
  stripMark,
} from '../src/pages/x/apps/flow-graph/fold/deploymentCondition';
import {
  type FoldModel,
  buildFoldModel,
  countCards,
  countStacks,
  foldMembers,
  keepSelectedCards,
  locationText,
  shouldFold,
  updateRecoveredHolds,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  defaultGroupKey,
  groupByOptions,
  groupKeyPlural,
  resolveGroupKey,
} from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { type MeridianComponentName, meridianComponent } from './fixtures/meridianFoldFixture';

const COMPONENTS: MeridianComponentName[] = [
  'cert-manager',
  'traefik',
  'checkout',
  'fraud-scoring',
];

/** The model with the Component's default Group by, as the graph first shows it. */
function defaultModel(deployments: ComponentDeployment[]): FoldModel {
  return buildFoldModel({ deployments, groupKey: defaultGroupKey(foldMembers(deployments)) });
}

function allCards(model: FoldModel) {
  return [...model.bases.values()].flatMap((b) => b.cards);
}

function baseFold(model: FoldModel, baseId: string) {
  const fold = model.bases.get(baseId);
  if (!fold) throw new Error(`no fold for Base ${baseId}`);
  return fold;
}

/** A copy of the nodes with one Deployment changed. */
function withChange(
  deployments: ComponentDeployment[],
  id: string,
  change: Partial<ComponentDeployment>,
): ComponentDeployment[] {
  return deployments.map((d) => (d.deploymentId === id ? { ...d, ...change } : d));
}

const QUIET_SIGNALS = { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 };

/** A root Base with the given leaf Deployments below it. */
function syntheticComponent(
  members: { name: string; labels?: Record<string, string>; health?: string }[],
): ComponentDeployment[] {
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
    liveStatusProvider: 'unknown',
    labels: {},
    configSignals: QUIET_SIGNALS,
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
        liveStatus: { syncStatus: 'Synced', healthStatus: m.health ?? 'Healthy' },
        liveStatusProvider: 'argocd',
        labels: m.labels ?? {},
        configSignals: QUIET_SIGNALS,
      }),
    ),
  ];
}

const named = (n: number, prefix = 'd') =>
  Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${String(i + 1).padStart(2, '0')}`,
  }));

test.describe('when a Component folds', () => {
  test('fraud-scoring (14 Deployments) folds', () => {
    const deployments = meridianComponent('fraud-scoring');
    expect(deployments.filter((d) => d.type === 'Deployment')).toHaveLength(14);
    expect(shouldFold(deployments)).toBe(true);
  });

  test('it folds at 10 Deployments, not at 9', () => {
    expect(shouldFold(syntheticComponent(named(10)))).toBe(true);
    expect(shouldFold(syntheticComponent(named(9)))).toBe(false);
  });

  test('the user’s choice wins over the threshold', () => {
    expect(shouldFold(meridianComponent('cert-manager'), 'off')).toBe(false);
    const labelled = syntheticComponent([
      { name: 'a', labels: { Department: 'retail' } },
      { name: 'b', labels: { Department: 'retail' } },
      { name: 'c', labels: { Department: 'logistics' } },
    ]);
    expect(shouldFold(labelled, 'Department')).toBe(true);
  });

  test('Bases do not count towards the threshold', () => {
    const deployments = syntheticComponent(named(9));
    const extraBase = {
      ...deployments[0],
      deploymentId: 'b2',
      slug: 'b2',
      parentDeploymentId: 'root',
    };
    expect(shouldFold([...deployments, extraBase])).toBe(false);
  });
});

test.describe('conditions and severity', () => {
  const traefik = meridianComponent('traefik');
  const byId = new Map(traefik.map((d) => [d.deploymentId, d]));
  const cond = (id: string) => conditionsOf(byId.get(id)!);
  const noWaves = new Set<never>();

  test('severity runs Degraded > Out of sync > Gated > Progressing > Unreleased', () => {
    expect(cardSeverity(cond('eu-central-payments-prod2'), noWaves)).toBe(5);
    expect(cardSeverity(cond('eu-west-retail-prod2'), noWaves)).toBe(4);
    expect(cardSeverity(cond('eu-central-prod3'), noWaves)).toBe(2);
    expect(cardSeverity(cond('eu-central-payments-prod1'), noWaves)).toBe(1);
    expect(cardSeverity(cond('eu-central-prod1'), noWaves)).toBe(0);
    const gated = conditionsOf({
      ...byId.get('eu-central-prod1')!,
      configSignals: { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 1 },
    });
    expect(cardSeverity(gated, noWaves)).toBe(3);
  });

  test('Stale never earns a card, and a wave condition does not count', () => {
    const stale = conditionsOf({
      ...byId.get('eu-central-prod1')!,
      configSignals: { staleUnits: 2, unreleasedUnits: 3, gatedUnits: 0 },
    });
    expect(cardSeverity(stale, noWaves)).toBe(1);
    expect(cardSeverity(stale, new Set(['unreleased'] as const))).toBe(0);
    expect(stripMark(stale, new Set(['unreleased'] as const))).toBe('stale');
    expect(stripMark(stale, new Set(['unreleased', 'stale'] as const))).toBe('quiet');
  });
});

test.describe('cert-manager (99 Deployments under four Bases)', () => {
  const deployments = meridianComponent('cert-manager');
  const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
  const model = defaultModel(deployments);

  test('it folds and groups by Department', () => {
    expect(deployments.filter((d) => d.type === 'Deployment')).toHaveLength(99);
    expect(shouldFold(deployments)).toBe(true);
    expect(model.groupKey).toBe('Department');
  });

  test('only the three Unreleased Deployments get cards', () => {
    const cards = allCards(model);
    expect(countCards(model)).toBe(3);
    expect(cards.map((c) => c.id).sort()).toEqual([
      'ap-northeast-logistics-prod1',
      'us-east-retail-uat1',
      'us-west-logistics-prod1',
    ]);
    for (const card of cards) {
      expect(card.reason).toBe('exception');
      expect(model.conditions.get(card.id)?.unreleased).toBe(true);
    }
  });

  test('Stale is a wave on uat (15) and prod (55), and earns no card', () => {
    const waves = (baseId: string) =>
      baseFold(model, baseId).waves.map((w) => [w.condition, w.count]);
    expect(waves('uat')).toEqual([['stale', 15]]);
    expect(waves('prod')).toEqual([['stale', 55]]);
    expect(waves('dev')).toEqual([]);
    expect(waves('test')).toEqual([]);
    const staleCount = deployments.filter((d) => d.configSignals.staleUnits > 0).length;
    expect(staleCount).toBe(70);
    for (const card of allCards(model)) expect(card.severity).toBeGreaterThan(0);
  });

  test('the root Base is a tree node, not a fold', () => {
    expect([...model.bases.keys()].sort()).toEqual(['dev', 'prod', 'test', 'uat']);
    expect(model.location.has('base')).toBe(false);
  });

  test('15 stacks in total', () => {
    expect(countStacks(model)).toBe(15);
  });

  test('test Base: 13 quiet, 1 loose card and 3 stacks', () => {
    const test = baseFold(model, 'test');
    expect(test.quietCount).toBe(13);
    const loose = test.groups.filter((g) => g.kind === 'loose');
    expect(loose).toHaveLength(1);
    expect(loose[0].memberIds).toEqual(['eu-central-logistics-test1']);
    expect(test.groups.filter((g) => g.kind === 'stack')).toHaveLength(3);
  });

  test('dev Base groups by Department, "No department" last', () => {
    const dev = baseFold(model, 'dev');
    expect(dev.groups.map((g) => [g.label, g.memberIds.length])).toEqual([
      ['logistics', 2],
      ['payments', 2],
      ['retail', 2],
      ['No department', 10],
    ]);
    expect(dev.groups.map((g) => g.id)).toEqual([
      'stack:dev:v:logistics',
      'stack:dev:v:payments',
      'stack:dev:v:retail',
      'stack:dev:__none',
    ]);
    const none = dev.groups[3].memberIds;
    expect(none).toEqual([...none].sort((a, b) => a.localeCompare(b)));
  });

  test('every member has one location, and it reads as words', () => {
    const members = foldMembers(deployments);
    expect(members).toHaveLength(99);
    for (const m of members) expect(model.location.has(m.deploymentId)).toBe(true);
    expect(locationText('us-east-retail-uat1', model, byId)).toBe('uat Base › card');
    expect(locationText('us-west-prod1', model, byId)).toBe('prod Base › No department stack');
    expect(locationText('eu-west-retail-prod1', model, byId)).toBe('prod Base › retail stack');
    expect(locationText('eu-central-logistics-test1', model, byId)).toBe(
      'test Base › quiet card, logistics',
    );
    expect(locationText('prod', model, byId)).toBe('prod');
  });
});

test.describe('checkout (every Deployment is retail)', () => {
  const deployments = meridianComponent('checkout');
  const model = defaultModel(deployments);

  test('the default Group by falls back to Region', () => {
    expect(model.groupKey).toBe('Region');
  });

  test('prod has a Gated wave of 14 and no Gated card', () => {
    const prod = baseFold(model, 'prod');
    const gated = prod.waves.find((w) => w.condition === 'gated');
    expect(gated?.count).toBe(14);
    expect(prod.waveSet.has('gated')).toBe(true);
    for (const card of prod.cards) {
      const mark = stripMark(model.conditions.get(card.id)!, prod.waveSet);
      expect(mark).not.toBe('gated');
      expect(mark).not.toBe('unreleased');
    }
    expect(prod.cards.map((c) => c.id)).toEqual([
      'eu-north-retail-prod1',
      'ap-southeast-retail-prod1',
      'us-west-retail-prod2',
    ]);
  });
});

test.describe('traefik (live problems spread over Bases)', () => {
  const model = defaultModel(meridianComponent('traefik'));

  test('7 cards, worst first and then by name', () => {
    expect(countCards(model)).toBe(7);
    expect(baseFold(model, 'prod').cards.map((c) => [c.id, c.severity])).toEqual([
      ['eu-central-payments-prod2', 5],
      ['eu-west-retail-prod2', 4],
      ['us-east-payments-prod3', 4],
      ['eu-central-prod3', 2],
      ['eu-central-payments-prod1', 1],
    ]);
    expect(baseFold(model, 'dev').cards.map((c) => c.id)).toEqual(['us-east-logistics-dev1']);
    expect(baseFold(model, 'test').cards.map((c) => c.id)).toEqual(['us-west-test1']);
    expect(baseFold(model, 'uat').cards).toEqual([]);
  });
});

test.describe('a group of 1 is never a stack', () => {
  test('8 distinct Regions merge into "8 regions, 1 each"', () => {
    const deployments = syntheticComponent(
      named(8).map((m, i) => ({ ...m, labels: { Region: `r${i + 1}` } })),
    );
    const groups = baseFold(
      buildFoldModel({ deployments, groupKey: 'Region' }),
      'root',
    ).groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('other');
    expect(groups[0].label).toBe('8 regions, 1 each');
    expect(groups[0].id).toBe('stack:root:__other');
    expect(groups[0].memberIds).toHaveLength(8);
    expect(groups[0].mergedLabels).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);
  });

  test('4 singles beside a real group merge into "Other regions"', () => {
    const regions = ['a', 'a', 'b', 'c', 'd', 'e'];
    const deployments = syntheticComponent(
      named(6).map((m, i) => ({ ...m, labels: { Region: regions[i] } })),
    );
    const groups = baseFold(
      buildFoldModel({ deployments, groupKey: 'Region' }),
      'root',
    ).groups;
    expect(groups.map((g) => [g.kind, g.label, g.memberIds.length])).toEqual([
      ['stack', 'a', 2],
      ['other', 'Other regions', 4],
    ]);
  });

  test('3 singles stay plain quiet cards in their sorted place', () => {
    const regions = ['a', 'a', 'b', 'c', 'c', 'd', 'e'];
    const deployments = syntheticComponent(
      named(7).map((m, i) => ({ ...m, labels: { Region: regions[i] } })),
    );
    const model = buildFoldModel({ deployments, groupKey: 'Region' });
    const groups = baseFold(model, 'root').groups;
    expect(groups.map((g) => [g.kind, g.label])).toEqual([
      ['stack', 'a'],
      ['loose', 'b'],
      ['stack', 'c'],
      ['loose', 'd'],
      ['loose', 'e'],
    ]);
    expect(model.location.get('d03')).toEqual({
      baseId: 'root',
      kind: 'loose',
      groupId: 'stack:root:v:b',
    });
  });

  test('no stack has 1 member, for any Meridian Component and any Group by', () => {
    for (const name of COMPONENTS) {
      const deployments = meridianComponent(name);
      const keys = [null, ...groupByOptions(foldMembers(deployments)).map((o) => o.key)];
      for (const groupKey of keys) {
        const model = buildFoldModel({ deployments, groupKey });
        for (const base of model.bases.values()) {
          for (const g of base.groups) {
            if (g.kind !== 'loose') expect(g.memberIds.length).toBeGreaterThan(1);
            else expect(g.memberIds).toHaveLength(1);
          }
        }
      }
    }
  });

  test('plurals', () => {
    expect(groupKeyPlural('Department')).toBe('departments');
    expect(groupKeyPlural('Region')).toBe('regions');
    expect(groupKeyPlural('City')).toBe('cities');
    expect(groupKeyPlural('Stage')).toBe('stages');
  });
});

test.describe('the card cap', () => {
  test('15 Degraded -> 12 cards, 3 over the cap stay coloured in a stack', () => {
    const members = [
      ...named(15, 'bad').map((m) => ({ ...m, health: 'Degraded', labels: { Region: 'eu' } })),
      ...named(10, 'ok').map((m) => ({ ...m, labels: { Region: 'eu' } })),
    ];
    const model = buildFoldModel({
      deployments: syntheticComponent(members),
      groupKey: 'Region',
    });
    const root = baseFold(model, 'root');
    expect(root.cards).toHaveLength(12);
    expect(root.cards.every((c) => c.reason === 'exception' && c.severity === 5)).toBe(true);
    expect(root.overCapIds).toEqual(['bad13', 'bad14', 'bad15']);
    expect(root.quietCount).toBe(13);
    for (const id of root.overCapIds) {
      const loc = model.location.get(id);
      expect(loc?.kind).toBe('stack');
      expect(stripMark(model.conditions.get(id)!, root.waveSet)).toBe('degraded');
    }
  });
});

test.describe('Group by options', () => {
  test('Stage is an option but never the default; the default comes first', () => {
    for (const name of COMPONENTS) {
      const options = groupByOptions(foldMembers(meridianComponent(name)));
      const stage = options.find((o) => o.key === 'Stage');
      expect(stage, name).toMatchObject({ label: 'Stage', isDefault: false });
      expect(options.filter((o) => o.isDefault)).toHaveLength(1);
      expect(options[0].isDefault).toBe(true);
      for (const o of options) expect(o.valueCount).toBeGreaterThan(1);
    }
  });

  test('cert-manager: Stage gives one stack per Base, as the Base split does', () => {
    const deployments = meridianComponent('cert-manager');
    const model = buildFoldModel({ deployments, groupKey: 'Stage' });
    for (const base of model.bases.values()) {
      const stacks = base.groups.filter((g) => g.kind !== 'loose');
      expect(stacks.length, base.baseId).toBeLessThanOrEqual(1);
    }
    expect(defaultGroupKey(foldMembers(deployments))).toBe('Department');
  });

  test('cert-manager: Department counts "no department" as a value', () => {
    const options = groupByOptions(foldMembers(meridianComponent('cert-manager')));
    expect(options[0]).toEqual({
      key: 'Department',
      label: 'Department',
      valueCount: 4,
      isDefault: true,
    });
  });

  test('cert-manager: the menu is Department, Region and Stage', () => {
    const options = groupByOptions(foldMembers(meridianComponent('cert-manager')));
    expect(options.map((o) => o.key)).toEqual(['Department', 'Region', 'Stage']);
  });

  test('cert-manager: no one-each keys, and no Environment', () => {
    const options = groupByOptions(foldMembers(meridianComponent('cert-manager')));
    const keys = options.map((o) => o.key);
    // One value per Deployment: only "1 each" stacks.
    expect(keys).not.toContain('Cluster');
    expect(keys).not.toContain('Variant');
    // Only repeats the Base split: one stack per Base, as the Bases already show.
    expect(keys).not.toContain('Environment');
    // Stage repeats the Base split too, but the user asked for it.
    expect(keys).toContain('Stage');
    expect(resolveGroupKey('Environment', options, 'Department')).toBe('Department');
  });

  test('checkout: Department has one value, so it is not an option', () => {
    const options = groupByOptions(foldMembers(meridianComponent('checkout')));
    expect(options.map((o) => o.key)).not.toContain('Department');
    expect(options[0].key).toBe('Region');
  });

  test('an unknown ?graphGroup= falls back to the default', () => {
    const members = foldMembers(meridianComponent('cert-manager'));
    const options = groupByOptions(members);
    const fallback = defaultGroupKey(members);
    expect(resolveGroupKey('Nope', options, fallback)).toBe('Department');
    expect(resolveGroupKey('Stage', options, fallback)).toBe('Stage');
    expect(resolveGroupKey(null, options, fallback)).toBe('Department');
    expect(resolveGroupKey('Region', options, fallback)).toBe('Region');
  });

  test('the default key is matched without case and returned as spelled', () => {
    const deployments = syntheticComponent(
      named(4).map((m, i) => ({
        ...m,
        labels: { department: i < 2 ? 'x' : 'y', Region: 'r' },
      })),
    );
    expect(defaultGroupKey(foldMembers(deployments))).toBe('department');
  });
});

test.describe('stability over status polls', () => {
  const before = meridianComponent('traefik');
  const recoveredId = 'eu-central-payments-prod2';
  const after = withChange(before, recoveredId, {
    liveStatus: { syncStatus: 'Synced', healthStatus: 'Healthy' },
  });
  const previous = defaultModel(before);
  const next = defaultModel(after);
  const empty: ReadonlyMap<string, number> = new Map();

  test('a card that recovers is held for 60 s', () => {
    expect(next.location.get(recoveredId)?.kind).not.toBe('card');
    const holds = updateRecoveredHolds({ previous, next, holds: empty, now: 1_000 });
    expect([...holds]).toEqual([[recoveredId, 61_000]]);
  });

  test('nothing changed -> the same map instance', () => {
    const holds = updateRecoveredHolds({ previous, next, holds: empty, now: 1_000 });
    expect(updateRecoveredHolds({ previous, next, holds, now: 2_000 })).toBe(holds);
    expect(updateRecoveredHolds({ previous: next, next, holds, now: 3_000 })).toBe(holds);
    expect(updateRecoveredHolds({ previous: next, next, holds: empty, now: 3_000 })).toBe(
      empty,
    );
  });

  test('a hold ends when it runs out', () => {
    const holds = updateRecoveredHolds({ previous, next, holds: empty, now: 1_000 });
    const later = updateRecoveredHolds({ previous: next, next, holds, now: 61_000 });
    expect(later.has(recoveredId)).toBe(false);
  });

  test('a hold ends when the Deployment needs attention again', () => {
    const holds = updateRecoveredHolds({ previous, next, holds: empty, now: 1_000 });
    const worse = defaultModel(before);
    expect(updateRecoveredHolds({ previous: next, next: worse, holds, now: 2_000 }).size).toBe(
      0,
    );
  });

  test('cards whose condition joins a wave fold without a false "Recovered"', () => {
    // 10 members, 4 Unreleased: 4 exception cards. A 5th Unreleased member
    // makes it a wave (5 of 10), and the 4 cards go quiet on the canvas, but
    // none of them recovered.
    const unreleased = { staleUnits: 0, unreleasedUnits: 1, gatedUnits: 0 };
    const withUnreleased = (n: number) =>
      syntheticComponent(named(10)).map((d, i) =>
        i >= 1 && i <= n ? { ...d, configSignals: unreleased } : d,
      );
    const four = buildFoldModel({ deployments: withUnreleased(4), groupKey: null });
    const five = buildFoldModel({ deployments: withUnreleased(5), groupKey: null });
    expect(baseFold(four, 'root').cards.map((c) => c.reason)).toEqual(
      Array(4).fill('exception'),
    );
    expect(baseFold(five, 'root').waves.map((w) => w.condition)).toEqual(['unreleased']);
    expect(baseFold(five, 'root').cards).toHaveLength(0);
    expect(
      updateRecoveredHolds({ previous: four, next: five, holds: empty, now: 1_000 }),
    ).toBe(empty);
  });

  test('a held Deployment stays a card, marked recovered', () => {
    const holds = updateRecoveredHolds({ previous, next, holds: empty, now: 1_000 });
    const held = buildFoldModel({
      deployments: after,
      groupKey: next.groupKey,
      recoveredIds: new Set(holds.keys()),
    });
    const prod = baseFold(held, 'prod');
    expect(prod.cards.find((c) => c.id === recoveredId)).toEqual({
      id: recoveredId,
      reason: 'recovered',
      severity: 0,
    });
    expect(prod.cards.at(-1)?.id).toBe(recoveredId);
    expect(held.location.get(recoveredId)).toEqual({ baseId: 'prod', kind: 'card' });
  });

  test('a selected card never folds', () => {
    const keep = keepSelectedCards(previous, new Set([recoveredId, 'eu-central-prod1']));
    expect([...keep]).toEqual([recoveredId]);
    const kept = buildFoldModel({
      deployments: after,
      groupKey: next.groupKey,
      keepAsCardIds: keep,
    });
    expect(baseFold(kept, 'prod').cards.find((c) => c.id === recoveredId)?.reason).toBe(
      'selected',
    );
    expect(keepSelectedCards(null, new Set([recoveredId])).size).toBe(0);
  });
});
