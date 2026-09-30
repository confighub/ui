import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const cid = '11111111-1111-1111-1111-111111111111';
const sid = '22222222-2222-2222-2222-222222222222';
const components = [
  { Component: { ComponentID: cid, Slug: 'sveltos-demo', OrganizationID: 'org' } },
];
const spaces = [
  {
    Space: {
      SpaceID: sid,
      Slug: 'sveltos-demo-prod',
      OrganizationID: 'org',
      ComponentID: cid,
      Labels: { Stage: 'prod' },
    },
  },
];
const sample = () => readFileSync('public/examples/flux-preview.json');
test('local boot and exploration require no backend or external network', async ({ page }) => {
  const forbidden: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (
      u.origin !== 'http://127.0.0.1:5187' ||
      u.pathname.startsWith('/api/') ||
      u.pathname === '/config.json' ||
      u.pathname.startsWith('/auth/')
    )
      forbidden.push(r.url());
  });
  await page.route('**/*', (r) =>
    new URL(r.request().url()).origin === 'http://127.0.0.1:5187' ? r.continue() : r.abort(),
  );
  await page.goto('/local');
  await expect(page.getByRole('heading', { name: 'Understand your fleet' })).toBeVisible();
  await page
    .getByLabel('Open preview')
    .setInputFiles({ name: 'flux.json', mimeType: 'application/json', buffer: sample() });
  await expect(
    page.getByRole('button', { name: 'Proposed in ConfigHub', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Proposed in ConfigHub', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Proposed in ConfigHub', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Filter resources').fill('no-such-object');
  await expect(page.getByText('No objects match this view.')).toBeVisible();
  expect(forbidden).toEqual([]);
});
test('malformed file clears prior preview and shows a useful error', async ({ page }) => {
  await page.goto('/local');
  await page.getByRole('button', { name: 'Try Flux example' }).click();
  await expect(page.getByLabel('Filter resources')).toBeVisible();
  await page.getByLabel('Open preview').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"apiVersion":"future"}'),
  });
  await expect(page.getByRole('alert')).toContainText('Unsupported');
  await expect(page.getByLabel('Filter resources')).toHaveCount(0);
});
test('connected component uses same explorer and handles denied unit read', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/api/component*', (r) => r.fulfill({ json: components }));
  await page.route('**/api/space?*', (r) => {
    requests.push(r.request().url());
    return r.fulfill({ json: spaces });
  });
  await page.route('**/api/unit?*', (r) =>
    r.fulfill({ status: 403, json: { message: 'denied' } }),
  );
  await page.goto('/tests/fixtures/plugin-ui/harness.html');
  await page.getByLabel('Component', { exact: true }).selectOption(cid);
  await expect(
    page.getByRole('heading', { name: 'Connected configuration', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Units unreadable/)).toBeVisible();
  await expect(page.getByText('Not assessed by this view', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in ConfigHub' })).toHaveAttribute(
    'href',
    `/spaces/${sid}`,
  );
  expect(
    requests.every((u) => new URL(u).searchParams.get('where') === `ComponentID = '${cid}'`),
  ).toBeTruthy();
});
test('failed connected scope does not present an empty fleet', async ({ page }) => {
  await page.route('**/api/component*', (r) => r.fulfill({ json: components }));
  await page.route('**/api/space?*', (r) =>
    r.fulfill({ status: 401, json: { message: 'expired' } }),
  );
  await page.goto('/tests/fixtures/plugin-ui/harness.html');
  await page.getByLabel('Component', { exact: true }).selectOption(cid);
  await expect(page.getByRole('alert')).toContainText('401');
  await expect(page.getByLabel('Resources')).toHaveCount(0);
});
test('local layout works at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/local');
  await page.getByRole('button', { name: 'Try Flux example' }).click();
  await expect(page.getByLabel('Filter resources')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test('Sveltos example shows inputs and complete proposed structure', async ({ page }) => {
  await page.goto('/local');
  await page.getByRole('button', { name: 'Try Sveltos example' }).click();
  await expect(
    page.getByRole('button', { name: 'ClusterProfile demo-policy', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Proposed in ConfigHub', exact: true }).click();
  await expect(page.getByRole('button', { name: /Space .*management/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Unit .*delivery/ })).toBeVisible();
});
