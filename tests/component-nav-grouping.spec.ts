// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Components page's left-nav grouping (same system as the Unit list's
// `GroupNavPanel`) plus the ViewTabs saved-views strip (grouping only — no
// filter row on this page), namespaced away from the Unit list via
// `viewKind: 'components'`. The tree's leaves are Component entities, grouped
// by properties of the Component (by default its owner). See
// `ui/docs/dev/components.md` ("Navigation tree") for the terms this spec
// exercises: leaf, node graph, Component graph, and the `?app=` vs `?group=`
// rule.
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
// A Component with no Spaces (no variants yet), and an Owner of its own.
const OWNER_E = `e2e-nav-owner-e-${RUN}`;
const COMPONENT_EMPTY = `e2e-nav-empty-${RUN}`;

/** Component labels for the fixtures that have any. */
const COMPONENT_LABELS: Record<string, Record<string, string>> = {
  [COMPONENT_EMPTY]: { Owner: OWNER_E },
};

/**
 * The flow graph's Deployment nodes. Not `.react-flow__node`: a graph can
 * also hold frame, stack and composer nodes, which are not Deployments.
 */
function deploymentNodes(page: Page) {
  return page.locator('.react-flow__node-deploymentNode');
}

/** A tree node by the text of its own label. */
function treeNode(page: Page, label: string) {
  return page.getByRole('treeitem', { name: new RegExp(label) });
}

/** The count badge of a tree node: the last text of its own row. */
function nodeCount(node: ReturnType<Page['locator']>) {
  return node.locator('.MuiTreeItem-content').first().locator('p').last();
}

async function waitForTreeLoaded(page: Page) {
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await page.waitForSelector('[role="tree"]', { timeout: 20000 });
}

