// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The selected stage's card on the ChangeOrder page: its status box, the two
 * Promote buttons confirmed in place, the dry run it runs on its own, the reviews it
 * hosts, propagation problems, a failed promotion, and the sidebar.
 *
 * ONE REAL CHANGEORDER, WALKED FORWARD. The fixture is the three-stage
 * `no-health-check` workflow with release Targets and all four resources:
 *
 *     base ──▶ dev ──▶ staging, staging-canary ──▶ prod-us-east, prod-eu-west, prod-ap-south
 *
 * `dev` is promoted and released through the card for real, then `staging` is
 * promoted only and released, so `prod` is the stage everything after that is
 * tried on. Those tests stub what the server will not produce on demand:
 *
 *   - the card's own dry run (`POST /api/promote?dry_run=true` with `WhereSpace`):
 *     counts, a failure, 409, 403, 500, a delay;
 *   - the stage panel's forced dry run (`include=ConfigData`): the real answer,
 *     with one Space changed so it takes the change differently, keeps a value,
 *     is chained, or could not be planned;
 *   - the apply (`POST /api/promote`) and the release writes, so `prod` is never
 *     really written;
 *   - the ChangeOrder's recorded `PromotionFailures`, for a failure that outlives
 *     a reload;
 *   - and the reviews, from `fixtures/stage-card/reviewMocks.ts`.
 *
 * The templates for the stubbed answers are in `fixtures/stage-card/`.
 *
 * Screenshots of each state the stubs reach, at 1440×900 and 1000×800, go to
 * `test-results/change-order-stage-card/<state>-<width>.png`, named by the design's
 * state numbers: 1 ready, 1-working, 1-confirm, 1-dry-running, 1-dry-unavailable,
 * 2 your review is needed, 2-approve, 3 the author waits, 4 rejected, 5 promoted
 * not released, 6 promotion failed, 6-recheck, 6-dry-running, 6-dry-unavailable,
 * 7 released, 8 source, 9 a Space takes the change differently, 10 a Space keeps
 * its own value, 10-jump, 11 can't tell, 12 a gate failing. They are for a person
 * to compare with the design; nothing here compares pixels.
 */
import { mkdirSync } from 'fs';

