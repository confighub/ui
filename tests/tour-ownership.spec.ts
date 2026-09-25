// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Locator, type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Guided tours "Field ownership" (id `ownership-and-prod`, chapters 9-10)
// and "A prod variant & what's next" (id `prod-and-next`, chapter 11) of the
// original tutorial content — underlying-app E2E coverage. Two independently
// launchable tours (split from one combined tour that had grown to a
// quarter of the whole 5-tour sequence — see ownershipAndProd.tsx's
// docstring), sharing this one file and fixture since chapter 11 still
// needs chapters 9-10's live state (dev's LOG_LEVEL override) to be
// meaningful.
//
// `ownershipAndProdSteps`/`prodAndNextSteps`
// (src/components/tour/tours/chapters/ownershipAndProd.tsx) are each
// registered as a real `TourDefinition` via `defineTour` at module scope,
// imported for that side effect by `tours/index.ts`. The first two tests
// below drive each through its real `?tour=` entry point to prove the
// registration and "take the earlier tour first" hints actually reach the
// UI; they run before the fixture is mutated by the later, order-sensitive
// tests. The rest of this spec drives the exact same real affordances every
// step anchors on: field-edit-input, the Functions invoker, and the
// composer. If any of these selectors ever stop matching, this spec fails
// right alongside the tour.
//
// Fixture: a base ConfigMap unit + a dev unit cloned from it via
// upstream_space_id/upstream_unit_id (the same mechanism
// component-staging-narrow.spec.ts uses for an upgradable pair) — NEITHER
// space gets a Target, matching the tour's "never attach a target" rule.
// ============================================================================

const TOUR_ID = 'ownership-and-prod';
const PROD_TOUR_ID = 'prod-and-next';

const APP_LABEL = `e2e-tour-own-${RandomSlugGenerator.randomSlugName()}`;
const CONFIG_UNIT_SLUG = 'checkout-api-config';

function configMapYaml(logLevel: string, timeoutMs: string): string {
  return [
    'apiVersion: v1',
    'kind: ConfigMap',
    'metadata:',
    `  name: ${CONFIG_UNIT_SLUG}`,
    'data:',
    `  LOG_LEVEL: ${logLevel}`,
    `  TIMEOUT_MS: "${timeoutMs}"`,
    '',
  ].join('\n');
}

async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  // getByTestId, not getByText: the base Space's slug is `${appLabel}-base`,
  // which contains appLabel as a substring and makes a plain text lookup
  // ambiguous once the flow graph itself has rendered.
  const treeItem = page.getByTestId(`app-tree-item-${appLabel}`);
  await expect(treeItem).toBeVisible({ timeout: 20000 });
  await treeItem.click();
}

/**
 * Selects a flow-graph node by clicking it, waiting first for its bounding
 * box to stop moving (see the poll below) — the callers below pass the
 * `flow-node-select-target` strip, the dedicated always-present element for
 * this, so no positioning trick is needed beyond that stability wait.
 */
async function selectNode(node: Locator): Promise<void> {
  const page = node.page();
  // The canvas re-fits (and a node's own "N behind" badge can grow/shrink)
  // for a few frames after an upgrade/invoke settles, which can shift this
  // card under whatever else is mid-transition and intercept the click
  // below. Poll for the box to stop moving before clicking it, rather than
  // guessing a fixed settle delay.
  let box = await node.boundingBox();
  for (let i = 0; i < 20; i++) {
    if (!box) break;
    await page.waitForTimeout(100);
    const next = await node.boundingBox();
    if (next && box.x === next.x && box.y === next.y && box.width === next.width && box.height === next.height) {
      box = next;
      break;
    }
    box = next;
  }
  if (!box) throw new Error('selectNode: node has no bounding box');
  await node.click({ position: { x: box.width / 2, y: box.height * 0.85 } });
}

/** See variant-composer.spec.ts's identically-named helper for the full rationale. */
async function openComposerViaKeyboard(page: Page, node: Locator): Promise<void> {
  const attempt = async () => {
    try {
      await node.hover({ timeout: 2000 });
    } catch {
      await node.dispatchEvent('mouseover');
    }
    await page.waitForTimeout(150);
    await page.keyboard.press('v');
  };
  await attempt();
  const anyComposer = page.locator('.react-flow__node[data-id^="__variant-composer__"]');
  if (!(await anyComposer.first().isVisible({ timeout: 2000 }).catch(() => false))) {
    await attempt();
  }
}

