// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The spec sheet in a wide drawer: each section is a card, the cards are in two columns, and Env
// leaves its container as a card of its own. A part-bar jump still lands clear of the sticky rows.
//
// Each test seeds its own Component with random slugs (seedSpecSheet) and deletes it after.

import { test, expect } from './fixtures/test';
import type { Page } from '@playwright/test';
import { seedSpecSheet, type SeededSpecSheet } from './fixtures/spec-sheet/seedSpecSheet';

async function openSheetAt(page: Page, seeded: SeededSpecSheet, paneWidth: number) {
  await page.goto(`/components?app=${encodeURIComponent(seeded.componentSlug)}&space=${seeded.prod.spaceId}`);
  const pane = page.getByTestId('component-side-pane');
  await expect(pane).toBeVisible({ timeout: 30000 });
  await page.getByTestId('component-filter-all').click();
  const header = pane.getByTestId('unit-header').filter({ hasText: 'openclaw' }).first();
  await expect(header).toBeVisible();
  if ((await pane.getByTestId('field-sheet').count()) === 0) await header.click();
  const sheet = pane.getByTestId('field-sheet');
  await expect(sheet).toBeVisible();
  // Drag the pane's edge until the pane is as wide as asked.
  const width = (await pane.boundingBox())!.width;
  const handle = (await page.getByTestId('component-side-pane-resize').boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + 300;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - (paneWidth - width), y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await pane.boundingBox())!.width)).toBe(paneWidth);
  return sheet;
}

test.describe('Component side pane: spec sheet in a wide drawer', () => {
  let seeded: SeededSpecSheet | undefined;

  test.afterEach(async () => {
    await seeded?.cleanup();
    seeded = undefined;
  });

  for (const [paneWidth, viewport] of [
    [900, 1440],
    [1280, 1920],
  ] as const) {
    test(`at ${paneWidth}px the sections are cards in two columns, Env is a card of its own`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto('/');
      seeded = await seedSpecSheet(page, 'most-items');
      const sheet = await openSheetAt(page, seeded, paneWidth);

      // Metadata and Spec are cards side by side: one top, two lefts, each with its own border.
      const metadata = sheet.getByTestId('part-deployment-metadata');
      const spec = sheet.getByTestId('part-deployment-spec');
      await expect(async () => {
        const a = (await metadata.boundingBox())!;
        const b = (await spec.boundingBox())!;
        expect(Math.abs(a.y - b.y)).toBeLessThan(1);
        expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(16);
      }).toPass({ timeout: 10000 });
      await expect(metadata).toHaveCSS('border-top-width', '1px');
      await expect(metadata).toHaveCSS('border-left-width', '1px');

      // Env leaves its container: a card titled Env, which names the container, holds the block.
      const envCard = sheet.getByTestId('card-container-gateway-env');
      await envCard.scrollIntoViewIfNeeded();
      await expect(envCard.locator('.phead')).toHaveText('Envgateway');
      await expect(envCard.getByTestId('blk-container-gateway-env')).toBeVisible();
      await expect(sheet.getByTestId('part-container-gateway').getByTestId('blk-container-gateway-env')).toHaveCount(0);
      await expect(sheet.getByTestId('part-container-gateway').getByTestId('blk-container-gateway-image')).toBeVisible();

      // In a card, no key reference is cut: each lies inside its card.
      const card = (await envCard.boundingBox())!;
      for (const ref of await envCard.getByTestId('env-key-ref').all()) {
        const box = (await ref.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
      }

      // A part-bar jump lands the section 12px clear of the part bar, not under it.
      await sheet.getByTestId('part-nav').getByTestId('part-nav-container-gateway').click();
      await expect(sheet).not.toHaveAttribute('data-jump', 'settling');
      const bar = (await sheet.getByTestId('part-bar').boundingBox())!;
      const section = (await sheet.getByTestId('part-container-gateway').boundingBox())!;
      expect(Math.round(section.y - (bar.y + bar.height))).toBe(12);
      await expect(sheet.getByTestId('part-nav').locator('[aria-current="true"]')).toHaveAttribute(
        'data-testid',
        'part-nav-container-gateway',
      );
    });
  }
});
