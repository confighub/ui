// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The selected stage's card on the ChangeOrder page: its status pill and Stage log
 * (what happened, Now, what still has to happen), Promote and Release confirmed in
 * place, the dry run it runs on its own, the reviews it hosts, propagation
 * problems, and a failed promotion.
 *
 * ONE REAL CHANGEORDER, WALKED FORWARD. The fixture is the three-stage
 * `no-health-check` workflow with release Targets and all four resources:
 *
 *     base ──▶ dev ──▶ staging, staging-canary ──▶ prod-us-east, prod-eu-west, prod-ap-south
 *
 * `dev` is promoted and then released through the card for real, then `staging`
 * the same way, so `prod` is the stage everything after that is tried on. Those tests stub what the server will not produce on demand:
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
 * state numbers: 1 ready, 1-working, 1-dry-running, 1-dry-unavailable, 2 your review
 * is needed, 2-approve, 3 the author waits, 4 rejected, 5 promoted not released,
 * 6 promotion failed, 6-recheck, 6-dry-unavailable, 7 released, 8 source, 9 a Space
 * takes the change differently, 10 a Space keeps its own value, 10-jump, 11 can't
 * tell, 12 a gate failing. They are for a person
 * to compare with the design; nothing here compares pixels.
 */
import { mkdirSync } from 'fs';

