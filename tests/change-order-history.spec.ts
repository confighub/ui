// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeOrder History card, on the ChangeOrder detail page, against mocked API
 * data: every API request is answered here, so the records can hold each case
 * the card must draw — a joined override, every failure Action, the 32-Unit
 * overflow, a cut error, Releases with and without a publisher, Automation,
 * an unknown user, an empty ChangeOrder and a large one.
 *
 * The session is a stand-in token in sessionStorage, as no request reaches a
 * server. Time is fixed, so "Today" and "42 min ago" are stable.
 *
 * The card shows times in the viewer's time zone, with UTC on hover. The zone is
 * fixed to London in summer (BST, UTC+1), not UTC, so a time that reads in UTC
 * fails here. None of these records sits near midnight, so the days are the
 * same in either zone; the day boundary is covered in change-order-history.pure.spec.ts.
 */

import { expect, test, type Page, type Route } from '@playwright/test';

const NOW = '2026-10-06T15:40:00Z';
const ZERO = '00000000-0000-0000-0000-000000000000';

const ORG = 'a0000000-0000-4000-8000-000000000001';
const USER = {
  priya: 'b0000000-0000-4000-8000-000000000001',
  marco: 'b0000000-0000-4000-8000-000000000002',
  ana: 'b0000000-0000-4000-8000-000000000003',
  gone: 'b0000000-0000-4000-8000-000000000009',
};
const USERS = [
  { UserID: USER.priya, DisplayName: 'Priya Raman', Slug: 'priya' },
  { UserID: USER.marco, DisplayName: 'Marco Lindqvist', Slug: 'marco' },
  { UserID: USER.ana, DisplayName: 'Ana Okafor', Slug: 'ana' },
];

const SPACES: Record<string, { id: string; stage: string }> = {
  'checkout-base': { id: 'c0000000-0000-4000-8000-000000000000', stage: 'base' },
  'checkout-dev': { id: 'c0000000-0000-4000-8000-000000000001', stage: 'dev' },
  'checkout-dev-sandbox': { id: 'c0000000-0000-4000-8000-000000000002', stage: 'dev' },
  'checkout-staging': { id: 'c0000000-0000-4000-8000-000000000003', stage: 'staging' },
  'checkout-prod-us-east': { id: 'c0000000-0000-4000-8000-000000000004', stage: 'prod' },
  'checkout-prod-us-west': { id: 'c0000000-0000-4000-8000-000000000005', stage: 'prod' },
  'checkout-prod-eu-west': { id: 'c0000000-0000-4000-8000-000000000006', stage: 'prod' },
  'checkout-prod-ap-south': { id: 'c0000000-0000-4000-8000-000000000007', stage: 'prod' },
};
const sid = (slug: string) => SPACES[slug].id;

const CHANGE_ORDER_ID = 'd0000000-0000-4000-8000-000000000001';
const SLUG = 'checkout-api-1-8-0';

const LONG_ERROR =
  'admission webhook "validate.kyverno.svc-fail" denied the request:\n' +
  'resource Deployment/checkout/checkout-api was blocked due to the following policies\n' +
  `require-pod-resources: ${'validation error: CPU and memory resource requests and limits are required. '.repeat(40)}`.slice(0, 2048) +
  '...';

