// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { Page } from '@playwright/test';
import type { Column } from '@confighub/rtk-query';

import { ApiHelper } from './api-helper';
import { applyCpuThrottling } from './slow-mode';
import { expect, hubApi } from './test';
import { RandomSlugGenerator } from './utils/random-slug-generator';

/**
 * Data for the View Explorer specs: a Space of its own (a random slug, so
 * specs never see each other's rows) with Units that carry `app` and `tier`
 * labels and a Deployment whose replica count differs per Unit, and helpers
 * to save Views over it the way the explorer does (a Filter plus a View).
 */

export interface SeedUnit {
  id: string;
  slug: string;
  app: string;
  tier: string;
  replicas: number;
}

export interface SeedView {
  viewId: string;
  filterId: string;
  spaceId: string;
  slug: string;
  name: string;
}

export interface ExplorerSeed {
  /** Delete the Space, its Units, and every View and Filter in it. */
  remove(): Promise<void>;
  spaceId: string;
  spaceSlug: string;
  units: SeedUnit[];
  /** A Unit View over this Space; `where` defaults to every Unit of the Space. */
  createView(options: {
    name: string;
    where?: string;
    columns?: Column[];
    annotations?: Record<string, string>;
    filterId?: string;
    /** The View's GroupBy, comma-separated as stored. */
    groupBy?: string;
  }): Promise<SeedView>;
}

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

const UNITS: ReadonlyArray<Omit<SeedUnit, 'id'>> = [
  { slug: 'alpha', app: 'checkout', tier: 'web', replicas: 2 },
  { slug: 'beta', app: 'checkout', tier: 'api', replicas: 3 },
  { slug: 'gamma', app: 'payments', tier: 'api', replicas: 4 },
];

export async function seedExplorer(page: Page): Promise<ExplorerSeed> {
  const api = new ApiHelper(page);
  const spaceSlug = `vx-spec-${RandomSlugGenerator.randomSlugName()}`;
  const space = await api.createSpace({ space: { Slug: spaceSlug } });
  const spaceId = space.SpaceID!;

  const units: SeedUnit[] = [];
  for (const u of UNITS) {
    const created = await api.createUnit({
      spaceId,
      unit: { Slug: u.slug, ToolchainType: 'Kubernetes/YAML', Labels: { app: u.app, tier: u.tier } },
    });
    await api.uploadUnitData({ spaceId, unitId: created.UnitID!, body: deployment(u.slug, u.replicas) });
    units.push({ ...u, id: created.UnitID! });
  }

  const createView: ExplorerSeed['createView'] = async ({ name, where, columns, annotations, filterId, groupBy }) => {
    const slug = `vx-spec-${RandomSlugGenerator.randomSlugName()}`;
    let fid = filterId;
    if (!fid) {
      const filterResponse = await hubApi.post(`/api/space/${spaceId}/filter`, {
        data: { Slug: `${slug}-filter`, From: 'Unit', Where: where ?? `Space.Slug = '${spaceSlug}'` },
      });
      expect(filterResponse.ok(), await filterResponse.text()).toBeTruthy();
      fid = (await filterResponse.json()).FilterID as string;
    }
    const viewResponse = await hubApi.post(`/api/space/${spaceId}/view`, {
      data: {
        Slug: slug,
        DisplayName: name,
        FilterID: fid,
        Of: 'Unit',
        Columns: columns ?? [{ Name: 'Slug' }, { Name: 'Space' }, { Name: 'Labels.app' }],
        Annotations: annotations,
        GroupBy: groupBy,
      },
    });
    expect(viewResponse.ok(), await viewResponse.text()).toBeTruthy();
    const view = await viewResponse.json();
    return { viewId: view.ViewID, filterId: fid, spaceId, slug, name };
  };

  const remove = async () => {
    for (const kind of ['view', 'filter', 'unit'] as const) {
      const list = await hubApi.get(`/api/space/${spaceId}/${kind}`);
      if (!list.ok()) continue;
      for (const item of (await list.json()) as Array<Record<string, Record<string, string>>>) {
        const entity = item[kind === 'view' ? 'View' : kind === 'filter' ? 'Filter' : 'Unit'];
        const id = entity?.[kind === 'view' ? 'ViewID' : kind === 'filter' ? 'FilterID' : 'UnitID'];
        if (id) await hubApi.delete(`/api/space/${spaceId}/${kind}/${id}`);
      }
    }
    await hubApi.delete(`/api/space/${spaceId}`);
  };

  return { remove, spaceId, spaceSlug, units, createView };
}

