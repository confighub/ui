// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Field diagnosis, S3: the details and the Unit cards follow the Component view URL
// (docs/design/field-diagnosis/PLAN.md U3). A jump pushes; opening and closing the details
// replace; Back and Forward restore the Space, the details and the hand-opened cards.
// The spec seeds its own `fdt-*` Component (tests/fixtures/field-diagnosis/seed.ts).
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

const fieldUrl = (spaceId: string, unitId: string, field: string, extra = '') =>
  `/components?app=${encodeURIComponent(seed.component)}&space=${spaceId}&unit=${unitId}&field=${encodeURIComponent(field)}&fres=${encodeURIComponent(FRES)}${extra}`;

const params = (page: Page) => new URL(page.url()).searchParams;
const historyLength = (page: Page) => page.evaluate(() => window.history.length);

async function expectDetails(page: Page, path: string) {
  const details = page.getByTestId('fd-details');
  await expect(details).toBeVisible({ timeout: 30_000 });
  await expect(details.getByTestId('fd-path')).toHaveText(path);
  return details;
}

/** The URL names a Space, its Unit `web` and the field. */
async function expectFocus(page: Page, space: { spaceId: string; unitId: string }, field: string | null) {
  await expect.poll(() => params(page).get('space'), { timeout: 15_000 }).toBe(space.spaceId);
  expect(params(page).get('unit')).toBe(space.unitId);
  expect(params(page).get('field')).toBe(field);
}

const cardOf = (page: Page, slug: string) =>
  page.getByTestId('unit-card').filter({ has: page.getByTestId('unit-header').filter({ hasText: new RegExp(`\\b${slug}\\b`) }) });

test('T1: chain hops jump and push; Back and Forward walk them, the details open each time', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  let details = await expectDetails(page, LABEL);
  await expect(details.getByTestId('fd-chain')).toContainText('this Unit');
  const start = await historyLength(page);

  await details.getByTestId('fd-hop-1').click(); // staging
  await expectFocus(page, seed.staging, LABEL);
  details = await expectDetails(page, LABEL);
  await details.getByTestId('fd-hop-0').click(); // base
  await expectFocus(page, seed.base, LABEL);
  await expectDetails(page, LABEL);
  expect(await historyLength(page)).toBe(start + 2);

  await page.goBack();
  await expectFocus(page, seed.staging, LABEL);
  await expectDetails(page, LABEL);
  await page.goBack();
  await expectFocus(page, seed.prod, LABEL);
  await expectDetails(page, LABEL);
  await page.goForward();
  await expectFocus(page, seed.staging, LABEL);
  await expectDetails(page, LABEL);
});

test('T2: a reload on a deep URL opens the field below the sticky header', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, 'spec.replicas'));
  await expectDetails(page, 'spec.replicas');
  await page.reload();
  await expectDetails(page, 'spec.replicas');
  const row = page.getByTestId('component-leaf-row').filter({ has: page.locator('.dim-path', { hasText: /^replicas$/ }) });
  const header = cardOf(page, 'web').getByTestId('unit-header');
  await expect
    .poll(async () => {
      const r = await row.boundingBox();
      const h = await header.boundingBox();
      return Boolean(r && h && r.y >= h.y + h.height - 1);
    })
    .toBe(true);
});

test('T2: a reload with tab=gates opens the Gates tab', async ({ page }) => {
  await page.goto(`/components?app=${encodeURIComponent(seed.component)}&space=${seed.prod.spaceId}&tab=gates&gate=${seed.triggerId}`);
  await expect(page.getByRole('tab', { name: /Gates/ })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
});

test('T4: a card opened by hand stays open after a jump and Back', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  const details = await expectDetails(page, LABEL);
  const api = cardOf(page, 'api');
  await api.getByTestId('unit-header').click();
  await expect(api.getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 20_000 });
  await details.getByTestId('fd-hop-0').click(); // base
  await expectFocus(page, seed.base, LABEL);
  await page.goBack();
  await expectFocus(page, seed.prod, LABEL);
  await expect(cardOf(page, 'api').getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 20_000 });
});

