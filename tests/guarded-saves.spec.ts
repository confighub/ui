// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse, Page } from '@playwright/test';

import { unitBlameHref } from '../src/pages/unit-detail/unitDetailHrefs';
import { expect, hubApi, test } from './fixtures/test';
import { UnitDetailPage } from './fixtures/unit-details-page';

/**
 * Writing to a Unit whose guards would withhold part of the write. A guarded path the write is
 * not cleared for is not written, and the rest is: the person is asked first, acknowledging
 * each guard to clear it, and a write that still lands without some of its changes says so.
 */

const deployment = (replicas: number, image: string) => `apiVersion: apps/v1
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
          image: ${image}
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

const saveWithDescription = async (page: Page, description: string) => {
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('textbox', { name: 'Change Description' }).fill(description);
  await page.getByRole('button', { name: 'Submit' }).click();
};

test.describe('writing to a guarded Unit', () => {
  let spaceId = '';
  let unitId = '';

  const unitData = async () => {
    const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/data`);
    if (!response.ok()) throw new Error(`unit data: ${response.status()}`);
    return response.text();
  };
  const setData = async (replicas: number, image: string) => {
    await body(
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, {
        data: deployment(replicas, image),
      }),
      'unit data',
    );
  };

  test.beforeEach(async () => {
    const slug = `guarded-saves-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    await setData(2, 'nginx:1.27');
    // The replica count is what it is for a reason a write has to be cleared for.
    await body(
      await hubApi.post(`/api/space/${spaceId}/unit/${unitId}/guard`, {
        data: {
          ResourceGuards: [
            {
              Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'default/web' },
              Set: { 'spec.replicas': { Scale: 'RegionSpecific' } },
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

  test('the config editor asks before a save the guards would partly withhold', async ({
    page,
  }) => {
    await page.goto(`/units/${spaceId}/${unitId}?tab=1`);
    await expect(page.locator('div.monaco-editor')).toContainText('nginx:1.27', {
      timeout: 20000,
    });

    // Saved without the guarded change: the rest lands, and the page says what did not.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await replaceEditorContent(page, deployment(7, 'nginx:1.28'));
    await saveWithDescription(page, 'Scale and bump');
    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });
    const acknowledge = dialog.getByRole('checkbox', {
      name: 'Scale=RegionSpecific',
      exact: true,
    });
    await expect(acknowledge).toBeVisible();
    await expect(dialog.getByTestId('guarded-changes')).toContainText('spec.replicas: 2 → 7');
    await expect(dialog.getByRole('button', { name: 'Save with clearance' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Save without them' }).click();
    await expect(page.getByTestId('withheld-by-guards')).toContainText(
      'Guards withheld 1 change: spec.replicas.',
    );
    await expect.poll(unitData).toContain('nginx:1.28');
    expect(await unitData()).toContain('replicas: 2');

    // The same change again is asked about again, though the conflict it reports is outstanding
    // already; cleared, it lands.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await replaceEditorContent(page, deployment(7, 'nginx:1.28'));
    await saveWithDescription(page, 'Scale');
    await acknowledge.check();
    await dialog.getByRole('button', { name: 'Save with clearance' }).click();
    await expect.poll(unitData).toContain('replicas: 7');
    await expect(page.getByTestId('withheld-by-guards')).toHaveCount(0);
  });

  test('the function invoker asks before a run the guards would partly withhold', async ({
    page,
  }) => {
    await page.goto(`/units/${spaceId}/${unitId}`);
    const unitDetailPage = new UnitDetailPage(page);
    await unitDetailPage.invokeFunctionByNameWithParameters({
      functionName: 'set-replicas',
      params: [{ name: 'Replicas', value: '5', type: 'number' }],
    });
    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });
    await expect(dialog.getByTestId('guarded-changes')).toContainText('spec.replicas: 2 → 5');
    await dialog.getByRole('checkbox', { name: 'Scale=RegionSpecific', exact: true }).check();
    await dialog.getByRole('button', { name: 'Run with clearance' }).click();
    await expect.poll(unitData).toContain('replicas: 5');
    await expect(page.getByTestId('withheld-by-guards')).toHaveCount(0);

    // Run without clearing it, the result says what the guard withheld. The invoker is still on
    // the function, so it is run again from there.
    await unitDetailPage.fillNumberInputByName('Replicas', '9');
    await unitDetailPage.clickInvokeButton();
    await dialog.getByRole('button', { name: 'Run without them' }).click();
    await expect(page.getByTestId('withheld-by-guards')).toContainText(
      'Guards withheld 1 change: spec.replicas.',
    );
    expect(await unitData()).toContain('replicas: 5');
  });

  test('a clearance stated in the invoker lets a guarded change land without asking', async ({
    page,
  }) => {
    await page.goto(`/units/${spaceId}/${unitId}`);
    const unitDetailPage = new UnitDetailPage(page);
    await unitDetailPage.selectFunctionByName('set-replicas');
    await unitDetailPage.fillNumberInputByName('Replicas', '6');
    await page.getByTestId('invoker-write-options-toggle').click();
    await page.getByTestId('invoker-clearance-add').click();
    await page.getByTestId('invoker-clearance-key-0').fill('Scale');
    await page.getByTestId('invoker-clearance-operator-0').click();
    await page.getByRole('option', { name: 'In', exact: true }).click();
    await page.getByTestId('invoker-clearance-values-0').fill('RegionSpecific');
    await unitDetailPage.clickInvokeButton();

    // A write the dialog held would not land until answered.
    await expect.poll(unitData).toContain('replicas: 6');
    await expect(
      page.getByRole('dialog', { name: 'Guards withhold some of these changes' }),
    ).toHaveCount(0);
    await expect(page.getByTestId('withheld-by-guards')).toHaveCount(0);
  });

  test('the invoker records a guard on the values it writes', async ({ page }) => {
    type Blame = Array<{
      Fields?: Array<{
        Path?: string;
        Guards?: Record<string, string>;
        InheritedGuards?: string[];
      }>;
    }>;
    const imageField = async () => {
      const blame = await body<Blame>(
        await hubApi.get('/api/unit_blame', {
          params: { where: `UnitID = '${unitId}'`, flags: 'Guarded', upstream: 'false' },
        }),
        'blame',
      );
      const field = (blame[0]?.Fields ?? []).find((f) => f.Path?.endsWith('.image'));
      return { guards: field?.Guards ?? {}, inherited: field?.InheritedGuards ?? [] };
    };

    await page.goto(`/units/${spaceId}/${unitId}`);
    const unitDetailPage = new UnitDetailPage(page);
    await unitDetailPage.selectFunctionByName('set-container-image');
    await unitDetailPage.fillTextInputByName('Container-name', 'web');
    await unitDetailPage.fillTextInputByName('Container-image', 'nginx:1.29');
    await page.getByTestId('invoker-write-options-toggle').click();
    const guardSection = page.getByTestId('guard-values-written');
    await guardSection.getByRole('checkbox', { name: 'Guard the values written' }).check();
    // A guard with no key is no guard. Invoke with the Options collapsed runs nothing: it opens
    // them, with the key marked as missing.
    await page.getByTestId('invoker-write-options-toggle').click();
    await expect(guardSection).toBeHidden();
    await page.getByTestId('invoker-invoke-button').click();
    await expect(guardSection.getByText('Required', { exact: true })).toBeVisible();
    expect(await unitData()).not.toContain('nginx:1.29');
    await guardSection.getByRole('textbox', { name: 'Guard key' }).fill('Release');
    await guardSection.getByRole('textbox', { name: 'Guard value' }).fill('Pinned');
    await unitDetailPage.clickInvokeButton();

    await expect.poll(unitData).toContain('nginx:1.29');
    await expect.poll(imageField).toEqual({ guards: { Release: 'Pinned' }, inherited: [] });

    // Writing over it again needs that guard acknowledged; the write is cleared for it and for
    // the inherited guard it records alongside.
    await unitDetailPage.fillTextInputByName('Container-image', 'nginx:1.30');
    await guardSection.getByRole('textbox', { name: 'Guard key' }).fill('Origin');
    await guardSection.getByRole('textbox', { name: 'Guard value' }).fill('Platform');
    await guardSection
      .getByRole('checkbox', { name: 'Inherited by clones and downstream Units' })
      .check();
    await unitDetailPage.clickInvokeButton();
    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });
    await dialog.getByRole('checkbox', { name: 'Release=Pinned', exact: true }).check();
    await dialog.getByRole('button', { name: 'Run with clearance' }).click();

    await expect.poll(unitData).toContain('nginx:1.30');
    await expect
      .poll(imageField)
      .toEqual({ guards: { Origin: 'Platform', Release: 'Pinned' }, inherited: ['Origin'] });
  });

  test('Set value on a guarded field waits for its guards to be acknowledged', async ({
    page,
  }) => {
    await page.goto(unitBlameHref(spaceId, unitId, 'spec.replicas'));
    const blame = page.getByTestId('blame-tab');
    const row = blame.getByRole('row').filter({ hasText: 'spec.replicas' });
    await expect(row).toHaveCount(1, { timeout: 20000 });
    await row.getByRole('checkbox').check();
    await page.keyboard.press('Escape');

    await blame.getByRole('button', { name: 'Set value', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Set value' });
    await dialog.getByRole('textbox', { name: 'Value (YAML)' }).fill('4');
    const set = dialog.getByRole('button', { name: 'Set value', exact: true });
    await expect(set).toBeDisabled();
    await dialog.getByRole('checkbox', { name: 'Scale=RegionSpecific', exact: true }).check();
    await set.click();
    await expect.poll(unitData).toContain('replicas: 4');
  });
});
