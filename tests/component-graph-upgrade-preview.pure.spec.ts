// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The request previewUnitUpgrade really sends, and what it leaves in the cache.
// The server answers a PATCH /unit that is not application/merge-patch+json
// with HTTP 400, and the shared prepareHeaders sets that type only for endpoint
// names with a patch prefix, so the header is checked on the wire. The preview
// writes nothing, so it must not refetch the Component's Units and Revisions:
// the endpoints run in a real store against a stubbed fetch, and every request
// after the preview is counted.
import { expect, test } from '@playwright/test';
import { configureStore } from '@reduxjs/toolkit';

interface Sent {
  method: string;
  url: URL;
  contentType: string | null;
  body: string;
}

const NativeRequest = globalThis.Request;
const nativeFetch = globalThis.fetch;

let sent: Sent[] = [];

test.beforeAll(() => {
  // The API's base URL is relative ('/api'), as in the browser; Node needs an origin.
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, 'http://ui.test') : input, init);
    }
  } as typeof Request;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const request = input as Request;
    sent.push({
      method: request.method,
      url: new URL(request.url),
      contentType: request.headers.get('content-type'),
      body: request.method === 'GET' ? '' : await request.clone().text(),
    });
    return new Response(JSON.stringify(request.method === 'GET' ? [] : {}), {
      status: 200,
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
});

type Endpoint = { initiate: (arg: unknown) => unknown };

/** A fresh store with the endpoints and tag rules the Components page has. */
async function newStore() {
  const { confighubApi, configureConfigHub } = await import('@confighub/rtk-query');
  configureConfigHub({ baseUrl: 'http://ui.test' });
  await import('../src/hooks/chunkedQueriesApi');
  await import('../src/pages/x/apps/upgradePreviewApi');
  const { applyInvalidationMap } = await import('../src/state/liveness/invalidationMap');
  applyInvalidationMap();
  const store = configureStore({
    reducer: { [confighubApi.reducerPath]: confighubApi.reducer },
    middleware: (defaults) =>
      defaults({ serializableCheck: false }).concat(confighubApi.middleware),
  });
  // The injected endpoints are typed on their own modules' exports; this spec
  // needs only initiate(), so it reads them by name.
  const endpoints = confighubApi.endpoints as unknown as Record<string, Endpoint>;
  const dispatch = (endpoint: string, arg: unknown) =>
    store.dispatch(endpoints[endpoint].initiate(arg) as never) as unknown as Promise<{
      error?: unknown;
    }> & { unsubscribe?: () => void };
  return { dispatch };
}

/** Let RTK Query start any refetch that an invalidation scheduled. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The arguments AppComponentView sends for the preview of one card. */
const PREVIEW_ARG = {
  where: "UnitID IN ('00000000-0000-0000-0000-000000000001')",
  include: 'ConfigData',
  body: JSON.stringify({}),
};

test('previewUnitUpgrade sends a merge-patch dry-run upgrade', async () => {
  const { dispatch } = await newStore();
  const result = await dispatch('previewUnitUpgrade', PREVIEW_ARG);
  expect(result.error).toBeUndefined();
  expect(sent).toHaveLength(1);
  const [request] = sent;
  expect(request.method).toBe('PATCH');
  expect(request.url.pathname).toBe('/api/unit');
  expect(request.contentType).toBe('application/merge-patch+json');
  expect(request.body).toBe('{}');
  expect(request.url.searchParams.get('upgrade')).toBe('true');
  expect(request.url.searchParams.get('dry_run')).toBe('true');
  expect(request.url.searchParams.get('where')).toBe(PREVIEW_ARG.where);
  expect(request.url.searchParams.get('include')).toBe('ConfigData');
});

/** Subscribe to one Unit read and one Revision read, as the Components page does. */
async function primeUnitAndRevisionReads(
  dispatch: Awaited<ReturnType<typeof newStore>>['dispatch'],
) {
  await dispatch('listAllUnitsChunked', { spaceIds: ['space-a'], select: 'UnitID' });
  await dispatch('searchRevisionDataChunked', { revisionIds: ['revision-a'] });
  expect(sent.map((s) => s.url.pathname)).toEqual(['/api/unit', '/api/revision_data']);
  sent = [];
}

test('previewUnitUpgrade invalidates no Unit or Revision tags', async () => {
  const { dispatch } = await newStore();
  await primeUnitAndRevisionReads(dispatch);
  await dispatch('previewUnitUpgrade', PREVIEW_ARG);
  await settle();
  expect(sent.map((s) => `${s.method} ${s.url.pathname}`)).toEqual(['PATCH /api/unit']);
});

test('control: a dry run through bulkPatchUnits does refetch both reads', async () => {
  // Proves the harness sees an invalidation, so the test above is not
  // passing only because nothing could ever refetch.
  const { dispatch } = await newStore();
  await primeUnitAndRevisionReads(dispatch);
  await dispatch('bulkPatchUnits', { ...PREVIEW_ARG, upgrade: true, dryRun: true });
  await settle();
  const gets = sent.filter((s) => s.method === 'GET').map((s) => s.url.pathname);
  expect(gets.sort()).toEqual(['/api/revision_data', '/api/unit']);
});
