// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Components page's left-nav grouping (same system as the Unit list's
// `GroupNavPanel`) plus the ViewTabs saved-views strip (grouping only — no
// filter row on this page), namespaced away from the Unit list via
// `viewKind: 'components'`. See `ui/docs/dev/components.md` ("Navigation
// tree: node click opens a graph") for the terms this spec exercises: node
// graph, Component graph, and the `?app=` vs `?group=` rule.
import { type Page } from '@playwright/test';
import { test, expect, hubApi, newAuthorizedContext } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const RUN = RandomSlugGenerator.randomSlugName();
const OWNER_A = `e2e-nav-owner-a-${RUN}`;
const OWNER_B = `e2e-nav-owner-b-${RUN}`;
const COMPONENT_CHECKOUT = `e2e-nav-checkout-${RUN}`;
const COMPONENT_BILLING = `e2e-nav-billing-${RUN}`;
const COMPONENT_SEARCH = `e2e-nav-search-${RUN}`;
const COMPONENT_ORPHAN = `e2e-nav-orphan-${RUN}`;
// One Component whose two Spaces have DIFFERENT Owners, so it shows under two
// Owner nodes. Its own Owners, so no other test's Owner counts change.
const OWNER_SPLIT_1 = `e2e-nav-owner-split1-${RUN}`;
const OWNER_SPLIT_2 = `e2e-nav-owner-split2-${RUN}`;
const COMPONENT_SPLIT = `e2e-nav-split-${RUN}`;

async function waitForTreeLoaded(page: Page) {
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await page.waitForSelector('[role="tree"]', { timeout: 20000 });
}

/**
 * Opens the field picker and adds a field under the "Labels" submenu
 * (hover-triggered). The submenu's rows carry a trailing count/"IN USE"
 * badge (e.g. "Variant 45"), so the item locator is a substring match, not
 * `exact: true`. Hovers the item itself (not just the "Labels" trigger)
 * before clicking: the submenu is a separate Popper that closes on a 150ms
 * grace timer when the mouse leaves the trigger, and jumping straight from
 * the trigger to a click on `item` can race that timer closed.
 */
async function addLabelGroupingLevel(page: Page, labelKey: string, expectedUrlPattern: RegExp) {
  await page.getByRole('button', { name: 'Add grouping level' }).click();
  const labelsTrigger = page.getByRole('menuitem', { name: 'Labels', exact: true });
  await labelsTrigger.waitFor({ state: 'visible', timeout: 5000 });
  await labelsTrigger.hover();
  const item = page.getByRole('menuitem', { name: labelKey });
  await item.waitFor({ state: 'visible', timeout: 5000 });
  await item.hover();
  await item.click();
  await expect(page).toHaveURL(expectedUrlPattern, { timeout: 5000 });
}

/**
 * Clicks a tree node by its label text. A `role=treeitem` locator is
 * unreliable here: the browser's accessible-name-from-content computation
 * includes NESTED descendant treeitems' text too, so a parent with children
 * can match its own child's name, and `.click()` on the resulting (large)
 * element can land on a child row instead of the parent's own header. The
 * label `Typography` is a leaf node with no nested treeitems, so clicking
 * its own text is unambiguous — the same pattern `component-deeplink.spec.ts`
 * uses for tree clicks.
 *
 * Scoped to `[role="tree"]`: a node click can leave a graph open alongside
 * the nav tree, and a Deployment node in that graph can carry the SAME text
 * (e.g. a Variant value like "prod") — an unscoped page-wide `getByText`
 * can resolve to that graph node instead of the tree row.
 */
async function clickTreeNode(page: Page, label: string) {
  await page.locator('[role="tree"]').getByText(label, { exact: false }).first().click();
}

/**
 * Expands a tree node's children via its chevron (icon container), without
 * opening its graph. Auto-expansion only ever covers the top-level nodes
 * (plus ancestors of whatever was selected when the tree FIRST populated) —
 * it never re-fires on a later selection change, so a deeper node reached
 * by a click after mount needs its own ancestor expanded first.
 */
