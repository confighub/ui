// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * Reviews in the ChangeOrder detail view: the six design states, and the decide →
 * confirm → record flow.
 *
 * A REAL CHANGEORDER, MOCKED REVIEWS. The fixture builds a real three-stage ChangeOrder
 * (`no-health-check`, so nothing but reviews holds a stage) and promotes `dev`
 * and `staging`, so `prod` is next and its entry gate is evaluated over the two
 * `staging` Spaces. That gate approves the change in staging, so its review is on
 * the `staging` card, beside that change; the `prod` card shows only the gate's
 * state and the way to it. The routes below then:
 *
 *   - add two attestation prerequisites to `prod` in the ChangeOrder's frozen
 *     workflow copy (`security-review`: 2 approvals from a group;
 *     `qa-signoff`: 1 approval from one named person),
 *   - answer `GET /api/attestation` with the records of the state under test,
 *   - answer the `/api/attest` dry run with what a decision would cover,
 *   - answer the promote dry run for `prod` with the server's gate verdicts,
 *   - name the made-up reviewers in `GET /api/user`,
 *   - and, for every state but "author", sign the page in as a made-up
 *     reviewer (`GET /api/me`), because the real test user promoted the
 *     change and is its author.
 *
 * Every other request reaches the server (`route.fallback()`).
 *
 * Screenshots of every state at 1440 and 1000 px go to
 * `test-results/change-order-reviews/<state>-<width>.png`. They are for a person to
 * compare with the design; nothing here compares pixels.
 */
import { mkdirSync } from 'fs';

import { type Locator, type Page, type Request } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { type ChangeOrderFixture, buildChangeOrderFixture } from './fixtures/change-order-fixture';

test.describe.configure({ mode: 'serial' });

const SHOT_DIR = 'test-results/change-order-reviews';
const PROD = 'prod';
const PURPLE = 'rgb(153, 81, 244)'; // componentTheme.done: Promote, and "Go to promote" only
const PURPLE_HOVER = 'rgb(78, 26, 150)'; // componentTheme.doneEmphasis
const DANGER = 'rgb(173, 43, 43)'; // changeOrderStatus.danger
const DANGER_LINE = 'rgb(238, 197, 197)'; // changeOrderStatus.dangerLine
const INK = 'rgb(25, 29, 35)'; // changeOrderInk.default
const BORDER_STRONG = 'rgb(205, 210, 218)'; // changeOrderBorder.strong
const CARD = 'rgb(255, 255, 255)'; // changeOrderSurface.card

/** Approve and "Review now": outlined, neutral ink, the strong border, no fill. */
async function expectOutlinedNeutral(button: Locator): Promise<void> {
  await expect(button).toHaveCSS('background-color', CARD);
  await expect(button).toHaveCSS('color', INK);
  await expect(button).toHaveCSS('border-top-color', BORDER_STRONG);
}

/** Reject: outlined, danger ink, the danger line border, no red fill. */
async function expectOutlinedDanger(button: Locator): Promise<void> {
  await expect(button).toHaveCSS('background-color', CARD);
  await expect(button).toHaveCSS('color', DANGER);
  await expect(button).toHaveCSS('border-top-color', DANGER_LINE);
}

const PEOPLE = {
  priya: { id: '00000000-0000-4000-8000-0000000000a1', name: 'Priya Nair' },
  tom: { id: '00000000-0000-4000-8000-0000000000a2', name: 'Tom Okafor' },
  lena: { id: '00000000-0000-4000-8000-0000000000a3', name: 'Lena Fischer' },
  ines: { id: '00000000-0000-4000-8000-0000000000a4', name: 'Ines Moreau' },
  sam: { id: '00000000-0000-4000-8000-0000000000a5', name: 'Sam Achterberg' },
  bot: { id: '00000000-0000-4000-8000-0000000000a6', name: 'rv-bot (Service Account)' },
} as const;
/** Members of security-reviewers, as `GET /api/user?where=GroupIDs ? '<id>'` lists them (M4). */
const SECURITY_MEMBERS: Who[] = ['priya', 'tom', 'lena'];
type Who = keyof typeof PEOPLE;
const SECURITY_GROUP = '00000000-0000-4000-8000-0000000000b1';

type State = 'pending' | 'partial' | 'satisfied' | 'rejected' | 'author' | 'revoked';
const STATES: State[] = ['pending', 'partial', 'satisfied', 'rejected', 'author', 'revoked'];

/**
 * The derived review state of each design state. "pending" is the design's name
 * for 0 of 2 on security-review; qa-signoff already has its 1, so not every
 * requirement is at 0 and the derivation calls it partial.
 */
const DERIVED: Record<State, string> = {
  pending: 'partial',
  partial: 'partial',
  satisfied: 'satisfied',
  rejected: 'rejected',
  author: 'partial',
  revoked: 'partial',
};

const HOUR = 3_600_000;

interface Seed {
  id: string;
  who: Who;
  result: 'Pass' | 'Fail';
  agoMs: number;
  note: string;
  /** The ids of the Spaces it was recorded in. Default: both gate Spaces. */
  spaces?: number;
  revokedAgoMs?: number;
  /** The ChangeOrder it was made on. Default: this one. `null`: outside any ChangeOrder. */
  changeOrderId?: string | null;
}

const QA: Seed = { id: 'qa', who: 'ines', result: 'Pass', agoMs: 17 * HOUR, note: 'Staging regression run 4471 passed. 0 failures over 1,284 cases.' };
const LENA: Seed = {
  id: 'lena',
  who: 'lena',
  result: 'Pass',
  agoMs: 2 * HOUR,
  note: 'Read the 7.2 changelog against our modules. No breaking change for redis-cache. Replica sync tested on redis-staging-a.',
};

function seedsFor(state: State): Seed[] {
  switch (state) {
    case 'pending':
      return [QA];
    case 'partial':
    case 'author':
      return [LENA, QA];
    case 'satisfied':
      return [
        { id: 'priya', who: 'priya', result: 'Pass', agoMs: 39 * 60_000, note: 'Ran the failover drill on redis-staging-b. Eviction settings match the runbook.' },
        LENA,
        QA,
      ];
    case 'rejected':
      return [
        {
          id: 'tom',
          who: 'tom',
          result: 'Fail',
          agoMs: 1 * HOUR,
          note: '7.2 changes lazyfree-lazy-user-del to yes. session-store needs synchronous deletes for logout. Pin it to no before prod.',
        },
        LENA,
        QA,
      ];
    case 'revoked':
      return [
        {
          id: 'tom2',
          who: 'tom',
          result: 'Pass',
          agoMs: 3 * HOUR,
          note: 'r22 pins lazyfree-lazy-user-del to no. My concern is fixed, so I replace my rejection with an approval.',
        },
        {
          id: 'tom1',
          who: 'tom',
          result: 'Fail',
          agoMs: 23 * HOUR,
          note: '7.2 changes lazyfree-lazy-user-del to yes. session-store needs synchronous deletes for logout.',
          revokedAgoMs: 3 * HOUR + 30_000,
        },
        { id: 'lena-old', who: 'lena', result: 'Pass', agoMs: 77 * HOUR, note: 'Changelog read. No breaking change for redis-cache.' },
        QA,
      ];
  }
}

const uuidOf = (seed: string, space: number) =>
  `00000000-0000-4000-9000-${(Array.from(seed).reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1e10).toString().padStart(10, '0')}${space}${seed.length % 10}`;

interface Mocks {
  attests: { url: string; body: Record<string, unknown> }[];
  revokes: { url: string; body: Record<string, unknown> }[];
  /** What the next `/api/attest` write answers. */
  attestStatus: number;
  /** `where` filters of record reads that were not scoped to the ChangeOrder and its gate Spaces. */
  badWhere: string[];
  /** PATCH bodies sent to the ChangeOrder (review requests). */
  patches: Record<string, unknown>[];
  /** With `unchangedUnit`: the Unit reported unchanged. */
  unchangedUnitId?: string;
}

