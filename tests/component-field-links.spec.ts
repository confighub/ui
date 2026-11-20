// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Field diagnosis, S4: every reference in the field details is a real link with its peek
// (docs/design/field-diagnosis/PLAN.md U4, contract D6, D7, D10). The spec seeds its own `fdt-*`
// Component; `page.route` only adds a per-path gate to one real path answer (contract section 5:
// the seed's gate names no path).
import type { Page } from '@playwright/test';

import { encodeFres } from '../src/pages/x/apps/field-diagnosis/componentFocus';
import { type FieldDiagnosisSeed, seedFieldDiagnosis } from './fixtures/field-diagnosis/seed';
import { expect, test } from './fixtures/test';

let seed: FieldDiagnosisSeed;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  seed = await seedFieldDiagnosis();
});

test.afterAll(async () => {
  await seed?.cleanup();
});

const FRES = encodeFres('apps/v1/Deployment', 'default/web') ?? '';
const LABEL = 'metadata.labels.app';
const fieldUrl = (spaceId: string, unitId: string, field: string) =>
  `/components?app=${encodeURIComponent(seed.component)}&space=${spaceId}&unit=${unitId}&field=${encodeURIComponent(field)}&fres=${encodeURIComponent(FRES)}`;
const params = (page: Page) => new URL(page.url()).searchParams;

async function openDetails(page: Page, url: string) {
  await page.goto(url);
  const details = page.getByTestId('fd-details');
  await expect(details).toBeVisible({ timeout: 30_000 });
  return details;
}

test('T3: every reference in the details is an <a> with an href', async ({ page }) => {
  const details = await openDetails(page, fieldUrl(seed.prod.spaceId, seed.prod.unitId, 'spec.replicas'));
  await expect(details.getByTestId('fd-conflict-source')).toBeVisible();
  for (const a of await details.locator('a').all()) {
    expect(await a.getAttribute('href')).toBeTruthy();
  }
  // Upstream, the wanted value (its revision) and the time (its revision) are links.
  await expect(details.locator('a[data-testid="fd-conflict-source"]')).toHaveCount(1);
  await expect(details.locator('a[data-testid="fd-conflict-rev"]')).toHaveAttribute('href', /revision=\d+/);
  await expect(details.locator('a[data-testid="fd-when"]')).toHaveAttribute('href', /revision=\d+/);
  // A person is text.
  await expect(details.locator('a[data-testid="fd-who-user"]')).toHaveCount(0);
});

test("hovering a conflict's revision shows its peek, not the line's meaning", async ({ page }) => {
  const details = await openDetails(page, fieldUrl(seed.prod.spaceId, seed.prod.unitId, 'spec.replicas'));
  await details.getByTestId('fd-conflict-rev').hover();
  await expect(page.getByTestId('fd-peek-revision')).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(800);
  await expect(page.getByRole('tooltip').filter({ hasText: 'A merge from upstream' })).toHaveCount(0);
});

test("the withheld change's revision peek names its source Unit, also when the Unit read names no upstream", async ({ page }) => {
  // The Unit read without its expanded upstream (as the contract's stub serves it).
  await page.route(`**/space/${seed.prod.spaceId}/unit/${seed.prod.unitId}?*`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const json = (await response.json()) as Record<string, unknown>;
    delete json.UpstreamSpace;
    delete json.UpstreamUnit;
    await route.fulfill({ response, json });
  });
  const details = await openDetails(page, fieldUrl(seed.prod.spaceId, seed.prod.unitId, 'spec.replicas'));
  await details.getByTestId('fd-conflict-rev').hover();
  const peek = page.getByTestId('fd-peek-revision');
  await expect(peek).toBeVisible({ timeout: 5_000 });
  await expect(peek).toContainText(`${seed.component}-staging/web`, { timeout: 10_000 });
});

test('cmd-click on a chain hop opens a new tab; this page stays where it is', async ({ page, context }) => {
  const details = await openDetails(page, fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  const before = page.url();
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    details.getByTestId('fd-hop-1').click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] }),
  ]);
  await expect.poll(() => new URL(popup.url()).searchParams.get('space'), { timeout: 15_000 }).toBe(seed.staging.spaceId);
  expect(page.url()).toBe(before);
  await popup.close();
});