import { type Locator, type Page, type Request } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { changeOrderPath } from '../src/pages/change-orders/changeOrderAddress';
import { releaseFixCopy } from '../src/pages/change-orders/stage/releaseFixCopy';
import { stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';
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
/** `componentTheme.promote`, the theme's secondary: Promote and Release are purple, not the rust primary. */
const PURPLE = 'rgb(104, 36, 196)';
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

/** How the stubbed `POST /api/unit/tag` answers one Space's move. */
type MoveAnswer = 'ok' | 'refused' | 'noItem';

/** What the "Release the fix" stubs saw: the moves of the release Tag, and what was asked in what order. */
interface FixTraffic {
  on: boolean;
  /** How each Space's move is answered; a Space not named here is moved. */
  answer: Record<string, MoveAnswer>;
  /** The bodies and where clauses of `POST /api/unit/tag`, while `on`. */
  moves: { where: string; body: Json }[];
  /** `move:<spaceId>` and `release:<spaceId>`, in the order the page sent them while `on`. */
  order: string[];
  /** Each Space's `app` Unit, and the head the stubs give each fixed Unit, by Unit id. */
  appUnitIds: Record<string, string>;
  heads: Record<string, number>;
  /** A second Unit of the first Space, fixed too while `withExtra`, for a move that is refused on one Unit only. */
  extra: { unitId: string; slug: string; spaceId: string };
  withExtra: boolean;
  /** Units whose move is refused while their Space's answer is `ok`. */
  refuseUnitIds: string[];
}

/**
 * A fix saved by hand in each of `spaces`, after its release failed on a gate: the `app`
 * Unit's head is one Revision past the one the ChangeOrder's release Tag marks, and that
 * marked Revision has ValidationErrors. The server cannot be made to gate one Space's
 * release on demand, so the reads say so, while `on`; the move of the release Tag is
 * answered here (`answer`) and never reaches the server.
 */
async function installFixStubs(page: Page, spaces: ChangeOrderSpace[], releaseTagId: string): Promise<FixTraffic> {
  const fix: FixTraffic = {
    on: false,
    answer: {},
    moves: [],
    order: [],
    appUnitIds: {},
    heads: {},
    extra: { unitId: '', slug: '', spaceId: '' },
    withExtra: false,
    refuseUnitIds: [],
  };
  // Known before the page reads anything: the marks may be read before the heads are.
  for (const space of spaces) {
    const listed = await hubApi.get('/api/unit', { params: { where: `SpaceID = '${space.spaceId}'` } });
    expect(listed.ok(), `list ${space.slug}: ${listed.status()}`).toBe(true);
    const units = ((await listed.json()) as { Unit?: { UnitID?: string; Slug?: string } }[]).map((row) => row.Unit);
    const app = units.find((u) => u?.Slug === 'app');
    expect(app?.UnitID, `${space.slug}/app exists`).toBeDefined();
    fix.appUnitIds[space.spaceId] = app?.UnitID ?? '';
    const other = units.find((u) => u?.Slug !== undefined && u.Slug !== 'app');
    if (space === spaces[0] && other?.UnitID !== undefined && other.Slug !== undefined) fix.extra = { unitId: other.UnitID, slug: other.Slug, spaceId: space.spaceId };
  }
  expect(fix.extra.unitId, `${spaces[0].slug} has a second Unit`).not.toBe('');
  const spaceOfUnit = (unitId: unknown) =>
    fix.withExtra && unitId === fix.extra.unitId ? fix.extra.spaceId : Object.keys(fix.appUnitIds).find((spaceId) => fix.appUnitIds[spaceId] === unitId);
  // The units list the card reads its heads from.
  await page.route(
    (url) => url.pathname === '/api/unit',
    async (route) => {
      if (!fix.on || route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const rows = (await response.json()) as { Unit?: Json }[];
      const changed = rows.map((row) => {
        const unit = row.Unit;
        const spaceId = spaceOfUnit(unit?.UnitID);
        if (unit === undefined || spaceId === undefined) return row;
        const unitId = String(unit.UnitID);
        fix.heads[unitId] = Number(unit.HeadRevisionNum) + 1;
        return { ...row, Unit: { ...unit, HeadRevisionNum: fix.heads[unitId], ValidationErrors: {} } };
      });
      return route.fulfill({ response, body: JSON.stringify(changed) });
    },
  );
  // The Revisions the ChangeOrder's Tags mark.
  await page.route(
    (url) => url.pathname === '/api/revision' && (url.searchParams.get('where') ?? '').includes(`Tags ? '${releaseTagId}'`),
    async (route) => {
      if (!fix.on) return route.fallback();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const rows = (await response.json()) as { Revision?: Json }[];
      const changed = rows.map((row) => {
        const revision = row.Revision;
        const spaceId = spaceOfUnit(revision?.UnitID);
        if (revision === undefined || spaceId === undefined || revision.SpaceID !== spaceId) return row;
        return { ...row, Revision: { ...revision, ValidationErrors: { 'vet-images/vet-images': true } } };
      });
      return route.fulfill({ response, body: JSON.stringify(changed) });
    },
  );
  // What the confirm shows of the head: its diff and who saved it.
  await page.route(
    (url) => /^\/api\/space\/[^/]+\/unit\/[^/]+\/(diff|revision)$/.test(url.pathname) && spaceOfUnit(url.pathname.split('/')[5]) !== undefined,
    async (route) => {
      if (!fix.on) return route.fallback();
      if (route.request().url().includes('/diff')) {
        return route.fulfill(
          json({
            Diff: {
              Resources: [
                {
                  Resource: { ResourceName: 'confighub-app', ResourceType: 'apps/v1/Deployment' },
                  ChangeType: 'Update',
                  Changes: [
                    {
                      Path: 'spec.template.spec.containers.?name=app.image',
                      DisplayPath: 'spec.template.spec.containers.?name=app.image',
                      Segments: [],
                      ChangeType: 'Update',
                      FromValue: IMAGE_BEFORE,
                      ToValue: IMAGE_AFTER,
                    },
                  ],
                },
              ],
            },
          }),
        );
      }
      return route.fulfill(json([{ Revision: { RevisionNum: 0, CreatedAt: new Date().toISOString() }, User: { DisplayName: 'Gate Fixer', Slug: 'fixer' } }]));
    },
  );
  await page.route(
    (url) => url.pathname === '/api/unit/tag',
    async (route) => {
      const request = route.request();
      const where = new URL(request.url()).searchParams.get('where') ?? '';
      const spaceId = /SpaceID = '([^']+)'/.exec(where)?.[1] ?? '';
      const unitIds = [...(/UnitID IN \(([^)]*)\)/.exec(where)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
      fix.moves.push({ where, body: bodyOf(request) });
      fix.order.push(`move:${spaceId}`);
      switch (fix.answer[spaceId] ?? 'ok') {
        case 'refused':
          return route.fulfill(
            json(
              unitIds.map((id) => ({ Message: `Failed to tag unit ${id}`, Error: { Message: 'the revision has validation errors, so it could not be released' } })),
              207,
            ),
          );
        case 'noItem':
          return route.fulfill(json([]));
        case 'ok': {
          // The server moves Unit by Unit: one refusal leaves the others moved, in a 207.
          const items = unitIds.map((id) =>
            fix.refuseUnitIds.includes(id)
              ? { Message: `Failed to tag unit ${id}`, Error: { Message: 'the revision has validation errors, so it could not be released' } }
              : { Message: `Tag moved from revision 1 to Revision (revision 2) for unit ${id}` },
          );
          return route.fulfill(json(items, items.some((item) => 'Error' in item) ? 207 : 200));
        }
      }
    },
  );
  page.on('request', (request) => {
    const match = /^\/api\/space\/([^/]+)\/release$/.exec(new URL(request.url()).pathname);
    if (fix.on && match !== null && request.method() === 'POST' && bodyOf(request).DryRun !== true) fix.order.push(`release:${match[1]}`);
  });
  return fix;
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
/** The Stage log, which carries the card's state as `data-stage-state`. */
const statusBox = (page: Page) => page.getByTestId('stage-status');
/** The status pill: the state in a few words, and where focus goes after an action. */
const heading = (page: Page) => page.locator('#stage-status-heading');
const logLine = (page: Page, id: string) => page.getByTestId(id);
const problem = (page: Page) => page.getByTestId('stage-problem');
const confirmButton = (page: Page) => page.locator('[data-confirm]');
const cancelButton = (page: Page) => page.locator('[data-cancel]');
const promoteMain = (page: Page, stage: string) => page.locator(`[data-testid="stage-merge"][data-promote-stage="${stage}"]`);
const releaseMain = (page: Page, stage: string) => page.locator(`[data-release-stage="${stage}"]`);
const copy = stageCardCopy.log;

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
  /** From `recordTimeline` only: the stage whose card is shown. */
  stage?: string;
  /** From `recordFromLoad` only: each prerequisite line's tone, whether the log is still being read, the log's text. */
  gates?: string[];
  checking?: boolean;
  log?: string;
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
      stage: document.querySelector('[data-testid="stage-card"]')?.getAttribute('data-stage') ?? '',
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
          gates: Array.from(document.querySelectorAll('[data-testid^="log-gate-"]')).map((g) => g.getAttribute('data-tone') ?? ''),
          checking: document.querySelector('[data-testid="log-skeleton-1"]') !== null,
          log: document.querySelector('[data-testid="stage-log"]')?.textContent ?? '',
        };
        const last = w.__frames[w.__frames.length - 1];
        if (last === undefined || JSON.stringify(last) !== JSON.stringify(frame)) w.__frames.push(frame);
      };
      new MutationObserver(snap).observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-stage-state', 'data-tone', 'aria-disabled', 'disabled'],
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
 * A PREREQUISITE THAT FAILS holds the stage by itself: its line in the log is the
 * red band, naming where it failed and what it needs, the pill names it, and
 * Promote is locked with what it waits for. The custom prerequisite is the one
 * check a real server fails on demand.
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
  test('a stage the change has not reached, held by a custom check: no "already has the change", no "writes no field"', async ({ page }) => {
    await recordFromLoad(page);
    await page.goto(`${fx.changeOrderPath}/prod`);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', /^gate/, { timeout: 45000 });
    const changeCard = page.getByTestId('stage-change-card');
    await expect(changeCard).toContainText('Shown once dev has the change.', { timeout: 30000 });
    await expect(statusBox(page)).not.toContainText('already has the change');
    await page.waitForTimeout(1000);
    const frames = await timeline(page);
    const all = JSON.stringify(frames);
    expect(frames.filter((f) => f.change.includes(stageCardCopy.change.nothing)), all).toEqual([]);
    expect(frames.filter((f) => (f.log ?? '').includes('already has the change')), all).toEqual([]);
  });

  test('the failing prerequisite is a red line with where and what it needs; Promote is locked', async ({ page }) => {
    // `prod`'s mandatory `check/promoted` holds it until `dev` has the change; the
    // custom check is the hold this test is about.
    await fx.promoteStage('dev');
    await page.goto(`${fx.changeOrderPath}/prod`);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'gateFailed', { timeout: 45000 });
    await expect(heading(page)).toHaveText(`${CUSTOM_PREREQUISITE.Name} failed`);
    const red = page.locator('[data-testid^="log-gate-"][data-tone="bad"]');
    await expect(red).toHaveCount(1);
    // Where it failed is part of the sentence, and the sub-line is the rule it needs.
    await expect(red).toContainText(`${CUSTOM_PREREQUISITE.Name} Failed in ${fx.spaces.dev.slug}`);
    await expect(red).toContainText(copy.needs(CUSTOM_PREREQUISITE.Description));
    await expect(red).toContainText('auto');
    await expect(page.locator('[data-testid="stage-merge"], [data-promote-stage]')).toHaveCount(0);
    const promote = logLine(page, 'open-promote');
    await expect(promote).toContainText(`${copy.promoteTo('prod')} ${copy.waitsFor}${CUSTOM_PREREQUISITE.Name}`);
    await expect(promote.getByTestId('act-promote')).toHaveAttribute('aria-disabled', 'true');
    // The pill is a link to the red line.
    await expect(heading(page)).toHaveAttribute('href', `#${await red.getAttribute('id')}`);
    await shoot(page, '12');
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
   * when `staging` waits for `dev` to take the change: the pill says what it waits
   * on, calmly, the arrival line leads there, and Promote waits for it.
   */
  test('a stage waiting on the stage before it is neutral, not red, and leads there', async ({ page }) => {
    await openStage(page, fx, 'staging');
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'gateWaiting', { timeout: 45000 });
    await expect(heading(page)).toHaveText('Waiting on dev');
    await expect(heading(page)).toHaveAttribute('data-tone', 'neutral');
    await expect(box.locator('[data-tone="bad"]')).toHaveCount(0);
    await expect(logLine(page, 'log-arrival').getByRole('link', { name: 'dev', exact: true })).toHaveAttribute(
      'href',
      changeOrderPath(fx.spaces.base.slug, fx.changeOrderSlug, 'dev'),
    );
    await expect(logLine(page, 'open-promote')).toContainText(`${copy.waitsFor}dev`);
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
  });

  /*
   * A HELD STAGE NEVER LOOKS READY WHILE IT LOADS. Opened directly, the card reads
   * the stage, then says what it waits for. Until the first gate answer is in it
   * offers no Promote, says nothing of "Your turn", and draws no prerequisite red:
   * the log shows its skeleton lines.
   */
  test('a held stage opened directly: "Checking…", then "Waiting on…", never "Your turn", no Promote, no red line first', async ({ page }) => {
    await recordFromLoad(page);
    await openStage(page, fx, 'staging');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'gateWaiting', { timeout: 45000 });
    await page.waitForTimeout(1500);
    const frames = await timeline(page);
    const all = JSON.stringify(frames);
    const headings = frames.map((f) => f.heading).filter((h) => h !== '');
    const waiting = headings.findIndex((h) => h.startsWith('Waiting'));
    expect(waiting, `the pill reached "Waiting": ${all}`).toBeGreaterThanOrEqual(0);
    expect(headings.slice(0, waiting).filter((h) => h !== 'Checking…'), `only "Checking…" before "Waiting": ${all}`).toEqual([]);
    expect(headings.filter((h) => /Your turn/.test(h)), `"Your turn" while held: ${all}`).toEqual([]);
    expect(frames.filter((f) => f.live), `a Promote control while held: ${all}`).toEqual([]);
    // Waiting is not a failure, before or after the gates answer.
    expect(frames.filter((f) => (f.gates ?? []).includes('bad')), `a red prerequisite line: ${all}`).toEqual([]);
  });

  /*
   * A STAGE THE CHANGE HAS NOT REACHED has nothing to compare yet: no Space "has
   * it", and the change card says when it will show what the stage takes. The page
   * never flashes "Nothing to promote" or "writes no field" while it reads.
   */
  test('a stage the change has not reached: no "already has the change", the not-reached line, and no flash on load', async ({ page }) => {
    await recordFromLoad(page);
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'gateWaiting', { timeout: 45000 });
    const changeCard = page.getByTestId('stage-change-card');
    await expect(changeCard).toContainText('Shown once staging has the change.', { timeout: 30000 });
    await expect(statusBox(page)).not.toContainText('already has the change');
    await page.waitForTimeout(1000);
    const frames = await timeline(page);
    expect(frames.length, 'the timeline recorded the load').toBeGreaterThan(0);
    expect(frames.filter((f) => f.heading === 'Nothing to promote'), JSON.stringify(frames)).toEqual([]);
    expect(frames.filter((f) => f.change.includes(stageCardCopy.change.nothing)), JSON.stringify(frames)).toEqual([]);
    expect(frames.filter((f) => (f.log ?? '').includes('already has the change')), JSON.stringify(frames)).toEqual([]);
    expect(frames.filter((f) => /Your turn/.test(f.heading) || f.live), JSON.stringify(frames)).toEqual([]);
  });

  /*
   * THE ORDINARY PATH, FOR REAL. Nothing is wrong and the log already says what the
   * promotion writes, so one click promotes: no confirm. Release is its own line,
   * locked until the promote, then one click too.
   */
  test('promote, then release: one click each, busy, and Released', async ({ page }) => {
    test.setTimeout(180_000);
    const { traffic } = await installStubs(page, fx, { applyDelayMs: 1500 });
    await openStage(page, fx, 'dev');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 30000 });
    await expect(heading(page)).toHaveText('Your turn');
    // The stage name is the card's heading, at the page's h2 level.
    await expect(card(page).getByRole('heading', { level: 2, name: stageCardCopy.stageHeading('dev'), exact: true })).toBeVisible();
    expect(traffic.quiet.length, 'the card asks its dry run on load').toBeGreaterThanOrEqual(1);

    const prompt = logLine(page, 'open-promote');
    await expect(prompt).toHaveAttribute('data-tone', 'prompt');
    await expect(prompt).toContainText(`${copy.promoteTo('dev')} ${copy.yourTurnSpaces(1)}`);
    const main = promoteMain(page, 'dev');
    await expect(main).toHaveText(copy.promote, { useInnerText: true });
    await expect(main).toHaveAttribute('data-method', 'p');
    // Promote is purple, the colour of every surface that promotes or releases.
    await expect(main).toHaveCSS('background-color', PURPLE);
    // One method, so one button; Release waits for the promote, with a lock.
    await expect(page.getByTestId('stage-merge-other')).toHaveCount(0);
    const release = logLine(page, 'open-release');
    await expect(release).toContainText(`${copy.releaseTo('dev')} ${copy.after}${copy.thePromote}`);
    await expect(release.getByTestId('act-release')).toHaveAttribute('aria-disabled', 'true');
    await shoot(page, '1');

    await expect(main).toHaveAttribute('data-one-click', 'true');
    await main.click();
    // The apply is held back 1.5s, so the busy state is on screen: the line says
    // it is promoting, the pill says Working…, and nothing can be pressed.
    await expect(prompt).toContainText(copy.promoting('dev'));
    await expect(heading(page)).toHaveText('Working…');
    await expect(confirmButton(page)).toHaveCount(0);
    await shoot(page, '1-working');

    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'promoted', { timeout: 60000 });
    await expect(logLine(page, 'log-promoted')).toContainText(copy.promotedTo('dev'));
    await expect(logLine(page, 'log-promoted')).toContainText('you');
    const releaseButton = releaseMain(page, 'dev');
    await expect(releaseButton).toHaveText(copy.release, { useInnerText: true });
    await expect(releaseButton).toHaveCSS('background-color', PURPLE);
    await expect(releaseButton).toHaveAttribute('data-one-click', 'true');
    await releaseButton.click();
    await expect(page.locator('#announce')).toContainText(stageCardCopy.announce.released('dev'), { timeout: 90000 });
    // Released, dev's work is done: the page moves on to staging, on the bare address, with focus.
    await expect(card(page)).toHaveAttribute('data-stage', 'staging', { timeout: 30000 });
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}$`));
    await expect(heading(page)).toBeFocused();
    await openStage(page, fx, 'dev');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'released', { timeout: 30000 });
    await expect(heading(page)).toHaveText(copy.releasedTo('dev'));
    await expect(logLine(page, 'log-released')).toContainText('you', { timeout: 30000 });
    const next = logLine(page, 'log-end').getByRole('link', { name: copy.goTo('staging') });
    await expect(next).toHaveAttribute('href', changeOrderPath(fx.spaces.base.slug, fx.changeOrderSlug, 'staging'));
    // Done: the log says so and offers nothing more.
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    expect(traffic.applies.length).toBe(1);
    await shoot(page, '7');
  });

  test('promoted, not released: the release prompt is all that is left, and nothing is live mid-action', async ({ page }) => {
    test.setTimeout(180_000);
    await installStubs(page, fx);
    await openStage(page, fx, 'staging');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 30000 });
    await expect(promoteMain(page, 'staging')).toHaveAttribute('data-one-click', 'true');
    await promoteMain(page, 'staging').click();
    // Recorded from the click on: before it, the button is live by design.
    await recordTimeline(page);
    await expect(confirmButton(page)).toHaveCount(0);

    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'promoted', { timeout: 60000 });
    {
      const frames = await timeline(page);
      const before = frames.slice(0, frames.findIndex((f) => f.state === 'promoted'));
      expect(before.filter((f) => f.live), JSON.stringify(frames)).toEqual([]);
    }
    await expect(heading(page)).toHaveText('Your turn');
    const release = releaseMain(page, 'staging');
    await expect(release).toBeFocused();
    await expect(logLine(page, 'open-release')).toContainText(`${copy.releaseTo('staging')} ${copy.yourTurn}`);
    // What the Targets run now is behind the (i), not a second line.
    await expect(logLine(page, 'open-release')).not.toContainText(copy.targetsRunEarlier(2));
    await expect(logLine(page, 'open-release').getByTestId('release-info')).toHaveAttribute(
      'aria-label',
      `${copy.releaseInfoLabel}: ${copy.targetsRunEarlier(2)}`,
    );
    await expect(logLine(page, 'log-promoted')).toContainText('you');
    await expect(page.locator('[data-promote-stage="staging"]')).toHaveCount(0);
    await shoot(page, '5');

    await release.click();
    await recordTimeline(page);
    await expect(confirmButton(page)).toHaveCount(0);
    // Released, staging's work is done: the page moves on to prod, on the bare address.
    await expect(card(page)).toHaveAttribute('data-stage', 'prod', { timeout: 90000 });
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}$`));
    // The Release button does not come back while the release runs.
    const frames = (await timeline(page)).filter((f) => f.stage === 'staging');
    expect(frames.filter((f) => f.live), JSON.stringify(frames)).toEqual([]);
    await openStage(page, fx, 'staging');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'released', { timeout: 30000 });
    await expect(logLine(page, 'log-released')).toContainText(copy.targetsRanIt(2));
  });

  test('the dry run: checking, unavailable (and Try again), no permission, and held', async ({ page }) => {
    test.setTimeout(180_000);
    const { stubs, traffic } = await installStubs(page, fx, { quiet: 'ok', quietDelayMs: 8000, apply: 'ok' });

    // Checking: skeleton lines below Now, the pill says so, and nothing can be pressed.
    await openStage(page, fx, 'prod');
    await expect(logLine(page, 'log-skeleton-1')).toBeVisible({ timeout: 30000 });
    await expect(heading(page)).toHaveText('Checking…');
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    await shoot(page, '1-dry-running');
    await expect(promoteMain(page, 'prod')).toBeVisible({ timeout: 30000 });
    await expect(logLine(page, 'open-promote')).toContainText(copy.yourTurnSpaces(3));

    // No answer: a red line says so, offers Try again, and nothing is offered to write.
    stubs.quiet = 'unavailable';
    stubs.quietDelayMs = 0;
    await openStage(page, fx, 'prod');
    const error = logLine(page, 'log-error');
    await expect(error).toBeVisible({ timeout: 30000 });
    await expect(error).toContainText(copy.cantCheck('prod'));
    await expect(error).toContainText(copy.serverAnswered(500));
    await expect(heading(page)).toHaveText(copy.cantCheck('prod'));
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    await shoot(page, '1-dry-unavailable');
    const asked = traffic.quiet.length;
    await error.getByRole('button', { name: copy.tryAgain }).click();
    await expect.poll(() => traffic.quiet.length, { timeout: 15000 }).toBeGreaterThan(asked);
    expect(traffic.applies).toEqual([]);

    // 403: said in place of a button, and the page is not replaced.
    stubs.quiet = 'forbidden';
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'noPermission', { timeout: 30000 });
    await expect(heading(page)).toHaveText('No permission');
    await expect(logLine(page, 'open-promote')).toContainText(copy.cantPromoteInto('prod'));
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    await expect(page).not.toHaveURL(/access-denied/);

    // 409: the server's hold, in its own words.
    stubs.quiet = 'held';
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'serverHeld', { timeout: 30000 });
    await expect(heading(page)).toHaveText(copy.held('prod'));
    await expect(logLine(page, 'log-held')).toContainText('simulated hold');
    await expect(logLine(page, 'open-promote')).toContainText(copy.waitsForServer('prod'));
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    expect(traffic.applies).toEqual([]);
  });

  test('review approve: the prompt, its reason form, one Pass, then Your turn to promote', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial', { countNewRecords: true });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewNeeded', { timeout: 45000 });
    await expect(heading(page)).toHaveText('Your turn');
    const review = logLine(page, 'open-review');
    await expect(review).toHaveAttribute('data-tone', 'prompt');
    await expect(review).toContainText(`${stageCardCopy.review.yourReview} ${stageCardCopy.review.needed}`);
    await expect(logLine(page, 'open-promote')).toContainText(`${copy.waitsFor}${copy.review}`);
    await expect(page.locator('[data-promote-stage]')).toHaveCount(0);
    await shoot(page, '2');

    await review.getByTestId('review-approve').click();
    const form = review.getByTestId('review-form');
    await expect(form).toBeVisible();
    await expect(form.getByLabel(stageCardCopy.review.compactLabel(true, true))).toBeVisible();
    await expect(form).toContainText(stageCardCopy.review.compactHint);
    await shoot(page, '2-approve');
    await form.getByTestId('review-reason').fill('Checked the image tag and the memory limit.');
    await form.getByTestId('review-submit').click();
    await expect.poll(() => mocks.attests.length, { timeout: 15000 }).toBe(1);
    expect(mocks.attests[0].body).toMatchObject({ Result: 'Pass', ChangeOrderID: fx.changeOrderId });
    await expect(page.getByTestId('review-toast')).toBeVisible();
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    await expect(heading(page)).toHaveText('Your turn');
    await expect(promoteMain(page, 'prod')).toBeVisible();
  });

  test('review reject, then withdraw: a revocation, and the review is asked for again', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial', { countNewRecords: true });
    await openStage(page, fx, 'prod');
    const review = logLine(page, 'open-review');
    await review.getByTestId('review-reject').click({ timeout: 45000 });
    const form = review.getByTestId('review-form');
    await form.getByTestId('review-submit').click();
    await expect(form).toContainText(stageCardCopy.review.reasonMissing);
    await form.getByTestId('review-reason').fill('Pin the memory limit before prod.');
    await expect(form.getByTestId('review-submit')).toHaveText(stageCardCopy.review.compactSubmit(false));
    await form.getByTestId('review-submit').click();
    await expect.poll(() => mocks.attests.length, { timeout: 15000 }).toBe(1);
    expect(mocks.attests[0].body).toMatchObject({ Result: 'Fail' });

    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewRejected', { timeout: 45000 });
    await expect(heading(page)).toHaveText('Rejected by you');
    await expect(logLine(page, 'log-rejected')).toContainText('Pin the memory limit before prod.');
    await expect(review).toContainText(stageCardCopy.review.youCanWithdraw);
    await review.getByRole('button', { name: stageCardCopy.review.withdraw }).click();
    await review.getByRole('button', { name: stageCardCopy.review.confirmWithdraw }).click();
    // One revocation per Space the rejection was recorded in.
    await expect.poll(() => mocks.revokes.length, { timeout: 15000 }).toBe(fx.spacesInStage('staging').length);
    for (const revoke of mocks.revokes) expect(revoke.body.RevokedAttestationID).toBeTruthy();
    expect(mocks.attests).toHaveLength(1);
    await expect(page.locator('#announce')).toContainText(stageCardCopy.announce.rejectionWithdrawn);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewNeeded', { timeout: 45000 });
    await expect(heading(page)).toHaveText('Your turn');
  });

  test('author: waiting on review, request a review, and ask the rejecter again', async ({ page }) => {
    let mocks = await mockReviews(page, fx, 'author');
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'reviewWaiting', { timeout: 45000 });
    await expect(heading(page)).toHaveText(/^Waiting on /);
    const review = logLine(page, 'open-review');
    await expect(review).toContainText(stageCardCopy.review.youWroteIt);
    await expect(review.getByTestId('review-approve')).toHaveCount(0);
    await shoot(page, '3');

    await review.getByRole('button', { name: stageCardCopy.review.compactRequest, exact: true }).click();
    const picker = review.getByTestId('review-request-picker');
    await expect(picker).toContainText(stageCardCopy.review.requestFrom);
    await picker.getByRole('checkbox', { name: PEOPLE.priya.name }).check();
    await picker.getByRole('button', { name: stageCardCopy.review.requestSubmit, exact: true }).click();
    await expect.poll(() => mocks.patches.length, { timeout: 15000 }).toBe(1);
    const asked = (mocks.patches[0].ReviewRequests as { UserID?: string }[] | undefined) ?? [];
    expect(asked.map((r) => r.UserID)).toContain(PEOPLE.priya.id);
    await expect(review).toContainText(stageCardCopy.review.requestedFrom(PEOPLE.priya.name));

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
    await expect(heading(page)).toHaveText(`Rejected by ${PEOPLE.tom.name}`);
    await expect(logLine(page, 'log-rejected')).toContainText('session-store needs synchronous deletes');
    await expect(review).toContainText(stageCardCopy.review.canWithdraw(PEOPLE.tom.name));
    await shoot(page, '4');
    const startedAt = Date.now();
    await review.getByRole('button', { name: stageCardCopy.review.compactAskAgain, exact: true }).click();
    await expect.poll(() => mocks.patches.length, { timeout: 15000 }).toBe(1);
    const sent = (mocks.patches[0].ReviewRequests as { UserID?: string; RequestedAt?: string }[] | undefined) ?? [];
    const tom = sent.find((r) => r.UserID === PEOPLE.tom.id);
    const lena = sent.find((r) => r.UserID === PEOPLE.lena.id);
    expect(Date.parse(tom?.RequestedAt ?? ''), 'Tom is asked again: a later RequestedAt').toBeGreaterThanOrEqual(startedAt - 60_000);
    expect(lena, 'the other requests are kept').toBeDefined();
    expect(Date.parse(lena?.RequestedAt ?? '') < startedAt - 3 * HOUR, 'and left as they were').toBe(true);
    await expect(review).toContainText(stageCardCopy.review.askedAgain(PEOPLE.tom.name));
  });

  /*
   * A SPACE THAT TAKES THE CHANGE DIFFERENTLY IS SAID BEFORE PROMOTE, and Promote
   * is still offered: it may be exactly what the reader wants. So the button says
   * "anyway", and the confirm waits for the reader to tick what they checked.
   */
  test('a Space that takes the change differently: the amber line and pill, the bar with Same and Differs boxes, and an acknowledged "anyway"', async ({
    page,
  }) => {
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
    await expect(heading(page)).toHaveAttribute('data-tone', 'warning');
    await expect(logLine(page, 'log-warn')).toContainText(odd.slug);
    const main = promoteMain(page, 'prod');
    await expect(main).toHaveText(copy.promoteAnyway, { useInnerText: true });
    // "…anyway" is outlined, still in Promote's purple.
    await expect(main).toHaveCSS('color', PURPLE);
    await expect(main).toHaveCSS('border-top-color', PURPLE);
    await expect(main).toHaveCSS('background-color', 'rgb(255, 255, 255)');
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
    expect(traffic.errors).toEqual([]);
    await shoot(page, '9');

    await main.click();
    // The prompt asks it as a question, and the acknowledgement opens under it.
    await expect(logLine(page, 'open-promote')).toContainText(copy.promoteAnywayTo('prod'));
    const confirm = confirmButton(page);
    await expect(confirm).toHaveText(copy.confirmAnyway);
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
    expect(traffic.errors).toEqual([]);
    await shoot(page, '10');

    // Opening a box opens it in place: the page does not scroll, so the card the
    // reader pressed in stays where it was.
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
    await expect(changeCard).toContainText(/takes? from (an )?earlier variants?/);
    await expect(changeCard.getByTestId('stage-change-notes')).not.toContainText(/fail|error/i);

    stubs.forced = (result) =>
      mutateSpace(result, chained.spaceId, () => stub('forced-space-unplanned', { spaceId: chained.spaceId, slug: chained.slug }));
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'problem', { timeout: 45000 });
    await expect(problem(page)).toHaveAttribute('data-problem-kind', 'unknown');
    await expect(heading(page)).toHaveText(stageCardCopy.headline.unknown(1, 3));
    await expect(problem(page)).toContainText('The dry run could not plan');
    await shoot(page, '11');
    await promoteMain(page, 'prod').click();
    await expect(statusBox(page).getByRole('checkbox', { name: stageCardCopy.merge.ack.unknown(1) })).toBeVisible();
    await cancelButton(page).click();
    expect(traffic.errors).toEqual([]);
    expect(traffic.applies).toEqual([]);
  });

  test('a failed promotion: the red line, a re-check on focus, the retry, and the record after a reload', async ({ page }) => {
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
    await expect(heading(page)).toHaveText('Promote failed');
    await expect(heading(page)).toBeFocused();
    const red = logLine(page, 'log-promote-failed');
    await expect(red).toHaveAttribute('data-tone', 'bad');
    await expect(red).toContainText(`${copy.actionTo(false, 'prod')} ${copy.failedInOf(1, 3)}`);
    const error = page.getByTestId('change-order-foot-error');
    await expect(error).toContainText('simulated merge refusal on app');
    await expect(error).toContainText(failing.slug);

    // The dry run fails for that Space now: Check again, and no retry yet.
    stubs.quiet = 'fails';
    await returnToWindow(page);
    const promote = logLine(page, 'open-promote');
    await expect(promote).toContainText('Dry run fails for', { timeout: 30000 });
    const checkAgain = promote.getByRole('button', { name: stageCardCopy.merge.checkAgain });
    await expect(checkAgain).toBeVisible();
    await shoot(page, '6');

    // No verdict at all: a retry is still possible, as "anyway".
    stubs.quiet = 'unavailable';
    await checkAgain.click();
    await expect(promote.getByRole('button', { name: stageCardCopy.merge.retryAnyway(false) })).toBeVisible({ timeout: 30000 });
    await shoot(page, '6-dry-unavailable');

    // Asked again: once the dry run passes, Retry, whose confirm says what it writes again.
    stubs.quiet = 'ok';
    await returnToWindow(page);
    const retry = promote.getByRole('button', { name: copy.retry, exact: true });
    await expect(retry).toBeVisible({ timeout: 30000 });
    await shoot(page, '6-recheck');
    await retry.click();
    await expect(box).toContainText(stageCardCopy.merge.retryWrites(failing.slug, 3, false));
    await expect(confirmButton(page)).toHaveText(stageCardCopy.merge.retryConfirm(false));
    await cancelButton(page).click();

    // The failure is recorded on the ChangeOrder, so a reload still shows it.
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

  test('a released stage offers nothing and keeps its approvals in the log; the source stage is one line', async ({ page }) => {
    // dev's entry review, over the ChangeOrder's own Space, approved by Priya and Lena.
    await mockReviews(page, fx, 'satisfied', { firstStage: true }, 'base');
    await openStage(page, fx, 'dev');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'released', { timeout: 45000 });
    await expect(heading(page)).toHaveText(copy.releasedTo('dev'));
    await expect(heading(page)).toHaveAttribute('data-tone', 'success');
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
    await expect(page.locator('[data-release-stage]')).toHaveCount(0);
    await expect(logLine(page, 'log-open')).toHaveCount(0);
    // Nothing folds: the approvals are there, with who gave them, without opening anything.
    await expect(logLine(page, 'log-end')).toBeVisible({ timeout: 30000 });
    await expect(logLine(page, 'log-fold')).toHaveCount(0);
    await expect(statusBox(page)).toContainText(`${PEOPLE.lena.name} ${copy.approved}`, { timeout: 30000 });
    await expect(logLine(page, 'log-end')).toContainText(copy.nothingLeft('dev'));

    // The source: the line it was made in, and where to go next.
    await openStage(page, fx, SOURCE_STAGE);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'source');
    await expect(heading(page)).toHaveText('Made here');
    await expect(logLine(page, 'log-arrival')).toContainText(`${copy.madeHere} ${fx.spaces.base.slug}`);
    await expect(logLine(page, 'log-end')).toContainText(copy.startsHere);
    await expect(logLine(page, 'log-end').getByRole('link', { name: copy.goTo('dev') })).toHaveAttribute(
      'href',
      changeOrderPath(fx.spaces.base.slug, fx.changeOrderSlug, 'dev'),
    );
    await shoot(page, '8');
  });

  test('keyboard: the acknowledgement and its confirm, the review form, and focus after a failure', async ({ page }) => {
    test.setTimeout(180_000);
    const { stubs, traffic } = await installStubs(page, fx, { quiet: 'ok', apply: 'ok' });
    const main = promoteMain(page, 'prod');

    // A propagation problem: the acknowledgement takes focus, Space ticks it, and
    // Escape gives focus back to the button.
    const odd = (await spacesInListOrder(fx, 'prod')).at(-1) as ChangeOrderSpace;
    stubs.forced = (result) => mutateSpace(result, odd.spaceId, takesDifferently);
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'problem', { timeout: 45000 });
    await main.focus();
    await page.keyboard.press('Enter');
    const ack = statusBox(page).getByRole('checkbox');
    await expect(ack).toBeFocused();
    await page.keyboard.press('Space');
    await expect(ack).toBeChecked();
    await expect(confirmButton(page)).toHaveText(copy.confirmAnyway);
    await expect(confirmButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(confirmButton(page)).toHaveCount(0);
    await expect(main).toBeFocused();
    expect(traffic.applies).toEqual([]);

    // A failure: focus goes to the pill that says so.
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

    // The review form: Escape closes it onto Approve…, and Enter submits.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const mocks = await mockReviews(page, fx, 'partial');
    await openStage(page, fx, 'prod');
    const approve = statusBox(page).getByTestId('review-approve');
    await expect(approve).toBeVisible({ timeout: 45000 });
    await approve.focus();
    await page.keyboard.press('Enter');
    const reason = statusBox(page).getByTestId('review-reason');
    await expect(reason).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(statusBox(page).getByTestId('review-form')).toHaveCount(0);
    await expect(approve).toBeFocused();
    await page.keyboard.press('Enter');
    await reason.focus();
    await page.keyboard.type('Read the diff.');
    await page.keyboard.press('Enter');
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
  });

  /** No sideways scroll; the log fills the column under the change card at every width. */
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
    const log = await boxOf(page.getByTestId('stage-log'));
    const change = await boxOf(page.getByTestId('stage-change-card'));
    expect(log.y, `the log is below the change card at ${width}`).toBeGreaterThanOrEqual(change.y + change.height - 1);
    expect(near(log.x, change.x, 2) && near(log.width, change.width, 2), `the log and the change card share one column at ${width}`).toBe(true);
  }

  test('layout at 1440, 1000 and 400: one column, the log under the change card, nothing past the window', async ({ page }) => {
    await installStubs(page, fx, { quiet: 'ok' });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toBeVisible({ timeout: 45000 });
    for (const width of [1440, 1000, 400]) await checkLayout(page, width);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  /*
   * ONE CLICK WRITES ONLY WHAT THE LOG SHOWED. An answer older than a minute is
   * asked again at the click; the stub plans something new on every ask, so the
   * answer asked again plans something else. Nothing is written, the log shows
   * the new answer, and a second click promotes on it.
   */
  test('one click: a dry run asked again that plans something else writes nothing, and the next click promotes', async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    const { traffic } = await installStubs(page, fx, { quiet: 'ok', apply: 'ok' });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    const main = promoteMain(page, 'prod');
    await expect(main).toHaveAttribute('data-one-click', 'true');
    const asked = traffic.quiet.length;
    await page.clock.fastForward('01:05');
    await main.click();
    await expect.poll(() => traffic.quiet.length, { timeout: 15000 }).toBeGreaterThan(asked);
    await expect(page.locator('#announce')).toContainText(stageCardCopy.announce.planChanged('prod'), { timeout: 15000 });
    await expect(heading(page)).toBeFocused();
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready');
    await expect(confirmButton(page)).toHaveCount(0);
    expect(traffic.applies, 'a plan the reader did not see is not written').toEqual([]);

    await main.click();
    await expect.poll(() => traffic.applies.length, { timeout: 30000 }).toBe(1);
  });

  /*
   * NOTHING CAN BE PRESSED HALF-WAY, and A RELEASE THAT FAILS IN SOME SPACES is
   * published again in those Spaces only: the others already run the change, and
   * publishing them again is not a retry. A FIX SAVED OUTSIDE THE CHANGEORDER is
   * released from the card only by moving the release Tag to it first, after a
   * confirm that shows what it adopts. Last in the file, because it really
   * promotes and releases prod.
   */
  test('promote and release on prod: nothing live mid-action, Release again publishes only the Spaces that failed, and Release the fix moves the release Tag first', async ({ page }) => {
    test.setTimeout(360_000);
    const [ok1, gatedA, gatedB] = fx.spacesInStage('prod');
    const order = await hubApi.get(`/api/space/${fx.changeOrderSpaceId}/change_order/${fx.changeOrderId}`);
    expect(order.ok(), `read the ChangeOrder: ${order.status()}`).toBe(true);
    const read = (await order.json()) as Json & { ChangeOrder?: Json };
    const releaseTagId = String(read.ReleaseTagID ?? read.ChangeOrder?.ReleaseTagID ?? '');
    expect(releaseTagId, 'the ChangeOrder has a release Tag').not.toBe('');
    const fix = await installFixStubs(page, [gatedA, gatedB], releaseTagId);
    const { stubs, traffic } = await installStubs(page, fx, { releaseFailSpaceIds: [gatedA.spaceId, gatedB.spaceId] });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'ready', { timeout: 45000 });
    await expect(promoteMain(page, 'prod')).toHaveAttribute('data-one-click', 'true');
    await promoteMain(page, 'prod').click();
    await recordTimeline(page);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'promoted', { timeout: 120000 });
    let frames = await timeline(page);
    const before = frames.slice(0, frames.findIndex((f) => f.state === 'promoted'));
    expect(before.filter((f) => f.live), `a live button mid-promote: ${JSON.stringify(frames)}`).toEqual([]);

    await releaseMain(page, 'prod').click();
    await recordTimeline(page);
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'failed', { timeout: 120000 });
    frames = await timeline(page);
    const midRelease = frames.slice(0, frames.findIndex((f) => f.state === 'failed'));
    expect(midRelease.filter((f) => f.live), `a live button mid-release: ${JSON.stringify(frames)}`).toEqual([]);
    await expect(heading(page)).toHaveText('Release failed');
    await expect(logLine(page, 'log-promote-failed')).toContainText(`${copy.actionTo(true, 'prod')} ${copy.failedInOf(2, 3)}`);
    expect(new Set(traffic.releases)).toEqual(new Set([ok1.spaceId, gatedA.spaceId, gatedB.spaceId]));

    // Release again publishes the Revision the release Tag marks, so a gate on it fails again.
    const released = traffic.releases.length;
    const release = logLine(page, 'open-release');
    await expect(release).toContainText(copy.releaseAgainTo('prod'));
    await expect(page.getByTestId('release-fix-offer'), 'no fix has been saved').toHaveCount(0);
    await release.getByRole('button', { name: stageCardCopy.merge.releaseAgain }).click();
    await confirmButton(page).click();
    await expect.poll(() => traffic.releases.length, { timeout: 30000 }).toBeGreaterThanOrEqual(released + 2);
    await page.waitForTimeout(1000);
    expect(new Set(traffic.releases.slice(released)), 'only the Spaces whose release failed').toEqual(new Set([gatedA.spaceId, gatedB.spaceId]));
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'failed', { timeout: 120000 });

    // A fix saved after that in both Spaces, outside the ChangeOrder. After a reload the stage reads promoted.
    fix.on = true;
    await page.reload();
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'promoted', { timeout: 60000 });
    const offer = page.getByTestId('release-fix-offer');
    await expect(offer).toContainText('saved outside this ChangeOrder', { timeout: 30000 });
    await expect(offer).toContainText(`${gatedA.slug}/app`);
    await expect(offer).toContainText(`${gatedB.slug}/app`);
    const dialog = page.getByTestId('release-fix-confirm');
    const errorBox = dialog.getByTestId('release-fix-error');
    const openConfirm = async () => {
      fix.order = [];
      fix.moves = [];
      await offer.getByTestId('act-release-fix').click();
      await expect(dialog).toContainText(releaseFixCopy.title('prod'));
    };
    const closeConfirm = async () => {
      await dialog.getByRole('button', { name: releaseFixCopy.close }).click();
      await expect(dialog).toHaveCount(0);
    };

    await openConfirm();
    await expect(dialog.getByTestId('release-fix-outside')).toHaveText(releaseFixCopy.outside(2));
    await expect(dialog.getByTestId('release-fix-approval')).toContainText(releaseFixCopy.approval(2));
    await expect(dialog.getByTestId('release-fix-saved-by').first()).toContainText('Saved by Gate Fixer');
    await expect(dialog.getByTestId('release-fix-unit').first()).toContainText('v0.2.20');
    expect(fix.moves, 'nothing moves before Confirm').toEqual([]);
    await dialog.getByRole('button', { name: releaseFixCopy.cancel }).click();
    await expect(dialog).toHaveCount(0);

    // 0. Two fixed Units in A, and the move refused on one: the confirm says which moved, and A is not released.
    fix.withExtra = true;
    fix.refuseUnitIds = [fix.extra.unitId];
    await page.reload();
    await expect(offer).toContainText(`${gatedA.slug}/${fix.extra.slug}`, { timeout: 60000 });
    await openConfirm();
    fix.answer = { [gatedB.spaceId]: 'refused' };
    await dialog.getByTestId('release-fix-submit').click();
    await expect(errorBox).toContainText(
      releaseFixCopy.partlyMoved(gatedA.slug, [`${gatedA.slug}/app`], [`${gatedA.slug}/${fix.extra.slug}`], 'the revision has validation errors, so it could not be released'),
    );
    await expect(errorBox).toContainText(releaseFixCopy.notMoved(gatedB.slug, 'the revision has validation errors, so it could not be released'));
    expect(fix.order.filter((o) => o.startsWith('release:')), 'a Space with a Unit not moved is not released').toEqual([]);
    await closeConfirm();
    fix.withExtra = false;
    fix.refuseUnitIds = [];
    await page.reload();
    await expect(offer).not.toContainText(`${gatedA.slug}/${fix.extra.slug}`, { timeout: 60000 });
    await expect(offer).toContainText(`${gatedB.slug}/app`);

    // 1. Both moves refused: an error item each. Nothing is released.
    await openConfirm();
    fix.answer = { [gatedA.spaceId]: 'refused', [gatedB.spaceId]: 'refused' };
    await dialog.getByTestId('release-fix-submit').click();
    await expect(errorBox).toContainText(releaseFixCopy.notMoved(gatedA.slug, 'the revision has validation errors, so it could not be released'));
    await expect(errorBox).toContainText(releaseFixCopy.notMoved(gatedB.slug, 'the revision has validation errors, so it could not be released'));
    // The Spaces go in the card's order, which is not the fixture's.
    const moveOf = (space: ChangeOrderSpace) => fix.moves.find((m) => m.where.includes(`SpaceID = '${space.spaceId}'`));
    expect(new Set(fix.order), 'a refused move releases nothing').toEqual(new Set([`move:${gatedA.spaceId}`, `move:${gatedB.spaceId}`]));
    for (const space of [gatedA, gatedB]) {
      // The Revision the confirm showed, by number: a Revision saved since is never adopted unseen.
      expect(moveOf(space)).toEqual({
        where: `UnitID IN ('${fix.appUnitIds[space.spaceId]}') AND SpaceID = '${space.spaceId}'`,
        body: { TagID: releaseTagId, Revision: String(fix.heads[fix.appUnitIds[space.spaceId]]), Move: true },
      });
    }
    await closeConfirm();

    // 2. An answer without an item for the Unit sent: it is not counted as moved.
    await openConfirm();
    fix.answer = { [gatedA.spaceId]: 'noItem', [gatedB.spaceId]: 'noItem' };
    await dialog.getByTestId('release-fix-submit').click();
    await expect(errorBox).toContainText(releaseFixCopy.noAnswer([`${gatedA.slug}/app`]));
    await expect(errorBox).toContainText(releaseFixCopy.noAnswer([`${gatedB.slug}/app`]));
    expect(fix.order.filter((o) => o.startsWith('release:')), 'a Unit with no answer releases nothing').toEqual([]);
    await closeConfirm();

    // 3. Both moved, and the release after it fails: the confirm says the Tag moved and the release failed.
    await openConfirm();
    fix.answer = {};
    await dialog.getByTestId('release-fix-submit').click();
    await expect(errorBox).toContainText('The release failed:', { timeout: 60000 });
    await expect(errorBox).toContainText(new RegExp(`The release Tag moved in (${gatedA.slug} and ${gatedB.slug}|${gatedB.slug} and ${gatedA.slug})\\.`));
    expect(new Set(fix.order.slice(0, 2))).toEqual(new Set([`move:${gatedA.spaceId}`, `move:${gatedB.spaceId}`]));
    expect(new Set(fix.order.slice(2))).toEqual(new Set([`release:${gatedA.spaceId}`, `release:${gatedB.spaceId}`]));
    await closeConfirm();

    // 4. A moved and released, B refused (207 with an error item): the confirm says both.
    stubs.releaseFailSpaceIds = [];
    await openConfirm();
    fix.answer = { [gatedB.spaceId]: 'refused' };
    const partial = traffic.releases.length;
    await dialog.getByTestId('release-fix-submit').click();
    await expect(dialog.getByTestId('release-fix-released')).toHaveText(releaseFixCopy.releasedIn([gatedA.slug]), { timeout: 60000 });
    await expect(errorBox).toContainText(releaseFixCopy.notMoved(gatedB.slug, 'the revision has validation errors, so it could not be released'));
    expect(traffic.releases.slice(partial), 'only the Space whose Tag moved').toEqual([gatedA.spaceId]);
    await closeConfirm();

    // 5. B alone now; it moves, is released, and the confirm closes.
    await expect(offer).not.toContainText(`${gatedA.slug}/app`, { timeout: 60000 });
    await openConfirm();
    fix.answer = {};
    const last = traffic.releases.length;
    await dialog.getByTestId('release-fix-submit').click();
    await expect.poll(() => traffic.releases.length, { timeout: 30000 }).toBeGreaterThan(last);
    expect(fix.order, 'the release Tag moves, then the Space is released').toEqual([`move:${gatedB.spaceId}`, `release:${gatedB.spaceId}`]);
    expect(traffic.releases.slice(last), 'only the Space with the fix').toEqual([gatedB.spaceId]);
    await expect(dialog).toHaveCount(0, { timeout: 30000 });
    // Released, prod's work is done: the page moves on, on the bare address.
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}$`), { timeout: 120000 });
    await openStage(page, fx, 'prod');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'released', { timeout: 120000 });
  });
});