/** The Attestation records (and revocations) of one state, as `GET /api/attestation` lists them. */
function attestationRows(fx: ChangeOrderFixture, state: State, now: number, gateStage = 'staging', extraSeeds: Seed[] = []) {
  const gate = fx.spacesInStage(gateStage);
  const records: Record<string, unknown>[] = [];
  const revocations: Record<string, unknown>[] = [];
  for (const seed of [...seedsFor(state), ...extraSeeds]) {
    gate.slice(0, seed.spaces ?? gate.length).forEach((space, i) => {
      const id = uuidOf(seed.id, i);
      records.push({
        AttestationID: id,
        ...(seed.changeOrderId === null ? {} : { ChangeOrderID: seed.changeOrderId ?? fx.changeOrderId }),
        SpaceID: space.spaceId,
        SpaceSlug: space.slug,
        UserID: PEOPLE[seed.who].id,
        Type: seed.id === 'qa' ? 'QASignoff' : 'Approval',
        Result: seed.result,
        Note: seed.note,
        CreatedAt: new Date(now - seed.agoMs + i * 1000).toISOString(),
      });
      if (seed.revokedAgoMs !== undefined) {
        revocations.push({
          AttestationID: uuidOf(`${seed.id}-revoke`, i),
          SpaceID: space.spaceId,
          SpaceSlug: space.slug,
          // A manager of the Space revoked it, not Tom himself (S2).
          UserID: PEOPLE.sam.id,
          RevokedAttestationID: id,
          ChangeOrderID: fx.changeOrderId,
          Type: 'Approval',
          Note: 'Replaced by a new decision',
          CreatedAt: new Date(now - seed.revokedAgoMs + i * 1000).toISOString(),
        });
      }
    });
  }
  return { records, revocations };
}

/** A review requirement, as the mocked server evaluates it (the same rules as the real one). */
interface MockRequirement {
  name: string;
  type: string;
  required: number;
  eligible: string[];
  maxAgeHours?: number;
  ignoreFail?: boolean;
  allowAuthors?: boolean;
}

function mockRequirements(options: MockOptions): MockRequirement[] {
  const group = SECURITY_MEMBERS.map((w) => PEOPLE[w].id);
  const qa = options.twoTypes === true ? [PEOPLE.ines.id, PEOPLE.priya.id] : [PEOPLE.ines.id];
  return [
    { name: 'security-review', type: 'Approval', required: 2, eligible: group, maxAgeHours: 72, allowAuthors: options.allowAuthors === true },
    { name: 'qa-signoff', type: 'QASignoff', required: 1, eligible: qa, maxAgeHours: 72 },
    { name: 'release-ok', type: 'Approval', required: 1, eligible: group },
    { name: 'signoff', type: 'Approval', required: 2, eligible: group },
    { name: 'first-look', type: 'Approval', required: 1, eligible: group },
  ];
}

/** The server's `Caller`: who the viewer is to this gate in this Space. */
type MockCaller = { Counts: boolean; Reason?: 'Author' | 'NotEligible'; AuthoredRevisions: number };

/**
 * One #5788 gate row (`PromoteGateResult` with `Attestation`) for a requirement
 * in a Space, built from the state's records the way the server counts them:
 * revoked, too old (MaxAge), not eligible, a Fail with IgnoreFail, else counted.
 * One gate Revision per Space (the fixture has one Unit), written by the
 * promoter (`authorId`).
 */
function gateRow(
  req: MockRequirement,
  space: { spaceId: string; slug: string },
  records: Record<string, unknown>[],
  revokedIds: ReadonlySet<string>,
  ctx: { now: number; authorId: string; caller: MockCaller },
) {
  const mine = records.filter((r) => r.SpaceID === space.spaceId && r.Type === req.type);
  const counted = new Set<string>();
  let rejected = false;
  const entries = mine.map((r) => {
    const created = Date.parse(r.CreatedAt as string);
    const validUntil = req.maxAgeHours === undefined ? undefined : new Date(created + req.maxAgeHours * HOUR).toISOString();
    let reason: string | undefined;
    if (revokedIds.has(r.AttestationID as string)) reason = 'Revoked';
    else if (validUntil !== undefined && Date.parse(validUntil) < ctx.now) reason = 'TooOld';
    else if (!req.eligible.includes(r.UserID as string)) reason = 'NotEligible';
    else if (r.Result === 'Fail' && req.ignoreFail === true) reason = 'FailIgnored';
    if (reason === undefined && r.Result === 'Pass') counted.add(r.UserID as string);
    if (reason === undefined && r.Result === 'Fail') rejected = true;
    return {
      AttestationID: r.AttestationID,
      UserID: r.UserID,
      Result: r.Result,
      CreatedAt: r.CreatedAt,
      ...(validUntil === undefined ? {} : { ValidUntil: validUntil }),
      CountedOn: reason === undefined ? 1 : 0,
      ...(reason === undefined ? {} : { Reason: reason }),
    };
  });
  const satisfied = !rejected && counted.size >= req.required;
  const reasonCode = rejected ? 'AttestationRejected' : 'AttestationsMissing';
  return {
    Prerequisite: req.name,
    SpaceID: space.spaceId,
    SpaceSlug: space.slug,
    Satisfied: satisfied,
    ...(satisfied
      ? {}
      : {
          Reason: reasonCode,
          Message: `requires ${req.name}: ${req.required} ${req.type} attestation(s) from eligible attesters; app revision 3 has ${counted.size} of ${req.required}`,
        }),
    Attestation: {
      Type: req.type,
      Required: req.required,
      Counted: counted.size,
      Revisions: 1,
      SatisfiedRevisions: satisfied ? 1 : 0,
      ...(satisfied ? {} : { AuthorUserIDs: [ctx.authorId] }),
      Attestations: entries,
      ...(satisfied
        ? {}
        : { Unsatisfied: [{ UnitID: 'u-app', UnitSlug: 'app', RevisionNum: 3, Counted: counted.size, Reason: reasonCode, AuthorUserIDs: [ctx.authorId] }] }),
      Caller: ctx.caller,
    },
  };
}

interface MockOptions {
  /** The server's `Promoted` row for prod is unsatisfied: the reviews can be complete while prod is held (M5). */
  otherGateHeld?: boolean;
  /**
   * `staging` gets a release review (`release-ok`), and the release dry run
   * answers from its gate rows (`held`/`satisfied`), with a 200 that has no
   * Gates (`unchanged`, not evaluated), or refuses the viewer (`noPermission`, 403).
   */
  release?: 'held' | 'satisfied' | 'unchanged' | 'noPermission';
  /** The promote dry run for prod refuses the viewer (403): no server rows, nothing evaluated. */
  entryNoPermission?: boolean;
  /** `ChangeOrder.ReviewRequests` (stage `staging` = the entry gate of prod). */
  requests?: { who: Who; by?: Who; agoMs: number }[];
  /** The review-request PATCH answers 403. */
  requestForbidden?: boolean;
  /** Who the page is signed in as, for every state but `author`. Default Priya (in security-reviewers). */
  viewer?: Who;
  /** `Final.Prerequisites` names a sign-off review over the last stage. */
  signOff?: boolean;
  /**
   * With `signOff`: the server already reports the workflow complete (the
   * promote dry run's 400 "has completed ChangeWorkflow") while
   * `ChangeOrder.Stage` still lags at the last stage.
   */
  signOffCompleted?: boolean;
  /** The viewer is also listed for qa-signoff, a second Attestation Type (S1). */
  twoTypes?: boolean;
  /** The viewer wrote the gate Revision in the first staging Space (M3). */
  partialAuthor?: boolean;
  /** The attest dry run says the viewer wrote every Unit, while the Caller rows count the viewer. */
  coverageAuthoredOnly?: boolean;
  /** The attest dry run: the real server's answer, or nothing recordable with a Space error (M6). */
  dryRun?: 'real' | 'nothing';
  /** security-review has `AllowAuthors: true`: a Revision the viewer wrote still counts. */
  allowAuthors?: boolean;
  /** More decisions, after the state's own. */
  extraSeeds?: Seed[];
  /** With `signOff`: the completion probe answers `Complete: false` (Final is not open yet). */
  signOffNotOpen?: boolean;
  /** `dev`, the first stage, gets a review (`first-look`) over the ChangeOrder's own Space. */
  firstStage?: boolean;
  /** The first Unit the change reached in staging is reported unchanged (its start and end Tags mark one Revision). */
  unchangedUnit?: boolean;
  /**
   * The ChangeOrder reports the change in only the first staging Space (`part`, staging
   * in progress) or in none of them (`none`, staging not started).
   */
  stagingReached?: { how: 'part' | 'none'; spaceIds: string[] };
}


