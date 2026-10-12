// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Page } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The unit detail page's Config tab, across moving from one Unit to another.
 *
 * Following a Link from one Unit to the next keeps the same page, so the editor's state used
 * to come along: a Save on the second Unit wrote the first Unit's last edit to it. And the
 * write was unconditional, so nothing on the server could tell that the configuration it
 * replaced was not the one the edit started from.
 */

const configMap = (name: string, value: string) =>
  `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
data:
  value: ${value}
`;

const readData = async (spaceId: string, unitId: string) => {
  const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/data`);
  expect(response.ok()).toBeTruthy();
  return response.text();
};

/**
 * Replaces the whole editor buffer with `text`, as a paste, and waits until the editor holds
 * it: an editor that is still read-only ignores the paste.
 */
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

const saveWithDescription = async (page: Page, description: string) => {
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('textbox', { name: 'Change Description' }).fill(description);
  await page.getByRole('button', { name: 'Submit' }).click();
};

test.describe('unit config editor', () => {
  test.use({ storageState: 'authentication.json' });

  let spaceId = '';
  let alphaId = '';
  let bravoId = '';

  test.beforeEach(async ({ page }) => {
    const apiHelper = new ApiHelper(page);
    const space = await apiHelper.createSpace({
      space: { Slug: RandomSlugGenerator.randomSlugName() },
    });
    spaceId = space.SpaceID!;

    const alpha = await apiHelper.createUnit({
      spaceId,
      unit: { Slug: 'alpha', ToolchainType: 'Kubernetes/YAML' },
    });
    const bravo = await apiHelper.createUnit({
      spaceId,
      unit: { Slug: 'bravo', ToolchainType: 'Kubernetes/YAML' },
    });
    alphaId = alpha.UnitID!;
    bravoId = bravo.UnitID!;
    await apiHelper.uploadUnitData({
      spaceId,
      unitId: alphaId,
      body: configMap('alpha', 'one'),
    });
    await apiHelper.uploadUnitData({
      spaceId,
      unitId: bravoId,
      body: configMap('bravo', 'one'),
    });

    // A Link that only records the dependency, so the Links tab leads from one to the other.
    await apiHelper.createLink({
      spaceId,
      link: {
        Slug: 'bravo-to-alpha',
        FromUnitID: bravoId,
        ToUnitID: alphaId,
        ToSpaceID: spaceId,
        UpdateType: 'None',
        AutoUpdate: false,
      },
    });
  });

  test('an edit saved on one Unit is not saved to the next one the Links tab leads to', async ({
    page,
  }) => {
    await page.goto(`/units/${spaceId}/${alphaId}?tab=1`);
    await expect(page.locator('div.monaco-editor')).toContainText('alpha', { timeout: 15000 });

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await replaceEditorContent(page, configMap('alpha', 'edited'));
    await saveWithDescription(page, 'Edit alpha');
    await expect
      .poll(() => readData(spaceId, alphaId), { timeout: 10000 })
      .toContain('edited');

    // Follow the Link to bravo, in the page, as a user would, and open the Config tab once
    // bravo's configuration has arrived. The editor then mounts with it and reports no
    // change, which is when the page used to keep alpha's last edit as what Save sends.
    await page.getByRole('tab', { name: 'Links' }).click();
    const bravoDataLoaded = page.waitForResponse(
      (r) => r.url().includes(`/unit/${bravoId}/data`) && r.request().method() === 'GET',
    );
    await page.getByRole('link', { name: 'bravo' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/units/${spaceId}/${bravoId}`));
    await bravoDataLoaded;

    await page.getByRole('tab', { name: 'Config' }).click();
    const editor = page.locator('div.monaco-editor');
    await expect(editor).toContainText('bravo', { timeout: 15000 });
    await expect(editor).not.toContainText('alpha');

    // Nothing is edited yet, so there is nothing to save. This is where Save used to write
    // alpha's edit to bravo.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

    await replaceEditorContent(page, configMap('bravo', 'edited'));
    await saveWithDescription(page, 'Edit bravo');

    await expect
      .poll(() => readData(spaceId, bravoId), { timeout: 10000 })
      .toContain('edited');
    const bravoData = await readData(spaceId, bravoId);
    expect(bravoData).toContain('name: bravo');
    expect(bravoData).not.toContain('alpha');
    expect(await readData(spaceId, alphaId)).toBe(configMap('alpha', 'edited'));
  });

  test('a save is refused when the configuration changed after it was loaded', async ({
    page,
  }) => {
    await page.goto(`/units/${spaceId}/${alphaId}?tab=1`);
    await expect(page.locator('div.monaco-editor')).toContainText('alpha', { timeout: 15000 });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();

    // Someone else writes alpha while the editor holds the configuration it loaded.
    const apiHelper = new ApiHelper(page);
    const concurrent = configMap('alpha', 'concurrent');
    await apiHelper.uploadUnitData({ spaceId, unitId: alphaId, body: concurrent });

    await replaceEditorContent(page, configMap('alpha', 'stale-edit'));
    await saveWithDescription(page, 'Edit alpha from a stale copy');

    await expect(page.getByText('The configuration changed after it was loaded')).toBeVisible({
      timeout: 10000,
    });
    expect(await readData(spaceId, alphaId)).toBe(concurrent);
  });

  test('the dashboard editor saves an edit as typed, conditional on what it loaded', async ({
    page,
  }) => {
    const ifMatch: (string | undefined)[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes(`/unit/${alphaId}/data`)) {
        ifMatch.push(r.headers()['if-match']);
      }
    });

    await page.goto(
      `/unit-dashboard?filterWhere=${encodeURIComponent(`UnitID = '${alphaId}'`)}`,
    );
    await expect(page.getByText('bravo', { exact: true })).toHaveCount(0, { timeout: 15000 });
    await page.getByRole('checkbox').nth(1).check();
    await page.locator('button:has([data-testid="MoreVertIcon"])').first().click();
    await page.getByRole('menuitem', { name: 'Edit Config' }).click();
    await expect(page.getByText('Editing: alpha')).toBeVisible();

    await replaceEditorContent(page, configMap('alpha', 'dashboard'));
    await page.getByRole('button', { name: 'Save' }).click();

    // Byte for byte: an editor whose model was created before the configuration arrived
    // saved it with CRLF line endings.
    await expect
      .poll(() => readData(spaceId, alphaId), { timeout: 10000 })
      .toBe(configMap('alpha', 'dashboard'));
    expect(ifMatch).toHaveLength(1);
    expect(ifMatch[0]).toMatch(/^"[0-9a-f]{64}"$/);
  });
});