/** Opens the field picker and adds a top-level (non-label) field. */
async function addStaticGroupingLevel(page: Page, field: string, expectedUrlPattern: RegExp) {
  await page.getByRole('button', { name: 'Add grouping level' }).click();
  await page.getByRole('menuitem', { name: field }).click();
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

test.describe('Components nav grouping + saved views', () => {
  test.use({ storageState: 'authentication.json' });

  const spaceIds: string[] = [];
  const componentIds: string[] = [];
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
    ];

    const componentIdBySlug = new Map<string, string>();
    for (const slug of [...new Set(fixtures.map((f) => f.component)), COMPONENT_EMPTY]) {
      const component = await api.createComponent(slug, COMPONENT_LABELS[slug]);
      componentIdBySlug.set(slug, component.ComponentID as string);
      componentIds.push(component.ComponentID as string);
    }

    for (const f of fixtures) {
      const space = await api.createSpace({
        space: { Slug: f.slug, ComponentID: componentIdBySlug.get(f.component), Labels: f.labels },
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
    // A failed delete leaves a fixture in the shared org, where later runs
    // and other specs see it, so say which one.
    const warn = (what: string) => (error: unknown) => console.warn(`cleanup: ${what}: ${error}`);
    for (const viewId of viewIds) {
      await api.deleteView(ownerSpaceId, viewId).catch(warn(`View ${viewId}`));
    }
    for (const spaceId of spaceIds) {
      await api.deleteSpace(spaceId, true).catch(warn(`Space ${spaceId}`));
    }
    // After their Spaces. The org has a Component quota, so a run must not
    // leave its Components behind.
    for (const componentId of componentIds) {
      await api.deleteComponent(componentId).catch(warn(`Component ${componentId}`));
    }
    await context.close();
  });

  test('1. default tree: Overview, Owner nodes, Component leaves under them; counts are Components, then variants', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    await expect(page.getByRole('treeitem', { name: /Overview/ })).toBeVisible();
    const ownerA = treeNode(page, OWNER_A);
    await expect(ownerA).toBeVisible();
    await expect(treeNode(page, OWNER_B)).toBeVisible();
    // The leaves are under their Owner node.
    await expect(ownerA.getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`)).toBeVisible();
    await expect(ownerA.getByTestId(`app-tree-item-${COMPONENT_BILLING}`)).toBeVisible();
    await expect(treeNode(page, OWNER_B).getByTestId(`app-tree-item-${COMPONENT_SEARCH}`)).toBeVisible();

    // A group node counts Components; a leaf counts its variants (Spaces).
    await expect(nodeCount(ownerA)).toHaveText('2');
    await expect(nodeCount(page.getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`))).toHaveText('2');
    await expect(nodeCount(page.getByTestId(`app-tree-item-${COMPONENT_BILLING}`))).toHaveText('1');

    // Component is not a grouping level any more: there is no chip for it.
    await expect(page.getByRole('button', { name: /Change Owner grouping/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Change Component grouping/i })).toHaveCount(0);

    // Every group node gets the generic `components-tree-node` testid
    // instead, so a spec can target a group node without matching its label
    // text. Scoped to our own two Owner nodes rather than a global count: the
    // org can have other Owner (or "(empty)") nodes outside these fixtures.
    await expect(ownerA).toHaveAttribute('data-testid', 'components-tree-node');
    await expect(treeNode(page, OWNER_B)).toHaveAttribute('data-testid', 'components-tree-node');

    // The (empty) group (Orphan has no owner) is the last
    // top-level group, after every real Owner.
    const topLevelGroups = page.locator('[role="tree"] > [data-testid="components-tree-node"]');
    await expect(topLevelGroups.last().locator('.MuiTreeItem-content').first()).toContainText('(empty)');
    await expect(topLevelGroups.first().locator('.MuiTreeItem-content').first()).not.toContainText('(empty)');
  });

  test('2. the picker offers only Component fields; adding a status level appends it and updates ?viewGroupBy=', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    await page.getByRole('button', { name: 'Add grouping level' }).click();
    const gated = page.getByRole('menuitem', { name: 'Gated' });
    await gated.waitFor({ state: 'visible', timeout: 5000 });
    // A Space property can differ between the Spaces of one Component, so
    // neither the Component itself nor a Release target is offered.
    await expect(page.getByRole('menuitem', { name: /^Component/ })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /^Target/ })).toHaveCount(0);
    await gated.click();
    await expect(page).toHaveURL(/viewGroupBy=Labels\.Owner%2CGated/, { timeout: 5000 });
    await expect(page.getByRole('button', { name: /Change Gated grouping/i })).toBeVisible();
    // Owner A now holds Gated group nodes; the leaves are one level lower.
    await expect(treeNode(page, OWNER_A).getByRole('treeitem').first()).toHaveAttribute(
      'data-testid',
      'components-tree-node',
    );
  });

  test('3. a leaf opens the Component graph (?app=); an Owner click opens a node graph of every Space under it, not the overview', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    await page.getByTestId(`app-tree-item-${COMPONENT_BILLING}`).click();
    await expect(page).toHaveURL(new RegExp(`app=${COMPONENT_BILLING}`));
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_BILLING}`)).toHaveAttribute('aria-selected', 'true');

    // Owner A has two Components (Checkout's 2 Variants + Billing), so the
    // click opens a `?group=` node graph of all 3 Spaces, not `?app=`, and
    // the overview matrix is gone (a graph is on screen, not the dashboard).
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await expect(page).not.toHaveURL(new RegExp(`app=${COMPONENT_BILLING}`));
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('table')).toHaveCount(0);
    await expect(deploymentNodes(page)).toHaveCount(3);
  });

  test('3b. a Component with no Spaces is a leaf; it opens an empty state with the upload command', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    const leaf = page.getByTestId(`app-tree-item-${COMPONENT_EMPTY}`);
    await expect(treeNode(page, OWNER_E).getByTestId(`app-tree-item-${COMPONENT_EMPTY}`)).toBeVisible();
    await expect(nodeCount(leaf)).toHaveText('0');

    await leaf.click();
    await expect(page).toHaveURL(new RegExp(`app=${COMPONENT_EMPTY}`));
    const empty = page.getByTestId('component-no-variants');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(`${COMPONENT_EMPTY} has no variants yet`);
    await expect(empty).toContainText(`cub variant upload --component ${COMPONENT_EMPTY}`);
    await expect(page.locator('.react-flow')).toHaveCount(0);
    await expect(leaf).toHaveAttribute('aria-selected', 'true');

    // A deep link shows the same, and the Owner node above it (one
    // Component) opens that Component too.
    await page.goto(`/components?app=${COMPONENT_EMPTY}`);
    await waitForTreeLoaded(page);
    await expect(page.getByTestId('component-no-variants')).toBeVisible();
    await page.goto('/components');
    await waitForTreeLoaded(page);
    await clickTreeNode(page, OWNER_E);
    await expect(page).toHaveURL(new RegExp(`app=${COMPONENT_EMPTY}`));
    await expect(page.getByTestId('component-no-variants')).toBeVisible();
  });

  test('4-5. saving a view (grouping only) persists across reload; the Unit list never sees it', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    // No filter row on this page — a Components view holds grouping only.
    // The View API still requires a FilterID; this also proves the backend
    // accepts and round-trips an auto-minted, condition-less Filter
    // (`From: 'Space'`, no `Where`) attached to a components-kind View.

    // Add a grouping level (Gated) so the saved view carries non-default grouping.
    await addStaticGroupingLevel(page, 'Gated', /viewGroupBy=Labels\.Owner%2CGated/);

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
    await expect(page).toHaveURL(/Gated/);

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

  test('13. a node graph still detects an upstream Space outside the set as upgradable', async ({ page, browser }) => {
    // The downstream Space is in a Component of its own, whose upstream is in
    // another Component under another Owner — so the Owner node's graph
    // excludes its own upstream, which is exactly the gap the
    // upstream-outside-set lookup (`AppComponentView`'s second, UnitID-keyed
    // units query) fixes. Dedicated Owners and Components, so no other
    // test's counts change.
    const context = await newAuthorizedContext(browser);
    const setupPage = await context.newPage();
    await setupPage.goto('/');
    await setupPage.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(setupPage);

    const upstreamOwner = `e2e-nav-owner-up-${RUN}`;
    const downstreamOwner = `e2e-nav-owner-down-${RUN}`;
    const upstreamComponent = `e2e-nav-upstream-${RUN}`;
    const downstreamComponent = `e2e-nav-downstream-${RUN}`;

    const { ComponentID: upstreamComponentId } = await api.createComponent(upstreamComponent);
    const { ComponentID: downstreamComponentId } = await api.createComponent(downstreamComponent);
    componentIds.push(upstreamComponentId as string, downstreamComponentId as string);
    const upstreamSpace = await api.createSpace({
      space: { Slug: `${upstreamComponent}-up`, ComponentID: upstreamComponentId, Labels: { Owner: upstreamOwner } },
    });
    const downstreamSpace = await api.createSpace({
      space: { Slug: `${downstreamComponent}-down`, ComponentID: downstreamComponentId, Labels: { Owner: downstreamOwner } },
    });
    // afterAll deletes in this order. Downstream first: its Unit's Link
    // references the upstream Unit, and the server refuses to delete a Space
    // whose Units a Link still references.
    spaceIds.push(downstreamSpace.SpaceID, upstreamSpace.SpaceID);

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

    await page.goto(`/components?group=${encodeURIComponent(downstreamOwner)}`);
    await waitForTreeLoaded(page);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    // The downstream Space is the ONLY node in this graph — its own upstream
    // (another Owner's Component) is outside the set.
    await expect(deploymentNodes(page)).toHaveCount(1);
    await expect(deploymentNodes(page).getByText('Stale', { exact: true })).toBeVisible({
      timeout: 10000,
    });
  });

  test('8. changing levels while a ?group= node graph is open clears it and returns to the overview (not empty)', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    // Open a node graph (Owner A spans 2 Components, so this is a `?group=`
    // graph, not `?app=`) — sets ?group= and closes the overview.
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });

    // Change levels — add a level. The ?group= path was chosen under the old
    // levels and is cleared in the SAME URL write as the level change (see
    // `useGroupByLevels`'s `clearParamsOnEdit`).
    await addStaticGroupingLevel(page, 'Gated', /viewGroupBy=Labels\.Owner%2CGated/);
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

  test('11. deep link ?group=<owner> restores the node graph and highlights + expands to that node', async ({ page }) => {
    await page.goto(`/components?group=${encodeURIComponent(OWNER_A)}`);
    await waitForTreeLoaded(page);

    await expect(page).toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(deploymentNodes(page)).toHaveCount(3);
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
    await expect(deploymentNodes(page)).toHaveCount(3);

    // Re-clicking the node that's already open is a no-op — no new history
    // entry. If it wrongly pushed a duplicate entry here, a second Back
    // would land on ANOTHER copy of the Owner graph (still `?group=`)
    // instead of skipping past it to the Overview underneath.
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(ownerGraphUrl);
    await page.goBack();
    await expect(page).toHaveURL(overviewUrl);
  });

  test('14. Dashboard: shows only the open node\'s Spaces, is sticky across node clicks and Back, Graph returns to the canvas, and it survives a reload', async ({ page }) => {
    // Owner A spans 2 Components (Checkout, Billing) — a mixed-Component node
    // graph, which is exactly the case Dashboard exists for.
    await page.goto('/components');
    await waitForTreeLoaded(page);
    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/display=dashboard/);
    const matrix = page.getByTestId('component-overview-matrix');
    await expect(matrix).toBeVisible();
    await expect(page.locator('.react-flow')).not.toBeVisible();

    // Only Owner A's own Components — Billing and Checkout — not Owner B's
    // Search, which sits outside this node.
    await expect(matrix.getByText(COMPONENT_CHECKOUT)).toBeVisible();
    await expect(matrix.getByText(COMPONENT_BILLING)).toBeVisible();
    await expect(matrix.getByText(COMPONENT_SEARCH)).toHaveCount(0);

    // Clicking a DIFFERENT node (Owner B) keeps Dashboard mode and shows
    // Owner B's own Spaces, not Owner A's.
    await clickTreeNode(page, OWNER_B);
    await expect(page).toHaveURL(/display=dashboard/);
    await expect(page.locator('.react-flow')).not.toBeVisible();
    await expect(matrix.getByText(COMPONENT_SEARCH)).toBeVisible();
    await expect(matrix.getByText(COMPONENT_CHECKOUT)).toHaveCount(0);

    // Back returns to Owner A's node — still in Dashboard mode.
    await page.goBack();
    await expect(page).toHaveURL(/display=dashboard/);
    await expect(matrix.getByText(COMPONENT_CHECKOUT)).toBeVisible();

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
});
