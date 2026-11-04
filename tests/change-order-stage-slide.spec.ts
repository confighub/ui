// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * THE OPEN STEP MOVES AT ONCE.
 *
 * On the bare address the page opens the next stage, and moves on by itself once it is promoted.
 * Only one stage is ever mounted, and the new one replaces the old at once: it slides in with what
 * it has, the log's skeleton on a first read. After the reader's own Promote the page goes up to the
 * rail at the same time, and the rail's marker moves to the new stage. Focus moves to its heading.
 * Under prefers-reduced-motion nothing animates. Another user's promote scrolls nothing.
 */
import { type Page } from '@playwright/test';

import {
  type ChangeOrderFixture,
  buildChangeOrderFixture,
} from './fixtures/change-order-fixture';
import { stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';
import { expect, hubApi, newAuthorizedContext, test } from './fixtures/test';

interface Frame {
  /** The stage of each stage card in the document. */
  cards: string[];
  /** The stages whose card shows a log skeleton that the user can see. */
  skeletonShown: string[];
  /** The transform of the step's box. */
  transform: string;
  /** The slide's phase, if it moves; for the failure message. */
  sliding: string | null;
  /** The promotion path is wholly inside the scrolling area. */
  railInView: boolean;
  /** The rail's moving marker is drawn. */
  marker: boolean;
  /** The step is visible. */
  stepVisible: boolean;
}

/** Every animation frame from now on: which stage cards are mounted, and what of them is visible. */
async function recordFrames(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __recording: boolean };
    w.__frames = [];
    w.__recording = true;
    const tick = () => {
      if (!w.__recording) return;
      const cards = [...document.querySelectorAll('[data-testid="stage-card"]')];
      const step = document.querySelector('[data-testid="stage-slide-in"]');
      w.__frames.push({
        cards: cards.map((c) => c.getAttribute('data-stage') ?? ''),
        skeletonShown: cards
          .filter((c) =>
            [...c.querySelectorAll('[data-testid^="log-skeleton"]')].some(
              (s) => getComputedStyle(s).visibility !== 'hidden',
            ),
          )
          .map((c) => c.getAttribute('data-stage') ?? ''),
        transform: step === null ? 'none' : getComputedStyle(step).transform,
        sliding: document.querySelector('[data-testid="stage-slide"]')?.getAttribute('data-sliding') ?? null,
        railInView: (() => {
          const rail = document.querySelector('[data-testid="promotion-path"]');
          if (rail === null) return false;
          let scroller = rail.parentElement;
          while (scroller !== null && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) {
            scroller = scroller.parentElement;
          }
          const r = rail.getBoundingClientRect();
          const s = (scroller ?? document.documentElement).getBoundingClientRect();
          return r.top >= s.top - 1 && r.bottom <= s.bottom + 1;
        })(),
        marker: document.querySelector('[data-testid="rail-marker"]') !== null,
        stepVisible: step !== null && getComputedStyle(step).visibility !== 'hidden',
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function framesSoFar(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __recording: boolean };
    w.__recording = false;
    return w.__frames;
  });
}

/** The rail's open node and its marker, once the step is still. */
async function expectMarkerOn(page: Page, stage: string) {
  const rail = page.getByTestId('promotion-path');
  await expect(rail.locator('[aria-pressed="true"]')).toHaveAttribute('href', new RegExp(`/${stage}$`));
  await expect(rail.getByTestId('rail-marker')).toHaveCount(0);
  await expect(rail.locator('[data-marker-arriving]')).toHaveCount(0);
}

/** The promotion path is wholly inside the scrolling area now. */
function railInView(page: Page) {
  return page.evaluate(() => {
    const rail = document.querySelector('[data-testid="promotion-path"]');
    if (rail === null) return false;
    let scroller = rail.parentElement;
    while (scroller !== null && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) {
      scroller = scroller.parentElement;
    }
    const r = rail.getBoundingClientRect();
    const s = (scroller ?? document.documentElement).getBoundingClientRect();
    return r.top >= s.top - 1 && r.bottom <= s.bottom + 1;
  });
}

/** Counts the page's own scrolls from now on: scrollBy, scrollTo and scrollIntoView on any element. */
async function countScrolls(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __scrolls: number };
    w.__scrolls = 0;
    for (const name of ['scrollBy', 'scrollTo', 'scrollIntoView'] as const) {
      const original = Element.prototype[name] as (...args: unknown[]) => void;
      (Element.prototype as unknown as Record<string, unknown>)[name] = function (this: Element, ...args: unknown[]) {
        w.__scrolls += 1;
        return original.apply(this, args);
      };
    }
  });
}

