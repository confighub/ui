// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Locator, type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Create Component Wizard — upload settings
//
// Covers the wizard controls that decide what an upload WRITES, rather than
// what it reads: the Step 0 Space-slug override and change description, and
// the OCI panel's create-namespace flag, source name and per-unit labels and
// annotations (CreateComponentPane.tsx, OciSourcePanel.tsx, ociUpload.ts).
//
// The highest-value guard here is the last test. A preview is only reusable
// while every input it was planned from is unchanged, and `ociPreviewKey`
// decides that by hashing the real upload request minus a named set of
// metadata fields. Get that set wrong in either direction and the wizard
// either throws away good previews on every keystroke, or creates something
// the user never previewed. Both directions are asserted.
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

/**
 * The OCI panel is unmounted whenever the Units step is left, so its Advanced
 * disclosure is shut again on the way back. Reopen it only when it is closed.
 */
async function openOciAdvanced(dialog: Locator) {
  const sourceName = dialog.getByTestId('create-component-oci-source-name-input');
  if (await sourceName.isVisible().catch(() => false)) return;
  await dialog.getByRole('button', { name: /Advanced — source name and unit metadata/ }).click();
  await expect(sourceName).toBeVisible({ timeout: 5000 });
}

// `getByRole('button', { name: 'Review' })` also matches the OCI panel's
// "Preview again" button, so the stepper tab is always addressed exactly.
const stepButton = (dialog: Locator, name: string) => dialog.getByRole('button', { name, exact: true });

