// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Locator, type Page } from '@playwright/test';
import { test, expect } from './fixtures/test';

import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Create Component Wizard — upload settings
//
// Covers the OCI panel's per-unit labels and annotations
// (CreateComponentPane.tsx, OciSourcePanel.tsx, ociUpload.ts): each row lands
// in the map its Label/Annotation toggle names, and the preview and the create
// both carry what is on screen, not what a row held when it was added. Which
// edits keep a preview and which discard it is covered without a browser in
// create-component-oci-preview-key.pure.spec.ts.
//
// No registry is reachable from a test runner — the server's private-network
// guard blocks local ones — so the preview and create responses are served by
// `page.route`. The REQUEST bodies asserted on are still built entirely by
// application code, which is what these tests are about.
//
// CI CAVEAT: playwright.yml runs `--only-changed=origin/main`, so a UI-only
// PR may not run this spec in CI at all. Green CI is not proof this passes —
// run it locally against a live server before trusting it.
// ============================================================================

/** A dry-run upload result the OCI panel accepts as a good preview. */
const FAKE_PREVIEW = {
  SourceDigest: 'sha256:feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface',
  Components: [
    {
      Name: 'fake',
      SkippedSecrets: [],
      Spaces: [
        {
          SpaceSlug: 'fake-base',
          // Anything but "Create" is reported as a colliding Space and blocks
          // creating from the preview.
          Action: 'Create',
          Units: [
            { Slug: 'deployment-web', Resource: 'apps/Deployment/web', Action: 'Create' },
            { Slug: 'service-web', Resource: 'v1/Service/web', Action: 'Create' },
          ],
          Links: [],
        },
      ],
    },
  ],
};

const SAMPLE_REF = 'oci://registry.example.com/demo:v1';

/** Opens the wizard and fills Step 0's two required fields. */
async function openWizard(page: Page, componentName: string): Promise<Locator> {
  await page.goto('/components');
  await page.waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 }).catch(() => {});
  await expect(page.getByRole('button', { name: 'New component' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'New component' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('New component', { exact: true })).toBeVisible({ timeout: 10000 });
  await dialog.getByLabel('Component name').fill(componentName);
  // A fresh CI org has no owners, so the form defaults to the "New owner"
  // sentinel and that field has to be filled for Step 0 to be valid.
  await dialog.getByRole('button', { name: 'New owner' }).click();
  await dialog.getByLabel('New owner').fill(`pw-owner-${RandomSlugGenerator.randomSlugName()}`);
  return dialog;
}

async function gotoOciPanel(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Units' }).click();
  await expect(dialog.getByText('Add starter units')).toBeVisible({ timeout: 15000 });
  await dialog.getByTestId('create-component-units-mode-oci').click();
  await expect(dialog.getByLabel('OCI reference')).toBeVisible({ timeout: 10000 });
}

async function openOciAdvanced(dialog: Locator) {
  await dialog.getByRole('button', { name: /Advanced — source name and unit metadata/ }).click();
  await expect(dialog.getByTestId('create-component-oci-source-name-input')).toBeVisible({ timeout: 5000 });
}

// `getByRole('button', { name: 'Review' })` also matches the OCI panel's
// "Preview again" button, so the stepper tab is always addressed exactly.
const stepButton = (dialog: Locator, name: string) => dialog.getByRole('button', { name, exact: true });

test.describe('create component — upload settings', () => {
  test.use({ storageState: 'authentication.json' });

  test('unit metadata rows reach the preview and the create as edited, each in the map its toggle names', async ({
    page,
  }) => {
    const dialog = await openWizard(page, `pw-upl-${RandomSlugGenerator.randomSlugName()}`);

    let previewBody = '';
    let createBody = '';
    await page.route('**/api/upload**', async (route) => {
      const request = route.request();
      if (request.url().includes('dry_run=true')) previewBody = request.postData() ?? '';
      else createBody = request.postData() ?? '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_PREVIEW) });
    });

    await gotoOciPanel(dialog);
    await dialog.getByLabel('OCI reference').fill(SAMPLE_REF);
    await openOciAdvanced(dialog);
    await dialog.getByTestId('create-component-oci-source-name-input').getByRole('textbox').fill('checkout-src');

    // Row 1 keeps the default kind; row 2 is switched to Annotation. Both are
    // typed into one list, so only the toggle decides where each one lands.
    // Every edit happens AFTER its row exists, which is the only way a user
    // ever fills a row in.
    const addRow = dialog.getByRole('button', { name: 'Add label or annotation' });
    await addRow.click();
    await dialog.getByLabel('Key').nth(0).fill('team');
    await dialog.getByLabel('Value').nth(0).fill('checkout');
    await addRow.click();
    await dialog.getByLabel('Key').nth(1).fill('note');
    await dialog.getByLabel('Value').nth(1).fill('imported by hand');
    await dialog
      .getByRole('group', { name: 'Kind of unit metadata 2' })
      .getByRole('button', { name: 'Annotation' })
      .click();
    // Re-editing the first row last proves the value is read at preview time.
    await dialog.getByLabel('Value').nth(0).fill('checkout-v2');

    await dialog.getByTestId('create-component-oci-preview-button').click();
    await expect(dialog.getByTestId('create-component-oci-plan')).toBeVisible({ timeout: 15000 });

    // The preview is what the user decides to create from, so it has to be
    // planned from the metadata on screen.
    await expect.poll(() => previewBody, { timeout: 15000 }).not.toBe('');
    const previewed = JSON.parse(previewBody).Components[0];
    expect(previewed.UnitLabels).toEqual({ team: 'checkout-v2' });
    expect(previewed.UnitAnnotations).toEqual({ note: 'imported by hand' });

    // The create request is the one that writes, built from the submitted form.
    await stepButton(dialog, 'Review').click();
    await stepButton(dialog, 'Create').click();
    await expect.poll(() => createBody, { timeout: 20000 }).not.toBe('');
    const created = JSON.parse(createBody).Components[0];
    expect(created.SourceName).toBe('checkout-src');
    expect(created.UnitLabels).toEqual({ team: 'checkout-v2' });
    expect(created.UnitAnnotations).toEqual({ note: 'imported by hand' });
  });
});
