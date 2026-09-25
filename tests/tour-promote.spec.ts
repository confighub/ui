// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The card's own NodeContainer (`data-variant`), excluding only the
 * `flow-node-select-target` strip (that attribute also matches the
 * composer-open handle). NodeName no longer links out, so a click anywhere
 * else on a quiet node's card bubbles normally and selects it. See
 * changeAndPromote.tsx's BASE_NODE_CSS/DEV_NODE_CSS, which this spec's
 * assertions below are kept byte-identical to.
 */
const BASE_NODE_CSS = '[data-testid^="flow-node-"][data-variant="base"]:not([data-testid="flow-node-select-target"])';
const DEV_NODE_CSS = '[data-testid^="flow-node-"][data-variant="dev"]:not([data-testid="flow-node-select-target"])';

// ============================================================================
// Guided tour "Change the base & promote" (id `change-and-promote`,
// chapters 6-8 of the original tutorial content) — anchor verification.
//
// changeAndPromoteSteps (src/components/tour/tours/chapters/changeAndPromote.tsx)
// is registered as a real `TourDefinition` via `defineTour` at module scope,
// imported for that side effect by `tours/index.ts`. The first test below
// drives it through the real `?tour=change-and-promote` entry point to prove
// the registration and its "take the earlier tour first" hint actually reach
// the UI. The rest of this spec drives the REAL feature end-to-end through
// the exact same `data-testid`/`data-variant` selectors the exported steps
// reference, in the same order the chapter narrates, and then cross-checks
// those literal selector strings against the exported array — so a future
// edit that lets the chapter file drift from a real anchor fails this spec.
// ============================================================================

const TOUR_ID = 'change-and-promote';

const APP_LABEL = `e2e-promote-${RandomSlugGenerator.randomSlugName()}`;

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

