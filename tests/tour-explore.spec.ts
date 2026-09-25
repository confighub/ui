// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';

// ============================================================================
// The "Explore your component" guided tour (id `explore-and-inspect`,
// chapters 2/3 of the original tutorial content).
//
// `exploreAndInspectSteps` (ui/src/components/tour/tours/chapters/
// exploreAndInspect.tsx) is registered as a real `TourDefinition` — the
// chapter module itself calls `defineTour({ id: 'explore-and-inspect', ...
// })` at module scope, and `tours/index.ts` imports it for that side effect
// alongside the other 4 split tours. So this spec drives it the same way
// `tour.spec.ts` drives chapter 1: through the real `?tour=` query param,
// with no throwaway registration needed.
//
// Builds its own "cubbychat"-shaped base component via direct API calls
// (mirrors the wizard's default 'minimal' granularity: Deployment+Service
// collapse into one unit, ConfigMap into another) instead of re-driving the
// 8-click chapter-1 wizard, and uses a timestamped slug so it can never
// collide with a human's manual "cubbychat" or another agent's parallel run.
// ============================================================================

const TOUR_ID = 'explore-and-inspect';

const DEPLOYMENT_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  labels:
    app: checkout-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: checkout-api
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
        - name: checkout-api
          image: ghcr.io/acme/checkout-api:1.4.2
          ports:
            - containerPort: 8080
`;

const SERVICE_YAML = `apiVersion: v1
kind: Service
metadata:
  name: checkout-api
spec:
  selector:
    app: checkout-api
  ports:
    - port: 80
      targetPort: 8080
`;

const CONFIGMAP_YAML = `apiVersion: v1
kind: ConfigMap
metadata:
  name: checkout-api-config
data:
  LOG_LEVEL: info
  TIMEOUT_MS: "3000"
`;

test.describe('guided tour — explore + inspect chapters', () => {
  test.use({ storageState: 'authentication.json' });

  const appLabel = `tour-explore-${Date.now()}`;
  const baseSlug = `${appLabel}-base`;
  let baseSpaceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);

    const space = await api.createSpace({
      space: { Slug: baseSlug, ComponentID: (await api.createComponent(appLabel)).ComponentID, Labels: { Owner: 'E2E' } },
    });
    const spaceId = (space as unknown as { SpaceID: string }).SpaceID;
    baseSpaceId = spaceId;

    // Mirrors the wizard's default 'minimal' granularity for this exact
    // 3-resource sample: Deployment+Service -> one "main" unit, ConfigMap ->
    // its own unit. See createComponentInput.ts's groupDraftsForDisplay.
    for (const [slug, yaml] of [
      [baseSlug, `${DEPLOYMENT_YAML}\n---\n${SERVICE_YAML}`],
      [`${baseSlug}-configmaps`, CONFIGMAP_YAML],
    ] as const) {
      const unit = await api.createUnit({ spaceId, unit: { Slug: slug, ToolchainType: 'Kubernetes/YAML' } });
      const unitId = (unit as unknown as { UnitID: string }).UnitID;
      await api.uploadUnitData({ spaceId, unitId, body: yaml });

      // Let the resolve processor settle before the UI reads this unit.
      for (let i = 0; i < 100; i++) {
        const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
        if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);
    await api.deleteSpace(baseSpaceId, true).catch(() => {});
    await context.close();
  });

  test('walks base-node selection, configuration view, and one inspected value', async ({ page }) => {
    const url = `/components?app=${encodeURIComponent(appLabel)}&tour=${TOUR_ID}`;

    const tooltip = page.getByTestId('tour-tooltip');
    await page.goto(url);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await expect(tooltip).toBeVisible({ timeout: 10000 });

    // Step 1 — intro + click the click-safe `flow-node-select-target` strip
    // (the same anchor every other chapter uses to select a node), which the
    // step's own copy now names explicitly rather than saying "the base
    // node", in one step (merged from two: the
    // intro used to be a separate Next-only step with nothing to interact
    // with — a round of tightening folded it into this one). Must NOT open a
    // new tab (the known NodeName-link hijack this chapter works around) and
    // must actually select the node (side pane opens).
    await expect(tooltip).toContainText('Your new component');
    await expect(tooltip).toContainText('1 of 4');
    // Anchors on the whole card now (NodeName no longer links out, so a click
    // anywhere on a quiet node's card selects it) — see exploreAndInspect.tsx's
    // header docstring.
    const baseNode = page.locator(
      '[data-testid^="flow-node-"][data-variant="base"]:not([data-testid="flow-node-select-target"])',
    );
    await expect(baseNode).toBeVisible({ timeout: 20000 });
    let newTabOpened = false;
    page.context().on('page', () => {
      newTabOpened = true;
    });
    await baseNode.click();

    // Step 2 — Configuration content is visible without any tab click (no
    // Target => no tab bar), and the tour auto-advanced into this step
    // because the click above satisfied step 1's click-advance.
    await expect(tooltip).toContainText('See its configuration', { timeout: 10000 });
    await expect(tooltip).toContainText('2 of 4');
    expect(newTabOpened).toBe(false);
    // This step's spotlight anchors on the values list as a WHOLE, so the
    // container testid has to exist — it used to anchor on the first
    // `component-leaf-row`, which ringed one arbitrary `apiVersion` row while
    // the copy described the entire view.
    await expect(page.getByTestId('component-values-list')).toBeVisible();
    // The Configuration/Releases tab bar never renders for a target-less base.
    await expect(page.getByTestId('component-pane-tab-config')).toHaveCount(0);
    await tooltip.getByRole('button', { name: 'Next' }).click();

    // Step 3 — units default collapsed (lazy expansion), so a leaf row is
    // not on screen yet. Typing a query that matches a unit's CONTENT (not
    // just its slug) auto-opens that unit (`searchContentMatchedUnitIds` in
    // ComponentSidePane.tsx) — this step's own advance is the image row
    // itself, so it satisfies both this step and sets up the next one.
    await expect(tooltip).toContainText('Search for a value', { timeout: 10000 });
    await expect(tooltip).toContainText('3 of 4');
    await page.getByTestId('component-search').locator('input').fill('image');
    await expect(page.getByTestId('component-leaf-row').first()).toBeVisible();

    // Step 4 — inspect the one concrete, real value (the container image),
    // not a fabricated `confighubplaceholder` (this sample never carries
    // one — see the chapter module's doc comment).
    await expect(tooltip).toContainText('Look at one value', { timeout: 10000 });
    await expect(tooltip).toContainText('4 of 4');
    const imageRow = page.getByTestId('field-edit-trigger-spec.template.spec.containers.0.image');
    await expect(imageRow).toBeVisible();
    await expect(imageRow).toContainText('ghcr.io/acme/checkout-api:1.4.2');

    // Finish: Next on the last step exits the tour (mirrors gettingStartedTour's
    // own "no explicit Done step" ending — TourHost has nothing left to render
    // once stepIndex runs past the last step).
    await tooltip.getByRole('button', { name: 'Next' }).click();
    await expect(tooltip).toHaveCount(0);
  });
});
