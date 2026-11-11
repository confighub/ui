// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Reviews in the ChangeOrder detail view: the six design states, and the decide →
 * record flow on the stage card.
 *
 * A REAL CHANGEORDER, MOCKED REVIEWS. The fixture builds a real three-stage ChangeOrder
 * (`no-health-check`, so nothing but reviews holds a stage) and promotes `dev`
 * and `staging`, so `prod` is next and its entry gate is evaluated over the two
 * `staging` Spaces. The review of that gate is on the card of the stage it holds,
 * `prod`: its Stage log asks for the decision there, beside the Promote it waits
 * on, with "Review details" under the review line. `staging`'s log, whose change the
 * review reads, points to it ("Review on prod"). The routes in `fixtures/stage-card/reviewMocks.ts` add the review
 * requirements, the records, the server's gate rows and the made-up reviewers.
 *
 * Every other request reaches the server (`route.fallback()`).
 *
 * Screenshots of every state at 1440 and 1000 px go to
 * `test-results/change-order-reviews/<state>-<width>.png`. They are for a person to
 * compare with the design; nothing here compares pixels.
 */
import { type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';

import { reviewCopy } from '../src/pages/change-orders/reviews/reviewCopy';
import { stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';
import {
  type ChangeOrderFixture,
  buildChangeOrderFixture,
} from './fixtures/change-order-fixture';
import {
  HOUR,
  PEOPLE,
  STATES,
  type State,
  mockReviews,
  uuidOf,
} from './fixtures/stage-card/reviewMocks';
import { expect, hubApi, newAuthorizedContext, test } from './fixtures/test';

test.describe.configure({ mode: 'serial' });

const SHOT_DIR = 'test-results/change-order-reviews';
const PROD = 'prod';
const PURPLE = 'rgb(104, 36, 196)'; // componentTheme.promote: Promote, Release, and "Go to promote" / "Go to release"
const PURPLE_HOVER = 'rgb(78, 26, 150)'; // componentTheme.promoteEmphasis: their hover
const PRIMARY = 'rgb(186, 61, 3)'; // theme primary: every other filled action, such as submitting a review
const INK = 'rgb(25, 29, 35)'; // changeOrderInk.default: the band keeps its own tokens
const BORDER_STRONG = 'rgb(205, 210, 218)'; // changeOrderBorder.strong
const CARD = 'rgb(255, 255, 255)'; // changeOrderSurface.card

/** "Review now": outlined, neutral ink, the strong border, no fill. */
async function expectOutlinedNeutral(button: Locator): Promise<void> {
  await expect(button).toHaveCSS('background-color', CARD);
  await expect(button).toHaveCSS('color', INK);
  await expect(button).toHaveCSS('border-top-color', BORDER_STRONG);
}

/**
 * The status box's state for each design state, seen by Priya (in
 * security-reviewers) or, for `author`, by the real test user who wrote the change.
 * "satisfied" has every approval, so the box has moved on to Promote.
 */
const BOX_STATE: Record<State, string> = {
  pending: 'reviewNeeded',
  partial: 'reviewNeeded',
  satisfied: 'ready',
  rejected: 'reviewRejected',
  author: 'reviewWaiting',
  revoked: 'reviewNeeded',
};

/** The Stage log, which carries the card's state as `data-stage-state`. */
const statusBox = (page: Page) => page.getByTestId('stage-status');
/** The review's details, opened under its line in the log (`openReviewDetails`). */
const details = (page: Page) => page.getByTestId('review-details');
const log = stageCardCopy.log;

/**
 * The prod card: where prod's entry gate, which reads staging's Spaces, is reviewed.
 * `details` also opens "Review details" under the review line, where the coverage,
 * the requests, the requirements and the decisions are.
 */
async function openReview(
  page: Page,
  fx: ChangeOrderFixture,
  { details: open = true }: { details?: boolean } = {},
): Promise<void> {
  await page.goto(`${fx.changeOrderPath}/${PROD}`);
  await expect(statusBox(page)).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId('review-details-row')).toBeVisible({ timeout: 20000 });
  if (open) await openReviewDetails(page);
}

/** Opens "Review details" under the review line, then any closed section inside it. */
async function openReviewDetails(
  page: Page,
  { decisions = true }: { decisions?: boolean } = {},
): Promise<void> {
  const toggle = page.getByTestId('review-details-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(details(page)).toBeVisible();
  // The bars (H7): coverage, requests and decisions, each with its own toggle, closed by default.
  const sections = details(page).locator('button[data-section][aria-expanded="false"]');
  for (let i = 0; i < 8 && (await sections.count()) > 0; i++) await sections.first().click();
  // The coverage is folded by Space (H7): show every Space and open each, so its rows can be read.
  const all = details(page).getByTestId('review-coverage-all');
  if (await all.count()) await all.click();
  const spaces = details(page).locator(
    '[data-testid="review-coverage-space"] > button[aria-expanded="false"]',
  );
  for (let i = 0; i < 60 && (await spaces.count()) > 0; i++) await spaces.first().click();
  if (decisions)
    await expect(page.getByTestId('review-decision').first()).toBeAttached({ timeout: 20000 });
}

/**
 * The whole page at `width`. The app scrolls inside its own container, so a
 * full-page screenshot stops at the viewport: the viewport is made as tall as
 * the ChangeOrder page instead, then put back.
 */
async function shoot(page: Page, state: string, width: number): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.mouse.move(0, 0);
  const height = await page.evaluate(() => {
    const root = document.getElementById('change-orders-root');
    return root === null
      ? 900
      : Math.ceil(root.getBoundingClientRect().top + root.scrollHeight + 24);
  });
  await page.setViewportSize({ width, height: Math.max(900, height) });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/${state}-${width}.png`, animations: 'disabled' });
  await page.setViewportSize({ width, height: 900 });
}

test.describe('ChangeOrder reviews — the six design states', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    const fixtureContext = await newAuthorizedContext(browser);
    fixturePage = await fixtureContext.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(async () => (await hubApi.get('/api/space', { params: { limit: 1 } })).status(), {
        timeout: 60000,
        intervals: [1000],
      })
      .toBe(200);
    fx = await buildChangeOrderFixture(fixturePage, {
      resources: 'minimal',
      workflow: 'no-health-check',
    });
    /*
     * Through `POST /api/promote`, not `fx.promoteStage`: only a real promotion
     * writes the ChangeOrder's promotion records, and those name the test user
     * as the promoter, so as an author of the change in the staging Spaces.
     */
    for (const stage of ['dev', 'staging']) {
      const response = await hubApi.post('/api/promote', {
        data: { ChangeOrderID: fx.changeOrderId, TargetStage: stage },
      });
      expect(response.status(), `promote ${stage}: ${await response.text()}`).toBeLessThan(
        300,
      );
    }
  });

  /*
   * A route handler that awaits `route.fetch()` can still be running when the
   * test ends; it then throws "Target page has been closed". Remove the routes
   * and let in-flight handlers fail quietly.
   */
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  for (const state of STATES) {
    test(`${state}: renders at 1440 and 1000`, async ({ page }) => {
      const mocks = await mockReviews(page, fx, state);
      await page.setViewportSize({ width: 1440, height: 900 });
      await openReview(page, fx, { details: false });
      await expect(statusBox(page)).toHaveAttribute('data-stage-state', BOX_STATE[state]);
      expect(mocks.badWhere, 'attestation reads not scoped to the ChangeOrder').toEqual([]);
      await shoot(page, state, 1440);
      await shoot(page, state, 1000);
    });
  }

  test('the rail marks prod held on review, and Review now stays on prod and focuses Approve…', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByTestId('review-band')).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('stage-rail-review').first()).toContainText(
      'Review 1/2 on security-review',
    );
    await expect(page.getByTestId('review-band')).toContainText(
      'prod needs 1 more approval of the change in staging on',
    );

    // At 1000 px the rail wraps, and the held link stays on the row of the node it leads into.
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    await page.setViewportSize({ width: 1000, height: 900 });
    const link = page.locator('[data-review-hold="held"]');
    const node = page
      .locator('[role="button"][aria-pressed="true"]')
      .filter({ hasText: 'Held on review' });
    await expect(node).toBeVisible({ timeout: 45000 });
    const [linkBox, nodeBox] = [await link.boundingBox(), await node.boundingBox()];
    expect(
      linkBox && nodeBox && linkBox.y >= nodeBox.y && linkBox.y < nodeBox.y + nodeBox.height,
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });

    // From another stage, "Review now" leads to the card that holds the form: prod's.
    await page.goto(`${fx.changeOrderPath}/staging`);
    const reviewNow = page.locator('[data-review-cta="review"]');
    await expect(reviewNow).toHaveText('Review now', { timeout: 45000 });
    await expectOutlinedNeutral(reviewNow);
    await reviewNow.click();
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/${PROD}$`));
    await expect(page.getByTestId('review-approve')).toBeFocused({ timeout: 5000 });
    // The box hosting the review is the `#review` anchor, and the scroll stops with
    // its top in view, below the app bar.
    await page.waitForTimeout(800);
    const tops = await page.evaluate(() => ({
      box: document.getElementById('review')?.getBoundingClientRect().top ?? -1,
      bar: Math.max(
        0,
        ...Array.from(document.querySelectorAll('header, .MuiAppBar-root')).map(
          (el) => el.getBoundingClientRect().bottom,
        ),
      ),
    }));
    expect(tops.box).toBeGreaterThanOrEqual(tops.bar);
    await expect(page.locator('#review')).toHaveAttribute('data-testid', 'review-details-row');
    // The link to this review is in its details, for a reviewer too.
    await openReviewDetails(page);
    await expect(details(page).getByTestId('review-copy-link')).toBeVisible();
  });

  test("prod's card hosts the review; staging's log points to it", async ({ page }) => {
    await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReview(page, fx, { details: false });
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'reviewNeeded');
    await expect(page.locator('#stage-status-heading')).toHaveText('Your turn');
    await expect(page.getByTestId('open-review')).toContainText(
      `${stageCardCopy.review.yourReview} ${stageCardCopy.review.needed}`,
    );
    await expect(box.getByTestId('review-approve')).toBeVisible();
    await expect(box.getByTestId('review-reject')).toBeVisible();
    // Held on review, so Promote is locked, waiting for it: no Promote control.
    await expect(page.locator('[data-promote-stage]')).toHaveCount(0);
    await expect(page.getByTestId('open-promote')).toContainText(
      `${log.waitsFor}${log.review}`,
    );
    // The details: the requirement and what it still needs.
    await openReviewDetails(page);
    await expect(page.getByTestId('review-requirement-security-review')).toContainText(
      reviewCopy.requirements.needed(1),
    );

    // H6: the review shows only on prod, where its Approve is. Staging's log names none of it.
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByLabel('Stage staging', { exact: true })).toBeVisible({
      timeout: 45000,
    });
    await expect(page.getByTestId('stage-log')).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('review-on-pointer')).toHaveCount(0);
    await expect(page.getByTestId('stage-log')).not.toContainText('security-review');
    // One form per gate: staging's card has none.
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(page.getByTestId('review-form')).toHaveCount(0);
  });

  test("prod's log names staging as an underlined link to staging's card, and staging's card has no form", async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReview(page, fx, { details: false });
    // "Arrived from staging": the stage the change, and its review, came from.
    const link = page
      .getByTestId('log-arrival')
      .getByRole('link', { name: 'staging', exact: true });
    await expect(link).toBeVisible();
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain(
      'underline',
    );
    // Never rust or blue: the sentence's own colour.
    expect(await link.evaluate((el) => getComputedStyle(el).color)).not.toBe(PRIMARY);
    // The band names staging too; the form is on this card, so the band does not lead away from it.
    await expect(page.getByTestId('review-band')).toContainText('of the change in staging');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/staging$`));
    await expect(page.getByLabel('Stage staging', { exact: true })).toBeVisible({
      timeout: 45000,
    });
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
  });

  test('staging not promoted: prod hosts no review yet, says when it opens, and nothing leads to an empty card', async ({
    page,
  }) => {
    const spaceIds = fx.spacesInStage('staging').map((space) => space.spaceId);
    await mockReviews(page, fx, 'partial', { stagingReached: { how: 'none', spaceIds } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    await expect(statusBox(page)).toBeVisible({ timeout: 45000 });
    await expect(statusBox(page)).not.toHaveAttribute(
      'data-stage-state',
      /^(review|loading)/,
      { timeout: 45000 },
    );
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    // Nothing offers a way to a card without the form.
    await expect(
      page.locator('[data-review-cta="review"], [data-review-cta="panel"]'),
    ).toHaveCount(0);
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByLabel('Stage staging', { exact: true })).toBeVisible({
      timeout: 45000,
    });
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    // H6: no line on staging points to a review that belongs to prod.
    await expect(page.getByTestId('review-on-pointer')).toHaveCount(0);
  });

  test('staging part-promoted: the review is on prod only, and staging shows none of it', async ({
    page,
  }) => {
    const spaceIds = fx.spacesInStage('staging').map((space) => space.spaceId);
    await mockReviews(page, fx, 'partial', { stagingReached: { how: 'part', spaceIds } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByTestId('stage-log')).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('review-on-pointer')).toHaveCount(0);
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    await expect(page.getByTestId('review-details-row')).toBeVisible({ timeout: 45000 });
    await openReviewDetails(page, { decisions: false });
    await expect(page.getByTestId('review-requirement-security-review')).toBeVisible();
  });

  test('approve: the form opens in the box, and one Pass is recorded with no dialog', async ({
    page,
  }) => {
    const mocks = await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReview(page, fx, { details: false });
    await page.getByTestId('review-approve').click();
    const form = statusBox(page).getByTestId('review-form');
    await expect(form).toBeVisible();
    const reason = form.getByTestId('review-reason');
    const submit = form.getByTestId('review-submit');
    // In the log every decision carries its reason, so focus goes to the field.
    await expect(reason).toBeFocused();
    await expect(reason).toHaveAttribute('placeholder', stageCardCopy.review.placeholderPass);
    await expect(form.getByLabel(stageCardCopy.review.compactLabel(true, true))).toBeVisible();
    await expect(form).toContainText(stageCardCopy.review.compactHint);
    await expect(submit).toHaveText(stageCardCopy.review.compactSubmit(true));
    await expect(submit).toHaveCSS('background-color', PRIMARY);
    // The counter appears only near the limit.
    await reason.fill('x'.repeat(3501));
    await expect(form).toContainText(stageCardCopy.review.counter(3501));
    await reason.fill('Checked it.');
    await expect(form).not.toContainText(stageCardCopy.review.counter(11));
    await submit.click();
    await expect(page.getByTestId('review-confirm')).toHaveCount(0);
    await expect.poll(() => mocks.attests.length, { timeout: 10000 }).toBe(1);
    expect(mocks.attests[0].body).toMatchObject({
      Result: 'Pass',
      Note: 'Checked it.',
      ChangeOrderID: fx.changeOrderId,
      TargetStage: 'staging',
    });
    // Worded from the gate as the server reports it after the write. The mocked server still
    // counts 1 of 2 (it does not count the new record), so a prediction would have said otherwise.
    await expect(page.getByTestId('review-toast')).toContainText(
      'Approval of the change in staging recorded. security-review: 1 of 2 for the gate to prod.',
    );
  });

  /**
   * After Approve the page reads the records at once and the server's gate rows later (a dry
   * run over many Spaces takes seconds). In between, the rows do not list the new decision yet,
   * and the box must not say that it does not cover the change.
   */
  async function approveAndWatchBox(page: Page, mocks: Awaited<ReturnType<typeof mockReviews>>) {
    await openReview(page, fx, { details: false });
    await page.getByTestId('review-approve').click();
    const form = statusBox(page).getByTestId('review-form');
    await form.getByTestId('review-reason').fill('Checked it.');
    const seen: string[] = [];
    const watch = setInterval(() => {
      void statusBox(page)
        .innerText({ timeout: 1000 })
        .then((text) => seen.push(text))
        .catch(() => undefined);
    }, 100);
    try {
      await form.getByTestId('review-submit').click();
      await expect.poll(() => mocks.attests.length, { timeout: 10000 }).toBe(1);
      await page.waitForTimeout(3500);
    } finally {
      clearInterval(watch);
    }
    return seen;
  }

  test('approve: while the gate rows are late, the box never says the approval does not cover the change', async ({
    page,
  }) => {
    const mocks = await mockReviews(page, fx, 'partial', { countNewRecords: true, rowsDelayMs: 1500 });
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen = await approveAndWatchBox(page, mocks);
    expect(seen.length, 'the box was read while the rows were late').toBeGreaterThan(10);
    expect(seen.filter((text) => /does not cover|Review again/.test(text))).toEqual([]);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 20000 });
  });

  test('approve: rows read again that still lack the decision say it does not cover the change', async ({
    page,
  }) => {
    const mocks = await mockReviews(page, fx, 'partial', {
      countNewRecords: true,
      rowsDelayMs: 1500,
      rowsBlindToNewRecords: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen = await approveAndWatchBox(page, mocks);
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.some((text) => /does not cover what .* reads now\. Review again\./.test(text))).toBe(true);
  });

  test('reject: the reason is required, and it is recorded as Fail with no dialog', async ({
    page,
  }) => {
    const mocks = await mockReviews(page, fx, 'partial');
    await openReview(page, fx, { details: false });
    await page.getByTestId('review-reject').click();
    const form = statusBox(page).getByTestId('review-form');
    const reason = form.getByTestId('review-reason');
    await expect(reason).toHaveAttribute(
      'placeholder',
      stageCardCopy.review.placeholderFail('staging'),
    );
    await expect(
      form.getByLabel(stageCardCopy.review.compactLabel(false, true)),
    ).toBeVisible();
    const submit = form.getByTestId('review-submit');
    await expect(submit).toHaveText(stageCardCopy.review.compactSubmit(false));
    await submit.click();
    await expect(form).toContainText(stageCardCopy.review.reasonMissing);
    await expect(reason).toBeFocused();
    expect(mocks.attests).toHaveLength(0);
    await reason.fill('Pin lazyfree-lazy-user-del to no.');
    await submit.click();
    await expect(page.getByTestId('review-confirm')).toHaveCount(0);
    await expect.poll(() => mocks.attests.length, { timeout: 10000 }).toBe(1);
    expect(mocks.attests[0].body).toMatchObject({
      Result: 'Fail',
      Note: 'Pin lazyfree-lazy-user-del to no.',
    });
  });

  test('a refused record keeps the form open with the reason', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial');
    mocks.attestStatus = 500;
    await openReview(page, fx, { details: false });
    await page.getByTestId('review-approve').click();
    const form = statusBox(page).getByTestId('review-form');
    await form.getByTestId('review-reason').fill('Checked it.');
    await form.getByTestId('review-submit').click();
    await expect(form.getByTestId('review-form-error')).toBeVisible({ timeout: 10000 });
    await expect(form).toBeVisible();
    await expect(form.getByTestId('review-reason')).toHaveValue('Checked it.');
  });

  test('author: no decision form, why, who can approve, and a link to copy', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'author');
    await openReview(page, fx);
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'reviewWaiting');
    await expect(page.locator('#stage-status-heading')).toHaveText(/^Waiting on /);
    await expect(box).toContainText(stageCardCopy.review.youWroteIt);
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(
      box.getByRole('button', { name: stageCardCopy.review.compactRequest, exact: true }),
    ).toBeVisible();
    // The link to this review is in its details, and it writes the address of the card that hosts the review.
    const copy = details(page).getByTestId('review-copy-link');
    await expect(copy).toBeVisible();
    await copy.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied))
      .toEqual([expect.stringMatching(new RegExp(`${fx.changeOrderPath}/${PROD}#review$`))]);
    await expect(page.getByTestId('review-toast')).toContainText(
      'Link to this review copied.',
    );
    await expect(page.locator('[data-review-cta="panel"]')).toHaveText('See who can');
    // An author cannot decide here, so the details do not say what a decision would cover.
    await expect(details(page).getByTestId('review-coverage')).toHaveCount(0);
  });

  test('change my decision: revoke each record, then record the new one', async ({ page }) => {
    // Priya approved and one more approval is needed, so the box waits on others and
    // offers her the way to change what she recorded.
    const mocks = await mockReviews(page, fx, 'pending', {
      extraSeeds: [
        {
          id: 'priya',
          who: 'priya',
          result: 'Pass',
          agoMs: HOUR,
          note: 'Ran the failover drill.',
        },
      ],
    });
    await openReview(page, fx, { details: false });
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'reviewWaiting');
    await expect(box).toContainText('You approved at');
    await box.getByTestId('review-change').click();
    await box.getByTestId('review-reject').click();
    const form = box.getByTestId('review-form');
    await form.getByTestId('review-reason').fill('A new finding on session-store.');
    await form.getByTestId('review-submit').click();
    // Replacing a decision revokes what was recorded, so it is still confirmed.
    await expect(page.getByTestId('review-confirm')).toContainText('Replace your decision');
    await expect(page.getByTestId('review-confirm')).toContainText('Replaces');
    await page.getByTestId('review-confirm-submit').click();
    await expect(page.getByTestId('review-confirm')).toBeHidden({ timeout: 10000 });
    expect(mocks.revokes).toHaveLength(2);
    for (const revoke of mocks.revokes) expect(revoke.body.RevokedAttestationID).toBeTruthy();
    expect(mocks.attests).toHaveLength(1);
    expect(mocks.attests[0].body).toMatchObject({ Result: 'Fail' });
  });

  test('revoked and expired decisions say why they no longer count', async ({ page }) => {
    await mockReviews(page, fx, 'revoked');
    await openReview(page, fx);
    const list = details(page);
    await expect(list.getByText('Withdrawn', { exact: true }).first()).toBeVisible();
    await expect(list.getByText('Expired', { exact: true }).first()).toBeVisible();
    await expect(list.getByText(/^Replaces Tom’s rejection from/)).toBeVisible();
    // A replacement sits right above the decision it replaced.
    const names = await list
      .getByTestId('review-decision')
      .evaluateAll((rows) =>
        rows.map(
          (row) =>
            `${(row.textContent ?? '').includes('Tom Okafor') ? 'Tom Okafor' : 'other'}:${row.getAttribute('data-decision-live')}`,
        ),
      );
    expect(names.slice(0, 2)).toEqual(['Tom Okafor:true', 'Tom Okafor:false']);
    // The history names an expired approval as one word with its ’s, and dates it the page's way.
    // (The name and its ’s are one flex item, so the row's gap cannot come between them.)
    await expect(
      page
        .locator('[data-history-entry="review-expired"]')
        .first()
        .locator('span', { hasText: /Lena Fischer’s$/ })
        .first(),
    ).toBeVisible();
    await expect(page.locator('[data-history-entry="review-revoked"]').first()).toContainText(
      /from \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}/,
    );
  });

  test('release review: the box holds Release on the promoted stage, and offers no Release button', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'pending', { release: 'held' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', /^review(Needed|Waiting)$/, {
      timeout: 45000,
    });
    // The line names the review; its requirement (release-ok) is in Review details below.
    await expect(page.getByTestId('open-release-review')).toContainText(
      `${stageCardCopy.review.yourReleaseReview} ${stageCardCopy.review.needed}`,
    );
    // Held: Release is locked, waiting for the review; no Release control.
    await expect(page.locator('[data-release-stage]')).toHaveCount(0);
    await expect(page.getByTestId('open-release')).toContainText(`${log.waitsFor}${log.releaseReview}`);
    await expect(page.getByTestId('stage-rail-review').first()).toContainText(
      'Release review',
    );
    // The count is the server's row: 0 of 1, so 1 approval needed.
    await openReviewDetails(page);
    const row = page.getByTestId('review-requirement-release-ok');
    await expect(row).toContainText(reviewCopy.requirements.needed(1));
    await expect(row).toHaveAttribute('data-evaluated', 'true');
    await shoot(page, 'release', 1440);
    await shoot(page, 'release', 1000);
  });

  test('release review: an approval of what the latest Release already has is named, not listed as a decision', async ({
    page,
  }) => {
    const carriedOn = '1f0c2a9e-55b1-4d0e-9f53-2c7a3e1b9d40';
    await mockReviews(page, fx, 'pending', {
      release: 'held',
      extraSeeds: [
        {
          id: 'earlier-release',
          who: 'priya',
          result: 'Pass',
          agoMs: 30 * 24 * HOUR,
          note: 'Approved the release of an earlier change.',
          changeOrderId: carriedOn,
          previouslyReleased: true,
        },
      ],
    });
    const wheres: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/attestation') wheres.push(url.searchParams.get('where') ?? '');
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    const box = statusBox(page);
    // The viewer's own earlier approval is not taken for a decision on this change: Approve is offered.
    await expect(box).toHaveAttribute('data-stage-state', 'reviewNeeded', { timeout: 45000 });
    await expect(page.getByTestId('review-approve')).toBeVisible();
    await expect(page.getByTestId('review-out-of-date')).toHaveCount(0);
    await openReviewDetails(page, { decisions: false });
    const release = page.getByTestId('review-requirement-release-ok');
    await expect(release).toContainText(reviewCopy.requirements.needed(1));
    // Who approved what the change leaves as released is named on the requirement instead.
    await expect(release.getByTestId('review-requirement-previously-released').first()).toContainText(
      reviewCopy.space.previouslyReleased(1, 'Priya Nair'),
    );
    await expect(details(page).getByTestId('review-decision-origin')).toHaveCount(0);
    await expect(details(page)).not.toContainText('Approved the release of an earlier change.');
    // The release row names it, and the page does not read it.
    const carriedIds = [0, 1].map((space) => uuidOf('earlier-release', space));
    expect(wheres.some((where) => where.includes(`ChangeOrderID = '${fx.changeOrderId}'`))).toBe(true);
    expect(wheres.filter((where) => carriedIds.some((id) => where.includes(id)))).toEqual([]);
    await shoot(page, 'release-previously-released', 1000);
  });

  test('release review: an approval of a change the Release carries from outside the ChangeOrder is a decision here', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'pending', {
      release: 'held',
      extraSeeds: [
        {
          id: 'ride-along',
          who: 'tom',
          result: 'Pass',
          agoMs: 2 * HOUR,
          note: 'Approved the hotfix made directly in staging.',
          changeOrderId: '1f0c2a9e-55b1-4d0e-9f53-2c7a3e1b9d40',
          rideAlong: true,
        },
      ],
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewNeeded', { timeout: 45000 });
    await openReviewDetails(page, { decisions: true });
    // Only the release rows name it, and it approves something this Release ships for the first time.
    const list = details(page);
    await expect(list).toContainText('Approved the hotfix made directly in staging.');
    await expect(list.locator('[data-testid="review-decision-origin"][data-origin="other"]')).toContainText('Made on another ChangeOrder.');
    await expect(page.getByTestId('review-requirement-previously-released')).toHaveCount(0);
  });

  /*
   * #6154: right after the promote, the release check has not answered. Release must not be
   * offered while a declared release prerequisite is unknown: it waits for the review.
   */
  test('a release review not checked yet keeps Release locked, never enabled (#6154)', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'pending', { release: 'pending' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    const release = page.getByTestId('open-release');
    await expect(release).toContainText(`${log.waitsFor}${log.releaseReview}`, { timeout: 45000 });
    await expect(page.locator('[data-release-stage]')).toHaveCount(0);
    await expect(page.getByTestId('pulse')).not.toHaveText('Your turn');
  });

  test('a release dry run refused with 403: not evaluated, no hold, no count, and the page stays', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'pending', { release: 'noPermission' });
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByTestId('review-band')).toBeVisible({ timeout: 45000 });
    await expect(page).not.toHaveURL(/access-denied/);
    // Without a server row there is nothing to hold Release on, and no figure to show.
    const release = page.locator('[data-release-stage="staging"]');
    await expect(release).toBeVisible({ timeout: 30000 });
    await expect(release).toBeEnabled();
    await openReviewDetails(page);
    const req = page.getByTestId('review-requirement-release-ok');
    await expect(req).toHaveAttribute('data-evaluated', 'false');
    await expect(req).not.toContainText(/\d+ \/ \d+/);
  });

  test('release with nothing new to release (200, no Gates): not evaluated, no hold, and plain words', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'pending', { release: 'unchanged' });
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByTestId('review-details-row')).toBeVisible({ timeout: 45000 });
    await openReviewDetails(page);
    // Plain words: nothing to release. Never "not evaluated", which reads as a permission problem.
    await expect(page.getByTestId('review-requirement-release-ok')).not.toContainText(
      /not evaluated/i,
    );
    await expect(page.getByTestId('review-requirement-release-ok')).toHaveAttribute(
      'data-evaluated',
      'false',
    );
    await expect(page.getByTestId('review-requirement-release-ok')).toContainText(
      'Nothing new to release',
    );
  });

  test('AllowAuthors: an author viewer counts, and nothing says "does not count"', async ({
    page,
  }) => {
    // The viewer wrote the gate Revisions, so the attest dry run marks them Authored.
    await mockReviews(page, fx, 'author', { allowAuthors: true });
    await openReview(page, fx);
    const coverage = page.locator(
      '[data-testid="review-coverage"][data-coverage-type="Approval"]',
    );
    await expect(coverage.locator('[data-coverage="covered"]').first()).toBeVisible({
      timeout: 45000,
    });
    await expect(coverage.locator('[data-coverage="recorded-only"]')).toHaveCount(0);
    await expect(coverage).not.toContainText('does not count');
    await expect(coverage).not.toContainText('would not count');
    const card = page.getByTestId('stage-card');
    await expect(card).not.toContainText('you can review for');
    // security-review allows authors, so the author is offered the decision.
    await expect(statusBox(page).getByTestId('review-approve')).toBeVisible();
    await expect(card).not.toContainText('Authors may approve here.');
  });

  test('a not-eligible viewer with a decision: not eligible first, and no way to change it', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial', {
      viewer: 'sam',
      extraSeeds: [
        { id: 'sam', who: 'sam', result: 'Pass', agoMs: HOUR, note: 'Looks fine to me.' },
      ],
    });
    await openReview(page, fx, { details: false });
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'reviewWaiting');
    // The waiting line and no Approve say that the viewer cannot approve.
    await expect(box).not.toContainText('You are not a reviewer for this requirement.');
    await expect(box).not.toContainText('Who can approve:');
    await expect(box).not.toContainText('Your approval covers');
    await expect(page.getByTestId('review-change')).toHaveCount(0);
    await expect(page.getByTestId('review-band')).not.toContainText(
      'You approved. Waiting on others.',
    );
    await expect(page.getByTestId('review-band')).toContainText('You are not a reviewer.');
  });

  test('a not-eligible viewer with a decision: the box lists it as recorded but not counted', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial', {
      viewer: 'sam',
      extraSeeds: [
        { id: 'sam', who: 'sam', result: 'Pass', agoMs: HOUR, note: 'Looks fine to me.' },
      ],
    });
    await openReview(page, fx, { details: false });
    const own = statusBox(page).getByTestId('review-own-not-counted').first();
    await expect(own).toContainText('It does not count.', { timeout: 10000 });
    await expect(own).toContainText('Not counted: not in security-reviewers');
  });

  test('history: a service account has initials, and the review details name it', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial', {
      extraSeeds: [
        {
          id: 'bot',
          who: 'bot',
          result: 'Pass',
          agoMs: HOUR,
          note: 'Automated check passed.',
        },
      ],
    });
    await openReview(page, fx);
    const row = page
      .locator('[data-history-entry="review-approved"]')
      .filter({ hasText: 'rv-bot' })
      .first();
    await expect(row).toBeVisible();
    await expect(row.locator('.MuiAvatar-root').first()).toHaveText('RB');
    // The log's details draw no avatars; the decision names the service account in full.
    await expect(
      page.getByTestId('review-decision').filter({ hasText: 'rv-bot' }).first(),
    ).toBeVisible();
  });

  test('server discard reasons: too old, revoked, counted', async ({ page }) => {
    await mockReviews(page, fx, 'revoked');
    await openReview(page, fx);
    const entries = page.getByTestId('review-decision-entry');
    await expect(
      entries.filter({ hasText: 'Not counted: older than 72h' }).first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="review-decision-entry"][data-reason="Revoked"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="review-decision-entry"][data-reason="Counted"]').first(),
    ).toContainText('Counts on');
  });

  test('Caller: a viewer the server finds not eligible gets no form', async ({ page }) => {
    // Sam is not in security-reviewers, and not listed for qa-signoff.
    await mockReviews(page, fx, 'partial', { viewer: 'sam' });
    await openReview(page, fx, { details: false });
    await expect(page.getByTestId('open-review')).toContainText(stageCardCopy.review.reviewName, { timeout: 45000 });
    await expect(statusBox(page)).not.toContainText('You are not a reviewer for this requirement.');
    await expect(statusBox(page)).not.toContainText('Who can approve:');
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(page.getByTestId('review-form')).toHaveCount(0);
  });

  test('not evaluated for the viewer: no counts, the decisions still listed, and the page stays', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial', { entryNoPermission: true });
    await openReview(page, fx);
    await expect(page).not.toHaveURL(/access-denied/);
    await expect(page.getByTestId('review-requirement-security-review')).toHaveAttribute(
      'data-evaluated',
      'false',
    );
    await expect(page.getByTestId('review-requirement-security-review')).not.toContainText(
      /\d+ \/ \d+/,
    );
    // Who decided, with their notes, is still shown.
    await expect(page.getByTestId('review-decision').first()).toContainText('Lena Fischer');
  });

  test('review requested of the viewer: band, box, and the request in the details', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial', {
      requests: [{ who: 'priya', by: 'tom', agoMs: 3 * HOUR }],
    });
    await openReview(page, fx);
    await expect(page.getByTestId('review-band')).toContainText(
      'Review requested of you by Tom Okafor',
    );
    await expect(statusBox(page)).toContainText('Tom Okafor asked you to review this');
    await expect(page.getByTestId('review-request').first()).toContainText('Priya Nair');
  });

  test('request review from someone, then withdraw it', async ({ page }) => {
    // The author asks. Lena has approved and Tom was asked already, so Priya is the one to ask.
    const mocks = await mockReviews(page, fx, 'author', {
      requests: [{ who: 'tom', by: 'priya', agoMs: HOUR }],
    });
    await openReview(page, fx, { details: false });
    await statusBox(page)
      .getByRole('button', { name: stageCardCopy.review.compactRequest, exact: true })
      .click();
    const picker = statusBox(page).getByTestId('review-request-picker');
    await expect(picker).toContainText(stageCardCopy.review.requestFrom);
    await expect(picker.getByRole('checkbox', { name: 'Priya Nair' })).toBeVisible();
    const submit = picker.getByRole('button', {
      name: stageCardCopy.review.requestSubmit,
      exact: true,
    });
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await picker.getByRole('checkbox', { name: 'Priya Nair' }).check();
    await submit.click();
    await expect.poll(() => mocks.patches.length).toBe(1);
    const added = mocks.patches[0] as {
      ReviewRequests?: { UserID?: string; Stage?: string }[];
      Version?: number;
    };
    expect(added.Version).toBeDefined();
    expect((added.ReviewRequests ?? []).map((r) => r.UserID).sort()).toEqual(
      [PEOPLE.tom.id, PEOPLE.priya.id].sort(),
    );

    await openReviewDetails(page);
    await expect(
      page.getByTestId('review-request').filter({ hasText: 'Priya Nair' }),
    ).toBeVisible();
    await page
      .getByTestId('review-request')
      .filter({ hasText: 'Tom Okafor' })
      .getByTestId('review-request-withdraw')
      .click();
    await expect.poll(() => mocks.patches.length).toBe(2);
    const removed = mocks.patches[1] as { ReviewRequests?: { UserID?: string }[] };
    expect((removed.ReviewRequests ?? []).map((r) => r.UserID)).toEqual([PEOPLE.priya.id]);
    await expect(
      page.getByTestId('review-request').filter({ hasText: 'Tom Okafor' }),
    ).toHaveCount(0);
  });

  test('a refused request (403) hides the request actions and keeps the page', async ({
    page,
  }) => {
    const mocks = await mockReviews(page, fx, 'partial', {
      requests: [{ who: 'tom', by: 'priya', agoMs: HOUR }],
      requestForbidden: true,
    });
    await openReview(page, fx);
    await page.getByTestId('review-request-withdraw').first().click();
    await expect.poll(() => mocks.patches.length).toBe(1);
    await expect(page).not.toHaveURL(/access-denied/);
    await expect(page.getByTestId('review-request-withdraw')).toHaveCount(0);
  });

  test('a partly authored gate keeps the form, says where the decision does not count, and confirms', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial', { partialAuthor: true });
    await openReview(page, fx, { details: false });
    const box = statusBox(page);
    // From the server's Caller: where the viewer is an author, with its Unit count.
    await expect(box).toContainText(
      `You wrote part of this change in ${fx.spacesInStage('staging')[0].slug} (1 of 1 Unit), so your decision does not count there.`,
    );
    await box.getByTestId('review-approve').click();
    await box.getByTestId('review-reason').fill('Checked it.');
    await box.getByTestId('review-submit').click();
    // A partly counting approval is confirmed, and never says "This completes".
    const effect = page.getByTestId('review-confirm-effect');
    await expect(effect).toContainText(/Counts on \d+ of \d+ Units?\./);
    await expect(effect).not.toContainText('This completes');
    await expect(page.getByTestId('review-confirm-gate-effect')).toHaveCount(0);
  });

  test('a decision that would count nowhere: no form, and the box says why', async ({
    page,
  }) => {
    // The server's row counts the viewer, but the coverage says the viewer wrote every Unit.
    await mockReviews(page, fx, 'partial', { coverageAuthoredOnly: true });
    await openReview(page, fx, { details: false });
    await expect(statusBox(page)).toContainText(stageCardCopy.review.wouldNotCount);
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(page.getByTestId('stage-card')).not.toContainText(
      'Authors may approve here.',
    );
  });

  test('a decision from another ChangeOrder says so; history names the reviewed stage and the gate', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial', {
      extraSeeds: [
        {
          id: 'carried',
          who: 'tom',
          result: 'Pass',
          agoMs: 5 * HOUR,
          note: 'Approved on the aborted ChangeOrder.',
          changeOrderId: '1f0c2a9e-55b1-4d0e-9f53-2c7a3e1b9d40',
        },
        {
          id: 'cli',
          who: 'sam',
          result: 'Pass',
          agoMs: 6 * HOUR,
          note: 'Approved with cub.',
          changeOrderId: null,
        },
      ],
    });
    await openReview(page, fx);
    const list = details(page);
    await expect(
      list.locator('[data-testid="review-decision-origin"][data-origin="other"]'),
    ).toContainText('Made on another ChangeOrder.');
    await expect(
      list.locator('[data-testid="review-decision-origin"][data-origin="none"]'),
    ).toContainText('Made outside a ChangeOrder.');
    // Decisions of this ChangeOrder carry no origin line.
    await expect(list.getByTestId('review-decision-origin')).toHaveCount(2);
    // The history files the approval under the stage whose change was reviewed, and names the gate.
    const tom = page
      .locator('[data-history-entry="review-approved"]')
      .filter({ hasText: 'Tom Okafor' })
      .first();
    await expect(tom).toContainText('approved');
    await expect(tom).not.toContainText('the change in');
    await expect(tom.locator('[data-history-gates]')).toHaveText('staging');
    await expect(tom.locator('[data-history-gates]')).toHaveAttribute(
      'data-history-gates',
      'For the gate to prod',
    );
    await expect(tom.getByTestId('history-review-origin')).toHaveText(
      'Made on another ChangeOrder',
    );
  });

  test('who can approve names the members of a group requirement', async ({ page }) => {
    await mockReviews(page, fx, 'author');
    await openReview(page, fx, { details: false });
    const box = statusBox(page);
    await expect(box).toContainText('Priya Nair');
    await expect(box).not.toContainText('Members of these groups can approve.');
  });

  test('"Ready to promote" only when every server gate is satisfied; else "Reviews complete"', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'satisfied');
    await openReview(page, fx, { details: false });
    const band = page.getByTestId('review-band');
    await expect(band).toContainText('can be promoted');
    await expect(page.getByRole('region', { name: 'ChangeOrder summary' })).toContainText(
      'Ready to promote',
    );
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready');
    // "Go to promote" leads to Promote, so it is Promote's purple.
    const goToPromote = page.locator('[data-review-cta="promote"]');
    await expect(goToPromote).toHaveText('Go to promote');
    await expect(goToPromote).toHaveCSS('background-color', PURPLE);
    await goToPromote.hover();
    await expect(goToPromote).toHaveCSS('background-color', PURPLE_HOVER);
    await page.mouse.move(0, 0);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockReviews(page, fx, 'satisfied', { otherGateHeld: true });
    await openReview(page, fx, { details: false });
    await expect(band).toContainText('Reviews complete');
    await expect(band).not.toContainText('can be promoted');
    await expect(page.locator('[data-review-cta="promote"]')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'ChangeOrder summary' })).not.toContainText(
      'Ready to promote',
    );
    await expect(statusBox(page)).not.toHaveAttribute('data-stage-state', 'ready');
  });

  test('nothing recordable: the Space error is shown and submit is disabled', async ({
    page,
  }) => {
    const mocks = await mockReviews(page, fx, 'partial', { dryRun: 'nothing' });
    await openReview(page, fx);
    await expect(page.locator('[data-coverage="space-error"]')).toContainText(
      'You need Approve on this Space.',
    );
    // A skipped Unit shows the server's Message first; without one, words for its code; never the bare code (#5788).
    const skipped = page.locator('[data-coverage="skipped"]');
    await expect(skipped.filter({ hasText: 'app' })).toContainText(
      'Skipped. Not changed in this Space.',
    );
    await expect(skipped.filter({ hasText: 'worker' })).toContainText(
      'Skipped. No Target, so never released.',
    );
    await expect(skipped).not.toContainText(['NoRevision']);
    await expect(skipped.filter({ hasText: 'worker' })).not.toContainText('NoTarget');
    await statusBox(page).getByTestId('review-approve').click();
    const form = statusBox(page).getByTestId('review-form');
    await expect(form.getByTestId('review-submit')).toHaveAttribute('aria-disabled', 'true');
    await expect(form).toContainText(stageCardCopy.review.nothingRecordable);
    expect(mocks.attests).toHaveLength(0);
  });

  test('two Attestation Types: one block each in the dialog, one /attest each', async ({
    page,
  }) => {
    const mocks = await mockReviews(page, fx, 'pending', { twoTypes: true });
    await openReview(page, fx, { details: false });
    await statusBox(page).getByTestId('review-approve').click();
    await statusBox(page).getByTestId('review-reason').fill('Checked both.');
    await statusBox(page).getByTestId('review-submit').click();
    // Two Types are two records, so the decision is still confirmed.
    const blocks = page.getByTestId('review-confirm-type');
    await expect(blocks).toHaveCount(2);
    await expect(blocks.nth(1)).toHaveAttribute('data-type', 'QASignoff');
    await page.getByTestId('review-confirm-submit').click();
    await expect(page.getByTestId('review-confirm')).toBeHidden({ timeout: 10000 });
    expect(mocks.attests).toHaveLength(2);
    expect(mocks.attests.map((a) => a.body.Type ?? 'Approval').sort()).toEqual([
      'Approval',
      'QASignoff',
    ]);
  });

  test('history: a revocation names the manager who revoked it, and whose decision it was', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'revoked');
    await openReview(page, fx);
    const row = page.locator('[data-history-entry="review-revoked"]').first();
    await expect(row).toContainText('Sam Achterberg', { timeout: 20000 });
    await expect(row.locator('[data-history-original]')).toContainText('Tom Okafor');
    await expect(details(page)).toContainText('by Sam Achterberg');
  });

  test('only the Units the change changed are counted; an unchanged one is recorded, not needed', async ({
    page,
  }) => {
    // Authors count, so the count is of the Units a gate reads alone.
    await mockReviews(page, fx, 'pending', { allowAuthors: true, unchangedUnit: true });
    await openReview(page, fx);
    const coverage = page.locator(
      '[data-testid="review-coverage"][data-coverage-type="Approval"]',
    );
    const notNeeded = coverage.locator('[data-coverage="not-needed"]');
    await expect(notNeeded).toHaveCount(1, { timeout: 20000 });
    await expect(notNeeded).toContainText('Not touched by the change.');
    const counted = await coverage.locator('[data-coverage="covered"]').count();
    const units = `${counted} ${counted === 1 ? 'Unit' : 'Units'}`;
    // The count is the coverage bar's summary (H7).
    await expect(page.getByTestId('review-coverage-toggle')).toContainText(
      `Covers ${units} in`,
    );
  });

  test('an author where authors may approve: the fact is behind the (i), never a line under the review', async ({
    page,
  }) => {
    // The viewer wrote the change, and the requirement accepts authors, so the decision counts.
    await mockReviews(page, fx, 'pending', { allowAuthors: true, asAuthor: true });
    await openReview(page, fx, { details: false });
    const review = page.getByTestId('open-review');
    await expect(review).toContainText(`${stageCardCopy.review.yourReview} ${stageCardCopy.review.needed}`, {
      timeout: 45000,
    });
    // Not shown by default.
    await expect(page.getByTestId('stage-log')).not.toContainText('Authors may approve here');
    await expect(page.getByTestId('stage-log')).not.toContainText('You wrote part of this change');
    await expect(page.getByTestId('stage-log')).not.toContainText('can approve too');
    // Behind one (i): named for a screen reader, and the tooltip opens on keyboard focus. Who else may
    // approve shares the same (i), so the line never has two.
    const info = review.getByTestId('review-info');
    await expect(info).toHaveCount(1);
    await expect(info).toHaveAttribute('role', 'img');
    await expect(info).toHaveAttribute(
      'aria-label',
      new RegExp(`^${stageCardCopy.review.reviewInfoLabel}: ${stageCardCopy.review.authorMayApprove}`.replace(/\./g, '\\.')),
    );
    await info.focus();
    await expect(page.getByRole('tooltip')).toContainText(stageCardCopy.review.authorMayApprove);
  });

  test("the first stage's review stays on the first stage: no pointer to it from anywhere else", async ({
    page,
  }) => {
    await mockReviews(page, fx, 'pending', { firstStage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/dev`);
    await expect(statusBox(page)).toBeVisible({ timeout: 45000 });
    // Not a review of another stage's change, so no way elsewhere; dev is released here, so no form either.
    await expect(page.getByTestId('review-on-pointer')).toHaveCount(0);
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(statusBox(page)).toBeVisible({ timeout: 45000 });
    await expect(
      page.getByTestId('review-on-pointer').filter({ hasText: 'first-look' }),
    ).toHaveCount(0);
  });

  test('history: the Reviews filter shows only review events', async ({ page }) => {
    await mockReviews(page, fx, 'partial');
    await openReview(page, fx, { details: false });
    const reviews = page.locator('[data-history-kind="reviews"]');
    await expect(reviews).toBeVisible({ timeout: 20000 });
    const count = Number((await reviews.locator('b').first().textContent()) ?? '0');
    expect(count).toBeGreaterThan(0);
    await reviews.click();
    const rows = page.locator('[data-history-entry]');
    await expect(rows).toHaveCount(count);
    for (const kind of await rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-history-entry')),
    )) {
      expect(kind?.startsWith('review-')).toBe(true);
    }
  });
});

test.describe('ChangeOrder reviews — Final sign-off', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    const fixtureContext = await newAuthorizedContext(browser);
    fixturePage = await fixtureContext.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildChangeOrderFixture(fixturePage, {
      resources: 'minimal',
      workflow: 'no-health-check',
    });
    // Every stage promoted, so Final reads the last stage's Revisions.
    for (const stage of ['dev', 'staging', PROD]) {
      const response = await hubApi.post('/api/promote', {
        data: { ChangeOrderID: fx.changeOrderId, TargetStage: stage },
      });
      expect(response.status(), `promote ${stage}: ${await response.text()}`).toBeLessThan(
        300,
      );
    }
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  test('the Complete step shows the sign-off panel, and the rail its count', async ({
    page,
  }) => {
    // One approval of two, recorded in the last stage's Spaces.
    await mockReviews(page, fx, 'partial', { signOff: true }, PROD);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      `${fx.changeOrderPath}/${encodeURIComponent('__change_order_complete__')}`,
    );
    const panel = page.getByTestId('review-panel');
    await expect(panel).toHaveAttribute('data-gate-kind', 'final', { timeout: 45000 });
    await expect(panel).toContainText('Sign-off');
    // The heading names the sign-off, not the last stage.
    await expect(panel).toContainText('Requirements for the sign-off');
    await expect(panel).not.toContainText(/Requirements for prod/i);
    // The count is the server's Final row, never an estimate.
    const signoff = page.getByTestId('review-requirement-signoff');
    await expect(signoff).toHaveAttribute('data-evaluated', 'true');
    await expect(signoff).toContainText('1 / 2');
    await expect(signoff).not.toContainText('estimate');
    await expect(page.getByTestId('stage-rail-signoff')).toContainText('Sign-off 1/2');
    await shoot(page, 'signoff' as State, 1440);
    await shoot(page, 'signoff' as State, 1000);
  });

  test('the sign-off panel: an author where authors may approve has the fact behind the (i), not in the text', async ({
    page,
  }) => {
    await mockReviews(page, fx, 'partial', { signOff: true, allowAuthors: true, asAuthor: true }, PROD);
    await page.goto(
      `${fx.changeOrderPath}/${encodeURIComponent('__change_order_complete__')}`,
    );
    const panel = page.getByTestId('review-panel');
    await expect(panel).toHaveAttribute('data-gate-kind', 'final', { timeout: 45000 });
    const info = panel.getByTestId('review-panel-info');
    await expect(info).toHaveAttribute(
      'aria-label',
      `${reviewCopy.you.infoLabel}: ${reviewCopy.you.authorsMayApprove}`,
    );
    await expect(panel).not.toContainText('Authors may approve');
  });

  test('before Final opens: "not open yet", never a permission problem', async ({ page }) => {
    await mockReviews(page, fx, 'partial', { signOff: true, signOffNotOpen: true }, PROD);
    await page.goto(
      `${fx.changeOrderPath}/${encodeURIComponent('__change_order_complete__')}`,
    );
    const panel = page.getByTestId('review-panel');
    await expect(panel).toHaveAttribute('data-gate-kind', 'final', { timeout: 45000 });
    const signoff = page.getByTestId('review-requirement-signoff');
    await expect(signoff).toHaveAttribute('data-evaluated', 'false');
    await expect(signoff).toContainText('Not open yet');
    await expect(signoff).toContainText('Sign-off opens when every stage has the change.');
    await expect(panel).not.toContainText(/not evaluated for you/i);
    await expect(page.getByTestId('stage-rail-signoff')).toContainText(
      'Sign-off not open yet',
    );
  });

  test('a workflow the server reports complete reads complete on the Complete node', async ({
    page,
  }) => {
    // Stage still lags at prod, but the completion probe answers 400 "has completed ChangeWorkflow".
    await mockReviews(page, fx, 'satisfied', { signOff: true, signOffCompleted: true }, PROD);
    await page.goto(
      `${fx.changeOrderPath}/${encodeURIComponent('__change_order_complete__')}`,
    );
    await expect(page.getByTestId('review-panel')).toHaveAttribute('data-gate-kind', 'final', {
      timeout: 45000,
    });
    const node = page.getByTestId('stage-rail-complete');
    await expect(node).not.toContainText('Not complete', { timeout: 20000 });
    await expect(node).toContainText('Complete');
    // The tally agrees: every Final gate counts as satisfied.
    const tally = await node.innerText();
    const match = /(\d+)\/(\d+)/.exec(
      tally.split('\n').find((line) => /^\d+\/\d+$/.test(line.trim())) ?? '',
    );
    expect(match !== null && match[1] === match[2]).toBe(true);
  });
});
