// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { PathChange, PathSegment, ResourceDiff } from '@confighub/rtk-query';
import { type Page, expect, test } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ReleaseDiffUnitView } from '../src/pages/x/apps/ReleaseDiffPanel';

const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The Releases tab sits in a side pane that is only a few hundred pixels wide. A
 * container image tag is one unbreakable monospace word (a commit SHA is 40
 * characters), so a row that cannot wrap pushes past the pane and the pane
 * grows a horizontal scrollbar. The real panel is bundled and mounted in a
 * browser page, because layout is the thing under test and Node cannot load it.
 */

const field = (name: string): PathSegment => ({ Field: name, FromIndex: -1, ToIndex: -1 });
const container = (name: string): PathSegment => ({
  MergeKeys: [{ Key: 'name', Value: name }],
  FromIndex: 0,
  ToIndex: 0,
});
const POD = [
  field('spec'),
  field('template'),
  field('spec'),
  field('containers'),
  container('ui'),
];

function change(segments: PathSegment[], from: string, to: string): PathChange {
  const path = segments.map((s) => s.Field ?? s.MergeKeys?.[0]?.Value ?? '0').join('.');
  return {
    Path: path,
    DisplayPath: path,
    Segments: segments,
    ChangeType: 'Update',
    FromValue: from,
    ToValue: to,
    FromDataType: 'string',
    ToDataType: 'string',
  };
}

const LONG_VALUE =
  'https://registry.example.com/a/very/long/path/with/no/spaces/' + 'x'.repeat(80);

function unit(from: string, to: string): ReleaseDiffUnitView {
  const resource: ResourceDiff = {
    Resource: {
      ResourceType: 'apps/v1/Deployment',
      ResourceName: 'ui-pr-5648/ui',
      ResourceNameWithoutScope: 'ui',
    },
    ChangeType: 'Update',
    Changes: [
      { ...change([...POD, field('name')], 'ui', 'ui'), ChangeType: 'None' },
      change([...POD, field('image')], from, to),
      change(
        [field('metadata'), field('annotations'), field('homepage')],
        LONG_VALUE,
        LONG_VALUE + 'y',
      ),
    ],
  };
  return {
    unitId: 'u1',
    slug: 'ui-with-a-fairly-long-unit-slug',
    result: { diff: { Resources: [resource] }, changes: 2, added: false },
  };
}

const siblingContainer = (name: string, index: number): PathSegment => ({
  MergeKeys: [{ Key: 'name', Value: name }],
  FromIndex: index,
  ToIndex: index,
});
const POD_PATH = POD.slice(0, 4);

/** The server's context entry for a container that did not change: its whole block, as YAML. */
const unchangedSidecar: PathChange = {
  Path: 'spec.template.spec.containers.1',
  DisplayPath: 'spec.template.spec.containers.1',
  Segments: [...POD_PATH, siblingContainer('sidecar', 1)],
  ChangeType: 'None',
  ToValue: 'name: sidecar\nimage: "ghcr.io/acme/sidecar:2.3.1"',
  ToDataType: 'YAML',
};