test('T7: a graph click on another node clears the focus, by replace', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  await expectDetails(page, LABEL);
  const before = await historyLength(page);
  await page.locator(`.react-flow__node[data-id="${seed.staging.spaceId}"]`).click();
  await expect.poll(() => params(page).get('space'), { timeout: 15_000 }).toBe(seed.staging.spaceId);
  expect(params(page).get('unit')).toBeNull();
  expect(params(page).get('field')).toBeNull();
  expect(params(page).get('fres')).toBeNull();
  expect(await historyLength(page)).toBe(before);
});

test('opening and closing the details replace: no history entry', async ({ page }) => {
  await page.goto(`/components?app=${encodeURIComponent(seed.component)}&space=${seed.prod.spaceId}`);
  const card = cardOf(page, 'web');
  await card.getByTestId('unit-header').click();
  const before = await historyLength(page);
  await page.locator('.dim-path', { hasText: /^replicas$/ }).first().click();
  await expectDetails(page, 'spec.replicas');
  await expect.poll(() => params(page).get('field')).toBe('spec.replicas');
  expect(params(page).get('unit')).toBe(seed.prod.unitId);
  await page.getByTestId('fd-close').click();
  await expect(page.getByTestId('fd-details')).toHaveCount(0);
  await expect.poll(() => params(page).get('field')).toBeNull();
  expect(params(page).get('unit')).toBe(seed.prod.unitId);
  expect(await historyLength(page)).toBe(before);
});

test('a deep URL whose field the Unit does not have opens the Unit, no details, no error', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, 'spec.no.such.field'));
  await expect(cardOf(page, 'web').getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('fd-details')).toHaveCount(0);
  await expect(page.getByTestId('fd-error')).toHaveCount(0);
});

/** Stage replicas=6 in prod's web; the row then shows the staged edit. */
async function stageReplicas(page: Page) {
  await cardOf(page, 'web').getByTestId('field-edit-trigger-spec.replicas').click();
  const input = page.getByTestId('field-edit-input');
  await input.fill('6');
  await input.press('Enter');
  await expect(replicasRow(page)).toHaveAttribute('data-change-type', 'edit');
}

const replicasRow = (page: Page) =>
  cardOf(page, 'web').getByTestId('component-leaf-row').filter({ has: page.locator('.dim-path', { hasText: /^replicas$/ }) });

test('(b) with staged changes, a hop to another Space opens a new tab; the edits stay here', async ({ page, context }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  const details = await expectDetails(page, LABEL);
  await stageReplicas(page);
  const hop = details.getByTestId('fd-hop-1'); // staging
  await expect(hop).toHaveAttribute('target', '_blank');
  await expect(hop).toHaveAttribute('rel', /noopener/);
  await hop.hover();
  await expect(page.getByTestId('fd-peek-unit')).toContainText('Opens in a new tab: 1 staged change');
  const before = page.url();
  const [popup] = await Promise.all([context.waitForEvent('page'), hop.click()]);
  await expect.poll(() => new URL(popup.url()).searchParams.get('space'), { timeout: 15_000 }).toBe(seed.staging.spaceId);
  await popup.close();
  expect(page.url()).toBe(before);
  await expect(replicasRow(page)).toHaveAttribute('data-change-type', 'edit');
});

test('(b) with nothing staged, a hop to another Space jumps in place, and Back returns', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  const details = await expectDetails(page, LABEL);
  const hop = details.getByTestId('fd-hop-1');
  await expect(hop).not.toHaveAttribute('target', '_blank');
  await hop.click();
  await expectFocus(page, seed.staging, LABEL);
  await page.goBack();
  await expectFocus(page, seed.prod, LABEL);
  await expectDetails(page, LABEL);
});

test('opening a field in the Incoming view keeps the view (a replace does not switch to All)', async ({ page }) => {
  await page.goto(`/components?app=${encodeURIComponent(seed.component)}&space=${seed.staging.spaceId}`);
  const replicas = page.locator('.dim-path', { hasText: /^replicas$/ }).first();
  await expect(replicas).toBeVisible({ timeout: 30_000 });
  // Incoming shows only what an upgrade changes: not metadata.labels.app.
  await expect(page.locator('.dim-path', { hasText: /^app$/ })).toHaveCount(0);
  await replicas.click();
  await expectDetails(page, 'spec.replicas');
  await expect.poll(() => params(page).get('field')).toBe('spec.replicas');
  await expect(page.locator('.dim-path', { hasText: /^app$/ })).toHaveCount(0);
});

