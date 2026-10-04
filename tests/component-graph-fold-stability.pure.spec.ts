// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A folded graph over a sequence of status polls: a card that recovers is
// held for 60 s and then folds back, a selected card never folds, and a card
// that comes or goes never moves a stack sideways. Also the plans behind a
// wave's one bulk action, which must stay under the server's request limits.
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import {
  DEFAULT_MAX_ENCODED_WHERE,
  DEFAULT_MAX_IN_ITEMS,
  chunkInClause,
} from '../src/hooks/inClauseChunks';
import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import type { LiveStatus } from '../src/pages/x/apps/liveStatus';
import { RECOVERED_HOLD_MS } from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  type FoldLayout,
  type FrozenFoldParams,
  computeFoldedLayout,
} from '../src/pages/x/apps/flow-graph/fold/foldLayout';
import {
  type FoldModel,
  buildFoldModel,
  closedStackOf,
  closedStacksOf,
  foldMembers,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  type FoldStabilityStep,
  keptSelectedIds,
  nextHoldExpiry,
  stepFoldStability,
} from '../src/pages/x/apps/flow-graph/fold/foldStability';
import { type Size, solveFoldedFit } from '../src/pages/x/apps/flow-graph/fold/foldViewport';
import { defaultGroupKey } from '../src/pages/x/apps/flow-graph/fold/groupBy';
import {
  firstGatedMember,
  planWaveRelease,
  planWaveUpgrade,
  waveActionLabel,
} from '../src/pages/x/apps/flow-graph/fold/waveActions';
import { meridianComponent } from './fixtures/meridianFoldFixture';

/** 1440 x 900 minus the app shell, the screen the design was reviewed on. */
const SCREEN: Size = { width: 1224, height: 796 };
const NONE: ReadonlySet<string> = new Set();
const NO_HOLDS: ReadonlyMap<string, number> = new Map();

function withChange(
  deployments: readonly ComponentDeployment[],
  id: string,
  change: Partial<ComponentDeployment>,
): ComponentDeployment[] {
  return deployments.map((d) => (d.deploymentId === id ? { ...d, ...change } : d));
}

const healthy: LiveStatus = { Reporter: 'argobot', Sync: 'Synced', Health: 'Healthy' };
const degraded: LiveStatus = { Reporter: 'argobot', Sync: 'Synced', Health: 'Degraded' };

/** Fit once, the way the graph does on load, and return the columns Fit froze. */
function fitFrozen(
  deployments: readonly ComponentDeployment[],
  model: FoldModel,
): FrozenFoldParams {
  return solveFoldedFit(
    (availableWidth) =>
      computeFoldedLayout(deployments, model, { availableWidth, expandedGroupIds: NONE }),
    SCREEN,
  ).frozen;
}

function layoutOf(
  deployments: readonly ComponentDeployment[],
  model: FoldModel,
  frozen: FrozenFoldParams,
): FoldLayout {
  return computeFoldedLayout(deployments, model, {
    availableWidth: frozen.availableWidth,
    frozen,
    expandedGroupIds: NONE,
  });
}

/** Every stack (and loose card) on both layouts keeps its x. */
function expectNoStackMovesSideways(before: FoldLayout, after: FoldLayout): void {
  const now = new Map(after.nodes.map((n) => [n.id, n]));
  let compared = 0;
  for (const node of before.nodes) {
    if (node.kind !== 'stack' && node.kind !== 'foldFrame') continue;
    const next = now.get(node.id);
    if (!next) continue;
    compared++;
    expect(next.x, node.id).toBe(node.x);
  }
  expect(compared).toBeGreaterThan(0);
}

