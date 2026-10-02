// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The data the Components flow graph reads for a large Component.
//
// chunkInClause: one IN clause over every Unit of a large Component (cert-manager,
// 104 Spaces, 520 Units) is longer than the 8,192-character query string the server
// accepts, and a Revision search asks for more than its 1,000-row limit. Each chunk
// must stay under both limits, and together the chunks must ask for every id exactly
// once, or a node silently loses its data.
//
// buildComponentData: every node carries its Space labels (the graph folds by them)
// and its Stale / Unreleased changes / Gated unit counts, by the same rules as the
// card's chips.
//
// uniqueTargetLabels: Meridian names every cluster Target "cluster", so a Target
// whose name another Target of the Component shares gets its Space slug added.

import { expect, test } from '@playwright/test';

import {
  DEFAULT_MAX_ENCODED_WHERE,
  DEFAULT_MAX_IN_ITEMS,
  chunkInClause,
} from '../src/hooks/inClauseChunks';
import { buildComponentData, uniqueTargetLabels } from '../src/pages/x/apps/componentData';
import type {
  ExtendedSpaceRead,
  ExtendedUnitRead,
  UnitRead,
} from '@confighub/rtk-query';

/** A deterministic UUID-shaped id, so the length of each quoted id matches production. */
const uuid = (n: number) => {
  const hex = n.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** The ids a clause asks for, in order. */
const idsIn = (column: string, where: string): string[] => {
  const prefix = `${column} IN (`;
  expect(where.startsWith(prefix)).toBe(true);
  expect(where.endsWith(')')).toBe(true);
  return where
    .slice(prefix.length, -1)
    .split(', ')
    .map((quoted) => {
      expect(quoted.startsWith("'") && quoted.endsWith("'")).toBe(true);
      return quoted.slice(1, -1);
    });
};

test.describe('chunkInClause', () => {
  test('520 UUIDs: every chunk under the length budget, every id once, order kept', () => {
    const ids = Array.from({ length: 520 }, (_, i) => uuid(i + 1));
    const chunks = chunkInClause('UnitID', ids);

    // One clause over all of them is what the server rejected.
    expect(encodeURIComponent(`UnitID IN (${ids.map((id) => `'${id}'`).join(', ')})`).length)
      .toBeGreaterThan(8192);
    expect(chunks.length).toBeGreaterThan(1);
    for (const where of chunks) {
      expect(encodeURIComponent(where).length).toBeLessThanOrEqual(DEFAULT_MAX_ENCODED_WHERE);
    }
    expect(chunks.flatMap((where) => idsIn('UnitID', where))).toEqual(ids);
  });

  test('1,200 short ids with a large length budget: no chunk over the item limit', () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `u${i}`);
    const chunks = chunkInClause('RevisionID', ids, { maxEncodedLength: 1_000_000 });

    expect(chunks.length).toBe(2);
    for (const where of chunks) {
      expect(idsIn('RevisionID', where).length).toBeLessThanOrEqual(DEFAULT_MAX_IN_ITEMS);
    }
    expect(chunks.flatMap((where) => idsIn('RevisionID', where))).toEqual(ids);
  });

  test('duplicates and empty ids are dropped, first-seen order kept', () => {
    expect(chunkInClause('SpaceID', ['b', undefined, 'a', null, '', 'b', 'c', 'a'])).toEqual([
      "SpaceID IN ('b', 'a', 'c')",
    ]);
  });

  test('no ids gives no clauses', () => {
    expect(chunkInClause('UnitID', [])).toEqual([]);
    expect(chunkInClause('UnitID', [undefined, null, ''])).toEqual([]);
  });
});