/** Adds the review requirements wherever the frozen workflow copy appears in a response. */
function withReviewPrerequisites(value: unknown, options: MockOptions, requests: Record<string, unknown>[] = []): unknown {
  if (Array.isArray(value)) return value.map((child) => withReviewPrerequisites(child, options, requests));
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) out[key] = withReviewPrerequisites(child, options, requests);
  const workflow = out.ChangeWorkflow as
    | { Stages?: { Name?: string; Prerequisites?: string[]; ReleasePrerequisites?: string[] }[]; Final?: { Prerequisites?: string[] } }
    | undefined;
  if (workflow !== undefined && workflow !== null && Array.isArray(workflow.Stages)) {
    const definitions: Record<string, unknown>[] = [
      {
        Name: 'security-review',
        Description: 'Two people from security-reviewers check every Redis image change before it reaches production.',
        Count: 2,
        FromGroupIDs: [SECURITY_GROUP],
        MaxAge: '72h',
        ...(options.allowAuthors === true ? { AllowAuthors: true } : {}),
      },
      {
        Name: 'qa-signoff',
        Description: 'QA confirms the staging regression run passed.',
        Type: 'QASignoff',
        Count: 1,
        FromUserIDs: options.twoTypes === true ? [PEOPLE.ines.id, PEOPLE.priya.id] : [PEOPLE.ines.id],
        MaxAge: '72h',
      },
    ];
    if (options.release !== undefined) {
      definitions.push({ Name: 'release-ok', Description: 'Someone from security-reviewers approves the release.', Count: 1, FromGroupIDs: [SECURITY_GROUP] });
    }
    if (options.signOff === true) {
      definitions.push({ Name: 'signoff', Description: 'Two reviewers sign the ChangeOrder off in production.', Count: 2, FromGroupIDs: [SECURITY_GROUP] });
    }
    if (options.firstStage === true) {
      definitions.push({ Name: 'first-look', Description: 'Someone from security-reviewers looks at the change first.', Count: 1, FromGroupIDs: [SECURITY_GROUP] });
    }
    out.ChangeWorkflow = {
      ...workflow,
      Stages: workflow.Stages.map((stage) => {
        if (stage.Name === PROD) return { ...stage, Prerequisites: [...(stage.Prerequisites ?? []), 'security-review', 'qa-signoff'] };
        if (stage.Name === 'dev' && options.firstStage === true) return { ...stage, Prerequisites: [...(stage.Prerequisites ?? []), 'first-look'] };
        if (stage.Name === 'staging' && options.release !== undefined) {
          return { ...stage, ReleasePrerequisites: [...(stage.ReleasePrerequisites ?? []), 'release-ok'] };
        }
        return stage;
      }),
      ...(options.signOff === true ? { Final: { ...(workflow.Final ?? {}), Prerequisites: [...(workflow.Final?.Prerequisites ?? []), 'signoff'] } } : {}),
      AttestationPrerequisites: definitions,
    };
    // A sign-off still held keeps the ChangeOrder in its last stage: the real server, which
    // does not know the mocked requirement, has already marked it Completed.
    if (options.signOff === true && out.Stage === 'Completed') out.Stage = PROD;
    // The ChangeOrder's review requests (#5788).
    if (requests.length > 0) out.ReviewRequests = requests;
  }
  const reached = options.stagingReached;
  if (reached !== undefined) {
    const left = new Set(reached.how === 'part' ? reached.spaceIds.slice(1) : reached.spaceIds);
    for (const key of ['ResolvedSpaceIDs', 'ReleasedSpaceIDs']) {
      if (Array.isArray(out[key])) out[key] = (out[key] as string[]).filter((id) => !left.has(id));
    }
  }
  return out;
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function postBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (request.postDataJSON() as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

async function mockReviews(
  page: Page,
  fx: ChangeOrderFixture,
  state: State,
  options: MockOptions = {},
  gateStage = 'staging',
): Promise<Mocks> {
  const now = Date.now();
  const mocks: Mocks = { attests: [], revokes: [], attestStatus: 200, badWhere: [], patches: [] };
  // The promoter (the real test user) wrote every gate Revision.
  const authorId = (((await (await hubApi.get('/api/me')).json()) as { UserID?: string }).UserID ?? 'u-promoter');
  const viewerId = PEOPLE[options.viewer ?? 'priya'].id;
  const requestRows: Record<string, unknown>[] = (options.requests ?? []).map((r) => ({
    Stage: 'staging',
    UserID: PEOPLE[r.who].id,
    RequestedAt: new Date(now - r.agoMs).toISOString(),
    ...(r.by === undefined ? {} : { RequestedByUserID: PEOPLE[r.by].id }),
  }));
  const { records, revocations } = attestationRows(fx, state, now, gateStage, options.extraSeeds);

  // Record what the page copies, without the real clipboard (it needs a permission).
  await page.addInitScript(() => {
    const copied: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = copied;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });
  });
  const gate = fx.spacesInStage(gateStage);

  await page.route(
    // API reads only: the Complete step's page URL also contains "change_order".
    (url) => url.pathname.startsWith('/api/') && url.pathname.includes('change_order'),
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      return route.fulfill({ response, body: JSON.stringify(withReviewPrerequisites(await response.json(), options, requestRows)) });
    },
  );

  if (state !== 'author') {
    await page.route(
      (url) => url.pathname === '/api/me',
      async (route) => {
        const response = await route.fetch();
        const me = (await response.json()) as Record<string, unknown>;
        const who = options.viewer ?? 'priya';
        return route.fulfill({ response, body: JSON.stringify({ ...me, UserID: PEOPLE[who].id, DisplayName: PEOPLE[who].name }) });
      },
    );
  }

  await page.route(
    (url) => url.pathname === '/api/user',
    async (route) => {
      const user = (who: Who) => ({
        User: {
          UserID: PEOPLE[who].id,
          DisplayName: PEOPLE[who].name,
          Slug: PEOPLE[who].name.toLowerCase().replace(' ', '-'),
          GroupIDs: SECURITY_MEMBERS.includes(who) ? [SECURITY_GROUP] : [],
        },
      });
      const where = new URL(route.request().url()).searchParams.get('where') ?? '';
      // The members of a group (M4): only the made-up reviewers are in security-reviewers.
      if (where.includes('GroupIDs ?')) {
        return route.fulfill(json(where.includes(SECURITY_GROUP) ? SECURITY_MEMBERS.map(user) : []));
      }
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const real = (await response.json()) as { User?: Record<string, unknown> }[];
      // The author state: the real test user (who promoted the change) is a member of
      // security-reviewers, so it is eligible and then refused as an author, as the server does.
      const realRows = (Array.isArray(real) ? real : []).map((row) =>
        state === 'author' && row.User !== undefined ? { ...row, User: { ...row.User, GroupIDs: [SECURITY_GROUP] } } : row,
      );
      const fake = (Object.keys(PEOPLE) as Who[]).map(user);
      return route.fulfill(json([...realRows, ...fake]));
    },
  );

  await page.route(
    (url) => url.pathname === '/api/group',
    async (route) => route.fulfill(json([{ Group: { GroupID: SECURITY_GROUP, Slug: 'security-reviewers', DisplayName: 'security-reviewers' } }])),
  );

  // Who the viewer is to a gate in a Space, as the server's Caller says (#5788).
  const callerFor = (req: MockRequirement, index: number): MockCaller => {
    if (state === 'author' || (options.partialAuthor === true && index === 0)) {
      return req.allowAuthors === true ? { Counts: true, AuthoredRevisions: 1 } : { Counts: false, Reason: 'Author', AuthoredRevisions: 1 };
    }
    if (!req.eligible.includes(viewerId)) return { Counts: false, Reason: 'NotEligible', AuthoredRevisions: 0 };
    return { Counts: true, AuthoredRevisions: 0 };
  };
  const revokedIds = new Set(revocations.map((r) => r.RevokedAttestationID as string));
  const requirements = mockRequirements(options);
  const reqNamed = (name: string) => requirements.find((r) => r.name === name) as MockRequirement;
  const rowsFor = (names: string[], spaces: { spaceId: string; slug: string }[]) =>
    spaces.flatMap((space, i) =>
      names.map((name) => gateRow(reqNamed(name), space, records, revokedIds, { now, authorId, caller: callerFor(reqNamed(name), i) })),
    );

  // The release dry run (#5788): `ReleasePublishResponse.Gates` on a 200 and on a 422.
  if (options.release !== undefined) {
    await page.route(
      (url) => /^\/api\/space\/[^/]+\/release$/.test(url.pathname),
      async (route) => {
        const body = await postBody(route.request());
        if (body.DryRun !== true) return route.fallback();
        if (options.release === 'noPermission') return route.fulfill(json({ message: 'You need Publish on this Space.' }, 403));
        if (options.release === 'unchanged') return route.fulfill(json({ Message: 'nothing new to release' }));
        const spaceId = new URL(route.request().url()).pathname.split('/')[3];
        const space = gate.find((g) => g.spaceId === spaceId) ?? gate[0];
        const row = gateRow(reqNamed('release-ok'), space, records, revokedIds, { now, authorId, caller: callerFor(reqNamed('release-ok'), 0) });
        if (options.release === 'satisfied' || row.Satisfied) {
          return route.fulfill(json({ Release: {}, Gates: [{ ...row, Satisfied: true }] }));
        }
        return route.fulfill(
          json(
            {
              Message: `unable to publish a release of change order '${fx.changeOrderSlug}' in stage 'staging': ${row.Message ?? ''}`,
              Gates: [row],
              Error: { Message: row.Message ?? '', Type: 'Unprocessable', Status: 422 },
            },
            422,
          ),
        );
      },
    );
  }

  await page.route(
    (url) => url.pathname === '/api/attestation',
    async (route) => {
      const where = new URL(route.request().url()).searchParams.get('where') ?? '';
      // The reads the page may make (#5788): revocations, the records the server's entries
      // name (`AttestationID IN`), and this ChangeOrder's own records. Anything else is
      // refused, so a wrong filter fails the test instead of passing on mocked data. Counts
      // come from the gate rows, never from this read.
      if (where.includes('RevokedAttestationID')) return route.fulfill(json(revocations.map((Attestation) => ({ Attestation }))));
      if (where.includes(`ChangeOrderID = '${fx.changeOrderId}'`)) return route.fulfill(json(records.map((Attestation) => ({ Attestation }))));
      if (/\bAttestationID IN\b/.test(where)) {
        const named = records.filter((r) => where.includes(r.AttestationID as string));
        return route.fulfill(json(named.map((Attestation) => ({ Attestation }))));
      }
      mocks.badWhere.push(where);
      return route.fulfill(json({ Message: `unexpected attestation filter: ${where}` }, 400));
    },
  );

  await page.route(
    (url) => /^\/api\/space\/[^/]+\/attestation$/.test(url.pathname),
    async (route) => {
      const body = await postBody(route.request());
      mocks.revokes.push({ url: route.request().url(), body });
      return route.fulfill(json({ Attestation: { AttestationID: uuidOf('new-revoke', mocks.revokes.length), ...body } }));
    },
  );

  await page.route(
    (url) => url.pathname === '/api/attest',
    async (route) => {
      const request = route.request();
      const body = await postBody(request);
      const dryRun = new URL(request.url()).searchParams.get('dry_run') === 'true';
      // The real server's dry run: Subjects are the real gate Revisions. It is asked as the real
      // test user, who wrote them, so `Authored` is set again for the viewer the page pretends to
      // be, by the same rule as the server's Caller rows (`callerFor`).
      if (dryRun && options.dryRun !== 'nothing') {
        const response = await route.fetch();
        if (!response.ok() && response.status() !== 207) return route.fulfill({ response });
        type DryRunSpace = { SpaceID?: string; Subjects?: Record<string, unknown>[] };
        const real = (await response.json()) as { Spaces?: DryRunSpace[] };
        const spaces = (real.Spaces ?? []).map((space) => {
          const index = gate.findIndex((g) => g.spaceId === space.SpaceID);
          const authored =
            state === 'author' || options.coverageAuthoredOnly === true || (options.partialAuthor === true && index === 0);
          return { ...space, Subjects: (space.Subjects ?? []).map((subject) => ({ ...subject, Authored: authored })) };
        });
        return route.fulfill(json({ ...real, Spaces: spaces }, response.status()));
      }
      if (dryRun) {
        // M6: one Space refuses (no Approve there), the other has nothing to cover.
        const [a, b] = gate;
        return route.fulfill(
          json(
            {
              Spaces: [
                { SpaceID: a.spaceId, SpaceSlug: a.slug, Error: { Message: 'You need Approve on this Space.' } },
                { SpaceID: b.spaceId, SpaceSlug: b.slug, Subjects: [], SkippedUnits: [{ UnitSlug: 'app', Reason: 'NoRevision', Message: 'Not changed in this Space.' }, { UnitSlug: 'worker', Reason: 'NoTarget' }] },
              ],
            },
            207,
          ),
        );
      }
      mocks.attests.push({ url: request.url(), body });
      if (mocks.attestStatus !== 200) {
        return route.fulfill(json({ Message: 'simulated attest refusal' }, mocks.attestStatus));
      }
      return route.fulfill(
        json({
          Spaces: gate.map((space, i) => ({
            SpaceID: space.spaceId,
            SpaceSlug: space.slug,
            Attestation: { AttestationID: uuidOf('new', i), ...body },
            Subjects: [{ UnitSlug: 'redis-cache', RevisionNum: 14 }],
          })),
        }),
      );
    },
  );

  await page.route(
    (url) => url.pathname === '/api/promote',
    async (route) => {
      const request = route.request();
      const body = await postBody(request);
      const include = new URL(request.url()).searchParams.get('include') ?? '';
      if (body.DryRun !== true || include.includes('ConfigData')) return route.fallback();
      // The completion probe (no TargetStage, #5788): Complete + the Final rows over the last stage.
      if (body.TargetStage === undefined && options.signOff === true && options.signOffNotOpen === true) {
        return route.fulfill(json({ DryRun: true, ChangeOrderID: fx.changeOrderId, Complete: false }));
      }
      if (body.TargetStage === undefined && options.signOff === true) {
        const final = [
          ...fx.spacesInStage(PROD).map((space) => ({ Prerequisite: 'Promoted', SpaceID: space.spaceId, SpaceSlug: space.slug, Satisfied: true })),
          ...rowsFor(['signoff'], fx.spacesInStage(PROD)),
        ];
        if (options.signOffCompleted === true || final.every((r) => r.Satisfied)) {
          return route.fulfill(json({ message: `change order '${fx.changeOrderSlug}' has completed ChangeWorkflow 'w', so there is nothing left to promote` }, 400));
        }
        return route.fulfill(json({ DryRun: true, ChangeOrderID: fx.changeOrderId, Complete: true, Final: final }));
      }
      // The first stage's entry gate, over the ChangeOrder's own Space.
      if (body.TargetStage === 'dev' && options.firstStage === true) {
        const gates = rowsFor(['first-look'], [fx.spaces.base]);
        return route.fulfill(json({ DryRun: true, ChangeOrderID: fx.changeOrderId, Stages: [{ Name: 'dev', Chosen: true, Gates: gates }] }, 409));
      }
      if (body.TargetStage !== PROD) return route.fallback();
      if (options.entryNoPermission === true) return route.fulfill(json({ message: 'You need Promote on these Spaces.' }, 403));
      const staging = fx.spacesInStage('staging');
      const gates: Record<string, unknown>[] = [
        ...staging.map((space) => ({
          Prerequisite: 'Promoted',
          SpaceID: space.spaceId,
          SpaceSlug: space.slug,
          Satisfied: options.otherGateHeld !== true,
          ...(options.otherGateHeld === true ? { Reason: 'NotPromoted', Message: 'staging has not taken the change' } : {}),
        })),
        ...rowsFor(['security-review', 'qa-signoff'], staging),
      ];
      const open = gates.every((g) => g.Satisfied === true);
      return route.fulfill(json({ DryRun: true, ChangeOrderID: fx.changeOrderId, Stages: [{ Name: PROD, PreviousStage: 'staging', Chosen: true, Gates: gates }] }, open ? 200 : 409));
    },
  );

  // Which Units the change changed: the Revisions its start and end Tags mark. One is made unchanged.
  if (options.unchangedUnit === true) {
    const orderResponse = await hubApi.get(`/api/space/${fx.changeOrderSpaceId}/change_order/${fx.changeOrderId}`);
    const orderBody = (await orderResponse.json()) as { StartTagID?: string; ChangeOrder?: { StartTagID?: string } };
    const startTagId = orderBody.StartTagID ?? orderBody.ChangeOrder?.StartTagID ?? '';
    await page.route(
      (url) => url.pathname === '/api/revision' && (url.searchParams.get('where') ?? '').includes('Tags.*.TagID IN'),
      async (route) => {
        const response = await route.fetch();
        if (!response.ok()) return route.fulfill({ response });
        type Row = { Revision?: { UnitID?: string; RevisionNum?: number; Tags?: Record<string, string> } };
        const rows = (await response.json()) as Row[];
        const ends = rows.filter((row) => Object.keys(row.Revision?.Tags ?? {}).some((tag) => tag !== startTagId));
        const unitId = ends.map((row) => row.Revision?.UnitID ?? '').filter(Boolean).sort()[0];
        mocks.unchangedUnitId = unitId;
        // The unit's end Revision carries the start Tag too: the change left it as it was.
        const changed = rows
          .filter((row) => row.Revision?.UnitID !== unitId || !(startTagId in (row.Revision?.Tags ?? {})))
          .map((row) =>
            row.Revision?.UnitID === unitId && row.Revision !== undefined
              ? { ...row, Revision: { ...row.Revision, Tags: { ...(row.Revision.Tags ?? {}), [startTagId]: '' } } }
              : row,
          );
        return route.fulfill({ response, body: JSON.stringify(changed) });
      },
    );
  }

  // Review requests: stored on the ChangeOrder, created with a merge PATCH of the whole list.
  await page.route(
    (url) => /^\/api\/space\/[^/]+\/change_order\/[^/]+$/.test(url.pathname) && url.pathname.startsWith('/api/'),
    async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      const body = await postBody(route.request());
      mocks.patches.push(body);
      if (options.requestForbidden === true) return route.fulfill(json({ message: 'You need Edit on this ChangeOrder.' }, 403));
      const response = await route.fetch({ method: 'GET' });
      const order = (await response.json()) as Record<string, unknown>;
      const stamped = ((body.ReviewRequests as Record<string, unknown>[]) ?? []).map((r) => ({
        RequestedAt: new Date(now).toISOString(),
        RequestedByUserID: authorId,
        ...r,
      }));
      requestRows.splice(0, requestRows.length, ...stamped);
      return route.fulfill(json({ ...order, ReviewRequests: stamped, Version: ((order.Version as number) ?? 0) + 1 }));
    },
  );

  return mocks;
}