test.describe('traefik over status polls', () => {
  const before = meridianComponent('traefik');
  const groupKey = defaultGroupKey(foldMembers(before));
  const recoveredId = 'eu-central-payments-prod2';
  const recovered = withChange(before, recoveredId, { liveStatus: healthy });

  // The graph on load: no previous model, no holds.
  const start = stepFoldStability({
    deployments: before,
    groupKey,
    previous: null,
    holds: NO_HOLDS,
    selectedIds: NONE,
    now: 0,
  });
  const frozen = fitFrozen(before, start.model);
  const startLayout = layoutOf(before, start.model, frozen);

  test('on load a card is an exception and nothing is held', () => {
    expect(start.holds.size).toBe(0);
    expect(start.model.location.get(recoveredId)).toEqual({ baseId: 'prod', kind: 'card' });
  });

  test('a card that recovers is held 60 s, in the same poll', () => {
    const polled = stepFoldStability({
      deployments: recovered,
      groupKey,
      previous: start.model,
      holds: start.holds,
      selectedIds: NONE,
      now: 1_000,
    });
    expect([...polled.holds]).toEqual([[recoveredId, 1_000 + RECOVERED_HOLD_MS]]);
    expect(nextHoldExpiry(polled.holds)).toBe(61_000);
    // Still a card in the SAME step: it never leaves for one frame.
    const card = polled.model.bases.get('prod')!.cards.find((c) => c.id === recoveredId);
    expect(card).toEqual({ id: recoveredId, reason: 'recovered', severity: 0 });
    expectNoStackMovesSideways(startLayout, layoutOf(recovered, polled.model, frozen));
  });

  test('polls during the hold keep the same holds and the card', () => {
    const first = stepFoldStability({
      deployments: recovered,
      groupKey,
      previous: start.model,
      holds: start.holds,
      selectedIds: NONE,
      now: 1_000,
    });
    let step: FoldStabilityStep = first;
    for (let now = 3_000; now < 61_000; now += 2_000) {
      step = stepFoldStability({
        deployments: recovered,
        groupKey,
        previous: step.model,
        holds: step.holds,
        selectedIds: NONE,
        now,
      });
      expect(step.holds).toBe(first.holds);
      expect(step.model.location.get(recoveredId)?.kind).toBe('card');
    }
  });

  test('when the hold runs out the card folds back into its stack', () => {
    const held = stepFoldStability({
      deployments: recovered,
      groupKey,
      previous: start.model,
      holds: start.holds,
      selectedIds: NONE,
      now: 1_000,
    });
    const heldLayout = layoutOf(recovered, held.model, frozen);
    const later = stepFoldStability({
      deployments: recovered,
      groupKey,
      previous: held.model,
      holds: held.holds,
      selectedIds: NONE,
      now: 1_000 + RECOVERED_HOLD_MS,
    });
    expect(later.holds.size).toBe(0);
    const loc = later.model.location.get(recoveredId);
    expect(loc?.kind).toBe('stack');
    const group = later.model.bases
      .get('prod')!
      .groups.find((g) => loc?.kind === 'stack' && g.id === loc.groupId);
    expect(group?.memberIds).toContain(recoveredId);
    // Its stack takes it back where the stack already was.
    const afterLayout = layoutOf(recovered, later.model, frozen);
    expectNoStackMovesSideways(heldLayout, afterLayout);
    expect(afterLayout.nodes.find((n) => n.id === recoveredId)).toBeUndefined();
  });

  test('a selected card that recovered stays a card after the hold ends', () => {
    const selected = new Set([recoveredId]);
    const held = stepFoldStability({
      deployments: recovered,
      groupKey,
      previous: start.model,
      holds: start.holds,
      selectedIds: selected,
      now: 1_000,
    });
    // While held it says "Recovered", not "kept because selected".
    expect(keptSelectedIds(held.model).has(recoveredId)).toBe(false);
    const later = stepFoldStability({
      deployments: recovered,
      groupKey,
      previous: held.model,
      holds: held.holds,
      selectedIds: selected,
      now: 1_000 + RECOVERED_HOLD_MS,
    });
    expect(later.holds.size).toBe(0);
    const card = later.model.bases.get('prod')!.cards.find((c) => c.id === recoveredId);
    expect(card).toEqual({ id: recoveredId, reason: 'selected', severity: 0 });
    expect(keptSelectedIds(later.model)).toEqual(new Set([recoveredId]));

    // Deselected: it folds back on the next poll.
    const deselected = stepFoldStability({
      deployments: recovered,
      groupKey,
      previous: later.model,
      holds: later.holds,
      selectedIds: NONE,
      now: 70_000,
    });
    expect(deselected.model.location.get(recoveredId)?.kind).toBe('stack');
  });

  test('a quiet member that breaks becomes a card and no stack moves sideways', () => {
    const stack = start.model.bases
      .get('prod')!
      .groups.find((g) => g.kind === 'stack' && g.memberIds.length >= 3)!;
    const broken = stack.memberIds[0];
    const polled = withChange(before, broken, { liveStatus: degraded });
    const step = stepFoldStability({
      deployments: polled,
      groupKey,
      previous: start.model,
      holds: start.holds,
      selectedIds: NONE,
      now: 1_000,
    });
    expect(step.holds).toBe(start.holds);
    expect(step.model.location.get(broken)).toEqual({ baseId: 'prod', kind: 'card' });
    const after = layoutOf(polled, step.model, frozen);
    expectNoStackMovesSideways(startLayout, after);
    expect(after.nodes.find((n) => n.id === broken)).toMatchObject({ placement: 'card' });
  });

  test('a new graph starts without the old holds', () => {
    const held = stepFoldStability({
      deployments: recovered,
      groupKey,
      previous: start.model,
      holds: start.holds,
      selectedIds: NONE,
      now: 1_000,
    });
    const fresh = stepFoldStability({
      deployments: recovered,
      groupKey,
      previous: null,
      holds: NO_HOLDS,
      selectedIds: NONE,
      now: 2_000,
    });
    expect(held.holds.size).toBe(1);
    expect(fresh.model.location.get(recoveredId)?.kind).toBe('stack');
  });
});