const appUrl = () =>
  `/components?app=${encodeURIComponent(seed.component)}&space=${seed.prod.spaceId}&unit=${seed.prodApp.unitId}&field=metadata.namespace&fres=${encodeURIComponent(encodeFres('apps/v1/Deployment', 'test-ns/app') ?? '')}`;

test('T5: a card a jump opened in the same Space closes on Back; the field it came from is open again', async ({ page }) => {
  await page.goto(appUrl());
  const details = await expectDetails(page, 'metadata.namespace');
  await expect(details.getByTestId('fd-who-link')).toHaveText('Link app-to-ns');
  await expect(cardOf(page, 'ns').getByTestId('component-leaf-row')).toHaveCount(0);
  await details.getByTestId('fd-who-link').click();
  await expect.poll(() => params(page).get('unit'), { timeout: 15_000 }).toBe(seed.prodNs.unitId);
  expect(params(page).get('space')).toBe(seed.prod.spaceId);
  expect(params(page).get('field')).toBe('metadata.name');
  await expectDetails(page, 'metadata.name');
  await expect(cardOf(page, 'ns').getByTestId('component-leaf-row').first()).toBeVisible();

  await page.goBack();
  await expect.poll(() => params(page).get('unit')).toBe(seed.prodApp.unitId);
  await expectDetails(page, 'metadata.namespace');
  await expect(cardOf(page, 'ns').getByTestId('component-leaf-row')).toHaveCount(0);
});

test('(b) a jump inside the same Space keeps the staged edits, even with changes staged', async ({ page }) => {
  await page.goto(appUrl());
  const details = await expectDetails(page, 'metadata.namespace');
  await cardOf(page, 'web').getByTestId('unit-header').click();
  await stageReplicas(page);
  const link = details.getByTestId('fd-who-link');
  await expect(link).not.toHaveAttribute('target', '_blank');
  await link.click();
  await expect.poll(() => params(page).get('unit'), { timeout: 15_000 }).toBe(seed.prodNs.unitId);
  await expect(replicasRow(page)).toHaveAttribute('data-change-type', 'edit');
});

test('Back that changes the Space while changes are staged asks first: Stay keeps them, Leave goes', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  const details = await expectDetails(page, LABEL);
  await details.getByTestId('fd-hop-1').click(); // staging, in place (nothing staged)
  await expectFocus(page, seed.staging, LABEL);
  await expectDetails(page, LABEL);
  // Stage an edit in staging, from the details' Edit.
  await page.getByTestId('fd-details').getByTestId('fd-edit').click();
  const input = page.getByTestId('field-edit-input');
  await input.fill('web2');
  await input.press('Enter');
  const appRow = cardOf(page, 'web').getByTestId('component-leaf-row').filter({ has: page.locator('.dim-path', { hasText: /^app$/ }) }).first();
  await expect(appRow).toHaveAttribute('data-change-type', 'edit');

  await page.goBack();
  const ask = page.getByRole('dialog');
  await expect(ask).toContainText(/Leave \d+ staged changes?\?/);
  await ask.getByRole('button', { name: 'Stay' }).click();
  await expect(ask).toHaveCount(0);
  expect(params(page).get('space')).toBe(seed.staging.spaceId);
  await expect(appRow).toHaveAttribute('data-change-type', 'edit');

  await page.goBack();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await expectFocus(page, seed.prod, LABEL);
});

test('Back inside the same Space is not asked, even with changes staged', async ({ page }) => {
  await page.goto(appUrl());
  const details = await expectDetails(page, 'metadata.namespace');
  await cardOf(page, 'web').getByTestId('unit-header').click();
  await stageReplicas(page);
  await details.getByTestId('fd-who-link').click(); // ns, same Space
  await expect.poll(() => params(page).get('unit'), { timeout: 15_000 }).toBe(seed.prodNs.unitId);
  await page.goBack();
  await expect.poll(() => params(page).get('unit')).toBe(seed.prodApp.unitId);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(replicasRow(page)).toHaveAttribute('data-change-type', 'edit');
});

