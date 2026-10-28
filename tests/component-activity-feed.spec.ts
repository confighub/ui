// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The Component Dashboard's activity feed, on a Revision of a Unit with two resources.
 *
 * Both Deployments have the same paths: `spec.replicas` and a container `env` list. The
 * second write changes `replicas` in `worker` only, and puts a new environment variable
 * at the top of `web`'s list. The feed reads the server's diff, so the `replicas` change
 * is under `worker` and not under `web`, and the inserted variable is one change: the
 * variables after it are matched by name, not by position, and are not in the diff.
 */

const deployment = (name: string, replicas: number, env: { name: string; value: string }[]): string =>
  [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    `  name: ${name}`,
    '  namespace: default',
    'spec:',
    `  replicas: ${replicas}`,
    '  selector:',
    '    matchLabels:',
    `      app: ${name}`,
    '  template:',
    '    metadata:',
    '      labels:',
    `        app: ${name}`,
    '    spec:',
    '      containers:',
    `        - name: ${name}`,
    `          image: registry.example.com/${name}:1.4.0`,
    '          env:',
    ...env.flatMap((e) => [`            - name: ${e.name}`, `              value: "${e.value}"`]),
  ].join('\n');

const ENV = [
  { name: 'API_URL', value: 'https://api.example.com' },
  { name: 'TIMEOUT', value: '30' },
  { name: 'REGION', value: 'us-east' },
];

const BEFORE = [deployment('web', 2, ENV), '---', deployment('worker', 1, ENV), ''].join('\n');

const AFTER = [
  deployment('web', 2, [{ name: 'LOG_LEVEL', value: 'debug' }, ...ENV]),
  '---',
  deployment('worker', 3, ENV),
  '',
].join('\n');

test.describe('component activity feed', () => {
  test.use({ storageState: 'authentication.json' });

  const componentSlug = `e2e-activity-${RandomSlugGenerator.randomSlugName()}`;
  const spaceSlug = `e2e-activity-space-${RandomSlugGenerator.randomSlugName()}`;
  let componentId: string | undefined;
  let spaceId: string | undefined;
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
      componentId = (await api.createComponent(componentSlug)).ComponentID;
      const space = await api.createSpace({
        space: { Slug: spaceSlug, ComponentID: componentId, Labels: { Owner: 'E2E', Environment: 'dev' } },
      });
      spaceId = space.SpaceID as string;
      const unit = await api.createUnit({
        spaceId,
        unit: { Slug: 'apps', ToolchainType: 'Kubernetes/YAML' },
      });
      const unitId = unit.UnitID as string;
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
    if (!componentId) return;

    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    const api = new ApiHelper(page);

    // Best effort: a leaked seed must not fail an otherwise green run. The
    // Component goes after its Space, and has to go: deleting a Space leaves
    // its Component, and the org has a Component quota.
    try {
      if (spaceId) await api.deleteSpace(spaceId, true).catch(() => undefined);
      await api.deleteComponent(componentId).catch(() => undefined);
    } finally {
      await context.close();
    }
  });

  test('a Revision shows its changes under the right resource, an insertion as one change', async ({ page }) => {
    // No diff the feed reads may be refused, the first upload's from the empty Revision included.
    const refused: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/diff')) {
        refused.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    await page.goto(`/components?app=${encodeURIComponent(componentSlug)}&display=dashboard`);

    const row = page.locator(`[data-testid="activity-feed-row"][data-revision-num="${headRevisionNum}"]`);
    await expect(row).toBeVisible({ timeout: 20000 });
    // The count is read once the row scrolls near the viewport; below the fold it never loads.
    await row.scrollIntoViewIfNeeded();

    // One change per resource: worker's replicas, and web's inserted variable.
    await expect(row.getByTestId('activity-feed-change-count')).toContainText('2 changes', { timeout: 15000 });

    await row.click();
    const panel = page.getByTestId('activity-feed-diff');
    const diff = panel.getByTestId('config-diff');
    await expect(diff).toBeVisible({ timeout: 15000 });

    const resources = diff.getByTestId('config-diff-resource');
    await expect(resources).toHaveCount(2);
    const web = resources.filter({ hasText: /\bweb\b/ });
    const worker = resources.filter({ hasText: 'worker' });
    await expect(web).toHaveCount(1);
    await expect(worker).toHaveCount(1);

    // The shared path changed in worker only.
    await expect(worker).toContainText('replicas');
    await expect(worker.getByTestId('config-diff-new-value').filter({ hasText: '3' })).toHaveCount(1);
    await expect(web).not.toContainText('replicas');

    // Matched by merge key: the inserted variable is one added row, and the
    // variables that only moved down a place are not in the diff at all.
    await expect(web.getByTestId('config-diff-new-value').filter({ hasText: 'LOG_LEVEL' })).toHaveCount(1);
    await expect(web).not.toContainText('API_URL');
    await expect(web).not.toContainText('REGION');
    await expect(worker).not.toContainText('LOG_LEVEL');

    expect(refused).toEqual([]);
  });
});