// ── Wave actions ──

/** A UUID-shaped id, so the clause lengths are the real ones. */
const uuid = (n: number): string => {
  const hex = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
};

/**
 * Units for a Meridian Component: every Space holds `unitCount` Units (or
 * `unitsPerSpace`), and each Deployment's first `staleUnits` of them are one
 * Revision behind their upstream in the Deployment's Base.
 */
function unitsFor(
  deployments: readonly ComponentDeployment[],
  unitsPerSpace?: number,
): { units: ExtendedUnitRead[]; unitById: Map<string, ExtendedUnitRead> } {
  const units: ExtendedUnitRead[] = [];
  const idOf = new Map<string, string>();
  let next = 1;
  const key = (spaceId: string, i: number) => `${spaceId}#${i}`;
  for (const d of deployments) {
    const count = unitsPerSpace ?? d.unitCount;
    for (let i = 0; i < count; i++) idOf.set(key(d.deploymentId, i), uuid(next++));
  }
  for (const d of deployments) {
    const count = unitsPerSpace ?? d.unitCount;
    // With a Unit count forced for a size test, every Unit of a Stale
    // Deployment is behind, so the plan is as large as it can be.
    const staleCount =
      d.configSignals.staleUnits === 0
        ? 0
        : unitsPerSpace !== undefined
          ? count
          : Math.min(d.configSignals.staleUnits, count);
    for (let i = 0; i < count; i++) {
      const upstreamId = d.parentDeploymentId
        ? idOf.get(key(d.parentDeploymentId, i))
        : undefined;
      units.push({
        Unit: {
          UnitID: idOf.get(key(d.deploymentId, i))!,
          SpaceID: d.deploymentId,
          UpstreamUnitID: upstreamId,
          HeadRevisionNum: 7,
          UpstreamRevisionNum: i < staleCount ? 6 : 7,
        },
      } as ExtendedUnitRead);
    }
  }
  return { units, unitById: new Map(units.map((u) => [u.Unit!.UnitID, u])) };
}

