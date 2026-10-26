// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Checking a gate again from the View explorer's row panel, without a browser:
// what a Trigger's run says of each gate, which Triggers a check runs, the
// request it sends, and that it leaves the cache alone. The check stores
// nothing, so it must not refetch the explorer's Units: the endpoint runs in a
// real store against a stubbed fetch, and every request after it is counted.
import { expect, test } from '@playwright/test';
import { configureStore } from '@reduxjs/toolkit';

import type { FunctionInvocationsResponse } from '@confighub/rtk-query';

import { gateCheckBody } from '../src/pages/x/view-explorer/queries/gateCheckApi';
import { gateCheckOutcome, gateCheckText, triggersToRun } from '../src/pages/x/view-explorer/unit-panel/gate-check';

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
const ran = (results: unknown, key = 'ValidationResult'): FunctionInvocationsResponse[] => [{ Success: true, Outputs: { [key]: b64(results) } }];

test.describe('what a check says of a gate', () => {
  test('passes, or fails with the first failing path\'s message', () => {
    expect(gateCheckOutcome(ran([{ Index: 0, Passed: true }]), 'ps/t/vet-celexpr')).toEqual({ state: 'passed' });
    const failed = ran([{ Index: 0, Passed: false, FailedAttributes: [{ Path: 'spec.replicas', Issues: [{ Message: 'replicas must be at least 3' }] }] }]);
    expect(gateCheckOutcome(failed, 'ps/t/vet-celexpr')).toEqual({ state: 'failed', message: 'replicas must be at least 3' });
    expect(gateCheckOutcome(ran([{ Index: 0, Passed: false, Details: ['too few'] }], 'ValidationResultList'), 'ps/t/vet')).toEqual({
      state: 'failed',
      message: 'too few',
    });
  });

  test('a numbered gate reads its own function\'s result', () => {
    const both = ran([
      { Index: 0, Passed: true },
      { Index: 1, Passed: false, Details: ['second'] },
    ]);
    expect(gateCheckOutcome(both, 'ps/t/vet:1').state).toBe('passed');
    expect(gateCheckOutcome(both, 'ps/t/vet:2')).toEqual({ state: 'failed', message: 'second' });
  });

  test('an error, or no result, is an error, never a pass', () => {
    expect(gateCheckOutcome([{ Error: { Message: 'worker not found' } }], 'g')).toEqual({ state: 'error', message: 'worker not found' });
    expect(gateCheckOutcome([], 'g')).toEqual({ state: 'error', message: 'The gate returned no result' });
    expect(gateCheckOutcome(undefined, 'g').state).toBe('error');
    expect(gateCheckOutcome([{ Success: true, Outputs: {} }], 'g').state).toBe('error');
    expect(gateCheckOutcome(ran([{ Index: 0, Passed: true }]), 'ps/t/vet:3').state).toBe('error');
  });

  test('the text of each state', () => {
    expect(gateCheckText({ state: 'running' })).toBe('Checking…');
    expect(gateCheckText({ state: 'passed' })).toBe('Passes now. The stored result stays until the Unit next changes.');
    expect(gateCheckText({ state: 'failed' })).toBe('Still fails');
    expect(gateCheckText({ state: 'error' })).toBe('Could not check: unknown error');
  });
});

test('a check runs each Trigger once, and skips a gate with no known Trigger', () => {
  const runs = triggersToRun(['ps/t/vet:1', 'ps/t/vet:2', 'ps/u/vet', 'ps/none/vet'], {
    'ps/t/vet:1': 'tr1',
    'ps/t/vet:2': 'tr1',
    'ps/u/vet': 'tr2',
  });
  expect([...runs.entries()]).toEqual([
    ['tr1', ['ps/t/vet:1', 'ps/t/vet:2']],
    ['tr2', ['ps/u/vet']],
  ]);
  expect(triggersToRun(['g'], undefined).size).toBe(0);
});

interface Sent {
  method: string;
  url: URL;
  body: string;
}

const NativeRequest = globalThis.Request;
const nativeFetch = globalThis.fetch;
let sent: Sent[] = [];

test.describe('the request', () => {
  test.beforeAll(() => {
    // The API's base URL is relative ('/api'), as in the browser; Node needs an origin.
    globalThis.Request = class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, 'http://ui.test') : input, init);
      }
    } as typeof Request;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const request = input as Request;
      sent.push({ method: request.method, url: new URL(request.url), body: request.method === 'GET' ? '' : await request.clone().text() });
      return new Response(JSON.stringify(request.method === 'GET' ? [] : [{ Success: true }]), {
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

  async function newStore() {
    const { confighubApi, configureConfigHub } = await import('@confighub/rtk-query');
    configureConfigHub({ baseUrl: 'http://ui.test' });
    await import('../src/pages/x/view-explorer/queries/gateCheckApi');
    const { applyInvalidationMap } = await import('../src/state/liveness/invalidationMap');
    applyInvalidationMap();
    const store = configureStore({
      reducer: { [confighubApi.reducerPath]: confighubApi.reducer },
      middleware: (defaults) => defaults({ serializableCheck: false }).concat(confighubApi.middleware),
    });
    const endpoints = confighubApi.endpoints as unknown as Record<string, Endpoint>;
    return (endpoint: string, arg: unknown) => store.dispatch(endpoints[endpoint].initiate(arg) as never) as unknown as Promise<{ error?: unknown }>;
  }

  /** Let RTK Query start any refetch that an invalidation scheduled. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const ARG = { spaceId: 's1', unitId: 'u1', toolchainType: 'Kubernetes/YAML', triggerId: 'tr1' };

  test('is the Unit page\'s: the one Trigger, every function, nothing stored', async () => {
    expect(gateCheckBody(ARG)).toEqual({ ToolchainType: 'Kubernetes/YAML', Triggers: ['tr1'], StopOnError: false, FunctionInvocations: null });
    const dispatch = await newStore();
    const result = await dispatch('checkUnitGate', ARG);
    expect(result.error).toBeUndefined();
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(`${request.method} ${request.url.pathname}`).toBe('POST /api/function/invoke');
    expect(request.url.searchParams.get('executor_space')).toBe('s1');
    expect(request.url.searchParams.get('where')).toBe("UnitID = 'u1'");
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(body).toEqual({ ToolchainType: 'Kubernetes/YAML', Triggers: ['tr1'], StopOnError: false, FunctionInvocations: null });
    expect(body).not.toHaveProperty('UpdateValidationResults');
    expect(body).not.toHaveProperty('CacheTriggerResults');
  });

  test('refetches no Unit read', async () => {
    const dispatch = await newStore();
    await dispatch('listAllUnits', { select: 'UnitID' });
    await dispatch('getUnit', { spaceId: 's1', unitId: 'u1' });
    sent = [];
    await dispatch('checkUnitGate', ARG);
    await settle();
    expect(sent.map((s) => `${s.method} ${s.url.pathname}`)).toEqual(['POST /api/function/invoke']);
  });

  test('control: the generated invoke does refetch them', async () => {
    // Proves the harness sees an invalidation, so the test above does not pass only because nothing could refetch.
    const dispatch = await newStore();
    await dispatch('listAllUnits', { select: 'UnitID' });
    sent = [];
    await dispatch('invokeFunctionsOnOrg', { executorSpace: 's1', where: "UnitID = 'u1'", functionInvocationsRequest: gateCheckBody(ARG) });
    await settle();
    expect(sent.filter((s) => s.method === 'GET').map((s) => s.url.pathname)).toEqual(['/api/unit']);
  });
});