/** 32 recorded Unit errors and the server's placeholder for the ones it did not record. */
function overflowingUnits() {
  const units: { UnitID?: string; Slug?: string; Error: string }[] = [
    { UnitID: 'e0000000-0000-4000-8000-000000000000', Slug: 'checkout-api-deployment', Error: LONG_ERROR },
  ];
  for (let i = 1; i < 32; i++) {
    units.push({
      UnitID: `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      Slug: `checkout-tenant-${100 + i}-config`,
      Error: `merge conflict at spec.tenants[${100 + i}].paymentProvider`,
    });
  }
  units.push({ Error: 'more units failed than are recorded' });
  return units;
}

interface Records {
  Promotions: object[];
  PromotionOverrides: object[];
  PromotionFailures: object[];
  /** Releases the Release list returns for this ChangeOrder. */
  releases: object[];
  createdAt: string;
}

const TYPICAL: Records = {
  createdAt: '2026-09-14T09:02:00Z',
  Promotions: [
    { UserID: USER.gone, PromotedAt: '2026-09-14T09:15:20Z', Stage: 'dev', SpaceIDs: [sid('checkout-dev')] },
    { UserID: USER.ana, PromotedAt: '2026-10-05T16:05:10Z', Stage: 'staging', SpaceIDs: [sid('checkout-staging')] },
    { UserID: USER.priya, PromotedAt: '2026-10-06T11:20:04Z', Stage: 'prod', SpaceIDs: [sid('checkout-prod-us-east')] },
    { UserID: USER.marco, PromotedAt: '2026-10-06T14:58:12Z', Stage: 'prod', SpaceIDs: [sid('checkout-prod-eu-west')] },
  ],
  PromotionOverrides: [
    {
      UserID: USER.marco,
      OverriddenAt: '2026-10-06T14:58:09Z',
      Stage: 'prod',
      SpaceIDs: [sid('checkout-prod-eu-west'), sid('checkout-prod-ap-south')],
      Reason: 'EU checkout is down (INC-2291). This change is the fix and must reach eu-west now.',
      FailedGates: ['Healthy: checkout-staging is Degraded'],
    },
  ],
  PromotionFailures: [
    {
      UserID: USER.gone,
      FailedAt: '2026-09-14T09:15:21Z',
      Stage: 'dev',
      Spaces: [
        {
          SpaceID: sid('checkout-dev-sandbox'),
          SpaceSlug: 'checkout-dev-sandbox',
          Stage: 'dev',
          Action: 'Failed',
          Error: 'space checkout-dev-sandbox is not a variant of checkout-base',
        },
      ],
    },
    {
      UserID: USER.priya,
      FailedAt: '2026-10-05T17:44:31Z',
      Stage: 'prod',
      Spaces: [
        {
          SpaceID: sid('checkout-prod-us-west'),
          SpaceSlug: 'checkout-prod-us-west',
          Stage: 'prod',
          Action: 'Promote',
          Units: overflowingUnits(),
          Links: [{ LinkID: 'f0000000-0000-4000-8000-000000000001', Slug: 'api-to-redis', Error: 'needs value redis.host' }],
        },
        {
          SpaceID: sid('checkout-prod-eu-west'),
          SpaceSlug: 'checkout-prod-eu-west',
          Stage: 'prod',
          Action: 'Blocked',
          Reason: 'Takes from checkout-prod-us-west, which has not received the change yet.',
        },
      ],
    },
  ],
  releases: [
    release(1, 7, 'checkout-dev', '2026-09-14T09:31:00Z', undefined),
    release(2, 9, 'checkout-staging', '2026-10-05T16:31:40Z', USER.ana),
    release(3, 12, 'checkout-prod-us-east', '2026-10-06T11:31:15Z', USER.priya),
    release(4, 14, 'checkout-prod-eu-west', '2026-10-06T15:12:48Z', ZERO),
  ],
};

const EMPTY: Records = {
  createdAt: '2026-10-06T14:20:00Z',
  Promotions: [],
  PromotionOverrides: [],
  PromotionFailures: [],
  releases: [],
};

function release(n: number, num: number, space: string, createdAt: string, userId: string | undefined) {
  return {
    ReleaseID: `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    ReleaseNum: num,
    SpaceID: sid(space),
    SpaceSlug: space,
    CreatedAt: createdAt,
    ChangeOrderID: CHANGE_ORDER_ID,
    Published: true,
    ...(userId === undefined ? {} : { UserID: userId }),
  };
}

/** Twelve working days, a Release burst each day, and one override on an old day. */
function scale(): Records {
  const out: Records = { createdAt: '2026-09-20T08:00:00Z', Promotions: [], PromotionOverrides: [], PromotionFailures: [], releases: [] };
  let n = 100;
  for (let d = 0; d < 12; d++) {
    const day = new Date(Date.parse('2026-10-06T00:00:00Z') - d * 86_400_000).toISOString().slice(0, 10);
    out.Promotions.push({ UserID: USER.ana, PromotedAt: `${day}T09:00:00Z`, Stage: 'prod', SpaceIDs: [sid('checkout-prod-us-east')] });
    out.Promotions.push({ UserID: USER.marco, PromotedAt: `${day}T10:00:00Z`, Stage: 'staging', SpaceIDs: [sid('checkout-staging')] });
    for (let i = 0; i < 5; i++) {
      out.releases.push(release(n++, 200 + n, 'checkout-prod-us-west', `${day}T02:0${i}:00Z`, ZERO));
    }
  }
  out.PromotionOverrides.push({
    UserID: USER.marco,
    OverriddenAt: '2026-10-01T18:22:00Z',
    Stage: 'prod',
    SpaceIDs: [sid('checkout-prod-ap-south')],
    Reason: 'Card-scheme deadline at 19:00 UTC.',
    FailedGates: ['Validated: checkout-staging has no attestation'],
  });
  // On a day not yet loaded: its count shows before the day is.
  out.PromotionFailures.push({
    UserID: USER.ana,
    FailedAt: '2026-09-26T15:00:00Z',
    Stage: 'prod',
    Spaces: [{ SpaceID: sid('checkout-prod-us-west'), SpaceSlug: 'checkout-prod-us-west', Action: 'Failed' }],
  });
  return out;
}

function changeOrder(records: Records) {
  return {
    ChangeOrder: {
      ChangeOrderID: CHANGE_ORDER_ID,
      SpaceID: sid('checkout-base'),
      SpaceSlug: 'checkout-base',
      Slug: SLUG,
      DisplayName: SLUG,
      CreatedAt: records.createdAt,
      Stage: 'prod',
      State: 'Resolved',
      InScopeSpaceIDs: Object.values(SPACES).map((s) => s.id),
      ChangeWorkflow: {
        Stages: ['dev', 'staging', 'prod'].map((name) => ({ Name: name, WhereSpace: `Labels.Stage = '${name}'` })),
      },
      Promotions: records.Promotions,
      PromotionOverrides: records.PromotionOverrides,
      PromotionFailures: records.PromotionFailures,
      Releases: [{ SpaceID: sid('checkout-prod-us-east'), ReleaseID: (records.releases[2] as { ReleaseID?: string } | undefined)?.ReleaseID, ReleaseNum: 12 }].filter(
        (r) => r.ReleaseID !== undefined,
      ),
    },
    Space: { SpaceID: sid('checkout-base'), Slug: 'checkout-base' },
  };
}

function spaceRows(where: string | null) {
  const stage = where?.match(/Labels\.Stage = '([^']+)'/)?.[1];
  return Object.entries(SPACES)
    .filter(([, s]) => stage === undefined || s.stage === stage)
    .map(([slug, s]) => ({
      Space: { SpaceID: s.id, Slug: slug, DisplayName: slug, OrganizationID: ORG, Labels: { Stage: s.stage } },
    }));
}

function b64(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function mockApi(page: Page, records: Records): Promise<void> {
  const token = `${b64({ alg: 'none' })}.${b64({ exp: 4102444800, sub: USER.priya })}.x`;
  await page.addInitScript((accessToken) => {
    sessionStorage.setItem('confighub_session', JSON.stringify({ accessToken, organizationId: 'org', idpClaims: {} }));
  }, token);
  await page.clock.setFixedTime(new Date(NOW));

  // Nothing leaves the machine. index.html loads its fonts from Google, and page.goto waits for
  // the load event, so one slow font request held a test until its 60 s timeout. The app falls
  // back to its system fonts.
  await page.route(
    (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    (route) => route.abort('blockedbyclient'),
  );

  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const where = url.searchParams.get('where');
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const path = url.pathname;
    if (path === '/api/me') return json({ UserID: USER.priya, DisplayName: 'Priya Raman', ExternalOrganizationID: 'org' });
    if (path === '/api/change_order') return json([changeOrder(records)]);
    if (path === `/api/space/${sid('checkout-base')}/change_order/${CHANGE_ORDER_ID}`) return json(changeOrder(records));
    if (path === '/api/space') return json(spaceRows(where));
    if (path === '/api/user') {
      const ids = new Set([...(where ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
      return json(USERS.filter((u) => ids.has(u.UserID)).map((User) => ({ User })));
    }
    if (path === '/api/release') {
      if (where?.startsWith('ChangeOrderID')) return json(records.releases.map((Release) => ({ Release })));
      if (where?.startsWith('ReleaseID IN')) {
        return json(records.releases.filter((r) => where.includes((r as { ReleaseID: string }).ReleaseID)).map((Release) => ({ Release })));
      }
      return json([]);
    }
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '{}' });
    if (path === '/api/info') return json({});
    return json([]);
  });
}

async function openChangeOrder(page: Page, records: Records) {
  await mockApi(page, records);
  await page.goto(`/change-orders/${SLUG}`);
  const card = page.getByRole('region', { name: 'ChangeOrder history' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  return card;
}

test.describe('ChangeOrder history', () => {
  test.use({ timezoneId: 'Europe/London', locale: 'en-GB' });

  test('joins one promote action and says that it is a match', async ({ page }) => {
    const card = await openChangeOrder(page, TYPICAL);
    // 4 promotions + 1 override + 2 failures + 4 Releases = 11 records. The override joins Marco's
    // promotion, and the dev failure joins the dev promotion: 9 entries.
    await expect(card.locator('[data-history-count]')).toHaveText('9 entries from 11 records, newest first');
    await expect(card.getByText('Records of one promote action are matched by person, Stage and time')).toBeVisible();
    // Newest first, grouped by day, and the ChangeOrder opened entry closes the list.
    await expect(card.locator('[data-history-day]')).toHaveText([/^Today, Tue 6 Oct/, /^Yesterday, Mon 5 Oct/, /^Mon 14 Sep/]);
    await expect(card.locator('[data-history-entry="opened"]')).toContainText('ChangeOrder opened');
  });

  test('an override shows its Reason, failing gates and the reach of each listed Space', async ({ page }) => {
    const card = await openChangeOrder(page, TYPICAL);
    const override = card.locator('[data-history-entry="override"]');
    await expect(override).toHaveCount(1);
    await expect(override).toHaveAttribute('aria-label', /^Override by Marco Lindqvist into prod, Tue 6 Oct 2026, 15:58 BST$/);
    // The entry's time reads in the viewer's zone, and its hover tooltip gives UTC.
    const time = override.locator(':scope > time');
    await expect(time).toHaveText('15:58');
    await expect(time).toHaveAttribute('datetime', '2026-10-06T14:58:09.000Z');
    await time.hover();
    await expect(page.getByRole('tooltip')).toHaveText('6 Oct 2026, 14:58:09 UTC');
    await expect(override).toContainText('forced a promotion into');
    await expect(override).toContainText('past 1 failing gate');
    await expect(override).toContainText('1 of 2 listed Spaces written');
    // Newest day: the exception opens with its detail showing.
    await expect(override.locator('[data-history-reason]')).toContainText('EU checkout is down (INC-2291)');
    await expect(override).toContainText('Healthy: checkout-staging is Degraded');
    await expect(override.locator('[data-history-reach="written"]')).toContainText('checkout-prod-eu-west');
    await expect(override.locator('[data-history-reach="written"]')).toContainText('Written in this promotion');
    const noRecord = override.locator('[data-history-reach="no-record"]');
    await expect(noRecord).toContainText('checkout-prod-ap-south');
    await expect(noRecord).toContainText('No record. It may not have been reached.');
    await expect(override).toContainText(
      'Matched from 2 records (override, promotion) by person and Stage: the promotion was written at most 60 s after the override.',
    );
    await expect(card).not.toContainText(/not reached/i);
  });

  test('a failure states one headline for each Action, the overflow row and the cut error', async ({ page }) => {
    const card = await openChangeOrder(page, TYPICAL);
    const failure = card.locator('[data-history-entry="failure"]').filter({ hasText: 'Priya Raman' });
    await expect(failure.locator('[data-history-sentence]')).toHaveText(['ran a promotion of 2 Spaces into', '2 had failures.']);
    await expect(failure).toContainText('prod.');

    const partial = failure.locator('[data-history-failure-space="checkout-prod-us-west"]');
    await expect(partial.locator('[data-history-headline]')).toHaveText('Some Units failed. Other Units were written.');
    await expect(partial).not.toContainText(/none was written|nothing was written/i);
    await expect(partial).toContainText('Unit errors · 32 recorded, more failed');
    await expect(partial.locator('[data-history-overflow]')).toContainText('More Units failed than are recorded.');
    await expect(partial.getByRole('button', { name: 'Show 29 more recorded Units' })).toBeVisible();
    await partial.getByRole('button', { name: 'Show 29 more recorded Units' }).click();
    await expect(partial.getByText('checkout-tenant-131-config')).toBeVisible();
    await expect(partial).toContainText('Link errors · 1');

    // The long error is clamped until it is opened, and says it was cut.
    const showFull = partial.getByRole('button', { name: 'Show full error' }).first();
    await expect(showFull).toHaveAttribute('aria-expanded', 'false');
    await expect(partial.getByText('ConfigHub cut this error at 2048 characters.')).toBeVisible();
    const longError = partial.locator('[data-history-error]').first();
    await expect(longError).toHaveText(LONG_ERROR);
    await showFull.click();
    await expect(partial.getByRole('button', { name: 'Show less' }).first()).toHaveAttribute('aria-expanded', 'true');

    const blocked = failure.locator('[data-history-failure-space="checkout-prod-eu-west"]');
    await expect(blocked.locator('[data-history-headline]')).toHaveText(
      'Blocked: Takes from checkout-prod-us-west, which has not received the change yet.',
    );

    // The dev failure is on the oldest day, which is drawn in full in a small ChangeOrder.
    const failed = card.locator('[data-history-entry="failure"]').filter({ hasText: 'Unknown user' });
    await expect(failed).toBeVisible();
    await expect(failed.locator('[data-history-sentence]')).toHaveText(['promoted 1 Space into', '1 more had failures.']);
    await expect(failed).toContainText('dev.');
    await failed.getByRole('button', { name: 'Space, Unit and Link errors' }).click();
    await expect(failed).toContainText('the promotion and the failure were written within 2 s of each other.');
    await expect(failed).not.toContainText('60 s');
    await expect(failed.locator('[data-history-failure-space="checkout-dev-sandbox"] [data-history-headline]')).toHaveText(
      'Could not be planned. Nothing was written to this Space.',
    );
  });

  test('people: you, Automation, an unknown user, and a Release with no recorded publisher', async ({ page }) => {
    const card = await openChangeOrder(page, TYPICAL);
    const releases = card.locator('[data-history-entry="release"]');
    const rel12 = releases.filter({ hasText: 'rel-12' });
    await expect(rel12).toContainText('Priya Raman');
    await expect(rel12.getByText('You', { exact: true })).toBeVisible();
    await expect(rel12).toContainText('checkout-prod-us-east');
    const rel14 = releases.filter({ hasText: 'rel-14' });
    await expect(rel14).toContainText('Automation');
    await expect(rel14.getByText('Auto', { exact: true })).toBeVisible();

    await expect(card.locator('[data-history-person="unknown"]').first()).toContainText('Unknown user');
    await expect(card).not.toContainText(/former user/i);

    // rel-7 is on the oldest day. A small ChangeOrder folds no day, so it shows without a click.
    await expect(card.locator('[data-history-folded]')).toHaveCount(0);
    const rel7 = releases.filter({ hasText: 'rel-7' });
    await expect(rel7).toContainText('Publisher not recorded');
    await expect(rel7).toContainText('This Release was published before ConfigHub recorded who publishes Releases.');
    await expect(card.locator('[data-history-entry="opened"]')).toContainText('ChangeOrder opened');

    // The summary card's Last activity: the newest promote action, which was forced.
    const last = page.locator('[data-last-activity]');
    await expect(last).toContainText('Marco Lindqvist');
    await expect(last).toContainText('42 min ago');
    await expect(last.getByText('Forced', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'ChangeOrder history' })).not.toContainText(/\b(YOU|AUTO|FORCED)\b/);
    await expect(last).not.toContainText('FORCED');
  });

  test('a large ChangeOrder folds older days and Release runs, and never folds an override', async ({ page }) => {
    const card = await openChangeOrder(page, scale());
    // Six days are shown; the rest wait behind "Show earlier days".
    await expect(card.locator('[data-history-day]')).toHaveCount(6);
    await expect(card.getByRole('button', { name: 'Show 6 earlier days' })).toBeVisible();
    await expect(card.locator('[data-history-hidden-exceptions]')).toHaveText('1 failure in earlier days.');
    // The two newest days are drawn in full, with each day's five Automation Releases as one row.
    const today = card.locator('[data-history-entry="release-run"]').first();
    await expect(today).toContainText('Automation');
    await expect(today).toContainText('5 Releases');
    await expect(today).toContainText('03:00 to 03:04');
    await today.getByRole('button', { name: 'Show each Release' }).click();
    await expect(today.locator('li')).toHaveCount(5);
    // Older days fold their routine entries; the folded row holds the only control.
    await expect(card.locator('[data-history-folded]')).toHaveCount(4);
    await expect(card.locator('[data-history-day]').nth(2).getByRole('button')).toHaveCount(0);
    await expect(card.locator('[data-history-folded]').first().getByRole('button', { name: 'Show them' })).toBeVisible();
    // The override on 1 Oct stays on screen in its folded day.
    const override = card.locator('[data-history-entry="override"]');
    await expect(override).toBeVisible();
    await expect(override).toContainText('Marco Lindqvist');
    await card.getByRole('button', { name: 'Show 6 earlier days' }).click();
    await expect(card.locator('[data-history-day]')).toHaveCount(12);
    await expect(card.locator('[data-history-entry="opened"]')).toBeVisible();
    // The card has no retention or time-zone note (the times keep their UTC tooltip).
    await expect(card.getByRole('note')).toHaveCount(0);
  });

  test('an empty ChangeOrder says no promotions yet', async ({ page }) => {
    const card = await openChangeOrder(page, EMPTY);
    await expect(card.locator('[data-history-empty]')).toContainText('No promotions yet');
    await expect(card.locator('[data-history-kind]')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'ChangeOrder summary' })).toContainText('No promotions yet');
  });
});
