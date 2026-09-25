// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Regression coverage for a real bug an adversarial review found: the
// existing tour-promote.spec.ts drives chapter 8's "select all / upgrade"
// section with raw `page.getByTestId(...).click()` calls, bypassing the tour
// engine's own advance/optional-skip logic entirely — it proves the
// underlying feature works, but says nothing about whether the TOUR itself
// gets stuck there. This spec drives the same section through the real
// tooltip (`?tour=change-and-promote`, clicking only what the tooltip
// points at) specifically to prove — or disprove — that the reported freeze
// is real.
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

    // Directly bump the base unit's data — a new revision, exactly what
    // invoking a function on it would produce, without needing the UI. Only
    // one field changes, so dev ends up with exactly one incoming field —
    // the scenario ComponentSidePane's auto-stage-on-open behavior covers,
    // which is precisely why `promote-select-all` is `optional`.
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

    // Steps 1-6 (change the base) do not apply — the base is already
    // changed via the fixture above — so exit and relaunch positioned at
    // dev, which is what a real user who already changed the base and came
    // back would also do. The tour has no mid-run resume-at-step API via
    // URL, so drive to the dev-selection step manually via Next through the
    // steps whose anchors do not depend on invoking anything (`showNext`
    // steps only), and directly perform the one click-driven step (base
    // selection + Functions) that's now moot — instead, simplest: select
    // dev directly and use `stale-select-dev`'s own click, letting the tour
    // catch up from there. Steps before it that require a fresh function
    // invocation are skipped by directly navigating to the flow graph and
    // interacting from `stale-select-dev` onward using the tour's exposed
    // click-through — the earlier steps' clicks are on elements (Functions
    // sidebar) that still exist and are harmless to click through again if
    // reached, but this fixture does not need a second invocation, so this
    // test exercises the tour starting fresh and simply performing what
    // each step already asks, in order, same as any real user.
    const baseNode = page.locator(BASE_NODE_CSS);
    await expect(baseNode).toBeVisible({ timeout: 15000 });
    await baseNode.click();

    // change-open-functions' own advance is `{on: 'click', anchor:
    // invoker-functions-button}` — a document-level click LISTENER, wired up
    // by a `useEffect` that only runs once this step is actually active.
    // `change-select-base`'s own advance is `{on: 'selector', ...}`, a
    // MutationObserver watch that is NOT instant. Clicking Functions before
    // that MutationObserver has fired and the tour has actually moved onto
    // this step races the click against a listener that does not exist
    // yet — the click lands, the panel opens, but nothing was listening to
    // advance the tour, and the step it eventually lands on has already
    // missed its one triggering click for good. Wait for the real
    // step-1-to-2 transition first.
    await expect(tooltip).toContainText('Open Functions', { timeout: 10000 });

    const functionsButton = page.getByTestId('invoker-functions-button');
    await expect(functionsButton).toBeVisible({ timeout: 10000 });
    await functionsButton.click();

    const search = page.getByTestId('invoker-function-search').locator('input');
    await expect(search).toBeVisible({ timeout: 10000 });
    await search.fill('set-replicas');
    // `change-search-function` advances on the `input` event `.fill()` itself
    // dispatches, not on this tooltip's own Next — a user who searches and
    // clicks the result directly, without ever pressing Next, must not stall
    // the tour a step behind. See changeAndPromote.tsx's own comment on this
    // step for the full "couple of steps ahead" failure mode this replaced.
    await expect(tooltip).toContainText('Choose set-replicas', { timeout: 10000 });
    await expect(tooltip).toContainText('4 of 10');

    const functionItem = page.getByTestId('function-item-set-replicas');
    await expect(functionItem).toBeVisible({ timeout: 10000 });
    await functionItem.click();

    const replicasField = page.getByTestId('function-param-replicas').locator('input');
    await expect(replicasField).toBeVisible({ timeout: 10000 });
    // 5, matching the tooltip's own instructed value ("Type 5 in the Replicas
    // field") and `change-close-functions`'s hardcoded "Replicas: 2 → 5"
    // copy below — the `input` advance now waits for that exact value, so a
    // different one here would strand the tour on this step for good.
    await replicasField.fill('5');
    await expect(tooltip).toContainText('Run the function', { timeout: 10000 });
    await expect(tooltip).toContainText('6 of 10');

    const invokeButton = page.getByTestId('invoker-invoke-button');
    await expect(invokeButton).toBeEnabled({ timeout: 5000 });
    await invokeButton.click();

    // A new step added while fixing this exact spec's own finding: leaving
    // Functions open was what stranded `promote-upgrade` later (see
    // `change-close-functions`'s comment in changeAndPromote.tsx).
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

    // `stale-select-dev`'s click on the dev node satisfies its own advance
    // directly into `promote-preview-diff` now — the separate "click
    // Incoming" step this used to land on first (`stale-incoming-filter`)
    // was removed: ComponentSidePane resets to the Incoming filter on its
    // own whenever the newly-selected node has an upgradable unit, which is
    // always true on this path, so there was never a real click left to
    // make there. See changeAndPromoteSteps' `stale-select-dev` comment.
    const devNode = page.locator(DEV_NODE_CSS);
    await expect(devNode).toBeVisible({ timeout: 15000 });
    await devNode.click();
    await expect(tooltip).toContainText('Preview the change', { timeout: 10000 });

    // ── The section under test ──
    // `promote-select-all` used to sit here — an `optional` step that
    // auto-skipped because `component-select-all-button` never renders for a
    // single-incoming-field fixture like this one (ComponentSidePane
    // auto-stages it on open). It was later removed outright rather than
    // left optional (changeAndPromote.tsx's `promote-upgrade` comment): the
    // button's render condition is structurally always false on this path,
    // not just conditionally missing, so there was never a real "skip" to
    // regress on. Clicking Next from "Preview the change" now lands directly
    // on "Upgrade dev" — no polling for a delayed auto-skip needed.
    await tooltip.getByRole('button', { name: 'Next' }).click();
    await expect(tooltip).toContainText('10 of 10', { timeout: 5000 });
    await expect(tooltip).toContainText('Upgrade dev');

    // ── promote-upgrade itself ──
    const upgradeButton = page.getByTestId('component-upgrade-button');
    await expect(upgradeButton).toBeEnabled({ timeout: 10000 });
    await upgradeButton.click();

    // This step's advance watches a one-shot success flash
    // (`component-action-success`), not a durable state — confirm the tour
    // actually reaches its completion screen rather than freezing on "11 of
    // 11" after the flash fades.
    const completion = page.getByTestId('tour-completion');
    await expect(completion).toBeVisible({ timeout: 15000 });
    await expect(completion).toContainText('Change the base & promote');

    await page.getByTestId('tour-completion-dismiss').click();
  });
});
