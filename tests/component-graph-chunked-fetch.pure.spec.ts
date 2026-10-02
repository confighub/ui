// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The requests the chunked RTK endpoints really send, not only the clauses
// chunkInClause returns. A large Component's unit read failed with HTTP 400
// because its one `SpaceID IN (...)` made the query string longer than the
// server's 8,192 characters, and a Revision search asked for more than its
// 1,000-row limit. Here the endpoints run in a real store against a stubbed
// fetch, so the URL each request carries (with `select`, `include`, `limit`
// and the percent-encoding) is what is measured.
import { expect, test } from '@playwright/test';
import { configureStore } from '@reduxjs/toolkit';
import { skipToken } from '@reduxjs/toolkit/query';

import { DEFAULT_MAX_IN_ITEMS } from '../src/hooks/inClauseChunks';

/** The server rejects a longer query string. */
const MAX_QUERY_STRING = 8192;

/** A deterministic UUID-shaped id, so each quoted id is as long as in production. */
const uuid = (n: number) => {
  const hex = n.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const uuids = (count: number, from = 1) =>
  Array.from({ length: count }, (_, i) => uuid(from + i));

/** The `select` and `include` AppComponentView sends with the unit read. */
const UNIT_SELECT =
  'UnitID,Slug,SpaceID,TargetID,UpstreamUnitID,UpstreamRevisionNum,HeadRevisionNum,LastReleasedRevisionNum,ValidationErrors,ToolchainType,DataHash,DataSize,' +
  'HeadRevision.RevisionID,HeadRevision.CreatedAt,HeadRevision.Description,LastReleasedRevision.RevisionID';
const UNIT_INCLUDE = 'SpaceID,TargetID,UpstreamUnitID,HeadRevisionNum,LastReleasedRevisionNum';

/** The ids a `<column> IN ('a', 'b')` clause asks for. */
function idsIn(where: string): string[] {
  const open = where.indexOf('(');
  return where
    .slice(open + 1, -1)
    .split(', ')
    .map((quoted) => quoted.slice(1, -1));
}

interface Sent {
  url: URL;
  where: string;
  ids: string[];
}

type Respond = (sent: Sent) => { status: number; rows: unknown[] };

const NativeRequest = globalThis.Request;
const nativeFetch = globalThis.fetch;

let sent: Sent[] = [];
let inFlight = 0;
let maxInFlight = 0;
let respond: Respond = (s) => ({ status: 200, rows: s.ids.map((id) => ({ id })) });

test.beforeAll(() => {
  // The API's base URL is relative ('/api'), as in the browser; Node needs an origin.
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, 'http://ui.test') : input, init);
    }
  } as typeof Request;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const where = url.searchParams.get('where') ?? '';
    const s = { url, where, ids: idsIn(where) };
    sent.push(s);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    // Let the other chunk workers start before this one answers.
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight--;
    const { status, rows } = respond(s);
    return new Response(JSON.stringify(status === 200 ? rows : { message: 'boom' }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
});

test.afterAll(() => {
  globalThis.Request = NativeRequest;
  globalThis.fetch = nativeFetch;
});

test.beforeEach(() => {
  sent = [];
  inFlight = 0;
  maxInFlight = 0;
  respond = (s) => ({ status: 200, rows: s.ids.map((id) => ({ id })) });
});

/** A fresh store, so no test reads another test's cache. */
async function newStore() {
  const { confighubApi, configureConfigHub } = await import('@confighub/rtk-query');
  configureConfigHub({ baseUrl: 'http://ui.test' });
  // Importing the module injects the chunked endpoints into confighubApi.
  await import('../src/hooks/chunkedQueriesApi');
  const store = configureStore({
    reducer: { [confighubApi.reducerPath]: confighubApi.reducer },
    middleware: (defaults) =>
      defaults({ serializableCheck: false }).concat(confighubApi.middleware),
  });
  // The injected endpoints are typed on the module's own export; this spec
  // needs only initiate() and select(), so it reads them by name.
  const endpoints = confighubApi.endpoints as unknown as Record<
    string,
    { initiate: (arg: unknown) => unknown }
  >;
  const run = async <T>(endpoint: string, arg: unknown) => {
    const result = (await store.dispatch(endpoints[endpoint].initiate(arg) as never)) as {
      data?: T;
      error?: unknown;
      unsubscribe?: () => void;
    };
    result.unsubscribe?.();
    return result;
  };
  return { run, store, endpoints: confighubApi.endpoints as unknown as ChunkedEndpoints };
}

/** Only what the skip test calls. */
type ChunkedEndpoints = Record<
  string,
  { select: (arg: unknown) => (state: unknown) => { isUninitialized: boolean } }
>;

function expectUnderLimits(requests: Sent[]) {
  for (const s of requests) {
    expect(s.url.search.length - 1, 'query string length').toBeLessThanOrEqual(
      MAX_QUERY_STRING,
    );
    expect(s.ids.length).toBeLessThanOrEqual(DEFAULT_MAX_IN_ITEMS);
    const limit = s.url.searchParams.get('limit');
    if (limit !== null) expect(Number(limit)).toBeLessThanOrEqual(DEFAULT_MAX_IN_ITEMS);
  }
}

function expectEachIdOnce(requests: Sent[], ids: string[]) {
  const asked = requests.flatMap((s) => s.ids);
  expect(asked.length).toBe(ids.length);
  expect(new Set(asked)).toEqual(new Set(ids));
}

