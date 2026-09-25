// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Regression guards for `ComponentValuesSection`'s U11 readOnly changes,
// scoped to AUTO MODE (`readOnly` falsy — the default every existing caller
// already uses). The read-only path is not reachable by a live page: nothing
// passes `readOnly={true}` anywhere in the app today.
//
// This file exists because U11 rewrote real branches inside a component every
// page already depends on, and "auto mode is unaffected" is a claim, not a
// fact, until something proves it. Two things are covered, chosen for cost
// vs. risk rather than completeness — see the commit message for the third
// (staging stays sticky across the Upgradable tab's clear signal) that was
// deliberately deferred: `git show 123700bc9` touches zero lines of that
// mechanism, so a control there would verify code this change did not touch.
//
//   1. The folder kebab ("Add row above/inside/below", "Remove group & N
//      keys") still renders in auto mode. `hasFolderEditHandlers` gained a
//      `!readOnly &&` guard at D9.3 — the only one of its class genuinely
//      unexercised in either mode before this file, since the existing
//      staging fixture (component-staging-narrow.spec.ts) is a flat
//      ConfigMap with no folder rows at all.
//   2. A row that is BOTH upgradable AND manually edited resolves to 'edit',
//      not 'upgrade' — rule 10's precedence. `rowChangeType`'s auto branch
//      was physically re-indented under U11's new outer readOnly ternary; a
//      nested-ternary restructure is exactly where an operator-precedence
//      slip hides silently. component-staging-narrow proves the
//      `hasStagedEdit ? 'edit'` arm on a PLAIN key, which has no upgrade
//      available and so never exercises the precedence against 'upgrade' —
//      this is the one arm nothing else reaches.

import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const APP_LABEL = `e2e-cvs-readonly-${RandomSlugGenerator.randomSlugName()}`;

async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
}

