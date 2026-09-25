// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Dragging a compare column to swap it with another — `CompareColumnDnd.tsx`,
// driven through the real components via the `data-state="reorder"` harness
// pane (`tests/fixtures/compare-alignment/harness.tsx`).
//
// THE PART WORTH THE MOST CARE IS MID-DRAG. The drag layer's whole reason to
// exist is that it drives the skeleton, the highlight and the swap's FLIP
// animation from ONE <style> element rather than React state, so that none of
// a pane's few thousand cells re-render while the pointer moves. That claim is
// only checked by looking at the DOM WHILE a drag is in flight — before and
// after, a naive re-rendering implementation would look identical.

import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const HARNESS = '/tests/fixtures/compare-alignment/harness.html';

let server: ViteDevServer;
let browser: Browser;
let origin: string;
let page: Page;

test.beforeAll(async () => {
  server = await createServer({ configFile: 'vite.config.ts', server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('vite did not report a port');
  origin = `http://localhost:${address.port}`;
  browser = await chromium.launch();
});

test.afterAll(async () => {
  await browser?.close();
  await server?.close();
});

test.beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });
  expect(errors, 'the harness rendered without errors').toEqual([]);
  // The reorder pane sits well below the fold, behind several other fixtures —
  // `page.mouse` moves to absolute viewport coordinates and does not auto-scroll
  // the way a locator action does, so an off-screen pane silently drags nothing.
  await page.locator('[data-state="reorder"]').scrollIntoViewIfNeeded();
});

test.afterEach(async () => {
  await page?.close();
});

const reorder = () => page.locator('[data-state="reorder"]');

/** Every `onReorder`/`onSelectionChange` call the harness has recorded so far. */
function recordedSelections(): Promise<string[][]> {
  return page.evaluate(() => (window as unknown as { __compareSelections: string[][] }).__compareSelections);
}

/** The scoped `<style>` element the drag layer writes into, in the given pane, or `null` before one exists. */
function styleTextIn(paneState: string): Promise<string | null> {
  return page.evaluate((state) => {
    const el = document.querySelector(`[data-state="${state}"] [data-compare-dnd] > style`);
    return el ? el.textContent : null;
  }, paneState);
}

/** The scoped `<style>` element the drag layer writes into, or `null` before one exists. */
function dragStyleText(): Promise<string | null> {
  return styleTextIn('reorder');
}

function selectorSlot(id: string) {
  return reorder().locator(`[data-compare-surface="selectors"][data-compare-col="${id}"]`);
}

/** The computed `transform` of the FIRST element carrying this (surface, id) pair, in the `reorder` pane. */
function transformOf(surface: string, id: string): Promise<string> {
  return reorder()
    .locator(`[data-compare-surface="${surface}"][data-compare-col="${id}"]`)
    .first()
    .evaluate((el) => getComputedStyle(el).transform);
}

/**
 * Arms a `MutationObserver` on the drag layer's own `<style>` element, in
 * the given pane, recording every `textContent` it is ever set to
 * (including the value at arm time) into `window.__styleWrites`.
 *
 * A LIVE read (`getComputedStyle`, or polling the style text for whichever
 * phase it happens to be in right now) races the animation: `expect.poll`'s
 * own default intervals (100ms, 250ms, 500ms…) can land AFTER the 200ms
 * transition has already finished, well inside `FLIP_CLEAR_MS` (260ms) — so
 * a poll can walk straight from "hasn't started yet" to "already settled"
 * without ever observing "in progress", on a run just the wrong amount of
 * slow. Recording every write instead of sampling current state sidesteps
 * that: the test asserts on what the layer actually wrote and in what
 * order, not on a snapshot that might land in the gap.
 */
