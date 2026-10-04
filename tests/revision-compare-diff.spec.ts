// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The Revision compare drawer's field view, on a change that inserts into a list.
 *
 * The second Revision puts a new environment variable at the top of the container's
 * list and changes the value of one further down. Matched by position that is four
 * changed elements, the two untouched variables among them, because each one sits where
 * a different variable sat before. The drawer shows the server's diff, which matches
 * the variables by name: one added, one changed, and nothing about the other two.
 */

const deployment = (env: { name: string; value: string }[]): string =>
  [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: web',
    '  namespace: default',
    'spec:',
    '  replicas: 1',
    '  selector:',
    '    matchLabels:',
    '      app: web',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: web',
    '    spec:',
    '      containers:',
    '        - name: web',
    '          image: registry.example.com/web:1.4.0',
    '          env:',
    ...env.flatMap((e) => [`            - name: ${e.name}`, `              value: "${e.value}"`]),
    '',
  ].join('\n');

const BEFORE = deployment([
  { name: 'API_URL', value: 'https://api.example.com' },
  { name: 'TIMEOUT', value: '30' },
  { name: 'REGION', value: 'us-east' },
]);

const AFTER = deployment([
  { name: 'LOG_LEVEL', value: 'debug' },
  { name: 'API_URL', value: 'https://api.example.com' },
  { name: 'TIMEOUT', value: '45' },
  { name: 'REGION', value: 'us-east' },
]);

test.describe('revision compare drawer', () => {
  test.use({ storageState: 'authentication.json' });

  const seedSlug = `e2e-revision-diff-${RandomSlugGenerator.randomSlugName()}`;
  let spaceId: string;
  let unitId: string;
  let headRevisionNum: number;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();

    try {
      // Visit a page first to ensure user/org is provisioned.
      await page.goto('/');
      await page.waitForResponse(
        (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
      );

      const api = new ApiHelper(page);
      const space = await api.createSpace({ space: { Slug: seedSlug } });
      spaceId = space.SpaceID as string;
      const unit = await api.createUnit({
        spaceId,
        unit: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' },
      });
      unitId = unit.UnitID as string;
      await api.uploadUnitData({ spaceId, unitId, body: BEFORE });
      await api.uploadUnitData({ spaceId, unitId, body: AFTER });

      // A Unit's Revision numbers are not known ahead of the writes: read the head back.
      const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
      expect(response.ok()).toBe(true);
      const body = await response.json();
      headRevisionNum = (body.Unit ?? body).HeadRevisionNum;
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!spaceId) return;

    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();

    try {
      await new ApiHelper(page).deleteSpace(spaceId, true);
    } catch {
      // Best effort — a leaked seed Space must not fail an otherwise green run.
    } finally {
      await context.close();
    }
  });

  test('an insertion into a list is one added row, matched by merge key', async ({ page }) => {
    const from = headRevisionNum - 1;
    const to = headRevisionNum;

    // Nothing the Revisions tab mounts may ask the server for something it refuses.
    const refused: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/api/')) {
        refused.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    await page.goto(
      `/units/${spaceId}/${unitId}?tab=2&revisionViewer=true&revision=${from}` +
        `&viewMode=compare&compareRev1=${from}&compareRev2=${to}`,
    );

    // The drawer opens only once the app has booted from the deep link and loaded the Unit
    // and its Revisions, which takes longer than the default five seconds on a busy shard.
    await expect(page.getByText(`Comparing revision ${from} to ${to}`)).toBeVisible({
      timeout: 20000,
    });

    const diff = page.getByTestId('config-diff');
    await expect(diff).toBeVisible();
    await expect(page.getByText('2 changes', { exact: true })).toBeVisible();

    // The resource, and the container and variables named by their merge keys.
    await expect(diff.getByTestId('config-diff-resource')).toHaveCount(1);
    await expect(diff).toContainText('apps/v1/Deployment default/web');
    await expect(diff).toContainText('spec.template.spec.containers.?name=web.env');
    await expect(diff).toContainText('?name=LOG_LEVEL');
    await expect(diff).toContainText('?name=TIMEOUT');

    // The added variable is one row holding the whole element, with nothing before it.
    const added = diff.getByTestId('config-diff-new-value').filter({ hasText: 'LOG_LEVEL' });
    await expect(added).toHaveCount(1);
    await expect(added).toContainText('debug');

    // The changed variable shows both of its values.
    await expect(diff.getByTestId('config-diff-old-value').filter({ hasText: '30' })).toHaveCount(1);
    await expect(diff.getByTestId('config-diff-new-value').filter({ hasText: '45' })).toHaveCount(1);

    // The variables that only moved down a place are not in the diff.
    await expect(diff.getByTestId('config-diff-new-value')).toHaveCount(2);
    await expect(diff).not.toContainText('API_URL');
    await expect(diff).not.toContainText('REGION');

    expect(refused).toEqual([]);
  });
});
