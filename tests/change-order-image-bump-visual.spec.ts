// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/*
 * Screenshots of the ChangeOrder image bump: the list at 1100, 1280 and 1440,
 * and each detail state at 1280 and 1440.
 *
 * Not an assertion suite: it seeds ChangeOrders whose change has a known shape
 * (one image, several, a native sidecar, a digest pin, fields only, ...) and
 * photographs the list and each detail state, so a person can compare the
 * build with the design. It is skipped unless IMAGE_BUMP_VISUAL=1, because
 * seeding eight ChangeOrders is slow and the pictures prove nothing in CI.
 *
 *   IMAGE_BUMP_VISUAL=1 KEEP_SEED=1 npx playwright test tests/change-order-image-bump-visual.spec.ts \
 *     --retries=0 --workers=1 --output=test-results/pw-image-bump
 *
 * KEEP_SEED=1 keeps the seeded Spaces and writes their slugs to SEED_FILE; the
 * next run finds that file and only shoots, which is the fast loop while the UI
 * changes. Playwright empties its output directory at the start of a run, so
 * `--output` has to name a directory below test-results, or the seed file and
 * the screens are deleted before the run reads them.
 *
 * RESEED=1 deletes the kept seed and seeds again (each scenario takes eight
 * Spaces, and a local organization starts with a quota of 100). SEED_PREFIX=<p>
 * rebuilds a lost seed file from the Spaces of an earlier seed named <p>.
 * Without KEEP_SEED the seed is deleted at the end.
 *
 * IMAGE_BUMP_MIRROR_DIR=<dir> also copies every screen and fit report there.
 * Any Playwright run whose output directory is test-results empties it, so a
 * copy outside it is what lets one run's screens survive until the next.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';

import { type Page } from '@playwright/test';

import { buildChangeOrderFixture } from './fixtures/change-order-fixture';
import { ApiHelper } from './fixtures/api-helper';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

test.describe.configure({ mode: 'serial' });
test.skip(process.env.IMAGE_BUMP_VISUAL !== '1', 'Set IMAGE_BUMP_VISUAL=1 to seed and shoot the image bump screens.');

const SEED_FILE = 'test-results/image-bump-seed.json';
const SHOT_DIR = 'test-results/change-order-image-bump';
const WIDTHS = [1280, 1440] as const;
/** The list also at 1100: at 1275 and below the image change moves to the row's second line. */
const LIST_WIDTHS = [1100, 1280, 1440] as const;
const KEEP_SEED = process.env.KEEP_SEED === '1';
/** Where to copy each screen as well, when set. See the header. */
const MIRROR_DIR = process.env.IMAGE_BUMP_MIRROR_DIR;

/** Copy a file written to SHOT_DIR into MIRROR_DIR, when one is set. */
function mirror(path: string): void {
  if (!MIRROR_DIR) return;
  mkdirSync(MIRROR_DIR, { recursive: true });
  copyFileSync(path, `${MIRROR_DIR}/${path.split('/').pop()}`);
}