/** The staging card: where prod's entry gate, which reads staging's Spaces, is reviewed. */
async function openReview(page: Page, fx: ChangeOrderFixture, { expand = true }: { expand?: boolean } = {}): Promise<void> {
  await page.goto(`${fx.changeOrderPath}/staging`);
  await expect(page.getByTestId('review-panel')).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId('review-band')).toBeVisible();
  // The decisions are read and named. They sit in a section that is closed until opened.
  await expect(page.getByTestId('review-decision').first()).toBeAttached({ timeout: 20000 });
  if (!expand) return;
  await expandReviewSections(page);
  await expect(page.getByTestId('review-decision').first()).toBeVisible();
}

/** Opens every closed section of the review panel: coverage, requests, requirements, decisions. */
async function expandReviewSections(page: Page): Promise<void> {
  const closed = page.locator('[data-testid="review-section-toggle"][aria-expanded="false"]');
  for (let i = 0; i < 8 && (await closed.count()) > 0; i++) await closed.first().click();
}

/**
 * The whole page at `width`. The app scrolls inside its own container, so a
 * full-page screenshot stops at the viewport: the viewport is made as tall as
 * the ChangeOrder page instead, then put back.
 */
async function shoot(page: Page, state: State, width: number): Promise<void> {
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
      await openReview(page, fx, { expand: false });
      await expect(page.getByTestId('review-panel')).toHaveAttribute('data-review-state', DERIVED[state]);
      expect(mocks.badWhere, 'attestation reads not scoped to the ChangeOrder').toEqual([]);
      await shoot(page, state, 1440);
      await shoot(page, state, 1000);
    });
  }

  test('the rail marks prod held on review, and Review now goes to the staging card, outlined', async ({ page }) => {
    await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    await expect(page.getByTestId('review-band')).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('stage-rail-review').first()).toContainText('Review 1/2 on security-review');
    await expect(page.getByTestId('review-band')).toContainText('prod needs 1 more approval of the change in staging on');

    // At 1000 px the rail wraps, and the held link stays on the row of the node it leads into.
    await page.setViewportSize({ width: 1000, height: 900 });
    const link = page.locator('[data-review-hold="held"]');
    const node = page.locator('[role="button"][aria-pressed="true"]').filter({ hasText: 'Held on review' });
    const [linkBox, nodeBox] = [await link.boundingBox(), await node.boundingBox()];
    expect(linkBox && nodeBox && linkBox.y >= nodeBox.y && linkBox.y < nodeBox.y + nodeBox.height).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });

    const reviewNow = page.locator('[data-review-cta="review"]');
    await expect(reviewNow).toHaveText('Review now');
    await expectOutlinedNeutral(reviewNow);
    await reviewNow.click();
    // The review of prod's entry gate is on the staging card, with staging's change.
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/staging$`));
    await expect(page.locator('[data-choice="Pass"]')).toBeFocused({ timeout: 5000 });
    // The link icon is in the panel header for a reviewer too, not only for the author.
    await expect(page.getByTestId('review-panel-header').getByRole('button', { name: 'Copy link to this review' })).toBeVisible();
    // The scroll stops with the panel's top in view, below the app bar.
    await page.waitForTimeout(800);
    const tops = await page.evaluate(() => ({
      panel: document.getElementById('review')?.getBoundingClientRect().top ?? -1,
      bar: Math.max(0, ...Array.from(document.querySelectorAll('header, .MuiAppBar-root')).map((el) => el.getBoundingClientRect().bottom)),
    }));
    expect(tops.panel).toBeGreaterThanOrEqual(tops.bar);
  });

  test("prod's card shows the gate's state and the way to the review, and no form", async ({ page }) => {
    await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    const status = page.getByTestId('review-entry-status');
    await expect(status).toContainText('Waiting for approval of the change in staging.', { timeout: 45000 });
    await expect(page.getByTestId('review-panel')).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Your decision' })).toHaveCount(0);
    await expect(page.locator('[data-testid="review-blocked-line"][data-gate-kind="entry"]')).toContainText(
      'Promote to prod is blocked until security-review is met for the change in staging.',
    );
    await expect(page.getByTestId('review-gate-link-security-review')).toHaveText('Review in staging');
    await page.getByTestId('review-entry-go').click();
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/staging$`));
    const panel = page.getByTestId('review-panel');
    await expect(panel).toHaveAttribute('data-gate-kind', 'entry', { timeout: 20000 });
    await expect(panel).toHaveAttribute('aria-label', 'Review of the change in staging');
    const subject = page.getByTestId('review-subject');
    await expect(subject).toContainText('The change in stage staging (');
    for (const space of fx.spacesInStage('staging')) await expect(subject).toContainText(space.slug);
    await expect(page.getByTestId('review-counts-toward')).toHaveText('Counts toward the gate to prod.');
    await expect(panel).toContainText('Requirements for the gate to prod');
    await expect(page.getByTestId('review-entry-status')).toHaveCount(0);
  });

  test("prod's card names staging as an underlined link to staging's card, and staging's own card has none", async ({ page }) => {
    await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    const status = page.getByTestId('review-entry-status');
    await expect(status).toContainText('Waiting for approval of the change in staging.', { timeout: 45000 });
    const link = status.getByTestId('review-entry-stage-link');
    await expect(link).toHaveText('staging');
    await expect(link).toHaveAccessibleName('Go to staging');
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('underline');
    for (const state of ['rest', 'hover'] as const) {
      if (state === 'hover') await link.hover();
      const colors = await link.evaluate((el) => ({ own: getComputedStyle(el).color, parent: getComputedStyle(el.parentElement as HTMLElement).color }));
      expect(colors.own).toBe(colors.parent);
    }
    await expect(page.getByTestId('review-band-stage-link')).toHaveText('staging');
    await expect(page.getByTestId('review-blocked-stage-link')).toHaveText('staging');
    expect(await page.getByTestId('review-gate-link-stage').evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('underline');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/staging$`));
    await expect(page.getByTestId('review-panel')).toHaveAttribute('data-gate-kind', 'entry', { timeout: 20000 });
    await expect(page.getByRole('radiogroup', { name: 'Your decision' })).toBeVisible();
    // The reader is on that card now: its heading and subject name the stage in plain text.
    await expect(page.getByTestId('review-subject')).toContainText('The change in stage staging (');
    await expect(page.getByTestId('review-panel').locator('[data-testid$="stage-link"]')).toHaveCount(0);
    await expect(page.getByTestId('review-entry-stage-link')).toHaveCount(0);
  });

  test("staging not landed: prod's text names staging with no link", async ({ page }) => {
    const spaceIds = fx.spacesInStage('staging').map((space) => space.spaceId);
    await mockReviews(page, fx, 'partial', { stagingReached: { how: 'none', spaceIds } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    await expect(page.getByTestId('review-entry-status')).toHaveAttribute('data-landed', 'false', { timeout: 45000 });
    await expect(page.getByTestId('review-entry-status')).toContainText('Waiting for approval of the change in staging.');
    await expect(page.locator('[data-testid$="stage-link"]')).toHaveCount(0);
  });

  test('staging part-promoted: the review is on the staging card, and prod links to it', async ({ page }) => {
    const spaceIds = fx.spacesInStage('staging').map((space) => space.spaceId);
    await mockReviews(page, fx, 'partial', { stagingReached: { how: 'part', spaceIds } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    const status = page.getByTestId('review-entry-status');
    await expect(status).toHaveAttribute('data-landed', 'true', { timeout: 45000 });
    await page.getByTestId('review-entry-go').click();
    await expect(page).toHaveURL(new RegExp(`${fx.changeOrderPath}/staging$`));
    const panel = page.getByTestId('review-panel');
    await expect(panel).toHaveAttribute('data-gate-kind', 'entry', { timeout: 20000 });
    await expect(page.getByTestId('review-counts-toward')).toHaveText('Counts toward the gate to prod.');
    await expect(page.getByRole('radiogroup', { name: 'Your decision' })).toBeVisible();
  });

  test('staging not promoted: prod says when the change can be reviewed, with no link to an empty card', async ({ page }) => {
    const spaceIds = fx.spacesInStage('staging').map((space) => space.spaceId);
    await mockReviews(page, fx, 'partial', { stagingReached: { how: 'none', spaceIds } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/${PROD}`);
    const status = page.getByTestId('review-entry-status');
    await expect(status).toHaveAttribute('data-landed', 'false', { timeout: 45000 });
    await expect(status).toContainText('The change has not landed in staging yet. You can review it there after staging is promoted.');
    await expect(page.getByTestId('review-entry-go')).toHaveCount(0);
    await expect(page.getByTestId('review-gate-link-security-review')).toHaveCount(0);
    // Nothing offers a way to a card without the form: staging's card has none.
    await expect(page.locator('[data-review-cta="review"], [data-review-cta="panel"]')).toHaveCount(0);
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByLabel('Stage staging', { exact: true })).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('review-panel')).toHaveCount(0);
  });

  test('approve: the reason is required, counted, confirmed and recorded', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReview(page, fx);
    const submit = page.getByTestId('review-submit');
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText('Choose approve or reject');
    await expect(submit).toHaveCSS('font-size', '13.5px');
    await expect(submit).toHaveCSS('font-weight', '600');
    await page.locator('[data-choice="Pass"]').click();
    await expect(submit).toHaveText('Approve the change in staging');
    await expectOutlinedNeutral(submit);
    await submit.click();
    await expect(page.getByText('A reason is required.')).toBeVisible();
    await expect(page.locator('#review-note')).toBeFocused();
    await page.locator('#review-note').fill('Checked it.');
    await expect(page.getByTestId('review-note-count')).toHaveText('11 / 4096');
    await submit.click();
    const dialog = page.getByTestId('review-confirm');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Record your approval');
    // What is reviewed and what it counts toward, then the effect on the gate on its own line.
    await expect(dialog).toContainText('staging: ');
    for (const space of fx.spacesInStage('staging')) await expect(dialog).toContainText(space.slug);
    await expect(dialog).toContainText('the gate to prod');
    await expect(page.getByTestId('review-confirm-effect')).toContainText('This completes security-review.');
    await expect(page.getByTestId('review-confirm-gate-effect')).toHaveText('This opens the gate to prod.');
    const confirm = page.getByTestId('review-confirm-submit');
    await expect(confirm).toBeFocused();
    await expectOutlinedNeutral(confirm);
    // No dividers; a 3px tone edge on top; the requirement in the mono face.
    await expect(page.locator('#review-confirm-title')).toHaveCSS('border-bottom-width', '0px');
    await expect(page.locator('.MuiDialog-paper')).toHaveCSS('border-top-width', '3px');
    await expect(page.locator('.MuiDialogActions-root')).toHaveCSS('border-top-width', '0px');
    await expect(page.getByTestId('review-confirm-effect').locator('span', { hasText: /^security-review$/ }).first()).toHaveCSS(
      'font-family',
      /monospace/,
    );
    await page.screenshot({ path: `${SHOT_DIR}/approve-confirm-1440.png`, animations: 'disabled' });
    await confirm.click();
    await expect(dialog).toBeHidden({ timeout: 10000 });
    expect(mocks.attests).toHaveLength(1);
    expect(mocks.attests[0].body).toMatchObject({ Result: 'Pass', Note: 'Checked it.', ChangeOrderID: fx.changeOrderId, TargetStage: 'staging' });
    // Worded from the gate as the server reports it after the write. The mocked server still
    // counts 1 of 2 (it does not count the new record), so a prediction would have said otherwise.
    await expect(page.getByTestId('review-toast')).toContainText(
      'Approval of the change in staging recorded. security-review: 1 of 2 for the gate to prod.',
    );
  });

  test('reject: outlined red, and recorded as Fail', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial');
    await openReview(page, fx);
    await page.locator('[data-choice="Fail"]').click();
    await expect(page.locator('#review-note')).toHaveAttribute('placeholder', 'What must change in staging?');
    await page.locator('#review-note').fill('Pin lazyfree-lazy-user-del to no.');
    const submit = page.getByTestId('review-submit');
    await expectOutlinedDanger(submit);
    await submit.click();
    const confirm = page.getByTestId('review-confirm-submit');
    await expect(confirm).toHaveText('Reject');
    await expectOutlinedDanger(confirm);
    await expect(page.getByTestId('review-confirm-effect')).toContainText('This blocks the gate to prod for everyone');
    await confirm.click();
    await expect(page.getByTestId('review-confirm')).toBeHidden({ timeout: 10000 });
    expect(mocks.attests[0].body).toMatchObject({ Result: 'Fail' });
  });

  test('a refused record keeps the dialog open with the reason', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial');
    mocks.attestStatus = 500;
    await openReview(page, fx);
    await page.locator('[data-choice="Pass"]').click();
    await page.locator('#review-note').fill('Checked it.');
    await page.getByTestId('review-submit').click();
    await page.getByTestId('review-confirm-submit').click();
    await expect(page.getByTestId('review-confirm-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('review-confirm')).toBeVisible();
  });

  test('author: no decision form, the reason, and a link to copy', async ({ page }) => {
    await mockReviews(page, fx, 'author');
    await openReview(page, fx);
    await expect(page.getByTestId('review-author')).toContainText('You cannot approve this change');
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
    // The link to this review is an icon button in the panel header, and it writes the review URL.
    const copy = page.getByTestId('review-panel-header').getByRole('button', { name: 'Copy link to this review' });
    await expect(copy).toBeVisible();
    await copy.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([
      expect.stringMatching(new RegExp(`${fx.changeOrderPath}/staging#review$`)),
    ]);
    await expect(page.getByTestId('review-toast')).toContainText('Link to this review copied.');
    // The author block keeps its explanation and the people who can approve, and no text button.
    await expect(page.getByTestId('review-author').getByRole('button')).toHaveCount(0);
    await expect(page.locator('[data-review-cta="panel"]')).toHaveText('See who can');
    // The dry run saves an author's decision on the Units, and it would not count.
    await expect(page.getByTestId('review-coverage')).toContainText(/would be saved on \d+ Units?, but it would not count/);
  });

  test('change my decision: revoke each record, then record the new one', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'satisfied');
    await openReview(page, fx);
    // "Go to promote" leads to Promote, so it keeps Promote's purple.
    const goToPromote = page.locator('[data-review-cta="promote"]');
    await expect(goToPromote).toHaveText('Go to promote');
    await expect(goToPromote).toHaveCSS('background-color', PURPLE);
    await goToPromote.hover();
    await expect(goToPromote).toHaveCSS('background-color', PURPLE_HOVER);
    await page.mouse.move(0, 0);
    await page.getByTestId('review-change').click();
    await expect(page.getByText('Keep my approval')).toBeVisible();
    await page.getByText('Keep my approval').click();
    await expect(page.getByTestId('review-change')).toBeVisible();
    await page.getByTestId('review-change').click();
    await page.locator('[data-choice="Fail"]').click();
    await page.locator('#review-note').fill('A new finding on session-store.');
    await page.getByTestId('review-submit').click();
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
    const panel = page.getByTestId('review-panel');
    await expect(panel.getByText('Withdrawn', { exact: true }).first()).toBeVisible();
    await expect(panel.getByText('Expired', { exact: true }).first()).toBeVisible();
    await expect(panel.getByText(/^Replaces Tom’s rejection from/)).toBeVisible();
    // A replacement sits right above the decision it replaced.
    const names = await panel.getByTestId('review-decision').evaluateAll((rows) =>
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

  test('release review: Release is held by the 422, on the promoted stage', async ({ page }) => {
    await mockReviews(page, fx, 'pending', { release: 'held' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/staging`);
    const panel = page.getByTestId('review-panel');
    await expect(panel).toHaveAttribute('data-gate-kind', 'release', { timeout: 45000 });
    await expect(panel).toContainText('Release review');
    const release = page.locator('[data-release-stage="staging"]');
    await expect(release).toBeDisabled();
    await expect(release).toHaveAttribute('data-release-held', 'true');
    await expect(page.locator('[data-testid="review-blocked-line"][data-gate-kind="release"]')).toContainText(
      'Release in staging is blocked until release-ok is met.',
    );
    await expect(page.getByTestId('stage-rail-review').first()).toContainText('Release review');
    // The count is the server's row: 0 of 1, so 1 more approval.
    await expect(page.locator('[data-testid="review-blocked-line"][data-gate-kind="release"]')).toContainText('1 more approval needed');
    await expect(page.getByTestId('review-requirement-release-ok')).toHaveAttribute('data-evaluated', 'true');
    await shoot(page, 'release' as State, 1440);
    await shoot(page, 'release' as State, 1000);
  });

  test('a release dry run refused with 403: not evaluated, no hold, no count, and the page stays', async ({ page }) => {
    await mockReviews(page, fx, 'pending', { release: 'noPermission' });
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByTestId('review-band')).toBeVisible({ timeout: 45000 });
    await expect(page).not.toHaveURL(/access-denied/);
    // Without a server row there is nothing to hold Release on, and no figure to show.
    await expect(page.locator('[data-release-held="true"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="review-blocked-line"][data-gate-kind="release"]')).toHaveCount(0);
    const req = page.getByTestId('review-requirement-release-ok');
    await expect(req).toHaveAttribute('data-evaluated', 'false');
    await expect(req).not.toContainText(/\d+ \/ \d+/);
    await expect(page.locator('[data-release-stage="staging"]')).toBeEnabled();
  });

  test('release with nothing new to release (200, no Gates): not evaluated, no hold', async ({ page }) => {
    await mockReviews(page, fx, 'pending', { release: 'unchanged' });
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.locator('[data-testid="review-panel"][data-gate-kind="release"]')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('[data-release-held="true"]')).toHaveCount(0);
    await expect(page.getByTestId('review-requirement-release-ok')).toHaveAttribute('data-evaluated', 'false');
    // Plain words: nothing to release. Never "not evaluated", which reads as a permission problem.
    await expect(page.getByTestId('review-score-not-evaluated')).toHaveText(
      'There is nothing new to release here, so this stage has no release review now.',
    );
    await expect(page.getByTestId('review-requirement-release-ok')).toContainText('Nothing new to release');
    await expect(page.locator('[data-testid="review-panel"][data-gate-kind="release"]')).not.toContainText(/not evaluated/i);
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
    await expect(page.getByTestId('review-panel')).not.toContainText('you did not write this change');
    // security-review allows authors; qa-signoff does not, so the panel says where it does not count.
    await expect(page.getByTestId('review-panel')).toContainText('you can review for security-review');
    await expect(page.getByTestId('review-panel')).not.toContainText('authors may approve here');
  });

  test('a not-eligible viewer with a decision: not eligible first, and the decision does not count', async ({ page }) => {
    await mockReviews(page, fx, 'partial', {
      viewer: 'sam',
      extraSeeds: [{ id: 'sam', who: 'sam', result: 'Pass', agoMs: HOUR, note: 'Looks fine to me.' }],
    });
    await openReview(page, fx);
    await expect(page.getByTestId('review-not-eligible')).toContainText('does not name you or a group of yours');
    const own = page.getByTestId('review-own-not-counted').first();
    await expect(own).toContainText('It is recorded, but it does not count.');
    await expect(own).toContainText('Not counted: not in security-reviewers');
    await expect(page.getByTestId('review-panel')).not.toContainText('Your approval covers');
    await expect(page.getByTestId('review-change')).toHaveCount(0);
    await expect(page.getByTestId('review-band')).not.toContainText('You approved. Waiting on others.');
    await expect(page.getByTestId('review-band')).toContainText('You are not on the list of reviewers.');
  });

  test('history: a service account has the same initials as in the panel', async ({ page }) => {
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
    await openReview(page, fx);
    await expect(page.getByTestId('review-not-eligible')).toContainText('does not name you or a group of yours');
    await expect(page.getByRole('radiogroup', { name: 'Your decision' })).toHaveCount(0);
  });

  test('not evaluated for the viewer: no counts, the decisions still listed, and the page stays', async ({ page }) => {
    await mockReviews(page, fx, 'partial', { entryNoPermission: true });
    await page.goto(`${fx.changeOrderPath}/staging`);
    await expect(page.getByTestId('review-panel')).toBeVisible({ timeout: 45000 });
    await expect(page).not.toHaveURL(/access-denied/);
    await expect(page.getByTestId('review-requirement-security-review')).toHaveAttribute('data-evaluated', 'false');
    await expect(page.getByTestId('review-requirement-security-review')).not.toContainText(/\d+ \/ \d+/);
    await expect(page.getByTestId('review-score-not-evaluated')).toBeVisible();
    // Who decided, with their notes, is still shown.
    await expect(page.getByTestId('review-decision').first()).toContainText('Lena Fischer');
  });

  test('review requested of the viewer: band, panel, and waiting since the request', async ({ page }) => {
    await mockReviews(page, fx, 'partial', { requests: [{ who: 'priya', by: 'tom', agoMs: 3 * HOUR }] });
    await openReview(page, fx);
    await expect(page.getByTestId('review-band')).toContainText('Review requested of you by Tom Okafor');
    await expect(page.getByTestId('review-requested-of-you')).toContainText('Tom Okafor asked you to review this');
    await expect(page.getByTestId('review-panel')).toContainText('since the request');
    await expect(page.getByTestId('review-request').first()).toContainText('Priya Nair');
  });

  test('request review from someone, then withdraw it', async ({ page }) => {
    // Nobody has decided yet; Tom was asked already, so only Lena is offered (never the viewer).
    const mocks = await mockReviews(page, fx, 'pending', { requests: [{ who: 'tom', by: 'priya', agoMs: HOUR }] });
    await openReview(page, fx);
    await expect(page.getByTestId('review-requests')).toBeVisible();
    await page.getByTestId('review-request-input').click();
    const offered = page.getByRole('listbox').getByRole('option');
    await expect(offered).toHaveText(['Lena Fischer']);
    await offered.first().click();
    await page.getByTestId('review-request-submit').click();
    await expect.poll(() => mocks.patches.length).toBe(1);
    const added = mocks.patches[0] as { ReviewRequests?: { UserID?: string; Stage?: string }[]; Version?: number };
    expect(added.Version).toBeDefined();
    expect((added.ReviewRequests ?? []).map((r) => r.UserID).sort()).toEqual([PEOPLE.tom.id, PEOPLE.lena.id].sort());
    await expect(page.getByTestId('review-request').filter({ hasText: 'Lena Fischer' })).toBeVisible();

    await page.getByTestId('review-request').filter({ hasText: 'Tom Okafor' }).getByTestId('review-request-withdraw').click();
    await expect.poll(() => mocks.patches.length).toBe(2);
    const removed = mocks.patches[1] as { ReviewRequests?: { UserID?: string }[] };
    expect((removed.ReviewRequests ?? []).map((r) => r.UserID)).toEqual([PEOPLE.lena.id]);
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

  test('a partly authored gate keeps the form and says where the decision does not count', async ({ page }) => {
    await mockReviews(page, fx, 'partial', { partialAuthor: true });
    await openReview(page, fx);
    // From the server's Caller: where the viewer is an author, with its Unit count.
    await expect(page.getByTestId('review-partial')).toContainText(
      `You wrote part of this change in ${fx.spacesInStage('staging')[0].slug} (1 of 1 Unit). Your decision is recorded but does not count there.`,
    );
    await expect(page.getByRole('radiogroup', { name: 'Your decision' })).toBeVisible();
    // The approval counts only where the viewer did not write the change: never "This completes".
    await page.locator('[data-choice="Pass"]').click();
    await page.locator('#review-note').fill('Checked it.');
    await page.getByTestId('review-submit').click();
    const effect = page.getByTestId('review-confirm-effect');
    await expect(effect).toContainText(/Your approval counts on \d+ of \d+ Units?\./);
    await expect(effect).not.toContainText('This completes');
    await expect(page.getByTestId('review-confirm-gate-effect')).toHaveCount(0);
  });

  test('a decision that would count nowhere: no form, and the panel says why', async ({ page }) => {
    // The server's row counts the viewer, but the coverage says the viewer wrote every Unit.
    await mockReviews(page, fx, 'partial', { coverageAuthoredOnly: true });
    await openReview(page, fx);
    await expect(page.getByTestId('review-would-not-count')).toContainText('your decision would not count here');
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
    await expect(page.getByTestId('review-panel')).not.toContainText('authors may approve here');
  });

  test('a decision from another ChangeOrder says so; history names the reviewed stage and the gate', async ({ page }) => {
    await mockReviews(page, fx, 'partial', {
      extraSeeds: [
        { id: 'carried', who: 'tom', result: 'Pass', agoMs: 5 * HOUR, note: 'Approved on the aborted ChangeOrder.', changeOrderId: '1f0c2a9e-55b1-4d0e-9f53-2c7a3e1b9d40' },
        { id: 'cli', who: 'sam', result: 'Pass', agoMs: 6 * HOUR, note: 'Approved with cub.', changeOrderId: null },
      ],
    });
    await openReview(page, fx);
    const panel = page.getByTestId('review-panel');
    await expect(panel.locator('[data-testid="review-decision-origin"][data-origin="other"]')).toContainText('Made on another ChangeOrder.');
    await expect(panel.locator('[data-testid="review-decision-origin"][data-origin="none"]')).toContainText('Made outside a ChangeOrder.');
    // Decisions of this ChangeOrder carry no origin line.
    await expect(panel.getByTestId('review-decision-origin')).toHaveCount(2);
    // The history files the approval under the stage whose change was reviewed, and names the gate.
    const tom = page.locator('[data-history-entry="review-approved"]').filter({ hasText: 'Tom Okafor' }).first();
    await expect(tom).toContainText('approved');
    await expect(tom).not.toContainText('the change in');
    await expect(tom.locator('[data-history-gates]')).toHaveText('staging');
    await expect(tom.locator('[data-history-gates]')).toHaveAttribute('data-history-gates', 'For the gate to prod');
    await expect(tom.getByTestId('history-review-origin')).toHaveText('Made on another ChangeOrder');
  });

  test('who can approve lists the members of a group requirement', async ({ page }) => {
    await mockReviews(page, fx, 'author');
    await openReview(page, fx);
    const whoCan = page.getByTestId('review-who-can');
    await expect(whoCan).toContainText('Priya Nair');
    await expect(whoCan).toContainText('in security-reviewers');
    await expect(page.getByTestId('review-author')).not.toContainText('cannot list group members');
  });

  test('"Ready to promote" only when every server gate is satisfied; else "Reviews complete"', async ({ page }) => {
    await mockReviews(page, fx, 'satisfied');
    await openReview(page, fx);
    const band = page.getByTestId('review-band');
    await expect(band).toContainText('can be promoted');
    await expect(page.getByRole('region', { name: 'ChangeOrder summary' })).toContainText('Ready to promote');

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockReviews(page, fx, 'satisfied', { otherGateHeld: true });
    await openReview(page, fx);
    await expect(band).toContainText('Reviews complete');
    await expect(band).not.toContainText('can be promoted');
    await expect(page.locator('[data-review-cta="promote"]')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'ChangeOrder summary' })).not.toContainText('Ready to promote');
  });

  test('nothing recordable: the Space error is shown and submit is disabled', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'partial', { dryRun: 'nothing' });
    await openReview(page, fx);
    await expect(page.locator('[data-coverage="space-error"]')).toContainText('You need Approve on this Space.');
    // A skipped Unit shows the server's Message first; without one, words for its code; never the bare code (#5788).
    const skipped = page.locator('[data-coverage="skipped"]');
    await expect(skipped.filter({ hasText: 'app' })).toContainText('Skipped. Not changed in this Space.');
    await expect(skipped.filter({ hasText: 'worker' })).toContainText('Skipped. It has no Target, so it is never released.');
    await expect(skipped).not.toContainText(['NoRevision']);
    await expect(skipped.filter({ hasText: 'worker' })).not.toContainText('NoTarget');
    await page.locator('[data-choice="Pass"]').click();
    await expect(page.getByTestId('review-submit')).toBeDisabled();
    await expect(page.getByTestId('review-submit-blocked')).toContainText('would record nothing');
    expect(mocks.attests).toHaveLength(0);
  });

  test('two Attestation Types: one block each in the dialog, one /attest each', async ({ page }) => {
    const mocks = await mockReviews(page, fx, 'pending', { twoTypes: true });
    await openReview(page, fx);
    await page.locator('[data-choice="Pass"]').click();
    await page.locator('#review-note').fill('Checked both.');
    await page.getByTestId('review-submit').click();
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
    await expect(page.getByTestId('review-panel')).toContainText('by Sam Achterberg');
  });

  test('only the Units the change changed are counted; an unchanged one is recorded, not needed', async ({ page }) => {
    // Authors count, so the count is of the Units a gate reads alone.
    await mockReviews(page, fx, 'pending', { allowAuthors: true, unchangedUnit: true });
    await openReview(page, fx);
    const coverage = page.locator('[data-testid="review-coverage"][data-coverage-type="Approval"]');
    const notNeeded = coverage.locator('[data-coverage="not-needed"]');
    await expect(notNeeded).toHaveCount(1, { timeout: 20000 });
    await expect(notNeeded).toContainText('Not needed: the change did not touch this Unit.');
    const counted = await coverage.locator('[data-coverage="covered"]').count();
    const units = `${counted} ${counted === 1 ? 'Unit' : 'Units'}`;
    await expect(coverage).toContainText(`Covers ${units} in`);
    await page.locator('[data-choice="Pass"]').click();
    await expect(page.getByTestId('review-submit')).toHaveText('Approve the change in staging');
    await page.locator('#review-note').fill('Checked it.');
    await page.getByTestId('review-submit').click();
    await expect(page.locator('[data-testid="review-confirm-type"][data-type="Approval"]')).toContainText(`${units} in`);
  });

  test("the first stage's review stays on the first stage and names the ChangeOrder's own Space", async ({ page }) => {
    await mockReviews(page, fx, 'pending', { firstStage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.changeOrderPath}/dev`);
    const panel = page.getByTestId('review-panel');
    await expect(panel).toHaveAttribute('data-gate-kind', 'entry', { timeout: 45000 });
    await expect(panel).toHaveAttribute('aria-label', `Review of the change in ${fx.spaces.base.slug}`);
    await expect(page.getByTestId('review-subject')).toContainText(`The change in ${fx.spaces.base.slug}`);
    await expect(page.getByTestId('review-subject')).not.toContainText('stage');
    await expect(page.getByTestId('review-counts-toward')).toHaveText('Counts toward the gate to dev.');
    await expect(page.getByTestId('review-entry-status')).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Your decision' })).toBeVisible();
  });

  test('history: the Reviews filter shows only review events', async ({ page }) => {
    await mockReviews(page, fx, 'partial');
    await openReview(page, fx);
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