async function armStyleWriteRecorder(paneState: string): Promise<void> {
  await page.evaluate((state) => {
    const style = document.querySelector(`[data-state="${state}"] [data-compare-dnd] > style`);
    const writes: string[] = [];
    (window as unknown as { __styleWrites: string[] }).__styleWrites = writes;
    if (!style) return;
    writes.push(style.textContent ?? '');
    const observer = new MutationObserver(() => writes.push(style.textContent ?? ''));
    observer.observe(style, { childList: true, characterData: true, subtree: true });
  }, paneState);
}

/** Every `textContent` the drag layer's `<style>` element has been set to since `armStyleWriteRecorder` armed. */
function styleWrites(): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __styleWrites?: string[] }).__styleWrites ?? []);
}

/**
 * Waits until the recorded writes show the whole FLIP sequence has actually
 * finished — a write that turns on `transition: transform`, followed by the
 * final clearing write (`''`) — then returns the full sequence for the test
 * to assert on directly. See `armStyleWriteRecorder` for why this reads the
 * recording instead of sampling current state.
 */
async function waitForStyleWriteSequence(): Promise<string[]> {
  await expect
    .poll(
      async () => {
        const writes = await styleWrites();
        return writes.length > 0 && writes[writes.length - 1] === '' && writes.some((w) => /transition:\s*transform/.test(w));
      },
      { timeout: 3000, intervals: [10, 20, 50] },
    )
    .toBe(true);
  return styleWrites();
}

/**
 * The CSS rule the FLIP's invert phase writes for one (surface, id) pair: a
 * `translateX`/`translateY` alongside `transition: none`. `writeStyle` in
 * `CompareColumnDnd.tsx` never writes this rule for a pair that didn't
 * actually move — it skips anything under a 0.5px threshold — so a match
 * here is inherently a non-trivial displacement, never a stray `0px`.
 */
function invertRulePattern(surface: string, id: string): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `\\[data-compare-surface="${surface}"\\]\\[data-compare-col="${escaped}"\\]\\s*\\{[^}]*transform:\\s*translate[XY]\\(-?[\\d.]+px\\)[^}]*transition:\\s*none`,
  );
}

/**
 * Arms a `MutationObserver` on the given pane's drag-layer `<style>`
 * element that, the instant it sees the FLIP's invert write land, reads
 * `elementFromPoint(x, y)` SYNCHRONOUSLY inside the observer callback — in
 * the same `page.evaluate`, so there is no round trip back to Playwright
 * between "the invert write happened" and "here is what was under the
 * pointer at that moment" for the animation to move on in between. A result
 * read even one tick later — a separate `page.evaluate`, or a poll cycle —
 * would race the animation the same way a live `getComputedStyle` sample
 * does. Records the hit-test result into `window.__keyCellFrozen` and
 * disconnects, so it only ever freezes once, at the invert write.
 */
async function armKeyCellFreeze(paneState: string, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([state, px, py]) => {
      (window as unknown as { __keyCellFrozen?: boolean }).__keyCellFrozen = undefined;
      const style = document.querySelector(`[data-state="${state}"] [data-compare-dnd] > style`);
      if (!style) return;
      const observer = new MutationObserver(() => {
        const text = style.textContent ?? '';
        if (!/transition:\s*none/.test(text) || !/transform:\s*translate/.test(text)) return;
        const hit = document.elementFromPoint(px, py);
        const key = document.querySelector(`[data-state="${state}"] [data-testid="compare-key-cell"]`);
        (window as unknown as { __keyCellFrozen?: boolean }).__keyCellFrozen =
          hit !== null && key !== null && (hit === key || key.contains(hit));
        observer.disconnect();
      });
      observer.observe(style, { childList: true, characterData: true, subtree: true });
    },
    [paneState, x, y] as const,
  );
}

/** The result `armKeyCellFreeze` recorded once the invert write landed — `undefined` until then. */
function keyCellFrozenResult(): Promise<boolean | undefined> {
  return page.evaluate(() => (window as unknown as { __keyCellFrozen?: boolean }).__keyCellFrozen);
}

