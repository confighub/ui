// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Quiet Kubernetes defaults in the spec sheet, on a Deployment and a Service in the shape
// `kubectl get -o yaml` gives. A default that belongs to a value is in that value's hover card;
// the rest fold into one line at the end of their section. prod sets replicas 4, the liveness
// timeout 3 and the grace period 60 over base.
import type { Page } from '@playwright/test';

import { type SeededSpecSheet, seedSpecSheet } from './fixtures/spec-sheet/seedSpecSheet';
import { expect, test } from './fixtures/test';

const C = 'spec.template.spec.containers.0';
const at = (path: string) => `[data-path="${path}"]`;

async function openSheet(page: Page, seeded: SeededSpecSheet) {
  await page.goto(
    `/components?app=${encodeURIComponent(seeded.componentSlug)}&space=${seeded.prod.spaceId}`,
  );
  const pane = page.getByTestId('component-side-pane');
  await expect(pane).toBeVisible({ timeout: 30000 });
  await page.getByTestId('component-filter-all').click();
  const header = pane.getByTestId('unit-header').filter({ hasText: 'checkout' }).first();
  await expect(header).toBeVisible();
  if ((await pane.getByTestId('field-sheet').count()) === 0) await header.click();
  const sheet = pane.getByTestId('field-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('Component side pane: quiet Kubernetes defaults', () => {
  let seeded: SeededSpecSheet | undefined;

  test.afterEach(async () => {
    await seeded?.cleanup();
    seeded = undefined;
  });

  test('a default that belongs to a value is in its card, and its row opens the editor', async ({
    page,
  }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'defaults', 'checkout');
    const sheet = await openSheet(page, seeded);

    const image = sheet.locator(at(`${C}.image`));
    await image.scrollIntoViewIfNeeded();
    // The pull policy and the port's protocol are not on the line.
    await expect(sheet.locator(at(`${C}.imagePullPolicy`))).toHaveCount(0);
    await expect(sheet.locator(at(`${C}.ports.0.protocol`))).toHaveCount(0);
    await expect(sheet.getByTestId('blk-container-checkout-ports')).not.toContainText('TCP');

    await image.hover();
    const defaults = page.getByTestId('field-peek-defaults');
    await expect(defaults).toHaveText(/Kubernetes default\s*pull\s*IfNotPresent/);
    await defaults.getByRole('button', { name: 'Edit pull, IfNotPresent' }).click();
    // The field is on the line, in its editor, while the editor is open.
    const input = sheet
      .getByTestId('blk-container-checkout-image')
      .getByTestId('field-editor-input');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('IfNotPresent');
    await page.keyboard.press('Escape');
    await expect(sheet.getByTestId('field-editor')).toHaveCount(0);
    await expect(sheet.locator(at(`${C}.imagePullPolicy`))).toHaveCount(0);
  });

  test('a probe column shows only for a value that is not the default, and its card says the default', async ({
    page,
  }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'defaults', 'checkout');
    const sheet = await openSheet(page, seeded);

    const timeout = sheet.locator(at(`${C}.livenessProbe.timeoutSeconds`));
    await timeout.scrollIntoViewIfNeeded();
    await expect(timeout).toHaveText('3s');
    for (const quiet of [
      'livenessProbe.periodSeconds',
      'livenessProbe.failureThreshold',
      'livenessProbe.httpGet.scheme',
      'readinessProbe.timeoutSeconds',
      'readinessProbe.periodSeconds',
    ]) {
      await expect(sheet.locator(at(`${C}.${quiet}`))).toHaveCount(0);
    }
    await timeout.hover();
    await expect(page.getByTestId('field-peek-kube-default')).toHaveText(
      'Kubernetes default: 1s',
    );

    // The probe's check holds its quiet timings.
    await page.mouse.move(0, 0);
    await sheet.locator(at(`${C}.livenessProbe.httpGet.path`)).hover();
    await expect(page.getByTestId('field-peek-defaults')).toHaveText(
      /period\s*10s.*failures\s*3.*successes\s*1.*scheme\s*HTTP/,
    );
  });

  test('defaults with no value to belong to fold into one line per section, which opens in place', async ({
    page,
  }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'defaults', 'checkout');
    const sheet = await openSheet(page, seeded);

    const fold = sheet.getByTestId('defaults-fold-pod');
    await fold.scrollIntoViewIfNeeded();
    // creationTimestamp, dnsPolicy, restartPolicy, schedulerName, securityContext; the grace
    // period is 60 in prod, so it is on the line.
    await expect(fold).toHaveText('5 Kubernetes defaults');
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await expect(sheet.locator(at('spec.template.spec.dnsPolicy'))).toHaveCount(0);
    await expect(
      sheet.locator(at('spec.template.spec.terminationGracePeriodSeconds')),
    ).toHaveText('60');
    await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await expect(sheet.locator(at('spec.template.spec.dnsPolicy'))).toHaveText('ClusterFirst');
    await expect(sheet.locator(at('spec.template.spec.restartPolicy'))).toHaveText('Always');

    await expect(sheet.getByTestId('defaults-fold-deployment-spec')).toHaveText(
      '5 Kubernetes defaults',
    );
    await expect(sheet.locator(at('spec.replicas'))).toHaveText('4');
    // The Service keeps its type, and ipFamilies, which the cluster sets.
    await expect(sheet.getByTestId('defaults-fold-service-spec')).toHaveText(
      '3 Kubernetes defaults',
    );
    await expect(sheet.locator(at('spec.type'))).toHaveText('ClusterIP');
    await expect(sheet.locator(at('spec.ipFamilies.0'))).toHaveText('IPv4');
    await expect(sheet.locator(at('spec.sessionAffinity'))).toHaveCount(0);
  });

  test('a search shows the defaults it finds', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'defaults', 'checkout');
    const sheet = await openSheet(page, seeded);
    await expect(sheet.getByTestId('defaults-fold-pod')).toBeVisible();
    await page.getByTestId('component-search').locator('input').fill('dnsPolicy');
    await expect(sheet.locator(at('spec.template.spec.dnsPolicy'))).toHaveText('ClusterFirst');
    await expect(sheet.locator('[data-testid^="defaults-fold-"]')).toHaveCount(0);
  });
});
