// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Labels, Annotations, Facts and gates are edited as rows of Key and Value fields: an entry is
// changed in place, a typed row is saved with the form, and a bad row stops Save. The Space and
// Unit lists open the same settings form in a drawer that links to the entity's page.

import type { Page } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const waitForSave = (page: Page, path: RegExp) =>
  page.waitForResponse(
    (r) => path.test(new URL(r.url()).pathname) && ['PUT', 'PATCH'].includes(r.request().method()),
  );

// The first wait on a newly loaded page: in CI, signing in and fetching the page's data can take
// several seconds before a form shows anything.
const PAGE_LOAD = { timeout: 20_000 };

test.describe('map field editor', () => {
  test.use({ storageState: 'authentication.json' });

  test('the Space drawer edits labels in place and saves typed rows', async ({ page }) => {
    const api = new ApiHelper(page);
    const space = await api.createSpace({
      space: {
        Slug: RandomSlugGenerator.randomSlugName(),
        Labels: { Environment: 'dev', Owner: 'team-a' },
      },
    });

    try {
      await page.goto(`/spaces?edit=${space.SpaceID}`);
      const drawer = page.getByTestId('space-settings-drawer');

      // The labels arrive sorted by key, one editable row each.
      await expect(drawer.getByTestId('space-labels-key-0')).toHaveValue('Environment', PAGE_LOAD);
      await expect(drawer.getByTestId('space-labels-value-0')).toHaveValue('dev');
      await expect(drawer.getByTestId('space-labels-key-1')).toHaveValue('Owner');

      // Change a value and rename a key in place, and add a row without any other step.
      await drawer.getByTestId('space-labels-value-0').fill('prod');
      await drawer.getByTestId('space-labels-key-1').fill('Team');
      await drawer.getByTestId('space-labels-add').click();
      await drawer.getByTestId('space-labels-key-2').fill('Region');
      await drawer.getByTestId('space-labels-value-2').fill('us-west-2');
      await drawer.getByTestId('space-delete-gates-add').click();
      await drawer.getByTestId('space-delete-gates-key-0').fill('keep');

      await Promise.all([
        waitForSave(page, /\/space\/[^/]+$/),
        drawer.getByTestId('space-settings-save').click(),
      ]);
      await expect(drawer).toBeHidden();

      const saved = await api.getSpaceById(space.SpaceID!);
      expect(saved.Labels).toEqual({ Environment: 'prod', Team: 'team-a', Region: 'us-west-2' });
      expect(saved.DeleteGates).toEqual({ keep: true });

      // The Space page shows the same form in its Settings tab.
      await page.goto(`/spaces?edit=${space.SpaceID}`);
      await drawer.getByTestId('open-full-details-link').click();
      await expect(page).toHaveURL(new RegExp(`/spaces/${space.SpaceID}$`));
      await page.getByRole('tab', { name: 'Settings' }).click();
      const form = page.getByTestId('space-settings-form');
      await expect(form.getByTestId('space-labels-key-1')).toHaveValue('Region', PAGE_LOAD);
      await expect(form.getByTestId('space-delete-gates-key-0')).toHaveValue('keep');
    } finally {
      // A Space with a delete gate cannot be deleted.
      await hubApi.patch(`/api/space/${space.SpaceID}`, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
        data: { DeleteGates: null },
      });
      await api.deleteSpace(space.SpaceID!, true);
    }
  });

  test('a duplicate or invalid key stops Save', async ({ page }) => {
    const api = new ApiHelper(page);
    const space = await api.createSpace({
      space: { Slug: RandomSlugGenerator.randomSlugName(), Labels: { Environment: 'dev' } },
    });

    try {
      await page.goto(`/spaces?edit=${space.SpaceID}`);
      const drawer = page.getByTestId('space-settings-drawer');
      await expect(drawer.getByTestId('space-labels-key-0')).toHaveValue('Environment', PAGE_LOAD);

      let saves = 0;
      page.on('request', (r) => {
        if (/\/space\/[^/]+$/.test(new URL(r.url()).pathname) && r.method() === 'PUT') saves++;
      });

      await drawer.getByTestId('space-labels-add').click();
      await drawer.getByTestId('space-labels-key-1').fill('Environment');
      await drawer.getByTestId('space-labels-value-1').fill('prod');
      await drawer.getByTestId('space-settings-save').click();
      await expect(drawer.getByText('Duplicate key')).toBeVisible();

      await drawer.getByTestId('space-labels-key-1').fill('not a key');
      await drawer.getByTestId('space-settings-save').click();
      await expect(drawer.getByText(/Must start and end with a letter or number/)).toBeVisible();

      // A row left blank is dropped rather than refused.
      await drawer.getByRole('button', { name: 'Remove label 2' }).click();
      await drawer.getByTestId('space-labels-add').click();
      await Promise.all([
        waitForSave(page, /\/space\/[^/]+$/),
        drawer.getByTestId('space-settings-save').click(),
      ]);
      expect(saves).toBe(1);
      expect((await api.getSpaceById(space.SpaceID!)).Labels).toEqual({ Environment: 'dev' });
    } finally {
      await api.deleteSpace(space.SpaceID!, true);
    }
  });

  test('the Target drawer shows a long fact whole, and edits it in place', async ({ page }) => {
    const api = new ApiHelper(page);
    const space = await api.createSpace({ space: { Slug: RandomSlugGenerator.randomSlugName() } });
    const target = await api.createTarget({
      spaceId: space.SpaceID!,
      slug: RandomSlugGenerator.randomSlugName(),
    });
    const longValue = Array.from({ length: 30 }, (_, i) => `example.com/v1/Kind${i}`).join(',');
    const patched = await hubApi.patch(`/api/space/${space.SpaceID}/target/${target.TargetID}`, {
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: { Facts: { 'Cluster.ResourceTypes': longValue, region: 'us-east-1' } },
    });
    expect(patched.ok()).toBeTruthy();

    try {
      await page.goto(`/targets?edit=${target.TargetID}`);
      const value = page.getByTestId('target-facts-value-0');
      await expect(value).toHaveValue(longValue, PAGE_LOAD);
      // The value wraps over several lines instead of being cut off.
      const box = await value.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThan(40);

      await page.getByTestId('target-facts-value-1').fill('us-west-2');
      await Promise.all([
        waitForSave(page, /\/target\/[^/]+$/),
        page.getByRole('button', { name: 'Update Target' }).click(),
      ]);
      const read = await hubApi.get(`/api/space/${space.SpaceID}/target/${target.TargetID}`);
      const body = await read.json();
      expect((body.Target ?? body).Facts).toEqual({
        'Cluster.ResourceTypes': longValue,
        region: 'us-west-2',
      });
    } finally {
      await api.deleteSpace(space.SpaceID!, true);
    }
  });

  test('the Unit drawer and Settings tab edit annotations', async ({ page }) => {
    const api = new ApiHelper(page);
    const space = await api.createSpace({ space: { Slug: RandomSlugGenerator.randomSlugName() } });
    const unit = await api.createUnit({
      spaceId: space.SpaceID!,
      unit: {
        Slug: RandomSlugGenerator.randomSlugName(),
        ToolchainType: 'Kubernetes/YAML',
        Labels: { Tier: 'web' },
        Annotations: { Note: 'first' },
      },
    });

    try {
      await page.goto(`/units?edit=${unit.UnitID}`);
      const drawer = page.getByTestId('unit-settings-drawer');
      await expect(drawer.getByTestId('unit-labels-key-0')).toHaveValue('Tier', PAGE_LOAD);
      await drawer.getByTestId('unit-annotations-value-0').fill('second');
      await Promise.all([
        waitForSave(page, /\/unit\/[^/]+$/),
        drawer.getByTestId('unit-settings-save').click(),
      ]);
      await expect(drawer).toBeHidden();

      await page.goto(`/units?edit=${unit.UnitID}`);
      // Besides the Unit's page, the drawer links to its Config, Revisions, Links and Resources tabs.
      const unitPage = `/units/${space.SpaceID}/${unit.UnitID}`;
      await expect(drawer.getByTestId('open-config-tab-link')).toHaveAttribute('href', `${unitPage}?tab=1`, PAGE_LOAD);
      await expect(drawer.getByTestId('open-revisions-tab-link')).toHaveAttribute('href', `${unitPage}?tab=2`);
      await expect(drawer.getByTestId('open-links-tab-link')).toHaveAttribute('href', `${unitPage}?tab=3`);
      await expect(drawer.getByTestId('open-resources-tab-link')).toHaveAttribute('href', `${unitPage}?tab=5`);
      await drawer.getByTestId('open-full-details-link').click();
      await expect(page).toHaveURL(new RegExp(`/units/${space.SpaceID}/${unit.UnitID}`));
      await page.getByRole('tab', { name: 'Settings' }).click();
      const form = page.getByTestId('unit-settings-form');
      await expect(form.getByTestId('unit-annotations-value-0')).toHaveValue('second', PAGE_LOAD);

      await form.getByRole('button', { name: 'Remove label 1' }).click();
      await Promise.all([
        waitForSave(page, /\/unit\/[^/]+$/),
        form.getByTestId('unit-settings-save').click(),
      ]);
      const read = await hubApi.get(`/api/space/${space.SpaceID}/unit/${unit.UnitID}`);
      const body = await read.json();
      expect((body.Unit ?? body).Labels ?? {}).toEqual({});
    } finally {
      await api.deleteSpace(space.SpaceID!, true);
    }
  });
});
