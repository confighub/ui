// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { Page } from '@playwright/test';

import { ApiHelper } from './api-helper';
import { expect, hubApi } from './test';
import { RandomSlugGenerator } from './utils/random-slug-generator';

/**
 * Data for the View explorer's row panel of a Unit: Units in each state the
 * panel tells apart, in two Spaces so a view grouped by Space has two groups.
 *
 * Space A (release Target set, published, the Space of a Component):
 *   - `gated`: a gate fails (replicas 2, under the Space's vet-celexpr Trigger) and it was never released
 *   - `ok`: released at its head
 *   - `unrel`: one revision after the released one
 *   - `up`: cloned from Space U's `up`, which has moved on since: an upgrade is available
 * Space B (release Target set, published):
 *   - `b-ok`: released
 *   - `b-unrel`: one revision after the released one
 *
 * The order matters: a failing gate blocks a Release, so the Trigger and the
 * gated Unit come after both publishes.
 */

export interface PanelSeed {
  spaceA: { id: string; slug: string };
  /** The slug of Space A's Component. */
  componentSlug: string;
  spaceB: { id: string; slug: string };
  /** UnitID by slug, for both Spaces. */
  unitIds: Record<string, string>;
  /** The name of the gate that fails on `gated`. */
  gateName: string;
  /** A Units View over A and B, grouped by Space. */
  viewId: string;
  remove(): Promise<void>;
}

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

const deployment = (name: string, replicas: number) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
spec:
  replicas: ${replicas}
  template:
    spec:
      containers:
        - name: ${name}
          image: nginx:1.25