test.describe('ComponentValuesSection auto-mode controls for U11', () => {
  test.use({ storageState: 'authentication.json' });

  // ── Fixture 1: a nested Deployment, single Space, no upstream — just needs
  // a folder row to click a kebab on. Mirrors the rollout fixture's own `app`
  // resource shape (spec.template.spec.containers.0.*) on purpose, since the
  // same nested fixture is needed again for the rollout-side driven-gesture
  // test at U3 (§18.2 N8) — this is not throwaway. ──
  const folderSlug = `e2e-cvs-folder-${RandomSlugGenerator.randomSlugName()}`;
  let folderSpaceId: string;

  // ── Fixture 2: the exact component-staging-narrow shape (dev with 10 keys,
  // only k0/k5 differ, prod cloned) — reused rather than reinvented, since it
  // already produces a genuinely upgradable pair with plain siblings. ──
  const devSlug = `e2e-cvs-edit-dev-${RandomSlugGenerator.randomSlugName()}`;
  const prodSlug = `e2e-cvs-edit-prod-${RandomSlugGenerator.randomSlugName()}`;
  let devSpaceId: string;
  let prodSpaceId: string;

  const DATA_KEYS = Array.from({ length: 4 }, (_, i) => `k${i}`);
  function buildYaml(changed: Set<number>): string {
    const lines = ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: edit-wins-config', 'data:'];
    DATA_KEYS.forEach((key, i) => {
      const v = changed.has(i) ? `${key}-CHANGED` : `${key}-base`;
      lines.push(`  ${key}: "${v}"`);
    });
    return lines.join('\n');
  }

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok()
    );
    const api = new ApiHelper(page);

    // ── Fixture 1 ──
    // A Unit needs a Target for its Space to render as a Deployment node in
    // the graph — without one it renders as a Base, and a Base's side pane
    // never mounts the value tree at all (0 leaf rows, 0 kebabs). Verified by
    // probing a target-less version of this fixture before writing this one.
    const folderSpace = await api.createSpace({
      space: { Slug: folderSlug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E' } } as never,
    });
    folderSpaceId = (folderSpace as { SpaceID: string }).SpaceID;
    const folderTargetSlug = `${folderSlug}-tgt`;
    const folderWorkerResp = await hubApi.post(`/api/space/${folderSpaceId}/bridge_worker`, {
      params: { allow_exists: 'true' },
      data: {
        Slug: `e2e-cvs-folder-worker-${RandomSlugGenerator.randomSlugName()}`,
        ProvidedInfo: {
          BridgeWorkerInfo: {
            SupportedConfigTypes: [
              { ProviderType: 'Kubernetes', ToolchainType: 'Kubernetes/YAML', LiveStateType: 'Kubernetes/YAML' },
            ],
          },
        },
      },
    });
    if (!folderWorkerResp.ok()) {
      throw new Error(`folder worker: ${folderWorkerResp.status()} ${await folderWorkerResp.text()}`);
    }
    const folderBridgeWorkerId = ((await folderWorkerResp.json()) as { BridgeWorkerID: string }).BridgeWorkerID;
    const folderTargetResp = await hubApi.post(`/api/space/${folderSpaceId}/target`, {
      params: { allow_exists: 'true' },
      data: { Slug: folderTargetSlug, BridgeWorkerID: folderBridgeWorkerId, ToolchainType: 'Kubernetes/YAML', ProviderType: 'Kubernetes' },
    });
    if (!folderTargetResp.ok()) {
      throw new Error(`folder target: ${folderTargetResp.status()} ${await folderTargetResp.text()}`);
    }
    const folderTargetData = (await folderTargetResp.json()) as { TargetID: string };

    // `resources.limits` needs TWO children (memory AND cpu) to render as its
    // own folder row — a single-child chain collapses into the leaf's own
    // display and never gets a folder header or a kebab at all. Confirmed by
    // probing a one-child version of this fixture before writing this one.
    const deploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: e2e-folder-target
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          image: ghcr.io/confighubai/confighub:v0.2.19
          resources:
            limits:
              memory: 512Mi
              cpu: 500m
`;
    const folderUnitResp = await hubApi.post(`/api/space/${folderSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: {
        Slug: 'app',
        ToolchainType: 'Kubernetes/YAML',
        TargetID: folderTargetData.TargetID,
      },
    });
    if (!folderUnitResp.ok()) {
      throw new Error(`folder unit: ${folderUnitResp.status()} ${await folderUnitResp.text()}`);
    }
    // POST /api/space/{spaceId}/unit returns UnitCreateOrUpdateResponseRead (config
    // Data and MutationSources split into their own APIs, #5140) — the created Unit
    // is under `.Unit`, not the response body itself. Data is no longer a patchable
    // Unit attribute either — written through the dedicated PUT .../data endpoint,
    // as raw text (not base64).
    const folderUnitData = ((await folderUnitResp.json()) as { Unit: { UnitID: string } }).Unit;
    await api.uploadUnitData({ spaceId: folderSpaceId, unitId: folderUnitData.UnitID, body: deploymentYaml });

    // ── Fixture 2 ──
    const devSpace = await api.createSpace({
      space: { Slug: devSlug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E' } } as never,
    });
    devSpaceId = (devSpace as { SpaceID: string }).SpaceID;
    const prodSpace = await api.createSpace({
      space: { Slug: prodSlug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E' } } as never,
    });
    prodSpaceId = (prodSpace as { SpaceID: string }).SpaceID;

    const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'edit-wins-config', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
    // POST /api/space/{spaceId}/unit returns UnitCreateOrUpdateResponseRead (config
    // Data and MutationSources split into their own APIs, #5140) — the created Unit
    // is under `.Unit`, not the response body itself.
    const devUnitData = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit;
    // Data is no longer a patchable Unit attribute either — written through the
    // dedicated PUT .../data endpoint, as raw text (not base64).
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: buildYaml(new Set()) });

    const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
      params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitData.UnitID },
      data: { Slug: 'edit-wins-config', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
    // Same wrapper-unwrap fix as devUnitData above.
    const prodUnitData = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

    // Bump dev so k0 becomes upgradable in prod.
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: buildYaml(new Set([0])) });

    // Wait for triggers to clear on both units, same as component-staging-narrow.
    for (const [spaceId, unitId] of [
      [devSpaceId, devUnitData.UnitID],
      [prodSpaceId, prodUnitData.UnitID],
    ] as const) {
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
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok()
    );
    const api = new ApiHelper(page);
    for (const id of [folderSpaceId, prodSpaceId, devSpaceId]) {
      try {
        await api.deleteSpace(id, true);
      } catch {
        /* best effort */
      }
    }
    await context.close();
  });

  test('the folder kebab still offers Add-row and Remove-group in auto mode', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    // Filter by the TARGET slug, not the Space slug — the node's own label is
    // its target, matching component-staging-narrow's own pattern.
    const node = page.locator('.react-flow__node').filter({ hasText: `${folderSlug}-tgt` });
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();

    // `resources.limits` (two children: memory, cpu) is a genuine folder row.
    // Its own kebab lives TWO DOM levels above the exact "limits" text node —
    // the text itself is not the hoverable/clickable row, and the label's
    // immediate wrapper isn't either. Confirmed by walking ancestors on a
    // probe copy of this fixture before writing this locator.
    const folderRow = page.getByText('limits', { exact: true }).locator('xpath=../..');
    await expect(folderRow).toBeVisible({ timeout: 10000 });
    await folderRow.hover();

    const kebab = folderRow.locator('.kebab-btn').first();
    await expect(kebab).toBeVisible({ timeout: 5000 });
    await kebab.click();

    // hasFolderEditHandlers gates the WHOLE kebab, not individual items — so
    // its presence at all is the assertion U11 could have broken. Once open,
    // all four actions must be present (whether individually enabled is a
    // separate, pre-existing concern this file is not testing).
    await expect(page.getByText('Add row above')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Add row inside')).toBeVisible();
    await expect(page.getByText('Add row below')).toBeVisible();
    await expect(page.getByText(/Remove group/)).toBeVisible();
  });

  test('a path that is both upgradable and edited resolves to edit, not upgrade', async ({
    page,
  }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    // The pane defaults to the Upgradable tab when upgrades exist — k0 arrives
    // already auto-staged (rule 5), classified 'upgrade'.
    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });
    const leafRow = page.getByTestId('component-leaf-row').filter({ hasText: 'k0' });
    await expect(async () => {
      expect(await leafRow.count()).toBe(1);
    }).toPass({ timeout: 15000 });
    await expect(leafRow).toHaveAttribute('data-change-type', 'upgrade', { timeout: 10000 });

    // Manually edit the SAME row's value. Precedence claim: hasStagedEdit is
    // checked before falling through to 'upgrade' in the auto branch, so this
    // must flip the classification to 'edit' rather than leaving it 'upgrade'
    // or producing something the rewritten ternary never intended.
    const editedValue = `e2e-edit-wins-${RandomSlugGenerator.randomSlugName()}`;
    // The row is already staged (pill-staged), so `.current-text` is hidden by
    // CSS and `.current-preview` is what's actually rendered — a
    // `.current-text, .current-preview` selector resolves both in DOM order
    // regardless of which one CSS is showing, and picks the hidden one first.
    // Confirmed on a probe copy of this fixture before writing this locator.
    await leafRow.locator('.current-preview').click();
    const editInput = page.getByTestId('field-edit-input');
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.fill(editedValue);
    await editInput.press('Enter');

    await expect(leafRow).toHaveAttribute('data-change-type', 'edit', { timeout: 10000 });
    await expect(leafRow.locator('.current-preview')).toContainText(editedValue, { timeout: 5000 });

    // And it is still staged (an edit does not un-stage the row) — the
    // control side of the claim: this is not "edit replaces upgrade", it is
    // "edit outranks upgrade while both are true of the same row".
    await expect(leafRow.locator('.pill-group.pill-staged')).toHaveCount(1);
  });
});
