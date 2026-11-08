// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse, Page } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';

/**
 * The configuration editor marks the lines guards are recorded on, in its gutter, and hovering a
 * mark names the guards. A Unit of two resources, the Service first, so a guard placed by the
 * position of its document would land in the wrong one.
 */

const SERVICE = `apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: default
spec:
  type: ClusterIP
`;

const DEPLOYMENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: sidecar
          image: envoy:1.30
        - name: web
          image: nginx:1.27
`;

const DATA = `${SERVICE}---\n${DEPLOYMENT}`;

/** The 1-based line of `data` that is `text`, the nth (from 0) such line. */
const lineOf = (text: string, nth = 0) => {
  const lines = DATA.split('\n');
  let seen = -1;
  const index = lines.findIndex((line) => line === text && ++seen === nth);
  if (index < 0) throw new Error(`no line ${text}`);
  return index + 1;
};

const body = async <T>(response: APIResponse, what: string): Promise<T> => {
  if (!response.ok())
    throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
};

/** The line numbers the gutter marks. */
const markedLines = (page: Page) =>
  page
    .locator('.monaco-editor .line-numbers.code-editor-gutter-mark')
    .evaluateAll((nodes) =>
      nodes.map((node) => Number(node.textContent)).sort((a, b) => a - b),
    );

/** What hovering the gutter mark on a line says. */
const hoverText = async (page: Page, line: number) => {
  const editor = page.locator('div.monaco-editor');
  const number = editor.locator('.line-numbers.code-editor-gutter-mark', {
    hasText: new RegExp(`^${line}$`),
  });
  const numberBox = await number.boundingBox();
  const glyphBox = await editor.locator('.glyph-margin').boundingBox();
  if (!numberBox || !glyphBox) throw new Error(`line ${line} is not drawn`);
  // Away first, so the hover of the previous mark closes.
  await page.mouse.move(0, 0);
  await page.mouse.move(glyphBox.x + glyphBox.width / 2, numberBox.y + numberBox.height / 2);
  const hover = page.locator('.monaco-hover:not(.hidden)').filter({ hasText: 'Guarded' });
  await expect(hover).toBeVisible();
  return (await hover.innerText()).trim();
};

test.describe('guarded lines in the configuration editor', () => {
  // Tall enough for the editor to draw every line, so each mark can be hovered.
  test.use({ viewport: { width: 1280, height: 1000 } });

  let spaceId = '';
  let unitId = '';

  test.beforeEach(async () => {
    const slug = `guard-gutter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, { data: DATA }),
      'unit data',
    );
    await body(
      await hubApi.post(`/api/space/${spaceId}/unit/${unitId}/guard`, {
        data: {
          ResourceGuards: [
            {
              Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'default/web' },
              Set: {
                'spec.replicas': { Scale: 'RegionSpecific' },
                'spec.template.spec.containers.?name=web.image': { RunAsRoot: 'LegacyImage' },
              },
              SetInherited: {
                'spec.template.spec.containers.?name=sidecar': { Link: 'TransformPaths' },
              },
            },
            {
              Resource: { ResourceType: 'v1/Service', ResourceName: 'default/web' },
              Set: { '': { Exposure: 'Internal' } },
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

  test('marks each guarded line, and the hover names its guards', async ({ page }) => {
    await page.goto(`/units/${spaceId}/${unitId}?tab=1`);
    const editor = page.locator('div.monaco-editor');
    await expect(editor).toContainText('nginx:1.27', { timeout: 20000 });

    const expected = {
      service: 1, // the Service's first line: a guard on the resource as a whole
      replicas: lineOf('  replicas: 2'),
      sidecar: lineOf('        - name: sidecar'),
      image: lineOf('          image: nginx:1.27'),
    };
    await expect
      .poll(() => markedLines(page))
      .toEqual(Object.values(expected).sort((a, b) => a - b));

    expect(await hoverText(page, expected.replicas)).toBe('Guarded: Scale=RegionSpecific');
    expect(await hoverText(page, expected.image)).toBe('Guarded: RunAsRoot=LegacyImage');
    expect(await hoverText(page, expected.sidecar)).toBe(
      'Guarded: Link=TransformPaths (inherited)',
    );
    expect(await hoverText(page, expected.service)).toBe('Guarded: Exposure=Internal');

    // Editing, the marks stay.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect
      .poll(() => markedLines(page))
      .toEqual(Object.values(expected).sort((a, b) => a - b));
  });
});