test.describe('listAllUnitsChunked (the Component unit read)', () => {
  test('cert-manager size (104 Spaces): every request is under the limits', async () => {
    const { run } = await newStore();
    const ids = uuids(104);
    const result = await run<unknown[]>('listAllUnitsChunked', {
      spaceIds: ids,
      select: UNIT_SELECT,
      include: UNIT_INCLUDE,
    });
    expect(result.error).toBeUndefined();
    expect(result.data).toHaveLength(104);
    expectUnderLimits(sent);
    expectEachIdOnce(sent, ids);
    for (const s of sent) {
      expect(s.url.pathname).toBe('/api/unit');
      expect(s.url.searchParams.get('select')).toBe(UNIT_SELECT);
      expect(s.url.searchParams.get('include')).toBe(UNIT_INCLUDE);
      expect(s.where.startsWith('SpaceID IN (')).toBe(true);
    }
  });

  test('1,500 Spaces: split into several requests, rows in chunk order, at most 4 at once', async () => {
    const { run } = await newStore();
    const ids = uuids(1500);
    const result = await run<{ id: string }[]>('listAllUnitsChunked', {
      spaceIds: ids,
      select: UNIT_SELECT,
      include: UNIT_INCLUDE,
    });
    expect(sent.length).toBeGreaterThan(1);
    expectUnderLimits(sent);
    expectEachIdOnce(sent, ids);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    // Ids are sorted for the cache key, and chunk order is kept, so the rows
    // come back sorted even though the requests finished out of order.
    expect(result.data!.map((r) => r.id)).toEqual([...ids].sort());
  });

  test('one failed chunk fails the whole read: never a partial list', async () => {
    const { run } = await newStore();
    const ids = uuids(1500, 5000);
    respond = (s) =>
      s === sent[1]
        ? { status: 500, rows: [] }
        : { status: 200, rows: s.ids.map((id) => ({ id })) };
    const result = await run<unknown[]>('listAllUnitsChunked', {
      spaceIds: ids,
      select: UNIT_SELECT,
      include: UNIT_INCLUDE,
    });
    expect(result.data).toBeUndefined();
    expect(result.error).toMatchObject({ status: 500 });
  });

  test('the same Spaces in another order, or repeated, are one cache entry', async () => {
    const { run } = await newStore();
    const ids = uuids(30, 9000);
    await run('listAllUnitsChunked', { spaceIds: ids, select: 'UnitID' });
    const first = sent.length;
    expect(first).toBe(1);
    await run('listAllUnitsChunked', {
      spaceIds: [...ids].reverse().concat(ids.slice(0, 5), ['']),
      select: 'UnitID',
    });
    expect(sent.length).toBe(first);
  });

  test('no Spaces: no request', async () => {
    const { run } = await newStore();
    const result = await run<unknown[]>('listAllUnitsChunked', { spaceIds: [] });
    expect(sent).toHaveLength(0);
    expect(result.data).toEqual([]);
  });
});

test.describe('the unit and revision reads by id', () => {
  test('searchUnitDataChunked: 520 Units (cert-manager) stay under the limits', async () => {
    const { run } = await newStore();
    const ids = uuids(520, 20_000);
    const result = await run<unknown[]>('searchUnitDataChunked', { unitIds: ids });
    expect(result.data).toHaveLength(520);
    expect(sent.length).toBeGreaterThan(1);
    expectUnderLimits(sent);
    expectEachIdOnce(sent, ids);
    for (const s of sent) expect(s.url.pathname).toBe('/api/unit_data');
  });

  test('searchRevisionDataChunked: `limit` is the ids in each request, never over 1,000', async () => {
    const { run } = await newStore();
    const ids = uuids(2600, 40_000);
    await run('searchRevisionDataChunked', { revisionIds: ids });
    expect(sent.length).toBeGreaterThan(2);
    expectUnderLimits(sent);
    expectEachIdOnce(sent, ids);
    for (const s of sent) {
      expect(s.url.searchParams.get('distinct_on')).toBe('Off');
      expect(Number(s.url.searchParams.get('limit'))).toBe(s.ids.length);
    }
  });

  test('the mutation-source reads stay under the limits too', async () => {
    const { run } = await newStore();
    await run('searchUnitMutationSourcesChunked', { unitIds: uuids(700, 60_000) });
    await run('searchRevisionMutationSourcesChunked', { revisionIds: uuids(1300, 70_000) });
    expect(sent.length).toBeGreaterThan(2);
    expectUnderLimits(sent);
  });
});

test.describe('a skipped read', () => {
  // A hook with `skip: true` (for example useUnitDataMap before any Unit is
  // known) makes RTK run the endpoint's serializeQueryArgs on skipToken. A
  // throw there crashed the Components page on its first render.
  for (const endpoint of [
    'listAllUnitsChunked',
    'searchUnitDataChunked',
    'searchRevisionDataChunked',
    'searchUnitMutationSourcesChunked',
    'searchRevisionMutationSourcesChunked',
  ]) {
    test(`${endpoint}: selecting skipToken does not throw and sends nothing`, async () => {
      const { store, endpoints } = await newStore();
      const state = endpoints[endpoint].select(skipToken)(store.getState());
      expect(state.isUninitialized).toBe(true);
      expect(sent).toHaveLength(0);
    });
  }
});
