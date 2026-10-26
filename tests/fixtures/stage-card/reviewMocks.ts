// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * Reviews on a real ChangeOrder, with the review data mocked: the people, their
 * decisions, the review requirements and the server's gate rows.
 *
 * The ChangeOrder is real (`buildChangeOrderFixture`, usually `no-health-check`, so
 * nothing but reviews holds a stage). The routes `mockReviews` installs then:
 *
 *   - add two attestation prerequisites to `prod` in the ChangeOrder's frozen
 *     workflow copy (`security-review`: 2 approvals from a group;
 *     `qa-signoff`: 1 approval from one named person),
 *   - answer `GET /api/attestation` with the records of the state under test,
 *   - answer the `/api/attest` dry run with what a decision would cover,
 *   - answer the gate reads (the promote dry run naming `TargetStage`) with the
 *     server's verdicts, counted from those records the way the server counts,
 *   - name the made-up reviewers in `GET /api/user`,
 *   - and, unless the page is to be the author, sign the page in as a made-up
 *     reviewer (`GET /api/me`), because the real test user promoted the change and
 *     is its author.
 *
 * Every other request reaches the server (`route.fallback()`), the stage card's own
 * promote dry run (`WhereSpace`) included.
 */
import { type Page, type Request } from '@playwright/test';

import { type ChangeOrderFixture } from '../change-order-fixture';
import { hubApi } from '../test';

/** The Spaces a gate reads: a stage's, or the ChangeOrder's own (`base`) for the first stage. */
function gateSpacesOf(fx: ChangeOrderFixture, gateStage: string) {
  return gateStage === 'base' ? [fx.spaces.base] : fx.spacesInStage(gateStage);
}

const PROD = 'prod';

export const PEOPLE = {
  priya: { id: '00000000-0000-4000-8000-0000000000a1', name: 'Priya Nair' },
  tom: { id: '00000000-0000-4000-8000-0000000000a2', name: 'Tom Okafor' },
  lena: { id: '00000000-0000-4000-8000-0000000000a3', name: 'Lena Fischer' },
  ines: { id: '00000000-0000-4000-8000-0000000000a4', name: 'Ines Moreau' },
  sam: { id: '00000000-0000-4000-8000-0000000000a5', name: 'Sam Achterberg' },
  bot: { id: '00000000-0000-4000-8000-0000000000a6', name: 'rv-bot (Service Account)' },
} as const;
/** Members of security-reviewers, as `GET /api/user?where=GroupIDs ? '<id>'` lists them (M4). */
export const SECURITY_MEMBERS: Who[] = ['priya', 'tom', 'lena'];
export type Who = keyof typeof PEOPLE;
export const SECURITY_GROUP = '00000000-0000-4000-8000-0000000000b1';

export type State = 'pending' | 'partial' | 'satisfied' | 'rejected' | 'author' | 'revoked';
export const STATES: State[] = ['pending', 'partial', 'satisfied', 'rejected', 'author', 'revoked'];

export const HOUR = 3_600_000;

export interface Seed {
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

export const uuidOf = (seed: string, space: number) =>
  `00000000-0000-4000-9000-${(Array.from(seed).reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1e10).toString().padStart(10, '0')}${space}${seed.length % 10}`;

export interface Mocks {
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
  const gate = gateSpacesOf(fx, gateStage);
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

export interface MockOptions {
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
  /**
   * The page is the real test user, who promoted the change and so wrote it, whatever
   * the records are: the author's view of a rejected or partial review.
   */
  asAuthor?: boolean;
  /**
   * Records written through the page count from then on: an `/attest` adds its
   * records and a revocation revokes, so the box can move on after a decision.
   */
  countNewRecords?: boolean;
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

export const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

export async function postBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (request.postDataJSON() as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

export async function mockReviews(
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
  const isAuthor = state === 'author' || options.asAuthor === true;
  const viewerId = isAuthor ? authorId : PEOPLE[options.viewer ?? 'priya'].id;
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
  const gate = gateSpacesOf(fx, gateStage);

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

  if (!isAuthor) {
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
        isAuthor && row.User !== undefined ? { ...row, User: { ...row.User, GroupIDs: [SECURITY_GROUP] } } : row,
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
    if (isAuthor || (options.partialAuthor === true && index === 0)) {
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
      const revocation = { AttestationID: uuidOf('new-revoke', mocks.revokes.length), ...body };
      if (options.countNewRecords === true && typeof body.RevokedAttestationID === 'string') {
        revocations.push({ ...revocation, UserID: viewerId, CreatedAt: new Date().toISOString() });
        revokedIds.add(body.RevokedAttestationID);
      }
      return route.fulfill(json({ Attestation: revocation }));
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
            isAuthor || options.coverageAuthoredOnly === true || (options.partialAuthor === true && index === 0);
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
      if (options.countNewRecords === true) {
        gate.forEach((space, i) => {
          records.push({
            AttestationID: uuidOf(`new-${mocks.attests.length}`, i),
            ChangeOrderID: fx.changeOrderId,
            SpaceID: space.spaceId,
            SpaceSlug: space.slug,
            UserID: viewerId,
            Type: (body.Type as string | undefined) ?? 'Approval',
            Result: body.Result,
            Note: body.Note ?? '',
            CreatedAt: new Date().toISOString(),
          });
        });
      }
      return route.fulfill(
        json({
          Spaces: gate.map((space, i) => ({
            SpaceID: space.spaceId,
            SpaceSlug: space.slug,
            Attestation: { AttestationID: uuidOf(`new-${mocks.attests.length}`, i), ...body },
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
      // The stage card's own dry run names its Spaces (`WhereSpace`) and is not a gate read.
      // It reaches the server, except where a mocked hold has to be the server's answer
      // to it too: the server refuses a promotion its gates hold.
      if (body.WhereSpace !== undefined) {
        if (options.otherGateHeld !== true) return route.fallback();
        const staging = fx.spacesInStage('staging');
        const held = staging.map((space) => ({ Prerequisite: 'Promoted', SpaceID: space.spaceId, SpaceSlug: space.slug, Satisfied: false, Reason: 'NotPromoted', Message: 'staging has not taken the change' }));
        return route.fulfill(json({ DryRun: true, ChangeOrderID: fx.changeOrderId, Stages: [{ Name: PROD, PreviousStage: 'staging', Chosen: true, Gates: held }] }, 409));
      }
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
        const open = gates.every((g) => g.Satisfied === true);
        return route.fulfill(json({ DryRun: true, ChangeOrderID: fx.changeOrderId, Stages: [{ Name: 'dev', Chosen: true, Gates: gates }] }, open ? 200 : 409));
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
