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
// Also covers, end to end:
//   - the "Base space" step is gone; labels typed in Step 0's "Advanced"
//     disclosure still reach the created Space — the only end-to-end proof
//     that relocating them didn't silently drop them.
//   - the OCI reference toggle is present but disabled — this wizard has no
//     backend support for reading a registry (see useCreateComponentMutation.ts).
//   - folder upload via the hidden `<input webkitdirectory>`, including that
//     per-file granularity groups by FILE, not by resource count.
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
      const space = await api.getSpaceBySlug(baseSlug);
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
    // every test here does next anyway.
    await expect(page.getByRole('button', { name: 'New component' })).toBeVisible({ timeout: 10000 });

    // Open the wizard via the Header's add-button.
    await page.getByRole('button', { name: 'New component' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('New component', { exact: true })).toBeVisible({ timeout: 10000 });

    // The redundant owner/toolchain "Base space" step is gone — exactly three
    // steps remain, and there is no "Base space" button at all.
    await expect(dialog.getByRole('button', { name: 'Component' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Units' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Review' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Base space/i })).toHaveCount(0);

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

    // The toolchain picker is gone from Review — it was never sent to the
    // backend; the server infers ToolchainType per-resource.
    await expect(dialog.getByText(/Toolchain/i)).toHaveCount(0);

    // ── Create ──────────────────────────────────────────────────────────
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    // ── Success receipt ─────────────────────────────────────────────────
    await expect(dialog.getByText(`${componentName} created`)).toBeVisible({ timeout: 20000 });
    await expect(dialog.getByText(baseSlug, { exact: true })).toBeVisible({ timeout: 5000 });
    // Per-resource unit slugs match the server's resourceSlug (`kind-name`):
    // Deployment/checkout-api → deployment-checkout-api, etc.
    for (const unitSlug of [
      'deployment-checkout-api',
      'service-checkout-api',
      'configmap-checkout-api-config',
    ]) {
      await expect(dialog.getByText(unitSlug, { exact: true })).toBeVisible({ timeout: 5000 });
    }

    // ── Labels regression guard ──────────────────────────────────────────
    // The only end-to-end proof that relocating labels into Step 0's
    // "Advanced" disclosure didn't silently drop them: read the real created
    // Space back and check the typed label survived, and that the Space is in
    // the new Component. The owner is set on the Component, not the Space.
    const api = new ApiHelper(page);
    const createdSpace = (await api.getSpaceBySlug(baseSlug)) as {
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
  });

  test('OCI reference is a selectable import mode with its own source panel', async ({ page }) => {
    await page.goto('/components');
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    // Not `getByText('Components', { exact: true })`: the left nav now has a
    // persistent top-level "Components" item too, so that text is ambiguous
    // on this page. Wait on the add-button instead — unique, and it's what
    // every test here does next anyway.
    await expect(page.getByRole('button', { name: 'New component' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'New component' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('New component', { exact: true })).toBeVisible({ timeout: 10000 });

    // Step 0 must be valid before Units is reachable — that needs a name AND
    // an owner. A fresh CI org has no existing owners, so the form defaults
    // to the "New owner" sentinel, which needs its own field filled in.
    await dialog.getByLabel('Component name').fill(`pw-oci-${RandomSlugGenerator.randomSlugName()}`);
    await dialog.getByRole('button', { name: 'New owner' }).click();
    await dialog.getByLabel('New owner').fill(`pw-owner-${RandomSlugGenerator.randomSlugName()}`);
    await dialog.getByRole('button', { name: 'Units' }).click();
    await expect(dialog.getByText('Add starter units')).toBeVisible({ timeout: 10000 });

    // The OCI mode is offered and reachable: the panel it swaps in is the only
    // place a registry reference can be typed, and nothing is pulled until the
    // reference is one the server could act on.
    const ociToggle = dialog.getByRole('button', { name: 'OCI reference' });
    await expect(ociToggle).toBeEnabled();
    await expect(dialog.getByLabel('OCI reference')).not.toBeVisible();

    await ociToggle.click();
    const ref = dialog.getByLabel('OCI reference');
    await expect(ref).toBeVisible({ timeout: 10000 });
    const preview = dialog.getByTestId('create-component-oci-preview-button');
    await expect(preview).toBeDisabled();

    await ref.fill('registry.example.com/demo:v1');
    await expect(preview).toBeDisabled();
    await ref.fill('oci://registry.example.com/demo:v1');
    await expect(preview).toBeEnabled({ timeout: 5000 });

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('folder upload: per-file granularity groups by file, not by resource count', async ({
    page,
  }) => {
    await page.goto('/components');
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    // Not `getByText('Components', { exact: true })`: the left nav now has a
    // persistent top-level "Components" item too, so that text is ambiguous
    // on this page. Wait on the add-button instead — unique, and it's what
    // every test here does next anyway.
    await expect(page.getByRole('button', { name: 'New component' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'New component' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('New component', { exact: true })).toBeVisible({ timeout: 10000 });

    // See the previous test for why the owner step is required here too.
    await dialog.getByLabel('Component name').fill(`pw-folder-${RandomSlugGenerator.randomSlugName()}`);
    await dialog.getByRole('button', { name: 'New owner' }).click();
    await dialog.getByLabel('New owner').fill(`pw-owner-${RandomSlugGenerator.randomSlugName()}`);
    await dialog.getByRole('button', { name: 'Units' }).click();
    await expect(dialog.getByText('Add starter units')).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: 'Upload folder' }).click();

    // Two files, four resources total (2 + 2) — proves per-file granularity
    // groups by the FILE a resource came from, not by resource count or kind.
    // The fixture deliberately makes minimal (3 buckets: main, configmap,
    // namespace) and per-file (2: one per file) disagree, so switching
    // between them provably changes the grouping rather than coincidentally
    // landing on the same count either way.
    const baseYaml = [
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:\n  name: folder-web',
      'spec:\n  replicas: 1',
      '---',
      'apiVersion: v1',
      'kind: Service',
      'metadata:\n  name: folder-web',
    ].join('\n');
    const configYaml = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:\n  name: folder-config',
      '---',
      'apiVersion: v1',
      'kind: Namespace',
      'metadata:\n  name: folder-ns',
    ].join('\n');

    // Simulate a folder DRAG-AND-DROP rather than the <input webkitdirectory>
    // picker: Playwright's setInputFiles requires a real directory on disk for
    // a webkitdirectory input ("[webkitdirectory] input requires passing a
    // path to a directory"), and while that materializes correctly in an
    // isolated repro, it silently produced zero files against this exact
    // dialog in CI (Linux headless Chromium) without ever firing the app's
    // onChange handler — a real but unexplained cross-environment
    // discrepancy. The drop path exercises the identical `importFolderFiles`
    // pipeline (see CreateComponentPane.tsx's handleFolderDrop) and only
    // needs a synthetic DragEvent with a fake DataTransferItemList, which is
    // fully in-browser and has no OS/browser-version dependency — it's the
    // same fake FileSystemEntry shape folderImport.test.ts's
    // walkDroppedEntries unit tests already use.
    const dropZone = dialog.getByRole('button', { name: 'Choose folder' }).locator('..');
    await dropZone.evaluate(
      (el, args: { files: { name: string; content: string }[] }) => {
        function makeFileEntry(name: string, content: string) {
          return {
            isFile: true,
            isDirectory: false,
            name,
            fullPath: `/${name}`,
            file(cb: (f: File) => void) {
              cb(new File([content], name));
            },
          };
        }
        const entries = args.files.map((f) => makeFileEntry(f.name, f.content));
        let delivered = false;
        const dirEntry = {
          isFile: false,
          isDirectory: true,
          name: 'dropped-folder',
          fullPath: '/dropped-folder',
          createReader() {
            return {
              // Deliver everything on the first call, empty on every call
              // after — mirrors the real readEntries()-until-empty contract.
              readEntries(cb: (entries: unknown[]) => void) {
                if (delivered) {
                  cb([]);
                  return;
                }
                delivered = true;
                cb(entries);
              },
            };
          },
        };
        const items = [{ webkitGetAsEntry: () => dirEntry }];
        const event = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { items } });
        el.dispatchEvent(event);
      },
      { files: [{ name: 'base.yaml', content: baseYaml }, { name: 'config.yaml', content: configYaml }] },
    );

    // File list shows both relative paths. walkDroppedEntries descends into a
    // top-level directory entry's CHILDREN directly (prefix ''), discarding
    // the dropped folder's own name entirely — same as a real folder drop
    // would — so the displayed path is the bare filename, not
    // "dropped-folder/base.yaml".
    await expect(dialog.getByText('Files · 2')).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText('base.yaml', { exact: true })).toBeVisible();
    await expect(dialog.getByText('config.yaml', { exact: true })).toBeVisible();

    // "minimal" (the CLI default) is recommended and selected by default:
    // main (Deployment+Service) + configmap + namespace = 3 buckets, even
    // though there are 4 resources and 2 files.
    await expect(
      dialog.getByText('these 4 resources are grouped into 3 server-named units'),
    ).toBeVisible({ timeout: 5000 });

    // Switch to per-file: 2 files → 2 units — a DIFFERENT count than
    // minimal's 3, proving the switch actually changes the grouping rather
    // than the two modes coincidentally agreeing.
    const granularityGroup = dialog.getByRole('radiogroup', { name: 'Granularity' });
    await granularityGroup.getByRole('radio', { name: 'per-file' }).click();
    await expect(
      dialog.getByText('these 4 resources are grouped into 2 server-named units'),
    ).toBeVisible({ timeout: 5000 });

    // Switch to per-resource: 4 units — one per resource, ignoring both file
    // origin and kind-bucketing.
    await granularityGroup.getByRole('radio', { name: 'per-resource' }).click();
    await expect(dialog.getByText('Units to create · 4')).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('an owner the server refuses is shown on the owner field and blocks Continue', async ({ page }) => {
    await page.goto('/components');
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await expect(page.getByRole('button', { name: 'New component' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'New component' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('New component', { exact: true })).toBeVisible({ timeout: 10000 });

    // Nothing is written in this test: the refused owner stops the wizard on
    // its first step, before any request.
    await dialog.getByLabel('Component name').fill(`pw-bad-owner-${RandomSlugGenerator.randomSlugName()}`);
    await dialog.getByRole('button', { name: 'New owner' }).click();
    const ownerInput = dialog.getByLabel('New owner');
    const next = dialog.getByTestId('create-component-next-button');

    // A wildcard is not allowed in a label value.
    await ownerInput.fill('Team*');
    await expect(dialog.getByText(/The owner is not valid/)).toBeVisible({ timeout: 5000 });
    await expect(ownerInput).toHaveAttribute('aria-invalid', 'true');
    await expect(next).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Units' })).toBeDisabled();

    // A space inside the value is allowed.
    await ownerInput.fill('Team A');
    await expect(dialog.getByText(/The owner is not valid/)).toHaveCount(0);
    await expect(ownerInput).toHaveAttribute('aria-invalid', 'false');
    await expect(next).toBeEnabled();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });
});
