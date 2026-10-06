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
// One Component whose two Spaces have DIFFERENT Owners and no Owner of its
// own: it has no owner, so it is one leaf under "(empty)".
const OWNER_SPLIT_1 = `e2e-nav-owner-split1-${RUN}`;
const OWNER_SPLIT_2 = `e2e-nav-owner-split2-${RUN}`;
const COMPONENT_SPLIT = `e2e-nav-split-${RUN}`;
// A Component with its own Owner label, whose Space has Owner B: its own
// label wins, so it is under Owner C, and Owner B keeps one Component.
const OWNER_C = `e2e-nav-owner-c-${RUN}`;
const COMPONENT_OWNED = `e2e-nav-owned-${RUN}`;
// A Component with no Spaces (no variants yet), and an Owner of its own.
const OWNER_E = `e2e-nav-owner-e-${RUN}`;
const COMPONENT_EMPTY = `e2e-nav-empty-${RUN}`;
// An ordinary Component label key, on Checkout only.
const TIER_KEY = 'Tier';

/** Component labels for the fixtures that have any. */
const COMPONENT_LABELS: Record<string, Record<string, string>> = {
  [COMPONENT_CHECKOUT]: { [TIER_KEY]: 'gold' },
  [COMPONENT_OWNED]: { Owner: OWNER_C },
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
  const componentIds: string[] = [];
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
      { slug: `${COMPONENT_OWNED}-base`, component: COMPONENT_OWNED, labels: { Owner: OWNER_B } },
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
    for (const filterId of filterIds) {
      await api.deleteFilterInSpace(ownerSpaceId, filterId).catch(warn(`Filter ${filterId}`));
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

    // The (empty) group (Orphan and Split have no owner) is the last
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

  test('2b. a Component label level groups by the Component\'s own label', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    await addLabelGroupingLevel(page, TIER_KEY, /viewGroupBy=Labels\.Owner%2CLabels\.Tier/);
    // Checkout carries Tier=gold; Billing (same Owner) has no Tier. The new
    // level's nodes start collapsed, so open them by their chevrons.
    const ownerA = treeNode(page, OWNER_A);
    const gold = ownerA.getByRole('treeitem', { name: /^gold/ });
    const noTier = ownerA.getByRole('treeitem', { name: /^\(empty\)/ });
    await gold.locator('.MuiTreeItem-iconContainer').first().click();
    await noTier.locator('.MuiTreeItem-iconContainer').first().click();
    await expect(gold.getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`)).toBeVisible();
    await expect(noTier.getByTestId(`app-tree-item-${COMPONENT_BILLING}`)).toBeVisible();
    // (empty) is last at the second level too.
    const tierGroups = ownerA.locator('[data-testid="components-tree-node"]');
    await expect(tierGroups).toHaveCount(2);
    await expect(tierGroups.last().locator('.MuiTreeItem-content').first()).toContainText('(empty)');
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

  test('3a. an old ?viewGroupBy=Labels.Owner,Component link reads as Owner only', async ({ page }) => {
    await page.goto(`/components?viewGroupBy=${encodeURIComponent('Labels.Owner,Component')}`);
    await waitForTreeLoaded(page);

    await expect(page.getByRole('button', { name: /Change Owner grouping/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Change Component grouping/i })).toHaveCount(0);
    // One leaf per Component, directly under its Owner node.
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`)).toHaveCount(1);
    await expect(treeNode(page, OWNER_A).getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`)).toBeVisible();

    await clickTreeNode(page, OWNER_A);
    await expect(page).toHaveURL(/group=/);
    await expect(deploymentNodes(page)).toHaveCount(3);

    // A Component deep link with the old levels highlights the Component's leaf.
    await page.goto(`/components?app=${COMPONENT_BILLING}&viewGroupBy=${encodeURIComponent('Labels.Owner,Component')}`);
    await waitForTreeLoaded(page);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_BILLING}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1);
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

  test('3c. a Component whose Spaces have different Owners has no owner: one leaf under (empty), which opens the WHOLE Component', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    const splitLeaf = page.getByTestId(`app-tree-item-${COMPONENT_SPLIT}`);
    await expect(splitLeaf).toHaveCount(1);
    // The Space Owners make no node of their own.
    await expect(treeNode(page, OWNER_SPLIT_1)).toHaveCount(0);
    await expect(treeNode(page, OWNER_SPLIT_2)).toHaveCount(0);
    await expect(
      page.getByRole('treeitem', { name: /^\(empty\)/ }).getByTestId(`app-tree-item-${COMPONENT_SPLIT}`),
    ).toHaveCount(1);

    await splitLeaf.click();
    await expect(page).toHaveURL(new RegExp(`app=${COMPONENT_SPLIT}`));
    await expect(page).not.toHaveURL(/group=/);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(deploymentNodes(page)).toHaveCount(2);
    await expect(splitLeaf).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1);
  });

  test('3d. a Component\'s own Owner label wins over the Owner label of its Spaces', async ({ page }) => {
    await page.goto('/components');
    await waitForTreeLoaded(page);

    await expect(treeNode(page, OWNER_C).getByTestId(`app-tree-item-${COMPONENT_OWNED}`)).toBeVisible();
    await expect(treeNode(page, OWNER_B).getByTestId(`app-tree-item-${COMPONENT_OWNED}`)).toHaveCount(0);
    await expect(nodeCount(treeNode(page, OWNER_B))).toHaveText('1');
  });

  test('3e. a saved view whose levels include Component reads as Owner only, and shows unmodified', async ({ page }) => {
    const api = new ApiHelper(page);
    const filter = await api.createFilter({
      spaceId: ownerSpaceId,
      filter: { Slug: `e2e-components-old-filter-${RUN}`, From: 'Space' },
    });
    filterIds.push(filter.FilterID as string);
    const viewName = `e2e-components-old-view-${RUN}`;
    const view = await api.createView({
      spaceId: ownerSpaceId,
      view: {
        Slug: viewName,
        FilterID: filter.FilterID,
        Annotations: {
          'ui.confighub.io/view-kind': 'components',
          'ui.confighub.io/group-by': 'Labels.Owner,Component',
        },
      },
    });
    viewIds.push(view.ViewID as string);

    await page.goto(`/components?viewID=${view.ViewID}&type=view`);
    await waitForTreeLoaded(page);
    const tab = page.getByTestId('view-tabs').getByRole('tab', { name: new RegExp(viewName) });
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
    await expect(page.getByRole('button', { name: /Change Owner grouping/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Change Component grouping/i })).toHaveCount(0);
    await expect(treeNode(page, OWNER_A).getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`)).toBeVisible();
    // Reading the old levels changes nothing in the view.
    await expect(tab.getByTestId('view-tab-modified-dot')).toHaveCount(0);
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
      await addStaticGroupingLevel(page, 'Gated', /viewGroupBy=Labels\.Owner%2CGated/);

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
      expect(body.Annotations?.['ui.confighub.io/group-by']).toBe('Labels.Owner,Gated');
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
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
    await expect(deploymentNodes(page)).toHaveCount(3);
    await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toContainText(OWNER_A);
  });

  test('11b. a ?group= path that ends at a leaf opens that Component; a path with no Component highlights nothing', async ({ page }) => {
    // One value longer than the levels (Owner): the leaf of Billing. The pane
    // shows Billing's graph, not the overview, and only its leaf is selected.
    await page.goto(`/components?group=${encodeURIComponent(OWNER_A)}&group=${encodeURIComponent(COMPONENT_BILLING)}`);
    await waitForTreeLoaded(page);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('table')).toHaveCount(0);
    await expect(deploymentNodes(page)).toHaveCount(1);
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_BILLING}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1);

    // A path no Component has: the overview, and no node selected.
    await page.goto(`/components?group=${encodeURIComponent(`e2e-nav-no-owner-${RUN}`)}`);
    await waitForTreeLoaded(page);
    await expect(page.locator('table')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.react-flow')).toHaveCount(0);
    await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(0);
  });

  test('11c. a failed Component list shows an error with Retry in the tree and the pane, not a skeleton', async ({ page }) => {
    let failList = true;
    // Only the list request: `/api/component/<id>` reads are left alone.
    await page.route(/\/api\/component(\?.*)?$/, async (route) => {
      if (failList && route.request().method() === 'GET') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'list failed' }) });
        return;
      }
      await route.continue();
    });
    await page.goto(`/components?app=${COMPONENT_BILLING}`);
    const errors = page.getByTestId('query-error-state');
    await expect(errors).toHaveCount(2, { timeout: 20000 });

    failList = false;
    await errors.first().getByTestId('query-error-retry').click();
    await expect(errors).toHaveCount(0, { timeout: 20000 });
    await waitForTreeLoaded(page);
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_BILLING}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
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
    await expect(deploymentNodes(page)).toHaveCount(3);

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

  test('15. a Component leaf and special label keys (Owner) get their own icon; an ordinary label key gets the generic one; Variant is not offered', async ({ page }) => {
    // MUI's icon components carry a `data-testid="<Name>Icon"` unconditionally
    // (createSvgIcon), so this distinguishes the actual rendered icon without
    // needing a visual/screenshot diff.
    await page.goto('/components');
    await waitForTreeLoaded(page);
    await expect(page.getByTestId(`app-tree-item-${COMPONENT_CHECKOUT}`).getByTestId('WidgetsOutlinedIcon')).toBeVisible();

    await page.getByRole('button', { name: 'Add grouping level' }).click();
    const labelsTrigger = page.getByRole('menuitem', { name: 'Labels', exact: true });
    await labelsTrigger.waitFor({ state: 'visible', timeout: 5000 });
    await labelsTrigger.hover();

    const ownerRow = page.getByRole('menuitem', { name: /^Owner/ });
    await expect(ownerRow.getByTestId('PersonOutlineOutlinedIcon')).toBeVisible();

    // Tier is an ordinary Component label key — it keeps the generic Labels icon.
    const tierRow = page.getByRole('menuitem', { name: new RegExp(`^${TIER_KEY}`) });
    await expect(tierRow.getByTestId('LocalOfferOutlinedIcon')).toBeVisible();

    // Variant names a Space, never a Component.
    await expect(page.getByRole('menuitem', { name: /^Variant/ })).toHaveCount(0);
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
