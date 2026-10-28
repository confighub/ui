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
 * `prod`: the status box asks for the decision there, beside the Promote it waits
 * on. `staging`'s card, whose change the review reads, lists it read-only with the
 * way to `prod`. The routes in `fixtures/stage-card/reviewMocks.ts` add the review
 * requirements, the records, the server's gate rows and the made-up reviewers.
 *
 * Every other request reaches the server (`route.fallback()`).
 *
 * Screenshots of every state at 1440 and 1000 px go to
 * `test-results/change-order-reviews/<state>-<width>.png`. They are for a person to
 * compare with the design; nothing here compares pixels.
 */
import { mkdirSync } from 'fs';

import { type Locator, type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { noteRequired, stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';
import { type ChangeOrderFixture, buildChangeOrderFixture } from './fixtures/change-order-fixture';
import { HOUR, PEOPLE, STATES, type State, mockReviews } from './fixtures/stage-card/reviewMocks';

test.describe.configure({ mode: 'serial' });

const SHOT_DIR = 'test-results/change-order-reviews';
const PROD = 'prod';
const PURPLE = 'rgb(104, 36, 196)'; // componentTheme.promote: Promote, Release, and "Go to promote" / "Go to release"
const PURPLE_HOVER = 'rgb(78, 26, 150)'; // componentTheme.promoteEmphasis: their hover
const PRIMARY = 'rgb(186, 61, 3)'; // theme primary: every other filled action, such as submitting a review
const INK = 'rgb(25, 29, 35)'; // changeOrderInk.default: the band keeps its own tokens
const BORDER_STRONG = 'rgb(205, 210, 218)'; // changeOrderBorder.strong
const CARD = 'rgb(255, 255, 255)'; // changeOrderSurface.card
const TEXT_PRIMARY = 'rgb(17, 18, 20)'; // text.primary: the ink a prose link is drawn in

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

const statusBox = (page: Page) => page.getByTestId('stage-status');
const sidebar = (page: Page) => page.getByTestId('stage-sidebar');

/**
 * The prod card: where prod's entry gate, which reads staging's Spaces, is reviewed.
 * `details` also opens each review row's "Review details", where the coverage, the
 * requests, the requirements and the decisions are.
 */
async function openReview(page: Page, fx: ChangeOrderFixture, { details = true }: { details?: boolean } = {}): Promise<void> {
  await page.goto(`${fx.changeOrderPath}/${PROD}`);
  await expect(statusBox(page)).toBeVisible({ timeout: 45000 });
  await expect(sidebar(page).getByTestId('stage-review-row').first()).toBeVisible({ timeout: 20000 });
  if (details) await openReviewDetails(page);
}

/** Opens every closed review row of the sidebar, then any closed section inside them. */
async function openReviewDetails(page: Page, { decisions = true }: { decisions?: boolean } = {}): Promise<void> {
  const closed = sidebar(page).locator('[data-testid="stage-review-row"] > [aria-expanded="false"]');
  for (let i = 0; i < 6 && (await closed.count()) > 0; i++) await closed.first().click();
  const sections = page.locator('[data-testid="review-section-toggle"][aria-expanded="false"]');
  for (let i = 0; i < 8 && (await sections.count()) > 0; i++) await sections.first().click();
  if (decisions) await expect(page.getByTestId('review-decision').first()).toBeAttached({ timeout: 20000 });
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
    return root === null ? 900 : Math.ceil(root.getBoundingClientRect().top + root.scrollHeight + 24);
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
      .poll(async () => (await hubApi.get('/api/space', { params: { limit: 1 } })).status(), { timeout: 60000, intervals: [1000] })
      .toBe(200);
    fx = await buildChangeOrderFixture(fixturePage, { resources: 'minimal', workflow: 'no-health-check' });
    /*
     * Through `POST /api/promote`, not `fx.promoteStage`: only a real promotion
     * writes the ChangeOrder's promotion records, and those name the test user
     * as the promoter, so as an author of the change in the staging Spaces.
     */
    for (const stage of ['dev', 'staging']) {
      const response = await hubApi.post('/api/promote', { data: { ChangeOrderID: fx.changeOrderId, TargetStage: stage } });
      expect(response.status(), `promote ${stage}: ${await response.text()}`).toBeLessThan(300);
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

  test('the rail marks prod held on review, and Review now stays on prod and focuses Approve…', async ({ page }) => {
    await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByTestId('review-band')).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('stage-rail-review').first()).toContainText('Review 1/2 on security-review');
    await expect(page.getByTestId('review-band')).toContainText('prod needs 1 more approval of the change in staging on');

    // At 1000 px the rail wraps, and the held link stays on the row of the node it leads into.
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    await page.setViewportSize({ width: 1000, height: 900 });
    const link = page.locator('[data-review-hold="held"]');
    const node = page.locator('[role="button"][aria-pressed="true"]').filter({ hasText: 'Held on review' });
    await expect(node).toBeVisible({ timeout: 45000 });
    const [linkBox, nodeBox] = [await link.boundingBox(), await node.boundingBox()];
    expect(linkBox && nodeBox && linkBox.y >= nodeBox.y && linkBox.y < nodeBox.y + nodeBox.height).toBe(true);
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
      bar: Math.max(0, ...Array.from(document.querySelectorAll('header, .MuiAppBar-root')).map((el) => el.getBoundingClientRect().bottom)),
    }));
    expect(tops.box).toBeGreaterThanOrEqual(tops.bar);
    await expect(page.locator('#review')).toHaveAttribute('data-testid', 'stage-status');
    // The link to this review is in the review row's details, for a reviewer too.
    await openReviewDetails(page);
    await expect(sidebar(page).getByRole('button', { name: stageCardCopy.reviewRow.copyLink })).toBeVisible();
  });

  test("prod's card hosts the review; staging's lists it read-only with the way to prod", async ({ page }) => {
    await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReview(page, fx, { details: false });
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'reviewNeeded');
    await expect(page.locator('#stage-status-heading')).toHaveText(stageCardCopy.headline.reviewNeeded);
    await expect(box).toContainText('security-review');
    await expect(box).toContainText('of the change in staging before prod can be promoted.');
    await expect(box.getByTestId('review-approve')).toBeVisible();
    await expect(box.getByTestId('review-reject')).toBeVisible();
    // Held on review, so Promote is not offered at all, not even disabled.
    await expect(page.locator('[data-promote-stage]')).toHaveCount(0);
    // The sidebar row: the requirement and what it still needs.
    const row = sidebar(page).locator('[data-testid="stage-review-row"][data-requirement="security-review"]');
    await expect(row).toContainText(stageCardCopy.reviewRow.needs(1));

    await page.goto(`${fx.changeOrderPath}/staging`);
    const readOnly = sidebar(page).getByTestId('stage-review-row').filter({ hasText: 'counts toward the gate into' });
    await expect(readOnly.first()).toBeVisible({ timeout: 45000 });
    await expect(sidebar(page)).toContainText(stageCardCopy.sidebar.reviewsOfChange);
    // One form per gate: staging's card has none.
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(page.getByTestId('review-form')).toHaveCount(0);
    await sidebar(page).getByRole('link', { name: new RegExp(stageCardCopy.reviewRow.reviewOn(PROD)) }).click();
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/${PROD}$`));
    await expect(page.getByTestId('review-approve')).toBeVisible({ timeout: 20000 });
  });

  test("prod's box names staging as an ink link to staging's card, and staging's card has no form", async ({ page }) => {
    await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReview(page, fx, { details: false });
    const link = statusBox(page).getByRole('link', { name: 'staging', exact: true });
    await expect(link).toBeVisible();
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('underline');
    // Ink, not a coloured link: the text colour, never rust or blue, at rest and on hover.
    for (const state of ['rest', 'hover'] as const) {
      if (state === 'hover') await link.hover();
      expect(await link.evaluate((el) => getComputedStyle(el).color)).toBe(TEXT_PRIMARY);
    }
    // The band names staging too; the form is on this card, so the band does not lead away from it.
    await expect(page.getByTestId('review-band')).toContainText('of the change in staging');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/staging$`));
    await expect(page.getByLabel('Stage staging', { exact: true })).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
  });

  test('staging not promoted: prod hosts no review yet, says when it opens, and nothing leads to an empty card', async ({ page }) => {
    const spaceIds = fx.spacesInStage('staging').map((space) => space.spaceId);
    await mockReviews(page, fx, 'partial', { stagingReached: { how: 'none', spaceIds } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    const row = sidebar(page).locator('[data-testid="stage-review-row"][data-requirement="security-review"]');
    await expect(row).toContainText(stageCardCopy.reviewRow.notLanded('staging'), { timeout: 45000 });
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(statusBox(page)).not.toHaveAttribute('data-stage-state', /^review/);
    // Nothing offers a way to a card without the form.
    await expect(page.locator('[data-review-cta="review"], [data-review-cta="panel"]')).toHaveCount(0);
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByLabel('Stage staging', { exact: true })).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(sidebar(page).getByRole('link', { name: new RegExp(stageCardCopy.reviewRow.reviewOn(PROD)) })).toHaveCount(0);
  });

  test('staging part-promoted: the review is on prod, and staging links to it', async ({ page }) => {
    const spaceIds = fx.spacesInStage('staging').map((space) => space.spaceId);
    await mockReviews(page, fx, 'partial', { stagingReached: { how: 'part', spaceIds } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    const go = sidebar(page).getByRole('link', { name: new RegExp(stageCardCopy.reviewRow.reviewOn(PROD)) });
    await expect(go).toBeVisible({ timeout: 45000 });
    await go.click();
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/${PROD}$`));
    const row = sidebar(page).locator('[data-testid="stage-review-row"][data-requirement="security-review"]');
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).not.toContainText(stageCardCopy.reviewRow.notLanded('staging'));
  });

  test('approve: the form opens in the box, and one Pass is recorded with no dialog', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReview(page, fx, { details: false });
    await page.getByTestId('review-approve').click();
    const form = statusBox(page).getByTestId('review-form');
    await expect(form).toBeVisible();
    const reason = form.getByTestId('review-reason');
    const submit = form.getByTestId('review-submit');
    // Focus goes where the next keystroke belongs: the field when a reason is needed, else Submit.
    await expect(noteRequired('Pass') ? reason : submit).toBeFocused();
    await expect(reason).toHaveAttribute('placeholder', stageCardCopy.review.placeholderPass);
    // Whether an approval needs a reason is one flag (the server accepts none).
    await expect(form.getByLabel(stageCardCopy.review.reasonLabel(noteRequired('Pass')))).toBeVisible();
    await expect(form).toContainText(stageCardCopy.review.coverageHelp(stageCardCopy.review.coverageSummary(2, 2)));
    await expect(submit).toHaveText(stageCardCopy.review.submitApproval);
    await expect(submit).toHaveCSS('background-color', PRIMARY);
    // The counter appears only near the limit.
    await reason.fill('x'.repeat(3501));
    await expect(form).toContainText(stageCardCopy.review.counter(3501));
    await reason.fill('Checked it.');
    await expect(form).not.toContainText(stageCardCopy.review.counter(11));
    await submit.click();
    await expect(page.getByTestId('review-confirm')).toHaveCount(0);
    await expect.poll(() => mocks.attests.length, { timeout: 10000 }).toBe(1);
    expect(mocks.attests[0].body).toMatchObject({ Result: 'Pass', Note: 'Checked it.', ChangeOrderID: fx.changeOrderId, TargetStage: 'staging' });
    // Worded from the gate as the server reports it after the write. The mocked server still
    // counts 1 of 2 (it does not count the new record), so a prediction would have said otherwise.
    await expect(page.getByTestId('review-toast')).toContainText(
      'Approval of the change in staging recorded. security-review: 1 of 2 for the gate to prod.',
    );
  });

  test('reject: the reason is required, and it is recorded as Fail with no dialog', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial');
    await openReview(page, fx, { details: false });
    await page.getByTestId('review-reject').click();
    const form = statusBox(page).getByTestId('review-form');
    const reason = form.getByTestId('review-reason');
    await expect(reason).toHaveAttribute('placeholder', stageCardCopy.review.placeholderFail('staging'));
    await expect(form.getByLabel(stageCardCopy.review.reasonLabel(true))).toBeVisible();
    const submit = form.getByTestId('review-submit');
    await expect(submit).toHaveText(stageCardCopy.review.submitRejection);
    await submit.click();
    await expect(form).toContainText(stageCardCopy.review.reasonMissing);
    await expect(reason).toBeFocused();
    expect(mocks.attests).toHaveLength(0);
    await reason.fill('Pin lazyfree-lazy-user-del to no.');
    await submit.click();
    await expect(page.getByTestId('review-confirm')).toHaveCount(0);
    await expect.poll(() => mocks.attests.length, { timeout: 10000 }).toBe(1);
    expect(mocks.attests[0].body).toMatchObject({ Result: 'Fail', Note: 'Pin lazyfree-lazy-user-del to no.' });
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

  test('author: no decision form, why, who can approve, and a link to copy', async ({ page }) => {
    await mockReviews(page, fx, 'author');
    await openReview(page, fx);
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'reviewWaiting');
    await expect(page.locator('#stage-status-heading')).toHaveText(stageCardCopy.headline.reviewWaiting);
    await expect(box).toContainText('since you wrote this change');
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(box.getByRole('button', { name: stageCardCopy.review.requestReview })).toBeVisible();
    // The link to this review is an icon button in the review row's details, and it
    // writes the address of the card that hosts the review.
    const copy = sidebar(page).getByRole('button', { name: stageCardCopy.reviewRow.copyLink });
    await expect(copy).toBeVisible();
    await copy.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([
      expect.stringMatching(new RegExp(`${fx.changeOrderPath}/${PROD}#review$`)),
    ]);
    await expect(page.getByTestId('review-toast')).toContainText('Link to this review copied.');
    await expect(page.locator('[data-review-cta="panel"]')).toHaveText('See who can');
    // The dry run saves an author's decision on the Units, and it would not count.
    await expect(page.getByTestId('review-coverage').first()).toContainText(/would be saved on \d+ Units?, but it would not count/);
  });

  test('change my decision: revoke each record, then record the new one', async ({ page }) => {
    // Priya approved and one more approval is needed, so the box waits on others and
    // offers her the way to change what she recorded.
    const mocks = await mockReviews(page, fx, 'pending', {
      extraSeeds: [{ id: 'priya', who: 'priya', result: 'Pass', agoMs: HOUR, note: 'Ran the failover drill.' }],
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
    const details = sidebar(page);
    await expect(details.getByText('Withdrawn', { exact: true }).first()).toBeVisible();
    await expect(details.getByText('Expired', { exact: true }).first()).toBeVisible();
    await expect(details.getByText(/^Replaces Tom’s rejection from/)).toBeVisible();
    // A replacement sits right above the decision it replaced.
    const names = await details.getByTestId('review-decision').evaluateAll((rows) =>
      rows.map((row) => `${(row.textContent ?? '').includes('Tom Okafor') ? 'Tom Okafor' : 'other'}:${row.getAttribute('data-decision-live')}`),
    );
    expect(names.slice(0, 2)).toEqual(['Tom Okafor:true', 'Tom Okafor:false']);
    // The history names an expired approval as one word with its ’s, and dates it the page's way.
    // (The name and its ’s are one flex item, so the row's gap cannot come between them.)
    await expect(
      page.locator('[data-history-entry="review-expired"]').first().locator('span', { hasText: /Lena Fischer’s$/ }).first(),
    ).toBeVisible();
    await expect(page.locator('[data-history-entry="review-revoked"]').first()).toContainText(/from \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}/);
  });

  test('release review: the box holds Release on the promoted stage, and offers no Release button', async ({ page }) => {
    await mockReviews(page, fx, 'pending', { release: 'held' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', /^review(Needed|Waiting)$/, { timeout: 45000 });
    await expect(box).toContainText('release-ok');
    await expect(box).toContainText('before staging can be released.');
    // Held: no Release button, not even a disabled one.
    await expect(page.locator('[data-release-stage]')).toHaveCount(0);
    await expect(page.getByTestId('stage-rail-review').first()).toContainText('Release review');
    const row = sidebar(page).locator('[data-testid="stage-review-row"][data-requirement="release-ok"]');
    // The count is the server's row: 0 of 1, so 1 approval needed.
    await expect(row).toContainText(stageCardCopy.reviewRow.needs(1));
    await openReviewDetails(page);
    await expect(page.getByTestId('review-requirement-release-ok')).toHaveAttribute('data-evaluated', 'true');
    await shoot(page, 'release', 1440);
    await shoot(page, 'release', 1000);
  });

  test('a release dry run refused with 403: not evaluated, no hold, no count, and the page stays', async ({ page }) => {
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

  test('release with nothing new to release (200, no Gates): not evaluated, no hold, and plain words', async ({ page }) => {
    await mockReviews(page, fx, 'pending', { release: 'unchanged' });
    await page.goto(`${fx.changeOrderPath}/staging`);
    const row = sidebar(page).locator('[data-testid="stage-review-row"][data-requirement="release-ok"]');
    await expect(row).toBeVisible({ timeout: 45000 });
    // Plain words: nothing to release. Never "not evaluated", which reads as a permission problem.
    await expect(row).not.toContainText(/not evaluated/i);
    await openReviewDetails(page);
    await expect(page.getByTestId('review-requirement-release-ok')).toHaveAttribute('data-evaluated', 'false');
    await expect(page.getByTestId('review-requirement-release-ok')).toContainText('Nothing new to release');
  });

  test('AllowAuthors: an author viewer counts, and nothing says "does not count"', async ({ page }) => {
    // The viewer wrote the gate Revisions, so the attest dry run marks them Authored.
    await mockReviews(page, fx, 'author', { allowAuthors: true });
    await openReview(page, fx);
    const coverage = page.locator('[data-testid="review-coverage"][data-coverage-type="Approval"]');
    await expect(coverage.locator('[data-coverage="covered"]').first()).toBeVisible({ timeout: 45000 });
    await expect(coverage.locator('[data-coverage="recorded-only"]')).toHaveCount(0);
    await expect(coverage).not.toContainText('does not count');
    await expect(coverage).not.toContainText('would not count');
    const card = page.getByTestId('stage-card');
    await expect(card).not.toContainText('you can review for');
    // security-review allows authors, so the author is offered the decision.
    await expect(statusBox(page).getByTestId('review-approve')).toBeVisible();
    await expect(card).not.toContainText('Authors may approve here.');
  });

  test('a not-eligible viewer with a decision: not eligible first, and no way to change it', async ({ page }) => {
    await mockReviews(page, fx, 'partial', {
      viewer: 'sam',
      extraSeeds: [{ id: 'sam', who: 'sam', result: 'Pass', agoMs: HOUR, note: 'Looks fine to me.' }],
    });
    await openReview(page, fx, { details: false });
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'reviewWaiting');
    await expect(box.getByTestId('review-not-eligible')).toContainText('You are not a reviewer for this requirement.');
    await expect(box).not.toContainText('Your approval covers');
    await expect(page.getByTestId('review-change')).toHaveCount(0);
    await expect(page.getByTestId('review-band')).not.toContainText('You approved. Waiting on others.');
    await expect(page.getByTestId('review-band')).toContainText('You are not a reviewer.');
  });

  test('a not-eligible viewer with a decision: the box lists it as recorded but not counted', async ({ page }) => {
    await mockReviews(page, fx, 'partial', {
      viewer: 'sam',
      extraSeeds: [{ id: 'sam', who: 'sam', result: 'Pass', agoMs: HOUR, note: 'Looks fine to me.' }],
    });
    await openReview(page, fx, { details: false });
    const own = statusBox(page).getByTestId('review-own-not-counted').first();
    await expect(own).toContainText('It does not count.', { timeout: 10000 });
    await expect(own).toContainText('Not counted: not in security-reviewers');
  });

  test('history: a service account has the same initials as in the review details', async ({ page }) => {
    await mockReviews(page, fx, 'partial', {
      extraSeeds: [{ id: 'bot', who: 'bot', result: 'Pass', agoMs: HOUR, note: 'Automated check passed.' }],
    });
    await openReview(page, fx);
    const row = page.locator('[data-history-entry="review-approved"]').filter({ hasText: 'rv-bot' }).first();
    await expect(row).toBeVisible();
    await expect(row.locator('.MuiAvatar-root').first()).toHaveText('RB');
    await expect(page.getByTestId('review-decision').filter({ hasText: 'rv-bot' }).first()).toContainText('RB');
  });

  test('server discard reasons: too old, revoked, counted', async ({ page }) => {
    await mockReviews(page, fx, 'revoked');
    await openReview(page, fx);
    const entries = page.getByTestId('review-decision-entry');
    await expect(entries.filter({ hasText: 'Not counted: older than 72h' }).first()).toBeVisible();
    await expect(page.locator('[data-testid="review-decision-entry"][data-reason="Revoked"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="review-decision-entry"][data-reason="Counted"]').first()).toContainText('Counts on');
  });

  test('Caller: a viewer the server finds not eligible gets no form', async ({ page }) => {
    // Sam is not in security-reviewers, and not listed for qa-signoff.
    await mockReviews(page, fx, 'partial', { viewer: 'sam' });
    await openReview(page, fx, { details: false });
    await expect(statusBox(page).getByTestId('review-not-eligible')).toContainText('You are not a reviewer for this requirement.');
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(page.getByTestId('review-form')).toHaveCount(0);
  });

  test('not evaluated for the viewer: no counts, the decisions still listed, and the page stays', async ({ page }) => {
    await mockReviews(page, fx, 'partial', { entryNoPermission: true });
    await openReview(page, fx);
    await expect(page).not.toHaveURL(/access-denied/);
    const row = sidebar(page).locator('[data-testid="stage-review-row"][data-requirement="security-review"]');
    await expect(row).toContainText(stageCardCopy.reviewRow.notEvaluated);
    await expect(page.getByTestId('review-requirement-security-review')).toHaveAttribute('data-evaluated', 'false');
    await expect(page.getByTestId('review-requirement-security-review')).not.toContainText(/\d+ \/ \d+/);
    // Who decided, with their notes, is still shown.
    await expect(page.getByTestId('review-decision').first()).toContainText('Lena Fischer');
  });

  test('review requested of the viewer: band, box, and the request in the details', async ({ page }) => {
    await mockReviews(page, fx, 'partial', { requests: [{ who: 'priya', by: 'tom', agoMs: 3 * HOUR }] });
    await openReview(page, fx);
    await expect(page.getByTestId('review-band')).toContainText('Review requested of you by Tom Okafor');
    await expect(statusBox(page)).toContainText('Tom Okafor asked you to review this');
    await expect(page.getByTestId('review-request').first()).toContainText('Priya Nair');
  });

  test('request review from someone, then withdraw it', async ({ page }) => {
    // The author asks. Lena has approved and Tom was asked already, so Priya is the one to ask.
    const mocks = await mockReviews(page, fx, 'author', { requests: [{ who: 'tom', by: 'priya', agoMs: HOUR }] });
    await openReview(page, fx, { details: false });
    await statusBox(page).getByRole('button', { name: stageCardCopy.review.requestReview }).click();
    const picker = statusBox(page).getByTestId('review-request-picker');
    await expect(picker).toContainText(stageCardCopy.review.requestFrom);
    await expect(picker.getByRole('checkbox', { name: 'Priya Nair' })).toBeVisible();
    const submit = picker.getByRole('button', { name: stageCardCopy.review.requestSubmit, exact: true });
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await picker.getByRole('checkbox', { name: 'Priya Nair' }).check();
    await submit.click();
    await expect.poll(() => mocks.patches.length).toBe(1);
    const added = mocks.patches[0] as { ReviewRequests?: { UserID?: string; Stage?: string }[]; Version?: number };
    expect(added.Version).toBeDefined();
    expect((added.ReviewRequests ?? []).map((r) => r.UserID).sort()).toEqual([PEOPLE.tom.id, PEOPLE.priya.id].sort());

    await openReviewDetails(page);
    await expect(page.getByTestId('review-request').filter({ hasText: 'Priya Nair' })).toBeVisible();
    await page.getByTestId('review-request').filter({ hasText: 'Tom Okafor' }).getByTestId('review-request-withdraw').click();
    await expect.poll(() => mocks.patches.length).toBe(2);
    const removed = mocks.patches[1] as { ReviewRequests?: { UserID?: string }[] };
    expect((removed.ReviewRequests ?? []).map((r) => r.UserID)).toEqual([PEOPLE.priya.id]);
    await expect(page.getByTestId('review-request').filter({ hasText: 'Tom Okafor' })).toHaveCount(0);
  });

  test('a refused request (403) hides the request actions and keeps the page', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial', { requests: [{ who: 'tom', by: 'priya', agoMs: HOUR }], requestForbidden: true });
    await openReview(page, fx);
    await page.getByTestId('review-request-withdraw').first().click();
    await expect.poll(() => mocks.patches.length).toBe(1);
    await expect(page).not.toHaveURL(/access-denied/);
    await expect(page.getByTestId('review-request-withdraw')).toHaveCount(0);
  });

  test('a partly authored gate keeps the form, says where the decision does not count, and confirms', async ({ page }) => {
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

  test('a decision that would count nowhere: no form, and the box says why', async ({ page }) => {
    // The server's row counts the viewer, but the coverage says the viewer wrote every Unit.
    await mockReviews(page, fx, 'partial', { coverageAuthoredOnly: true });
    await openReview(page, fx, { details: false });
    await expect(statusBox(page)).toContainText(stageCardCopy.review.wouldNotCount);
    await expect(page.getByTestId('review-approve')).toHaveCount(0);
    await expect(page.getByTestId('stage-card')).not.toContainText('Authors may approve here.');
  });

  test('a decision from another ChangeOrder says so; history names the reviewed stage and the gate', async ({ page }) => {
    await mockReviews(page, fx, 'partial', {
      extraSeeds: [
        { id: 'carried', who: 'tom', result: 'Pass', agoMs: 5 * HOUR, note: 'Approved on the aborted ChangeOrder.', changeOrderId: '1f0c2a9e-55b1-4d0e-9f53-2c7a3e1b9d40' },
        { id: 'cli', who: 'sam', result: 'Pass', agoMs: 6 * HOUR, note: 'Approved with cub.', changeOrderId: null },
      ],
    });
    await openReview(page, fx);
    const details = sidebar(page);
    await expect(details.locator('[data-testid="review-decision-origin"][data-origin="other"]')).toContainText('Made on another ChangeOrder.');
    await expect(details.locator('[data-testid="review-decision-origin"][data-origin="none"]')).toContainText('Made outside a ChangeOrder.');
    // Decisions of this ChangeOrder carry no origin line.
    await expect(details.getByTestId('review-decision-origin')).toHaveCount(2);
    // The history files the approval under the stage whose change was reviewed, and names the gate.
    const tom = page.locator('[data-history-entry="review-approved"]').filter({ hasText: 'Tom Okafor' }).first();
    await expect(tom).toContainText('approved');
    await expect(tom).not.toContainText('the change in');
    await expect(tom.locator('[data-history-gates]')).toHaveText('staging');
    await expect(tom.locator('[data-history-gates]')).toHaveAttribute('data-history-gates', 'For the gate to prod');
    await expect(tom.getByTestId('history-review-origin')).toHaveText('Made on another ChangeOrder');
  });

  test('who can approve names the members of a group requirement', async ({ page }) => {
    await mockReviews(page, fx, 'author');
    await openReview(page, fx, { details: false });
    const box = statusBox(page);
    await expect(box).toContainText('Priya Nair');
    await expect(box).not.toContainText('Members of these groups can approve.');
  });

  test('"Ready to promote" only when every server gate is satisfied; else "Reviews complete"', async ({ page }) => {
    await mockReviews(page, fx, 'satisfied');
    await openReview(page, fx, { details: false });
    const band = page.getByTestId('review-band');
    await expect(band).toContainText('can be promoted');
    await expect(page.getByRole('region', { name: 'ChangeOrder summary' })).toContainText('Ready to promote');
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
    await expect(page.getByRole('region', { name: 'ChangeOrder summary' })).not.toContainText('Ready to promote');
    await expect(statusBox(page)).not.toHaveAttribute('data-stage-state', 'ready');
  });

  test('nothing recordable: the Space error is shown and submit is disabled', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial', { dryRun: 'nothing' });
    await openReview(page, fx);
    await expect(page.locator('[data-coverage="space-error"]')).toContainText('You need Approve on this Space.');
    // A skipped Unit shows the server's Message first; without one, words for its code; never the bare code (#5788).
    const skipped = page.locator('[data-coverage="skipped"]');
    await expect(skipped.filter({ hasText: 'app' })).toContainText('Skipped. Not changed in this Space.');
    await expect(skipped.filter({ hasText: 'worker' })).toContainText('Skipped. No Target, so never released.');
    await expect(skipped).not.toContainText(['NoRevision']);
    await expect(skipped.filter({ hasText: 'worker' })).not.toContainText('NoTarget');
    await statusBox(page).getByTestId('review-approve').click();
    const form = statusBox(page).getByTestId('review-form');
    await expect(form.getByTestId('review-submit')).toHaveAttribute('aria-disabled', 'true');
    await expect(form).toContainText(stageCardCopy.review.nothingRecordable);
    expect(mocks.attests).toHaveLength(0);
  });

  test('two Attestation Types: one block each in the dialog, one /attest each', async ({ page }) => {
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
    expect(mocks.attests.map((a) => a.body.Type ?? 'Approval').sort()).toEqual(['Approval', 'QASignoff']);
  });

  test('history: a revocation names the manager who revoked it, and whose decision it was', async ({ page }) => {
    await mockReviews(page, fx, 'revoked');
    await openReview(page, fx);
    const row = page.locator('[data-history-entry="review-revoked"]').first();
    await expect(row).toContainText('Sam Achterberg', { timeout: 20000 });
    await expect(row.locator('[data-history-original]')).toContainText('Tom Okafor');
    await expect(sidebar(page)).toContainText('by Sam Achterberg');
  });

  test('only the Units the change changed are counted; an unchanged one is recorded, not needed', async ({ page }) => {
    // Authors count, so the count is of the Units a gate reads alone.
    await mockReviews(page, fx, 'pending', { allowAuthors: true, unchangedUnit: true });
    await openReview(page, fx);
    const coverage = page.locator('[data-testid="review-coverage"][data-coverage-type="Approval"]');
    const notNeeded = coverage.locator('[data-coverage="not-needed"]');
    await expect(notNeeded).toHaveCount(1, { timeout: 20000 });
    await expect(notNeeded).toContainText('Not touched by the change.');
    const counted = await coverage.locator('[data-coverage="covered"]').count();
    const units = `${counted} ${counted === 1 ? 'Unit' : 'Units'}`;
    await expect(coverage).toContainText(`Covers ${units} in`);
    // The form says what an approval covers, by the same count.
    await statusBox(page).getByTestId('review-approve').click();
    await expect(statusBox(page).getByTestId('review-form')).toContainText(`${units} in`);
  });

  test("the first stage's review stays on the first stage and names the ChangeOrder's own Space", async ({ page }) => {
    await mockReviews(page, fx, 'pending', { firstStage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/dev`);
    const row = sidebar(page).locator('[data-testid="stage-review-row"][data-requirement="first-look"]');
    await expect(row).toBeVisible({ timeout: 45000 });
    // Not a review of another stage's change, so no way elsewhere.
    await expect(sidebar(page).getByRole('link', { name: /^Review on / })).toHaveCount(0);
    // Nobody has decided on the first stage yet, so the details list no decision.
    await openReviewDetails(page, { decisions: false });
    await expect(row).toContainText(fx.spaces.base.slug);
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
    for (const kind of await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-history-entry')))) {
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
    fx = await buildChangeOrderFixture(fixturePage, { resources: 'minimal', workflow: 'no-health-check' });
    // Every stage promoted, so Final reads the last stage's Revisions.
    for (const stage of ['dev', 'staging', PROD]) {
      const response = await hubApi.post('/api/promote', { data: { ChangeOrderID: fx.changeOrderId, TargetStage: stage } });
      expect(response.status(), `promote ${stage}: ${await response.text()}`).toBeLessThan(300);
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

  test('the Complete step shows the sign-off panel, and the rail its count', async ({ page }) => {
    // One approval of two, recorded in the last stage's Spaces.
    await mockReviews(page, fx, 'partial', { signOff: true }, PROD);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/${encodeURIComponent('__change_order_complete__')}`);
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

  test('before Final opens: "not open yet", never a permission problem', async ({ page }) => {
    await mockReviews(page, fx, 'partial', { signOff: true, signOffNotOpen: true }, PROD);
    await page.goto(`${fx.changeOrderPath}/${encodeURIComponent('__change_order_complete__')}`);
    const panel = page.getByTestId('review-panel');
    await expect(panel).toHaveAttribute('data-gate-kind', 'final', { timeout: 45000 });
    const signoff = page.getByTestId('review-requirement-signoff');
    await expect(signoff).toHaveAttribute('data-evaluated', 'false');
    await expect(signoff).toContainText('Not open yet');
    await expect(signoff).toContainText('Sign-off opens when every stage has the change.');
    await expect(panel).not.toContainText(/not evaluated for you/i);
    await expect(page.getByTestId('stage-rail-signoff')).toContainText('Sign-off not open yet');
  });

  test('a workflow the server reports complete reads complete on the Complete node', async ({ page }) => {
    // Stage still lags at prod, but the completion probe answers 400 "has completed ChangeWorkflow".
    await mockReviews(page, fx, 'satisfied', { signOff: true, signOffCompleted: true }, PROD);
    await page.goto(`${fx.changeOrderPath}/${encodeURIComponent('__change_order_complete__')}`);
    await expect(page.getByTestId('review-panel')).toHaveAttribute('data-gate-kind', 'final', { timeout: 45000 });
    const node = page.getByTestId('stage-rail-complete');
    await expect(node).not.toContainText('Not complete', { timeout: 20000 });
    await expect(node).toContainText('Complete');
    // The tally agrees: every Final gate counts as satisfied.
    const tally = await node.innerText();
    const match = /(\d+)\/(\d+)/.exec(tally.split('\n').find((line) => /^\d+\/\d+$/.test(line.trim())) ?? '');
    expect(match !== null && match[1] === match[2]).toBe(true);
  });
});