import { type Locator, type Page, type Request } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { changeOrderPath } from '../src/pages/change-orders/changeOrderAddress';
import { noteRequired, segmentsText, stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';
import {
  CUSTOM_PREREQUISITE,
  type ChangeOrderFixture,
  type ChangeOrderSpace,
  buildChangeOrderFixture,
} from './fixtures/change-order-fixture';
import { HOUR, PEOPLE, mockReviews } from './fixtures/stage-card/reviewMocks';
import { stub } from './fixtures/stage-card/stubs';

test.describe.configure({ mode: 'serial' });

const SHOT_DIR = 'test-results/change-order-stage-card';
/** The rail's id for the stage the change was made in. */
const SOURCE_STAGE = '__change_order_source__';
const PRIMARY = 'rgb(186, 61, 3)';
const IMAGE_BEFORE = 'ghcr.io/confighubai/confighub:v0.2.19';
const IMAGE_AFTER = 'ghcr.io/confighubai/confighub:v0.2.20';

type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------
// The promote route, told apart by what each request is for
// ---------------------------------------------------------------------------

function bodyOf(request: Request): Json {
  try {
    return (request.postDataJSON() as Json) ?? {};
  } catch {
    return {};
  }
}

/**
 * What a `POST /api/promote` is for. All four go to one route:
 *
 * - `forced`: the stage panel's diff, forced past the gates; it alone asks for ConfigData;
 * - `quiet`: the card's dry run, over the stage's Spaces (`WhereSpace`), whose plan is applied;
 * - `gates`: the page's per-stage gate read (`TargetStage`, or nothing for Complete);
 * - `apply`: the promotion itself.
 */
type PromoteKind = 'forced' | 'quiet' | 'gates' | 'apply';

function promoteKind(request: Request): PromoteKind | undefined {
  const url = new URL(request.url());
  if (request.method() !== 'POST' || url.pathname !== '/api/promote') return undefined;
  if ((url.searchParams.get('include') ?? '').split(',').includes('ConfigData')) return 'forced';
  const body = bodyOf(request);
  const dryRun = body.DryRun === true || url.searchParams.get('dry_run') === 'true';
  if (!dryRun) return 'apply';
  return body.WhereSpace !== undefined && body.TargetStage === undefined ? 'quiet' : 'gates';
}

/** The Space ids a `WhereSpace` selector names. */
const idsOf = (where: unknown) => [...String(where ?? '').matchAll(/'([0-9a-f-]{36})'/g)].map((m) => m[1]);

/**
 * How the card's dry run answers:
 * `real` (the server), `ok` (every Space would change 3 Units), `fails` (2xx, with
 * a Unit error in `failSpaceIds`), `held` (409), `forbidden` (403), `unavailable`
 * (500).
 */
type QuietMode = 'real' | 'ok' | 'fails' | 'held' | 'forbidden' | 'unavailable';

interface Stubs {
  quiet: QuietMode;
  /** How long the card's dry run takes to answer. */
  quietDelayMs: number;
  /** For `fails`: the Spaces whose dry run fails. */
  quietFailSpaceIds: string[];
  /** Rewrites the forced dry run's real answer. */
  forced?: (result: Json) => Json;
  /** `real`, `ok`, or `partial` (207 with a Unit error in `applyFailSpaceIds`). */
  apply: 'real' | 'ok' | 'partial';
  applyFailSpaceIds: string[];
  /** How long the apply takes, so the busy state can be seen. */
  applyDelayMs: number;
  /** Release writes for these Spaces are refused (500). */
  releaseFailSpaceIds: string[];
  /** Recorded failures added to every read of this ChangeOrder. */
  promotionFailures?: Json[];
}

interface Traffic {
  /** Bodies of the card's dry runs, in order. */
  quiet: Json[];
  /** Bodies of the applies, in order. */
  applies: Json[];
  /** Space ids released, in order. */
  releases: string[];
  /** Stubs that could not be built: a test asserts there are none. */
  errors: string[];
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Route the promote, release and ChangeOrder reads through `stubs`, which the
 * test may change between page loads. Anything a stub does not take reaches the
 * server, or an earlier route such as the review mocks.
 */
async function installStubs(page: Page, fx: ChangeOrderFixture, overrides: Partial<Stubs> = {}): Promise<{ stubs: Stubs; traffic: Traffic }> {
  const stubs: Stubs = {
    quiet: 'real',
    quietDelayMs: 0,
    quietFailSpaceIds: [],
    apply: 'real',
    applyFailSpaceIds: [],
    applyDelayMs: 0,
    releaseFailSpaceIds: [],
    ...overrides,
  };
  const traffic: Traffic = { quiet: [], applies: [], releases: [], errors: [] };
  const spaceOf = (spaceId: string): ChangeOrderSpace | undefined => Object.values(fx.spaces).find((s) => s.spaceId === spaceId);

  await page.route(
    (url) => url.pathname === '/api/promote',
    async (route) => {
      const request = route.request();
      const kind = promoteKind(request);
      const body = bodyOf(request);
      if (kind === 'quiet') {
        traffic.quiet.push(body);
        if (stubs.quietDelayMs > 0) await sleep(stubs.quietDelayMs);
        const ids = idsOf(body.WhereSpace);
        const spaces = ids.map((id) => spaceOf(id)).filter((s): s is ChangeOrderSpace => s !== undefined);
        switch (stubs.quiet) {
          case 'real':
            return route.fallback();
          case 'ok':
          case 'fails':
            return route.fulfill(
              json({
                DryRun: true,
                ChangeOrderID: fx.changeOrderId,
                Plan: `stub-plan-${traffic.quiet.length}`,
                Spaces: spaces.map((s) =>
                  stubs.quiet === 'fails' && stubs.quietFailSpaceIds.includes(s.spaceId)
                    ? stub('dry-run-space-fails', { spaceId: s.spaceId, slug: s.slug, message: 'simulated dry-run refusal on app' })
                    : stub('dry-run-space', { spaceId: s.spaceId, slug: s.slug }),
                ),
              }),
            );
          case 'held': {
            const first = spaces[0] ?? fx.spaces.base;
            return route.fulfill(
              json(
                stub('dry-run-held', {
                  stage: first.stage ?? 'prod',
                  previousStage: first.previousStage ?? 'source',
                  spaceId: first.spaceId,
                  slug: first.slug,
                }),
                409,
              ),
            );
          }
          case 'forbidden':
            return route.fulfill(json(stub('refusal-403'), 403));
          case 'unavailable':
            return route.fulfill(json(stub('refusal-500'), 500));
        }
      }
      if (kind === 'forced' && stubs.forced !== undefined) {
        const response = await route.fetch();
        if (!response.ok() && response.status() !== 207) return route.fulfill({ response });
        try {
          return route.fulfill({ response, body: JSON.stringify(stubs.forced((await response.json()) as Json)) });
        } catch (error) {
          traffic.errors.push(error instanceof Error ? error.message : String(error));
          return route.fulfill({ response });
        }
      }
      if (kind === 'apply') {
        traffic.applies.push(body);
        if (stubs.applyDelayMs > 0) await sleep(stubs.applyDelayMs);
        if (stubs.apply === 'real') return route.fallback();
        const spaces = idsOf(body.WhereSpace)
          .map((id) => spaceOf(id))
          .filter((s): s is ChangeOrderSpace => s !== undefined);
        const failing = stubs.apply === 'partial' ? stubs.applyFailSpaceIds : [];
        return route.fulfill(
          json(
            {
              ChangeOrderID: fx.changeOrderId,
              Spaces: spaces.map((s) =>
                failing.includes(s.spaceId)
                  ? stub('apply-space-failed', { spaceId: s.spaceId, slug: s.slug, message: 'simulated merge refusal on app' })
                  : { SpaceID: s.spaceId, SpaceSlug: s.slug, Action: 'Promote', Units: [{ Action: 'Upgrade', Slug: 'app' }] },
              ),
            },
            failing.length > 0 ? 207 : 200,
          ),
        );
      }
      return route.fallback();
    },
  );

  // A stubbed promotion is followed by a stubbed release: a real one would publish
  // Spaces that were never written.
  await page.route(
    (url) => /^\/api\/space\/[^/]+\/release$/.test(url.pathname),
    async (route) => {
      const request = route.request();
      if (request.method() !== 'POST' || bodyOf(request).DryRun === true) return route.fallback();
      const spaceId = new URL(request.url()).pathname.split('/')[3];
      traffic.releases.push(spaceId);
      if (stubs.releaseFailSpaceIds.includes(spaceId)) return route.fulfill(json({ message: 'simulated publish refusal' }, 500));
      if (stubs.apply === 'real') return route.fallback();
      return route.fulfill(json({ Release: { ReleaseID: `stub-release-${traffic.releases.length}`, ReleaseNum: 1, SpaceID: spaceId, Published: true } }));
    },
  );

  await page.route(
    (url) => url.pathname.startsWith('/api/') && url.pathname.includes('change_order'),
    async (route) => {
      if (route.request().method() !== 'GET' || stubs.promotionFailures === undefined) return route.fallback();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const failures = stubs.promotionFailures;
      const walk = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(walk);
        if (typeof value !== 'object' || value === null) return value;
        const out: Json = {};
        for (const [key, child] of Object.entries(value)) out[key] = walk(child);
        if (out.ChangeOrderID === fx.changeOrderId && typeof out.Slug === 'string') {
          out.PromotionFailures = [...((out.PromotionFailures as Json[] | undefined) ?? []), ...failures];
        }
        return out;
      };
      return route.fulfill({ response, body: JSON.stringify(walk(await response.json())) });
    },
  );

  return { stubs, traffic };
}

// ---------------------------------------------------------------------------
// The forced dry run, changed for one Space
// ---------------------------------------------------------------------------

function mutateSpace(result: Json, spaceId: string, change: (space: Json) => Json): Json {
  const spaces = (result.Spaces as Json[] | undefined) ?? [];
  if (!spaces.some((s) => s.SpaceID === spaceId)) throw new Error(`the forced dry run has no Space ${spaceId}`);
  return { ...result, Spaces: spaces.map((s) => (s.SpaceID === spaceId ? change(s) : s)) };
}

/** The Space would take a different memory limit than its siblings: it takes the change differently. */
const takesDifferently = (space: Json): Json => {
  const text = JSON.stringify(space);
  if (!text.includes('768Mi')) throw new Error('the forced dry run does not carry the memory change');
  return JSON.parse(text.replaceAll('768Mi', '1Gi')) as Json;
};

/**
 * The Space keeps its own image: the image change is withheld by a value kept on
 * merge, as the server reports a protected path, and the rest still applies.
 */
const keepsItsImage = (space: Json): Json => ({
  ...space,
  Units: ((space.Units as Json[] | undefined) ?? []).map((unit) => {
    if (unit.Slug !== 'app') return unit;
    let path: string | undefined;
    const diff = (unit.Diff as { Resources?: Json[] } | undefined) ?? {};
    const resources = (diff.Resources ?? []).map((resource) => ({
      ...resource,
      Changes: ((resource.Changes as Json[] | undefined) ?? []).filter((change) => {
        const image = String(change.ToValue ?? '').includes(IMAGE_AFTER);
        if (image && path === undefined) path = String(change.Path ?? change.DisplayPath ?? '');
        return !image;
      }),
    }));
    if (path === undefined || path === '') throw new Error(`the app Unit's diff carries no image change: ${JSON.stringify(unit.Diff).slice(0, 300)}`);
    return {
      ...unit,
      ConfigData: String(unit.ConfigData ?? '').replaceAll(IMAGE_AFTER, IMAGE_BEFORE),
      Diff: { ...diff, Resources: resources },
      Conflicts: [
        ...((unit.Conflicts as Json[] | undefined) ?? []),
        stub('conflict-kept', { path, resource: 'confighub-app', kept: IMAGE_BEFORE, incoming: IMAGE_AFTER }),
      ],
    };
  }),
});

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

const card = (page: Page) => page.getByTestId('stage-card');
const statusBox = (page: Page) => page.getByTestId('stage-status');
const heading = (page: Page) => page.locator('#stage-status-heading');
const sidebar = (page: Page) => page.getByTestId('stage-sidebar');
const dryLine = (page: Page) => page.getByTestId('stage-dry-run');
const problem = (page: Page) => page.getByTestId('stage-problem');
const confirmButton = (page: Page) => page.locator('[data-confirm]');
const cancelButton = (page: Page) => page.locator('[data-cancel]');
const promoteMain = (page: Page, stage: string) => page.locator(`[data-testid="stage-merge"][data-promote-stage="${stage}"]`);
const releaseMain = (page: Page, stage: string) => page.locator(`[data-release-stage="${stage}"]`);
const otherButton = (page: Page) => statusBox(page).getByTestId('stage-merge-other');

/**
 * A stage's Spaces in the order the server lists them for its selector, which is
 * the order the page holds them in. The variant comparison measures every Space
 * against the first of them, so a test that wants one odd Space out picks one
 * that is not first.
 */
async function spacesInListOrder(fx: ChangeOrderFixture, stage: string): Promise<ChangeOrderSpace[]> {
  const response = await hubApi.get('/api/space', { params: { where: `Labels.Stage = '${stage}'` } });
  expect(response.ok(), `list the ${stage} Spaces: ${response.status()}`).toBe(true);
  const listed = ((await response.json()) as { Space?: { SpaceID?: string } }[]).map((row) => row.Space?.SpaceID);
  const mine = fx.spacesInStage(stage);
  return listed.map((id) => mine.find((s) => s.spaceId === id)).filter((s): s is ChangeOrderSpace => s !== undefined);
}

async function openStage(page: Page, fx: ChangeOrderFixture, stage: string): Promise<void> {
  await page.goto(`${fx.changeOrderPath}/${encodeURIComponent(stage)}`);
  await expect(card(page)).toBeVisible({ timeout: 45000 });
}

/**
 * Return to the window after a while away: the clock jumps past the age at which
 * the card's dry run answer is asked again, then the window gets focus. Needs
 * `page.clock.install()` before the page loads.
 */
async function returnToWindow(page: Page): Promise<void> {
  await page.clock.fastForward('01:05');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

/** One look at the card, as a timeline records it. */
interface CardFrame {
  state: string;
  heading: string;
  /** A Promote or Release main button is on screen and can be pressed. */
  live: boolean;
  change: string;
  /** From `recordFromLoad` only: each gate row's state, whether the gates are still being checked, the Spaces list. */
  gates?: string[];
  checking?: boolean;
  marks?: string;
}

/**
 * Record every change to the card, from now on (`recordTimeline`) or from the
 * page's first paint (`recordFromLoad`, before `goto`), so a test can assert on
 * a state that showed for a few milliseconds.
 */
const RECORD = () => {
  const w = window as unknown as { __frames: CardFrame[]; __recording?: boolean };
  w.__frames = [];
  if (w.__recording === true) return;
  w.__recording = true;
  const snap = () => {
    const box = document.querySelector('[data-testid="stage-status"]');
    const frame = {
      state: box?.getAttribute('data-stage-state') ?? '',
      heading: document.getElementById('stage-status-heading')?.textContent ?? '',
      live: Array.from(document.querySelectorAll('[data-testid="stage-merge"]')).some(
        (b) => b.getAttribute('aria-disabled') !== 'true' && !(b as HTMLButtonElement).disabled,
      ),
      change: document.querySelector('[data-testid="stage-change-card"]')?.textContent ?? '',
    };
    const last = w.__frames[w.__frames.length - 1];
    if (last === undefined || JSON.stringify(last) !== JSON.stringify(frame)) w.__frames.push(frame);
  };
  snap();
  new MutationObserver(snap).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
};

async function recordTimeline(page: Page): Promise<void> {
  await page.evaluate(RECORD);
}

async function recordFromLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: unknown[]; __recording?: boolean };
    w.__frames = [];
    document.addEventListener('DOMContentLoaded', () => {
      w.__recording = true;
      const snap = () => {
        const box = document.querySelector('[data-testid="stage-status"]');
        const frame = {
          state: box?.getAttribute('data-stage-state') ?? '',
          heading: document.getElementById('stage-status-heading')?.textContent ?? '',
          live: Array.from(document.querySelectorAll('[data-testid="stage-merge"], [data-testid="stage-merge-other"]')).some(
            (b) => b.getAttribute('aria-disabled') !== 'true' && !(b as HTMLButtonElement).disabled,
          ),
          change: document.querySelector('[data-testid="stage-change-card"]')?.textContent ?? '',
          gates: Array.from(document.querySelectorAll('[data-testid="stage-gates"] [data-gate-state]')).map((g) => g.getAttribute('data-gate-state') ?? ''),
          checking: document.querySelector('[data-testid="stage-gates-checking"]') !== null,
          marks: Array.from(document.querySelectorAll('[data-testid="stage-space"]')).map((s) => s.textContent ?? '').join('|'),
        };
        const last = w.__frames[w.__frames.length - 1];
        if (last === undefined || JSON.stringify(last) !== JSON.stringify(frame)) w.__frames.push(frame);
      };
      new MutationObserver(snap).observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-stage-state', 'data-gate-state', 'aria-disabled', 'disabled'],
      });
    });
  });
}

