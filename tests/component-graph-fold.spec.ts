// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A Component with 10 or more Deployments folds in the browser: its quiet
// Deployments show as stacks under their Base, a condition on most of them
// shows once as a wave chip with one action, a stack opens in place without
// a change of zoom, and the Group by choice (a label, or Off) lives in the
// URL (?graphGroup=) so a reload keeps the same stacks.
//
// Fixture: one Base Space with a Unit, and 22 Deployment Spaces, each with a
// Target and a Unit cloned from the Base's Unit. The Base's Unit then changes,
// so all 22 are Stale (a wave), and none has been released (a second wave).
// Every Deployment Space has a Department (3 values) and a Region (2 values),
// so the default Group by is Department.
import { type Page } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, newAuthorizedContext, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const APP_LABEL = `e2e-fold-${RandomSlugGenerator.randomSlugName()}`;
const DEPLOYMENTS = 22;
const DEPARTMENTS = ['retail', 'payments', 'logistics'];
const REGIONS = ['eu', 'us'];

function configMap(value: string): string {
  return [
    'apiVersion: v1',
    'kind: ConfigMap',
    'metadata:',
    '  name: fold-config',
    'data:',
    `  value: "${value}"`,
  ].join('\n');
}

async function openApi(page: Page): Promise<ApiHelper> {
  await page.goto('/');
  await page.waitForResponse(
    (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
  );
  return new ApiHelper(page);
}

async function post<T>(url: string, data: unknown, params: Record<string, string> = {}) {
  const response = await hubApi.post(url, {
    params: { allow_exists: 'true', ...params },
    data,
  });
  if (!response.ok()) throw new Error(`${url}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
}

/** The zoom of the flow canvas, read from the viewport's CSS transform. */
async function canvasZoom(page: Page): Promise<number> {
  const transform = await page
    .locator('.react-flow__viewport')
    .evaluate((el) => (el as HTMLElement).style.transform);
  const match = /scale\(([\d.]+)\)/.exec(transform);
  if (!match) throw new Error(`no scale in "${transform}"`);
  return Number(match[1]);
}

async function openComponent(page: Page, query = ''): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}&mode=auto${query}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
}

test.describe('a Component with 10 or more Deployments folds', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'authentication.json' });

  const baseSlug = `e2e-fold-base-${RandomSlugGenerator.randomSlugName()}`;
  let baseSpaceId = '';
  const deploymentSpaceIds: string[] = [];
  const idsByDepartment = new Map<string, string[]>();

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    const api = await openApi(page);

    const { ComponentID: componentId } = await api.createComponent(APP_LABEL);
    const base = await api.createSpace({
      space: { Slug: baseSlug, ComponentID: componentId, Labels: { Owner: 'E2E' } },
    });
    baseSpaceId = base.SpaceID!;

    const baseUnit = await post<{ Unit: { UnitID: string } }>(
      `/api/space/${baseSpaceId}/unit`,
      {
        Slug: 'fold-config',
        ToolchainType: 'Kubernetes/YAML',
      },
    );
    await api.uploadUnitData({
      spaceId: baseSpaceId,
      unitId: baseUnit.Unit.UnitID,
      body: configMap('1'),
    });

    // A few at a time: 22 Spaces, Targets and clones one by one take long,
    // and all at once would flood the local server.
    const indexes = Array.from({ length: DEPLOYMENTS }, (_, i) => i);
    for (let start = 0; start < indexes.length; start += 6) {
      await Promise.all(
        indexes.slice(start, start + 6).map(async (i) => {
          const slug = `${baseSlug}-d${String(i + 1).padStart(2, '0')}`;
          const space = await api.createSpace({
            space: {
              Slug: slug,
              ComponentID: componentId,
              Labels: {
                Owner: 'E2E',
                Department: DEPARTMENTS[i % DEPARTMENTS.length],
                Region: REGIONS[i % REGIONS.length],
              },
            },
          });
          const spaceId = space.SpaceID!;
          deploymentSpaceIds.push(spaceId);
          const department = DEPARTMENTS[i % DEPARTMENTS.length];
          idsByDepartment.set(department, [
            ...(idsByDepartment.get(department) ?? []),
            spaceId,
          ]);
          const target = await post<{ TargetID: string }>(`/api/space/${spaceId}/target`, {
            Slug: `${slug}-tgt`,
          });
          await post(
            `/api/space/${spaceId}/unit`,
            {
              Slug: 'fold-config',
              ToolchainType: 'Kubernetes/YAML',
              TargetID: target.TargetID,
            },
            { upstream_space_id: baseSpaceId, upstream_unit_id: baseUnit.Unit.UnitID },
          );
        }),
      );
    }

    // The Base moves on, so every clone is Stale.
    await api.uploadUnitData({
      spaceId: baseSpaceId,
      unitId: baseUnit.Unit.UnitID,
      body: configMap('2'),
    });
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    const api = await openApi(page);
    // Downstream first, so the Base's Unit has no clones left when it goes.
    for (const spaceId of deploymentSpaceIds) {
      await api.deleteSpace(spaceId, true).catch(() => {});
    }
    if (baseSpaceId) await api.deleteSpace(baseSpaceId, true).catch(() => {});
    await context.close();
  });

  test('quiet Deployments stack by Department, with one Stale wave on the Base', async ({
    page,
  }) => {
    await openComponent(page);
    const foldFrame = page.getByTestId(`flow-fold-${baseSpaceId}`);
    await expect(foldFrame).toBeVisible({ timeout: 30000 });

    // With no choice the fold is Auto: the default key shows, and the URL
    // stays without ?graphGroup=, so the threshold keeps deciding.
    await expect(page.getByTestId('flow-group-by-button')).toContainText('Department');
    await expect(page).not.toHaveURL(/[?&]graphGroup=/);

    // One stack per Department, and no card for a quiet (only Stale) Deployment.
    for (const department of DEPARTMENTS) {
      await expect(
        page.getByTestId(`flow-stack-stack:${baseSpaceId}:v:${department}`),
      ).toBeVisible();
    }
    await expect(page.locator('[data-testid^="flow-stack-stack:"]')).toHaveCount(3);
    for (const id of deploymentSpaceIds) {
      await expect(page.getByTestId(`flow-node-${id}`)).toHaveCount(0);
    }
    // The header names the Departments in stack order, with no "quiet" count;
    // its tooltip holds the full list and the key.
    const values = page.getByTestId(`flow-fold-values-${baseSpaceId}`);
    const sorted = [...DEPARTMENTS].sort();
    await expect(values).toHaveAttribute('title', `Department: ${sorted.join(', ')}`);
    const shown = (await values.getByTestId('flow-fold-header-line').allTextContents())
      .join(' ')
      .split('·')
      .map((value) => value.trim())
      .filter(Boolean);
    expect(shown).toEqual(sorted);
    await expect(foldFrame).not.toContainText(/quiet/i);

    // The Base says how many variants are downstream of it, and no Unit count.
    const baseNode = page.getByTestId(`flow-node-${baseSpaceId}`);
    await expect(baseNode).toContainText(`${DEPLOYMENTS} variants`);
    await expect(baseNode).not.toContainText(/\bunits?\b/);

    // Stale on all 22 is one chip with one action, not 22 chips.
    const stale = page.getByTestId('flow-fold-wave-stale');
    await expect(stale).toContainText(`Stale · ${DEPLOYMENTS}`);
    await expect(page.getByTestId('flow-fold-wave-action-stale')).toHaveText(
      `Upgrade ${DEPLOYMENTS}`,
    );

    // Fit keeps a folded graph readable.
    const zoom = await canvasZoom(page);
    expect(zoom).toBeGreaterThanOrEqual(0.8);
    expect(zoom).toBeLessThanOrEqual(1);
  });

  test('a stack opens in place and the zoom does not change', async ({ page }) => {
    await openComponent(page);
    const stackId = `stack:${baseSpaceId}:v:retail`;
    const stack = page.getByTestId(`flow-stack-${stackId}`);
    await expect(stack).toBeVisible({ timeout: 30000 });
    // Let the load Fit settle before measuring.
    await page.waitForTimeout(800);
    const zoomBefore = await canvasZoom(page);

    await stack.getByRole('button', { name: 'Expand stack' }).click();
    const frame = page.getByTestId(`flow-stack-frame-${stackId}`);
    await expect(frame).toBeVisible();
    // Its members are cards now, and they were not cards before.
    const members = idsByDepartment.get('retail')!;
    expect(members).toHaveLength(Math.ceil(DEPLOYMENTS / DEPARTMENTS.length));
    for (const id of members) await expect(page.getByTestId(`flow-node-${id}`)).toBeVisible();
    await expect(frame).toContainText('Opened by you');
    // The other stacks stay closed.
    await expect(page.getByTestId(`flow-stack-stack:${baseSpaceId}:v:payments`)).toBeVisible();
    await page.waitForTimeout(800);
    expect(await canvasZoom(page)).toBe(zoomBefore);

    await page.getByRole('button', { name: 'Collapse stack' }).first().click();
    await expect(frame).toHaveCount(0);
    for (const id of members) await expect(page.getByTestId(`flow-node-${id}`)).toHaveCount(0);
    await page.waitForTimeout(800);
    expect(await canvasZoom(page)).toBe(zoomBefore);
  });

  test('a new Group by goes into the URL and survives a reload', async ({ page }) => {
    await openComponent(page);
    await expect(page.getByTestId(`flow-fold-${baseSpaceId}`)).toBeVisible({ timeout: 30000 });

    await page.getByTestId('flow-group-by-button').click();
    await page.getByTestId('flow-group-by-option-Region').click();
    await expect(page).toHaveURL(/[?&]graphGroup=Region(&|$)/);
    for (const region of REGIONS) {
      await expect(
        page.getByTestId(`flow-stack-stack:${baseSpaceId}:v:${region}`),
      ).toBeVisible();
    }
    await expect(page.locator('[data-testid^="flow-stack-stack:"]')).toHaveCount(2);

    await page.reload();
    await expect(page.getByTestId(`flow-fold-${baseSpaceId}`)).toBeVisible({ timeout: 30000 });
    await expect(page).toHaveURL(/[?&]graphGroup=Region(&|$)/);
    await expect(page.getByTestId('flow-group-by-button')).toContainText('Region');
    await expect(page.locator('[data-testid^="flow-stack-stack:"]')).toHaveCount(2);

    // A deep link with the key picks it too.
    await openComponent(page, '&graphGroup=Department');
    await expect(page.locator('[data-testid^="flow-stack-stack:"]')).toHaveCount(3);
  });

  test('Off unfolds the graph, and the choice survives a reload', async ({ page }) => {
    await openComponent(page);
    await expect(page.getByTestId(`flow-fold-${baseSpaceId}`)).toBeVisible({ timeout: 30000 });

    await page.getByTestId('flow-group-by-button').click();
    await page.getByTestId('flow-group-by-option-off').click();
    await expect(page).toHaveURL(/[?&]graphGroup=off(&|$)/);
    await expect(page.getByTestId(`flow-fold-${baseSpaceId}`)).toHaveCount(0);
    await expect(page.locator('[data-testid^="flow-stack-stack:"]')).toHaveCount(0);
    await expect(page.getByTestId('flow-group-by-button')).toContainText('Off');
    await expect(page.getByTestId('flow-group-by-button')).toBeEnabled();

    await page.reload();
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/[?&]graphGroup=off(&|$)/);
    await expect(page.getByTestId('flow-group-by-button')).toContainText('Off');
    await expect(page.getByTestId(`flow-fold-${baseSpaceId}`)).toHaveCount(0);
  });
});
