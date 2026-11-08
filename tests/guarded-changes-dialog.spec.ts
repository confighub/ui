// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse, Page } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';

/**
 * What the dialog that asks before a guarded write shows about each change: the value the path
 * holds now beside the one the write would put there, and whether each guard is inherited, since
 * overwriting what an inherited guard keeps also differs from what the Units upstream hold.
 */

const deployment = (replicas: number) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
`;

const body = async <T>(response: APIResponse, what: string): Promise<T> => {
  if (!response.ok())
    throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
};

/** Replaces the whole editor buffer with `text`, as a paste, once the editor takes input. */
const replaceEditorContent = async (page: Page, text: string) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  const editor = page.locator('div.monaco-editor');
  const lastLine = text.trim().split('\n').pop()!.trim();
  await expect(async () => {
    await editor.click();
    await editor.press('ControlOrMeta+A');
    await editor.press('ControlOrMeta+V');
    await expect(editor).toContainText(lastLine, { timeout: 1000 });
  }).toPass({ timeout: 10000 });
};

test.describe('the dialog asking before a guarded write', () => {
  let spaceId = '';
  let unitId = '';

  test.beforeEach(async () => {
    const slug = `guarded-dialog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    spaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', { data: { Slug: slug, Labels: { Owner: 'E2E' } } }),
        'space',
      )
    ).SpaceID;
    unitId = (
      await body<{ Unit: { UnitID: string } }>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          data: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' },
        }),
        'unit',
      )
    ).Unit.UnitID;
    await body(
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, { data: deployment(2) }),
      'unit data',
    );
    // Two guards on the replica count: one the Unit's clones inherit, and one that stays here.
    await body(
      await hubApi.post(`/api/space/${spaceId}/unit/${unitId}/guard`, {
        data: {
          ResourceGuards: [
            {
              Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'default/web' },
              SetInherited: { 'spec.replicas': { Scale: 'RegionSpecific' } },
              Set: { 'spec.replicas': { owner: 'local' } },
            },
          ],
        },
      }),
      'guard',
    );
  });

  test.afterEach(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('shows the current value and which guards are inherited', async ({ page }) => {
    await page.goto(`/units/${spaceId}/${unitId}?tab=1`);
    await expect(page.locator('div.monaco-editor')).toContainText('replicas: 2', {
      timeout: 20000,
    });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await replaceEditorContent(page, deployment(7));
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('textbox', { name: 'Change Description' }).fill('Scale');
    await page.getByRole('button', { name: 'Submit' }).click();

    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });
    const changes = dialog.getByTestId('guarded-changes');
    await expect(changes).toContainText('spec.replicas: 2 → 7');
    const scale = dialog.getByRole('checkbox', { name: 'Scale=RegionSpecific', exact: true });
    const owner = dialog.getByRole('checkbox', { name: 'owner=local', exact: true });
    await expect(scale).toBeVisible();
    await expect(owner).toBeVisible();
    // Each guard's row says whether it is inherited. The row is found by its checkbox, which
    // filter matches inside each row.
    const row = (guard: string) =>
      dialog
        .getByTestId('guard-row')
        .filter({ has: page.getByRole('checkbox', { name: guard, exact: true }) });
    await expect(row('Scale=RegionSpecific').getByTestId('guard-inheritance')).toHaveText(
      'inherited',
    );
    await expect(row('owner=local').getByTestId('guard-inheritance')).toHaveText(
      'not inherited',
    );
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
