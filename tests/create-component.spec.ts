// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Create Component Wizard E2E Test
//
// Drives the "New component" wizard (CreateComponentPane.tsx, opened from the
// Header add-button on /components) through its happy path: name the
// component, pick an owner, insert a sample multi-resource manifest on the
// Units step, exercise the granularity control, confirm the Review step
// reports an honest object count (a base Space + N units — never a phantom
// "component" object), then Create and verify the success receipt.
//
// Also covers, end to end, what Step 0's "Advanced" disclosure writes: a
// label reaches the created Space, the Space slug override replaces the
// derived `<name>-base` slug, and the change description is recorded on every
// Unit the create writes.
// Downstream-variant creation needs a Target fixture and isn't covered here.
//
// CI CAVEAT: playwright.yml runs `--only-changed=origin/main`, so a UI-only
// PR may not run this spec in CI at all. Green CI is not proof this passes —
// run it locally against a live server before trusting it.
// ============================================================================

test.describe('create component flow', () => {
  test.use({ storageState: 'authentication.json' });

  // Unique per run so parallel workers / repeat runs never collide on the
  // derived `<name>-base` Space slug.
  const componentName = `pw-checkout-${RandomSlugGenerator.randomSlugName()}`;
  const baseSlug = `${componentName}-base`;
  const slugOverride = `pw-override-${RandomSlugGenerator.randomSlugName()}`;
  const changeDescription = 'Imported the first version of the checkout API';
  const ownerName = `pw-owner-${RandomSlugGenerator.randomSlugName()}`;

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);

    try {
      const space = await api.getSpaceBySlug(slugOverride);
      await api.deleteSpace(space.SpaceID, true);
    } catch {
      // Space may not exist if the test failed before Create — nothing to clean up.
    }
    // After its Space. The org has a Component quota, so a run must not leave
    // its Component behind.
    try {
      const component = await api.getComponentBySlug(componentName);
      await api.deleteComponent(component.ComponentID as string);
    } catch {
      // The Component may not exist if the test failed before Create.
    }

    await context.close();
  });

  test('walks through the New component wizard and creates a base space with sample units', async ({
    page,
  }) => {
    await page.goto('/components');
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    // Not `getByText('Components', { exact: true })`: the left nav now has a
    // persistent top-level "Components" item too, so that text is ambiguous
    // on this page. Wait on the add-button instead — unique, and it's what
    // this test clicks next anyway.
    await expect(page.getByRole('button', { name: 'New component' })).toBeVisible({ timeout: 10000 });

    // Open the wizard via the Header's add-button.
    await page.getByRole('button', { name: 'New component' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('New component', { exact: true })).toBeVisible({ timeout: 10000 });

    // ── Step 1: Component ──────────────────────────────────────────────
    await dialog.getByLabel('Component name').fill(componentName);

    // "New owner" is always present regardless of which owners already exist
    // in this org, so it's a stable way to pick an owner without depending
    // on org-specific seed data.
    await dialog.getByRole('button', { name: 'New owner' }).click();
    await dialog.getByLabel('New owner').fill(ownerName);

    // Base-space slug preview reflects the derived `<name>-base` slug.
    await expect(dialog.getByText(baseSlug)).toBeVisible({ timeout: 5000 });

    // Labels live in Step 0's "Advanced" disclosure — the only end-to-end
    // proof that relocation didn't silently drop them: verified against the
    // real created Space below, not just that the fields exist.
    await dialog.getByRole('button', { name: /Advanced \(optional\)/ }).click();
    await dialog.getByRole('button', { name: 'Add label' }).click();
    await dialog.getByLabel('Key').fill('tier');
    await dialog.getByLabel('Value').fill('backend');
    await dialog.getByTestId('create-component-space-slug-input').getByRole('textbox').fill(slugOverride);
    await dialog
      .getByTestId('create-component-change-description-input')
      .getByRole('textbox')
      .fill(changeDescription);

    // What the create actually sends for each Unit, rather than only what it renders.
    const unitRequests: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/space\/[^/]+\/unit/.test(r.url())) {
        unitRequests.push(r.postData() ?? '');
      }
    });

    // ── Jump to Units via the stepper tabs ──
    await dialog.getByRole('button', { name: 'Units' }).click();
    await expect(dialog.getByText('Add starter units')).toBeVisible({ timeout: 10000 });

    // Insert the built-in sample manifest — 3 resources: Deployment, Service, ConfigMap.
    await dialog.getByRole('button', { name: 'Insert a sample manifest' }).click();

    await expect(dialog.getByText('Detected 3 resources')).toBeVisible({ timeout: 10000 });

    // "minimal" (the CLI default) is recommended and selected by default —
    // the server (plan.go groupUnits) splits into buckets: the plain
    // ConfigMap becomes its own Unit and the Deployment + Service land in the
    // "main" Unit, so the sample collapses to 2 units (not 3) without
    // touching the granularity control at all.
    const granularityGroup = dialog.getByRole('radiogroup', { name: 'Granularity' });
    await expect(granularityGroup).toBeVisible({ timeout: 5000 });
    await expect(
      dialog.getByText('these 3 resources are grouped into 2 server-named units'),
    ).toBeVisible({ timeout: 5000 });

    // Switch to "per-resource" — 3 units.
    await granularityGroup.getByRole('radio', { name: 'per-resource' }).click();
    await expect(dialog.getByText('Units to create · 3')).toBeVisible({ timeout: 5000 });

    // ── Step 4: Review ──────────────────────────────────────────────────
    await dialog.getByRole('button', { name: 'Review' }).click();
    await expect(dialog.getByText('Review & create')).toBeVisible({ timeout: 10000 });

    // Honest object count: "1 base space + 3 units" — never a phantom "1
    // component" object being created.
    await expect(dialog.getByText('1 base space + 3 units')).toBeVisible({ timeout: 5000 });

    // ── Create ──────────────────────────────────────────────────────────
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    // ── Success receipt ─────────────────────────────────────────────────
    await expect(dialog.getByText(`${componentName} created`)).toBeVisible({ timeout: 20000 });
    await expect(dialog.getByText(slugOverride, { exact: true })).toBeVisible({ timeout: 5000 });
    // Per-resource unit slugs match the server's resourceSlug (`kind-name`):
    // Deployment/checkout-api → deployment-checkout-api, etc.
    for (const unitSlug of [
      'deployment-checkout-api',
      'service-checkout-api',
      'configmap-checkout-api-config',
    ]) {
      await expect(dialog.getByText(unitSlug, { exact: true })).toBeVisible({ timeout: 5000 });
    }

    // ── What Step 0's "Advanced" disclosure wrote ────────────────────────
    // Read the real created Space back: the override is the Space that
    // exists and the derived default is not, the typed label survived, and
    // the Space is in the new Component. The owner is set on the Component,
    // not the Space.
    const api = new ApiHelper(page);
    await expect(api.getSpaceBySlug(baseSlug)).rejects.toThrow();
    const createdSpace = (await api.getSpaceBySlug(slugOverride)) as {
      SpaceID: string;
      Slug: string;
      ComponentID?: string;
      Labels?: Record<string, string>;
    };
    const createdComponent = await api.getComponentBySlug(componentName);
    expect(createdSpace.Labels?.tier).toBe('backend');
    expect(createdSpace.ComponentID).toBe(createdComponent.ComponentID);
    expect(createdComponent.Labels?.Owner).toBe(ownerName);
    expect(createdSpace.Labels?.Owner).toBeUndefined();

    // The change description is recorded on every Unit the create writes.
    expect(unitRequests.length).toBeGreaterThan(0);
    expect(unitRequests.every((b) => b.includes(changeDescription))).toBe(true);
  });
});