/** A View as the server has it now, with its Filter. */
export async function readView(spaceId: string, viewId: string) {
  const response = await hubApi.get(`/api/space/${spaceId}/view/${viewId}`, { params: { include: 'FilterID' } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

/** Every View in the organization whose DisplayName is `name`. */
export async function viewsNamed(name: string) {
  const response = await hubApi.get('/api/view', { params: { where: `DisplayName = '${name}'`, include: 'FilterID' } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as Array<{ View: { ViewID: string; SpaceID: string; FilterID?: string }; Filter?: { FilterID: string; Where?: string } }>;
}

/**
 * How long the first load of the explorer may take. On CI the app needs about
 * four seconds to boot before it even asks for rows (four test workers share a
 * runner with the server, the database and the UI), so Playwright's default
 * five-second wait fails while the page is still fine.
 */
export const FIRST_LOAD_TIMEOUT = 20_000;

/**
 * The longest main-thread task a responsiveness test accepts. One scroll step of
 * the 5,000-row table costs about 20 ms of rendering on a fast machine, 100-120 ms
 * at a 6x CPU throttle and 170-220 ms at 10x; a shared CI runner with four
 * workers has measured 318-340 ms. A real freeze (rendering every row instead of
 * a window) costs seconds, so CI's budget sits above runner noise and far below that.
 */
export const LONG_TASK_BUDGET_MS = process.env.CI ? 500 : 100;

/**
 * Wait until the explorer has loaded the rows it counts over: the toolbar
 * count names a total ("3 of 6 units"), or the text a test expects there.
 */
export async function waitForExplorer(page: Page, expected: string | RegExp = /of [1-9]/): Promise<void> {
  await expect(page.getByTestId('vx-count')).toContainText(expected, { timeout: FIRST_LOAD_TIMEOUT });
}

/** Open the explorer at `path` and wait for its first load (see `waitForExplorer`). */
export async function openExplorer(
  page: Page,
  path = '/x/view-explorer',
  expected?: string | RegExp,
): Promise<void> {
  // SLOW_MODE=6 throttles the CPU the way a CI runner is slow (a no-op without it).
  await applyCpuThrottling(page);
  await page.goto(path);
  await waitForExplorer(page, expected);
}

/**
 * A closed menu, popover or dialog is gone from the page, not only out of
 * sight. Under a slow CPU, one whose exit transition never finished stays
 * mounted, invisible, and takes every click meant for the page.
 */
export async function expectOverlaysGone(page: Page): Promise<void> {
  // A closed overlay kept mounted on purpose has MuiModal-hidden and takes no clicks; one stuck mid-exit has not.
  const live = page.locator('.MuiPopover-root:not(.MuiModal-hidden), .MuiDialog-root:not(.MuiModal-hidden)');
  await expect
    .poll(
      () =>
        live.evaluateAll((els) =>
          els.map((el) => `${el.className.split(' ').filter((c) => c.startsWith('Mui')).join('.')} "${(el.textContent ?? '').trim().slice(0, 60)}"`),
        ),
      { timeout: 3000, message: 'every closed menu, popover and dialog is gone from the page' },
    )
    .toEqual([]);
}

/** Reload the explorer and wait for it to load again. */
export async function reloadExplorer(page: Page, expected?: string | RegExp): Promise<void> {
  await page.reload();
  await waitForExplorer(page, expected);
}
