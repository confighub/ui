// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Locator, type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Component Release Flow E2E Tests
//
// Creates its own release-enabled Space (an OCI-provider Target, backed by a
// server-hosted worker — no external bridge process required, mirroring
// test/scripts/test-setup.sh's `cub worker create --is-server-worker` +
// `cub target create --provider OCI` pattern) via API, then exercises the
// component view's Release trigger + history UI: publish → history update,
// and a failed publish surfacing its error.
// ============================================================================

const APP_LABEL = `e2e-release-${RandomSlugGenerator.randomSlugName()}`;

/**
 * Navigate to the component page filtered by app label, wait for loading to
 * finish, then click the app in the navigation tree so the flow graph renders.
 */
async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
}

// The release selectors, driven the way a reader drives them. Module scope
// rather than per-block: both the selector tests and the container image tests
// reach a comparison through the same two pickers, and a second copy of these
// would be free to drift from the first while both kept passing.

/** The option for one release, inside whichever picker is open. */
function option(page: Page, label: string): Locator {
  return page.getByTestId('release-picker-option').filter({ has: page.locator(`[data-label="${label}"]`) }).or(
    page.locator(`[data-testid="release-picker-option"][data-label="${label}"]`),
  );
}

/** Open one selector's picker. Both selectors stay on screen while it is open. */
async function openPicker(page: Page, side: 'a' | 'b'): Promise<void> {
  await page.getByTestId(`release-selector-${side}`).click();
  await expect(page.getByTestId(`release-picker-${side}`)).toBeVisible();
}

/** Put a release into a slot, by the label a reader sees. */
async function choose(page: Page, side: 'a' | 'b', label: string): Promise<void> {
  await openPicker(page, side);
  await option(page, label).click();
  await expect(page.getByTestId(`release-picker-${side}`)).toHaveCount(0);
  await expect(page.getByTestId(`release-selector-${side}`)).toHaveAttribute('data-label', label);
}

/**
 * Empty both selectors, which is how a test reaches the unreleased view now
 * that the footer offers no way back to it.
 *
 * B FIRST. The two ends are one ordered list with holes filtered out, so
 * clearing A while B still holds something promotes B into A, and the slot just
 * emptied fills itself again.
 *
 * Retried as a whole, because the pane seeds its default only once the
 * unreleased count resolves: a clear that runs before that lands would empty
 * two already-blank slots and then watch the default arrive behind it.
 */
async function startEmpty(page: Page): Promise<void> {
  await expect(
    page.getByTestId('release-selectors').or(page.getByTestId('release-empty')),
  ).toBeVisible({ timeout: 10000 });
  // A component with no releases renders "no releases yet" and no selectors;
  // that state is already the unreleased view and has nothing to clear.
  if (await page.getByTestId('release-empty').count()) return;
  await expect(async () => {
    for (const side of ['b', 'a'] as const) {
      const label = await page.getByTestId(`release-selector-${side}`).getAttribute('data-label');
      if (label) await clearSlot(page, side, label);
    }
    await expect(page.getByTestId('release-selector-a')).toHaveAttribute('data-label', '');
    await expect(page.getByTestId('release-selector-b')).toHaveAttribute('data-label', '');
  }).toPass({ timeout: 20000 });
}

/** Empty both selectors AND assert the pane is showing unreleased work. */
async function goToUnreleased(page: Page): Promise<void> {
  await startEmpty(page);
  if (await page.getByTestId('release-empty').count()) return;
  await expect(page.getByTestId('release-notes')).toHaveAttribute('data-mode', 'none');
}

/**
 * Put a release into a slot only if it is not already there.
 *
 * Picking what a slot ALREADY holds clears it, and the pane opens with the
 * latest release in A, so an unconditional pick of that release turns a setup
 * step into a clear. Used where a test needs a slot to HOLD something; `choose`
 * stays where the click itself is the subject.
 */
async function ensure(page: Page, side: 'a' | 'b', label: string): Promise<void> {
  const slot = page.getByTestId(`release-selector-${side}`);
  if ((await slot.getAttribute('data-label')) === label) return;
  await choose(page, side, label);
}

/**
 * Empty a slot, by picking the release it already holds.
 *
 * NOT `choose`. `choose` ends by asserting the slot HOLDS what was picked, so
 * pointing it at a slot's own release makes its post-condition contradict the
 * gesture — the click empties the slot and the assertion demands the label be
 * there. Clearing had no name, so a test reached for the nearest helper whose
 * contract forbade exactly this.
 */
