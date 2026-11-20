// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Field diagnosis, S5: one hover card per row, the existing "Edit this value" card with the
// field's set-by, at most one attention line and Details (docs/design/field-diagnosis/PLAN.md U5,
// contract D5). It reads the cached blame only: no request on hover. The spec seeds its own
// `fdt-*` Component (tests/fixtures/field-diagnosis/seed.ts).
import type { Page, Request } from '@playwright/test';

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

const params = (page: Page) => new URL(page.url()).searchParams;
const webCard = (page: Page) =>
  page.getByTestId('unit-card').filter({ has: page.getByTestId('unit-header').filter({ hasText: /\bweb\b/ }) });

/** Open prod's web card and wait for its whole-unit blame, which the row card reads cached. */
async function openWeb(page: Page) {
  await page.goto(`/components?app=${encodeURIComponent(seed.component)}&space=${seed.prod.spaceId}`);
  const blame = page.waitForResponse((r) => r.url().includes(`/unit/${seed.prod.unitId}/blame`) && r.ok(), { timeout: 30_000 });
  await webCard(page).getByTestId('unit-header').click();
  await expect(webCard(page).getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 30_000 });
  await blame;
}

/** Requests the hover could make: the path report, or the Unit itself. */
function hoverReads(page: Page) {
  const seen: Request[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (/\/unit\/[^/]+\/path\?/.test(url) || new RegExp(`/unit/${seed.prod.unitId}(\\?|$)`).test(url)) seen.push(r);
  });
  return seen;
}

test('hovering a row shows Edit this value, set-by, one attention line and Details, with no request', async ({ page }) => {
  await openWeb(page);
  const reads = hoverReads(page);
  await webCard(page).getByTestId('field-edit-trigger-spec.replicas').hover();
  const rows = page.getByTestId('fd-peek-rows');
  await expect(rows).toBeVisible({ timeout: 10_000 });
  // fd-row-card is the whole card: its head, the field rows and Keep on merge (verify round 4).
  const card = page.getByTestId('fd-row-card');
  await expect(card).toContainText('Edit this value');
  await expect(card.getByTestId('fd-peek-rows')).toBeVisible();
  await expect(card.getByTestId('tooltip-protect-toggle')).toBeVisible();
  await expect(rows.getByTestId('fd-peek-setby')).toBeVisible();
  await expect(rows.getByTestId('fd-peek-attention')).toContainText('Upstream wants 7');
  await expect(rows.getByTestId('fd-peek-details')).toHaveText('Details');
  // Keep on merge says the Override guard: no Override line.
  await expect(rows.getByTestId('fd-peek-guard')).toHaveCount(0);
  await expect(page.getByText(/Functions:/)).toHaveCount(0);
  expect(reads).toHaveLength(0);
});

test("the attention line's Upstream and its value are accent links with peeks, as in the details (D6)", async ({ page }) => {
  await openWeb(page);
  const reads = hoverReads(page);
  await webCard(page).getByTestId('field-edit-trigger-spec.replicas').hover();
  const attention = page.getByTestId('fd-peek-attention');
  await expect(attention).toContainText('Upstream wants 7', { timeout: 10_000 });
  await expect(attention.locator('a[data-testid="fd-conflict-source"]')).toHaveAttribute('href', /unit=/);
  await expect(attention.locator('a[data-testid="fd-conflict-rev"]')).toHaveAttribute('href', /revision=\d+/);
  await attention.getByTestId('fd-conflict-rev').hover();
  await expect(page.getByTestId('fd-peek-revision')).toBeVisible({ timeout: 5_000 });
  expect(reads.filter((r) => /\/path\?/.test(r.url()))).toHaveLength(0);
});

test('a requirement guard: its line, and no gate line (the gate names no path)', async ({ page }) => {
  await openWeb(page);
  await webCard(page).getByTestId('field-edit-trigger-spec.template.spec.securityContext.runAsUser').hover();
  const rows = page.getByTestId('fd-peek-rows');
  await expect(rows).toBeVisible({ timeout: 10_000 });
  await expect(rows.getByTestId('fd-peek-guard')).toHaveText('RunAsRoot · edits ✗ merges ✗');
  await expect(rows.getByTestId('fd-peek-attention')).toHaveCount(0);
});

test('Details opens the field in place: the URL names it, by replace', async ({ page }) => {
  await openWeb(page);
  const before = await page.evaluate(() => window.history.length);
  await webCard(page).getByTestId('field-edit-trigger-spec.replicas').hover();
  const details = page.getByTestId('fd-peek-details');
  await expect(details).toBeVisible({ timeout: 10_000 });
  await expect(details).toHaveAttribute('href', /field=spec\.replicas/);
  await details.click();
  await expect(page.getByTestId('fd-details')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => params(page).get('field')).toBe('spec.replicas');
  expect(await page.evaluate(() => window.history.length)).toBe(before);
});