function unitOf(changes: PathChange[]): ReleaseDiffUnitView {
  const resource: ResourceDiff = {
    Resource: {
      ResourceType: 'apps/v1/Deployment',
      ResourceName: 'ui-pr-5648/ui',
      ResourceNameWithoutScope: 'ui',
    },
    ChangeType: 'Update',
    Changes: changes,
  };
  return {
    unitId: 'u2',
    slug: 'ui',
    result: { diff: { Resources: [resource] }, changes: 1, added: false },
  };
}

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import { createElement } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ReleaseDiffPanel } from '@/pages/x/apps/ReleaseDiffPanel';
        window.mountPanel = (el, units) =>
          createRoot(el).render(createElement(ReleaseDiffPanel, {
            fromLabel: 'a', toLabel: 'b', units, isLoading: false, emptySubtitle: '',
          }));
      `,
      resolveDir: UI_ROOT,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    alias: { '@': path.join(UI_ROOT, 'src') },
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  bundle = result.outputFiles[0].text;
});

async function mount(page: Page, width: number, from: string, to: string): Promise<void> {
  await mountUnits(page, width, [unit(from, to)]);
}

async function mountUnits(
  page: Page,
  width: number,
  units: ReleaseDiffUnitView[],
): Promise<void> {
  await page.setContent(
    `<!doctype html><html><body style="margin:0"><div id="pane" style="width:${width}px;overflow-x:auto"></div></body></html>`,
  );
  await page.addScriptTag({ content: bundle });
  await page.evaluate((units) => {
    (window as unknown as { mountPanel: (el: HTMLElement, u: unknown) => void }).mountPanel(
      document.getElementById('pane')!,
      units,
    );
  }, units);
}

const sha = (c: string) => `ui-${c.repeat(40)}`;

async function overflow(page: Page) {
  return page.evaluate(() => {
    const pane = document.getElementById('pane')!;
    const stray = [...pane.querySelectorAll<HTMLElement>('*')]
      .filter(
        (el) => el.getBoundingClientRect().right > pane.getBoundingClientRect().right + 0.5,
      )
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 60));
    return { scrollWidth: pane.scrollWidth, clientWidth: pane.clientWidth, stray };
  });
}

test.describe('Releases pane fit', () => {
  for (const width of [380, 480, 900]) {
    test(`two 40-hex image tags stay inside a ${width}px pane`, async ({ page }) => {
      await mount(page, width, `ghcr.io/acme/ui:${sha('a')}`, `ghcr.io/acme/ui:${sha('b')}`);
      await expect(page.getByTestId('release-diff-image-row')).toBeVisible();
      const m = await overflow(page);
      expect(m.scrollWidth, JSON.stringify(m)).toBeLessThanOrEqual(m.clientWidth);
    });
  }

  for (const width of [380, 480, 900]) {
    test(`an unchanged row beside a changed one shows its tag once, plain, in a ${width}px pane`, async ({
      page,
    }) => {
      const api = [...POD_PATH, container('ui')];
      await mountUnits(page, width, [
        unitOf([
          { ...change([...api, field('name')], 'ui', 'ui'), ChangeType: 'None' },
          change([...api, field('image')], 'ghcr.io/acme/ui:1.0.0', 'ghcr.io/acme/ui:1.1.0'),
          unchangedSidecar,
        ]),
      ]);
      const rows = page.getByTestId('release-diff-image-row');
      await expect(rows).toHaveCount(2);
      const [changed, same] = [
        rows.filter({ hasText: '1.1.0' }),
        rows.filter({ hasText: 'sidecar' }),
      ];
      await expect(changed.getByTestId('release-diff-image-delta')).toHaveCount(1);
      await expect(same.getByTestId('release-diff-image-delta')).toHaveCount(0);
      const current = same.getByTestId('release-diff-image-current');
      await expect(current).toHaveText('2.3.1');
      // One tag, no chips and no arrow: nothing in the row is a transition.
      await expect(same.locator('svg')).toHaveCount(0);
      await expect(same).toHaveCSS('opacity', '0.45');
      const m = await overflow(page);
      expect(m.scrollWidth, JSON.stringify(m)).toBeLessThanOrEqual(m.clientWidth);
    });
  }

  test('a resource that changed only in metadata draws no image row', async ({ page }) => {
    await mountUnits(page, 480, [
      unitOf([
        change([field('metadata'), field('labels'), field('team')], 'a', 'b'),
        unchangedSidecar,
      ]),
    ]);
    await expect(page.getByText('team')).toBeVisible();
    await expect(page.getByTestId('release-diff-image-row')).toHaveCount(0);
  });

  test('a short tag stays on one line', async ({ page }) => {
    await mount(page, 480, 'ghcr.io/acme/ui:1.2.3', 'ghcr.io/acme/ui:1.2.4');
    const delta = page.getByTestId('release-diff-image-delta');
    const box = await delta.boundingBox();
    const lineHeight = await delta.evaluate(
      (el) => parseFloat(getComputedStyle(el).fontSize) * 2,
    );
    expect(box!.height).toBeLessThan(lineHeight);
    const m = await overflow(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
  });
});
