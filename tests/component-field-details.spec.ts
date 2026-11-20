// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Field diagnosis, S2: the field details in the Component side pane, in place of the old inspector
// (docs/design/field-diagnosis/PLAN.md U2, contract docs/design/field-diagnosis/contract/).
// The spec seeds its own `fdt-*` Component (tests/fixtures/field-diagnosis/seed.ts) on a real
// server and uses `page.route` only to count requests.
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

/** Open the Component on a Space, open the Unit card `web`. */
async function openUnit(page: Page, spaceId: string) {
  await page.goto(`/components?app=${encodeURIComponent(seed.component)}&space=${spaceId}`);
  const card = page.getByRole('button', { name: /\/web\b/ }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const rows = page.getByTestId('component-leaf-row').first();
  // A card with an incoming upgrade opens by itself; give it the time to draw before a click,
  // which would close it.
  const drawn = await rows.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
  if (!drawn) await card.click();
  await expect(rows).toBeVisible({ timeout: 20_000 });
}

/** Click a field's path label (its last segment) to open its details. */
async function openField(page: Page, key: string) {
  const label = page.locator('.dim-path', { hasText: new RegExp(`^${key}$`) }).first();
  await label.scrollIntoViewIfNeeded();
  await label.click();
  const details = page.getByTestId('fd-details');
  await expect(details).toBeVisible({ timeout: 20_000 });
  return details;
}

const pathRequests = (page: Page) => {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (/\/unit\/[^/]+\/path\?/.test(r.url())) seen.push(r);
  });
  return seen;
};

test('opening a field shows its details, with one path read', async ({ page }) => {
  const paths = pathRequests(page);
  await openUnit(page, seed.prod.spaceId);
  const details = await openField(page, 'replicas');

  await expect(details.getByTestId('fd-path')).toHaveText('spec.replicas');
  await expect(details.getByTestId('fd-value')).toHaveText('5');
  await expect(details.getByTestId('fd-who')).toBeVisible();
  await expect(details.getByTestId('fd-conflict-text')).toHaveText('Upstream wants 7·held by Override');
  await expect(details.getByTestId('fd-need-action-conflict')).toHaveText('Apply');
  await expect(details.getByTestId('fd-guard-Override')).toContainText('edits✓merges✗');
  // The Unit's gate names no path: nothing about it in the field details (D3, team-lead (c)).
  await expect(details.getByTestId('fd-need-gate')).toHaveCount(0);
  await expect(details.getByText(/Unit gates/)).toHaveCount(0);
  await expect(page.getByText('Inspect value')).toHaveCount(0);
  expect(paths.filter((r) => !r.url().includes('history=true'))).toHaveLength(1);

  // Close and reopen: the answer is cached.
  await details.getByTestId('fd-close').click();
  await expect(page.getByTestId('fd-details')).toHaveCount(0);
  await openField(page, 'replicas');
  expect(paths.filter((r) => !r.url().includes('history=true'))).toHaveLength(1);
});

test('History reads the field once with history, on demand', async ({ page }) => {
  const paths = pathRequests(page);
  await openUnit(page, seed.prod.spaceId);
  const details = await openField(page, 'replicas');
  expect(paths.some((r) => r.url().includes('history=true'))).toBe(false);
  await details.getByTestId('fd-more-history').click();
  await expect(details.getByTestId('fd-history')).toBeVisible();
  await expect(details.getByTestId('fd-history')).toContainText('5');
  // Each row links its revision.
  const rev = details.getByTestId('fd-history-rev').first();
  await expect(rev).toHaveText(/^rev \d+$/);
  await expect(rev).toHaveAttribute('href', new RegExp(`/units/${seed.prod.spaceId}/${seed.prod.unitId}\\?.*revision=\\d+`));
  expect(paths.filter((r) => r.url().includes('history=true'))).toHaveLength(1);
});