async function clearSlot(page: Page, side: 'a' | 'b', label: string): Promise<void> {
  await expect(page.getByTestId(`release-selector-${side}`)).toHaveAttribute('data-label', label);
  await openPicker(page, side);
  await option(page, label).click();
  await expect(page.getByTestId(`release-selector-${side}`)).toHaveAttribute('data-label', '');
}

test.describe('component release flow', () => {
  test.use({ storageState: 'authentication.json' });
  // Serial: the publish tests mutate the SAME releaseSpaceId's release history
  // through the real endpoint rather than a route mock. Running them in
  // parallel (the config's fullyParallel default) would race two publishes
  // against one Space and make "which rel-N appeared" nondeterministic.
  test.describe.configure({ mode: 'serial' });

  const releaseSlug = `e2e-rel-${RandomSlugGenerator.randomSlugName()}`;
  const ociTargetSlug = `${releaseSlug}-oci`;

  let releaseSpaceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();

    // Visit a page first to ensure user/org is provisioned.
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );

    const api = new ApiHelper(page);

    // ── Release-enabled Space ──
    const releaseSpace = await api.createSpace({
      space: {
        Slug: releaseSlug,
        ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Environment: 'staging' },
      },
    });
    releaseSpaceId = (releaseSpace as { SpaceID: string }).SpaceID;

    const ociTarget = await api.createTarget({
      spaceId: releaseSpaceId,
      slug: ociTargetSlug,
    });
    const ociTargetId = (ociTarget as { TargetID: string }).TargetID;

    // Wire the Space to publish through the OCI Target.
    await api.updateSpace({
      spaceId: releaseSpaceId,
      space: { ReleaseTargetID: ociTargetId },
    });

    // A Unit assigned to the release Target — releaseBundleFiles only
    // bundles Units whose TargetID matches the Space's ReleaseTargetID
    // (internal/views/release_core.go).
    const releaseUnitResp = await hubApi.post(`/api/space/${releaseSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: {
        Slug: 'test-config',
        ToolchainType: 'Kubernetes/YAML',
        TargetID: ociTargetId,
      },
    });
    if (!releaseUnitResp.ok()) {
      throw new Error(
        `Failed to create release unit: ${releaseUnitResp.status()} ${await releaseUnitResp.text()}`,
      );
    }
    // POST /api/space/{spaceId}/unit returns UnitCreateOrUpdateResponseRead (config
    // Data and MutationSources split into their own APIs, #5140) — the created Unit
    // is under `.Unit`, not the response body itself.
    const releaseUnitBody = (await releaseUnitResp.json()) as { Unit: { UnitID: string } };
    const releaseUnitData = releaseUnitBody.Unit;

    const releaseYaml = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: test-config',
      'data:',
      '  replicas: "1"',
    ].join('\n');
    // Data is no longer a patchable Unit attribute (#5140) — written through the
    // dedicated PUT .../data endpoint, as raw text (not base64).
    await api.uploadUnitData({
      spaceId: releaseSpaceId,
      unitId: releaseUnitData.UnitID,
      body: releaseYaml,
    });

    const gatedUnits: [string, string][] = [
      [releaseSpaceId, releaseUnitData.UnitID],
    ];
    for (const [spaceId, unitId] of gatedUnits) {
      for (let i = 0; i < 100; i++) {
        const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
        if (resp.ok()) {
          const body = await resp.text();
          if (!body.includes('awaiting/triggers')) break;
        }
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

    try {
      await api.deleteSpace(releaseSpaceId, true);
    } catch {
      /* ignore */
    }

    await context.close();
  });

  // ── Publish → history update ──

  test('publish adds a new entry to the release history with no confirm dialog', async ({
    page,
  }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const releaseNode = page.locator('.react-flow__node').filter({ hasText: releaseSlug });
    await expect(releaseNode).toBeVisible({ timeout: 10000 });
    await releaseNode.click();

    // Release status/history — and the Release button itself (task #52) —
    // live behind the "Releases" tab; the Configuration tab is the pane
    // default and has no deploy-verb button for a release-enabled Space.
    await page.getByTestId('component-pane-tab-releases').click();

    // Publishing is offered from the unreleased view. Asked for rather than
    // assumed: this test passes today only because nothing has published
    // before it, and that is a property of its position in the block rather
    // than anything this test says about itself.
    await goToUnreleased(page);
    const releaseBtn = page.getByTestId('component-release-button');
    await expect(releaseBtn).toBeVisible({ timeout: 5000 });
    await expect(releaseBtn).toBeEnabled({ timeout: 5000 });

    // This is the first mutating test in this serial file — the release
    // history starts empty (no soft-delete rows, no fixture seeding). The
    // literal string is preserved verbatim from the pre-v7 empty state.
    await expect(page.getByTestId('release-empty')).toHaveText('No releases yet.', {
      timeout: 5000,
    });

    await releaseBtn.click();

    // RULE 11 — no confirm dialog anywhere in the flow: the click above
    // must go straight to the API call, never through a modal.
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Publish success: the empty state is replaced by the lane and its first
    // bar — asserted via the persistent lane rather than the 3s success flash
    // (transient text is a race-prone signal to poll for).
    await expect(page.getByText('No releases yet.')).toBeHidden({ timeout: 15000 });
    await expect(page.getByTestId('release-selectors')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('release-selector-a').click();
    await expect(page.locator('[data-testid="release-picker-option"][data-declared="false"]')).toHaveCount(1, {
      timeout: 5000,
    });
  });

  // ── Deploy-verb failure surfaces the error card ──
  //
  // Release is the only deploy verb a Component pane offers, so it is the one
  // whose failure has to surface. Route-mocked, so it publishes nothing and
  // leaves this serial file's release history untouched.
  test('displays the error card when the publish API fails', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const releaseNode = page.locator('.react-flow__node').filter({ hasText: releaseSlug });
    await expect(releaseNode).toBeVisible({ timeout: 10000 });
    await releaseNode.click();

    await page.getByTestId('component-pane-tab-releases').click();

    // Publishing is offered from the unreleased view, not from the latest
    // release's diff the pane opens on.
    await goToUnreleased(page);
    const releaseBtn = page.getByTestId('component-release-button');
    await expect(releaseBtn).toBeEnabled({ timeout: 5000 });

    // Intercept the publish call and return a server error
    await page.route(`**/api/space/${releaseSpaceId}/release`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"error":"Internal Server Error"}',
        });
      } else {
        await route.continue();
      }
    });

    await releaseBtn.click();

    // Scope to the error card's testid rather than a global getByText(/error/i),
    // which would otherwise match unrelated hidden text first in the DOM.
    await expect(page.getByTestId('component-error-card')).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// Releases v7 — the height-encoded lane
//
// Own release-enabled Space (own worker/target/unit), isolated from the
// suite above so its release HISTORY is entirely under this file's control:
// three published releases with a KNOWN field-level diff between each, plus a
// pending (unpublished) edit, so "what rel-1 introduced", "what rel-2
// introduced" and "what's unreleased" are DIFFERENT, individually assertable
// diffs — a pane that served one fixed diff for every selection cannot pass.
//
// NEVER assert a bar's pixel height. Height is the encoding, `data-fields` is
// the number it encodes, and only the number is a contract.
// ============================================================================

const HISTORY_APP_LABEL = `e2e-release-history-${RandomSlugGenerator.randomSlugName()}`;

test.describe('component release — height-encoded lane (v7)', () => {
  test.use({ storageState: 'authentication.json' });
  test.describe.configure({ mode: 'serial' });

  const historySlug = `e2e-hist-${RandomSlugGenerator.randomSlugName()}`;
  const historyTargetSlug = `${historySlug}-oci`;

  let historySpaceId: string;
  let historyUnitId: string;
  let rel1Num: number;
  let rel2Num: number;
  let rel3Num: number;

  // `region` never changes; it exists so `data` has a SECOND leaf — the
  // UNCHANGED sibling of `replicas`. That sibling is the probe for the Releases
  // pane's two rendering modes: by DEFAULT the pane draws changed paths only, so
  // `region` must be ABSENT from the tree, which is the whole of the contract
  // now that the pane renders changed paths only. It changes no count anywhere:
  // every count in this block is over CHANGED paths, and this path never
  // changes.
  const replicaYaml = (n: number) =>
    [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: hist-config',
      'data:',
      `  replicas: "${n}"`,
      '  region: "eu-west-1"',
    ].join('\n');

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());

    const api = new ApiHelper(page);

    const space = await api.createSpace({
      space: { Slug: historySlug, ComponentID: (await api.createComponent(HISTORY_APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Environment: 'staging' } },
    });
    historySpaceId = (space as { SpaceID: string }).SpaceID;

    const target = await api.createTarget({
      spaceId: historySpaceId,
      slug: historyTargetSlug,
    });
    const targetId = (target as { TargetID: string }).TargetID;

    await api.updateSpace({ spaceId: historySpaceId, space: { ReleaseTargetID: targetId } });

    const unitResp = await hubApi.post(`/api/space/${historySpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'hist-config', ToolchainType: 'Kubernetes/YAML', TargetID: targetId },
    });
    if (!unitResp.ok()) throw new Error(`Failed to create unit: ${unitResp.status()} ${await unitResp.text()}`);
    // POST /api/space/{spaceId}/unit returns UnitCreateOrUpdateResponseRead (config
    // Data and MutationSources split into their own APIs, #5140) — the created Unit
    // is under `.Unit`, not the response body itself.
    const unitBody = (await unitResp.json()) as { Unit: { UnitID: string } };
    historyUnitId = unitBody.Unit.UnitID;

    // Data is no longer a patchable Unit attribute (#5140) — written through the
    // dedicated PUT .../data endpoint, as raw text (not base64).
    async function setData(replicas: number): Promise<void> {
      await api.uploadUnitData({
        spaceId: historySpaceId,
        unitId: historyUnitId,
        body: replicaYaml(replicas),
      });
    }

    async function waitForGateClear(): Promise<void> {
      for (let i = 0; i < 100; i++) {
        const resp = await hubApi.get(`/api/space/${historySpaceId}/unit/${historyUnitId}`);
        if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // replicas=1 -> publish rel-1 (oldest release, no predecessor — every
    // field it bundled will read as new when selected).
    await setData(1);
    await waitForGateClear();
    const rel1 = await api.publishRelease({ spaceId: historySpaceId });
    rel1Num = (rel1 as { ReleaseNum: number }).ReleaseNum;

    // replicas=2 -> publish rel-2. Selecting rel-2 compares rel-1 -> rel-2:
    // exactly ONE field diff (replicas 1->2).
    await setData(2);
    await waitForGateClear();
    const rel2 = await api.publishRelease({ spaceId: historySpaceId });
    rel2Num = (rel2 as { ReleaseNum: number }).ReleaseNum;

    // replicas=3 -> publish rel-3, the current release.
    //
    // THE THIRD RELEASE EXISTS TO MAKE A NON-ADJACENT PAIR POSSIBLE. Two
    // consecutive releases are read as "what the newer one changed", so with
    // only two releases in the space every pair is adjacent and the other half
    // of that rule — a span between releases that are NOT consecutive — could
    // not be exercised at all. rel-1 against rel-3 is that case.
    await setData(3);
    await waitForGateClear();
    const rel3 = await api.publishRelease({ spaceId: historySpaceId });
    rel3Num = (rel3 as { ReleaseNum: number }).ReleaseNum;

    // replicas=4, NOT published — the pending/unreleased state. With nothing
    // selected the pane compares rel-3 -> head: exactly ONE field diff
    // (replicas 3->4), the same COUNT as each historical diff but a DIFFERENT
    // field — the three must never be confused.
    await setData(4);
    await waitForGateClear();

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    try {
      await api.deleteSpace(historySpaceId, true);
    } catch {
      /* ignore */
    }
    await context.close();
  });

  async function openReleasesTab(page: Page): Promise<void> {
    await navigateAndSelectApp(page, HISTORY_APP_LABEL);
    const node = page.locator('.react-flow__node').filter({ hasText: historySlug });
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();
    await page.getByTestId('component-pane-tab-releases').click();
  }

  // The comparison names itself in the two selectors, so the pane has no
  // sentence restating it and nothing below can disagree with it. What a
  // reader can still ask of a release — is it current, when did it ship, how
  // much did it change — is answered per row inside the picker.

  test('default state: the pane opens on the work that has not been released', async ({ page }) => {
    await openReleasesTab(page);

    // This fixture HAS unreleased work, so the pane opens on it: the working
    // configuration in the first slot, and NOTHING in the second.
    //
    // ONE END, NOT TWO. The comparison the pane runs is the working
    // configuration against the current release either way — a lone selection
    // is read against its own immediate predecessor — so seeding the second
    // slot named a release the pane was going to use regardless, and spent the
    // widest control on the surface saying it.
    await expect(page.getByTestId('release-selectors')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('release-selector-a')).toHaveAttribute('data-label', 'Working config', {
      timeout: 10000,
    });
    await expect(page.getByTestId('release-selector-b')).toHaveAttribute('data-label', '');
    // A PAIR WHOSE BASE IS ITS TARGET'S PREDECESSOR IS READ AS THE TARGET
    // ALONE, and here the target is the declared state — so the pane names the
    // unreleased work rather than calling it a net diff between two points.
    // UNCHANGED by the empty second slot, which is the whole point of it.
    await expect(page.getByTestId('release-notes')).toHaveAttribute('data-mode', 'declared');
    // One end is filled, so there is no pair to exchange yet.
    await expect(page.getByTestId('release-selector-swap')).toBeDisabled();

    // Every release is offerable, newest first, with the working configuration
    // pinned above them — ORDER is the contract, asserted positionally because
    // that is the part that can actually fail.
    await openPicker(page, 'a');
    const options = page.getByTestId('release-picker-option');
    await expect(options).toHaveCount(4);
    await expect(options.nth(0)).toHaveAttribute('data-declared', 'true');
    await expect(options.nth(1)).toHaveAttribute('data-label', `rel-${rel3Num}`);
    await expect(options.nth(2)).toHaveAttribute('data-label', `rel-${rel2Num}`);
    await expect(options.nth(3)).toHaveAttribute('data-label', `rel-${rel1Num}`);

    // rel-3 is the newest published release, so it — and only it — is current.
    await expect(options.nth(1)).toHaveAttribute('data-current', 'true');
    await expect(options.nth(2)).toHaveAttribute('data-current', 'false');
    await expect(options.nth(3)).toHaveAttribute('data-current', 'false');
    await page.keyboard.press('Escape');

    // Unreleased work is on screen, so the tab arrives ready to publish it.
    await expect(page.getByTestId('component-release-button')).toBeVisible();
    await expect(page.getByTestId('component-release-changes-chip')).toHaveText('1', { timeout: 10000 });

    // Selecting history takes the action row away entirely — not an empty bar,
    // which would advertise an action that does not exist in that state.
    await startEmpty(page);
    await choose(page, 'a', `rel-${rel2Num}`);
    await expect(page.getByTestId('component-release-button')).toHaveCount(0);
    await expect(page.getByTestId('component-release-changes-chip')).toHaveCount(0);
  });

  // The comparison a selection produces must be the SELECTED release's own, not
  // one fixed diff wearing different headers. rel-1 is the oldest release, so it
  // is compared against NOTHING; rel-2 has a predecessor, so it is compared
  // against rel-1. This test selects both, one at a time, and asserts the
  // RENDERED DIFF CONTENT of each — the changed path and both of its values — so
  // a bug that served the same diff for every release fails here even though the
  // hero label and the field COUNT (1 either way) would still look right.
  test('selecting a release WITH a predecessor renders that release\'s own comparison — two selections, two genuinely different diffs', async ({ page }) => {
    await openReleasesTab(page);
    await startEmpty(page);

    const unitBlock = page.getByTestId(`release-diff-unit-${historyUnitId}`);

    // ── rel-2: has a predecessor, so the comparison is rel-1 → rel-2 ──
    // A gesture, not the arrival state: the pane opens on rel-3 against rel-2.
    await ensure(page, 'a', `rel-${rel2Num}`);
    await expect(page.getByTestId('release-selector-a')).toHaveAttribute('data-label', `rel-${rel2Num}`);
    // WHICH RELEASE IS CURRENT IS ASSERTED, NOT ASSUMED. rel-3 is the newest
    // published release, so rel-2 is superseded and wears no mark; the readout
    // no longer spends a word on either, so the mark is the only surface
    // carrying it. Stating both halves means a change to the fixture's depth
    // fails with something that names the cause rather than with a missing
    // element.
    await expect(
      page.getByTestId('release-selector-a').getByTestId('release-current-badge'),
    ).toHaveCount(0);
    // And the release that IS current, read from the picker so the comparison
    // under test is not disturbed to find out.
    await openPicker(page, 'b');
    await expect(option(page, `rel-${rel3Num}`)).toHaveAttribute('data-current', 'true');
    await expect(option(page, `rel-${rel2Num}`)).toHaveAttribute('data-current', 'false');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('release-picker-b')).toHaveCount(0);

    // The actual rendered diff, not a header label: `data.replicas` moved 1 → 2,
    // and BOTH sides are on screen. The shared `TreeDiffSection` paints the old
    // side on red and the new side on green; the Releases pane opts into
    // `srValuePrefix`, which renders a visually-hidden "removed: "/"added: "
    // INSIDE each value span so the distinction is never colour-alone. The value
    // cells are addressed by testid rather than by text: with the prefix span
    // nested inside the value span inside two wrapper boxes, several ancestors
    // share the same exact text and a bare `getByText` would trip strict mode.
    //
    // Asserting the COMPLETE ordered list (not just "is visible") also proves
    // there is exactly ONE changed field in this unit — strictly stronger than
    // the two presence probes this replaces.
    await expect(unitBlock).toBeVisible({ timeout: 10000 });
    await expect(unitBlock).toContainText('replicas');
    const oldVals = unitBlock.getByTestId('release-diff-old-value');
    const newVals = unitBlock.getByTestId('release-diff-new-value');
    await expect(oldVals).toHaveText(['removed: 1']);
    await expect(newVals).toHaveText(['added: 2']);
    await expect(oldVals).toBeVisible();
    await expect(newVals).toBeVisible();

    // The tree groups by dotted segment: `data` is a folder row, not a flat
    // `data.replicas` path. Matched anchored because `metadata` — the document's
    // other folder — contains "data" as a substring.
    const dataFolder = unitBlock.getByTestId('release-diff-folder').filter({ hasText: /^data$/ });
    await expect(dataFolder).toHaveCount(1);

    // The pane draws changed paths only, so the unchanged sibling `region`
    // must NOT be on screen. Not a vacuous zero: the lines above have already
    // proved this unit block is rendered and painting `data.replicas` 1 → 2.
    await expect(unitBlock).not.toContainText('eu-west-1');
    await expect(unitBlock.getByTestId('release-diff-context-value')).toHaveCount(0);

    // Restores the old M3 assertion on the surface that now owns expand/collapse:
    // the chevron is drawn AT REST, not revealed on hover. `toBeVisible` alone
    // would not catch the usual hover-only implementation (opacity 0 counts as
    // visible to Playwright), so the resting opacity is asserted too.
    const chevron = dataFolder.getByTestId('release-diff-chevron');
    await expect(chevron).toBeVisible();
    await expect(chevron).toHaveCSS('opacity', '1');

    // The folder is a real disclosure control, not a mouse-only div: it takes
    // focus, toggles on Enter, and reports its state to assistive technology.
    // The previous renderer got this from native <details>/<summary>.
    await expect(dataFolder).toHaveAttribute('aria-expanded', 'true');
    await dataFolder.focus();
    await expect(dataFolder).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dataFolder).toHaveAttribute('aria-expanded', 'false');
    await expect(newVals).toHaveCount(0); // collapsed really hides the fields
    await page.keyboard.press('Enter');
    await expect(dataFolder).toHaveAttribute('aria-expanded', 'true');
    await expect(newVals).toHaveText(['added: 2']);

    // rel-2's unit is not an addition, so the never-released badge is absent —
    // the wording that distinguished the two comparisons in the pre-v7 UI.
    await expect(unitBlock.getByTestId('unreleased-unit-badge')).toHaveCount(0);

    // ── rel-1: the oldest release, compared against nothing ──
    // rel-1's own count resolves independently of rel-2's, and its diff cannot
    // render before it does.
    await choose(page, 'a', `rel-${rel1Num}`);
    // rel-1 has no predecessor. The pane no longer says so in words — the row
    // that carried the verb is gone — so the fact survives only in the rendered
    // diff: the whole unit reads as ADDED, asserted below.
    await expect(page.getByTestId('release-selector-a')).toHaveAttribute('data-label', `rel-${rel1Num}`);
    // …and rel-1 is superseded too, so it gets no mark either. The
    // current/superseded distinction the readout used to spell out in words is
    // asserted against rel-3 in the picker above, which is the release that
    // actually holds it.
    await expect(page.getByTestId('release-selector-a').getByTestId('release-current-badge')).toHaveCount(0);

    // The SAME unit block, a genuinely different comparison: the whole unit
    // reads as added, replicas is 1 (rel-1's value, not rel-2's 2), and nothing
    // was removed because there was no old side to remove it from.
    await expect(unitBlock.getByTestId('unreleased-unit-badge')).toHaveText(
      `added in rel-${rel1Num}`,
      { timeout: 10000 },
    );
    const rel1Added = newVals.filter({ hasText: /^added: 1$/ });
    await expect(rel1Added).toHaveCount(1);
    await expect(rel1Added).toBeVisible();
    await expect(newVals.filter({ hasText: /^added: 2$/ })).toHaveCount(0);
    // "Nothing was removed" is now asserted over EVERY old-side cell rather than
    // over the single string `removed: 1`. rel-1 has no predecessor, so the diff
    // builder gives each of its fields the absent-sentinel old value `-`; the
    // assertion is that NO old-side cell carries anything else. That rules out
    // every real removal, not just the one the previous line named.
    await expect(oldVals.filter({ hasNotText: /^removed: -$/ })).toHaveCount(0);

    // The per-unit header names the unit. It renders as an anchor whose
    // accessible text ends with a visually-hidden " (opens unit details in a new
    // tab)", so match the slug as a substring rather than as exact text.
    await expect(page.getByTestId(`release-diff-unit-link-${historyUnitId}`)).toContainText(
      'hist-config',
    );
  });

  // ── Orientation: the green side is the NEWER value, whichever bar was clicked first ──
  //
  // The reported bug: a span taken in click order ran newest → oldest, so the
  // green "added" column showed the OLDER value and the red "removed" column
  // the NEWER one — the whole diff read backwards. The pane now normalises the
  // pair by ReleaseNum at ONE point before the comparison is derived, and the
  // readout, the lane's A/B markers and the diff panel all read that one value.
  //
  // The fixture makes the two directions distinguishable: rel-1 has
  // replicas="1" and rel-2 has replicas="2", so a reversed comparison would
  // paint `removed: 2` / `added: 1` — a genuinely different, and wrong, pair of
  // strings from the ones asserted below. This is why the assertions are on
  // CELL CONTENT and not on the header labels alone.

  /**
   * Collapse runs of whitespace, exactly as `toHaveText` does before comparing.
   *
   * Every raw-text read below MUST go through this. The value cells render an
   * `SrOnly` prefix — `<SrOnly>removed: </SrOnly>1` — and `SrOnly` is
   * `position: absolute`, so it leaves the layout flow and `innerText` reports
   * `"removed:\n1"`. That newline is a rendering artefact of a correctly hidden
   * label, not a difference in the value, so it must not reach an assertion.
   */
  const normaliseText = (s: string) => s.replace(/\s+/g, ' ').trim();

  /**
   * The span a click order produces, read off the surfaces that must agree.
   *
   * The rendered CELLS only. The row that named the comparison in words is
   * gone, so the diff itself is the whole of what a reader can compare.
   */
  async function readSpan(page: Page, unitBlock: Locator) {
    return {
      oldValues: (await unitBlock.getByTestId('release-diff-old-value').allInnerTexts()).map(normaliseText),
      newValues: (await unitBlock.getByTestId('release-diff-new-value').allInnerTexts()).map(normaliseText),
    };
  }

  test('a span filled in REVERSE order is the identical comparison — older on red, newer on green', async ({
    page,
  }) => {
    await openReleasesTab(page);
    await startEmpty(page);

    const unitBlock = page.getByTestId(`release-diff-unit-${historyUnitId}`);

    // ── FORWARD: the older release in the first slot ──
    // rel-1 against rel-3, skipping rel-2: consecutive releases are read as
    // what the newer one changed, so only a non-adjacent pair is a span whose
    // orientation is worth testing.
    await choose(page, 'a', `rel-${rel1Num}`);
    await choose(page, 'b', `rel-${rel3Num}`);
    await expect(page.getByTestId('release-notes')).toHaveAttribute('data-mode', 'span');
    await expect(unitBlock.getByTestId('release-diff-new-value')).toHaveText(['added: 3']);
    const forward = await readSpan(page, unitBlock);

    // The diff reads older → newer: rel-1's value is what was REMOVED and
    // rel-3's is what was ADDED. Which slot holds which end is named by the
    // selectors, asserted separately; the cells are what carry the direction.
    expect(forward.oldValues).toEqual(['removed: 1']);
    expect(forward.newValues).toEqual(['added: 3']);

    // ── REVERSE: the same two releases, the newer one in the first slot ──
    // Which slot holds which end is the reader's choice; the comparison is
    // not. The slots no longer show the normalised order, so the diff itself
    // is the surface that has to agree.
    //
    // Reached by choosing the other slot's release, which is what a reader
    // does when they mean "these two, the other way round". It reverses the
    // pair rather than refusing.
    await choose(page, 'a', `rel-${rel3Num}`);
    // The ends really exchanged. Without this a pick that did NOTHING would
    // satisfy every assertion below, since an unchanged comparison is exactly
    // what they check for.
    await expect(page.getByTestId('release-selector-a')).toHaveAttribute('data-label', `rel-${rel3Num}`);
    await expect(page.getByTestId('release-selector-b')).toHaveAttribute('data-label', `rel-${rel1Num}`);
    await expect(page.getByTestId('release-notes')).toHaveAttribute('data-mode', 'span');
    await expect(unitBlock.getByTestId('release-diff-new-value')).toHaveText(['added: 3']);
    const reverse = await readSpan(page, unitBlock);

    // Not "also plausible" — identical to the forward reading, on every
    // surface that carries the direction.
    expect(reverse).toEqual(forward);

    // Spelled out, so a future regression names itself rather than reporting an
    // opaque object mismatch: green is still the NEWER release's value.
    expect(reverse.oldValues).toEqual(['removed: 1']);
    expect(reverse.newValues).toEqual(['added: 3']);
  });
});

