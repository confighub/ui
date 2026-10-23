// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import type { RootState } from '@/state/store';
import { getApiErrorMessage } from '@/utility/error-functions';
import { confighubApi } from '@confighub/rtk-query';

import type { EntityKind, ViewDef } from '../model/types';

/**
 * Match sets the server answers, keyed by lens id: every Custom WHERE lens
 * (enabled or hidden, so its own "−N" and "alone N" are right), plus, for
 * Units, the Filter's WhereData and ResourceType under the fixed keys below.
 *
 * Each one is its own request (`where=<one conjunct>`, ids only), so the
 * counts of one lens never mix with another's. RTK Query caches each request
 * by its arguments: hiding, showing or reordering lenses makes no new request.
 *
 * A set is never null. An answer belongs to its exact request (the entity and
 * the expression): while a request loads, its key matches nothing, so the
 * table never shows unfiltered rows, nor the rows of another tab's or an
 * earlier expression's answer; `useServerMatchStatus` says that it is
 * loading. A refused condition matches nothing, and its message is in
 * `useServerMatchStatus`.
 */

export type ServerMatchSets = ReadonlyMap<string, ReadonlySet<string> | null>;

export const WHERE_DATA_KEY = 'filter:whereData';
export const RESOURCE_TYPE_KEY = 'filter:resourceType';

interface ServerRequest {
  key: string;
  where?: string;
  whereData?: string;
  resourceType?: string;
}

/** The requests a view needs: one per Custom WHERE lens that is complete, and the Units-only Filter fields. */
export function serverRequests(def: ViewDef): ServerRequest[] {
  const out: ServerRequest[] = [];
  for (const l of def.lenses) {
    // Every written condition goes to the server, even one the client cannot
    // parse: the server decides, and a refusal is shown as an error.
    if (l.kind !== 'custom' || !l.where.trim()) continue;
    out.push({ key: l.id, where: l.where.trim() });
  }
  if (def.entity === 'Unit') {
    if (def.whereData.trim())
      out.push({ key: WHERE_DATA_KEY, whereData: def.whereData.trim() });
    if (def.resourceType.trim())
      out.push({ key: RESOURCE_TYPE_KEY, resourceType: def.resourceType.trim() });
  }
  return out;
}

const unitArgs = (r: ServerRequest) => ({
  where: r.where,
  whereData: r.whereData,
  resourceType: r.resourceType,
  select: 'UnitID',
  include: '',
});
const spaceArgs = (r: ServerRequest) => ({ where: r.where, select: 'SpaceID' });
const resourceArgs = (r: ServerRequest) => ({ where: r.where, select: 'ResourceID' });

interface RequestState {
  data: readonly unknown[] | undefined;
  error: unknown;
}

/** What one request has now: its rows, or the error the server answered with. */
function selectRequest(state: RootState, entity: EntityKind, r: ServerRequest): RequestState {
  const result =
    entity === 'Unit'
      ? confighubApi.endpoints.listAllUnits.select(unitArgs(r))(state)
      : entity === 'Space'
        ? confighubApi.endpoints.listSpaces.select(spaceArgs(r))(state)
        : confighubApi.endpoints.listAllResources.select(resourceArgs(r))(state);
  return { data: result.data, error: result.error };
}

function idOf(entity: EntityKind, row: unknown): string {
  const r = row as {
    Unit?: { UnitID?: string };
    Space?: { SpaceID?: string };
    Resource?: { ResourceID?: string };
  };
  if (entity === 'Unit') return r.Unit?.UnitID ?? '';
  if (entity === 'Space') return r.Space?.SpaceID ?? '';
  return r.Resource?.ResourceID ?? '';
}

/**
 * The id set of one answer, made once per answer: RTK Query keeps the same
 * data array until the answer changes, so the same answer always gives the
 * same set, and the memos that take the sets keep their result.
 */
const idSets = new WeakMap<readonly unknown[], ReadonlySet<string>>();
function idSetOf(entity: EntityKind, data: readonly unknown[]): ReadonlySet<string> {
  let set = idSets.get(data);
  if (!set) {
    set = new Set(data.map((row) => idOf(entity, row)));
    idSets.set(data, set);
  }
  return set;
}

const sameStates = (a: RequestState[], b: RequestState[]) =>
  a.length === b.length && a.every((x, i) => x.data === b[i].data && x.error === b[i].error);

const NONE: ServerMatchSets = new Map();
const NOTHING: ReadonlySet<string> = new Set();

/** The view's requests, stable while their arguments are the same. */
function useStableRequests(def: ViewDef): ServerRequest[] {
  const requests = serverRequests(def);
  const requestsKey = JSON.stringify(requests);
  // requestsKey stands for `requests`, which is a new array on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => requests, [requestsKey]);
}

function useRequestStates(entity: EntityKind, requests: ServerRequest[]): RequestState[] {
  // A stable selector, so the store's memo can keep the last selection.
  const select = useCallback(
    (state: RootState) => requests.map((r) => selectRequest(state, entity, r)),
    [requests, entity],
  );
  return useAppSelector<RequestState[]>(select, sameStates);
}

/**
 * The match sets, by key. A condition the server refused matches nothing
 * (never everything), and so does one still loading its first answer.
 */
export function useServerMatchSets(def: ViewDef): ServerMatchSets {
  const dispatch = useAppDispatch();
  const entity = def.entity;
  const requests = useStableRequests(def);

  // One RTK Query subscription per request, held while the view needs it.
  // The hooks API has no form for a list of queries of varying length, so the
  // subscriptions are started and released here.
  useEffect(() => {
    const subs = requests.map((r) => {
      if (entity === 'Unit')
        return dispatch(confighubApi.endpoints.listAllUnits.initiate(unitArgs(r)));
      if (entity === 'Space')
        return dispatch(confighubApi.endpoints.listSpaces.initiate(spaceArgs(r)));
      return dispatch(confighubApi.endpoints.listAllResources.initiate(resourceArgs(r)));
    });
    return () => subs.forEach((s) => s.unsubscribe());
  }, [dispatch, entity, requests]);

  const states = useRequestStates(entity, requests);
  // The answers in now, by key.
  const fresh = useMemo(() => {
    const out = new Map<string, ReadonlySet<string>>();
    requests.forEach((r, i) => {
      const { data, error } = states[i];
      if (data && !error) out.set(r.key, idSetOf(entity, data));
    });
    return out;
  }, [requests, states, entity]);

  return useMemo(() => {
    if (!requests.length) return NONE;
    return new Map(
      requests.map((r, i) => {
        if (states[i].error) return [r.key, NOTHING] as const;
        return [r.key, fresh.get(r.key) ?? NOTHING] as const;
      }),
    );
  }, [requests, states, fresh]);
}

export interface ServerMatchStatus {
  /** True while any condition waits for its answer. */
  loading: boolean;
  /** The server's message for each refused condition, by the same keys (lens id, or `filter:*`). */
  errors: ReadonlyMap<string, string>;
}

const IDLE: ServerMatchStatus = { loading: false, errors: new Map() };

/** Whether the server's answers are in, and why any condition was refused. */
export function useServerMatchStatus(def: ViewDef): ServerMatchStatus {
  const requests = useStableRequests(def);
  const states = useRequestStates(def.entity, requests);
  return useMemo(() => {
    if (!requests.length) return IDLE;
    const errors = new Map<string, string>();
    let loading = false;
    requests.forEach((r, i) => {
      const { data, error } = states[i];
      if (error)
        errors.set(r.key, getApiErrorMessage(error, 'The server refused this condition.'));
      else if (!data) loading = true;
    });
    return { loading, errors };
  }, [requests, states]);
}