/** The quiet dry run answers late, so a stage that opens has no first data for a while. */
async function slowDryRun(page: Page) {
  await page.route(/\/api\/promote\?dry_run=true/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
}

/** Once the step is still: focus is on the status heading of the stage card shown. */
async function expectFocusOnHeading(page: Page, stage: string) {
  await expect(page.getByTestId('stage-slide')).not.toHaveAttribute('data-sliding', /.+/, {
    timeout: 10000,
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.activeElement;
        return el === null
          ? null
          : `${el.id}@${el.closest('[data-testid="stage-card"]')?.getAttribute('data-stage') ?? ''}`;
      }),
    )
    .toBe(`stage-status-heading@${stage}`);
}

/** Never two stages mounted at once, and never a frame with no stage. */
function expectOneCard(frames: Frame[]) {
  expect(frames.length).toBeGreaterThan(0);
  expect(
    frames.filter((f) => f.cards.length !== 1),
    'a frame with no stage card, or two',
  ).toEqual([]);
}

test.describe('ChangeOrder page — the open step slides', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    fixturePage = await (await newAuthorizedContext(browser)).newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(async () => (await hubApi.get('/api/space', { params: { limit: 1 } })).status(), {
        timeout: 60000,
        intervals: [1000],
      })
      .toBe(200);
    // No release Target: once dev is promoted it is done, and the page moves on to staging.
    fx = await buildChangeOrderFixture(fixturePage, {
      workflow: 'no-health-check',
      releasable: false,
      resources: 'minimal',
    });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.context().close();
    }
  });

  test('after Promote from below: the next stage at once, the page up to the rail, the marker on it; focus on its heading; the Promote counts once', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // A short window, so that Promote is below the rail.
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.goto(fx.changeOrderPath);
    const card = page.getByTestId('stage-card');
    await expect(card).toHaveAttribute('data-stage', 'dev', { timeout: 45000 });
    const promote = page.locator('[data-testid="stage-merge"][data-promote-stage="dev"]');
    await expect(promote).toBeVisible({ timeout: 45000 });
    await promote.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    // Staging's quiet dry run answers late, so its first read shows the skeleton for a while.
    await slowDryRun(page);
    await recordFrames(page);
    await promote.click();
    // The page moves on by itself: the bare address, now on staging.
    await expect(card).toHaveAttribute('data-stage', 'staging', { timeout: 60000 });
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}$`));
    await expectFocusOnHeading(page, 'staging');
    const frames = await framesSoFar(page);
    expectOneCard(frames);
    // Staging is drawn the frame it arrives, sliding in, with its skeleton: nothing waits for its reads.
    const arrived = frames.findIndex((f) => f.cards[0] === 'staging');
    expect(arrived).toBeGreaterThan(0);
    expect(frames[arrived]?.stepVisible, 'staging visible when it arrives').toBe(true);
    expect(frames[arrived]?.sliding, 'staging slides in when it arrives').not.toBeNull();
    expect(frames.slice(arrived).some((f) => f.skeletonShown.includes('staging')), 'the skeleton of a first read').toBe(true);
    // The rail was out of view at the click; the page went up to it.
    expect(frames[0]?.railInView, 'the rail in view at the click').toBe(false);
    await expect.poll(() => railInView(page), { message: 'the rail in view' }).toBe(true);
    // The marker moved at the same time, and ended on staging.
    expect(frames.slice(arrived).some((f) => f.marker), 'the marker moved').toBe(true);
    await expectMarkerOn(page, 'staging');
    expect(frames.some((f) => f.transform !== 'none'), 'a slide').toBe(true);

    // The Promote counts once: with no new input, the next move is nobody's. Another user promotes
    // staging, and the page moves on to prod in place, with no scroll and no marker.
    await countScrolls(page);
    await recordFrames(page);
    await fx.promoteStage('staging');
    await expect(card).toHaveAttribute('data-stage', 'prod', { timeout: 90000 });
    await expect(page.getByTestId('stage-slide')).not.toHaveAttribute('data-sliding', /.+/, { timeout: 10000 });
    expect(await page.evaluate(() => (window as unknown as { __scrolls: number }).__scrolls), 'scrolls').toBe(0);
    const later = await framesSoFar(page);
    expect(later.filter((f) => f.marker), 'a marker').toEqual([]);
    expect(later.filter((f) => f.transform !== 'none'), 'a moved frame').toEqual([]);
  });

  test('a rail click: the same, and under prefers-reduced-motion no transform', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(fx.changeOrderPath);
    const card = page.getByTestId('stage-card');
    await expect(card).toHaveAttribute('data-stage', 'prod', { timeout: 45000 });
    await slowDryRun(page);

    // With motion: back to dev.
    await recordFrames(page);
    await page.getByTestId('promotion-path').locator('a[href$="/dev"]').first().click();
    await expect(card).toHaveAttribute('data-stage', 'dev', { timeout: 30000 });
    await expectFocusOnHeading(page, 'dev');
    const slid = await framesSoFar(page);
    expectOneCard(slid);
    expect(slid.some((f) => f.transform !== 'none'), 'a slide').toBe(true);
    expect(slid.some((f) => f.marker), 'the marker moved').toBe(true);
    await expectMarkerOn(page, 'dev');

    // Reduced motion: on to staging, shown when ready, never moved.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await recordFrames(page);
    await page.getByTestId('promotion-path').locator('a[href$="/staging"]').first().click();
    await expect(card).toHaveAttribute('data-stage', 'staging', { timeout: 30000 });
    await expectFocusOnHeading(page, 'staging');
    const frames = await framesSoFar(page);
    expectOneCard(frames);
    // Nothing animates: no slide, and no marker that travels.
    expect(frames.filter((f) => f.transform !== 'none'), 'a moved frame').toEqual([]);
    expect(frames.filter((f) => f.marker), 'a marker').toEqual([]);
    await expectMarkerOn(page, 'staging');
  });

  test("another user's promote moves the page on in place: no scroll, and focus stays where the reader types", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(fx.changeOrderPath);
    const card = page.getByTestId('stage-card');
    await expect(card).toHaveAttribute('data-stage', 'prod', { timeout: 45000 });
    // A field of the reader's own, outside the step: a comment they are in the middle of.
    await page.evaluate(() => {
      const field = document.createElement('textarea');
      field.setAttribute('data-testid', 'readers-own-field');
      document.body.prepend(field);
    });
    const field = page.getByTestId('readers-own-field');
    await field.focus();
    await page.keyboard.type('half a wor');

    // Someone else promotes prod, the last stage: the page moves on to Complete by itself.
    await countScrolls(page);
    await recordFrames(page);
    await fx.promoteStage('prod');
    await expect(page.getByTestId('complete-step-detail')).toBeVisible({ timeout: 90000 });
    await expect(page.getByTestId('stage-slide')).not.toHaveAttribute('data-sliding', /.+/, { timeout: 10000 });
    await expect(field).toBeFocused();
    // Nobody here acted: nothing scrolled the page, and nothing travelled on the rail.
    expect(await page.evaluate(() => (window as unknown as { __scrolls: number }).__scrolls)).toBe(0);
    const frames = await framesSoFar(page);
    expect(frames.filter((f) => f.marker), 'a marker').toEqual([]);
    expect(frames.filter((f) => f.transform !== 'none'), 'a moved frame').toEqual([]);
    await page.keyboard.type('d');
    await expect(field).toHaveValue('half a word');
  });

  test('"Next: Complete." on the last stage: Complete is a link, and it opens the Complete step as the rail does', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // prod was promoted in the test before.
    await page.goto(`${fx.changeOrderPath}/prod`);
    const end = page.getByTestId('log-end');
    await expect(end).toContainText(`${stageCardCopy.log.next}Complete${stageCardCopy.log.nextEnd}`, { timeout: 45000 });
    await recordFrames(page);
    await end.getByRole('link', { name: 'Complete', exact: true }).click();
    await expect(page.getByTestId('complete-step-detail')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('stage-card')).toHaveCount(0);
    // The same move as a rail click: the marker travels and ends on Complete.
    await expect(page.getByTestId('stage-slide')).not.toHaveAttribute('data-sliding', /.+/, { timeout: 10000 });
    expect((await framesSoFar(page)).some((f) => f.marker), 'the marker moved').toBe(true);
    await expect(page.getByTestId('promotion-path').locator('[aria-pressed="true"]')).toHaveAttribute(
      'data-testid',
      'stage-rail-complete',
    );
  });
});