test('a hop peeks the Space, the Unit, the field there and its head revision', async ({ page }) => {
  const details = await openDetails(page, fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  await details.getByTestId('fd-hop-1').hover();
  const peek = page.getByTestId('fd-peek-unit');
  await expect(peek).toBeVisible({ timeout: 5_000 });
  await expect(peek).toContainText(`${seed.component}-staging`);
  await expect(peek).toContainText('web');
  await expect(peek).toContainText(/head rev \d+/);
});

test("a hop's peek reads the field with its resource, and says when the read fails", async ({ page }) => {
  const reads: string[] = [];
  await page.route(`**/unit/${seed.staging.unitId}/path*`, async (route) => {
    reads.push(route.request().url());
    await route.fulfill({ status: 500, json: { Message: 'internal error' } });
  });
  const details = await openDetails(page, fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  await details.getByTestId('fd-hop-1').hover();
  const peek = page.getByTestId('fd-peek-unit');
  await expect(peek).toBeVisible({ timeout: 5_000 });
  await expect(peek).toContainText('Could not read', { timeout: 15_000 });
  expect(reads.length).toBeGreaterThan(0);
  expect(new URL(reads[0]).searchParams.get('resource')).toBe('default/web');
});

test('a per-path gate: its Trigger peeks the gate; a click opens the Gates tab; Back returns', async ({ page }) => {
  // The seed's gate names no path; add it to the real answer of this field, as a gate that names
  // the field's path would make it.
  await page.route('**/unit/*/path*', async (route) => {
    const response = await route.fetch();
    const report = (await response.json()) as { Field?: { Path?: string; Validation?: unknown[] } };
    if (report.Field?.Path === 'spec.template.spec.securityContext.runAsUser') {
      report.Field.Validation = [
        {
          Gate: `${seed.component}-prod/no-root-user/vet-celexpr`,
          TriggerID: seed.triggerId,
          Function: 'vet-celexpr',
          Path: report.Field.Path,
          Issues: [{ Message: 'runAsUser must not be 0' }],
        },
      ];
    }
    await route.fulfill({ response, json: report });
  });
  const url = fieldUrl(seed.prod.spaceId, seed.prod.unitId, 'spec.template.spec.securityContext.runAsUser');
  const details = await openDetails(page, url);
  const trigger = details.getByTestId('fd-gate-trigger');
  await expect(details.getByTestId('fd-gate-text')).toHaveText('Gate no-root-user fails');
  await trigger.hover();
  const peek = page.getByTestId('fd-peek-gate');
  await expect(peek).toBeVisible({ timeout: 5_000 });
  await expect(peek).toContainText('vet-celexpr · fail · 1 issue');
  await expect(peek).toContainText('runAsUser must not be 0');
  // The line's meaning tooltip (dark) does not open over a token's peek (verify round 3).
  await page.waitForTimeout(800);
  await expect(page.getByRole('tooltip').filter({ hasText: 'A failed gate blocks a Release' })).toHaveCount(0);

  await trigger.click();
  await expect.poll(() => params(page).get('tab')).toBe('gates');
  expect(params(page).get('gate')).toBe(seed.triggerId);
  await expect(page.getByRole('tab', { name: /Gates/ })).toHaveAttribute('aria-selected', 'true');

  await page.goBack();
  await expect.poll(() => params(page).get('tab')).toBeNull();
  await expect(page.getByRole('tab', { name: /Configuration/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('fd-details')).toBeVisible({ timeout: 20_000 });
});

test('after a gate link, a click on Configuration clears tab=gates; a later URL write stays there', async ({ page }) => {
  await page.goto(`/components?app=${encodeURIComponent(seed.component)}&space=${seed.prod.spaceId}&tab=gates&gate=${seed.triggerId}`);
  await expect(page.getByRole('tab', { name: /Gates/ })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
  await page.getByRole('tab', { name: /Configuration/ }).click();
  await expect.poll(() => params(page).get('tab')).toBeNull();
  expect(params(page).get('gate')).toBeNull();
  // Open a field: a URL write (replace). The pane must not go back to the Gates tab.
  const web = page.getByTestId('unit-card').filter({ has: page.getByTestId('unit-header').filter({ hasText: /\bweb\b/ }) });
  await web.getByTestId('unit-header').click();
  await web.locator('.dim-path', { hasText: /^replicas$/ }).first().click();
  await expect.poll(() => params(page).get('field')).toBe('spec.replicas');
  await expect(page.getByRole('tab', { name: /Configuration/ })).toHaveAttribute('aria-selected', 'true');
});

test('T6: with no field open, Back after leaving the page restores the pane scroll', async ({ page }) => {
  await page.goto(`/components?app=${encodeURIComponent(seed.component)}&space=${seed.prod.spaceId}`);
  const card = page.getByTestId('unit-card').filter({ has: page.getByTestId('unit-header').filter({ hasText: /\bweb\b/ }) });
  await card.getByTestId('unit-header').click();
  const apiCard = page.getByTestId('unit-card').filter({ has: page.getByTestId('unit-header').filter({ hasText: /\bapi\b/ }) });
  await apiCard.getByTestId('unit-header').click();
  const list = page.getByTestId('unit-list');
  await expect(page.getByTestId('component-leaf-row').nth(10)).toBeVisible({ timeout: 20_000 });
  const scrollable = await list.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(scrollable).toBeGreaterThan(40);
  const target = Math.floor(scrollable / 2);
  await list.evaluate((el, top) => {
    el.scrollTop = top;
  }, target);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(target);
  await page.goto('/spaces');
  await page.goBack();
  await expect.poll(() => list.evaluate((el) => el.scrollTop), { timeout: 20_000 }).toBeGreaterThanOrEqual(target - 2);
  expect(Math.abs((await list.evaluate((el) => el.scrollTop)) - target)).toBeLessThanOrEqual(2);
});
