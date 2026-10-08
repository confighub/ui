// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * A gate holding a stage means the stage is not promoted.
 *
 * THE WHOLE CLAIM IS AN ABSENCE, so it is asserted as one. "Refused" is not
 * "an error was reported": a refusal that has already written half a promotion
 * is the state this spec exists to rule out. Every request the page makes is
 * watched, and the assertion is that none of the ones that WRITE were issued.
 *
 * ⚠️ `dry_run` IS THE WHOLE OF THE DISTINCTION, AND IT IS EASY TO GET
 * BACKWARDS. A promotion is one `POST /api/promote`; the same route with
 * `dry_run=true` writes nothing and is exactly what opening this dialog issues
 * to find out what holds the stage. Counting those would report every dialog
 * anybody opened as a promotion that happened. Not counting a real one would
 * make this spec assert nothing at all — so the matcher keys on the parameter
 * rather than on the route, and a promotion is the ABSENCE of `dry_run=true`.
 *
 * The legacy bulk routes are watched too. Nothing should reach them any more —
 * the promotion moved server-side — so one appearing here is a client-side
 * promote growing back, which is worth failing over wherever it happens.
 */
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { type RolloutFixture, buildRolloutFixture } from './fixtures/rollout-fixture';

test.describe.configure({ mode: 'serial' });

/**
 * The stage the fixture's workflow gates.
 *
 * `dev` is entered from the source, which already holds the change, so nothing
 * holds it. `staging` names an entry gate AND sits behind a `dev` that has not
 * taken the change, so it is held on both counts — the ordinary shape of a
 * stage somebody wants promoted before it is ready.
 */
const HELD_STAGE = 'staging';

/** The stage nothing holds, which must still promote. */
const OPEN_STAGE = 'dev';

function promoteButton(page: Page, stage: string) {
  return page.locator(`[data-promote-stage="${stage}"]`);
}

/** The page deep-linked straight at one stage, waited out to its control. */
async function openStage(page: Page, fx: RolloutFixture, stage: string): Promise<void> {
  await page.goto(`/rollouts/${fx.changeOrderSlug}/${stage}`);
  await expect(promoteButton(page, stage)).toBeVisible({ timeout: 30_000 });
}

/** Anything that WRITES on a promote's behalf, dry runs excluded. */
function isPromoteWrite(method: string, url: string): boolean {
  const parsed = new URL(url);
  if (parsed.searchParams.get('dry_run') === 'true') return false;
  if (parsed.pathname === '/api/promote') return method === 'POST';
  // The routes the client-side promotion used to write through. Nothing takes
  // them now, and anything that did would be promoting outside the API.
  if (parsed.pathname !== '/api/unit') return false;
  if (method === 'POST') return parsed.searchParams.has('upstream_revision');
  return method === 'PATCH' && parsed.searchParams.get('upgrade') === 'true';
}

/**
 * The dry run the stage panel makes to show what a promotion would write — whatever its
 * gates say, so it is no preview of a promotion the dialog would make. It alone asks for
 * each Unit's configuration.
 */
function isStagePanelPreview(url: string): boolean {
  return (new URL(url).searchParams.get('include') ?? '').split(',').includes('ConfigData');
}

/** A dry run of a promotion: the preview the dialog opens with. Writes nothing. */
function isPromotePreview(method: string, url: string): boolean {
  const parsed = new URL(url);
  return (
    method === 'POST' &&
    parsed.pathname === '/api/promote' &&
    parsed.searchParams.get('dry_run') === 'true' &&
    !isStagePanelPreview(url)
  );
}

interface PromoteTraffic {
  /** Requests that WRITE, in order. Must stay empty for a held stage. */
  writes: string[];
  /** Dry runs, in order. What the dialog asks before it states anything. */
  previews: string[];
}

/** Record the promote traffic the page issues, for as long as the page lives. */
async function watchPromoteTraffic(page: Page): Promise<PromoteTraffic> {
  const traffic: PromoteTraffic = { writes: [], previews: [] };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (isPromoteWrite(request.method(), request.url())) {
      traffic.writes.push(`${request.method()} ${request.url()}`);
    } else if (isPromotePreview(request.method(), request.url())) {
      traffic.previews.push(`${request.method()} ${request.url()}`);
    }
    await route.continue();
  });
  return traffic;
}

