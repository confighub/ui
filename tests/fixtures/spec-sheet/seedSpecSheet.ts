// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Seeds one spec-sheet fixture through the API, with random slugs so parallel workers never
// collide: a Component, a base Space and a prod Variant of it, base/openclaw from the
// fixture's base data, prod/openclaw cloned from it and then written with the prod data.
// For a fixture with Stale fields the base gets its newer data after the clone, so prod is
// behind upstream.
//
// The YAML files beside this one were made from the design fixtures by their seed script's
// dry run (`base.yaml`, `prod-released.yaml`, `prod-head.yaml`, `base-stale.yaml`).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { ApiHelper } from '../api-helper';
import { hubApi } from '../test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

export type SpecSheetFixture = 'most-items' | 'longest' | 'changes' | 'incoming' | 'empty' | 'stress' | 'stress-nodeploy' | 'defaults';

export interface SeededSpecSheet {
  componentSlug: string;
  componentId: string;
  base: { spaceId: string; slug: string; unitId: string };
  prod: { spaceId: string; slug: string; unitId: string };
  /** The prod data as stored, for comparing what the sheet draws. */
  prodData: string;
  cleanup: () => Promise<void>;
}

export function specSheetFixtureFile(fixture: SpecSheetFixture, file: string): string | undefined {
  const p = path.join(HERE, fixture, file);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * `release`: give prod a release Target and publish a Release of the released data before the
 * head is written, so the fields the head changes are Unreleased.
 */
export async function seedSpecSheet(
  page: Page,
  fixture: SpecSheetFixture,
  unitSlug = 'openclaw',
  options: { release?: boolean } = {},
): Promise<SeededSpecSheet> {
  const api = new ApiHelper(page);
  const suffix = randomSuffix();
  const componentSlug = `sheet-${fixture}-${suffix}`;
  const component = await api.createComponent(componentSlug);
  const spaceIds: string[] = [];
  const cleanup = async () => {
    for (const id of [...spaceIds].reverse()) await api.deleteSpace(id, true).catch(() => undefined);
    await api.deleteComponent(component.ComponentID).catch(() => undefined);
  };
  try {
    const baseData = specSheetFixtureFile(fixture, 'base.yaml') ?? '';
    const released = specSheetFixtureFile(fixture, 'prod-released.yaml') ?? baseData;
    const head = specSheetFixtureFile(fixture, 'prod-head.yaml') ?? released;
    const baseStale = specSheetFixtureFile(fixture, 'base-stale.yaml') ?? baseData;

    const baseSpace = await api.createSpace({ space: { Slug: `${componentSlug}-base`, ComponentID: component.ComponentID } as never });
    spaceIds.push(baseSpace.SpaceID);
    const prodSpace = await api.createSpace({
      space: {
        Slug: `${componentSlug}-prod`,
        ComponentID: component.ComponentID,
        Annotations: { UpstreamSpaceID: baseSpace.SpaceID },
      } as never,
    });
    spaceIds.push(prodSpace.SpaceID);

    const baseUnit = await api.createUnit({
      spaceId: baseSpace.SpaceID,
      unit: { Slug: unitSlug, ToolchainType: 'Kubernetes/YAML' } as never,
    });
    if (baseData) await api.uploadUnitData({ spaceId: baseSpace.SpaceID, unitId: baseUnit.UnitID, body: baseData });

    const cloned = await hubApi.post('/api/unit', {
      params: {
        where: `SpaceID = '${baseSpace.SpaceID}'`,
        where_space: `SpaceID IN ('${prodSpace.SpaceID}')`,
        include: 'UpstreamUnitID,SpaceID',
      },
      headers: MERGE_PATCH,
      data: {},
    });
    if (!cloned.ok()) throw new Error(`Clone into prod failed: ${cloned.status()} ${await cloned.text()}`);
    const entries = (await cloned.json()) as { Unit?: { UnitID?: string }; Error?: { Message?: string } }[];
    const refused = entries.find((e) => e.Error);
    if (refused) throw new Error(`Clone into prod refused: ${refused.Error?.Message}`);
    const prodUnits = await api.listUnits({ where: `SpaceID = '${prodSpace.SpaceID}'` });
    const prodUnit = prodUnits.map((u) => u.Unit as { UnitID: string; Slug: string }).find((u) => u.Slug === unitSlug);
    if (!prodUnit) throw new Error(`The clone made no ${unitSlug} in prod`);

    if (released !== baseData) await api.uploadUnitData({ spaceId: prodSpace.SpaceID, unitId: prodUnit.UnitID, body: released });
    if (options.release) {
      const target = await api.createTarget({ spaceId: prodSpace.SpaceID, slug: `${componentSlug}-target` });
      await api.updateSpace({ spaceId: prodSpace.SpaceID, space: { ReleaseTargetID: (target as { TargetID: string }).TargetID } as never });
      await api.publishRelease({ spaceId: prodSpace.SpaceID });
    }
    if (head !== released) await api.uploadUnitData({ spaceId: prodSpace.SpaceID, unitId: prodUnit.UnitID, body: head });
    if (fixture === 'incoming') await makeIncomingKinds(prodSpace.SpaceID, prodUnit.UnitID, unitSlug);
    if (baseStale !== baseData) await api.uploadUnitData({ spaceId: baseSpace.SpaceID, unitId: baseUnit.UnitID, body: baseStale });

    return {
      componentSlug,
      componentId: component.ComponentID,
      base: { spaceId: baseSpace.SpaceID, slug: `${componentSlug}-base`, unitId: baseUnit.UnitID },
      prod: { spaceId: prodSpace.SpaceID, slug: `${componentSlug}-prod`, unitId: prodUnit.UnitID },
      prodData: head,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/**
 * The two incoming kinds that need more than data: the Link merges with subtraction, so an
 * upstream deletion of a key this Unit changed is blocked and offered; and the memory limit
 * carries an Override guard, so the upstream value is withheld and offered.
 */
async function makeIncomingKinds(prodSpaceId: string, prodUnitId: string, unitSlug: string): Promise<void> {
  const links = await hubApi.get(`/api/space/${prodSpaceId}/link`, { params: { where: `FromUnitID = '${prodUnitId}'` } });
  if (!links.ok()) throw new Error(`prod link: ${links.status()} ${await links.text()}`);
  const linkId = ((await links.json()) as { Link: { LinkID: string } }[])[0]?.Link.LinkID;
  if (!linkId) throw new Error('prod link: not found');
  const patched = await hubApi.patch(`/api/space/${prodSpaceId}/link/${linkId}`, {
    headers: MERGE_PATCH,
    data: { MergeEnableSubtraction: true },
  });
  if (!patched.ok()) throw new Error(`link subtraction: ${patched.status()} ${await patched.text()}`);
  const guard = await hubApi.post(`/api/space/${prodSpaceId}/unit/${prodUnitId}/guard`, {
    data: {
      ResourceGuards: [
        {
          Resource: { ResourceType: 'apps/v1/Deployment', ResourceNameWithoutScope: unitSlug },
          Set: { 'spec.template.spec.containers.?name=gateway.resources.limits.memory': { Override: 'Upstream' } },
        },
      ],
    },
  });
  if (!guard.ok()) throw new Error(`guard: ${guard.status()} ${await guard.text()}`);
}