/** A Deployment in the shape the scenarios share; only its containers and spec fields vary. */
function deployment(name: string, body: { replicas?: number; init?: string; containers: string }): string {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
spec:
  replicas: ${body.replicas ?? 3}
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:
${body.init ? `      initContainers:\n${body.init}` : ''}      containers:
${body.containers}`;
}

/** One container entry, indented for `containers:` / `initContainers:`. */
function container(name: string, image: string, extra = ''): string {
  return `        - name: ${name}\n          image: ${image}\n${extra}`;
}

const DIGEST_A = 'sha256:9f2c0b7e1a6d3c55e2f9a0b4c8d71e3f6a2b5c9d0e4f7a1b3c6d8e2f5a9c41ab';
const DIGEST_B = 'sha256:77e0a3f9c2b84d1e6f5a7c0b9d3e2f8a1c4b6d9e0f2a5c7b8d1e3f6a9b0cc3d9';

interface ContentUnit {
  slug: string;
  before: string;
  after: string;
  toolchain?: string;
}

interface Scenario {
  key: string;
  description: string;
  /** One Unit, `app`: what a Deployment-only scenario gives. */
  before?: string;
  after?: string;
  /** Several Units, or a toolchain other than Kubernetes/YAML. */
  units?: ContentUnit[];
  /**
   * What the product must read out of the change, asserted on the list and on
   * the detail page: `image` (an image or version card), `none` (the "No image
   * change" note). Left unset for scenarios whose card is only photographed.
   */
  reads?: 'image' | 'none';
  /** Text the image card must contain. */
  heroText?: string[];
  /** Text the row's image-change cell must contain in the list. */
  listText?: string[];
  /** Text the row's image-change cell must not contain in the list. */
  listAbsent?: string[];
}

/** A settings document whose four changes look like versions and are not. */
const NEGATIVES = (apiVersion: string, resourceVersion: string, port: string, version: string): string =>
  `apiVersion: ${apiVersion}\nmetadata:\n  resourceVersion: "${resourceVersion}"\nport: ${port}\nversion: ${version}\n`;

const unitsOf = (scenario: Scenario): ContentUnit[] =>
  scenario.units ?? [{ slug: 'app', before: scenario.before ?? '', after: scenario.after ?? '' }];

const PAYMENTS_ENV = (level: string, memory: string) =>
  `          env:\n            - name: LOG_LEVEL\n              value: ${level}\n          resources:\n            limits:\n              memory: ${memory}\n`;

const SCENARIOS: Scenario[] = [
  {
    key: 'single',
    description: 'Release payments-api 1.15.0: idempotency keys for refunds.',
    before: deployment('payments-api', { containers: container('api', 'ghcr.io/acme/payments-api:1.14.2') }),
    after: deployment('payments-api', { containers: container('api', 'ghcr.io/acme/payments-api:1.15.0') }),
  },
  {
    key: 'multi',
    description: 'checkout 3.8.4 with its migration job, and the Envoy sidecar to 1.31.',
    before: deployment('checkout-web', {
      init:
        container('migrate-db', 'ghcr.io/acme/checkout-migrate:3.8.1') +
        container('envoy', 'docker.io/envoyproxy/envoy:v1.30.2', '          restartPolicy: Always\n'),
      containers: container('web', 'ghcr.io/acme/checkout-web:3.8.1'),
    }),
    after: deployment('checkout-web', {
      init:
        container('migrate-db', 'ghcr.io/acme/checkout-migrate:3.8.4') +
        container('envoy', 'docker.io/envoyproxy/envoy:v1.31.0', '          restartPolicy: Always\n'),
      containers: container('web', 'ghcr.io/acme/checkout-web:3.8.4'),
    }),
  },
  {
    key: 'many',
    description: 'October refresh of the observability agents.',
    before: deployment('otel-agent', {
      containers:
        container('collector', 'docker.io/otel/opentelemetry-collector-contrib:0.108.0') +
        container('logs', 'cr.fluentbit.io/fluent/fluent-bit:3.1.6') +
        container('node-exporter', 'quay.io/prometheus/node-exporter:v1.8.1') +
        container('ksm', 'registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.12.0') +
        container('reloader', 'quay.io/prometheus-operator/prometheus-config-reloader:v0.75.0'),
    }),
    after: deployment('otel-agent', {
      containers:
        container('collector', 'docker.io/otel/opentelemetry-collector-contrib:0.111.0') +
        container('logs', 'cr.fluentbit.io/fluent/fluent-bit:3.1.9') +
        container('node-exporter', 'quay.io/prometheus/node-exporter:v1.8.2') +
        container('ksm', 'registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.13.0') +
        container('reloader', 'quay.io/prometheus-operator/prometheus-config-reloader:v0.76.1'),
    }),
  },
  {
    key: 'sha',
    description: 'auth-gateway built from main at 81bd04e.',
    before: deployment('auth-gateway', { containers: container('gateway', 'ghcr.io/acme/auth-gateway:sha-3f9a1c2') }),
    after: deployment('auth-gateway', { containers: container('gateway', 'ghcr.io/acme/auth-gateway:sha-81bd04e') }),
  },
  {
    key: 'downgrade',
    description: 'Roll ledger-worker back to 2.8.4 after the 2.9.0 memory leak.',
    before: deployment('ledger-worker', { containers: container('worker', 'ghcr.io/acme/ledger-worker:2.9.0') }),
    after: deployment('ledger-worker', { containers: container('worker', 'ghcr.io/acme/ledger-worker:2.8.4') }),
  },
  {
    key: 'digest',
    description: 'Pin redis to the patched digest from the base image rebuild.',
    reads: 'image',
    listText: ['redis', '7.2.4', '@9f2c…41ab', '@77e0…c3d9'],
    before: deployment('redis', { replicas: 1, containers: container('cache', `docker.io/library/redis:7.2.4@${DIGEST_A}`) }),
    after: deployment('redis', { replicas: 1, containers: container('cache', `docker.io/library/redis:7.2.4@${DIGEST_B}`) }),
  },
  {
    key: 'none',
    description: 'More replicas and debug logging for the batch export.',
    before: deployment('export-api', {
      containers: container('api', 'ghcr.io/acme/export-api:2.3.0', PAYMENTS_ENV('info', '512Mi')),
    }),
    after: deployment('export-api', {
      replicas: 5,
      containers: container('api', 'ghcr.io/acme/export-api:2.3.0', PAYMENTS_ENV('debug', '512Mi')),
    }),
  },
  {
    key: 'mixed',
    description: 'payments-api 1.15.1, and more replicas and memory for the October sale.',
    before: deployment('payments-api', {
      containers: container('api', 'ghcr.io/acme/payments-api:1.15.0', PAYMENTS_ENV('info', '512Mi')),
    }),
    after: deployment('payments-api', {
      replicas: 5,
      containers: container('api', 'ghcr.io/acme/payments-api:1.15.1', PAYMENTS_ENV('debug', '768Mi')),
    }),
  },
  {
    key: 'version',
    description: 'confighub 0.8.23 for both the server and the UI stream.',
    reads: 'image',
    heroText: ['0.8.23'],
    listText: ['streams.stable.tag', 'in 2 Units'],
    listAbsent: ['field change'],
    units: [
      {
        slug: 'confighubai-confighub',
        toolchain: 'AppConfig/YAML',
        before: 'streams:\n  stable:\n    tag: v0.8.21\n',
        after: 'streams:\n  stable:\n    tag: v0.8.23\n',
      },
      {
        slug: 'confighubai-confighub-ui',
        toolchain: 'AppConfig/YAML',
        before: 'streams:\n  stable:\n    tag: v0.8.21\n',
        after: 'streams:\n  stable:\n    tag: v0.8.23\n',
      },
    ],
  },
  {
    /*
     * Four changes that look like versions and are not: an apiVersion, a
     * resourceVersion, a port-like number and a word in a `version` field.
     * None may read as an image or version change.
     */
    key: 'negatives',
    description: 'Move the report settings to apps/v2 and switch the release channel.',
    reads: 'none',
    listText: ['No image change', '4 field changes'],
    units: [{ slug: 'report-settings', toolchain: 'AppConfig/YAML', before: NEGATIVES('apps/v1', '1234', '1.2', 'latest'), after: NEGATIVES('apps/v2', '1235', '1.3', 'stable') }],
  },
  {
    /* The same four, and one real version change under `app:`: one card, and the four stay field changes. */
    key: 'negtag',
    description: 'Report settings 1.5.0, with the apps/v2 move and the stable channel.',
    reads: 'image',
    heroText: ['1.5.0'],
    listText: ['4 field changes'],
    units: [
      {
        slug: 'report-settings',
        toolchain: 'AppConfig/YAML',
        before: `${NEGATIVES('apps/v1', '1234', '1.2', 'latest')}app:\n  tag: 1.4.2\n`,
        after: `${NEGATIVES('apps/v2', '1235', '1.3', 'stable')}app:\n  tag: 1.5.0\n`,
      },
    ],
  },
  {
    key: 'helm',
    description: 'payments-api 1.15.0 through the chart values.',
    reads: 'image',
    heroText: ['payments-api', '1.15.0'],
    listText: ['payments-api'],
    listAbsent: ['field change', 'container'],
    units: [
      {
        slug: 'payments-values',
        toolchain: 'AppConfig/YAML',
        before: 'image:\n  repository: ghcr.io/acme/payments-api\n  tag: 1.14.2\nreplicaCount: 3\n',
        after: 'image:\n  repository: ghcr.io/acme/payments-api\n  tag: 1.15.0\nreplicaCount: 3\n',
      },
    ],
  },
];

interface SeededOrder {
  key: string;
  slug: string;
  path: string;
  changeOrderId: string;
  baseSpaceId: string;
  spaceIds: string[];
}

interface Seed {
  prefix: string;
  orders: SeededOrder[];
}

function readSeed(): Seed | undefined {
  if (!existsSync(SEED_FILE)) return undefined;
  return JSON.parse(readFileSync(SEED_FILE, 'utf8')) as Seed;
}

interface SpaceEntry {
  Space?: { SpaceID?: string; Slug?: string };
}

/** Every Space whose slug matches `pattern`, a SQL LIKE pattern. */
async function spacesLike(pattern: string): Promise<{ id: string; slug: string }[]> {
  const resp = await hubApi.get('/api/space', { params: { where: `Slug LIKE '${pattern}'` } });
  if (!resp.ok()) throw new Error(`Listing the Spaces like ${pattern}: ${resp.status()} ${await resp.text()}`);
  return ((await resp.json()) as SpaceEntry[])
    .map((entry) => ({ id: entry.Space?.SpaceID ?? '', slug: entry.Space?.Slug ?? '' }))
    .filter((space) => space.id !== '');
}

/** A seed file rebuilt from the Spaces an earlier seed named `prefix` left on the server. */
async function recoverSeed(prefix: string): Promise<Seed> {
  const spaces = await spacesLike(`${prefix}-%`);
  const orders: SeededOrder[] = [];
  for (const scenario of SCENARIOS) {
    const label = `${prefix}-${scenario.key}`;
    const base = spaces.find((space) => space.slug === `${label}-base`);
    if (!base) throw new Error(`No Space ${label}-base: the seed ${prefix} is incomplete; seed again with RESEED=1.`);
    const slug = `${label}-order`;
    const resp = await hubApi.get(`/api/space/${base.id}/change_order`, { params: { where: `Slug = '${slug}'` } });
    const found = ((await resp.json()) as { ChangeOrder?: { ChangeOrderID?: string } }[])[0]?.ChangeOrder?.ChangeOrderID;
    if (!found) throw new Error(`No ChangeOrder ${slug} in ${label}-base.`);
    orders.push({
      key: scenario.key,
      slug,
      path: `/change-orders/${encodeURIComponent(base.slug)}/${encodeURIComponent(slug)}`,
      changeOrderId: found,
      baseSpaceId: base.id,
      spaceIds: spaces.filter((space) => space.slug.startsWith(`${label}-`)).map((space) => space.id),
    });
  }
  return { prefix, orders };
}

/**
 * A complete seed already on the server, for when the seed file has been lost
 * (an emptied test-results): every earlier seed's `<prefix>-single-base` names
 * its prefix, and the first one whose ChangeOrders are all there is reused.
 */
async function findSeedOnServer(): Promise<Seed | undefined> {
  const bases = await spacesLike('ib%-single-base');
  const prefixes = bases
    .map((space) => /^(ib[a-z0-9]+)-single-base$/.exec(space.slug)?.[1])
    .filter((prefix): prefix is string => prefix !== undefined);
  for (const prefix of prefixes) {
    const found = await recoverSeed(prefix).catch(() => undefined);
    if (found) return found;
  }
  return undefined;
}

/**
 * Delete a seed's Spaces. Downstream Spaces name the base as their upstream, so
 * one pass in any order can leave some behind; three passes clear the chain.
 */
async function deleteSeed(api: ApiHelper, target: Seed): Promise<void> {
  const remaining = new Set(target.orders.flatMap((o) => o.spaceIds));
  for (let pass = 0; pass < 3 && remaining.size > 0; pass++) {
    for (const spaceId of [...remaining].reverse()) {
      await api
        .deleteSpace(spaceId, true)
        .then(() => remaining.delete(spaceId))
        .catch(() => undefined);
    }
  }
  if (remaining.size > 0) {
    console.warn(`[image-bump-visual] ${remaining.size} Space(s) of seed ${target.prefix} could not be deleted.`);
  }
}

/** True when every ChangeOrder of a saved seed still exists on this server. */
async function seedStillExists(seed: Seed): Promise<boolean> {
  // A seed from before a scenario was added lacks it; seed again.
  if (!SCENARIOS.every((scenario) => seed.orders.some((order) => order.key === scenario.key))) return false;
  for (const order of seed.orders) {
    const resp = await hubApi.get(`/api/space/${order.baseSpaceId}/change_order/${order.changeOrderId}`);
    if (!resp.ok()) return false;
  }
  return true;
}

async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * The whole page at `width`. The app scrolls inside its own container, so the
 * viewport is made as tall as the scrolled content, then put back.
 */
async function shoot(page: Page, name: string, width: number): Promise<string> {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.mouse.move(0, 0);
  await waitForFonts(page);
  // The page's own root, not the tallest scroller: the app shell has scroll
  // containers of its own that are taller than anything on this page.
  const height = await page.evaluate(() => {
    const root =
      document.getElementById('change-orders-root') ??
      document.querySelector<HTMLElement>('[data-testid="change-orders-console"]');
    if (root === null) return 900;
    return Math.ceil(root.getBoundingClientRect().top + root.scrollHeight + 24);
  });
  await page.setViewportSize({ width, height: Math.min(Math.max(900, height), 6000) });
  await page.waitForTimeout(500);
  const path = `${SHOT_DIR}/${name}-${width}.png`;
  await page.screenshot({ path, animations: 'disabled' });
  mirror(path);
  await page.setViewportSize({ width, height: 900 });
  return path;
}

/**
 * Until every list row's image change has loaded. A row fetches only once it
 * is near the screen, so each one is scrolled into view first.
 */
async function settleImageCells(page: Page): Promise<void> {
  const cells = page.getByTestId('change-order-image-change');
  const count = await cells.count();
  for (let i = 0; i < count; i++) await cells.nth(i).scrollIntoViewIfNeeded();
  await expect(page.locator('[data-testid="change-order-image-change"][data-status="loading"]')).toHaveCount(0, {
    timeout: 45000,
  });
  // Back to the top, in the window and in every container the app scrolls inside.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      if (element.scrollTop > 0) element.scrollTop = 0;
    }
  });
}

interface ClipReport {
  width: number;
  pageScrollWidth: number;
  innerWidth: number;
  /**
   * Buttons cut on the right: Refresh, and each row's action and menu. The
   * limit is the viewport or the nearest ancestor that clips, whichever is
   * nearer, because the app's own container can cut a button that is still inside the viewport.
   */
  buttonsOutside: { label: string; right: number; limit: number }[];
  /** The ChangeOrders console's own sideways overflow. */
  consoleScrollWidth: number;
  consoleClientWidth: number;
  /** Image tags and digests whose text does not fit their box. */
  clippedTags: { text: string; scrollWidth: number; clientWidth: number; slug: string }[];
  /** How the tags were found: by data-testid="image-change-tag", or by their text. */
  tagsFoundBy: 'testid' | 'text';
  tagsChecked: number;
  /** Role pills (init, sidecar) that are cut, or drawn past the box that clips them. A pill is never cut. */
  cutPills: { text: string; slug: string }[];
  pillsChecked: number;
  /** Field-change chips that are cut, or drawn past the box that clips them. */
  cutChips: { text: string; slug: string }[];
  chipsChecked: number;
  /** Not asserted: where each image line's first (old) and last (new) tag sits, to see whether the columns line up. */
  alignment: { slug: string; oldLeft: number; oldRight: number; newLeft: number }[];
  /** Not asserted: other text in the image cells cut by an ellipsis (role pills, names), for the reviewer. */
  truncatedOther: { text: string; slug: string }[];
}

/**
 * "Nothing is clipped" as pass or fail, not judgement. Measured at the
 * viewport the screen was taken at, after the screen is saved, and asserted
 * softly, so a failing check still leaves every screen behind. The figures
 * are written next to the screens, so a review can quote them.
 */
async function checkListFits(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(300);
  const report = await page.evaluate((viewportWidth): ClipReport => {
    const innerWidth = window.innerWidth;
    /** The right edge `el` is drawn up to: the viewport, or the nearest ancestor that clips sideways. */
    const visibleRight = (el: HTMLElement): number => {
      let limit = innerWidth;
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible') limit = Math.min(limit, a.getBoundingClientRect().right);
      }
      return limit;
    };
    const buttons = [
      ...Array.from(document.querySelectorAll<HTMLElement>('button')).filter((b) => b.textContent?.trim() === 'Refresh'),
      ...Array.from(document.querySelectorAll<HTMLElement>('[data-change-order-slug] button')),
    ];
    const buttonsOutside = buttons
      .map((b) => ({
        label: `${b.closest<HTMLElement>('[data-change-order-slug]')?.dataset.changeOrderSlug ?? 'header'}: ${b.getAttribute('aria-label') ?? b.textContent?.trim() ?? ''}`,
        right: Math.round(b.getBoundingClientRect().right),
        limit: Math.round(visibleRight(b)),
      }))
      .filter((b) => b.right > b.limit + 0.5);
    const consoleRoot = document.querySelector<HTMLElement>('[data-testid="change-orders-console"]');

    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="change-order-image-change"]'));
    let tags = cells.flatMap((cell) => Array.from(cell.querySelectorAll<HTMLElement>('[data-testid="image-change-tag"]')));
    const tagsFoundBy: 'testid' | 'text' = tags.length > 0 ? 'testid' : 'text';
    if (tags.length === 0) {
      // Until the cells carry the test id: the outermost element whose whole
      // text is one image tag or one digest.
      const looksLikeTag = /^(@\S+|v?\d[\w.+-]*|sha-\S+)$/;
      const candidates = cells.flatMap((cell) => Array.from(cell.querySelectorAll<HTMLElement>('*')));
      tags = candidates.filter(
        (el) =>
          looksLikeTag.test(el.textContent?.trim() ?? '') &&
          !looksLikeTag.test(el.parentElement?.textContent?.trim() ?? ''),
      );
    }
    const clippedTags = tags
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => ({
        text: el.textContent?.trim() ?? '',
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        slug: el.closest<HTMLElement>('[data-change-order-slug]')?.dataset.changeOrderSlug ?? '',
      }));
    const pills = cells
      .flatMap((cell) => Array.from(cell.querySelectorAll<HTMLElement>('*')))
      .filter((el) => el.children.length === 0 && /^(init|sidecar)$/.test(el.textContent?.trim() ?? ''));
    const cutPills = pills
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return el.scrollWidth > el.clientWidth + 1 || box.width < 1 || box.right > visibleRight(el) + 0.5;
      })
      .map((el) => ({
        text: el.textContent?.trim() ?? '',
        slug: el.closest<HTMLElement>('[data-change-order-slug]')?.dataset.changeOrderSlug ?? '',
      }));
    const chips = cells.flatMap((cell) =>
      Array.from(cell.querySelectorAll<HTMLElement>('[data-testid="image-change-field-chip"]')),
    );
    const cutChips = chips
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > visibleRight(el) + 0.5)
      .map((el) => ({
        text: el.textContent?.trim() ?? '',
        slug: el.closest<HTMLElement>('[data-change-order-slug]')?.dataset.changeOrderSlug ?? '',
      }));
    const alignment = cells.flatMap((cell) =>
      Array.from(cell.querySelectorAll<HTMLElement>('[data-testid="image-change-line"]')).flatMap((line) => {
        const sides = Array.from(line.querySelectorAll<HTMLElement>('[data-testid="image-change-tag"]'));
        if (sides.length < 2) return [];
        const oldBox = sides[0].getBoundingClientRect();
        const newBox = sides[sides.length - 1].getBoundingClientRect();
        return [
          {
            slug: cell.closest<HTMLElement>('[data-change-order-slug]')?.dataset.changeOrderSlug ?? '',
            oldLeft: Math.round(oldBox.left),
            oldRight: Math.round(oldBox.right),
            newLeft: Math.round(newBox.left),
          },
        ];
      }),
    );
    const tagSet = new Set(tags);
    const truncatedOther = cells
      .flatMap((cell) => Array.from(cell.querySelectorAll<HTMLElement>('*')))
      .filter(
        (el) =>
          !tagSet.has(el) &&
          getComputedStyle(el).textOverflow === 'ellipsis' &&
          el.scrollWidth > el.clientWidth + 1,
      )
      .map((el) => ({
        text: el.textContent?.trim() ?? '',
        slug: el.closest<HTMLElement>('[data-change-order-slug]')?.dataset.changeOrderSlug ?? '',
      }));
    return {
      width: viewportWidth,
      consoleScrollWidth: consoleRoot?.scrollWidth ?? 0,
      consoleClientWidth: consoleRoot?.clientWidth ?? 0,
      truncatedOther,
      cutPills,
      pillsChecked: pills.length,
      cutChips,
      chipsChecked: chips.length,
      alignment,
      pageScrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      buttonsOutside,
      clippedTags,
      tagsFoundBy,
      tagsChecked: tags.length,
    };
  }, width);

  const file = `${SHOT_DIR}/list-fit-${width}.json`;
  writeFileSync(file, JSON.stringify(report, null, 2));
  mirror(file);

  if (report.pageScrollWidth > report.innerWidth) {
    problem(`the page scrolls sideways at ${width}: ${report.pageScrollWidth} > ${report.innerWidth}`);
  }
  if (report.consoleScrollWidth > report.consoleClientWidth + 1) {
    problem(`the ChangeOrders console scrolls sideways at ${width}`);
  }
  if (report.buttonsOutside.length > 0) {
    problem(`buttons cut on the right at ${width}: ${JSON.stringify(report.buttonsOutside)}`);
  }
  if (report.tagsChecked === 0) problem(`no image tags were found to check at ${width}`);
  if (report.clippedTags.length > 0) problem(`image tags or digests cut at ${width}: ${JSON.stringify(report.clippedTags)}`);
  if (report.pillsChecked === 0) problem(`no role pills were found to check at ${width}`);
  if (report.cutPills.length > 0) problem(`role pills cut at ${width}: ${JSON.stringify(report.cutPills)}`);
  const newLefts = report.alignment.map((line) => line.newLeft);
  if (newLefts.length > 0 && Math.max(...newLefts) - Math.min(...newLefts) > 1) {
    problem(`the new image tag does not start at one x at ${width}: ${[...new Set(newLefts)].sort((a, b) => a - b).join(', ')}`);
  }
  if (report.cutChips.length > 0) problem(`field-change chips cut at ${width}: ${JSON.stringify(report.cutChips)}`);
}

/** Until the detail page has read the image change: the hero, the fields-only note, or the unavailable note. */
async function settleImageHero(page: Page): Promise<void> {
  await expect(
    page
      .getByTestId('change-order-image-hero')
      .or(page.getByTestId('change-order-no-image-change'))
      .or(page.getByTestId('change-order-image-changes-unavailable'))
      .first(),
  ).toBeVisible({ timeout: 45000 });
}

/** Until the page has stopped fetching: no loading marker and no progress bar. */
async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('change-orders-loading')).toHaveCount(0, { timeout: 45000 });
  await expect(page.locator('[role="progressbar"]')).toHaveCount(0, { timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
}

let seed: Seed | undefined;
let seededThisRun = false;

/**
 * Fit and read problems found on the list. They are collected, not thrown: a
 * serial run stops at the first failing test, which would leave the later
 * screens untaken. The last test fails on them, once everything is shot.
 */
const listProblems: string[] = [];
const problem = (message: string): void => {
  listProblems.push(message);
};

test.describe('ChangeOrder image bump: seed', () => {
  test.use({ storageState: 'authentication.json' });

  test('seed the scenarios (or reuse a kept seed)', async ({ browser }) => {
    test.setTimeout(900_000);
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(async () => (await hubApi.get('/api/space', { params: { limit: 1 } })).status(), {
        timeout: 60000,
        intervals: [1000],
      })
      .toBe(200);

    if (process.env.SEED_PREFIX) {
      seed = await recoverSeed(process.env.SEED_PREFIX);
      mkdirSync('test-results', { recursive: true });
      writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
      await context.close();
      return;
    }
    const kept = readSeed();
    if (kept && process.env.RESEED !== '1' && (await seedStillExists(kept))) {
      seed = kept;
      await context.close();
      return;
    }
    if (process.env.RESEED !== '1') {
      const onServer = await findSeedOnServer();
      if (onServer) {
        seed = onServer;
        mkdirSync('test-results', { recursive: true });
        writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
        await context.close();
        return;
      }
    }
    if (kept) await deleteSeed(new ApiHelper(page), kept);

    // A short run id, so one search finds this run's ChangeOrders and no others.
    const prefix = `ib${Date.now().toString(36).slice(-5)}`;
    const orders: SeededOrder[] = [];
    try {
      for (const scenario of SCENARIOS) {
        const fx = await buildChangeOrderFixture(page, {
          appLabel: `${prefix}-${scenario.key}`,
          releasable: false,
          workflow: 'no-health-check',
          content: { units: unitsOf(scenario), description: scenario.description },
        });
        orders.push({
          key: scenario.key,
          slug: fx.changeOrderSlug,
          path: fx.changeOrderPath,
          changeOrderId: fx.changeOrderId,
          baseSpaceId: fx.changeOrderSpaceId,
          spaceIds: [...new Set([...Object.values(fx.spaces).map((s) => s.spaceId), fx.workflowSpaceId, fx.changeOrderSpaceId])],
        });
      }
    } catch (error) {
      // A partial seed is worse than none: it holds Spaces against the quota
      // and its file would make the next run reuse it. Remove both.
      await deleteSeed(new ApiHelper(page), { prefix, orders });
      await context.close();
      throw error;
    }
    seed = { prefix, orders };
    seededThisRun = true;
    mkdirSync('test-results', { recursive: true });
    writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
    await context.close();
    expect(orders).toHaveLength(SCENARIOS.length);
  });
});

test.describe('ChangeOrder image bump: screens', () => {
  test.use({ storageState: 'authentication.json' });

  const order = (key: string): SeededOrder => {
    const found = seed?.orders.find((o) => o.key === key);
    if (!found) throw new Error(`No seeded ChangeOrder for "${key}"; the seed step did not run or failed.`);
    return found;
  };

  test.afterAll(async ({ browser }) => {
    if (KEEP_SEED || !seed || !seededThisRun) return;
    const context = await newAuthorizedContext(browser);
    await deleteSeed(new ApiHelper(await context.newPage()), seed);
    rmSync(SEED_FILE, { force: true });
    await context.close();
  });

  test('list, search-filtered to the seed', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/change-orders');
    await settle(page);
    await page.getByRole('searchbox', { name: /search changeorders/i }).fill(seed?.prefix ?? '');
    await expect(page.locator(`[data-change-order-slug^="${seed?.prefix}-"]`)).toHaveCount(SCENARIOS.length, {
      timeout: 45000,
    });
    for (const width of LIST_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await settle(page);
      await settleImageCells(page);
      // What each row must read, as the cell's own status: an image or version change, or none.
      for (const scenario of SCENARIOS) {
        if (!scenario.reads) continue;
        const cell = page
          .locator(`[data-change-order-slug="${order(scenario.key).slug}"]`)
          .getByTestId('change-order-image-change');
        const note = (what: string) => (error: unknown) =>
          problem(`${scenario.key} row ${what} at ${width}: ${String(error).split('\n')[0]}`);
        await expect(cell)
          .toHaveAttribute('data-status', scenario.reads === 'image' ? 'some' : 'none', { timeout: 5000 })
          .catch(note(`must be "${scenario.reads === 'image' ? 'some' : 'none'}"`));
        for (const text of scenario.listText ?? []) {
          await expect(cell).toContainText(text, { timeout: 5000 }).catch(note(`must read "${text}"`));
        }
        for (const text of scenario.listAbsent ?? []) {
          await expect(cell).not.toContainText(text, { timeout: 5000 }).catch(note(`must not read "${text}"`));
        }
      }
      await shoot(page, 'list', width);
      await checkListFits(page, width);
    }
  });

  test('list, a field-change chip hovered', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/change-orders');
    await settle(page);
    await page.getByRole('searchbox', { name: /search changeorders/i }).fill(seed?.prefix ?? '');
    await settleImageCells(page);
    const chip = page
      .locator(`[data-change-order-slug="${order('mixed').slug}"]`)
      .getByTestId('image-change-field-chip')
      .first();
    await chip.scrollIntoViewIfNeeded();
    await waitForFonts(page);
    await chip.hover();
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(300);
    mkdirSync(SHOT_DIR, { recursive: true });
    const path = `${SHOT_DIR}/list-hover-chip-1440.png`;
    await page.screenshot({ path });
    mirror(path);
  });

  test('list, a field chip hovered (version scenario)', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/change-orders');
    await settle(page);
    await page.getByRole('searchbox', { name: /search changeorders/i }).fill(seed?.prefix ?? '');
    await settleImageCells(page);
    const chip = page
      .locator(`[data-change-order-slug="${order('negtag').slug}"]`)
      .getByTestId('image-change-field-chip')
      .first();
    await chip.scrollIntoViewIfNeeded();
    await waitForFonts(page);
    await chip.hover();
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(300);
    mkdirSync(SHOT_DIR, { recursive: true });
    const path = `${SHOT_DIR}/list-hover-chip-version-1440.png`;
    await page.screenshot({ path });
    mirror(path);
  });

  /**
   * The detail states the design draws. `loads` is how "Full diff" must look on
   * load, asserted before anything is clicked: closed when the image change
   * says it all, open when there are field changes to read. Only `click` opens
   * it, so a wrong default can never be hidden by the spec.
   */
  const DETAIL_STATES: { name: string; key: string; loads?: 'open' | 'closed'; click?: boolean }[] = [
    { name: 'detail-single', key: 'single', loads: 'closed' },
    { name: 'detail-single-opened', key: 'single', loads: 'closed', click: true },
    { name: 'detail-multi', key: 'multi', loads: 'closed' },
    { name: 'detail-mixed', key: 'mixed', loads: 'open' },
    { name: 'detail-none', key: 'none', loads: 'open' },
    { name: 'detail-many', key: 'many' },
    { name: 'detail-sha', key: 'sha' },
    { name: 'detail-downgrade', key: 'downgrade' },
    { name: 'detail-digest', key: 'digest' },
    { name: 'detail-version', key: 'version', loads: 'closed' },
    { name: 'detail-negatives', key: 'negatives', loads: 'open' },
    { name: 'detail-negtag', key: 'negtag', loads: 'open' },
    { name: 'detail-helm', key: 'helm' },
  ];

  for (const state of DETAIL_STATES) {
    test(state.name, async ({ page }) => {
      test.setTimeout(180_000);
      // A crashed page shows only "Something went wrong"; keep the error it threw.
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(order(state.key).path);
      // The ChangeOrder's own name is the one thing every version of the page shows.
      try {
        await expect(page.getByText(order(state.key).slug, { exact: true }).first()).toBeVisible({ timeout: 45000 });
      } catch (error) {
        if (pageErrors.length === 0) throw error;
        throw new Error(`The page did not render; it threw: ${pageErrors.join(' | ')}`, { cause: error });
      }
      await settle(page);
      await settleImageHero(page);
      const scenario = SCENARIOS.find((candidate) => candidate.key === state.key);
      // What the page must read out of the change, before anything is judged by eye.
      if (scenario?.reads === 'image') {
        const hero = page.getByTestId('change-order-image-hero');
        await expect(hero, `${state.key} must show an image or version card`).toBeVisible();
        for (const text of scenario.heroText ?? []) {
          await expect(hero, `the ${state.key} card must name ${text}`).toContainText(text);
        }
        await expect(page.getByTestId('change-order-no-image-change')).toHaveCount(0);
      }
      if (scenario?.reads === 'none') {
        await expect(
          page.getByTestId('change-order-no-image-change'),
          `${state.key} must read as "No image change"`,
        ).toBeVisible();
        await expect(page.getByTestId('change-order-image-hero'), `${state.key} must show no image or version card`).toHaveCount(0);
      }
      const fullDiff = page.getByTestId('change-order-full-diff');
      const toggle = fullDiff.locator('[aria-expanded]').first();
      if (state.loads) {
        const expanded = state.loads === 'open' ? 'true' : 'false';
        await expect(fullDiff, `Full diff must load ${state.loads}`).toHaveAttribute('data-expanded', expanded);
        await expect(toggle).toHaveAttribute('aria-expanded', expanded);
      }
      if (state.click) {
        await toggle.click();
        await expect(fullDiff).toHaveAttribute('data-expanded', 'true');
        await settle(page);
      }
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await settle(page);
        await shoot(page, state.name, width);
      }
    });
  }

  /** Last, so a problem never stops a screen from being taken. */
  test('list: fit and read problems', async () => {
    expect(listProblems, 'what the list got wrong, across every width').toEqual([]);
  });
});
