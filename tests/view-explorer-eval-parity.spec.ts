// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Page, Route } from '@playwright/test';

import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import { compileWhere } from '../src/pages/x/view-explorer/model/lens-compile';
import type { Lens, LensSpec } from '../src/pages/x/view-explorer/model/types';
import { encodeDraftParam } from '../src/pages/x/view-explorer/model/view-codec';
import { expect, hubApi, test } from './fixtures/test';
import { type ExplorerSeed, seedExplorer, openExplorer } from './fixtures/view-explorer-seed';

/**
 * The lens column counts on the client, so its numbers must be the server's.
 * For each kind of lens, the count the page shows ("N of M" in the column) is
 * compared with the number of Units the server returns for the same WHERE
 * (compiled by the same code the page saves with): once over the seed's own
 * Space, and once over the whole organization, which holds Units with and
 * without Targets, releases and upstreams.
 */

const CASES: Array<{ name: string; spec: (seed: ExplorerSeed) => LensSpec }> = [
  {
    name: '= on a label',
    spec: () => ({ kind: 'field', field: 'Labels.app', op: 'is', values: ['checkout'] }),
  },
  {
    name: '!= on a label',
    spec: () => ({ kind: 'field', field: 'Labels.app', op: 'isNot', values: ['checkout'] }),
  },
  {
    name: 'IN',
    spec: () => ({ kind: 'field', field: 'Labels.tier', op: 'is', values: ['web', 'api'] }),
  },
  {
    name: 'NOT IN',
    spec: () => ({
      kind: 'field',
      field: 'Labels.tier',
      op: 'isNot',
      values: ['web', 'worker'],
    }),
  },
  {
    name: 'LIKE on a slug',
    spec: () => ({ kind: 'field', field: 'Slug', op: 'matches', values: ['*a*'] }),
  },
  {
    name: 'NOT LIKE on a Space',
    spec: () => ({ kind: 'field', field: 'Space', op: 'isNot', values: ['vx-demo-pay*'] }),
  },
  {
    name: '= on a Space',
    spec: (seed) => ({ kind: 'field', field: 'Space', op: 'is', values: [seed.spaceSlug] }),
  },
  {
    name: 'IS NULL (no Target)',
    spec: () => ({ kind: 'field', field: 'Target', op: 'empty', values: [] }),
  },
  {
    name: 'IS NOT NULL (a Target)',
    spec: () => ({ kind: 'field', field: 'Target', op: 'notEmpty', values: [] }),
  },
  {
    name: 'a label is empty',
    spec: () => ({ kind: 'field', field: 'Labels.region', op: 'empty', values: [] }),
  },
  { name: 'status unreleased', spec: () => ({ kind: 'status', status: 'unreleased' }) },
  { name: 'status released', spec: () => ({ kind: 'status', status: 'released' }) },
  { name: 'status untargeted', spec: () => ({ kind: 'status', status: 'untargeted' }) },
  { name: 'status upgradable', spec: () => ({ kind: 'status', status: 'upgradable' }) },
  {
    name: 'a number comparison',
    spec: () => ({ kind: 'field', field: 'HeadRevisionNum', op: 'gte', values: ['3'] }),
  },
];

const lensOf = (spec: LensSpec, id: string): Lens => ({ ...spec, id, enabled: true }) as Lens;

async function serverIds(where: string): Promise<string[]> {
  // The same include as the page's unfiltered list: a Unit whose Space is gone
  // is left out of a list that includes Spaces, so both sides count the same Units.
  const response = await hubApi.get('/api/unit', {
    params: {
      where,
      select: 'UnitID',
      include: 'SpaceID,TargetID,UpstreamUnitID,UpstreamSpaceID',
    },
  });
  expect(response.ok(), `${where}: ${await response.text()}`).toBeTruthy();
  return ((await response.json()) as Array<{ Unit: { UnitID: string } }>).map((u) => u.Unit.UnitID);
}

/** The page's own unfiltered list of Units (the universe it counts over), by its `select`. */
const isUniverse = (url: string) => (new URL(url).searchParams.get('select') ?? '').startsWith('UnitID,Slug,');

/**
 * The client's count and the server's count over the SAME Units. Other specs
 * create and delete Units all the time (CI runs four workers per shard), so two
 * counts taken seconds apart rarely match. Here the server is asked for `where`
 * the moment the page's universe arrives, and only Units in that universe count.
 */
async function countsOverOneUniverse(page: Page, lenses: Lens[], where: string): Promise<{ client: number; server: number }> {
  let snapshot: { universe: string[]; matching: Set<string> } | null = null;
  const handler = async (route: Route) => {
    if (!isUniverse(route.request().url())) return route.fallback();
    const response = await route.fetch();
    const body = (await response.json()) as Array<{ Unit?: { UnitID?: string } }>;
    snapshot = {
      universe: body.map((u) => u.Unit?.UnitID ?? ''),
      matching: new Set(await serverIds(where)),
    };
    await route.fulfill({ response, json: body });
  };
  await page.route(/\/api\/unit\?/, handler);
  try {
    const client = await clientCount(page, lenses);
    const taken = snapshot as { universe: string[]; matching: Set<string> } | null;
    if (!taken) throw new Error('the page did not ask for its list of Units');
    return { client, server: taken.universe.filter((id) => taken.matching.has(id)).length };
  } finally {
    await page.unroute(/\/api\/unit\?/, handler);
  }
}

/** The number the column shows as the result ("17 of 51" → 17). */
async function clientCount(page: Page, lenses: Lens[]): Promise<number> {
  const def = { ...defaultViewDef('Unit'), lenses };
  await openExplorer(page, `/x/view-explorer?view=new&d=${encodeDraftParam(def)}`);
  const count = page.getByTestId('vx-filter-count');
  await expect(count).toContainText(/\d+ of [1-9]/);
  // Wait for the universe to settle: the count stays the same for a moment.
  let last = '';
  await expect
    .poll(async () => {
      const now = (await count.textContent()) ?? '';
      const stable = now === last;
      last = now;
      return stable;
    })
    .toBe(true);
  return Number(/(\d+)\s*of/.exec(last)?.[1] ?? NaN);
}

test.describe('view explorer: client counts equal the server', () => {
  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  let seed: ExplorerSeed;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ storageState: 'authentication.json' });
    seed = await seedExplorer(page);
    await page.close();
  });
  test.afterAll(async () => {
    await seed.remove();
  });

  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      const spec = c.spec(seed);
      const alone = [lensOf(spec, 'l1')];
      await expectParity(page, alone, 'org-wide');
      const scoped = [
        lensOf({ kind: 'field', field: 'Space', op: 'is', values: [seed.spaceSlug] }, 'l0'),
        lensOf(spec, 'l1'),
      ];
      await expectParity(page, scoped, 'in the seed Space');
    });
  }
});

/**
 * The client count equals the server count, both over the universe the page
 * loaded (see `countsOverOneUniverse`). A Unit deleted in the milliseconds
 * between the two lists can still make one attempt differ, so a mismatch is
 * tried again; only one that repeats fails.
 */
async function expectParity(page: Page, lenses: Lens[], label: string) {
  const where = compileWhere('Unit', lenses);
  let last: { client: number; server: number } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await countsOverOneUniverse(page, lenses, where);
    if (last.client === last.server) return;
  }
  expect(last?.client, `${label}: ${where}`).toBe(last?.server);
}