test.describe('a slot\'s X', () => {
  test('is on every slot once there are two or more, and never on a lone one', async () => {
    await expect(reorder().getByTestId('compare-selector-clear-a')).toBeVisible();
    await expect(reorder().getByTestId('compare-selector-clear-b')).toBeVisible();
    await expect(reorder().getByTestId('compare-selector-clear-c')).toBeVisible();

    // Down to one slot: nothing left to clear IT to, so its X goes away.
    await reorder().getByTestId('compare-selector-clear-c').click();
    await reorder().getByTestId('compare-selector-clear-b').click();
    await expect(reorder().getByTestId('compare-selector-clear-a')).toHaveCount(0);

    // The lone slot still needs `SLOT_FILLED_SX` — without it, the wrapper
    // `<Box data-compare-col>` around a bare `<Slot>` has no flex sizing at
    // all and collapses to near-zero width, with the dashed add square
    // drawn right on top of it (caught live: the slot shrank to a 2px
    // sliver showing only the letter badge, no name, the "+" square sitting
    // over it).
    await expect(reorder().getByTestId('compare-selector-label-a')).toBeVisible();
    await expect(reorder().getByTestId('compare-selector-label-a')).toHaveText('prod-us1');
    const slotABox = await selectorSlot('prod-us1').boundingBox();
    const addBox = await reorder().getByTestId('compare-selector-add').boundingBox();
    expect(slotABox).toBeTruthy();
    expect(addBox).toBeTruthy();
    if (slotABox && addBox) {
      // A collapsed slot would be only a few px wide; a real one takes up
      // most of the row, well clear of the add square that follows it.
      expect(slotABox.width).toBeGreaterThan(100);
      expect(slotABox.x + slotABox.width).toBeLessThanOrEqual(addBox.x + 1);
    }
  });

  test('clearing slot A moves the next deployment into it', async () => {
    await reorder().getByTestId('compare-selector-clear-a').click();

    const recorded = await recordedSelections();
    expect(recorded.at(-1)).toEqual(['dev-1', 'dev-2']);
    await expect(reorder().getByTestId('compare-column-a').first()).toContainText('dev-1');
  });
});