// Config Data is a subresource of its own now (GET/PUT
// /api/space/{spaceId}/unit/{unitId}/data — see api-helper.ts's
// uploadUnitData docstring), not a field on the Unit body: `GET
// .../unit/{unitId}` never carries Data at all any more, so reading it there
// silently returns "".
async function decodeUnitData(page: Page, spaceId: string, unitId: string): Promise<string> {
  const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/data`);
  if (!resp.ok()) throw new Error(`get unit data: ${resp.status()} ${await resp.text()}`);
  return resp.text();
}

test.describe('guided tours chapters 9-11: field ownership, then a prod variant', () => {
  test.use({ storageState: 'authentication.json' });
  test.describe.configure({ mode: 'serial' });

  let baseSpaceId: string;
  let devSpaceId: string;
  let baseUnitId: string;
  let devUnitId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);

    // Base — no Variant label, no Target (root of the DAG).
    const baseSpace = await api.createSpace({
      space: { Slug: `${APP_LABEL}-base`, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E' } },
    });
    baseSpaceId = (baseSpace as { SpaceID: string }).SpaceID;

    const baseUnit = await api.createUnit({
      spaceId: baseSpaceId,
      unit: { Slug: CONFIG_UNIT_SLUG, ToolchainType: 'Kubernetes/YAML' },
    });
    baseUnitId = baseUnit.UnitID as string;

    await api.uploadUnitData({
      spaceId: baseSpaceId,
      unitId: baseUnitId,
      body: configMapYaml('info', '3000'),
    });

    // Dev — Variant label 'dev' (so DeploymentFlowNode's displayName, and
    // this chapter's [data-variant="dev"] anchor, read exactly 'dev'), no
    // Target.
    const devSpace = await api.createSpace({
      space: { Slug: `${APP_LABEL}-dev`, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Variant: 'dev' } },
    });
    devSpaceId = (devSpace as { SpaceID: string }).SpaceID;

    // Clone base's unit CONTENT into dev via the same bulkCreateUnits call
    // the real composer uses (useCreateVariantMutation.ts) — a single-unit
    // POST with upstream_space_id/upstream_unit_id only wires the upstream
    // Link, it does not copy Data, which left the dev unit empty.
    const cloneResp = await hubApi.post('/api/unit', {
      params: { where: `SpaceID='${baseSpaceId}'`, where_space: `SpaceID='${devSpaceId}'` },
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: JSON.stringify({}),
    });
    if (!cloneResp.ok()) throw new Error(`clone unit into dev: ${cloneResp.status()} ${await cloneResp.text()}`);
    const clonedUnits = (await cloneResp.json()) as Array<{ Unit?: { UnitID?: string } }>;
    const clonedUnitId = clonedUnits[0]?.Unit?.UnitID;
    if (!clonedUnitId) throw new Error(`clone unit into dev: no UnitID in response ${JSON.stringify(clonedUnits)}`);
    devUnitId = clonedUnitId;

    // Let the resolve processor settle both units before driving the UI.
    for (const [spaceId, unitId] of [[baseSpaceId, baseUnitId], [devSpaceId, devUnitId]] as const) {
      for (let i = 0; i < 100; i++) {
        const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
        if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
        await new Promise((r) => setTimeout(r, 100));
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
    try { await api.deleteSpace(devSpaceId, true); } catch { /* ignore */ }
    try { await api.deleteSpace(baseSpaceId, true); } catch { /* ignore */ }
    await context.close();
  });

  test('launches via ?tour=ownership-and-prod with its own title, step count, and "take the earlier tour" hint', async ({ page }) => {
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}&tour=${TOUR_ID}`);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});

    const tooltip = page.getByTestId('tour-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 20000 });
    await expect(tooltip).toContainText('1 of 22');
    await expect(tooltip).toContainText('Back to dev');
    // The hint that a user landing here out of order should take the
    // earlier tour first.
    await expect(tooltip).toContainText('Change the base & promote');

    await tooltip.getByRole('button', { name: 'Exit' }).click();
    await expect(tooltip).toHaveCount(0);
  });

  test('launches via ?tour=prod-and-next with its own title, step count, and "take the earlier tour" hint', async ({ page }) => {
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}&tour=${PROD_TOUR_ID}`);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});

    const tooltip = page.getByTestId('tour-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 20000 });
    await expect(tooltip).toContainText('1 of 5');
    await expect(tooltip).toContainText('Make a production variant');
    // The hint that a user landing here out of order should take the
    // earlier tour first.
    await expect(tooltip).toContainText('Field ownership');

    await tooltip.getByRole('button', { name: 'Exit' }).click();
    await expect(tooltip).toHaveCount(0);
  });

  test('chapter 9 — an inline edit on dev is staged, then committed as an override', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const devNode = page.locator('[data-testid="flow-node-select-target"][data-variant="dev"]');
    await expect(devNode).toBeVisible({ timeout: 10000 });
    await selectNode(devNode);

    const trigger = page.getByTestId('field-edit-trigger-data.LOG_LEVEL');
    await expect(trigger).toBeVisible({ timeout: 10000 });
    await trigger.click();

    const input = page.getByTestId('field-edit-input');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('debug');
    await input.press('Enter');

    // Staged, not yet written — data-change-type reflects the pending edit.
    const row = page.getByTestId('component-leaf-row').filter({ hasText: 'LOG_LEVEL' });
    await expect(row).toHaveAttribute('data-change-type', 'edit', { timeout: 5000 });

    // Protection is opt-in now — a staged edit alone is override-blind on
    // the next upgrade. This is the footer's one-click "keep everything
    // currently staged-but-unkept" action (barKeepState kind 'editsUnkept'
    // in ComponentSidePane.tsx); with exactly one staged edit it reads
    // "Keep 1 on merge". It only stages the protection — the commit click
    // below is what actually writes it, together with the edit.
    const keepButton = page.getByTestId('component-keep-staged-edits-button');
    await expect(keepButton).toBeVisible({ timeout: 5000 });
    await keepButton.click();

    const upgradeButton = page.getByTestId('component-upgrade-button');
    await expect(upgradeButton).toBeEnabled({ timeout: 5000 });
    await upgradeButton.click();

    // Commit round-trips through the server — poll until it lands.
    await expect(async () => {
      const data = await decodeUnitData(page, devSpaceId, devUnitId);
      expect(data).toContain('LOG_LEVEL: debug');
    }).toPass({ timeout: 15000 });
  });

  test('chapter 10 — two base changes promote; dev keeps its own override', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const baseNode = page.locator('[data-testid="flow-node-select-target"][data-variant="base"]');
    await expect(baseNode).toBeVisible({ timeout: 10000 });
    await selectNode(baseNode);
    await expect(page.getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 10000 });

    await page.getByTestId('invoker-functions-button').click();

    const invokeSetStringPath = async (path: string, value: string) => {
      await page.getByTestId('invoker-function-search').locator('input').fill('set-string-path');
      // .first(): once set-string-path has been invoked once this session it
      // also appears under "Recent" (localStorage-backed, so it persists
      // across runs sharing authentication.json's storage state), duplicating
      // the testid. Either instance selects the same function.
      const item = page.getByTestId('function-item-set-string-path').first();
      await expect(item).toBeVisible({ timeout: 10000 });
      await item.click();

      await page.getByTestId('function-param-resource-type').locator('input').fill('v1/ConfigMap');
      await page.getByTestId('function-param-path').locator('input').fill(path);
      await page.getByTestId('function-param-attribute-value').locator('input').fill(value);

      const invokeButton = page.getByTestId('invoker-invoke-button');
      await expect(invokeButton).toBeEnabled({ timeout: 5000 });
      await invokeButton.click();
      await expect(page.getByText('Invoking...')).toHaveCount(0, { timeout: 15000 });
    };

    // Same field dev overrode in chapter 9 — proves the override sticks.
    await invokeSetStringPath('data.LOG_LEVEL', 'warn');
    await page.locator('button[aria-label="back"]').click();
    // A field dev never touched — proves it still flows through normally.
    await invokeSetStringPath('data.TIMEOUT_MS', '5000');

    await expect(async () => {
      const data = await decodeUnitData(page, baseSpaceId, baseUnitId);
      expect(data).toContain('LOG_LEVEL: warn');
      expect(data).toContain('TIMEOUT_MS: "5000"');
    }).toPass({ timeout: 15000 });

    // Close the Functions panel first: left open, it and the still-open base
    // config pane squeeze the canvas from BOTH sides, and dev's card can end
    // up geometrically underneath one of their (still-mounted, transitioning)
    // containers — an intercepted-pointer-events click that retries for the
    // full test timeout without ever landing.
    await page.getByTestId('invoker-functions-button').click();
    const devNode = page.locator('[data-testid="flow-node-select-target"][data-variant="dev"]');
    await expect(devNode).toBeVisible({ timeout: 10000 });
    await selectNode(devNode);

    await page.getByTestId('component-filter-incoming').click();
    const selectAll = page.getByTestId('component-select-all-button');
    if (await selectAll.isVisible({ timeout: 3000 }).catch(() => false)) {
      await selectAll.click();
    }

    const upgradeButton = page.getByTestId('component-upgrade-button');
    await expect(upgradeButton).toBeEnabled({ timeout: 5000 });
    await upgradeButton.click();

    // The payoff: TIMEOUT_MS flows through from base; LOG_LEVEL stays dev's
    // own 'debug' — base's 'warn' never overwrites an owned field.
    await expect(async () => {
      const data = await decodeUnitData(page, devSpaceId, devUnitId);
      expect(data).toContain('TIMEOUT_MS: "5000"');
      expect(data).toContain('LOG_LEVEL: debug');
    }).toPass({ timeout: 15000 });
  });

  test('chapter 11 — a prod variant off dev, with No target', async ({ page }) => {
    const api = new ApiHelper(page);
    await navigateAndSelectApp(page, APP_LABEL);

    // Prod is made from dev now, not base (deliberate change — see
    // ownershipAndProd.tsx's `prod-open-composer` comment: promoting what's
    // running in dev straight to prod is the usual next step). Scoped to the
    // card itself: `flow-node-select-target` (the always-present strip added
    // so a click-to-select is safe) carries the same `data-variant` value for
    // its own lookup, so a bare `[data-variant=...]` now matches both the
    // card and the strip.
    const devNode = page.locator('[data-variant="dev"]:not([data-testid="flow-node-select-target"])');
    await expect(devNode).toBeVisible({ timeout: 10000 });

    await openComposerViaKeyboard(page, devNode);
    const composer = page.locator(`.react-flow__node[data-id="__variant-composer__:${devSpaceId}"]`);
    await expect(composer).toBeVisible({ timeout: 5000 });

    await composer.getByTestId('composer-variant-name-input').locator('input').fill('prod');
    // Deliberately do not touch composer-target-select — its default value
    // is '' (the "No target" MenuItem), matching the tour's copy.
    await composer.getByTestId('composer-submit-button').click();

    await expect(composer).toBeHidden({ timeout: 15000 });
    const prodNode = page.locator('[data-variant="prod"]:not([data-testid="flow-node-select-target"])');
    await expect(prodNode).toBeVisible({ timeout: 15000 });

    const prodSpaceId = await page.locator('.react-flow__node').filter({ has: prodNode }).getAttribute('data-id');
    expect(prodSpaceId).toBeTruthy();
    if (prodSpaceId) {
      const created = await api.getSpaceById(prodSpaceId);
      expect(created.Labels?.Variant).toBe('prod');
      // Upstream is dev, not base — prod clones dev's live state (including
      // dev's LOG_LEVEL override from chapters 9-10).
      expect(created.Annotations?.UpstreamSpaceID).toBe(devSpaceId);

      const prodUnits = await api.listUnits({ where: `SpaceID = '${prodSpaceId}'` });
      for (const u of prodUnits) {
        expect((u.Unit as { TargetID?: string }).TargetID ?? null).toBeNull();
      }
      await api.deleteSpace(prodSpaceId, true);
    }

    // ── release-explain-gap's whole premise (relocated here from
    // deployAndRelease.tsx — see that file's docstring): this Space has no
    // release target, so the Releases tab never renders. A guard against
    // the copy going stale if that ever becomes reachable through the UI. ──
    const baseSelectTarget = page.locator('[data-testid="flow-node-select-target"][data-variant="base"]');
    await expect(baseSelectTarget).toBeVisible({ timeout: 10000 });
    await baseSelectTarget.click();
    await expect(page.getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('component-pane-tab-releases')).toHaveCount(0);
  });
});