test.describe('buildComponentData', () => {
  const space = (id: string, slug: string, labels?: Record<string, string>): ExtendedSpaceRead => ({
    Space: { SpaceID: id, Slug: slug, Labels: labels } as ExtendedSpaceRead['Space'],
  });

  const unit = (fields: Partial<UnitRead> & { UnitID: string; SpaceID: string }): ExtendedUnitRead => ({
    Unit: { Slug: fields.UnitID, ...fields } as UnitRead,
  });

  const baseLabels = { Component: 'shop', Variant: 'base' };
  const retailLabels = { Component: 'shop', Region: 'us-east', Department: 'retail', Stage: 'prod' };
  const spaces = [
    space('base', 'shop-base', baseLabels),
    space('retail', 'shop-retail', retailLabels),
    space('logistics', 'shop-logistics'),
  ];

  const units: ExtendedUnitRead[] = [
    // A Base's units have no Target: a head past the last release is not
    // Unreleased changes, because a Base can never be released.
    unit({ UnitID: 'base-app', SpaceID: 'base', HeadRevisionNum: 3, LastReleasedRevisionNum: 0 }),
    unit({ UnitID: 'base-cfg', SpaceID: 'base', HeadRevisionNum: 2, LastReleasedRevisionNum: 0 }),

    // Stale: merged upstream revision 2, upstream head is 3. Released, so nothing else.
    unit({
      UnitID: 'retail-app',
      SpaceID: 'retail',
      TargetID: 't-retail',
      UpstreamUnitID: 'base-app',
      UpstreamRevisionNum: 2,
      HeadRevisionNum: 1,
      LastReleasedRevisionNum: 1,
    }),
    // Unreleased changes: up to date with upstream, head 4 past release 3, no gates.
    unit({
      UnitID: 'retail-cfg',
      SpaceID: 'retail',
      TargetID: 't-retail',
      UpstreamUnitID: 'base-cfg',
      UpstreamRevisionNum: 2,
      HeadRevisionNum: 4,
      LastReleasedRevisionNum: 3,
    }),
    // An empty ValidationErrors map blocks nothing: still Unreleased changes.
    unit({
      UnitID: 'retail-extra',
      SpaceID: 'retail',
      TargetID: 't-retail',
      HeadRevisionNum: 2,
      LastReleasedRevisionNum: 1,
      ValidationErrors: {},
    }),

    // Gated: head past release, blocked by a validation error. Up to date with upstream.
    unit({
      UnitID: 'logistics-app',
      SpaceID: 'logistics',
      TargetID: 't-logistics',
      UpstreamUnitID: 'base-app',
      UpstreamRevisionNum: 3,
      HeadRevisionNum: 5,
      LastReleasedRevisionNum: 2,
      ValidationErrors: { 'vet-images': true },
    }),
    // Upstream not in the loaded units: cannot be compared, so not Stale. No head yet,
    // so not Unreleased changes either.
    unit({
      UnitID: 'logistics-orphan',
      SpaceID: 'logistics',
      TargetID: 't-logistics',
      UpstreamUnitID: 'not-loaded',
      UpstreamRevisionNum: 1,
      HeadRevisionNum: 0,
      LastReleasedRevisionNum: 0,
    }),
  ];

  const unitById = new Map(units.map((u) => [u.Unit!.UnitID!, u]));
  const { deployments } = buildComponentData(spaces, units, unitById, new Map());
  const byId = new Map(deployments.map((d) => [d.deploymentId, d]));

  test('labels are a copy of Space.Labels, empty when the Space has none', () => {
    expect(byId.get('base')!.labels).toEqual(baseLabels);
    expect(byId.get('retail')!.labels).toEqual(retailLabels);
    expect(byId.get('logistics')!.labels).toEqual({});
    // A copy: the node never aliases the query cache's object.
    expect(byId.get('retail')!.labels).not.toBe(spaces[1].Space!.Labels);
  });

  test('the Space label Stage stays a label; the DAG depth is the stage field', () => {
    const retail = byId.get('retail')!;
    expect(retail.labels.Stage).toBe('prod');
    expect(retail.stage).toBe(1);
    expect(byId.get('base')!.stage).toBe(0);
  });

  test('configSignals count units by the card chip rules', () => {
    expect(byId.get('base')!.type).toBe('Base');
    expect(byId.get('base')!.configSignals).toEqual({
      staleUnits: 0,
      unreleasedUnits: 0,
      gatedUnits: 0,
    });
    expect(byId.get('retail')!.configSignals).toEqual({
      staleUnits: 1,
      unreleasedUnits: 2,
      gatedUnits: 0,
    });
    expect(byId.get('logistics')!.configSignals).toEqual({
      staleUnits: 0,
      unreleasedUnits: 0,
      gatedUnits: 1,
    });
  });

  test('the side-pane counts keep their own meaning', () => {
    // unappliedCount counts every unit with a head past its release, Target or not;
    // it is not the card's Unreleased changes count.
    expect(byId.get('base')!.unappliedCount).toBe(2);
    expect(byId.get('retail')!.upgradeableCount).toBe(1);
    expect(byId.get('logistics')!.unappliedCount).toBe(1);
  });
});

test.describe('uniqueTargetLabels', () => {
  const names = new Map([
    ['t-east', 'cluster'],
    ['t-west', 'cluster'],
    ['t-oci', 'OCI registry'],
  ]);
  const spaceSlugs = new Map([
    ['t-east', 'us-east-prod1'],
    ['t-west', 'us-west-prod1'],
    ['t-oci', 'registries'],
  ]);

  test('Targets that share a name get their Space slug added', () => {
    const labels = uniqueTargetLabels(['t-east', 't-west', 't-oci'], names, spaceSlugs);
    expect(labels.get('t-east')).toBe('cluster · us-east-prod1');
    expect(labels.get('t-west')).toBe('cluster · us-west-prod1');
  });

  test('a unique name stays the same', () => {
    expect(uniqueTargetLabels(['t-east', 't-oci'], names, spaceSlugs)).toEqual(
      new Map([
        ['t-east', 'cluster'],
        ['t-oci', 'OCI registry'],
      ]),
    );
  });

  test('one Target counted twice is still unique; no Space slug keeps the name', () => {
    expect(uniqueTargetLabels(['t-east', 't-east'], names, spaceSlugs).get('t-east')).toBe(
      'cluster',
    );
    const noSlug = uniqueTargetLabels(['t-east', 't-west'], names, new Map());
    expect([...noSlug.values()]).toEqual(['cluster', 'cluster']);
  });

  test('buildComponentData labels each Deployment Target in the Component', () => {
    const spaces: ExtendedSpaceRead[] = ['east', 'west', 'oci'].map((id) => ({
      Space: { SpaceID: id, Slug: `shop-${id}` } as ExtendedSpaceRead['Space'],
    }));
    const units: ExtendedUnitRead[] = ['east', 'west', 'oci'].map((id) => ({
      Unit: { UnitID: `u-${id}`, SpaceID: id, TargetID: `t-${id}`, Slug: 'app' } as UnitRead,
    }));
    const { deployments } = buildComponentData(
      spaces,
      units,
      new Map(units.map((u) => [u.Unit!.UnitID!, u])),
      names,
      undefined,
      spaceSlugs,
    );
    const labelOf = (id: string) =>
      deployments.find((d) => d.deploymentId === id)!.targets.map((t) => [t.name, t.label]);
    expect(labelOf('east')).toEqual([['cluster', 'cluster · us-east-prod1']]);
    expect(labelOf('west')).toEqual([['cluster', 'cluster · us-west-prod1']]);
    expect(labelOf('oci')).toEqual([['OCI registry', 'OCI registry']]);
  });
});