test.describe('create component — upload settings', () => {
  test.use({ storageState: 'authentication.json' });

  const componentName = `pw-upl-${RandomSlugGenerator.randomSlugName()}`;
  const slugOverride = `pw-override-${RandomSlugGenerator.randomSlugName()}`;

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
      // Nothing to clean up if the create test never got that far.
    }
    await context.close();
  });

  // ── Step 0: the Space slug override ───────────────────────────────────────

  test('a bad Space slug is reported inline and blocks the step', async ({ page }) => {
    const dialog = await openWizard(page, `pw-upl-${RandomSlugGenerator.randomSlugName()}`);
    await dialog.getByRole('button', { name: /Advanced \(optional\)/ }).click();
    const slug = dialog.getByTestId('create-component-space-slug-input').getByRole('textbox');

    // The three rules the server applies to a slug, each of which the wizard
    // must catch before a create is attempted.
    for (const bad of [
      '-bad-', // must start and end alphanumeric
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301', // must not be a UUID
      'a'.repeat(129), // must be 128 characters or fewer
    ]) {
      await slug.fill(bad);
      await expect(stepButton(dialog, 'Continue')).toBeDisabled({ timeout: 5000 });
    }

    // Empty is not a problem — it means "use the derived slug".
    await slug.fill('');
    await expect(stepButton(dialog, 'Continue')).toBeEnabled({ timeout: 5000 });

    // A good override is accepted and is what the step preview shows.
    await slug.fill('a-fine-slug');
    await expect(stepButton(dialog, 'Continue')).toBeEnabled({ timeout: 5000 });
  });

  test('the Space slug override and change description reach the created Space and Units', async ({
    page,
  }) => {
    const changeDescription = 'Imported the first version of the checkout API';
    const dialog = await openWizard(page, componentName);

    // Empty override: the step shows the derived `<component>-base`.
    await expect(dialog.getByText(`${componentName}-base`)).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: /Advanced \(optional\)/ }).click();
    await dialog.getByTestId('create-component-space-slug-input').getByRole('textbox').fill(slugOverride);
    await dialog
      .getByTestId('create-component-change-description-input')
      .getByRole('textbox')
      .fill(changeDescription);

    // What the inline path actually sends, rather than only what it renders.
    const unitRequests: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/space\/[^/]+\/unit/.test(r.url())) {
        unitRequests.push(r.postData() ?? '');
      }
    });

    await dialog.getByRole('button', { name: 'Units' }).click();
    await expect(dialog.getByText('Add starter units')).toBeVisible({ timeout: 15000 });
    await dialog.getByRole('button', { name: 'Insert a sample manifest' }).click();
    await expect(dialog.getByText('Detected 3 resources')).toBeVisible({ timeout: 10000 });

    await stepButton(dialog, 'Review').click();
    await expect(dialog.getByText('Review & create')).toBeVisible({ timeout: 10000 });
    await stepButton(dialog, 'Create').click();
    await expect(dialog.getByText(`${componentName} created`)).toBeVisible({ timeout: 30000 });

    const api = new ApiHelper(page);
    // The override is the Space that exists, and the derived default is not.
    const space = await api.getSpaceBySlug(slugOverride);
    expect(space.Slug).toBe(slugOverride);
    await expect(api.getSpaceBySlug(`${componentName}-base`)).rejects.toThrow();

    // The change description is recorded on every Unit the create writes.
    expect(unitRequests.length).toBeGreaterThan(0);
    expect(unitRequests.every((b) => b.includes(changeDescription))).toBe(true);
  });

  // ── OCI panel: create-namespace and source name ───────────────────────────

  test('create-namespace is off, needs a namespace, and is cleared with it', async ({ page }) => {
    const dialog = await openWizard(page, `pw-upl-${RandomSlugGenerator.randomSlugName()}`);
    await gotoOciPanel(dialog);

    const checkbox = dialog.getByTestId('create-component-oci-create-namespace').getByRole('checkbox');
    const namespace = dialog.getByTestId('create-component-oci-namespace-input').getByRole('textbox');

    // Creating a namespace applies the cluster's pod-security and
    // NetworkPolicy defaults, so it is never the default.
    await expect(checkbox).not.toBeChecked();
    // The server refuses CreateNamespace without a Namespace.
    await expect(checkbox).toBeDisabled();

    await namespace.fill('cubbychat');
    await expect(checkbox).toBeEnabled();
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    // Emptying the name must clear the flag too, or a checked box would be
    // left behind a disabled control the user can no longer reach to undo.
    await namespace.fill('');
    await expect(checkbox).toBeDisabled();
    await expect(checkbox).not.toBeChecked();
  });

  test('a bad source name is reported inline and disables Preview', async ({ page }) => {
    const dialog = await openWizard(page, `pw-upl-${RandomSlugGenerator.randomSlugName()}`);
    await gotoOciPanel(dialog);
    await dialog.getByLabel('OCI reference').fill(SAMPLE_REF);
    await openOciAdvanced(dialog);

    const preview = dialog.getByTestId('create-component-oci-preview-button');
    const sourceName = dialog.getByTestId('create-component-oci-source-name-input').getByRole('textbox');
    await expect(preview).toBeEnabled();

    // The server writes the source name as the ownership label on every Unit,
    // so it is held to the same rule as a slug — and the message says which
    // field is wrong, because the Space slug shares that rule.
    await sourceName.fill('-bad-');
    await expect(dialog.getByText(/source name must start and end/i)).toBeVisible({ timeout: 5000 });
    await expect(preview).toBeDisabled();

    await sourceName.fill('checkout');
    await expect(preview).toBeEnabled();
  });

  // ── OCI panel: per-unit labels and annotations ────────────────────────────

  test('the Label/Annotation toggle routes each row to the right map', async ({ page }) => {
    const dialog = await openWizard(page, `pw-upl-${RandomSlugGenerator.randomSlugName()}`);

    let createBody = '';
    await page.route('**/api/upload**', async (route) => {
      const request = route.request();
      if (!request.url().includes('dry_run=true')) createBody = request.postData() ?? '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_PREVIEW) });
    });

    await gotoOciPanel(dialog);
    await dialog.getByLabel('OCI reference').fill(SAMPLE_REF);
    await openOciAdvanced(dialog);
    await dialog.getByTestId('create-component-oci-source-name-input').getByRole('textbox').fill('checkout-src');

    // Row 1 keeps the default kind; row 2 is switched to Annotation. Both are
    // typed into one list, so only the toggle decides where each one lands.
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

    await dialog.getByTestId('create-component-oci-preview-button').click();
    await expect(dialog.getByTestId('create-component-oci-plan')).toBeVisible({ timeout: 15000 });

    // Asserted on the create request: that is the one that writes, and it is
    // built from the submitted form values.
    await stepButton(dialog, 'Review').click();
    await stepButton(dialog, 'Create').click();
    await expect.poll(() => createBody, { timeout: 20000 }).not.toBe('');

    const component = JSON.parse(createBody).Components[0];
    expect(component.SourceName).toBe('checkout-src');
    expect(component.UnitLabels).toEqual({ team: 'checkout' });
    expect(component.UnitAnnotations).toEqual({ note: 'imported by hand' });
  });

  test('the preview request carries metadata edited after the row was added', async ({ page }) => {
    const dialog = await openWizard(page, `pw-upl-${RandomSlugGenerator.randomSlugName()}`);

    let previewBody = '';
    await page.route('**/api/upload**', async (route) => {
      const request = route.request();
      if (request.url().includes('dry_run=true')) previewBody = request.postData() ?? '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_PREVIEW) });
    });

    await gotoOciPanel(dialog);
    await dialog.getByLabel('OCI reference').fill(SAMPLE_REF);
    await openOciAdvanced(dialog);

    // Every edit below happens AFTER the row it changes already exists, which
    // is the only way a user ever fills a row in. The preview is what the user
    // decides to create from, so it has to be planned from the metadata on
    // screen, not from whatever the rows held when they were added.
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

    await expect.poll(() => previewBody, { timeout: 15000 }).not.toBe('');
    const component = JSON.parse(previewBody).Components[0];
    expect(component.UnitLabels).toEqual({ team: 'checkout-v2' });
    expect(component.UnitAnnotations).toEqual({ note: 'imported by hand' });
  });

  // ── The preview-invalidation guard ────────────────────────────────────────

  test('metadata edits keep a preview; edits the server would act on discard it', async ({ page }) => {
    const dialog = await openWizard(page, `pw-upl-${RandomSlugGenerator.randomSlugName()}`);
    await page.route('**/api/upload**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_PREVIEW) });
    });

    await gotoOciPanel(dialog);
    await dialog.getByLabel('OCI reference').fill(SAMPLE_REF);
    await dialog.getByTestId('create-component-oci-namespace-input').getByRole('textbox').fill('cubbychat');
    await openOciAdvanced(dialog);

    const plan = dialog.getByTestId('create-component-oci-plan');
    const staleNotice = dialog.getByTestId('create-component-oci-stale-preview');
    const previewButton = dialog.getByTestId('create-component-oci-preview-button');

    // The plan list renders only while the preview still matches the inputs,
    // which is the same condition that lets Create run at all.
    const takePreview = async () => {
      await previewButton.click();
      await expect(plan).toBeVisible({ timeout: 15000 });
      await expect(staleNotice).toHaveCount(0);
    };

    await takePreview();
    await stepButton(dialog, 'Review').click();
    await expect(stepButton(dialog, 'Create')).toBeEnabled({ timeout: 10000 });
    await stepButton(dialog, 'Units').click();
    await openOciAdvanced(dialog);

    // ── Must NOT invalidate: the server records these word for word ────────
    const addRow = dialog.getByRole('button', { name: 'Add label or annotation' });
    await addRow.click();
    await dialog.getByLabel('Key').nth(0).fill('team');
    await dialog.getByLabel('Value').nth(0).fill('checkout');
    await expect(staleNotice).toHaveCount(0);
    await expect(plan).toBeVisible();

    await dialog
      .getByRole('group', { name: 'Kind of unit metadata 1' })
      .getByRole('button', { name: 'Annotation' })
      .click();
    await expect(staleNotice).toHaveCount(0);
    await expect(plan).toBeVisible();

    // Space labels and the change description live back on Step 0.
    await stepButton(dialog, 'Component').click();
    await dialog.getByRole('button', { name: /Advanced \(optional\)/ }).click();
    await dialog.getByTestId('create-component-change-description-input').getByRole('textbox').fill('a description');
    await dialog.getByRole('button', { name: 'Add label' }).click();
    await dialog.getByLabel('Key').fill('tier');
    await dialog.getByLabel('Value').fill('backend');
    await stepButton(dialog, 'Units').click();
    await openOciAdvanced(dialog);
    await expect(staleNotice).toHaveCount(0);
    await expect(plan).toBeVisible();

    await stepButton(dialog, 'Review').click();
    await expect(stepButton(dialog, 'Create')).toBeEnabled({ timeout: 10000 });
    await stepButton(dialog, 'Units').click();
    await openOciAdvanced(dialog);

    // ── MUST invalidate: these change what the server writes or pulls ──────
    await dialog.getByTestId('create-component-oci-source-name-input').getByRole('textbox').fill('checkout-src');
    await expect(staleNotice).toBeVisible({ timeout: 5000 });
    await expect(plan).toHaveCount(0);

    await takePreview();
    await dialog.getByTestId('create-component-oci-create-namespace').getByRole('checkbox').check();
    await expect(staleNotice).toBeVisible({ timeout: 5000 });
    await expect(plan).toHaveCount(0);

    await takePreview();
    await dialog.getByLabel('OCI reference').fill('oci://registry.example.com/demo:v2');
    await expect(staleNotice).toBeVisible({ timeout: 5000 });
    await expect(plan).toHaveCount(0);

    // A stale preview really does stop the create, not just annotate it.
    await stepButton(dialog, 'Review').click();
    await expect(stepButton(dialog, 'Create')).toBeDisabled({ timeout: 10000 });
  });
});
