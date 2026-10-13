// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Drives the guided tour "Change the base & promote" (chapter 8) through its
// real tooltip, clicking only what each step points at, to prove the tour
// engine's own advance logic reaches the completion screen rather than
// freezing at the upgrade step.
// ============================================================================

const BASE_NODE_CSS = '[data-testid="flow-node-select-target"][data-variant="base"]';
const DEV_NODE_CSS = '[data-testid="flow-node-select-target"][data-variant="dev"]';
const TOUR_ID = 'change-and-promote';

const APP_LABEL = `e2e-promote-engine-${RandomSlugGenerator.randomSlugName()}`;

const DEPLOYMENT_YAML = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: checkout-api',
  'spec:',
  '  replicas: 2',
  '  selector:',
  '    matchLabels:',
  '      app: checkout-api',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: checkout-api',
  '    spec:',
  '      containers:',
  '        - name: checkout-api',
  '          image: ghcr.io/acme/checkout-api:1.4.2',
].join('\n');

test.describe('tour engine regression — change-and-promote chapter 8, driven through the real tooltip', () => {
  test.use({ storageState: 'authentication.json' });

  const baseSlug = `e2e-promote-engine-base-${RandomSlugGenerator.randomSlugName()}`;
  const devSlug = `e2e-promote-engine-dev-${RandomSlugGenerator.randomSlugName()}`;
  let baseSpaceId: string;
  let devSpaceId: string;
  let baseUnitId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);

    const baseSpace = await api.createSpace({
      space: { Slug: baseSlug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E' } },
    });
    baseSpaceId = (baseSpace as { SpaceID: string }).SpaceID;

    const baseUnit = await api.createUnit({
      spaceId: baseSpaceId,
      unit: { Slug: 'checkout-api', ToolchainType: 'Kubernetes/YAML' },
    });
    baseUnitId = (baseUnit as unknown as { UnitID: string }).UnitID;
    // Config Data is a subresource of its own now, not a field a unit is
    // created with — see api-helper.ts's uploadUnitData docstring. The clone
    // below copies whatever is live on base, so this has to settle first.
    await api.uploadUnitData({ spaceId: baseSpaceId, unitId: baseUnitId, body: DEPLOYMENT_YAML });
    for (let i = 0; i < 100; i++) {
      const resp = await hubApi.get(`/api/space/${baseSpaceId}/unit/${baseUnitId}`);
      if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const devSpace = await api.createSpace({
      space: {
        Slug: devSlug,
        ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Variant: 'dev' },
        Annotations: { UpstreamSpaceID: baseSpaceId },
      },
    });
    devSpaceId = (devSpace as { SpaceID: string }).SpaceID;

    const cloneResp = await hubApi.post('/api/unit', {
      params: { where: `SpaceID = '${baseSpaceId}'`, where_space: `SpaceID = '${devSpaceId}'` },
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: JSON.stringify({}),
    });
    if (!cloneResp.ok()) {
      throw new Error(`Failed to clone unit into dev: ${cloneResp.status()} ${await cloneResp.text()}`);
    }

    // Bump the base unit's data directly — a new revision, exactly what
    // invoking a function on it would produce. Only one field changes, so dev
    // ends up with exactly one incoming field, which its pane stages on open.
    await api.uploadUnitData({
      spaceId: baseSpaceId,
      unitId: baseUnitId,
      body: DEPLOYMENT_YAML.replace('replicas: 2', 'replicas: 4'),
    });
    for (let i = 0; i < 100; i++) {
      const resp = await hubApi.get(`/api/space/${baseSpaceId}/unit/${baseUnitId}`);
      if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    await api.deleteSpace(devSpaceId, true).catch(() => {});
    await api.deleteSpace(baseSpaceId, true).catch(() => {});
    await context.close();
  });

  test('the tour reaches its completion screen without getting stuck at select-all or upgrade', async ({ page }) => {
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}&tour=${TOUR_ID}`);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});

    const tooltip = page.getByTestId('tour-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 20000 });

    // The fixture has already changed the base once; the tour starts fresh
    // and the test performs what each step asks, in order, as a user would.
    const baseNode = page.locator(BASE_NODE_CSS);
    await expect(baseNode).toBeVisible({ timeout: 15000 });
    await baseNode.click();

    // The next step's click listener only exists once the tour has moved onto
    // it, so wait for the step change before clicking Functions.
    await expect(tooltip).toContainText('Open Functions', { timeout: 10000 });

    const functionsButton = page.getByTestId('invoker-functions-button');
    await expect(functionsButton).toBeVisible({ timeout: 10000 });
    await functionsButton.click();

    const search = page.getByTestId('invoker-function-search').locator('input');
    await expect(search).toBeVisible({ timeout: 10000 });
    await search.fill('set-replicas');
    // This step advances on the search input itself, not on Next.
    await expect(tooltip).toContainText('Choose set-replicas', { timeout: 10000 });
    await expect(tooltip).toContainText('4 of 10');

    const functionItem = page.getByTestId('function-item-set-replicas');
    await expect(functionItem).toBeVisible({ timeout: 10000 });
    await functionItem.click();

    const replicasField = page.getByTestId('function-param-replicas').locator('input');
    await expect(replicasField).toBeVisible({ timeout: 10000 });
    // The step advances only on the value its copy asks for (2 → 5).
    await replicasField.fill('5');
    await expect(tooltip).toContainText('Run the function', { timeout: 10000 });
    await expect(tooltip).toContainText('6 of 10');

    const invokeButton = page.getByTestId('invoker-invoke-button');
    await expect(invokeButton).toBeEnabled({ timeout: 5000 });
    await invokeButton.click();

    // Functions left open would strand the upgrade step later, so the tour
    // asks for it to be closed.
    await expect(tooltip).toContainText('Replicas: 2 → 5', { timeout: 10000 });
    const functionsButtonAgain = page.getByTestId('invoker-functions-button');
    await functionsButtonAgain.click();

    await expect(tooltip).toContainText('Select dev', { timeout: 15000 });

    await page.reload();
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await expect(page.getByText(APP_LABEL)).toBeVisible({ timeout: 20000 });
    await page.getByText(APP_LABEL).click();

    // Selecting dev opens its pane on the Incoming filter, which advances the
    // tour straight to the preview step.
    const devNode = page.locator(DEV_NODE_CSS);
    await expect(devNode).toBeVisible({ timeout: 15000 });
    await devNode.click();
    await expect(tooltip).toContainText('Preview the change', { timeout: 10000 });

    // ── The section under test: preview, then upgrade ──
    await tooltip.getByRole('button', { name: 'Next' }).click();
    await expect(tooltip).toContainText('10 of 10', { timeout: 5000 });
    await expect(tooltip).toContainText('Upgrade dev');

    // ── promote-upgrade itself ──
    const upgradeButton = page.getByTestId('component-upgrade-button');
    await expect(upgradeButton).toBeEnabled({ timeout: 10000 });
    await upgradeButton.click();

    // This step's advance watches a one-shot success flash, not a durable
    // state, so the tour must reach its completion screen after it fades.
    const completion = page.getByTestId('tour-completion');
    await expect(completion).toBeVisible({ timeout: 15000 });
    await expect(completion).toContainText('Change the base & promote');

    await page.getByTestId('tour-completion-dismiss').click();
  });
});