test.describe('a held stage', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: RolloutFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildRolloutFixture(fixturePage, { resources: 'full', releasable: false });
    /*
     * One resource dropped from a Space of the held stage, so a promotion of it
     * would have something real to write. Without that the stage is already
     * level with its upstream, the promotion would be a no-op, and "nothing was
     * written" would pass whether the refusal held or not. The missing resource
     * is what makes the absence observable.
     */
    await fx.dropResource(HELD_STAGE, 'config');
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  test('the dialog names the hold and offers no control that promotes', async ({ page }) => {
    const traffic = await watchPromoteTraffic(page);
    await openStage(page, fx, HELD_STAGE);

    // Marked, not disabled: a reader who clicks is owed the reason the stage
    // is held rather than a control that silently does nothing.
    await expect(promoteButton(page, HELD_STAGE)).toHaveAttribute('data-promote-gated', 'true');
    await expect(promoteButton(page, HELD_STAGE)).toBeEnabled();

    await promoteButton(page, HELD_STAGE).click();
    const held = page.locator('[data-held]');
    await expect(held).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/A gate holds this stage/)).toBeVisible();
    await expect(page.getByText(/once its gates open/)).toBeVisible();

    /*
     * ⚠️ THE COUNTS, WHICH ARE THE PART THAT WENT MISSING ONCE.
     *
     * A reader needs to know how much is holding the stage, not merely that
     * something is. Every other assertion here — the element, both sentences —
     * survives a dialog that has been reduced to one flat line, so without this
     * the loss reads as green. `blockedBy` being correct as a function proves
     * nothing about whether the dialog is given its output.
     */
    await expect(held).toContainText(/\(\d+ failed, \d+ not checked\)|\(\d+ failed\)|\(\d+ not checked\)/);

    // NO CONTROL THAT PROMOTES, AND NOT A DISABLED ONE EITHER. A greyed-out
    // confirm advertises a route past the gate; there is none to advertise.
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await expect(page.locator('[data-promote-rel]')).toHaveCount(0);
    const buttons = page.locator('.MuiDialogActions-root button');
    await expect(buttons).toHaveCount(1);
    await expect(buttons.first()).toHaveText('Cancel');

    await page.locator('[data-cancel]').click();
    expect(traffic.writes, 'a held stage must write nothing').toEqual([]);

    /*
     * AND IT ASKED FOR NOTHING EITHER. A held stage is not previewed: the hold
     * is the page's own gate reading, so there is nothing for a dry run to add
     * and no reason to put a request on the wire for a promotion that is not
     * going to happen.
     */
    expect(traffic.previews, 'a held stage previewed a promotion it will not make').toEqual([]);
  });

  /*
   * The dialog offering nothing is one layer; this asserts the consequence.
   * The LAST control in the dialog's actions is pressed — the place a confirm
   * sits in every other dialog in this app, and where one would reappear if
   * anything restored a way past the gate — and nothing is written either way.
   * Checking only that no confirm is rendered would pass against a page that
   * rendered one and refused on press; checking only the refusal would pass
   * against a page that wrote half a promotion first.
   */
  test('pressing the last control of a held stage dialog writes nothing', async ({ page }) => {
    const traffic = await watchPromoteTraffic(page);
    await openStage(page, fx, HELD_STAGE);
    await promoteButton(page, HELD_STAGE).click();
    await expect(page.locator('[data-held]')).toBeVisible({ timeout: 10_000 });

    const buttons = page.locator('.MuiDialogActions-root button');
    await buttons.last().click();
    await page.waitForTimeout(3_000);

    expect(traffic.writes, 'a held stage must write nothing').toEqual([]);
  });

  /*
   * THE OTHER HALF OF THE RULE, AND THE ONE THAT KEEPS IT FROM BEING A BAN.
   * Removing the escape hatch must not have made every promote refuse. A stage
   * nothing holds still promotes, and this is the only place in the suite that
   * clicks the real thing.
   */
  test('a stage nothing holds still promotes', async ({ page }) => {
    const traffic = await watchPromoteTraffic(page);
    await openStage(page, fx, OPEN_STAGE);

    await expect(promoteButton(page, OPEN_STAGE)).toHaveAttribute('data-promote-gated', 'false');
    await promoteButton(page, OPEN_STAGE).click();

    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.locator('#announce')).toContainText(`Promoted to ${OPEN_STAGE}.`, {
      timeout: 40_000,
    });
    expect(traffic.writes.length, 'an ungated promote writes').toBeGreaterThan(0);

    /*
     * PREVIEWED BEFORE IT WAS APPLIED, AND IN THAT ORDER. The dry run is what
     * the confirmation's sentence is drawn from, and its plan digest is what
     * the write is applied against — so a write with no preview behind it
     * means the reader confirmed a claim nothing checked.
     */
    expect(traffic.previews.length, 'the promote was applied without a preview').toBeGreaterThan(0);
  });
});
