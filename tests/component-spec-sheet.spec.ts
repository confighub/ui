// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The spec sheet of the Component side pane, on a seeded Unit: every field drawn once, in the
// order of the model (the stored document), with the stage key the staging code uses.
//
// Each test seeds its own Component with random slugs (seedSpecSheet) and deletes it after.

import { test, expect } from './fixtures/test';
import type { Locator, Page } from '@playwright/test';
import { seedSpecSheet, type SeededSpecSheet } from './fixtures/spec-sheet/seedSpecSheet';
import { buildSpecSheet } from '../src/pages/x/apps/spec-sheet/specSheetModel';

/** How a text wraps: its lines, and how many of its unbroken segments are split over two lines. */
async function wrapOf(locator: Locator): Promise<{ lines: number; splitSegments: number }> {
  return locator.evaluate((el) => {
    const tops = (node: Node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      // A line break can leave an empty rect at the start of the next line: it holds no text.
      return [...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top));
    };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const lines = new Set<number>();
    let splitSegments = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = tops(n);
      if (new Set(t).size > 1) splitSegments++;
      for (const top of t) lines.add(top);
    }
    return { lines: lines.size, splitSegments };
  });
}

async function openSheet(page: Page, seeded: SeededSpecSheet) {
  await page.goto(`/components?app=${encodeURIComponent(seeded.componentSlug)}&space=${seeded.prod.spaceId}`);
  const pane = page.getByTestId('component-side-pane');
  await expect(pane).toBeVisible({ timeout: 30000 });
  await page.getByTestId('component-filter-all').click();
  const header = pane.getByTestId('unit-header').filter({ hasText: 'openclaw' }).first();
  await expect(header).toBeVisible();
  if ((await pane.getByTestId('field-sheet').count()) === 0) await header.click();
  const sheet = pane.getByTestId('field-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Scrolls the pane to the end so every part mounts, then reads the drawn stage keys in order. */
async function drawnStageKeys(page: Page): Promise<string[]> {
  const sheet = page.getByTestId('field-sheet');
  // A quiet init container folds to one line; open each, so all its fields draw.
  const folds = sheet.locator('[data-testid^="part-fold-"]');
  while ((await folds.count()) > 0) await folds.first().click();
  let previous = -1;
  for (let i = 0; i < 40; i++) {
    const count = await sheet.locator('[data-stage-key]').count();
    if (count === previous) break;
    previous = count;
    await sheet.evaluate((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node && !['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) node = node.parentElement;
      if (node) node.scrollTop = node.scrollHeight;
    });
    await expect.poll(async () => sheet.locator('[data-stage-key]').count()).toBeGreaterThanOrEqual(count);
  }
  return sheet.locator('[data-stage-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-stage-key') ?? ''));
}

test.describe('Component side pane: spec sheet', () => {
  let seeded: SeededSpecSheet | undefined;

  test.afterEach(async () => {
    await seeded?.cleanup();
    seeded = undefined;
  });

  test('All draws every field once, in the order of the stored document', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);

    await expect(sheet.getByTestId('res-head-deployment-openclaw')).toContainText('Deployment');
    await expect(sheet.getByTestId('field-value-deployment-metadata-name')).toHaveText('openclaw');
    await expect(sheet.getByTestId('part-title-container-gateway')).toHaveText('gateway');
    await expect(sheet.getByTestId('field-value-deployment-spec-replicas')).toHaveText('2');

    const model = buildSpecSheet(seeded.prodData, { scopedWritesSupported: true });
    const drawn = await drawnStageKeys(page);
    // A quiet `optional` of a key reference is said in the reference's hover card, not drawn;
    // so are the quiet Kubernetes defaults of a value (two pull policies, one port's protocol).
    const quietOptional = model.atoms.filter((a) => /\.valueFrom\.(secret|configMap)KeyRef\.optional$/.test(a.path));
    expect(quietOptional).toHaveLength(4);
    const quietDefaults = [
      'spec.template.spec.containers.0.imagePullPolicy',
      'spec.template.spec.containers.0.ports.0.protocol',
      'spec.template.spec.initContainers.0.imagePullPolicy',
    ];
    const notDrawn = (a: { path: string }) => quietOptional.some((o) => o.path === a.path) || quietDefaults.includes(a.path);
    expect(drawn).toEqual(model.atoms.filter((a) => !notDrawn(a)).map((a) => a.key));
    await expect(sheet.locator('[data-key-optional="true"]')).toHaveCount(4);
    // The All count is the contract's count of the fields: 83 of the 105 the sheet holds, as
    // apiVersion, kind and the name of each list element name a resource or a row.
    expect(model.atoms).toHaveLength(105);
    await expect(page.getByTestId('component-filter-all')).toHaveAccessibleName('All, 83');
  });

  test('search keeps the blocks with a match and finds parts not mounted yet', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);

    await page.getByTestId('component-search').locator('input').fill('OPENROUTER');
    await expect(sheet.getByTestId('blk-container-gateway-env')).toBeVisible();
    await expect(sheet.getByTestId('blk-container-gateway-image')).toBeHidden();
    await expect(sheet.getByTestId('part-deployment-metadata')).toBeHidden();

    // The matches are marked in the text, inside values too, with an underline and no fill;
    // the field says how many fields match.
    await page.getByTestId('component-search').locator('input').fill('openclaw');
    await expect(page.getByTestId('component-search-count')).toHaveText(/^\d+ match(es)?$/);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const h = CSS.highlights.get('sheet-search');
          return h ? [...h].map((r) => (r as Range).toString().toLowerCase()) : [];
        }),
      )
      .toContain('openclaw');
    const inValue = await page.evaluate(() =>
      [...(CSS.highlights.get('sheet-search') ?? [])].some((r) =>
        (r as Range).startContainer.parentElement?.closest('[data-path="metadata.labels.app"]'),
      ),
    );
    expect(inValue).toBe(true);
    const headerMatch = page.getByTestId('component-side-pane').getByTestId('unit-header-match').first();
    await expect(headerMatch).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(headerMatch).toHaveCSS('text-decoration-line', 'underline');
    // In the text colour, not rust: a match does not look like a link.
    await expect(headerMatch).toHaveCSS('text-decoration-color', 'rgb(17, 18, 20)');
    expect(
      await page.evaluate(() =>
        [...document.styleSheets].flatMap((ss) => {
          try {
            return [...ss.cssRules].map((r) => r.cssText).filter((t) => t.includes('highlight(sheet-search)'));
          } catch {
            return [];
          }
        }),
      ),
    ).toEqual([expect.stringContaining('text-decoration-color: rgb(17, 18, 20)')]);

    // A search with no match in the Unit: the pane leaves the Unit out, so no sheet draws.
    await page.getByTestId('component-search').locator('input').fill('no-such-field-anywhere');
    await expect(page.getByTestId('field-sheet')).toHaveCount(0);
  });

  test('at 480px an env name is never cut, and a key reference is never split at its "/"', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);
    // Drag the pane's edge until the pane is 480px wide.
    const pane = page.getByTestId('component-side-pane');
    const width = (await pane.boundingBox())!.width;
    const handle = (await page.getByTestId('component-side-pane-resize').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + 300;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (width - 480), y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await pane.boundingBox())!.width)).toBe(480);

    const env = sheet.getByTestId('blk-container-gateway-env');
    await env.scrollIntoViewIfNeeded();
    // No name is cut: each shows all its text, on more lines where it is long.
    const cut = await env.evaluate((el) =>
      // The text of the name, not the value's hover padding, must lie inside its cell.
      [...el.querySelectorAll<HTMLElement>('.en')]
        .filter((n) => {
          const cell = n.getBoundingClientRect().right;
          const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
          for (let t = walker.nextNode(); t; t = walker.nextNode()) {
            const range = document.createRange();
            range.selectNodeContents(t);
            if (range.getBoundingClientRect().right > cell + 0.5) return true;
          }
          return getComputedStyle(n).textOverflow === 'ellipsis';
        })
        .map((n) => n.textContent),
    );
    expect(cut).toEqual([]);
    // The name column takes the width its names need (up to 40%): a long name is on one line,
    // or wraps only after an underscore, with no segment split over two lines.
    const longName = env.locator('.en', { hasText: 'OPENCLAW_GATEWAY_TOKEN' }).locator('.v');
    expect((await wrapOf(longName)).splitSegments).toBe(0);
    // A key reference is one unit on one line: beside its name where it fits, else on a row of
    // its own under the name. It is never split at the "/".
    const refs = env.getByTestId('env-key-ref');
    expect(await refs.count()).toBeGreaterThan(0);
    for (const ref of await refs.all()) {
      // All its parts on one line: their middles are within a few pixels of each other.
      const spread = await ref.evaluate((el) => {
        const mids = [...el.children].map((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2; });
        return Math.max(...mids) - Math.min(...mids);
      });
      expect(spread).toBeLessThan(8);
      const name = (await ref.locator('xpath=..').locator('.en').boundingBox())!;
      const box = (await ref.boundingBox())!;
      const under = await ref.evaluate((el) => el.classList.contains('under'));
      if (under) expect(box.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
      else expect(Math.abs(box.y - name.y)).toBeLessThan(6);
    }
    // A quiet `optional` is not on the line: the reference's hover card says it, on its key.
    await expect(env.getByRole('img', { name: 'Optional' })).toHaveCount(0);
    const optionalRef = env.locator('[data-key-optional="true"]').first();
    await optionalRef.locator('.skey .v').hover();
    await expect(page.getByTestId('field-peek-optional')).toHaveText('Optional: the container starts even when this key is missing');
  });

  test('the sheet has three heading levels: section, block, field', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);
    // A block that groups fields (Image) is a level above a plain field's label (Namespace).
    const block = sheet.getByTestId('blk-label-container-gateway-image');
    const field = sheet.getByTestId('blk-label-deployment-metadata-namespace');
    await expect(block).toHaveCSS('font-weight', '600');
    await expect(block).toHaveCSS('color', 'rgb(17, 18, 20)');
    await expect(field).toHaveCSS('font-weight', '400');
    await expect(field).toHaveCSS('color', 'rgb(80, 89, 105)');
    await expect(sheet.getByTestId('part-title-deployment-metadata')).toHaveCSS('font-weight', '700');
    // Secondary text keeps 4.5:1 on white: keys and the tiles' micro-labels are fgMuted.
    await expect(sheet.locator('.pair .k').first()).toHaveCSS('color', 'rgb(80, 89, 105)');
    await expect(sheet.locator('.ctile .cl').first()).toHaveCSS('color', 'rgb(80, 89, 105)');
    // Token keys (app=, environment=) and the unit in a tile value (cpu) too.
    await expect(sheet.locator('.tk').first()).toHaveCSS('color', 'rgb(80, 89, 105)');
    // An inherited key=value token: the key muted, the value in the default text colour.
    const appToken = sheet.getByTestId('field-value-deployment-metadata-labels-app');
    await expect(appToken).not.toHaveClass(/\bhere\b/);
    await expect(appToken).toHaveCSS('color', 'rgb(17, 18, 20)');
    await expect(sheet.locator('.ctile .dim').first()).toHaveCSS('color', 'rgb(80, 89, 105)');
    // A heading block has its icon, and its label on top: its content starts at its left edge.
    await expect(block.locator('svg.bicon')).toBeVisible();
    const label = (await block.boundingBox())!;
    const body = (await sheet.getByTestId('blk-container-gateway-image').locator('.bbody').boundingBox())!;
    expect(body.y).toBeGreaterThanOrEqual(label.y + label.height);
    expect(Math.round(body.x)).toBe(Math.round(label.x));
    // A plain field keeps its label beside its value.
    const fieldBody = (await sheet.getByTestId('blk-deployment-metadata-namespace').locator('.bbody').boundingBox())!;
    expect(fieldBody.x).toBeGreaterThan((await field.boundingBox())!.x + 40);
  });

  test('a value set in this Unit is bold; an inherited one is not', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);

    // prod sets replicas and the environment label; the image comes from base.
    await expect(sheet.getByTestId('field-value-deployment-spec-replicas')).toHaveClass(/\bhere\b/);
    await expect(sheet.getByTestId('field-value-deployment-metadata-labels-environment')).toHaveClass(/\bhere\b/);
    await expect(sheet.getByTestId('field-value-container-gateway-image')).not.toHaveClass(/\bhere\b/);
    await expect(sheet.getByTestId('field-value-container-gateway-image')).not.toHaveClass(/\bunk\b/);
    // Local overrides counts each overridden field once ("Local only" folded in, D36), as many
    // as the scope draws: the values of the Unit's blocks that the scope keeps.
    await page.getByTestId('scope-local').click();
    const localValues = sheet.locator('.bbody [data-testid^="field-value-"]');
    await expect(localValues.first()).toBeVisible();
    const local = await localValues.count();
    await expect(page.getByTestId('scope-local')).toHaveAccessibleName(`Local overrides, ${local}`);
    await page.getByTestId('component-filter-all').click();
    // The peek of a value set here says so and gives its path, and names no Unit or Revision.
    await sheet.getByTestId('field-value-deployment-spec-replicas').focus();
    await expect(page.getByTestId('field-peek')).toHaveText(/^Set in this Unit\s*spec\.replicas$/);
    // A long path wraps only after a dot: no segment is split over two lines.
    await page.mouse.move(0, 0);
    const longValue = sheet.locator('[data-path="spec.template.spec.containers.0.env.7.valueFrom.secretKeyRef.name"]');
    await longValue.focus();
    const longPath = page.getByTestId('field-peek-path');
    await expect(longPath).toContainText('secretKeyRef');
    expect(await longPath.locator('wbr').count()).toBeGreaterThan(3);
    const split = await wrapOf(longPath);
    expect(split.lines).toBeGreaterThan(1);
    expect(split.splitSegments).toBe(0);
    await sheet.getByTestId('field-value-deployment-spec-replicas').focus();

    // The path in t3, the eyebrow in the sans face.
    // The path is text to read: fgMuted (7.06:1), not t3 (2.86:1).
    await expect(page.getByTestId('field-peek-path')).toHaveCSS('color', 'rgb(80, 89, 105)');
    await expect(page.getByTestId('field-peek').getByText('Set in this Unit')).toHaveCSS('font-family', /Manrope/);
  });

  test('a field behind upstream carries the Stale mark on its value and its part-bar chip only', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'changes');
    const sheet = await openSheet(page, seeded);

    await expect(sheet.getByTestId('field-state-container-gateway-image')).toBeVisible();
    // One mark per field: on the value, not again on the label.
    await expect(sheet.getByTestId('blk-label-container-gateway-image').getByRole('img')).toHaveCount(0);
    // Not on the section heading nor on the resource heading: one mark per field, and the
    // part bar's chip says which section holds it.
    const part = sheet.locator('[data-testid^="part-"]:has([data-testid="blk-container-gateway-image"])');
    await expect(part.locator('.phead').getByRole('img')).toHaveCount(0);
    await expect(sheet.locator('.rhead').getByRole('img', { name: 'Stale' })).toHaveCount(0);
    const chipMark = sheet.getByTestId('part-nav-container-gateway').getByRole('img', { name: 'Stale' });
    await expect(chipMark).toHaveCount(1);
    // The Incoming fields are the Stale fields: the Incoming chip, the field and the part bar
    // have one icon.
    const iconOf = async (l: Locator) => l.locator('path').first().getAttribute('d');
    const staleIcon = await iconOf(sheet.getByTestId('field-state-container-gateway-image'));
    expect(await iconOf(page.getByTestId('scope-incoming'))).toBe(staleIcon);
    expect(await iconOf(chipMark)).toBe(staleIcon);
    // The card says it in words, in the sans face with the state's icon; the path stays mono.
    await sheet.getByTestId('field-value-container-gateway-image').hover();
    const staleLine = page.getByTestId('field-peek-stale');
    await expect(staleLine).toHaveText('Stale');
    // In the upgrade ink (5.70:1), not the chip's lighter violet (4.34:1).
    await expect(staleLine.locator('span').first()).toHaveCSS('color', 'rgb(124, 58, 237)');
    await expect(staleLine.locator('span').first()).toHaveCSS('font-family', /Manrope/);
    await expect(staleLine.locator('svg')).toBeVisible();
    await expect(page.getByTestId('field-peek-path')).toHaveCSS('font-family', /Mono/i);
    // Outside Incoming too, the card says what upstream has: the value now, then the value the
    // upgrade makes it.
    await expect(page.getByTestId('incoming-tooltip-container-gateway-image')).toHaveText(
      /^Current\s*ghcr\.io\/openclaw\/openclaw:slim\s*Incoming\s*ghcr\.io\/openclaw\/openclaw:2026\.11\.1-slim$/,
    );
    await expect(sheet.getByTestId('field-state-deployment-spec-replicas')).toHaveCount(0);
  });

  test('the Changes chip counts the Unreleased fields: the set the Changes scope draws', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'changes', 'openclaw', { release: true });
    const sheet = await openSheet(page, seeded);
    const chip = page.getByTestId('scope-changes');
    const countOf = async () => Number((await chip.getAttribute('aria-label'))!.split(', ')[1]);
    const drawn = sheet.locator('.bbody [data-stage-key]');
    // On arrival: the Unreleased fields, as many as the scope draws.
    await expect(sheet.getByTestId('field-state-deployment-spec-replicas')).toHaveAccessibleName('Unreleased changes', { timeout: 30000 });
    await expect.poll(countOf).toBeGreaterThan(0);
    const before = await countOf();
    // Its hover card says what the count is: the Unreleased fields.
    await chip.hover();
    await expect(page.getByRole('tooltip')).toHaveText(`Changes${before} unreleased`);
    await chip.click();
    await expect(drawn).toHaveCount(before);
    // A staged edit does not change the count: staged edits show in the footer only.
    await page.getByTestId('component-filter-all').click();
    const replicas = sheet.getByTestId('field-value-deployment-spec-replicas');
    await replicas.click();
    await sheet.getByTestId('field-editor-input').fill('7');
    await sheet.getByTestId('field-editor-confirm').click();
    await expect(replicas).toHaveClass(/staged/);
    expect(await countOf()).toBe(before);
    await page.mouse.move(0, 0);
    await chip.hover();
    await expect(page.getByRole('tooltip')).toHaveText(`Changes${before} unreleased`);
    await page.mouse.move(0, 0);
    // With an edit staged, the upstream changes keep their entry, left of Discard and Update.
    const review = page.getByTestId('component-review-incoming-button');
    const update = page.getByTestId('component-upgrade-button');
    await expect(update).toHaveText('Update 1');
    await expect(review).toHaveText(/^Review \d+ incoming$/);
    expect((await review.boundingBox())!.x).toBeLessThan((await page.getByTestId('component-discard-staged-button').boundingBox())!.x);
    await chip.click();
    await expect(drawn).toHaveCount(before);
  });

  test('Incoming ticks the upstream changes in the sheet, and Upgrade writes them', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'changes');
    await page.goto(`/components?app=${encodeURIComponent(seeded.componentSlug)}&space=${seeded.prod.spaceId}`);
    const pane = page.getByTestId('component-side-pane');
    // Outside Incoming, with nothing staged, the footer is one quiet button to review them.
    await page.getByTestId('component-filter-all').click();
    const review = page.getByTestId('component-review-incoming-button');
    await expect(review).toHaveText(/^Review \d+ incoming$/, { timeout: 30000 });
    // A violet text button with the Stale up arrow, not grey text.
    await expect(review).toHaveCSS('color', 'rgb(124, 58, 237)');
    await expect(review.locator('svg path').first()).toHaveAttribute('d', 'M8 12V4M4 8l4-4 4 4');
    await expect(page.getByTestId('component-upgrade-button')).toHaveCount(0);
    await review.click();
    await expect(page.getByTestId('scope-incoming')).toHaveAttribute('aria-pressed', 'true');
    const tick = pane.getByTestId('incoming-tick-container-gateway-image').locator('input');
    await expect(tick).toBeChecked({ timeout: 30000 });
    // One value in its place: the image it becomes, its changed tokens marked in the upgrade
    // violet (the tree's inline diff). The current image is not drawn beside it.
    const image = pane.getByTestId('incoming-value-container-gateway-image');
    await expect(image).toHaveText('ghcr.io/openclaw/openclaw:2026.11.1-slim');
    await expect(pane.getByTestId('field-value-container-gateway-image')).toHaveCount(1);
    const changed = image.locator('[data-fidelity="token-changed"]');
    await expect(changed.first()).toContainText('2026');
    await expect(image.locator('[data-fidelity="token-kept"]').first()).toContainText('ghcr');
    // One hover card, not two: the value's card shows the current value and the incoming one,
    // each under its label (CURRENT, then INCOMING).
    await image.hover();
    await expect(page.locator('.fpeek-card')).toHaveCount(1);
    // The card's Popper is the only tooltip on the page.
    await expect(page.getByRole('tooltip')).toHaveCount(1);
    await expect(page.getByRole('tooltip').locator('.fpeek-card')).toHaveCount(1);
    const incomingBlock = page.locator('.fpeek-card').getByTestId('incoming-tooltip-container-gateway-image');
    await expect(incomingBlock).toHaveText(/^Current.*Incoming.*Tick to upgrade this field$/);
    await expect(page.getByTestId('incoming-tooltip-container-gateway-image')).toContainText('Current');
    await expect(page.getByTestId('incoming-tooltip-container-gateway-image')).toContainText('ghcr.io/openclaw/openclaw:slim');
    await expect(page.getByTestId('incoming-tooltip-container-gateway-image')).toContainText('ghcr.io/openclaw/openclaw:2026.11.1-slim');
    await expect(page.getByTestId('incoming-tooltip-container-gateway-image')).toContainText('Incoming');
    // The value wraps only after ".", "/", ":" or "-": no segment is split.
    const tooltip = page.getByTestId('incoming-tooltip-container-gateway-image');
    expect(await tooltip.locator('wbr').count()).toBeGreaterThan(3);
    expect((await wrapOf(tooltip)).splitSegments).toBe(0);
    await page.mouse.move(0, 0);
    // Only incoming fields are drawn.
    await expect(pane.getByTestId('field-value-deployment-spec-replicas')).toHaveCount(0);
    // Probes: only the changed timing is drawn, next to its probe (no empty check column), and
    // in the sheet's format, with its unit.
    const probes = pane.locator('.pgrid');
    await expect(probes.locator('.h', { hasText: 'check' })).toHaveCount(0);
    const delay = probes.locator('[data-testid^="incoming-value-"]').first();
    await expect(delay).toHaveText('45s');
    // Its hover card writes both values as the sheet does, with the unit.
    await delay.hover();
    const delayCard = page.locator('[data-testid^="incoming-tooltip-"]').filter({ hasText: '45s' });
    await expect(delayCard).toContainText('60s');
    await page.mouse.move(0, 0);
    const name = (await probes.locator('.rl', { hasText: 'liveness' }).boundingBox())!;
    expect((await delay.boundingBox())!.x - (name.x + name.width)).toBeLessThan(120);
    // The ticks were set on entry: Discard waits until the person changes them.
    const discard = page.getByTestId('component-discard-staged-button');
    await expect(discard).toHaveCount(0);
    await tick.click();
    await expect(discard).toBeVisible();
    await tick.click();
    await expect(discard).toHaveCount(0);

    await page.getByTestId('component-upgrade-button').click();
    await expect(pane.getByTestId('scope-empty')).toHaveText('Nothing incoming', { timeout: 30000 });
    // The line is in normal ink: the open Unit is not dimmed for having nothing incoming.
    // (The pointer leaves the Upgrade button first: hovering it dims what it would not change.)
    await page.mouse.move(0, 0);
    await expect(pane.getByTestId('unit-card').filter({ has: page.getByTestId('scope-empty') })).not.toHaveClass(/unit-unchanged/);
    await page.getByTestId('component-filter-all').click();
    await expect(pane.getByTestId('field-value-container-gateway-image')).toContainText('2026.11.1-slim');
  });

  test('a click on a value opens its editor; check stages, Update writes', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);

    const value = sheet.getByTestId('field-value-container-gateway-env-node-env');
    await value.click();
    const input = sheet.getByTestId('field-editor-input');
    await expect(input).toBeFocused();
    await input.fill('staging');
    // A click away keeps the draft open (D34).
    await sheet.getByTestId('part-title-container-gateway').click();
    await expect(input).toHaveValue('staging');
    await sheet.getByTestId('field-editor-confirm').click();
    await expect(sheet.getByTestId('field-staged-container-gateway-env-node-env')).toBeVisible();
    // Its changed tokens are marked in the edit hue: staging, against production.
    await expect(value.locator('[data-fidelity="token-changed"]').first()).toContainText('staging');
    // A staged value is a 22px chip.
    expect((await value.boundingBox())?.height).toBe(22);

    // The image editor holds the whole reference: the repository grey in the box, the tag typed.
    await sheet.getByTestId('field-value-container-gateway-image').click();
    const editor = sheet.getByTestId('field-editor');
    await expect(editor.locator('.fedit-prefix')).toHaveText('ghcr.io/openclaw/openclaw:');
    await expect(sheet.getByTestId('field-editor-input')).toHaveValue('slim');
    await sheet.getByTestId('field-editor-cancel').click();
    await expect(page.getByTestId('component-upgrade-button')).toHaveText('Update 1');

    // An invalid quantity keeps the editor open with its error and a disabled check.
    await sheet.getByTestId('field-value-container-gateway-resources-limits-memory').click();
    await sheet.getByTestId('field-editor-input').fill('4 GB');
    await expect(sheet.getByTestId('field-editor-error')).toHaveText('Not a quantity: try 4Gi');
    await expect(sheet.getByTestId('field-editor-confirm')).toBeDisabled();
    await sheet.getByTestId('field-editor-input').press('Escape');
    await expect(sheet.getByTestId('field-editor')).toHaveCount(0);

    // The staged edit stays across a scope switch (rule 9).
    await page.getByTestId('scope-local').click();
    await page.getByTestId('component-filter-all').click();
    await expect(sheet.getByTestId('field-staged-container-gateway-env-node-env')).toBeVisible();

    await page.getByTestId('component-upgrade-button').click();
    await expect(sheet.getByTestId('field-staged-container-gateway-env-node-env')).toHaveCount(0, { timeout: 30000 });
    await expect(sheet.getByTestId('field-value-container-gateway-env-node-env')).toHaveText('staging', { timeout: 30000 });
  });

  test('Add a key stages a new label; Keep on merge on a field stages a keep', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);

    const labels = sheet.getByTestId('blk-deployment-metadata-labels');
    await labels.hover();
    await labels.getByTestId('block-action-add').click();
    await sheet.getByTestId('field-add-key').fill('bad.key');
    await expect(sheet.getByTestId('field-editor-confirm')).toBeDisabled();
    await sheet.getByTestId('field-add-key').fill('tier');
    await sheet.getByTestId('field-add-value').fill('gold');
    await sheet.getByTestId('field-editor-confirm').click();
    await expect(page.getByTestId('component-upgrade-button')).toHaveText('Update 1');

    // The app label comes from base and is not kept (a path inside a list cannot be kept at all).
    await sheet.getByTestId('field-value-deployment-metadata-labels-app').hover();
    await page.getByTestId('field-action-keep').click();
    await expect(sheet.getByTestId('field-kept-deployment-metadata-labels-app')).toBeVisible();

    await page.getByTestId('component-upgrade-button').click();
    await expect(sheet.getByTestId('field-value-deployment-metadata-labels-tier')).toHaveText('gold', { timeout: 30000 });
  });

  test('Add a key on Env adds an env var: its name and value are one edit, written as one item', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);

    // Nothing staged and nothing incoming: no footer, not a disabled "Upgrade 0".
    await expect(page.getByTestId('component-upgrade-button')).toHaveCount(0);
    const env = sheet.getByTestId('blk-container-gateway-env');
    await env.getByTestId('blk-label-container-gateway-env').hover();
    // The block's actions are a cluster at the right end of its first row.
    const block = await env.boundingBox();
    const cluster = await env.getByTestId('block-actions').boundingBox();
    expect(block && cluster).toBeTruthy();
    expect(block!.x + block!.width - (cluster!.x + cluster!.width)).toBeLessThan(16);
    expect(cluster!.y - block!.y).toBeLessThan(12);
    await env.getByTestId('block-action-add').click();
    // A name the list holds already is refused.
    await sheet.getByTestId('field-add-key').fill('HOME');
    await expect(sheet.getByTestId('field-editor-confirm')).toBeDisabled();
    await sheet.getByTestId('field-add-key').fill('LOG_LEVEL');
    await sheet.getByTestId('field-add-value').fill('debug');
    await sheet.getByTestId('field-editor-confirm').click();
    await expect(page.getByTestId('component-upgrade-button')).toHaveText('Update 1');
    // Update is the house primary (rust), never the violet of Upgrade.
    await expect(page.getByTestId('component-upgrade-button')).toHaveCSS('background-color', 'rgb(186, 61, 3)');
    // Before it is written, the new env var shows in Env with the add mark.
    await expect(sheet.getByTestId('field-env-name-container-gateway-log-level')).toHaveText('LOG_LEVEL');
    await expect(sheet.getByTestId('field-staged-container-gateway-env-log-level')).toHaveAccessibleName(/add/i);
    // Its name and its value share one 22px row, as every env var does.
    const name = await sheet.getByTestId('field-env-name-container-gateway-log-level').boundingBox();
    const added = await sheet.getByTestId('field-value-container-gateway-env-log-level').boundingBox();
    expect(added?.y).toBe(name?.y);
    expect(added?.height).toBe(22);

    // A second edit in the same container, and a keep: the lead, the button and its peek
    // count the same 2 edits.
    await sheet.getByTestId('field-value-container-gateway-resources-limits-memory').click();
    await sheet.getByTestId('field-editor-input').fill('6Gi');
    await sheet.getByTestId('field-editor-confirm').click();
    await sheet.getByTestId('field-value-deployment-spec-replicas').hover();
    await page.getByTestId('field-action-keep').click();
    const button = page.getByTestId('component-upgrade-button');
    await expect(button).toHaveText('Update 2');
    await expect(page.getByTestId('component-bar-keep-lead')).toHaveText(/^2 staged/);
    await button.hover();
    const peek = page.getByTestId('footer-peek');
    await expect(peek).toContainText('Writes your 2 staged edits to this Unit.');
    await expect(peek.getByText('Update', { exact: true })).toHaveCSS('font-family', /Manrope/);
    await page.mouse.move(0, 0);

    await button.click();
    await expect(sheet.getByTestId('field-env-name-container-gateway-log-level')).toHaveText('LOG_LEVEL', { timeout: 30000 });
    await expect(sheet.getByTestId('field-value-container-gateway-env-log-level')).toHaveText('debug');
  });

  test('Inspect opens a popover with the field, its Variants and a close button', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);

    // One hover card per value: its information and its actions. The pointer moves from the
    // value down into the card, over the value on the next row (under the card), and the card
    // stays on its value until Inspect is clicked.
    const replicas = sheet.getByTestId('field-value-deployment-spec-replicas');
    // In the middle of the list, so the card opens below its value, over the next row.
    await replicas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await replicas.hover();
    const inspectButton = page.getByTestId('field-action-inspect');
    await expect(inspectButton).toBeVisible();
    await expect(page.getByTestId('field-actions')).toContainText('Keep on merge');
    const from = (await replicas.boundingBox())!;
    const to = (await inspectButton.boundingBox())!;
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    // The path crosses another value of the sheet (the Selector on the next row).
    const crossed = await page.evaluate(({ start, end }) => {
      for (let i = 1; i < 20; i++) {
        const x = start.x + ((end.x - start.x) * i) / 20;
        const y = start.y + ((end.y - start.y) * i) / 20;
        const under = document.elementsFromPoint(x, y).find((el) => el.matches('.v[data-stage-key]') && el.getAttribute('data-path') !== 'spec.replicas');
        if (under) return under.getAttribute('data-path');
      }
      return null;
    }, { start, end });
    expect(crossed).not.toBeNull();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    // Longer than the hover delay: the card does not move to the value under the path.
    await page.waitForTimeout(700);
    await expect(page.getByTestId('field-peek')).toContainText('spec.replicas');
    await page.mouse.down();
    await page.mouse.up();
    const popover = page.getByTestId('field-inspect');
    // Inspect takes the card's place.
    await expect(page.getByTestId('field-peek')).toHaveCount(0);
    await expect(popover).toBeVisible();
    // The field once: the sheet's label as the title, its path under it.
    await expect(popover.getByTestId('field-inspect-name')).toHaveText('Replicas');
    await expect(popover.getByTestId('field-inspect-path')).toHaveText('spec.replicas');
    // History: each Revision in which the value changed, with the value it got, newest first:
    // set here to 2, after the clone from base gave it 1.
    const revisions = popover.getByTestId('field-inspect-history').locator('[data-testid^="field-inspect-revision-"]');
    await expect(revisions.first()).toContainText('set here', { timeout: 15000 });
    await expect(revisions.first()).toContainText(/2$/);
    await expect(revisions.nth(1)).toContainText(/1$/);
    // Variants: every Variant's value, this one marked.
    const variants = popover.getByTestId('field-inspect-variants');
    await expect(variants).toContainText(`${seeded.base.slug}1`);
    await expect(variants).toContainText(`${seeded.prod.slug}(this Variant)2`);
    await expect(variants.getByLabel('this Variant')).toHaveText('(this Variant)');
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);

    // Keyboard: focus on a value opens its card, Tab moves into its buttons, Escape closes it
    // and gives the focus back to the value.
    await replicas.focus();
    await expect(page.getByTestId('field-peek')).toContainText('spec.replicas');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('field-action-edit')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('field-action-inspect')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('field-action-keep')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('field-peek')).toHaveCount(0);
    await expect(replicas).toBeFocused();
    // That Escape closed the card only, not the drawer.
    await expect(sheet).toBeVisible();

    // The actions: Edit first; Remove key apart, after a divider, and quiet until it is hovered.
    // The chrome snaps after a scroll and moves the value from under the pointer: hover again
    // until the card is up.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await replicas.hover();
      await expect(page.getByTestId('field-action-edit')).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15000 });
    const actions = page.getByTestId('field-actions');
    await expect(actions.locator('[data-testid^="field-action"]')).toHaveText([
      'Edit',
      'Inspect',
      'Keep on merge',
      '',
      'Remove key',
    ]);
    // The card holds the value's actions, so its block's Keep lock hides meanwhile.
    await expect(sheet.getByTestId('blk-deployment-spec-replicas').locator('.bactions')).toBeHidden();
    const remove = page.getByTestId('field-action-remove');
    await expect(remove).toHaveCSS('color', 'rgb(80, 89, 105)');
    await remove.hover();
    await expect(remove).toHaveCSS('color', 'rgb(154, 0, 5)');
    // Edit opens the value's editor, as a click on the value does, and the card closes.
    await page.getByTestId('field-action-edit').click();
    await expect(page.getByTestId('field-peek')).toHaveCount(0);
    await expect(sheet.getByTestId('field-editor-input')).toHaveValue('2');
  });

  test('the hover card holds while the pointer crosses another value, or moves slowly, into it', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);
    const app = sheet.getByTestId('field-value-deployment-metadata-labels-app');
    const env = sheet.getByTestId('field-value-deployment-metadata-labels-environment');
    const peek = page.getByTestId('field-peek');
    const centre = async (l: Locator) => {
      const b = (await l.boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    await app.evaluate((el) => el.scrollIntoView({ block: 'center' }));

    // The page's timers (the 400ms hover delay, the leave and toward-the-card grace) run on a
    // paused fake clock, so each step takes the time the test gives it, however slow the machine
    // is. On real time, a slow runner rests on a value the pointer only passes, and the card moves.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    const wait = (ms: number) => page.clock.runFor(ms);
    /** Past the hover delay: the value under the pointer takes the card. */
    const HOVER_MS = 450;
    let at = { x: 0, y: 0 };
    const rest = async (p: { x: number; y: number }) => {
      at = p;
      await page.mouse.move(p.x, p.y);
    };
    /** Moves in `steps` steps of `ms` each, as a hand does, not in one jump. */
    const glide = async (to: { x: number; y: number }, steps: number, ms: number) => {
      const from = at;
      for (let i = 1; i <= steps; i++) {
        await rest({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
        await wait(ms);
      }
    };

    // app=openclaw, then over environment=prod (passing, not resting), then down into the card.
    await rest(await centre(app));
    await wait(HOVER_MS);
    await expect(peek).toContainText('metadata.labels.app');
    const card = (await page.locator('.fpeek-card').boundingBox())!;
    await glide(await centre(env), 6, 30);
    await glide({ x: card.x + 40, y: card.y + 30 }, 6, 30);
    await wait(700);
    await expect(peek).toContainText('metadata.labels.app');

    // A slow move, about 0.8s, from the value into the card: the card is still there.
    await rest({ x: 2, y: 890 });
    await wait(700);
    await expect(peek).toHaveCount(0);
    await rest(await centre(app));
    await wait(HOVER_MS);
    await expect(peek).toContainText('metadata.labels.app');
    const card2 = (await page.locator('.fpeek-card').boundingBox())!;
    await glide({ x: card2.x + 40, y: card2.y + 30 }, 16, 50);
    await wait(700);
    await expect(peek).toContainText('metadata.labels.app');

    // Resting on another value does move the card to it.
    await rest(await centre(env));
    await wait(HOVER_MS);
    await expect(peek).toContainText('metadata.labels.environment');
  });

  test('Kept on merge draws only the kept fields, staged ones included', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);
    await sheet.getByTestId('field-value-deployment-metadata-labels-app').hover();
    await page.getByTestId('field-action-keep').click();
    await page.getByTestId('scope-kept').click();
    const pane = page.getByTestId('component-side-pane');
    await expect(pane.getByTestId('field-value-deployment-metadata-labels-app')).toBeVisible();
    await expect(pane.getByTestId('field-value-deployment-spec-replicas')).toHaveCount(0);
    await expect(page.getByTestId('component-upgrade-button')).toBeEnabled();
  });

  test('the part bar sticks under the Unit header and its active chip follows the scroll', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const sheet = await openSheet(page, seeded);
    const nav = sheet.getByTestId('part-nav');
    const active = nav.locator('[aria-current="true"]');
    await expect(active).toHaveAttribute('data-testid', 'part-nav-res-deployment-openclaw');

    // The chips do not all fit: an arrow at the edge with more past it scrolls the bar that way.
    const back = sheet.getByTestId('part-nav-back');
    const more = sheet.getByTestId('part-nav-more');
    await expect(back).toHaveCount(0);
    await expect(more).toBeVisible();
    const scrollLeft = () => nav.evaluate((el) => el.scrollLeft);
    await more.click();
    await expect.poll(scrollLeft).toBeGreaterThan(0);
    await expect(back).toBeVisible();
    // The bar snaps to a chip's edge: a chip starts just clear of the back arrow's plate, at the
    // bar's end too.
    await expect
      .poll(() =>
        nav.evaluate((el) => {
          const plate = el.parentElement!.querySelector('[data-testid="part-nav-back"]')!.getBoundingClientRect();
          return [...el.querySelectorAll('.pchip')].some((c) => Math.abs(c.getBoundingClientRect().left - plate.right) <= 1);
        }),
      )
      .toBe(true);
    // No chip shows cut beside a plate: the plate covers all of a cut, and no chip is hidden.
    await expect
      .poll(() =>
        nav.evaluate((el) => {
          const plate = el.parentElement!.querySelector('[data-testid="part-nav-back"]')!.getBoundingClientRect();
          return [...el.querySelectorAll<HTMLElement>('.pchip')].filter((c) => {
            const r = c.getBoundingClientRect();
            return r.left < plate.right - 1 && r.right > plate.right + 1;
          }).length;
        }),
      )
      .toBe(0);
    expect(await nav.locator('.pchip[data-cut]').count()).toBe(0);
    // Both plates look the same: the bar's ground, one hairline on the side facing the chips.
    const plateStyle = (l: Locator) =>
      l.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, left: cs.borderLeftWidth, right: cs.borderRightWidth };
      });
    expect(await plateStyle(back)).toEqual({ bg: 'rgb(255, 255, 255)', left: '0px', right: '1px' });
    // The plate is solid: what shows at the edge is the arrow, not part of a chip.
    const plateBox = (await back.boundingBox())!;
    expect(
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="part-nav-back"]') !== null,
        { x: plateBox.x + 3, y: plateBox.y + plateBox.height / 2 },
      ),
    ).toBe(true);
    await page.mouse.move(0, 0);
    await back.click();
    await expect(more).toBeVisible();
    expect(await plateStyle(more)).toEqual({ bg: 'rgb(255, 255, 255)', left: '1px', right: '0px' });
    await expect.poll(scrollLeft).toBe(0);
    await expect(back).toHaveCount(0);

    // A jump lands the section 12px clear of the part bar, not under it.
    await nav.getByTestId('part-nav-container-gateway').click();
    // The jump puts its section back while the drawer's chrome folds; then it holds still.
    await expect(sheet).not.toHaveAttribute('data-jump', 'settling');
    const bar = (await sheet.getByTestId('part-bar').boundingBox())!;
    const section = (await sheet.getByTestId('part-container-gateway').boundingBox())!;
    expect(Math.round(section.y - (bar.y + bar.height))).toBe(12);
    // The chrome stayed folded: the jump's own settling scrolls did not bring it back.
    await expect(page.getByTestId('component-filter-close')).toBeVisible();
    // A click on a chip scrolls the sheet to that part; the chip becomes active and stays in view.
    await nav.getByTestId('part-nav-volumes').click();
    await expect(active).toHaveAttribute('data-testid', 'part-nav-volumes', { timeout: 10000 });
    const navBox = await nav.boundingBox();
    await expect(async () => {
      const chip = await active.boundingBox();
      expect(chip!.x).toBeGreaterThanOrEqual(navBox!.x - 1);
      expect(chip!.x + chip!.width).toBeLessThanOrEqual(navBox!.x + navBox!.width + 1);
    }).toPass({ timeout: 5000 });
    // The bar and the Unit header stay at the top of the list while the sheet scrolls.
    const list = page.getByTestId('unit-list');
    const listTop = (await list.boundingBox())!.y;
    const head = page.getByTestId('component-side-pane').getByTestId('unit-header').first();
    expect(Math.round((await head.boundingBox())!.y)).toBe(Math.round(listTop));

    // Scrolling (no click) to a part in the middle makes its chip active.
    await sheet.getByTestId('part-container-gateway').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(active).toHaveAttribute('data-testid', 'part-nav-container-gateway', { timeout: 10000 });

    // Scrolling back up makes an earlier part active.
    await list.evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(active).toHaveAttribute('data-testid', 'part-nav-res-deployment-openclaw', { timeout: 10000 });
  });

  test('a failed origin read shows Retry; a Retry that reads clears the error and the header icon', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'changes');
    let fail = true;
    await page.route('**/api/space/*/unit/*/blame*', (route) =>
      fail ? route.fulfill({ status: 500, json: { Message: 'seeded failure' } }) : route.continue(),
    );
    const sheet = await openSheet(page, seeded);
    const pane = page.getByTestId('component-side-pane');
    await expect(pane.getByTestId('field-retry')).toBeVisible({ timeout: 30000 });
    await expect(pane.getByTestId('unit-status-error')).toBeVisible();
    // A closed Unit reads nothing: its header does not keep the failed read. Open, it reads again.
    const header = pane.getByTestId('unit-header').filter({ hasText: 'openclaw' }).first();
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(pane.getByTestId('unit-status-error')).toHaveCount(0);
    await header.click();
    await expect(pane.getByTestId('field-retry')).toBeVisible({ timeout: 30000 });

    fail = false;
    await pane.getByTestId('field-retry').click();
    await expect(pane.getByTestId('field-retry')).toHaveCount(0, { timeout: 15000 });
    await expect(pane.getByTestId('unit-status-error')).toHaveCount(0);
    await expect(sheet).toBeVisible();
  });

  test('a Unit with no data shows the empty state, never the skeleton', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'empty');
    await page.goto(`/components?app=${encodeURIComponent(seeded.componentSlug)}&space=${seeded.prod.spaceId}`);
    const pane = page.getByTestId('component-side-pane');
    await page.getByTestId('component-filter-all').click();
    // Open the Unit only if it is closed: a click on an open Unit closes it.
    const header = pane.getByTestId('unit-header').first();
    await expect(header).toBeVisible({ timeout: 15000 });
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(pane.getByTestId('field-empty')).toHaveText('No configuration data', { timeout: 15000 });
    await expect(pane.getByTestId('field-skeleton')).toHaveCount(0);
  });

  test('Incoming also draws a key only upstream has and a resource upstream adds, and counts as the footer does', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'incoming');
    await page.goto(`/components?app=${encodeURIComponent(seeded.componentSlug)}&space=${seeded.prod.spaceId}`);
    const pane = page.getByTestId('component-side-pane');
    await page.getByTestId('scope-incoming').click();

    // LOG_FORMAT is added upstream: its value shows on the second line, the field reads a dash.
    await expect(pane.locator('.inc', { hasText: 'json' }).first()).toBeVisible({ timeout: 20000 });
    // It is a row of the container's Env, named by its name, with one tick for the element.
    const logFormat = pane.getByTestId('incoming-tick-container-gateway-env-log-format');
    await expect(logFormat).toBeVisible();
    await expect(pane.locator('[data-testid^="incoming-tick-"][data-testid*="log-format"]')).toHaveCount(1);
    // The memory limit is held back by its guard: a lock tick, with the upstream value.
    await expect(pane.getByTestId('incoming-tick-container-gateway-resources-limits-memory')).toHaveAttribute('data-held', 'true');
    // It keeps its current value in place; the held value is in the hover card.
    const memory = pane.getByTestId('incoming-value-container-gateway-resources-limits-memory');
    await expect(memory).toHaveText('4Gi');
    await memory.hover();
    await expect(page.getByTestId('incoming-tooltip-container-gateway-resources-limits-memory')).toContainText('6Gi');
    await expect(page.getByTestId('incoming-tooltip-container-gateway-resources-limits-memory')).toContainText('Held back');
    await page.mouse.move(0, 0);
    // A key upstream adds where the Unit has no block for it is labelled by its whole path,
    // which wraps only after a dot: no lone letters.
    const longKey = pane.locator('.k', { hasText: 'spec.template.spec.tolerations.0.effect' });
    await expect(longKey).toBeVisible();
    expect(await longKey.locator('wbr').count()).toBeGreaterThan(4);
    expect((await wrapOf(longKey)).splitSegments).toBe(0);
    // The PodDisruptionBudget is added whole: one tick on its head.
    await expect(pane.getByTestId('incoming-tick-res-poddisruptionbudget-openclaw')).toBeVisible();
    await expect(pane.getByTestId('res-name-poddisruptionbudget-openclaw')).toHaveText('openclaw');
    // Its head has the plus mark, and its fields are drawn below it, with no tick of their own.
    await expect(pane.getByTestId('res-wtag-poddisruptionbudget-openclaw')).toHaveAccessibleName('Added upstream');
    await expect(pane.getByTestId('field-value-poddisruptionbudget-spec-minavailable')).toHaveText('1');
    // Its selector is the token app=openclaw, as a workload's is.
    await expect(pane.getByTestId('blk-poddisruptionbudget-spec-selector')).toContainText('app=openclaw');
    await expect(pane.locator('[data-testid^="incoming-tick-poddisruptionbudget-"]')).toHaveCount(0);
    // Unticking the element takes one change off the footer.
    const footer = page.getByTestId('component-upgrade-button');
    const before = Number((await footer.innerText()).match(/\d+/)?.[0]);
    // "Select all" shows only while a change it would tick is not ticked.
    const selectAll = page.getByTestId('component-select-all-button');
    await expect(selectAll).toHaveCount(0);
    await logFormat.locator('input').uncheck();
    await expect(footer).toHaveText(new RegExp(`Upgrade ${before - 1}$`));
    await expect(selectAll).toBeVisible();
    await logFormat.locator('input').check();
    await expect(footer).toHaveText(new RegExp(`Upgrade ${before}$`));
    await expect(selectAll).toHaveCount(0);
    // The badge and the footer count the same changes (rule 4), but the footer leaves out the
    // guarded one, which only the person ticks (rule 18).
    const badge = Number(await page.getByTestId('component-incoming-count').innerText());
    const unticked = await pane.locator('[data-testid^="incoming-tick-"][data-held="true"]:not(.Mui-checked)').count();
    expect(unticked).toBeGreaterThan(0);
    await expect(footer).toHaveText(new RegExp(`Upgrade ${badge - unticked}$`));
  });
});