test('a jump to a field the Incoming view hides shows All and keeps the staged upgrade picks', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  const details = await expectDetails(page, LABEL);
  await details.getByTestId('fd-hop-1').click(); // staging: opens on Incoming, which stages its upgrade
  await expectFocus(page, seed.staging, LABEL);
  await expectDetails(page, LABEL); // shown: the pane went to All
  const replicas = cardOf(page, 'web').getByTestId('component-leaf-row').filter({ has: page.locator('.dim-path', { hasText: /^replicas$/ }) });
  await expect(replicas).toHaveAttribute('data-change-type', 'upgrade');
  await expect(page.getByRole('button', { name: /^Upgrade/ })).toContainText('1');
});

test('a jump to a field the Incoming view shows keeps Incoming', async ({ page }) => {
  await page.goto(`/components?app=${encodeURIComponent(seed.component)}&space=${seed.staging.spaceId}`);
  await expect(page.locator('.dim-path', { hasText: /^replicas$/ }).first()).toBeVisible({ timeout: 30_000 });
  // A link to staging's replicas, as a jump would push it.
  await page.goto(fieldUrl(seed.staging.spaceId, seed.staging.unitId, 'spec.replicas'));
  await expectDetails(page, 'spec.replicas');
  await expect(page.locator('.dim-path', { hasText: /^app$/ })).toHaveCount(0); // still Incoming
});

test('T4b: hand-opened cards survive opening a field in place, a jump and Back', async ({ page }) => {
  await page.goto(`/components?app=${encodeURIComponent(seed.component)}&space=${seed.prod.spaceId}`);
  await cardOf(page, 'web').getByTestId('unit-header').click();
  await cardOf(page, 'api').getByTestId('unit-header').click();
  await expect(cardOf(page, 'api').getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 20_000 });
  // Open a field of web in place (a replace: a new history entry key).
  await cardOf(page, 'web').locator('.dim-path', { hasText: /^app$/ }).first().click();
  const details = await expectDetails(page, LABEL);
  await details.getByTestId('fd-hop-1').click(); // staging
  await expectFocus(page, seed.staging, LABEL);
  await page.goBack();
  await expectFocus(page, seed.prod, LABEL);
  await expect(cardOf(page, 'api').getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 20_000 });
});

test('default upgrade picks are not the person\'s work: the hop stays in place and Back does not ask', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  let details = await expectDetails(page, LABEL);
  await details.getByTestId('fd-hop-1').click(); // staging: Incoming stages its upgrade by itself
  await expectFocus(page, seed.staging, LABEL);
  details = await expectDetails(page, LABEL);
  const replicas = cardOf(page, 'web').getByTestId('component-leaf-row').filter({ has: page.locator('.dim-path', { hasText: /^replicas$/ }) });
  await expect(replicas).toHaveAttribute('data-change-type', 'upgrade'); // the default pick
  await expect(details.getByTestId('fd-hop-0')).not.toHaveAttribute('target', '_blank');
  await page.goBack();
  await expectFocus(page, seed.prod, LABEL);
  await expect(page.getByTestId('fd-leave-staged')).toHaveCount(0);
});

test('a pick the person changes is their work: the hop opens a new tab and Back asks', async ({ page }) => {
  await page.goto(fieldUrl(seed.prod.spaceId, seed.prod.unitId, LABEL));
  let details = await expectDetails(page, LABEL);
  await details.getByTestId('fd-hop-1').click(); // staging
  await expectFocus(page, seed.staging, LABEL);
  details = await expectDetails(page, LABEL);
  const replicas = cardOf(page, 'web').getByTestId('component-leaf-row').filter({ has: page.locator('.dim-path', { hasText: /^replicas$/ }) });
  await expect(replicas).toHaveAttribute('data-change-type', 'upgrade');
  await replicas.locator('.upgrade-pill').click(); // untick the default pick
  await expect(replicas).toHaveAttribute('data-change-type', 'none');
  await expect(details.getByTestId('fd-hop-0')).toHaveAttribute('target', '_blank');
  await page.goBack();
  await expect(page.getByRole('dialog')).toContainText('Leave 1 staged change?');
  await page.getByRole('dialog').getByRole('button', { name: 'Stay' }).click();
  expect(params(page).get('space')).toBe(seed.staging.spaceId);
});