test.describe('dragging a slot swaps two columns', () => {
  test('the skeleton, the width and the untouched neighbour, all mid-drag', async () => {
    const source = selectorSlot('prod-us1');
    const target = selectorSlot('dev-2');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).toBeTruthy();
    expect(targetBox).toBeTruthy();
    if (!sourceBox || !targetBox) return;

    const gridCellBefore = await reorder()
      .locator('[data-compare-surface="grid"][data-compare-col="prod-us1"]')
      .first()
      .boundingBox();
    expect(gridCellBefore).toBeTruthy();

    const headB = reorder().getByTestId('compare-column-b').first();
    const headBXBefore = (await headB.boundingBox())?.x;

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    // Past the 6px activation distance, and resting over the target — but not
    // yet released, so everything below is read MID-DRAG.
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 10,
    });

    const styleText = await dragStyleText();
    expect(styleText, 'the skeleton rule was not written').toContain('prod-us1');
    expect(styleText).toContain('compare-skel');

    // No column moves during the drag: the dragged column's cell keeps its
    // exact width (visibility:hidden preserves layout), and an UNRELATED
    // column's head does not shift at all.
    const gridCellDuring = await reorder()
      .locator('[data-compare-surface="grid"][data-compare-col="prod-us1"]')
      .first();
    const duringBox = await gridCellDuring.boundingBox();
    expect(duringBox?.width).toBeCloseTo(gridCellBefore?.width ?? -1, 0);
    const childVisibility = await gridCellDuring.evaluate((el) => {
      const child = el.firstElementChild as HTMLElement | null;
      return child ? getComputedStyle(child).visibility : null;
    });
    expect(childVisibility).toBe('hidden');

    const headBXDuring = (await headB.boundingBox())?.x;
    expect(headBXDuring).toBeCloseTo(headBXBefore ?? -1, 0);

    await page.mouse.up();

    const recorded = await recordedSelections();
    expect(recorded.at(-1)).toEqual(['dev-2', 'dev-1', 'prod-us1']);
    await expect(reorder().getByTestId('compare-column-a').first()).toContainText('dev-2');

    // Polled, not a fixed sleep past FLIP_CLEAR_MS (260ms) — see the FLIP
    // timing test below for why a fixed margin here is a CI flake risk.
    await expect.poll(() => dragStyleText(), { timeout: 2000 }).toBe('');
  });

  test('the swap animates both columns, in both surfaces, then settles to none', async () => {
    await armStyleWriteRecorder('reorder');
    const source = selectorSlot('prod-us1');
    const target = selectorSlot('dev-2');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('slots did not render');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    const swapped = [
      ['selectors', 'prod-us1'],
      ['selectors', 'dev-2'],
      ['grid', 'prod-us1'],
      ['grid', 'dev-2'],
    ] as const;

    // Asserts on what the drag layer actually WROTE, recorded as it
    // happened, rather than a live `transform` snapshot that races the
    // animation — see `armStyleWriteRecorder`.
    const writes = await waitForStyleWriteSequence();
    const invertWrite = writes.find((write) =>
      swapped.every(([surface, id]) => invertRulePattern(surface, id).test(write)),
    );
    expect(
      invertWrite,
      `no single write inverted all four (surface, id) pairs — recorded writes:\n${writes.join('\n---\n')}`,
    ).toBeDefined();
    const invertIndex = writes.indexOf(invertWrite as string);

    const transitionIndex = writes.findIndex((write) =>
      /\[data-compare-col\]\s*\{[^}]*transition:\s*transform/.test(write),
    );
    expect(transitionIndex, 'no write enabled the transition').toBeGreaterThan(-1);

    const clearIndex = writes.length - 1;
    expect(writes[clearIndex], 'the last write should clear the style element').toBe('');

    // The sequence must run in this order: invert, then transition, then clear.
    expect(invertIndex, 'invert should precede the transition write').toBeLessThan(transitionIndex);
    expect(transitionIndex, 'the transition write should precede the final clear').toBeLessThan(clearIndex);

    // By the time the sequence above is complete the clear write has already
    // landed — nothing further will change these, so this is a stable end
    // state, not a second sample racing the animation.
    for (const [surface, id] of swapped) {
      expect(await transformOf(surface, id), `${surface}/${id} should have settled`).toBe('none');
    }
  });

  test('dropping a slot on itself changes nothing, and nothing jumps', async () => {
    const before = (await recordedSelections()).length;
    const source = selectorSlot('prod-us1');
    const sourceBox = await source.boundingBox();
    if (!sourceBox) throw new Error('slot did not render');
    const cx = sourceBox.x + sourceBox.width / 2;
    const cy = sourceBox.y + sourceBox.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Past the 6px activation distance, and back to the source before release.
    await page.mouse.move(cx + 40, cy, { steps: 5 });
    await page.mouse.move(cx, cy, { steps: 5 });
    await page.mouse.up();

    expect((await recordedSelections()).length).toBe(before);

    await page.waitForTimeout(300);
    expect(await dragStyleText()).toBe('');

    const afterBox = await selectorSlot('prod-us1').boundingBox();
    expect(afterBox?.x).toBeCloseTo(sourceBox.x, 0);
    expect(afterBox?.y).toBeCloseTo(sourceBox.y, 0);
  });

  test('Escape cancels: nothing is recorded, and the skeleton is gone', async () => {
    const before = (await recordedSelections()).length;
    const source = selectorSlot('prod-us1');
    const target = selectorSlot('dev-2');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('slots did not render');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 10,
    });
    expect(await dragStyleText()).toContain('prod-us1');

    await page.keyboard.press('Escape');
    await page.mouse.up();

    expect((await recordedSelections()).length).toBe(before);
    expect(await dragStyleText()).toBe('');
  });

  test('a click with no movement still opens the picker, not a drag', async () => {
    await selectorSlot('prod-us1').click();
    await expect(page.getByTestId('compare-selector-sheet')).toBeVisible();
  });

  test('reduced motion: the swap still happens, with no transform to animate it', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const source = selectorSlot('prod-us1');
    const target = selectorSlot('dev-2');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('slots did not render');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    const recorded = await recordedSelections();
    expect(recorded.at(-1)).toEqual(['dev-2', 'dev-1', 'prod-us1']);

    await page.waitForTimeout(300);
    const styleText = await dragStyleText();
    expect(styleText ?? '').not.toContain('transform');
  });
});