test('History is newest first, in aligned columns, with the function only where there is no reason', async ({ page }) => {
  // Four rows in the server's order (oldest first), as the owner's fd-prod web has: the real
  // answer with its History replaced.
  await page.route(`**/unit/${seed.prod.unitId}/path*`, async (route) => {
    if (!route.request().url().includes('history=true')) return route.fallback();
    const response = await route.fetch();
    const report = (await response.json()) as { History?: unknown[] };
    const row = (n: number, value: string, description?: string) => ({
      Value: `${value}\n`,
      Origin: { SpaceID: seed.prod.spaceId, UnitID: seed.prod.unitId, RevisionNum: n, User: 'admin@local.confighub.dev', Function: 'set-replicas', ...(description ? { Description: description } : {}) },
    });
    report.History = [row(3, '5'), row(7, '6', 'Scale for the launch'), row(9, '8', 'Prod runs 8 for Black Friday, then back to 5 on Monday'), row(12, '5', 'Back to 5')];
    await route.fulfill({ response, json: report });
  });
  await openUnit(page, seed.prod.spaceId);
  const details = await openField(page, 'replicas');
  await details.getByTestId('fd-more-history').click();
  const rows = details.getByTestId('fd-history-row');
  await expect(rows).toHaveCount(4, { timeout: 20_000 });
  await expect(details.getByTestId('fd-history-rev')).toHaveText(['rev 12', 'rev 9', 'rev 7', 'rev 3']);
  // The function only where there is no reason (rev 3).
  await expect(rows.nth(3)).toContainText('set-replicas');
  for (const i of [0, 1, 2]) await expect(rows.nth(i)).not.toContainText('set-replicas');
  // The reason is one line, its full text on hover.
  await expect(rows.nth(1).getByTestId('fd-history-reason')).toHaveAttribute('title', /Black Friday, then back to 5 on Monday/);
  // The columns line up: each row's value and time cells start at the same x.
  for (const cell of ['fd-history-value', 'fd-history-who', 'fd-history-when', 'fd-history-reason']) {
    const xs = await details.getByTestId(cell).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(xs).toHaveLength(4);
    expect(new Set(xs).size).toBe(1);
  }
});

test('Edit opens the row editor; an unsaved edit shows and Discard drops it', async ({ page }) => {
  await openUnit(page, seed.prod.spaceId);
  const details = await openField(page, 'replicas');
  await details.getByTestId('fd-edit').click();
  const input = page.getByTestId('field-edit-input');
  await expect(input).toBeVisible();
  await input.fill('6');
  await input.press('Enter');
  await expect(details.getByTestId('fd-pending')).toContainText('Unsaved: 6');
  await details.getByTestId('fd-discard').click();
  await expect(details.getByTestId('fd-pending')).toHaveCount(0);
});

test("Override Remove stages the row's Let merges update this", async ({ page }) => {
  await openUnit(page, seed.prod.spaceId);
  const details = await openField(page, 'replicas');
  const row = page.getByTestId('component-leaf-row').filter({ has: page.locator('.dim-path', { hasText: /^replicas$/ }) });
  await expect(row).toHaveAttribute('data-protected', 'true');
  await details.getByTestId('fd-guard-remove-Override').click();
  await expect(row).toHaveAttribute('data-protected', 'false');
  await expect(row).toHaveAttribute('data-change-type', 'protect');
});

test('a requirement guard, and no line for the Unit gate that names no path', async ({ page }) => {
  await openUnit(page, seed.prod.spaceId);
  const details = await openField(page, 'runAsUser');
  await expect(details.getByTestId('fd-guard-RunAsRoot')).toContainText('edits✗merges✗');
  // Held by securityContext, not by the field: shown, but not removable here.
  await expect(details.getByTestId('fd-guard-remove-RunAsRoot')).toBeDisabled();
  await expect(details.getByText(/Unit gates/)).toHaveCount(0);
});

test('an incoming upgrade: the line and the row checkbox stay in sync', async ({ page }) => {
  await openUnit(page, seed.staging.spaceId);
  const details = await openField(page, 'replicas');
  await expect(details.getByTestId('fd-upgrade-text')).toContainText('Upstream has 9');
  const row = page.getByTestId('component-leaf-row').filter({ has: page.locator('.dim-path', { hasText: /^replicas$/ }) });
  const checkbox = row.locator('.upgrade-pill');
  // The Incoming view may stage every upgrade when it opens; start from unstaged.
  if (await details.getByTestId('fd-need-upgrade-staged').isVisible()) await checkbox.click();
  await expect(details.getByTestId('fd-need-action-upgrade')).toHaveText('Upgrade');
  // The Incoming view dims rows an upgrade does not change; the details are never dimmed.
  // (Polled: the card's own opacity transition may still be running.)
  await expect
    .poll(() =>
      details.evaluate((el) => {
        let product = 1;
        for (let e: Element | null = el; e; e = e.parentElement) product *= Number(getComputedStyle(e).opacity);
        return product;
      }),
    )
    .toBe(1);
  await details.getByTestId('fd-need-action-upgrade').click();
  await expect(details.getByTestId('fd-need-upgrade-staged')).toHaveText('Staged ✓');
  await expect(row).toHaveAttribute('data-change-type', 'upgrade');
  // Unticking the checkbox brings the button back.
  await checkbox.click();
  await expect(details.getByTestId('fd-need-action-upgrade')).toBeVisible();
});

