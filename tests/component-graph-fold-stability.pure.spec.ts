// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Which closed stacks open to show a Deployment that a link names, and the
// plans behind a wave's one bulk action, which must stay under the server's
// request limits.
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import {
  DEFAULT_MAX_ENCODED_WHERE,
  DEFAULT_MAX_IN_ITEMS,
  chunkInClause,
} from '../src/hooks/inClauseChunks';
import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import {
  buildFoldModel,
  closedStackOf,
  closedStacksOf,
  foldMembers,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import { stepFoldStability } from '../src/pages/x/apps/flow-graph/fold/foldStability';
import { defaultGroupKey } from '../src/pages/x/apps/flow-graph/fold/groupBy';
import {
  firstGatedMember,
  planWaveRelease,
  planWaveUpgrade,
} from '../src/pages/x/apps/flow-graph/fold/waveActions';
import { meridianComponent } from './fixtures/meridianFoldFixture';

const NONE: ReadonlySet<string> = new Set();
const NO_HOLDS: ReadonlyMap<string, number> = new Map();

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