test.describe('keyboard drag', () => {
  test('Space, ArrowRight, Space swaps A and B', async () => {
    await reorder().getByTestId('compare-column-a').first().focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    const recorded = await recordedSelections();
    expect(recorded.at(-1)).toEqual(['dev-1', 'prod-us1', 'dev-2']);
  });
});

test.describe('a pending swap the host never commits', () => {
  // `[data-state="reorder-stuck"]` wires `onReorder` to a host that records
  // the call but never updates `order` — simulating a reorder the host
  // ignores or rejects. Nothing will ever reach the `orderKey` effect to
  // consume the pending swap, so the skeleton needs its own backstop or it
  // is stuck on the dragged column forever.
  const stuck = () => page.locator('[data-state="reorder-stuck"]');

  function stuckStyleText(): Promise<string | null> {
    return page.evaluate(() => {
      const el = document.querySelector('[data-state="reorder-stuck"] [data-compare-dnd] > style');
      return el ? el.textContent : null;
    });
  }

  function stuckSlot(id: string) {
    return stuck().locator(`[data-compare-surface="selectors"][data-compare-col="${id}"]`);
  }

  test('the skeleton clears on its own once the swap goes stale', async () => {
    await stuck().scrollIntoViewIfNeeded();
    const source = stuckSlot('prod-us1');
    const target = stuckSlot('dev-2');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('slots did not render');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    // The drop fires `onReorder`, which this pane ignores — the skeleton
    // stays on the dragged column exactly as it would while a real commit
    // was still in flight.
    expect(await stuckStyleText()).toContain('prod-us1');

    // Past FLIP_STALE_MS (1000ms): the backstop in `handleDragEnd` must have
    // cleared it directly, since the `orderKey` effect never will. Polled
    // rather than a fixed sleep past the threshold, so a slow runner gets
    // the time it actually needs rather than a margin guessed against a
    // fast one.
    await expect.poll(() => stuckStyleText(), { timeout: 3000 }).toBe('');

    const hiddenChildren = await stuck().evaluate((root) => {
      let count = 0;
      root.querySelectorAll('[data-compare-col]').forEach((el) => {
        const child = el.firstElementChild as HTMLElement | null;
        if (child && getComputedStyle(child).visibility === 'hidden') count += 1;
      });
      return count;
    });
    expect(hiddenChildren).toBe(0);
  });
});