`;

async function unitJson(spaceId: string, unitId: string): Promise<{ Unit?: { ValidationErrors?: Record<string, boolean>; HeadRevisionNum?: number; LastReleasedRevisionNum?: number } }> {
  const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

/** Wait until the Triggers have checked the Unit's latest data (the `awaiting/triggers` pseudo-gate is gone). */
async function waitForGates(spaceId: string, unitId: string): Promise<Record<string, boolean>> {
  let errors: Record<string, boolean> = {};
  await expect
    .poll(
      async () => {
        errors = (await unitJson(spaceId, unitId)).Unit?.ValidationErrors ?? {};
        return 'awaiting/triggers' in errors;
      },
      { timeout: 30_000, message: 'the Triggers checked the Unit' },
    )
    .toBe(false);
  return errors;
}

async function releasedSpace(api: ApiHelper, slug: string, created: string[], componentId?: string) {
  const space = await api.createSpace({ space: { Slug: slug, ComponentID: componentId } });
  const spaceId = space.SpaceID!;
  created.push(spaceId);
  const target = await api.createTarget({ spaceId, slug: `${slug}-t` });
  await api.updateSpace({ spaceId, space: { ReleaseTargetID: target.TargetID } });
  return { id: spaceId, slug, targetId: target.TargetID! };
}

export async function seedPanel(page: Page): Promise<PanelSeed> {
  const api = new ApiHelper(page);
  const base = `vx-panel-${RandomSlugGenerator.randomSlugName()}`;
  // Filled as they are made, so a seed that fails part way removes what it made.
  const spaces: string[] = [];
  let componentId: string | undefined;
  // Every delete is tried; any that failed are named, so a Space left behind is not silent.
  const remove = async () => {
    const failed: string[] = [];
    for (const id of spaces) {
      const response = await hubApi.delete(`/api/space/${id}`, { params: { recursive: 'true' } });
      if (!response.ok()) failed.push(`Space ${id}: ${response.status()} ${await response.text()}`);
    }
    if (componentId) {
      const response = await hubApi.delete(`/api/component/${componentId}`);
      if (!response.ok()) failed.push(`Component ${componentId}: ${response.status()} ${await response.text()}`);
    }
    if (failed.length) throw new Error(`the panel seed ${base} was not removed:\n${failed.join('\n')}`);
  };
  try {
    return await seed(api, base, spaces, (id) => (componentId = id), remove);
  } catch (e) {
    // The seed's own failure is the one to report; a failed clean-up after it is reported beside it.
    await remove().catch((cleanup: unknown) => console.warn(String(cleanup)));
    throw e;
  }
}

async function seed(
  api: ApiHelper,
  base: string,
  spaces: string[],
  setComponent: (id: string) => void,
  remove: () => Promise<void>,
): Promise<PanelSeed> {
  const unitIds: Record<string, string> = {};
  const componentSlug = `${base}-c`;
  const componentId = (await api.createComponent(componentSlug)).ComponentID!;
  setComponent(componentId);
  // Spaces named so A groups before B.
  const a = await releasedSpace(api, `${base}-a`, spaces, componentId);
  const b = await releasedSpace(api, `${base}-b`, spaces);
  const upstream = (await api.createSpace({ space: { Slug: `${base}-u` } })).SpaceID!;
  spaces.push(upstream);

  const unit = async (spaceId: string, slug: string, replicas: number, targetId?: string) => {
    const created = await api.createUnit({ spaceId, unit: { Slug: slug, ToolchainType: 'Kubernetes/YAML', TargetID: targetId } });
    await api.uploadUnitData({ spaceId, unitId: created.UnitID!, body: deployment(slug, replicas) });
    unitIds[slug] = created.UnitID!;
    return created.UnitID!;
  };

  await unit(a.id, 'ok', 5, a.targetId);
  await unit(a.id, 'unrel', 5, a.targetId);
  await unit(b.id, 'b-ok', 3, b.targetId);
  await unit(b.id, 'b-unrel', 3, b.targetId);

  // An upstream Unit, cloned into A with the bulk route: one request names the Units to clone (`where`)
  // and the Spaces to clone them into (`where_space`).
  const upstreamUnit = await unit(upstream, 'up', 4);
  const clone = await hubApi.post('/api/unit', {
    params: { where: `SpaceID = '${upstream}'`, where_space: `SpaceID IN ('${a.id}')` },
    headers: MERGE_PATCH,
    data: {},
  });
  expect(clone.ok(), await clone.text()).toBeTruthy();
  // 207 is partial success, with the refusal in the entry.
  const cloned = (await clone.json()) as Array<{ Unit?: { UnitID?: string; Slug?: string }; Error?: { Message?: string } | null }>;
  expect(cloned.filter((c) => c.Error).map((c) => c.Error?.Message)).toEqual([]);
  const upId = cloned[0]?.Unit?.UnitID;
  expect(upId, 'the clone of up').toBeTruthy();
  unitIds.up = upId!;
  await api.updateUnit({ spaceId: a.id, unitId: upId!, unit: { TargetID: a.targetId } });

  // A write leaves `awaiting/triggers` on the Unit for a moment, and a Release refuses a Unit with any gate.
  for (const [spaceId, slugs] of [[a.id, ['ok', 'unrel', 'up']], [b.id, ['b-ok', 'b-unrel']]] as const)
    for (const slug of slugs) await waitForGates(spaceId, unitIds[slug]);
  await api.publishRelease({ spaceId: a.id });
  await api.publishRelease({ spaceId: b.id });

  // After the Releases: one revision more for the unreleased Units, and for the upstream.
  await api.uploadUnitData({ spaceId: a.id, unitId: unitIds.unrel, body: deployment('unrel', 6) });
  await api.uploadUnitData({ spaceId: b.id, unitId: unitIds['b-unrel'], body: deployment('b-unrel', 4) });
  await api.uploadUnitData({ spaceId: upstream, unitId: upstreamUnit, body: deployment('up', 7) });
  await waitForGates(a.id, unitIds.unrel);
  await waitForGates(b.id, unitIds['b-unrel']);
  await waitForGates(upstream, upstreamUnit);

  // The gate: a validating function run on each change in A, which a Deployment under 3 replicas fails.
  const triggerSlug = `${base}-replicas`;
  const trigger = await hubApi.post(`/api/space/${a.id}/trigger`, {
    data: {
      Slug: triggerSlug,
      Event: 'Mutation',
      ToolchainType: 'Kubernetes/YAML',
      FunctionName: 'vet-celexpr',
      Arguments: [{ ParameterName: 'validation-expr', Value: "r.kind != 'Deployment' || r.spec.replicas >= 3" }],
    },
  });
  expect(trigger.ok(), await trigger.text()).toBeTruthy();
  await unit(a.id, 'gated', 2, a.targetId);
  const errors = await waitForGates(a.id, unitIds.gated);
  const gates = Object.keys(errors);
  expect(gates, 'the gated Unit has a failing gate').toHaveLength(1);

  // Each Unit is in the state the specs expect, as the server has it.
  const revs = async (spaceId: string, slug: string) => {
    const u = (await unitJson(spaceId, unitIds[slug])).Unit;
    return [u?.HeadRevisionNum, u?.LastReleasedRevisionNum];
  };
  const [okHead, okReleased] = await revs(a.id, 'ok');
  expect(okHead).toBe(okReleased);
  const [unrelHead, unrelReleased] = await revs(a.id, 'unrel');
  expect(unrelHead).toBe((unrelReleased ?? 0) + 1);

  const filter = await hubApi.post(`/api/space/${a.id}/filter`, {
    data: { Slug: `${base}-filter`, From: 'Unit', Where: `SpaceID IN ('${a.id}', '${b.id}')` },
  });
  expect(filter.ok(), await filter.text()).toBeTruthy();
  const view = await hubApi.post(`/api/space/${a.id}/view`, {
    data: {
      Slug: `${base}-view`,
      DisplayName: `Panel ${base}`,
      FilterID: (await filter.json()).FilterID,
      Of: 'Unit',
      Columns: [{ Name: 'Slug' }, { Name: 'Space' }, { Name: 'Status' }],
      GroupBy: 'Space',
    },
  });
  expect(view.ok(), await view.text()).toBeTruthy();

  return {
    spaceA: { id: a.id, slug: a.slug },
    componentSlug,
    spaceB: { id: b.id, slug: b.slug },
    unitIds,
    gateName: gates[0],
    viewId: (await view.json()).ViewID,
    remove,
  };
}