async function expandTreeNode(page: Page, label: string) {
  const row = page.locator('[role="tree"]').getByText(label, { exact: false }).first();
  const rowContent = row.locator('xpath=ancestor::div[contains(@class, "MuiTreeItem-content")][1]');
  await rowContent.locator('.MuiTreeItem-iconContainer').click();
}

test.describe('Components nav grouping + saved views', () => {
  test.use({ storageState: 'authentication.json' });

  const spaceIds: string[] = [];
  const filterIds: string[] = [];
  const viewIds: string[] = [];
  let ownerSpaceId = ''; // one Space to own saved views (rule b)

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);

    const fixtures: Array<{ slug: string; component: string; labels: Record<string, string> }> = [
      { slug: `${COMPONENT_CHECKOUT}-prod`, component: COMPONENT_CHECKOUT, labels: { Owner: OWNER_A, Variant: 'prod' } },
      { slug: `${COMPONENT_CHECKOUT}-staging`, component: COMPONENT_CHECKOUT, labels: { Owner: OWNER_A, Variant: 'staging' } },
      { slug: `${COMPONENT_BILLING}-base`, component: COMPONENT_BILLING, labels: { Owner: OWNER_A } },
      { slug: `${COMPONENT_SEARCH}-base`, component: COMPONENT_SEARCH, labels: { Owner: OWNER_B } },
      // No Owner label — the "Unassigned"/(empty) bucket.
      { slug: `${COMPONENT_ORPHAN}-base`, component: COMPONENT_ORPHAN, labels: {} },
      { slug: `${COMPONENT_SPLIT}-base`, component: COMPONENT_SPLIT, labels: { Owner: OWNER_SPLIT_1 } },
      { slug: `${COMPONENT_SPLIT}-prod`, component: COMPONENT_SPLIT, labels: { Owner: OWNER_SPLIT_2 } },
    ];

    for (const f of fixtures) {
      const component = await api.createComponent(f.component);
      const space = await api.createSpace({
        space: { Slug: f.slug, ComponentID: component.ComponentID, Labels: f.labels },
      });
      spaceIds.push(space.SpaceID);
      if (f.component === COMPONENT_CHECKOUT && f.labels.Variant === 'prod') {
        ownerSpaceId = space.SpaceID;
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
    for (const viewId of viewIds) {
      await api.deleteView(ownerSpaceId, viewId).catch(() => {});
    }
    for (const filterId of filterIds) {
      await api.deleteFilterInSpace(ownerSpaceId, filterId).catch(() => {});
    }
    for (const spaceId of spaceIds) {
      await api.deleteSpace(spaceId, true).catch(() => {});
    }
    await context.close();
  });

  test('1. default tree: Overview, Owner nodes, Component leaves; leaf testid present', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    await expect(page.getByRole('treeitem', { name: /Overview/ })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: new RegExp(OWNER_A) })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: new RegExp(OWNER_B) })).toBeVisible();
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`)).toBeVisible();
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_BILLING}`)).toBeVisible();
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_SEARCH}`)).toBeVisible();

    // Every non-Component-field node gets the generic `components-tree-node`
    // testid instead, so a spec can target a group node without matching its
    // label text. Scoped to our own two Owner nodes rather than a global
    // count: the org can have other pre-existing Owner (or "(empty)") buckets
    // outside this test's fixtures, and this only needs to show OUR nodes
    // get the generic testid, not that they're the only ones on the page.
    await expect(page.getByRole('treeitem', { name: new RegExp(OWNER_A) })).toHaveAttribute(
      'data-testid',
      'components-tree-node',
    );
    await expect(page.getByRole('treeitem', { name: new RegExp(OWNER_B) })).toHaveAttribute(
      'data-testid',
      'components-tree-node',
    );
  });

  test('2. adding Variant via the picker appends it and updates ?viewGroupBy=', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    // The picker's "+" always appends; the field is then free to move (drag)
    // — see test 3b for the same three-level order reached directly via the
    // URL, and its "Component moved to the middle is a group node" behavior,
    // which is exactly what appending Variant after Component produces here.
    await addLabelGroupingLevel(
      page,
      'Variant',
      /viewGroupBy=Labels\.Owner%2CComponent%2CLabels\.Variant/,
    );
    await expect(page.getByRole('button', { name: /Change Variant grouping/i })).toBeVisible();
  });

  test('3. leaf opens the Component graph (?app=); an Owner click opens a node graph of every Space under it, not the overview', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    await page.getByTestId(`app-tree-item-${COMPONENT_BILLING}`).click();
    await expect(page).toHaveURL(new RegExp(`app=${COMPONENT_BILLING}`));
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });

    // Owner A has Deployments in TWO Components (Checkout's 2 Variants +
    // Billing) — its bucket is never one whole Component, so the click opens
    // a `?group=` node graph of all 3, not `?app=`, and the overview matrix
    // is gone (a graph is on screen, not the dashboard).
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await expect(page).not.toHaveURL(new RegExp(`app=${COMPONENT_BILLING}`));
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(3);
  });

  test('3a. removing Component: no leaf testids; every click opens a node graph (not the overview); ?app= opens with no tree node selected', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    // Remove the Component chip, leaving Owner-only levels. Hover the chip
    // first — the remove (x) button only becomes hit-testable on hover.
    await page.getByRole('button', { name: /Change Component grouping/i }).hover();
    await page.getByRole('button', { name: /Remove Component grouping/i }).click();
    await expect(page).toHaveURL(/viewGroupBy=Labels\.Owner(?!.*Component)/, { timeout: 5000 });
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`)).toHaveCount(0);

    // With no Component field in levels, no node's bucket can ever equal a
    // whole Component — every click opens a `?group=` node graph, never `?app=`.
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await expect(page).not.toHaveURL(/app=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(3);

    // Deep link with Owner-only levels: graph opens, no tree node selected —
    // no node's bucket resolves back to exactly this Component without a
    // Component field to search at.
    await page.goto(`/components?app=${COMPONENT_BILLING}&viewGroupBy=Labels.Owner`);
    await waitForTreeLoaded(page);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(0);
  });

  test('3b. Component in the middle: its own node still opens the Component graph (?app=); a Variant node under it opens a one-node graph', async ({ page }) => {
    await page.goto(`/components?viewGroupBy=${encodeURIComponent('Labels.Owner,Component,Labels.Variant')}`);
    await waitForTreeLoaded(page);

    // The `app-tree-item-<name>` testid is on every Component-field node,
    // regardless of its depth — Component in the middle still gets it.
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`)).toHaveCount(1);
    // Its OWN bucket (Owner A ∩ Checkout) is still exactly the whole
    // Checkout Component (both Variants), so a click on it still opens
    // `?app=` — field position alone never decides the URL form.
    await clickTreeNode(page, COMPONENT_CHECKOUT);
    await expect(page).toHaveURL(new RegExp(`app=${COMPONENT_CHECKOUT}`));
    await expect(page).not.toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(2);

    // Checkout's own children (the Variant nodes) were never auto-expanded —
    // that only ever covers the top-level nodes at mount, not a node opened
    // by a later click — so expand it via its chevron first.
    await expandTreeNode(page, COMPONENT_CHECKOUT);

    // A Variant node one level below IS a strict subset (one Deployment) —
    // a one-node `?group=` graph, not `?app=`.
    await clickTreeNode(page, 'prod');
    await expect(page).toHaveURL(/group=/);
    await expect(page).not.toHaveURL(/app=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(1);
  });

  test('3c. a Component split across two Owners: a click on either of its nodes opens the WHOLE Component (?app=); the first node in tree order is highlighted', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    // One Component node under each Owner, in tree (localeCompare) order.
    const splitNodes = page.getByTestId(`app-tree-item-${COMPONENT_SPLIT}`);
    await expect(splitNodes).toHaveCount(2);

    // The node under the SECOND Owner holds only one of the two Spaces, but
    // the click names the Component, so the graph shows all of it.
    await splitNodes.nth(1).click();
    await expect(page).toHaveURL(new RegExp(`app=${COMPONENT_SPLIT}`));
    await expect(page).not.toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(2);
    await expect(splitNodes.first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1);

    // A deep link opens the same whole-Component graph with the same highlight.
    await page.goto(`/components?app=${COMPONENT_SPLIT}`);
    await waitForTreeLoaded(page);
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(2);
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_SPLIT}`).first()).toHaveAttribute('aria-selected', 'true');

    // An Owner node above it holds only part of the Component — still a
    // `?group=` graph of that part.
    await clickTreeNode(page, OWNER_SPLIT_2);
    await expect(page).toHaveURL(/group=/);
    await expect(page).not.toHaveURL(/app=/);
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(1);
  });

  test('4-5. saving a view (grouping only) persists across reload; the Unit list never sees it', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    // No filter row on this page — a Components view holds grouping only.
    // The View API still requires a FilterID; this also proves the backend
    // accepts and round-trips an auto-minted, condition-less Filter
    // (`From: 'Space'`, no `Where`) attached to a components-kind View.

    // Add a grouping level (Variant) so the saved view carries non-default grouping.
    await addLabelGroupingLevel(
      page,
      'Variant',
      /viewGroupBy=Labels\.Owner%2CComponent%2CLabels\.Variant/,
    );

    // Save as a new view.
    await page.getByTestId('view-tabs-add-tab').click();
    await page.getByTestId('add-tab-menu-create-new-view').click();
    const viewName = `e2e-components-view-${RUN}`;
    await page.getByTestId('view-tabs-new-view-name-input').fill(viewName);
    await page.getByTestId('view-tabs-new-view-submit').click();

    const tab = page.getByTestId('view-tabs').getByRole('tab', { name: new RegExp(viewName) });
    await expect(tab).toBeVisible({ timeout: 10000 });
    // No modified dot right after save.
    await expect(tab.getByTestId('view-tab-modified-dot')).toHaveCount(0);

    const url = new URL(page.url());
    const viewId = url.searchParams.get('viewID');
    expect(viewId).toBeTruthy();
    if (viewId) viewIds.push(viewId);

    // Reload — same tab active, same grouping.
    await page.reload();
    await waitForTreeLoaded(page);
    await expect(page.getByTestId('view-tabs').getByRole('tab', { name: new RegExp(viewName) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page).toHaveURL(/Labels\.Variant/);

    // Isolation: this view must never show in the Unit list's own tab strip.
    // Wait for the Unit list's OWN tab strip to be fully loaded (the
    // sentinel "All units" tab present) before asserting an absence — an
    // absence check that runs before the strip has loaded would pass for
    // the wrong reason.
    await page.goto('/units');
    await expect(page.getByTestId('view-tabs')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('view-tab-all')).toBeVisible();
    await expect(page.getByTestId('view-tabs').getByRole('tab', { name: new RegExp(viewName) })).toHaveCount(0);

    const storageKeys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(storageKeys).toContain('confighub:space:components:openViewTabs');
    // No draft right after a clean save (namespaced the same way as the tabs key).
    expect(storageKeys).not.toContain(`confighub:space:components:viewDraft:${viewId}`);
  });

  test('4-5b. saving a new view right after adding a grouping level sends that level in the create payload', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    // A slow CPU keeps the level-add's router transition pending while the
    // save gestures below run, the way a busy CI runner or slow laptop does.
    // The address bar already holds the new level; renders until the
    // transition commits do not. The payload must follow the address bar.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    try {
      await addLabelGroupingLevel(
        page,
        'Variant',
        /viewGroupBy=Labels\.Owner%2CComponent%2CLabels\.Variant/,
      );

      const createResponse = page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/api\/space\/[^/]+\/view$/.test(new URL(r.url()).pathname),
      );
      await page.getByTestId('view-tabs-add-tab').click();
      await page.getByTestId('add-tab-menu-create-new-view').click();
      await page.getByTestId('view-tabs-new-view-name-input').fill(`e2e-components-view-fast-${RUN}`);
      await page.getByTestId('view-tabs-new-view-submit').click();

      const response = await createResponse;
      const created = (await response.json().catch(() => null)) as { ViewID?: string } | null;
      if (created?.ViewID) viewIds.push(created.ViewID);

      const body = response.request().postDataJSON() as { Annotations?: Record<string, string> };
      expect(body.Annotations?.['ui.confighub.io/group-by']).toBe(
        'Labels.Owner,Component,Labels.Variant',
      );
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  });

  test('13. a Variant-grouped node graph still detects an upstream Space outside the set as upgradable', async ({ page, browser }) => {
    // Dedicated Owner/Component so this test's Deployments never change any
    // other test's node/Deployment counts. Grouped by Variant ALONE — the
    // "downstream" node graph excludes its own upstream (a different
    // Variant bucket), which is exactly the gap the upstream-outside-set
    // lookup (`AppComponentView`'s second, UnitID-keyed units query) fixes.
    const context = await newAuthorizedContext(browser);
    const setupPage = await context.newPage();
    await setupPage.goto('/');
    await setupPage.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(setupPage);

    const owner = `e2e-nav-owner-up-${RUN}`;
    const upstreamComponent = `e2e-nav-upstream-${RUN}`;
    const upstreamVariant = `e2e-upstream-variant-${RUN}`;
    const downstreamVariant = `e2e-downstream-variant-${RUN}`;

    const { ComponentID: upstreamComponentId } = await api.createComponent(upstreamComponent);
    const upstreamSpace = await api.createSpace({
      space: { Slug: `${upstreamComponent}-up`, ComponentID: upstreamComponentId, Labels: { Owner: owner, Variant: upstreamVariant } },
    });
    const downstreamSpace = await api.createSpace({
      space: { Slug: `${upstreamComponent}-down`, ComponentID: upstreamComponentId, Labels: { Owner: owner, Variant: downstreamVariant } },
    });
    spaceIds.push(upstreamSpace.SpaceID, downstreamSpace.SpaceID);

    const yamlV1 = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: e2e-nav-upstream-cfg',
      'data:',
      '  version: "1"',
    ].join('\n');
    const yamlV2 = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: e2e-nav-upstream-cfg',
      'data:',
      '  version: "2"',
    ].join('\n');

    const upstreamUnit = await api.createUnit({
      spaceId: upstreamSpace.SpaceID,
      unit: { Slug: 'cfg', ToolchainType: 'Kubernetes/YAML' },
    });
    await api.uploadUnitData({ spaceId: upstreamSpace.SpaceID, unitId: upstreamUnit.UnitID, body: yamlV1 });

    const downstreamUnitResp = await hubApi.post(`/api/space/${downstreamSpace.SpaceID}/unit`, {
      params: { allow_exists: 'true', upstream_space_id: upstreamSpace.SpaceID, upstream_unit_id: upstreamUnit.UnitID },
      data: { Slug: 'cfg', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!downstreamUnitResp.ok()) {
      throw new Error(`Failed to create downstream unit: ${downstreamUnitResp.status()} ${await downstreamUnitResp.text()}`);
    }

    // A second upstream revision — the downstream unit, cloned at revision 1,
    // is now behind: exactly the state the flow graph reads as "Stale".
    await api.uploadUnitData({ spaceId: upstreamSpace.SpaceID, unitId: upstreamUnit.UnitID, body: yamlV2 });
    await context.close();

    await page.goto(`/components?group=${encodeURIComponent(downstreamVariant)}&viewGroupBy=Labels.Variant`);
    await waitForTreeLoaded(page);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    // The downstream Space is the ONLY node in this graph — its own upstream
    // (a different Variant bucket) is outside the set.
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(1);
    await expect(page.locator('.react-flow__node-deploymentNode').getByText('Stale')).toBeVisible({ timeout: 10000 });
  });

  test('6. no filter button on the Components page — a saved view holds grouping only', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);
    await expect(page.getByRole('button', { name: 'Filter' })).toHaveCount(0);

    // Also true with a Component graph open — the button never reappears
    // depending on what's on screen.
    await page.goto(`/components?app=${COMPONENT_SEARCH}`);
    await waitForTreeLoaded(page);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Filter' })).toHaveCount(0);
  });

  test('7a. the nav tree fills the resizable pane at every drag width', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    const widthsFor = () =>
      page.evaluate(() => {
        const paneEl = document.querySelector('#components-layout')?.firstElementChild as HTMLElement | null;
        const treeEl = document.querySelector('[role="tree"]') as HTMLElement | null;
        return { pane: paneEl?.getBoundingClientRect().width ?? 0, tree: treeEl?.getBoundingClientRect().width ?? 0 };
      });

    const before = await widthsFor();
    // The tree sits inside the pane's own padding (`PanelBody`'s 8px each
    // side) — a few px short of the pane's own width, not a full-width match.
    expect(before.pane - before.tree).toBeLessThan(20);

    const separator = page.locator('[data-separator]').first();
    const box = await separator.boundingBox();
    if (!box) throw new Error('resize separator not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await widthsFor();
    expect(after.pane).toBeGreaterThan(before.pane + 50);
    // The tree tracks the pane 1:1 — the same fixed padding gap, not a
    // fixed tree width left behind by a wider pane.
    expect(after.pane - after.tree).toBeLessThan(20);
  });

  test('8. changing levels while a ?group= node graph is open clears it and returns to the overview (not empty)', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    // Open a node graph (Owner A spans 2 Components, so this is a `?group=`
    // graph, not `?app=`) — sets ?group= and closes the overview.
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });

    // Change levels — remove the Component field. The stale ?group= (an
    // Owner value) means nothing once levels no longer include Owner at
    // that position, and must be cleared in the SAME URL write as the
    // level change (see `useGroupByLevels`'s `clearParamsOnEdit`).
    await page.getByRole('button', { name: /Change Component grouping/i }).hover();
    await page.getByRole('button', { name: /Remove Component grouping/i }).click();
    await expect(page).toHaveURL(/viewGroupBy=Labels\.Owner(?!.*Component)/, { timeout: 5000 });
    await expect(page).not.toHaveURL(/group=/);

    // The graph closed and the overview is showing again, NOT empty — it
    // fell back to showing everything, not a graph of a now-meaningless
    // stale group value.
    await expect(page.locator('.react-flow')).toHaveCount(0);
    const overviewTable = page.locator('table');
    await expect(overviewTable.getByText(COMPONENT_CHECKOUT)).toBeVisible();
    await expect(overviewTable.getByText(COMPONENT_BILLING)).toBeVisible();
    await expect(overviewTable.getByText(COMPONENT_SEARCH)).toBeVisible();
  });

  test('9. switching the active saved-view tab clears a stale ?group= (graph closes, overview returns)', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    // Open a node graph on the sentinel ("All components") tab. Owner A (not
    // B): B has exactly one Component with one Space, so its bucket trivially
    // equals that whole Component and would open `?app=` instead.
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });

    // Switch the active view (sentinel → a new saved view) — the same
    // `activeView.View.ViewID` transition `clearParamsOnViewSwitch` watches for.
    await page.getByTestId('view-tabs-add-tab').click();
    await page.getByTestId('add-tab-menu-create-new-view').click();
    const viewName = `e2e-components-view2-${RUN}`;
    await page.getByTestId('view-tabs-new-view-name-input').fill(viewName);
    await page.getByTestId('view-tabs-new-view-submit').click();
    await expect(
      page.getByTestId('view-tabs').getByRole('tab', { name: new RegExp(viewName) }),
    ).toBeVisible({ timeout: 10000 });

    const viewId = new URL(page.url()).searchParams.get('viewID');
    if (viewId) viewIds.push(viewId);

    await expect(page).not.toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toHaveCount(0);
  });

  test('10. the chevron only expands/collapses — it never opens a graph or writes the URL', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    const startUrl = page.url();
    await expandTreeNode(page, OWNER_A);

    await expect(page).toHaveURL(startUrl);
    await expect(page.locator('.react-flow')).toHaveCount(0);
    await expect(page.locator('table')).toBeVisible();
  });

  test('11. deep link ?group=<owner> restores the node graph and highlights + expands to that node', async ({ page }) => {
    await page.goto(`/components?group=${encodeURIComponent(OWNER_A)}`);
    await waitForTreeLoaded(page);

    await expect(page).toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(3);
    await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toContainText(OWNER_A);
  });

  test('12. Back after Owner graph -> Component graph returns to the Owner graph; re-clicking the open node adds no history entry', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);
    const overviewUrl = page.url();

    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    const ownerGraphUrl = page.url();

    await page.getByTestId(`app-tree-item-${COMPONENT_BILLING}`).click();
    await expect(page).toHaveURL(new RegExp(`app=${COMPONENT_BILLING}`));

    await page.goBack();
    await expect(page).toHaveURL(ownerGraphUrl);
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(3);

    // Re-clicking the node that's already open is a no-op — no new history
    // entry. If it wrongly pushed a duplicate entry here, a second Back
    // would land on ANOTHER copy of the Owner graph (still `?group=`)
    // instead of skipping past it to the Overview underneath.
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(ownerGraphUrl);
    await page.goBack();
    await expect(page).toHaveURL(overviewUrl);
  });

  test('12b. double-clicking a tree node adds ONE history entry — the second click sees the URL the first one wrote', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);
    const overviewUrl = page.url();

    // Both clicks land before React commits the first click's navigation
    // (the router hands React the new location in a transition), so the
    // second click's handler still renders from the Overview URL. Its
    // "already open" guard must read the live URL, or it pushes a second
    // `?group=` entry and Back can't reach the Overview.
    await page.locator('[role="tree"]').getByText(OWNER_A, { exact: false }).first().dblclick();
    await expect(page).toHaveURL(/group=/);
    await expect(page.locator('.react-flow__node-deploymentNode')).toHaveCount(3);

    await page.goBack();
    await expect(page).toHaveURL(overviewUrl);
  });

  test('14. Dashboard: shows only the open node\'s Spaces, Graph returns to the canvas, and it survives a reload', async ({ page }) => {
    // Owner A spans 2 Components (Checkout, Billing) — a mixed-Component node
    // graph, which is exactly the case Dashboard exists for.
    await page.goto('/components');
    await waitForTreeLoaded(page);
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });

    const dashboardButton = page.getByRole('button', { name: 'Dashboard' });
    await dashboardButton.click();
    await expect(page).toHaveURL(/display=dashboard/);
    const matrix = page.getByTestId('component-overview-matrix');
    await expect(matrix).toBeVisible();
    await expect(page.locator('.react-flow')).not.toBeVisible();

    // Only Owner A's own Components — Billing and Checkout — not Owner B's
    // Search, which sits outside this node.
    await expect(matrix.getByText(COMPONENT_CHECKOUT)).toBeVisible();
    await expect(matrix.getByText(COMPONENT_BILLING)).toBeVisible();
    await expect(matrix.getByText(COMPONENT_SEARCH)).toHaveCount(0);

    // Graph is the only other segment; clicking it returns to the canvas.
    await page.getByRole('button', { name: 'Graph' }).click();
    await expect(page).not.toHaveURL(/display=dashboard/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });

    // Reload while Dashboard is open — it's restored, not the graph.
    await page.goto(`/components?app=${COMPONENT_CHECKOUT}&display=dashboard`);
    await waitForTreeLoaded(page);
    await expect(page.getByTestId('component-overview-matrix')).toBeVisible();
    await expect(page.locator('.react-flow')).not.toBeVisible();
  });

  test('15. the Component field and special label keys (Owner) get their own icon in the "Add grouping level" picker; an ordinary label key (Variant) gets the generic one', async ({ page }) => {
    // MUI's icon components carry a `data-testid="<Name>Icon"` unconditionally
    // (createSvgIcon), so this distinguishes the actual rendered icon without
    // needing a visual/screenshot diff.
    await page.goto('/components');
    await waitForTreeLoaded(page);
    await page.getByRole('button', { name: 'Add grouping level' }).click();

    // Component is a top-level field (a Space's Component entity), not a
    // label — checked before the Labels submenu opens.
    const componentRow = page.getByRole('menuitem', { name: /^Component/ });
    await componentRow.waitFor({ state: 'visible', timeout: 5000 });
    await expect(componentRow.getByTestId('WidgetsOutlinedIcon')).toBeVisible();

    const labelsTrigger = page.getByRole('menuitem', { name: 'Labels', exact: true });
    await labelsTrigger.hover();

    const ownerRow = page.getByRole('menuitem', { name: 'Owner' });
    await expect(ownerRow.getByTestId('PersonOutlineOutlinedIcon')).toBeVisible();

    // Variant is an ordinary label key (not one of the 5 special ones) — it
    // keeps the generic Labels icon, not one of its own.
    const variantRow = page.getByRole('menuitem', { name: 'Variant' });
    await expect(variantRow.getByTestId('LocalOfferOutlinedIcon')).toBeVisible();
  });

  test('16. Dashboard mode is sticky across node clicks; Back keeps it too', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/display=dashboard/);
    const matrix = page.getByTestId('component-overview-matrix');
    await expect(matrix).toBeVisible();
    await expect(matrix.getByText(COMPONENT_CHECKOUT)).toBeVisible();

    // Clicking a DIFFERENT node (Owner B) keeps Dashboard mode and shows
    // Owner B's own Spaces, not Owner A's.
    await clickTreeNode(page, OWNER_B);
    await expect(page).toHaveURL(/display=dashboard/);
    await expect(page.getByTestId('component-overview-matrix')).toBeVisible();
    await expect(page.locator('.react-flow')).not.toBeVisible();
    await expect(matrix.getByText(COMPONENT_SEARCH)).toBeVisible();
    await expect(matrix.getByText(COMPONENT_CHECKOUT)).toHaveCount(0);

    // Back returns to Owner A's node — still in Dashboard mode.
    await page.goBack();
    await expect(page).toHaveURL(/display=dashboard/);
    await expect(page.getByTestId('component-overview-matrix')).toBeVisible();
    await expect(matrix.getByText(COMPONENT_CHECKOUT)).toBeVisible();
  });

  test('7. Unit list default Space grouping still works (smoke — unit-list-page.spec.ts covers this in full)', async ({ page }) => {
    await page.goto('/units');
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    await expect(page.getByRole('button', { name: /Change Space grouping/i })).toBeVisible({ timeout: 10000 });
    // A second grouping level still works via the same picker (same assertion
    // shape as `unit-list-page.spec.ts`'s "Table Grouping" block).
    await page.getByRole('button', { name: 'Add grouping level' }).click();
    await page.getByRole('menuitem', { name: 'Target' }).click();
    await expect(page.getByRole('button', { name: /Change Target grouping/i })).toBeVisible({ timeout: 10000 });
  });
});