// ============================================================================
// Container image rows in the release diff
//
// An image reference is registry/namespace/repository:tag@digest, and in a bump
// everything left of the tag is identical on both sides. How a row reads (the
// token diff, the meter, the class word) is decided by the row model, covered
// without a browser in the image-rows spec; this block proves a real published
// release delivers every container to the rows.
// ============================================================================

const IMAGE_APP_LABEL = `e2e-img-${RandomSlugGenerator.randomSlugName()}`;

test.describe('component release — container image rows', () => {
  test.use({ storageState: 'authentication.json' });
  test.describe.configure({ mode: 'serial' });

  const imageSlug = `e2e-img-${RandomSlugGenerator.randomSlugName()}`;
  let imageSpaceId: string;
  let rel2Num: number;

  /**
   * Four containers, each exercising a different class of move between the two
   * releases, plus one non-image change so the tree below still has content.
   */
  function deploymentYaml(bump: boolean): string {
    const api = bump ? 'v0.4.16' : 'v0.4.15';
    const otel = bump ? 'v2.0.0' : 'v1.9.2';
    const envoyHost = bump ? 'quay.io' : 'ghcr.io';
    return [
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:',
      `  name: ${imageSlug}`,
      'spec:',
      `  replicas: ${bump ? 2 : 1}`,
      '  template:',
      '    spec:',
      '      containers:',
      '        - name: api',
      `          image: ghcr.io/confighubai/api:${api}`,
      '        - name: sidecar',
      '          image: ghcr.io/confighubai/sidecar:v2.3.1',
      '        - name: otel',
      `          image: ghcr.io/confighubai/otel:${otel}`,
      '        - name: envoy',
      `          image: ${envoyHost}/confighubai/envoy:v1.30.0`,
    ].join('\n');
  }

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);

    const space = await api.createSpace({
      space: { Slug: imageSlug, ComponentID: (await api.createComponent(IMAGE_APP_LABEL)).ComponentID, Labels: { Owner: 'E2E' } },
    });
    imageSpaceId = (space as { SpaceID: string }).SpaceID;

    const target = await api.createTarget({ spaceId: imageSpaceId, slug: `${imageSlug}-oci` });
    const targetId = (target as { TargetID: string }).TargetID;
    await api.updateSpace({ spaceId: imageSpaceId, space: { ReleaseTargetID: targetId } });

    const unitResp = await hubApi.post(`/api/space/${imageSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'image-config', ToolchainType: 'Kubernetes/YAML', TargetID: targetId },
    });
    if (!unitResp.ok()) throw new Error(`unit: ${unitResp.status()} ${await unitResp.text()}`);
    const unitId = ((await unitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;

    async function setData(bump: boolean): Promise<void> {
      await api.uploadUnitData({ spaceId: imageSpaceId, unitId, body: deploymentYaml(bump) });
      for (let i = 0; i < 100; i++) {
        const resp = await hubApi.get(`/api/space/${imageSpaceId}/unit/${unitId}`);
        if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // rel-1 is the baseline; the tests select rel-2, whose comparison is
    // rel-1 -> rel-2, so only rel-2's number is needed to address the lane.
    await setData(false);
    await api.publishRelease({ spaceId: imageSpaceId });
    await setData(true);
    rel2Num = ((await api.publishRelease({ spaceId: imageSpaceId })) as { ReleaseNum: number }).ReleaseNum;

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    try {
      await new ApiHelper(page).deleteSpace(imageSpaceId, true);
    } catch {
      /* ignore */
    }
    await context.close();
  });

  /** Open the diff for rel-1 -> rel-2, which is where every image row lives. */
  async function openImageDiff(page: Page): Promise<void> {
    await page.goto(`/components?app=${encodeURIComponent(IMAGE_APP_LABEL)}`);
    await page.waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 }).catch(() => {});
    await expect(page.getByText(IMAGE_APP_LABEL)).toBeVisible({ timeout: 20000 });
    await page.getByText(IMAGE_APP_LABEL).click();
    const node = page.locator('.react-flow__node').filter({ hasText: imageSlug });
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();
    await page.getByTestId('component-pane-tab-releases').click();
    await expect(page.getByTestId('release-selectors')).toBeVisible({ timeout: 20000 });
    await ensure(page, 'a', `rel-${rel2Num}`);
    await expect(page.getByTestId('release-diff-image-row').first()).toBeVisible({ timeout: 20000 });
  }

  /** The row whose container name matches, by name rather than by position. */
  function imageRow(page: Page, container: string): Locator {
    return page.getByTestId('release-diff-image-row').filter({ hasText: container });
  }

  /**
   * The renderer cannot satisfy this on its own: it proves the real chain — a
   * published release, the diff computed from two revisions, the panel's own
   * adapter — actually delivers container image paths to the rows.
   */
  test('every container gets one row, including the one that did not move', async ({ page }) => {
    await openImageDiff(page);
    // Four containers, four rows — the unchanged one included, because a
    // container left behind while its neighbours moved is worth seeing.
    await expect(page.getByTestId('release-diff-image-row')).toHaveCount(4);
    for (const name of ['api', 'sidecar', 'otel', 'envoy']) {
      await expect(imageRow(page, name)).toHaveCount(1);
    }
  });
});