function expectWithinLimits(wheres: readonly string[], unitIds: readonly string[]): void {
  expect(wheres).toEqual(chunkInClause('UnitID', unitIds));
  const seen: string[] = [];
  for (const where of wheres) {
    expect(encodeURIComponent(where).length).toBeLessThanOrEqual(DEFAULT_MAX_ENCODED_WHERE);
    const ids = [...where.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(ids.length).toBeLessThanOrEqual(DEFAULT_MAX_IN_ITEMS);
    seen.push(...ids);
  }
  expect(seen).toEqual(unitIds);
}

test.describe('a Deployment focused from outside the canvas', () => {
  // A ?space= link selects the Deployment before the graph has a model, so
  // nothing keeps it as a card: its stack must open to show it.
  const deployments = meridianComponent('cert-manager');
  const groupKey = defaultGroupKey(foldMembers(deployments));
  const quiet = buildFoldModel({ deployments, groupKey });
  const stack = [...quiet.bases.values()]
    .flatMap((b) => b.groups)
    .find((g) => g.kind === 'stack')!;
  const memberId = stack.memberIds[0];

  test('a quiet member selected on load stays in its closed stack', () => {
    const step = stepFoldStability({
      deployments,
      groupKey,
      previous: null,
      holds: NO_HOLDS,
      selectedIds: new Set([memberId]),
      now: 0,
    });
    expect(step.model.location.get(memberId)).toMatchObject({
      kind: 'stack',
      groupId: stack.id,
    });
    expect(closedStackOf(step.model, memberId, NONE)).toBe(stack.id);
  });

  test('its stack, once open, hides it no more', () => {
    expect(closedStackOf(quiet, memberId, new Set([stack.id]))).toBeNull();
  });

  test('a card, a Base and an unknown id need no stack opened', () => {
    const cardId = [...quiet.bases.values()].flatMap((b) => b.cards)[0].id;
    expect(closedStackOf(quiet, cardId, NONE)).toBeNull();
    expect(closedStackOf(quiet, 'prod', NONE)).toBeNull();
    expect(closedStackOf(quiet, 'not-a-deployment', NONE)).toBeNull();
    expect(closedStackOf(null, memberId, NONE)).toBeNull();
  });
});

test.describe('a compare link that names quiet Deployments', () => {
  // ?space=A&compare=B,C: B and C get a card and a letter only when their
  // stacks are open.
  const deployments = meridianComponent('cert-manager');
  const groupKey = defaultGroupKey(foldMembers(deployments));
  const model = buildFoldModel({ deployments, groupKey });
  const stacks = [...model.bases.values()]
    .flatMap((b) => b.groups)
    .filter((g) => g.kind === 'stack');
  const [first, second] = stacks;

  test('two members of one stack open that stack once', () => {
    const ids = [first.memberIds[0], first.memberIds[1]];
    expect(closedStacksOf(model, ids, NONE)).toEqual([first.id]);
  });

  test('members of two stacks open both', () => {
    const ids = [first.memberIds[0], second.memberIds[0]];
    expect(closedStacksOf(model, ids, NONE).sort()).toEqual([first.id, second.id].sort());
  });

  test('a stack that is already open, a card and an unknown id open nothing', () => {
    const cardId = [...model.bases.values()].flatMap((b) => b.cards)[0].id;
    const ids = [first.memberIds[0], cardId, 'not-a-deployment'];
    expect(closedStacksOf(model, ids, new Set([first.id]))).toEqual([]);
    expect(closedStacksOf(null, ids, NONE)).toEqual([]);
  });
});

test.describe('wave actions', () => {
  test('the action words', () => {
    expect(waveActionLabel('stale', 55)).toBe('Upgrade 55');
    expect(waveActionLabel('unreleased', 14)).toBe('Release 14');
    expect(waveActionLabel('gated', 14)).toBe('Review gates');
  });

  test('Upgrade 55 on cert-manager prod plans 55 Spaces in chunks under the limits', () => {
    const deployments = meridianComponent('cert-manager');
    const model = buildFoldModel({
      deployments,
      groupKey: defaultGroupKey(foldMembers(deployments)),
    });
    const wave = model.bases.get('prod')!.waves.find((w) => w.condition === 'stale')!;
    expect(wave.count).toBe(55);

    const { units, unitById } = unitsFor(deployments);
    const plan = planWaveUpgrade(wave.memberIds, units, unitById);
    expect(plan.spaceIds).toHaveLength(55);
    expect(plan.spaceIds).toEqual(wave.memberIds);
    // Only Units of the wave's Spaces, never a Stale Unit of another Base.
    const members = new Set(wave.memberIds);
    for (const id of plan.unitIds)
      expect(members.has(unitById.get(id)!.Unit!.SpaceID!)).toBe(true);
    expect(plan.unitIdChunks.flat()).toEqual(plan.unitIds);
    expectWithinLimits(plan.wheres, plan.unitIds);
  });

  test('a large wave splits into several requests, each under the limits', () => {
    const deployments = meridianComponent('cert-manager');
    const model = buildFoldModel({
      deployments,
      groupKey: defaultGroupKey(foldMembers(deployments)),
    });
    const wave = model.bases.get('prod')!.waves.find((w) => w.condition === 'stale')!;
    const { units, unitById } = unitsFor(deployments, 30);
    const plan = planWaveUpgrade(wave.memberIds, units, unitById);
    expect(plan.unitIds).toHaveLength(55 * 30);
    expect(plan.wheres.length).toBeGreaterThan(1);
    expectWithinLimits(plan.wheres, plan.unitIds);
  });

  test('a Unit whose upstream is not loaded is not upgraded', () => {
    const deployments = meridianComponent('cert-manager');
    const { units } = unitsFor(deployments);
    const member = deployments.find(
      (d) => d.parentDeploymentId === 'prod' && d.configSignals.staleUnits > 0,
    )!;
    const plan = planWaveUpgrade([member.deploymentId], units, new Map());
    expect(plan).toEqual({ unitIds: [], spaceIds: [], wheres: [], unitIdChunks: [] });
  });

  test('Release N publishes only members with a release Target and Unreleased changes', () => {
    const deployments = meridianComponent('checkout');
    const model = buildFoldModel({ deployments, groupKey: 'Region' });
    const wave = model.bases.get('prod')!.waves.find((w) => w.condition === 'unreleased')!;
    expect(wave.count).toBe(14);
    const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
    // No Meridian Space has a release Target in the fixture.
    expect(planWaveRelease(wave.memberIds, byId)).toEqual([]);
    const [a, b] = wave.memberIds;
    byId.set(a, { ...byId.get(a)!, releaseTargetId: 'target-a' });
    byId.set(b, {
      ...byId.get(b)!,
      releaseTargetId: 'target-b',
      configSignals: { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 },
    });
    expect(planWaveRelease(wave.memberIds, byId)).toEqual([a]);
  });

  test('Review gates on checkout prod opens the first gated Deployment by name', () => {
    const deployments = meridianComponent('checkout');
    const model = buildFoldModel({ deployments, groupKey: 'Region' });
    const wave = model.bases.get('prod')!.waves.find((w) => w.condition === 'gated')!;
    expect(wave.count).toBe(14);
    const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
    const first = firstGatedMember(wave, byId);
    expect(first).toBe('ap-northeast-retail-prod1');
    const names = wave.memberIds.map((id) => byId.get(id)!.displayName).sort();
    expect(first).toBe(names[0]);
    expect(firstGatedMember({ memberIds: [] }, byId)).toBeNull();
  });
});