test.describe('the key column under horizontal scroll', () => {
  // `[data-state="reorder-wide"]` holds 5 columns (220 + 5*104 = 740px) in a
  // 645px pane, so the compare scroller genuinely overflows — the sticky key
  // column has to be tested against real scroll, not just an unscrolled grid.
  const wide = () => page.locator('[data-state="reorder-wide"]');

  test('the key cell still paints on top of a translating column, scrolled and mid-drag', async () => {
    await wide().scrollIntoViewIfNeeded();
    const scroller = wide().getByTestId('compare-scroller').first();
    await scroller.evaluate((el) => {
      el.scrollLeft = 60;
    });
    await page.waitForTimeout(50);

    const keyCell = wide().locator('[data-testid="compare-key-cell"]').first();
    const keyBox = await keyCell.boundingBox();
    if (!keyBox) throw new Error('key cell did not render');
    const cx = keyBox.x + keyBox.width / 2;
    const cy = keyBox.y + keyBox.height / 2;

    const keyCellPaints = () =>
      page.evaluate(
        ([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          const key = document.querySelector('[data-state="reorder-wide"] [data-testid="compare-key-cell"]');
          return hit !== null && key !== null && (hit === key || key.contains(hit));
        },
        [cx, cy] as const,
      );

    expect(await keyCellPaints(), 'before the drag').toBe(true);

    const source = wide().locator('[data-compare-surface="selectors"][data-compare-col="prod-us1"]');
    const target = wide().locator('[data-compare-surface="selectors"][data-compare-col="dev-4"]');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('slots did not render');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 10,
    });

    expect(await keyCellPaints(), 'mid-drag').toBe(true);

    // Freezes the hit-test result the instant the FLIP's invert write lands
    // — see `armKeyCellFreeze` — instead of sampling `elementFromPoint` live
    // at a guessed delay, which would race the animation the same way a
    // live `transform` read does.
    await armKeyCellFreeze('reorder-wide', cx, cy);
    await page.mouse.up();
    await expect
      .poll(async () => (await keyCellFrozenResult()) !== undefined, { timeout: 3000, intervals: [10, 20, 50] })
      .toBe(true);
    expect(await keyCellFrozenResult(), 'shortly after the drop, mid-FLIP').toBe(true);
  });
});

test.describe('a variant label replaces the Space name', () => {
  // `dev-3` (slot D) carries a variant label ('staging') in the harness;
  // `prod-us1` (slot A) carries none — both cases, on the same pane, across
  // every surface that names a deployment.
  const wide = () => page.locator('[data-state="reorder-wide"]');

  test('the selector slot shows the label, with the Space name quietly underneath only where it has one', async () => {
    await wide().scrollIntoViewIfNeeded();

    await expect(wide().getByTestId('compare-selector-label-d')).toHaveText('staging');
    // The Space name is still shown — a small line under the label, quiet but
    // not hidden behind a hover, since a label can collide with another
    // deployment's own slug.
    const slotD = wide().locator('[data-compare-surface="selectors"][data-compare-col="dev-3"]');
    const occurrencesD = await slotD.evaluate((el) => (el.textContent?.match(/dev-3/g) ?? []).length);
    expect(occurrencesD).toBeGreaterThan(0);

    await expect(wide().getByTestId('compare-selector-label-a')).toHaveText('prod-us1');
    // No variant on slot A — nothing extra to show, and nothing that reads
    // "prod-us1 / prod-us1".
    const slotA = wide().locator('[data-compare-surface="selectors"][data-compare-col="prod-us1"]');
    const occurrencesA = await slotA.evaluate((el) => (el.textContent?.match(/prod-us1/g) ?? []).length);
    expect(occurrencesA).toBe(1);
  });

  test('the grid column head shows the label, and the Space name in its title', async () => {
    const headD = wide().getByTestId('compare-column-d').first();
    await expect(headD).toContainText('staging');
    await expect(headD).toHaveAttribute('title', /staging — dev-3/);

    const headA = wide().getByTestId('compare-column-a').first();
    await expect(headA).toContainText('prod-us1');
    const titleA = await headA.getAttribute('title');
    expect(titleA).not.toContain('—');
  });

  test('the image row shows the label, and the Space name in its title', async () => {
    // Every field, so the image row renders whether or not it actually
    // differs between these particular columns.
    await wide().getByTestId('compare-filter-all').click();
    await page.waitForTimeout(150);

    const rowD = wide().locator('[data-compare-surface="image"][data-compare-col="dev-3"]').first();
    await expect(rowD).toContainText('staging');
    await expect(rowD.locator('[title]').first()).toHaveAttribute('title', /staging — dev-3/);

    const rowA = wide().locator('[data-compare-surface="image"][data-compare-col="prod-us1"]').first();
    await expect(rowA).toContainText('prod-us1');
  });
});