async function timeline(page: Page): Promise<CardFrame[]> {
  return page.evaluate(() => (window as unknown as { __frames: CardFrame[] }).__frames);
}

/**
 * The whole page at 1440×900 and 1000×800. The app scrolls inside its own
 * container, so a full-page screenshot stops at the viewport: the viewport is made
 * as tall as the ChangeOrder page instead, then put back to 1440×900.
 */
async function shoot(page: Page, state: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  for (const [width, base] of [
    [1440, 900],
    [1000, 800],
  ] as const) {
    await page.setViewportSize({ width, height: base });
    await page.waitForTimeout(200);
    const height = await page.evaluate(() => {
      const root = document.getElementById('change-orders-root');
      return root === null ? 0 : Math.ceil(root.getBoundingClientRect().top + root.scrollHeight + 24);
    });
    await page.setViewportSize({ width, height: Math.max(base, height) });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}/${state}-${width}.png`, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
}

const near = (a: number, b: number, tolerance = 2) => Math.abs(a - b) <= tolerance;

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('no bounding box: the element is not rendered');
  return box;
}

/*
 * A GATE THAT FAILS holds the stage by itself, with nothing to press: the box
 * names the gate and its reason, and the failing gate's row in the sidebar is open.
 * The custom prerequisite is the one check a real server fails on demand.
 */
test.describe('ChangeOrder stage card — a gate failing', () => {
  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    fixturePage = await (await newAuthorizedContext(browser)).newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildChangeOrderFixture(fixturePage, { resources: 'minimal', releasable: false, workflow: 'custom-prerequisite' });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.context().close();
    }
  });

  /*
   * NOT REACHED IS DECIDED BY THE STAGE BEFORE, whichever gate holds the stage.
   * Here `prod` gates only on a custom check, and `dev` has not taken the change:
   * nothing is compared yet, so no Space "has it" and nothing "writes no field".
   */
  test('a stage the change has not reached, held by a custom check: no "Has it", no "writes no field"', async ({ page }) => {
    await recordFromLoad(page);
    await page.goto(`${fx.changeOrderPath}/prod`);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', /^gate/, { timeout: 45000 });
    const changeCard = page.getByTestId('stage-change-card');
    await expect(changeCard).toContainText('Shown once dev has the change.', { timeout: 30000 });
    await expect(sidebar(page)).not.toContainText(stageCardCopy.mark.hasIt);
    await page.waitForTimeout(1000);
    const frames = await timeline(page);
    const all = JSON.stringify(frames);
    expect(frames.filter((f) => f.change.includes(stageCardCopy.change.nothing)), all).toEqual([]);
    expect(frames.filter((f) => (f.marks ?? '').includes(stageCardCopy.mark.hasIt)), all).toEqual([]);
  });

  test('the box names the failing gate and offers no button; its row stays closed until opened', async ({ page }) => {
    // `prod`'s mandatory `check/promoted` holds it until `dev` has the change; the
    // custom check is the hold this test is about.
    await fx.promoteStage('dev');
    await page.goto(`${fx.changeOrderPath}/prod`);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'gateFailed', { timeout: 45000 });
    await expect(heading(page)).toContainText(CUSTOM_PREREQUISITE.Name);
    await expect(heading(page)).toContainText('failed');
    await expect(statusBox(page)).toContainText('You can promote once it passes.');
    // Where it failed is part of the sentence, not a fragment after its full stop.
    await expect(statusBox(page)).toContainText(fx.spaces.dev.slug);
    expect(await statusBox(page).innerText()).not.toMatch(/\.\s+in\s/);
    await expect(page.locator('[data-testid="stage-merge"], [data-promote-stage]')).toHaveCount(0);
    const id = `change-order-gate-prod-custom-prerequisite:${CUSTOM_PREREQUISITE.Name}`;
    const row = page.getByTestId(id);
    await expect(row).toBeVisible();
    // The box already gives the gate's reason, so the row does not say it a second time.
    const toggle = page.locator(`[data-testid="${id}"][aria-expanded], [data-testid="${id}"] [aria-expanded]`).first();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await shoot(page, '12');
    // Opened, it carries the author's own description.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(row).toContainText(CUSTOM_PREREQUISITE.Description);
  });
});

test.describe('ChangeOrder stage card', () => {
  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;
  let me = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    fixturePage = await (await newAuthorizedContext(browser)).newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(async () => (await hubApi.get('/api/space', { params: { limit: 1 } })).status(), { timeout: 60000, intervals: [1000] })
      .toBe(200);
    fx = await buildChangeOrderFixture(fixturePage, { workflow: 'no-health-check', releasable: true, resources: 'full' });
    await fx.assertPropagationSupported();
    me = (((await (await hubApi.get('/api/me')).json()) as { UserID?: string }).UserID ?? '');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.context().close();
    }
  });

  /*
   * A STAGE WAITING ON THE ONE BEFORE IT IS NOT A FAILURE. Nothing has gone wrong
   * when `staging` waits for `dev` to take the change: the box says what it waits
   * for, calmly, and leads there.
   */
  test('a stage waiting on the stage before it is neutral, not red, and leads there', async ({ page }) => {
    await openStage(page, fx, 'staging');
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'gateWaiting', { timeout: 45000 });
    await expect(heading(page)).toHaveText(segmentsText(stageCardCopy.headline.gateWaiting('promoted', 'dev', '')));
    // Neutral: the card's own surface, ink headline, no red anywhere.
    await expect(box).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    expect(await heading(page).evaluate((el) => getComputedStyle(el).color)).toBe('rgb(17, 18, 20)');
    await expect(box.getByRole('link', { name: new RegExp(stageCardCopy.body.goToPrevious('dev')) })).toHaveAttribute(
      'href',
      changeOrderPath(fx.spaces.base.slug, fx.changeOrderSlug, 'dev'),
    );
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
  });

  /*
   * A HELD STAGE NEVER LOOKS READY WHILE IT LOADS. Opened directly, the card reads
   * the stage, then says what it waits for. Until the first gate answer is in it
   * offers no Promote, says nothing of "Ready", and draws no gate red: the sidebar
   * says it is still checking.
   */
  test('a held stage opened directly: "Reading the stage…", then "Waiting…", never "Ready", no Promote, no red gate first', async ({
    page,
  }) => {
    await recordFromLoad(page);
    await openStage(page, fx, 'staging');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'gateWaiting', { timeout: 45000 });
    await page.waitForTimeout(1500);
    const frames = await timeline(page);
    const all = JSON.stringify(frames);
    const headings = frames.map((f) => f.heading).filter((h) => h !== '');
    const waiting = headings.findIndex((h) => h.startsWith('Waiting'));
    expect(waiting, `the heading reached "Waiting": ${all}`).toBeGreaterThanOrEqual(0);
    expect(headings.slice(0, waiting).filter((h) => h !== stageCardCopy.headline.loading), `only "Reading the stage…" before "Waiting": ${all}`).toEqual([]);
    expect(headings.filter((h) => /Ready/.test(h)), `"Ready" while held: ${all}`).toEqual([]);
    expect(frames.filter((f) => f.live), `a Promote control while held: ${all}`).toEqual([]);
    // Before the gates are answered: no red row, and the sidebar says it is checking.
    const answered = frames.findIndex((f) => f.heading.startsWith('Waiting'));
    const before = frames.slice(0, answered);
    expect(before.filter((f) => (f.gates ?? []).includes('no')), `a red gate row before the first answer: ${all}`).toEqual([]);
    expect(frames.some((f) => f.checking === true), `the sidebar said it was checking the gates: ${all}`).toBe(true);
    // And once answered, waiting is not a failure either.
    expect(frames.filter((f) => (f.gates ?? []).includes('no')), all).toEqual([]);
  });

  /*
   * A STAGE THE CHANGE HAS NOT REACHED has nothing to compare yet: no Space "has
   * it", and the change card says when it will show what the stage takes. The page
   * never flashes "No Spaces" or "writes no field" while it reads.
   */
  test('a stage the change has not reached: no "Has it", the not-reached line, and no flash on load', async ({ page }) => {
    await recordFromLoad(page);
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'gateWaiting', { timeout: 45000 });
    const changeCard = page.getByTestId('stage-change-card');
    await expect(changeCard).toContainText('Shown once staging has the change.', { timeout: 30000 });
    await expect(sidebar(page)).not.toContainText(stageCardCopy.mark.hasIt);
    await page.waitForTimeout(1000);
    const frames = await timeline(page);
    expect(frames.length, 'the timeline recorded the load').toBeGreaterThan(0);
    expect(frames.filter((f) => f.heading === stageCardCopy.headline.noSpaces), JSON.stringify(frames)).toEqual([]);
    expect(frames.filter((f) => f.change.includes(stageCardCopy.change.nothing)), JSON.stringify(frames)).toEqual([]);
    expect(frames.filter((f) => (f.marks ?? '').includes(stageCardCopy.mark.hasIt)), JSON.stringify(frames)).toEqual([]);
    expect(frames.filter((f) => /Ready/.test(f.heading) || f.live), JSON.stringify(frames)).toEqual([]);
  });

  /*
   * THE ORDINARY PATH, FOR REAL. Every Space of `dev` has a Target, so the main
   * button is "Promote and release" and "Promote only" sits beside it as a plain
   * outlined button. Nothing is wrong and the box already says what the promotion
   * writes, so one click does it: no confirm.
   */
  test('promote and release: the dry run, the two buttons, one click, busy, and Released', async ({ page }) => {
    test.setTimeout(180_000);
    const { traffic } = await installStubs(page, fx, { applyDelayMs: 1500 });
    await openStage(page, fx, 'dev');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 30000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.ready);
    // The stage name is the card's heading, at the page's h2 level.
    await expect(card(page).getByRole('heading', { level: 2, name: 'dev' })).toBeVisible();
    await expect(dryLine(page)).toHaveAttribute('data-dry-run', 'done', { timeout: 30000 });
    await expect(dryLine(page)).toHaveText(/^\d+ Units? in 1 Space would change\./);
    expect(traffic.quiet.length, 'the card asks its dry run on load').toBeGreaterThanOrEqual(1);

    const main = promoteMain(page, 'dev');
    await expect(main).toHaveText(stageCardCopy.merge.label('pr', 'dev', false), { useInnerText: true });
    await expect(main).toHaveAttribute('data-method', 'pr');
    // Promote is the page's one action colour.
    await expect(main).toHaveCSS('background-color', PRIMARY);
    await shoot(page, '1');

    // "Promote only" beside it, on the same row, in the neutral outlined look.
    const other = otherButton(page);
    await expect(other).toHaveCount(1);
    await expect(other).toHaveText(stageCardCopy.merge.otherLabel('p', false), { useInnerText: true });
    await expect(other).toHaveAttribute('data-method', 'p');
    await expect(other).not.toHaveCSS('background-color', PRIMARY);
    await expect(other).not.toHaveCSS('color', PRIMARY);
    {
      const [m, o] = [await boxOf(main), await boxOf(other)];
      expect(o.x > m.x && near(o.y, m.y), `Promote only at ${o.x},${o.y}; main at ${m.x},${m.y}`).toBe(true);
    }
    await expect(statusBox(page).locator('[data-release-stage]')).toHaveCount(0);

    await expect(main).toHaveAttribute('data-one-click', 'true');
    await expect(other).toHaveAttribute('data-one-click', 'true');
    await main.click();
    // The apply is held back 1.5s, so the busy state is on screen: the button says
    // it is working, and neither button can be pressed meanwhile.
    await expect(main).toHaveText(stageCardCopy.merge.working, { useInnerText: true });
    await expect(main).toHaveAttribute('aria-disabled', 'true');
    await expect(other).toHaveAttribute('aria-disabled', 'true');
    await expect(confirmButton(page)).toHaveCount(0);
    await shoot(page, '1-working');

    await expect(page.locator('#announce')).toContainText(stageCardCopy.announce.released('dev'), { timeout: 90000 });
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'released', { timeout: 30000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.released('dev'));
    await expect(heading(page)).toBeFocused();
    await expect(statusBox(page)).toContainText('By you, just now', { timeout: 30000 });
    const next = statusBox(page).getByRole('link', { name: new RegExp(stageCardCopy.goTo('staging')) });
    await expect(next).toHaveAttribute('href', changeOrderPath(fx.spaces.base.slug, fx.changeOrderSlug, 'staging'));
    // Done: the box says so and offers nothing more.
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    expect(traffic.applies.length).toBe(1);
    await shoot(page, '7');
  });

  test('promote only, then release: the button beside the main one, and Release is all that is left', async ({ page }) => {
    test.setTimeout(180_000);
    await installStubs(page, fx);
    await openStage(page, fx, 'staging');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 30000 });
    await expect(promoteMain(page, 'staging')).toHaveAttribute('data-method', 'pr');
    await expect(otherButton(page)).toHaveAttribute('data-one-click', 'true');
    await otherButton(page).click();
    // Recorded from the click on: before it, the button is live by design.
    await recordTimeline(page);
    await expect(confirmButton(page)).toHaveCount(0);

    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'promoted', { timeout: 60000 });
    {
      // Until it is promoted, nothing can be pressed and no "Promoted in 1 of 2" shows.
      const frames = await timeline(page);
      const before = frames.slice(0, frames.findIndex((f) => f.state === 'promoted'));
      expect(before.filter((f) => f.live), JSON.stringify(frames)).toEqual([]);
      expect(frames.filter((f) => /Promoted in \d/.test(f.heading)), JSON.stringify(frames)).toEqual([]);
    }
    await expect(heading(page)).toHaveText(stageCardCopy.headline.promoted);
    const release = releaseMain(page, 'staging');
    await expect(release).toBeFocused();
    await expect(release).toHaveText(stageCardCopy.merge.label('r', 'staging', false), { useInnerText: true });
    // One method left, so one button.
    await expect(otherButton(page)).toHaveCount(0);
    await expect(statusBox(page)).toContainText(stageCardCopy.dryRun.release(2));
    await expect(sidebar(page)).toContainText(stageCardCopy.sidebar.targetsEarlier(2));
    await expect(statusBox(page)).toContainText('By you, just now');
    await shoot(page, '5');

    // Release is one click too: the box already says where it publishes.
    await expect(release).toHaveAttribute('data-one-click', 'true');
    await release.click();
    await recordTimeline(page);
    await expect(confirmButton(page)).toHaveCount(0);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'released', { timeout: 90000 });
    // The Release button does not come back while the release runs.
    const frames = await timeline(page);
    expect(frames.filter((f) => f.live), JSON.stringify(frames)).toEqual([]);
    await expect(sidebar(page)).toContainText(stageCardCopy.sidebar.targetsRun(2));
  });

  test('the dry run: checking, unavailable (and re-run at confirm), no permission, and held', async ({ page }) => {
    test.setTimeout(180_000);
    const { stubs, traffic } = await installStubs(page, fx, { quiet: 'ok', quietDelayMs: 8000, apply: 'ok' });

    await openStage(page, fx, 'prod');
    await expect(dryLine(page)).toHaveAttribute('data-dry-run', 'running', { timeout: 30000 });
    await expect(dryLine(page)).toHaveText(stageCardCopy.dryRun.running);
    // While it runs, Promote is still offered; a confirm waits for the answer.
    await expect(promoteMain(page, 'prod')).toBeEnabled();
    await shoot(page, '1-dry-running');
    await expect(dryLine(page)).toHaveAttribute('data-dry-run', 'done', { timeout: 30000 });
    await expect(dryLine(page)).toHaveText(stageCardCopy.dryRun.counts(9, 3));

    // No answer: the reader is told it runs at confirm, and the confirm runs it.
    stubs.quiet = 'unavailable';
    stubs.quietDelayMs = 0;
    await openStage(page, fx, 'prod');
    await expect(dryLine(page)).toHaveAttribute('data-dry-run', 'unavailable', { timeout: 30000 });
    await expect(dryLine(page)).toContainText(stageCardCopy.dryRun.unavailable);
    await shoot(page, '1-dry-unavailable');
    // The line asks again in place; the button does not move.
    // (Measured from the box's top, so a scroll of the page does not count as a move.)
    const offset = async () => (await boxOf(promoteMain(page, 'prod'))).y - (await boxOf(statusBox(page))).y;
    const mainBefore = await offset();
    const askedBefore = traffic.quiet.length;
    await dryLine(page).getByText(stageCardCopy.merge.checkAgain).click();
    await expect.poll(() => traffic.quiet.length, { timeout: 15000 }).toBeGreaterThan(askedBefore);
    await expect(dryLine(page)).toHaveAttribute('data-dry-run', 'unavailable', { timeout: 15000 });
    const mainAfter = await offset();
    expect(near(mainAfter, mainBefore), `the button moved from ${mainBefore} to ${mainAfter} below the box's top`).toBe(true);
    const asked = traffic.quiet.length;
    // With no answer to show, the click opens a confirm, in place: where the button was.
    await expect(promoteMain(page, 'prod')).toHaveAttribute('data-one-click', 'false');
    await promoteMain(page, 'prod').scrollIntoViewIfNeeded();
    const before = await boxOf(promoteMain(page, 'prod'));
    await promoteMain(page, 'prod').click();
    await expect(confirmButton(page)).toBeFocused();
    await expect(confirmButton(page)).toHaveText(stageCardCopy.merge.confirm('pr', false));
    await expect(cancelButton(page)).toHaveText(stageCardCopy.merge.cancel);
    const after = await boxOf(confirmButton(page));
    expect(near(after.x, before.x) && near(after.y, before.y), `confirm at ${after.x},${after.y}; button was at ${before.x},${before.y}`).toBe(true);
    await shoot(page, '1-confirm');
    await confirmButton(page).click();
    await expect.poll(() => traffic.quiet.length, { timeout: 15000 }).toBeGreaterThan(asked);
    // Still no answer: the confirm becomes "anyway", behind an acknowledgement, and nothing was written.
    await expect(confirmButton(page)).toHaveText(stageCardCopy.merge.confirm('pr', true), { timeout: 15000 });
    await expect(statusBox(page).getByRole('checkbox', { name: stageCardCopy.merge.ack.noDryRun })).toBeVisible();
    expect(traffic.applies).toEqual([]);
    await cancelButton(page).click();
    await expect(confirmButton(page)).toHaveCount(0);

    // 403: the box says so in place of a button, and the page is not replaced.
    stubs.quiet = 'forbidden';
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'noPermission', { timeout: 30000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.noPermission('prod'));
    await expect(statusBox(page)).toContainText(stageCardCopy.body.noPermission);
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    await expect(page).not.toHaveURL(/access-denied/);

    // 409: the server's hold, in its own words.
    stubs.quiet = 'held';
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'serverHeld', { timeout: 30000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.serverHeld('prod'));
    await expect(statusBox(page).locator('[data-held]')).toContainText('simulated hold');
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    expect(traffic.applies).toEqual([]);
  });

  test('review approve: the form in the box, one Pass, then Ready to promote', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial', { countNewRecords: true });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewNeeded', { timeout: 45000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.reviewNeeded);
    await expect(statusBox(page)).toContainText('security-review');
    await expect(statusBox(page)).toContainText('before prod can be promoted.');
    await expect(page.locator('[data-promote-stage]')).toHaveCount(0);
    await shoot(page, '2');

    await statusBox(page).getByTestId('review-approve').click();
    const form = statusBox(page).getByTestId('review-form');
    await expect(form).toBeVisible();
    await expect(form.getByLabel(stageCardCopy.review.reasonLabel(noteRequired('Pass')))).toBeVisible();
    await shoot(page, '2-approve');
    await form.getByTestId('review-reason').fill('Checked the image tag and the memory limit.');
    await form.getByTestId('review-submit').click();
    await expect.poll(() => mocks.attests.length, { timeout: 15000 }).toBe(1);
    expect(mocks.attests[0].body).toMatchObject({ Result: 'Pass', ChangeOrderID: fx.changeOrderId });
    await expect(page.getByTestId('review-toast')).toBeVisible();
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.readyAfterApproval);
    await expect(promoteMain(page, 'prod')).toBeVisible();
  });

  test('review reject, then withdraw: a revocation, and the review is asked for again', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial', { countNewRecords: true });
    await openStage(page, fx, 'prod');
    await statusBox(page).getByTestId('review-reject').click({ timeout: 45000 });
    const form = statusBox(page).getByTestId('review-form');
    await form.getByTestId('review-submit').click();
    await expect(form).toContainText(stageCardCopy.review.reasonMissing);
    await form.getByTestId('review-reason').fill('Pin the memory limit before prod.');
    await expect(form.getByTestId('review-submit')).toHaveText(stageCardCopy.review.submitRejection);
    await form.getByTestId('review-submit').click();
    await expect.poll(() => mocks.attests.length, { timeout: 15000 }).toBe(1);
    expect(mocks.attests[0].body).toMatchObject({ Result: 'Fail' });

    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewRejected', { timeout: 45000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.rejectedByYou);
    await expect(statusBox(page)).toContainText(stageCardCopy.review.clearsWhenYou);
    await expect(statusBox(page)).toContainText('Pin the memory limit before prod.');
    await statusBox(page).getByRole('button', { name: stageCardCopy.review.withdraw }).click();
    await statusBox(page).getByRole('button', { name: stageCardCopy.review.confirmWithdraw }).click();
    // One revocation per Space the rejection was recorded in.
    await expect.poll(() => mocks.revokes.length, { timeout: 15000 }).toBe(fx.spacesInStage('staging').length);
    for (const revoke of mocks.revokes) expect(revoke.body.RevokedAttestationID).toBeTruthy();
    expect(mocks.attests).toHaveLength(1);
    await expect(page.locator('#announce')).toContainText(stageCardCopy.announce.rejectionWithdrawn);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewNeeded', { timeout: 45000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.reviewNeeded);
  });

  test('author: waiting on review, request a review, and ask the rejecter again', async ({ page }) => {
    let mocks = await mockReviews(page, fx, 'author');
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewWaiting', { timeout: 45000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.reviewWaiting);
    await expect(statusBox(page)).toContainText('since you wrote this change');
    await expect(statusBox(page).getByTestId('review-approve')).toHaveCount(0);
    await shoot(page, '3');

    await statusBox(page).getByRole('button', { name: stageCardCopy.review.requestReview }).click();
    const picker = statusBox(page).getByTestId('review-request-picker');
    await expect(picker).toContainText(stageCardCopy.review.requestHint);
    await picker.getByRole('checkbox', { name: PEOPLE.priya.name }).check();
    await picker.getByRole('button', { name: stageCardCopy.review.requestSubmit, exact: true }).click();
    await expect.poll(() => mocks.patches.length, { timeout: 15000 }).toBe(1);
    const asked = (mocks.patches[0].ReviewRequests as { UserID?: string }[] | undefined) ?? [];
    expect(asked.map((r) => r.UserID)).toContain(PEOPLE.priya.id);
    await expect(statusBox(page)).toContainText(stageCardCopy.review.requestedFrom(PEOPLE.priya.name));

    // Tom rejected; Tom and Lena were asked hours ago. Asking Tom again moves his request only.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    mocks = await mockReviews(page, fx, 'rejected', {
      asAuthor: true,
      requests: [
        { who: 'tom', by: 'priya', agoMs: 5 * HOUR },
        { who: 'lena', by: 'priya', agoMs: 4 * HOUR },
      ],
    });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewRejected', { timeout: 45000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.rejectedBy(PEOPLE.tom.name));
    await expect(statusBox(page)).toContainText('session-store needs synchronous deletes');
    await expect(statusBox(page)).toContainText(stageCardCopy.review.clearsWhen(PEOPLE.tom.name).replace(/\.$/, ''));
    await shoot(page, '4');
    const startedAt = Date.now();
    await statusBox(page).getByRole('button', { name: stageCardCopy.review.askAgain(PEOPLE.tom.name) }).click();
    await expect.poll(() => mocks.patches.length, { timeout: 15000 }).toBe(1);
    const sent = (mocks.patches[0].ReviewRequests as { UserID?: string; RequestedAt?: string }[] | undefined) ?? [];
    const tom = sent.find((r) => r.UserID === PEOPLE.tom.id);
    const lena = sent.find((r) => r.UserID === PEOPLE.lena.id);
    expect(Date.parse(tom?.RequestedAt ?? ''), 'Tom is asked again: a later RequestedAt').toBeGreaterThanOrEqual(startedAt - 60_000);
    expect(lena, 'the other requests are kept').toBeDefined();
    expect(Date.parse(lena?.RequestedAt ?? '') < startedAt - 3 * HOUR, 'and left as they were').toBe(true);
    await expect(statusBox(page)).toContainText(stageCardCopy.review.askedAgain(PEOPLE.tom.name));
  });

  /*
   * A SPACE THAT TAKES THE CHANGE DIFFERENTLY IS SAID BEFORE PROMOTE, and Promote
   * is still offered: it may be exactly what the reader wants. So the button says
   * "anyway", and the confirm waits for the reader to tick what they checked.
   */
  test('a Space that takes the change differently: amber, the bar with Same and Differs boxes, and an acknowledged "anyway"', async ({ page }) => {
    // Not the first of the stage's Spaces: see the test at the end for that case.
    const odd = (await spacesInListOrder(fx, 'prod')).at(-1) as ChangeOrderSpace;
    const { traffic } = await installStubs(page, fx, {
      apply: 'ok',
      forced: (result) => mutateSpace(result, odd.spaceId, takesDifferently),
    });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'problem', { timeout: 45000 });
    await expect(problem(page)).toHaveAttribute('data-problem-kind', 'differs');
    await expect(heading(page)).toHaveText(stageCardCopy.headline.differs(1));
    await expect(problem(page)).toContainText(odd.slug);
    const main = promoteMain(page, 'prod');
    await expect(main).toHaveText(stageCardCopy.merge.label('pr', 'prod', true), { useInnerText: true });
    // Two outcomes: a bar says how the Spaces divide, then a box for each.
    const changeCard = page.getByTestId('stage-change-card');
    await expect(changeCard.getByTestId('stage-change-scope')).toContainText('3 Spaces');
    await expect(changeCard.getByTestId('stage-change-scope')).not.toContainText('Same in all');
    const bar = changeCard.getByTestId('stage-outcome-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('aria-label', 'Outcome across 3 Spaces');
    const boxes = changeCard.getByTestId('stage-outcome-box');
    await expect(boxes).toHaveCount(2);
    const same = changeCard.locator('[data-testid="stage-outcome-box"][data-kind="same"]');
    const differs = changeCard.locator('[data-testid="stage-outcome-box"][data-kind="differs"]');
    await expect(same).toContainText('2 Spaces');
    await expect(differs).toContainText('1 Space');
    // One or two Spaces are named on a closed box.
    await expect(differs).toContainText(odd.slug);
    await expect(sidebar(page)).toContainText(stageCardCopy.mark.differs);
    expect(traffic.errors).toEqual([]);
    await shoot(page, '9');

    await main.click();
    const confirm = confirmButton(page);
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await expect(statusBox(page)).toContainText(stageCardCopy.merge.tickFirst);
    const ack = statusBox(page).getByRole('checkbox');
    await expect(ack).toBeFocused();
    await confirm.click({ force: true });
    await page.waitForTimeout(500);
    expect(traffic.applies, 'an unticked "anyway" writes nothing').toEqual([]);
    await ack.check();
    await expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
    await confirm.click();
    await expect.poll(() => traffic.applies.length, { timeout: 30000 }).toBe(1);
    // After the outcome, the difference is still stated.
    await expect(problem(page)).toContainText(odd.slug, { timeout: 30000 });
  });

  /*
   * WHAT THE PROMOTION WRITES, ONE BOX PER OUTCOME. Every prod Space takes the same
   * change, so there is one box and no bar. Open, it draws the app's diff tree with
   * a Unit header per Unit and only the fields the change writes. The boxes
   * share one open state, which closes when another stage is selected.
   */
  test('the outcome boxes: one Same box, the diff tree inside, only changed fields, and closed on another stage', async ({ page }) => {
    await installStubs(page, fx, { quiet: 'ok' });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    const changeCard = page.getByTestId('stage-change-card');
    await expect(changeCard.getByTestId('stage-change-scope')).toContainText('Same in all 3 Spaces', { timeout: 30000 });
    await expect(changeCard.getByTestId('stage-outcome-bar')).toHaveCount(0);
    const box = changeCard.locator('[data-testid="stage-outcome-box"][data-kind="same"]');
    await expect(changeCard.getByTestId('stage-outcome-box')).toHaveCount(1);
    await expect(box).toContainText('3 Spaces');
    const toggle = box.getByTestId('stage-outcome-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(box.locator('[data-comment-path]')).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(box.locator('[data-testid^="change-order-unit-"]').first()).toBeVisible();
    await expect(box.locator('[data-comment-path]').first()).toBeVisible();
    await expect(box).toContainText('memory');
    // `replicas` is a field the change leaves alone: the boxes draw only what changes.
    await expect(box).not.toContainText('replicas');
    await shoot(page, '1-boxes-open');

    // Another stage selected (the rail, no reload): the boxes are closed when it comes back.
    await page.locator(`a[href="${fx.changeOrderPath}/staging"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/staging$`));
    await expect(card(page)).toHaveAttribute('data-stage', 'staging', { timeout: 30000 });
    await page.locator(`a[href="${fx.changeOrderPath}/prod"]`).first().click();
    await expect(card(page)).toHaveAttribute('data-stage', 'prod', { timeout: 30000 });
    await expect(page.getByTestId('stage-outcome-toggle').first()).toHaveAttribute('aria-expanded', 'false', { timeout: 30000 });
  });

  test('a Space that keeps its own value, and a field link that opens the diff at the row', async ({ page }) => {
    const odd = (await spacesInListOrder(fx, 'prod')).at(-1) as ChangeOrderSpace;
    const { traffic } = await installStubs(page, fx, {
      apply: 'ok',
      forced: (result) => mutateSpace(result, odd.spaceId, keepsItsImage),
    });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'problem', { timeout: 45000 });
    await expect(problem(page)).toHaveAttribute('data-problem-kind', 'kept');
    await expect(heading(page)).toHaveText(stageCardCopy.headline.kept(1));
    await expect(problem(page)).toContainText(odd.slug);
    // The short form: the field's label and the kept image tag, not the whole reference.
    await expect(problem(page)).toContainText('a protected field in');
    await expect(problem(page)).toContainText('v0.2.19');
    await expect(sidebar(page)).toContainText(/Keeps /);
    expect(traffic.errors).toEqual([]);
    await shoot(page, '10');

    // Opening a box opens it in place: the page does not scroll, so the card the
    // reader pressed in stays where it was. (The boxes sit above the status box,
    // so that moves down.)
    const toggles = page.getByTestId('stage-outcome-toggle');
    const diff = page.locator('#stage-diff');
    const changeCard = page.getByTestId('stage-change-card');
    await toggles.first().scrollIntoViewIfNeeded();
    const cardAt = (await boxOf(changeCard)).y;
    await toggles.first().click();
    await expect(toggles.first()).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(400);
    await expect(toggles.first()).toBeInViewport();
    const cardNow = (await boxOf(changeCard)).y;
    expect(near(cardNow, cardAt, 2), `the page scrolled when the box opened: ${cardAt} → ${cardNow}`).toBe(true);
    await toggles.first().click();
    await expect(toggles.first()).toHaveAttribute('aria-expanded', 'false');

    // A field link's job is to show its row: it opens the boxes and brings the
    // highlighted row into view, scrolling only as far as that takes.
    await problem(page).locator('a[data-field-link]').last().click();
    const row = diff.locator('[data-highlighted="true"]').last();
    await expect(row).toHaveAttribute('data-highlighted', 'true');
    await expect(row).toBeInViewport();
    for (const toggle of await toggles.all()) await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await shoot(page, '10-jump');
  });

  /*
   * ⚠️ THE COMMONEST TOPOLOGY MUST NOT ALARM. A dry run cannot plan a Space that
   * takes from another Space of the same promotion, so a chained Space comes back
   * Blocked on every promotion of a chain. That is said calmly, in the diff's
   * notes; a Space the dry run failed to plan is the one that is loud.
   */
  test('a chained Space is a quiet note; a Space the dry run could not plan is loud', async ({ page }) => {
    const chained = (await spacesInListOrder(fx, 'prod')).at(-1) as ChangeOrderSpace;
    const { stubs, traffic } = await installStubs(page, fx, {
      apply: 'ok',
      forced: (result) => mutateSpace(result, chained.spaceId, () => stub('forced-space-chained', { spaceId: chained.spaceId, slug: chained.slug })),
    });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    await expect(problem(page)).toHaveCount(0);
    // Said calmly, in the change card's notes, which show with the boxes closed.
    const changeCard = page.getByTestId('stage-change-card');
    await expect(changeCard).toContainText('earlier in this promotion');
    await expect(changeCard.getByTestId('stage-change-notes')).not.toContainText(/fail|error/i);

    stubs.forced = (result) =>
      mutateSpace(result, chained.spaceId, () => stub('forced-space-unplanned', { spaceId: chained.spaceId, slug: chained.slug }));
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'problem', { timeout: 45000 });
    await expect(problem(page)).toHaveAttribute('data-problem-kind', 'unknown');
    await expect(heading(page)).toHaveText(stageCardCopy.headline.unknown(1, 3));
    await expect(problem(page)).toContainText('The dry run could not plan');
    await expect(sidebar(page)).toContainText(stageCardCopy.mark.unknown);
    await shoot(page, '11');
    await promoteMain(page, 'prod').click();
    await expect(statusBox(page).getByRole('checkbox', { name: stageCardCopy.merge.ack.unknown(1) })).toBeVisible();
    await cancelButton(page).click();
    expect(traffic.errors).toEqual([]);
    expect(traffic.applies).toEqual([]);
  });

  test('a failed promotion: the box, a re-check on focus, the retry, and the record after a reload', async ({ page }) => {
    test.setTimeout(180_000);
    await page.clock.install();
    const failing = fx.spaces['prod-us-east'];
    const { stubs } = await installStubs(page, fx, {
      quiet: 'ok',
      apply: 'partial',
      applyFailSpaceIds: [failing.spaceId],
      quietFailSpaceIds: [failing.spaceId],
    });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    await expect(promoteMain(page, 'prod')).toHaveAttribute('data-one-click', 'true');
    await promoteMain(page, 'prod').click();

    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'failed', { timeout: 30000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.promoteFailed(1, 3));
    await expect(heading(page)).toBeFocused();
    const error = page.getByTestId('change-order-foot-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('simulated merge refusal on app');
    await expect(error).toContainText(failing.slug);
    await expect(sidebar(page)).toContainText(stageCardCopy.mark.failed);
    await box.getByText(stageCardCopy.body.serverMessage, { exact: true }).click();
    await expect(box.locator('details[open]')).toContainText('simulated merge refusal on app');

    // The dry run fails for that Space now: Check again, and no retry yet.
    stubs.quiet = 'fails';
    await returnToWindow(page);
    await expect(box).toContainText('Dry run fails for', { timeout: 30000 });
    const checkAgain = box.getByRole('button', { name: stageCardCopy.merge.checkAgain });
    await expect(checkAgain).toBeVisible();
    await shoot(page, '6');

    // No verdict at all: a retry is still possible, as "anyway".
    stubs.quiet = 'unavailable';
    await checkAgain.click();
    await expect(box).toContainText(stageCardCopy.dryRun.didNotFinish, { timeout: 30000 });
    await expect(box.getByRole('button', { name: stageCardCopy.merge.retryAnyway(true) })).toBeVisible();
    await shoot(page, '6-dry-unavailable');

    // Asked again; while it runs it says so, without a spinner.
    stubs.quiet = 'ok';
    stubs.quietDelayMs = 8000;
    await returnToWindow(page);
    await expect(box).toContainText(/Checking .+…/, { timeout: 15000 });
    await shoot(page, '6-dry-running');
    await expect(box).toContainText('the dry run passes now.', { timeout: 30000 });
    const retry = box.getByRole('button', { name: stageCardCopy.merge.retry('prod', true) });
    await expect(retry).toBeVisible();
    await shoot(page, '6-recheck');
    await retry.click();
    await expect(box).toContainText(stageCardCopy.merge.retryWrites(failing.slug, 3, true));
    await expect(confirmButton(page)).toHaveText(stageCardCopy.merge.retryConfirm(true));
    await cancelButton(page).click();

    // The failure is recorded on the ChangeOrder, so a reload still shows it.
    stubs.quietDelayMs = 0;
    stubs.promotionFailures = [
      stub('promotion-failure', {
        stage: 'prod',
        failedAt: new Date().toISOString(),
        userId: me,
        spaceId: failing.spaceId,
        slug: failing.slug,
        message: 'simulated recorded failure',
      }),
    ];
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'failed', { timeout: 45000 });
    await expect(page.getByTestId('change-order-foot-error')).toContainText('simulated recorded failure');
  });

  /*
   * A RELEASE THAT FAILS IN ONE SPACE is published again in that Space only: the
   * others already run the change, and publishing them again is not a retry.
   */
  test('a release that failed in one Space: Release again publishes only that Space', async ({ page }) => {
    const [ok1, ok2, failing] = fx.spacesInStage('prod');
    const { stubs, traffic } = await installStubs(page, fx, { quiet: 'ok', apply: 'ok', releaseFailSpaceIds: [failing.spaceId] });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    await expect(promoteMain(page, 'prod')).toHaveAttribute('data-one-click', 'true');
    await promoteMain(page, 'prod').click();
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'failed', { timeout: 60000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.releaseFailed(1, 3));
    expect(new Set(traffic.releases)).toEqual(new Set([ok1.spaceId, ok2.spaceId, failing.spaceId]));

    stubs.releaseFailSpaceIds = [];
    const before = traffic.releases.length;
    await statusBox(page).getByRole('button', { name: stageCardCopy.merge.releaseAgain }).click();
    await confirmButton(page).click();
    await expect.poll(() => traffic.releases.length, { timeout: 30000 }).toBeGreaterThan(before);
    await page.waitForTimeout(1000);
    expect(traffic.releases.slice(before), 'only the Space whose release failed').toEqual([failing.spaceId]);
  });

  test('a released stage offers nothing and folds its review; the source stage is one line', async ({ page }) => {
    // dev's entry review, over the ChangeOrder's own Space, approved by Priya and Lena.
    await mockReviews(page, fx, 'satisfied', { firstStage: true }, 'base');
    await openStage(page, fx, 'dev');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'released', { timeout: 45000 });
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    await expect(page.locator('[data-release-stage]')).toHaveCount(0);
    const row = sidebar(page).locator('[data-testid="stage-review-row"][data-requirement="first-look"]');
    await expect(row).toContainText('approved by', { timeout: 30000 });
    await expect(row.locator('[aria-expanded="true"]')).toHaveCount(0);
    await expect(sidebar(page)).toContainText(stageCardCopy.sidebar.targetsRun(1));

    // No box: one line at the card's edge, since there is nothing to do here.
    await openStage(page, fx, SOURCE_STAGE);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'source');
    await expect(statusBox(page)).toContainText(stageCardCopy.body.source);
    await expect(page.locator('#stage-status-heading')).toHaveCount(0);
    await expect(card(page).getByRole('link', { name: new RegExp(stageCardCopy.goTo('dev')) })).toHaveAttribute(
      'href',
      changeOrderPath(fx.spaces.base.slug, fx.changeOrderSlug, 'dev'),
    );
    await expect(sidebar(page)).toContainText(stageCardCopy.sidebar.gatesNone);
    await shoot(page, '8');
  });

  test('keyboard: the two buttons, the acknowledgement and its confirm, the review form, and focus after a failure', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { stubs, traffic } = await installStubs(page, fx, { quiet: 'ok', apply: 'ok' });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    const main = promoteMain(page, 'prod');

    // The main button, then "Promote only", in the tab order.
    await main.focus();
    await page.keyboard.press('Tab');
    const other = otherButton(page);
    await expect(other).toBeFocused();
    expect(traffic.applies).toEqual([]);

    // A propagation problem: each button opens its own confirm. The acknowledgement
    // takes focus, Space ticks it, and Escape gives focus back to the button.
    const odd = (await spacesInListOrder(fx, 'prod')).at(-1) as ChangeOrderSpace;
    stubs.forced = (result) => mutateSpace(result, odd.spaceId, takesDifferently);
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'problem', { timeout: 45000 });
    await other.focus();
    await page.keyboard.press('Enter');
    await expect(statusBox(page).getByRole('checkbox')).toBeFocused();
    await expect(confirmButton(page)).toHaveText(stageCardCopy.merge.confirm('p', false));
    await page.keyboard.press('Escape');
    await expect(confirmButton(page)).toHaveCount(0);
    await expect(other).toBeFocused();
    await main.focus();
    await page.keyboard.press('Enter');
    const ack = statusBox(page).getByRole('checkbox');
    await expect(ack).toBeFocused();
    await page.keyboard.press('Space');
    await expect(ack).toBeChecked();
    await expect(confirmButton(page)).toHaveText(stageCardCopy.merge.confirm('pr', false));
    await expect(confirmButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(confirmButton(page)).toHaveCount(0);
    await expect(main).toBeFocused();
    expect(traffic.applies).toEqual([]);

    // A failure: focus goes to the headline that says so.
    stubs.forced = undefined;
    stubs.apply = 'partial';
    stubs.applyFailSpaceIds = [fx.spaces['prod-us-east'].spaceId];
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    await expect(main).toHaveAttribute('data-one-click', 'true');
    await main.focus();
    await page.keyboard.press('Enter');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'failed', { timeout: 30000 });
    await expect(heading(page)).toBeFocused();

    // The review form: Escape closes it onto Approve…, and Ctrl+Enter submits.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const mocks = await mockReviews(page, fx, 'partial');
    await openStage(page, fx, 'prod');
    const approve = statusBox(page).getByTestId('review-approve');
    await expect(approve).toBeVisible({ timeout: 45000 });
    await approve.focus();
    await page.keyboard.press('Enter');
    const reason = statusBox(page).getByTestId('review-reason');
    const submit = statusBox(page).getByTestId('review-submit');
    await expect(noteRequired('Pass') ? reason : submit).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(statusBox(page).getByTestId('review-form')).toHaveCount(0);
    await expect(approve).toBeFocused();
    await page.keyboard.press('Enter');
    await reason.focus();
    await page.keyboard.type('Read the diff.');
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => mocks.attests.length, { timeout: 15000 }).toBe(1);
  });

  /*
   * THE ODD ONE OUT IS THE ONE NAMED, whichever Space the comparison happens to
   * measure against. When the Space listed first is the one whose change differs,
   * the other two agree with each other, and the card must still say that one
   * Space takes a different change, not that the two that agree do.
   */
  test('the odd Space is named even when it is the first of the stage', async ({ page }) => {
    const first = (await spacesInListOrder(fx, 'prod'))[0];
    await installStubs(page, fx, { apply: 'ok', forced: (result) => mutateSpace(result, first.spaceId, takesDifferently) });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'problem', { timeout: 45000 });
    await expect(heading(page)).toHaveText(stageCardCopy.headline.differs(1));
    await expect(problem(page)).toContainText(first.slug);
    await expect(sidebar(page).locator(`[data-testid="stage-space"][data-space-id="${first.spaceId}"]`)).toContainText(stageCardCopy.mark.differs);
  });

  /** No sideways scroll, and the sidebar beside the main column at `width`, or below it on a phone. */
  async function checkLayout(page: Page, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    // The stage card never runs past the window. (On a phone the summary card above
    // it has wide rows of its own, so the page as a whole is checked at 760 and up.)
    const overflow = () =>
      page.evaluate(() => {
        const doc = document.documentElement;
        const card = document.querySelector('[data-testid="stage-card"]');
        return {
          page: doc.scrollWidth - doc.clientWidth,
          card: card === null ? 0 : Math.max(card.scrollWidth - card.clientWidth, card.getBoundingClientRect().right - doc.clientWidth),
        };
      });
    // Polled: the card lays out again after the window changes size.
    await expect.poll(async () => (await overflow()).card, { message: `the stage card runs past the window at ${width}`, timeout: 5000 }).toBeLessThanOrEqual(1);
    if (width >= 760) expect((await overflow()).page, `page scrolls sideways at ${width}`).toBeLessThanOrEqual(1);
    const main = await boxOf(statusBox(page));
    const change = await boxOf(page.getByTestId('stage-change-card'));
    const side = await boxOf(sidebar(page));
    if (width >= 760) {
      for (const [name, box] of [['status box', main], ['change card', change]] as const) {
        expect(side.x, `the sidebar is beside the ${name}, not over it, at ${width}`).toBeGreaterThanOrEqual(box.x + box.width - 1);
      }
    } else {
      expect(side.y, `the sidebar is below the main column at ${width}`).toBeGreaterThanOrEqual(main.y + main.height - 1);
      expect(near(side.x, main.x, 2)).toBe(true);
    }
  }

  test('layout at 1440 and 400: the stage card fits the window; the sidebar beside the main column, or below it on a phone', async ({ page }) => {
    await installStubs(page, fx, { quiet: 'ok' });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toBeVisible({ timeout: 45000 });
    for (const width of [1440, 400]) await checkLayout(page, width);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('layout at 1000: the sidebar clears the main column', async ({ page }) => {
    await installStubs(page, fx, { quiet: 'ok' });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toBeVisible({ timeout: 45000 });
    await checkLayout(page, 1000);
  });

  /*
   * ONE CLICK WRITES ONLY WHAT THE BOX SHOWED. An answer older than a minute is
   * asked again at the click; the stub plans something new on every ask, so the
   * answer asked again plans something else. Nothing is written, the box shows
   * the new answer, and a second click promotes on it.
   */
  test('one click: a dry run asked again that plans something else writes nothing, and the next click promotes', async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    const { traffic } = await installStubs(page, fx, { quiet: 'ok', apply: 'ok' });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    const only = otherButton(page);
    await expect(only).toHaveAttribute('data-one-click', 'true');
    const asked = traffic.quiet.length;
    await page.clock.fastForward('01:05');
    await only.click();
    await expect.poll(() => traffic.quiet.length, { timeout: 15000 }).toBeGreaterThan(asked);
    await expect(page.locator('#announce')).toContainText(stageCardCopy.announce.planChanged('prod'), { timeout: 15000 });
    await expect(heading(page)).toBeFocused();
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready');
    await expect(confirmButton(page)).toHaveCount(0);
    expect(traffic.applies, 'a plan the reader did not see is not written').toEqual([]);

    await only.click();
    await expect.poll(() => traffic.applies.length, { timeout: 30000 }).toBe(1);
  });

  /*
   * NOTHING CAN BE PRESSED HALF-WAY. Promote and release is one action: between
   * the click and "Released", the box never offers a live button, and never shows the
   * promote leg's own state ("Promoted, not released", "Promoted in 1 of 3"). Last in
   * the file, because it really promotes and releases prod.
   */
  test('promote and release on prod: no clickable or half-way state between the click and Released', async ({ page }) => {
    test.setTimeout(180_000);
    await installStubs(page, fx);
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    await expect(promoteMain(page, 'prod')).toHaveAttribute('data-one-click', 'true');
    await promoteMain(page, 'prod').click();
    await recordTimeline(page);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'released', { timeout: 120000 });
    const frames = await timeline(page);
    expect(frames.filter((f) => f.live), `a live button mid-action: ${JSON.stringify(frames)}`).toEqual([]);
    expect(frames.filter((f) => /Promoted, not released|Promoted in \d/.test(f.heading)), JSON.stringify(frames)).toEqual([]);
  });
});
