// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A Space with a README.md Unit gets a Readme tab in the Component view's side
// pane, which renders the Unit's Markdown without its frontmatter. A Space
// without one, and without a release target, has no tab bar at all.

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { test, expect, newAuthorizedPage } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RUN = RandomSlugGenerator.randomSlugName();
const COMPONENT_SLUG = `e2e-readme-app-${RUN}`;
const BASE_SLUG = `e2e-readme-base-${RUN}`;
const PLAIN_SLUG = `e2e-readme-plain-${RUN}`;

const README = `---
configHub:
  configName: README.md
---
# Readme heading

Some **bold** text and a [docs link](https://docs.confighub.com).

| Key | Default |
|-----|---------|
| port | 80 |

A [relative link](docs/setup.md) is not followed.
`;

test.use({ storageState: 'authentication.json' });

let componentId = '';
const spaceIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  const page = await newAuthorizedPage(browser);
  try {
    const api = new ApiHelper(page);
    componentId = (await api.createComponent(COMPONENT_SLUG)).ComponentID as string;
    const yaml = readFileSync(path.resolve(__dirname, 'test-data/basic-deployment.yml'), 'utf-8');
    for (const slug of [BASE_SLUG, PLAIN_SLUG]) {
      const spaceId = (await api.createSpace({ space: { Slug: slug, ComponentID: componentId } })).SpaceID as string;
      spaceIds.push(spaceId);
      const unit = await api.createUnit({ spaceId, unit: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' } });
      await api.uploadUnitData({ spaceId, unitId: unit.UnitID as string, body: yaml });
    }
    const readme = await api.createUnit({ spaceId: spaceIds[0], unit: { Slug: 'README.md', ToolchainType: 'AppConfig/Text' } });
    await api.uploadUnitData({ spaceId: spaceIds[0], unitId: readme.UnitID as string, body: README });
  } finally {
    await page.context().close();
  }
});

test.afterAll(async ({ browser }) => {
  const page = await newAuthorizedPage(browser);
  try {
    const api = new ApiHelper(page);
    for (const spaceId of spaceIds) {
      await api.deleteSpace(spaceId, true).catch((e) => console.warn(`cleanup: Space ${spaceId}: ${e}`));
    }
    if (componentId) await api.deleteComponent(componentId).catch((e) => console.warn(`cleanup: Component ${componentId}: ${e}`));
  } finally {
    await page.context().close();
  }
});

test('a Space with a README.md Unit shows its Markdown in a Readme tab', async ({ page }) => {
  await page.goto(`/components?app=${COMPONENT_SLUG}`);
  const node = page.getByTestId(`rf__node-${spaceIds[0]}`);
  await expect(node).toBeVisible({ timeout: 20000 });
  await node.click();

  const readmeTab = page.getByTestId('component-pane-tab-readme');
  await expect(readmeTab).toBeVisible({ timeout: 10000 });
  // No release target, so the Readme tab sits beside Configuration alone.
  await expect(page.getByTestId('component-pane-tab-releases')).toHaveCount(0);
  await readmeTab.click();

  const readme = page.getByTestId('component-readme');
  await expect(readme.getByRole('heading', { name: 'Readme heading', level: 1 })).toBeVisible();
  await expect(readme.locator('strong')).toHaveText('bold');
  await expect(readme.getByRole('link', { name: 'docs link' })).toHaveAttribute('href', 'https://docs.confighub.com');
  await expect(readme.getByRole('cell', { name: 'port' })).toBeVisible();
  await expect(readme.getByText('relative link')).toBeVisible();
  await expect(readme.getByRole('link', { name: 'relative link' })).toHaveCount(0);
  await expect(readme).not.toContainText('configName');

  await page.getByTestId('component-pane-tab-config').click();
  await expect(readme).toHaveCount(0);
});

test('a Space with neither a README.md Unit nor a release target has no tab bar', async ({ page }) => {
  await page.goto(`/components?app=${COMPONENT_SLUG}`);
  const node = page.getByTestId(`rf__node-${spaceIds[1]}`);
  await expect(node).toBeVisible({ timeout: 20000 });
  await node.click();

  await expect(page.getByText('web', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('component-pane-tab-config')).toHaveCount(0);
  await expect(page.getByTestId('component-pane-tab-readme')).toHaveCount(0);
});