test.describe('guided tour chapters 6-8 — change, stale, promote', () => {
  test.use({ storageState: 'authentication.json' });

  const baseSlug = `e2e-promote-base-${RandomSlugGenerator.randomSlugName()}`;
  const devSlug = `e2e-promote-dev-${RandomSlugGenerator.randomSlugName()}`;
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
    // created with — see api-helper.ts's uploadUnitData docstring.
    await api.uploadUnitData({ spaceId: baseSpaceId, unitId: baseUnitId, body: DEPLOYMENT_YAML });
    for (let i = 0; i < 100; i++) {
      const resp = await hubApi.get(`/api/space/${baseSpaceId}/unit/${baseUnitId}`);
      if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // The dev variant — `Labels.Variant: 'dev'` is what DeploymentFlowNode's
    // `data-variant` attribute (and displayName) resolves to; `Annotations.
    // UpstreamSpaceID` mirrors what the real variant composer stamps (used
    // for display only — buildComponentData derives the graph edge from
    // Unit.UpstreamUnitID, set below by the bulk clone, not from this).
    const devSpace = await api.createSpace({
      space: {
        Slug: devSlug,
        ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Variant: 'dev' },
        Annotations: { UpstreamSpaceID: baseSpaceId },
      },
    });
    devSpaceId = (devSpace as { SpaceID: string }).SpaceID;

    // Clone the base unit into dev via the same bulk-clone endpoint the real
    // variant composer uses (useCreateVariantMutation.ts Step 2) — this is
    // what sets Unit.UpstreamUnitID/UpstreamRevisionNum server-side, so dev
    // starts perfectly in sync with base (no incoming diff yet).
    const cloneResp = await hubApi.post('/api/unit', {
      params: {
        where: `SpaceID = '${baseSpaceId}'`,
        where_space: `SpaceID = '${devSpaceId}'`,
      },
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: JSON.stringify({}),
    });
    if (!cloneResp.ok()) {
      throw new Error(`Failed to clone unit into dev: ${cloneResp.status()} ${await cloneResp.text()}`);
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

  test('launches via ?tour=change-and-promote with its own title, step count, and "take the earlier tour" hint', async ({ page }) => {
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}&tour=${TOUR_ID}`);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});

    const tooltip = page.getByTestId('tour-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 20000 });
    await expect(tooltip).toContainText('1 of 10');
    await expect(tooltip).toContainText('Select the base');
    // The hint that a user landing here out of order should take the
    // earlier tour first.
    await expect(tooltip).toContainText('Deploy to dev');

    await tooltip.getByRole('button', { name: 'Exit' }).click();
    await expect(tooltip).toHaveCount(0);
  });

  test('the exported step anchors literally match the selectors this spec drives', () => {
    // changeAndPromote.tsx imports @mui/material components (via TourCue),
    // and @mui/material's package exports are ESM directory imports Node's
    // module loader refuses to resolve outside a bundler — so this spec
    // cannot `import()` the chapter module directly (confirmed live: Node
    // throws `Directory import '.../@mui/material/Box' is not supported`).
    // Reading the source as text and asserting the literal selector strings
    // are present is a weaker check than a real module import, but it still
    // catches the failure mode that matters here: a chapter edit that lets
    // an anchor string drift from the real, live-verified selectors this
    // spec drives below.
    const source = readFileSync(
      path.join(__dirname, '../src/components/tour/tours/chapters/changeAndPromote.tsx'),
      'utf-8',
    );
    // component-filter-incoming and component-select-all-button used to be
    // here too (stale-incoming-filter / promote-select-all's own anchors),
    // removed along with those steps: ComponentSidePane now resets to the
    // Incoming filter and auto-stages every field on its own, so neither
    // click ever had anything left to do — see changeAndPromoteSteps'
    // `stale-select-dev` and `promote-upgrade` comments. Both testids are
    // still exercised directly by the raw-UI test below, independent of
    // whatever the tour's own step anchors are.
    const mustContain = [
      `const BASE_NODE_CSS = '${BASE_NODE_CSS}'`,
      `const DEV_NODE_CSS = '${DEV_NODE_CSS}'`,
      "'[data-testid=\"invoker-functions-button\"]'",
      "'[data-testid=\"invoker-function-search\"]'",
      '`[data-testid="function-item-${FUNCTION_NAME}"]`',
      "'[data-testid=\"function-param-replicas\"]'",
      "'[data-testid=\"invoker-invoke-button\"]'",
      "'[data-testid=\"component-leaf-row\"][data-change-type=\"upgrade\"]'",
      "'[data-testid=\"component-upgrade-button\"]'",
      "'[data-testid=\"component-action-success\"]'",
      "const FUNCTION_NAME = 'set-replicas'",
    ];
    for (const needle of mustContain) {
      expect(source, `expected changeAndPromote.tsx to contain: ${needle}`).toContain(needle);
    }
  });

  test('base function invoke -> dev goes stale/incoming -> preview diff -> select all -> upgrade clears it', async ({
    page,
  }) => {
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}`);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await expect(page.getByText(APP_LABEL)).toBeVisible({ timeout: 20000 });
    await page.getByText(APP_LABEL).click();

    // ── Chapter 6: select the base, invoke set-replicas ──
    const baseNode = page.locator(BASE_NODE_CSS);
    await expect(baseNode).toBeVisible({ timeout: 15000 });
    await baseNode.click({ position: { x: 5, y: 5 } });

    // Selecting base opens the side pane, which SHRINKS the flow canvas. The
    // graph must re-fit into the smaller canvas, or sibling nodes end up laid
    // out underneath the pane — visible to the DOM but unreachable, because
    // the pane intercepts the clicks. The guided tour hits exactly this when
    // it moves from base to dev with the pane still open, and it stranded a
    // real walkthrough at 'Select dev'.
    //
    // This was previously masked: `.react-flow` used to be programmatically
    // scrollable, so a stray scrollIntoView dragged dev back into view. Once
    // that wrapper was correctly made unscrollable the missing re-fit was
    // exposed, and ComponentFlowGraph grew a ResizeObserver that re-fits on
    // container resize.
    //
    // Asserted as GEOMETRY, not clickability: `toBeVisible()` and even a
    // successful `.click()` both pass for a node sitting under the pane, so
    // neither would catch a regression here.
    // Polled, not read once: the re-fit deliberately waits for the pane's
    // resize to settle (3 stable frames) and then animates the viewport over
    // ~200ms, so the geometry is legitimately still wrong for a few frames
    // after the click. Polling asserts it CONVERGES; without the re-fit it
    // never does and this times out.
    await expect
      .poll(
        async () => {
          const canvas = await page.locator('.react-flow').boundingBox();
          const dev = await page.locator(DEV_NODE_CSS).boundingBox();
          if (!canvas || !dev) return null;
          // How far the node pokes out past either edge of the canvas; <= 0
          // means fully inside.
          return Math.max(canvas.x - dev.x, dev.x + dev.width - (canvas.x + canvas.width));
        },
        {
          timeout: 10000,
          message:
            'dev node must sit inside the flow canvas once the side pane shrinks it (graph re-fits on container resize)',
        },
      )
      .toBeLessThanOrEqual(0);

    const functionsButton = page.getByTestId('invoker-functions-button');
    await expect(functionsButton).toBeVisible({ timeout: 10000 });
    await functionsButton.click();

    const search = page.getByTestId('invoker-function-search').locator('input');
    await expect(search).toBeVisible({ timeout: 10000 });
    await search.fill('set-replicas');

    const functionItem = page.getByTestId('function-item-set-replicas');
    await expect(functionItem).toBeVisible({ timeout: 10000 });
    await functionItem.click();

    const replicasField = page.getByTestId('function-param-replicas').locator('input');
    await expect(replicasField).toBeVisible({ timeout: 10000 });
    await replicasField.fill('5');

    const invokeButton = page.getByTestId('invoker-invoke-button');
    await expect(invokeButton).toBeEnabled({ timeout: 5000 });
    await invokeButton.click();

    // Real confirmation the mutation landed: poll the base unit via API for
    // its HeadRevisionNum to increment, rather than trusting a transient UI
    // banner — this is also what the dev deployment's Incoming state below
    // is derived from (buildComponentData compares UpstreamRevisionNum
    // against the upstream unit's live HeadRevisionNum).
    //
    // Space-scoped route (`/api/space/{spaceId}/unit/{unitId}`, matching
    // component-release.spec.ts's own polling helper), NOT ApiHelper's
    // `getUnitById` — that calls the bare `/api/unit/{unitId}` collection
    // route, which 404s for a real, existing unit (confirmed live against
    // this fixture's own unit and against an unrelated pre-existing one);
    // that helper looks to be dead/broken, not something this spec's scope
    // covers fixing.
    // `select=` changes the response shape to `{ Unit: {...} }` (unlike the
    // unscoped GET other specs use, which returns the entity flat) — and the
    // unscoped GET's full payload includes MutationSources, whose embedded
    // YAML `Value` strings this backend serializes with raw, un-escaped
    // newlines instead of `\n` — invalid JSON that `resp.json()` (V8's
    // strict JSON.parse, confirmed live in Node) throws on. `select=` avoids
    // that payload entirely; unwrapping defensively covers either shape.
    let baseHeadRevisionNum = 1;
    for (let i = 0; i < 100; i++) {
      const resp = await hubApi.get(`/api/space/${baseSpaceId}/unit/${baseUnitId}`, {
        params: { select: 'HeadRevisionNum' },
      });
      if (resp.ok()) {
        const body = (await resp.json()) as { Unit?: { HeadRevisionNum?: number }; HeadRevisionNum?: number };
        const head = body.Unit?.HeadRevisionNum ?? body.HeadRevisionNum ?? 1;
        if (head > 1) {
          baseHeadRevisionNum = head;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(baseHeadRevisionNum).toBeGreaterThan(1);

    // ── Chapter 7: select dev, look at Incoming ──
    // The flow graph's own unit list is not tagged for invalidation by the
    // invoke-function mutation (RTK Query only invalidates the 'Function'
    // tag there), so a reload is needed to pick up the base's new revision —
    // the same requirement any other out-of-band change (e.g. a `cub`-driven
    // edit) already has on this view. Reported separately; not fixed here
    // (pure-instrumentation scope).
    await page.reload();
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await expect(page.getByText(APP_LABEL)).toBeVisible({ timeout: 20000 });
    await page.getByText(APP_LABEL).click();

    const devNode = page.locator(DEV_NODE_CSS);
    await expect(devNode).toBeVisible({ timeout: 15000 });
    await devNode.click({ position: { x: 5, y: 5 } });

    const incomingFilter = page.getByTestId('component-filter-incoming');
    await expect(incomingFilter).toBeVisible({ timeout: 10000 });
    await incomingFilter.click();
    await expect(incomingFilter).toHaveAttribute('aria-pressed', 'true');

    // ── Chapter 8: preview the diff, select all, upgrade ──
    const leafRow = page.getByTestId('component-leaf-row').and(page.locator('[data-change-type="upgrade"]'));
    await expect(leafRow.first()).toBeVisible({ timeout: 15000 });

    // Select all is conditional, and the chapter step anchoring it is marked
    // `optional` for exactly this reason: ComponentSidePane auto-stages every
    // incoming field the moment a node opens already on the Incoming filter
    // (its one-shot `didInitialStageAllRef` effect), which is precisely dev's
    // state here — confirmed live, with this fixture's single incoming
    // field, Select all never rendered at all. Click it only if staging is
    // genuinely incomplete.
    const selectAllButton = page.getByTestId('component-select-all-button');
    if (await selectAllButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await selectAllButton.click();
    }

    const upgradeButton = page.getByTestId('component-upgrade-button');
    await expect(upgradeButton).toBeEnabled({ timeout: 10000 });
    await upgradeButton.click();

    await expect(page.getByTestId('component-action-success')).toBeVisible({ timeout: 20000 });

    // The changed row left the Incoming set — real confirmation the upgrade
    // actually committed, not just that a success banner rendered. The
    // `replicas` field itself still exists (now synced), so this checks the
    // purple upgrade-typed row specifically, not the field's mere presence.
    await expect(leafRow).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByTestId('component-filter-incoming')).toContainText('0', { timeout: 10000 });
  });
});