test('Variants: one blame search on open, the value in each Deployment, this one marked', async ({ page }) => {
  const searches: Request[] = [];
  page.on('request', (r) => {
    // The pane's own blame searches (guarded fields) name no path; the Variants search does.
    if (r.url().includes('/unit_blame?') && new URL(r.url()).searchParams.has('path')) searches.push(r);
  });
  await openUnit(page, seed.prod.spaceId);
  const details = await openField(page, 'replicas');
  expect(searches).toHaveLength(0);
  await details.getByTestId('fd-more-variants').click();
  const list = details.getByTestId('fd-variants');
  // base moved to 9 after the merge; staging took 7; prod keeps its 5.
  await expect(list).toContainText('9');
  await expect(list).toContainText('7');
  await expect(list).toContainText('5');
  expect(searches).toHaveLength(1);
});

test('Dismiss writes at once after its dialog; the line goes, the value stays', async ({ page }) => {
  await openUnit(page, seed.prod.spaceId);
  const details = await openField(page, 'minReadySeconds');
  await expect(details.getByTestId('fd-conflict-text')).toContainText('Upstream wants 30');
  await details.getByTestId('fd-need-secondary-conflict').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Dismiss/ }).click();
  await expect(details.getByTestId('fd-need-conflict')).toHaveCount(0, { timeout: 20_000 });
  await expect(details.getByTestId('fd-value')).toHaveText('10');
});

test('Apply writes at once after its guard dialog; the value becomes 7', async ({ page }) => {
  await openUnit(page, seed.prod.spaceId);
  const details = await openField(page, 'replicas');
  await details.getByTestId('fd-need-action-conflict').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (const box of await dialog.getByRole('checkbox').all()) await box.check();
  await dialog.getByRole('button', { name: /^Apply/ }).click();
  await expect(details.getByTestId('fd-value')).toHaveText('7', { timeout: 20_000 });
  await expect(details.getByTestId('fd-need-conflict')).toHaveCount(0);
});

test('a failed blame read is an error with Retry, not "No record"', async ({ page }) => {
  let fail = true;
  await page.route(`**/unit/${seed.prod.unitId}/blame*`, async (route) => {
    if (fail) await route.fulfill({ status: 500, json: { Message: 'internal error' } });
    else await route.fallback();
  });
  await openUnit(page, seed.prod.spaceId);
  await page.locator('.dim-path', { hasText: /^replicas$/ }).first().click();
  const error = page.getByTestId('fd-error');
  await expect(error).toContainText('Could not read this field', { timeout: 20_000 });
  // fd-error is the whole line, Retry in it, as wide as the details (verify round 4).
  await expect(error.getByTestId('fd-retry')).toBeVisible();
  await expect(page.getByTestId('fd-empty')).toHaveCount(0);
  fail = false;
  await error.getByTestId('fd-retry').click();
  // (Its value is 7 by now: the Apply test above took the upstream value.)
  await expect(page.getByTestId('fd-details').getByTestId('fd-path')).toHaveText('spec.replicas', { timeout: 20_000 });
  await expect(page.getByTestId('fd-error')).toHaveCount(0);
});

test('a field with no blame record still becomes the URL focus (the tree path)', async ({ page }) => {
  // The real blame, without minReadySeconds: that field has no record, so no server path.
  await page.route(`**/unit/${seed.prod.unitId}/blame*`, async (route) => {
    const response = await route.fetch();
    const blame = (await response.json()) as { Fields?: { Path?: string }[] };
    blame.Fields = (blame.Fields ?? []).filter((f) => f.Path !== 'spec.minReadySeconds');
    await route.fulfill({ response, json: blame });
  });
  await openUnit(page, seed.prod.spaceId);
  await page.locator('.dim-path', { hasText: /^replicas$/ }).first().click();
  await expect.poll(() => new URL(page.url()).searchParams.get('field')).toBe('spec.replicas');
  await page.locator('.dim-path', { hasText: /^minReadySeconds$/ }).first().click();
  await expect(page.getByTestId('fd-empty')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => new URL(page.url()).searchParams.get('field')).toBe('spec.minReadySeconds');
});
