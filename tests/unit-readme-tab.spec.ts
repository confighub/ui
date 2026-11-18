// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A Unit with a Readme annotation gets a Readme tab beside URLs on its Overview,
// which renders the annotation's Markdown. A Unit without one has no such tab.
import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, newAuthorizedPage, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const RUN = RandomSlugGenerator.randomSlugName();
const SPACE_SLUG = `e2e-unit-readme-${RUN}`;

const README =
  '# Runbook\n\nScale with **care**; see [the docs](https://docs.confighub.com) or [notes](notes.md).';

test.use({ storageState: 'authentication.json' });

let spaceId = '';
let withReadme = '';
let withoutReadme = '';
let toggled = '';

test.beforeAll(async ({ browser }) => {
  const page = await newAuthorizedPage(browser);
  try {
    const api = new ApiHelper(page);
    spaceId = (await api.createSpace({ space: { Slug: SPACE_SLUG } })).SpaceID as string;
    withReadme = (
      await api.createUnit({
        spaceId,
        unit: {
          Slug: 'documented',
          ToolchainType: 'Kubernetes/YAML',
          Annotations: { Readme: README },
        },
      })
    ).UnitID as string;
    toggled = (
      await api.createUnit({
        spaceId,
        unit: {
          Slug: 'toggled',
          ToolchainType: 'Kubernetes/YAML',
          Annotations: { Readme: README },
        },
      })
    ).UnitID as string;
    withoutReadme = (
      await api.createUnit({
        spaceId,
        unit: { Slug: 'plain', ToolchainType: 'Kubernetes/YAML' },
      })
    ).UnitID as string;
  } finally {
    await page.context().close();
  }
});

test.afterAll(async ({ browser }) => {
  const page = await newAuthorizedPage(browser);
  try {
    if (spaceId) {
      await new ApiHelper(page)
        .deleteSpace(spaceId, true)
        .catch((e) => console.warn(`cleanup: Space ${spaceId}: ${e}`));
    }
  } finally {
    await page.context().close();
  }
});

test('a Unit with a Readme annotation shows its Markdown in a Readme tab beside URLs', async ({
  page,
}) => {
  await page.goto(`/units/${spaceId}/${withReadme}`);
  await expect(page.getByRole('tab', { name: 'URLs' })).toBeVisible({ timeout: 20000 });
  const readme = page.getByTestId('unit-readme');
  await expect(readme).toHaveCount(0);

  await page.getByRole('tab', { name: 'Readme', exact: true }).click();
  await expect(readme.getByRole('heading', { name: 'Runbook', level: 1 })).toBeVisible();
  await expect(readme.locator('strong')).toHaveText('care');
  await expect(readme.getByRole('link', { name: 'the docs' })).toHaveAttribute(
    'href',
    'https://docs.confighub.com',
  );
  // A relative link names a file the UI cannot reach, so it is not followed.
  await expect(readme.getByText('notes')).toBeVisible();
  await expect(readme.getByRole('link', { name: 'notes' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'URLs' }).click();
  await expect(readme).toHaveCount(0);
});

test('a Unit without a Readme annotation has no Readme tab', async ({ page }) => {
  await page.goto(`/units/${spaceId}/${withoutReadme}`);
  await expect(page.getByRole('tab', { name: 'URLs' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('tab', { name: 'Readme', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('unit-readme')).toHaveCount(0);
});

test('a Readme annotation removed while its tab is open, then restored, does not reopen the tab', async ({
  page,
}) => {
  const setReadme = async (readme: string | null) => {
    const response = await hubApi.patch(`/api/space/${spaceId}/unit/${toggled}`, {
      data: { Annotations: { Readme: readme } },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(response.ok(), await response.text()).toBe(true);
  };
  const readmeTab = page.getByRole('tab', { name: 'Readme', exact: true });
  const urlsTab = page.getByRole('tab', { name: 'URLs' });

  await page.goto(`/units/${spaceId}/${toggled}`);
  await readmeTab.click();
  await expect(page.getByTestId('unit-readme')).toBeVisible();

  // The page polls the Unit every few seconds.
  await setReadme(null);
  await expect(readmeTab).toHaveCount(0, { timeout: 20000 });
  await expect(urlsTab).toHaveAttribute('aria-selected', 'true');

  await setReadme(README);
  await expect(readmeTab).toBeVisible({ timeout: 20000 });
  await expect(readmeTab).toHaveAttribute('aria-selected', 'false');
  await expect(urlsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('unit-readme')).toHaveCount(0);
});
