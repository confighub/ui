// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a ChangeSet changed in each of its units, as the server diffs it: one read per unit,
 * from the Revision before the ChangeSet to the unit's head.
 *
 * Both ends are Revision numbers, which do not change once made, so the reads carry no tag:
 * a write to one unit moves its head and reads that unit again, and the others stay as they
 * are in the cache. A unit created in the ChangeSet has no Revision before it, and is read
 * from nothing (`POST /diff` with an empty From), since `GET /unit/{id}/diff` with no From
 * diffs against the Revision before the To.
 *
 * The reads go a few at a time, and each stays subscribed while the caller is mounted.
 */
import { useEffect, useMemo } from 'react';
import { shallowEqual } from 'react-redux';

import type { ConfigDiff } from '@confighub/rtk-query';

import { MAX_PARALLEL_CHUNKS } from '@/hooks/chunkedQueriesApi';
import { configDiffApi, type ConfigDiffArgs, isNothingToDiff, type RevisionDiffArgs } from '@/hooks/configDiffApi';
import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import type { AppDispatch, RootState } from '@/state/store';
import { getApiErrorMessage } from '@/utility/error-functions';

/** One unit's diff to read. */
export interface ChangeSetDiffRead {
  spaceId: string;
  unitId: string;
  /** The Revision before the ChangeSet; 0 for a unit created in it, which is read from nothing. */
  fromRevisionNum: number;
  toRevisionNum: number;
}

export interface ChangeSetDiffs {
  /** Each read unit's diff by UnitID. A unit whose read is pending or failed is absent. */
  diffByUnitId: ReadonlyMap<string, ConfigDiff>;
  /** Why each failed read failed, by UnitID. */
  errorByUnitId: ReadonlyMap<string, string>;
}

type DiffQuery =
  | { kind: 'revisions'; unitId: string; args: RevisionDiffArgs }
  | { kind: 'fromNothing'; unitId: string; args: ConfigDiffArgs };

const FIELD_SEPARATOR = '|';

/** One object for every empty answer, so selecting it twice finds no change. */
const NO_CHANGES: ConfigDiff = {};

/**
 * One line per read, sorted, so that a new list of the same units at the same Revisions reads
 * nothing again. The unit list refetches often, and most refetches change none of these numbers.
 */
function readsKeyOf(reads: readonly ChangeSetDiffRead[]): string {
  return reads
    .map((r) => [r.spaceId, r.unitId, r.fromRevisionNum, r.toRevisionNum].join(FIELD_SEPARATOR))
    .sort()
    .join('\n');
}

function queryOf(line: string): DiffQuery {
  const [spaceId, unitId, from, to] = line.split(FIELD_SEPARATOR);
  if (Number(from) > 0) return { kind: 'revisions', unitId, args: { spaceId, unitId, from, to } };
  return { kind: 'fromNothing', unitId, args: { diffRequest: { From: {}, To: { UnitID: unitId, Revision: to } } } };
}

function subscribe(dispatch: AppDispatch, query: DiffQuery): Promise<unknown> & { unsubscribe: () => void } {
  return query.kind === 'revisions'
    ? dispatch(configDiffApi.endpoints.getRevisionDiff.initiate(query.args))
    : dispatch(configDiffApi.endpoints.getConfigDiff.initiate(query.args));
}

/** The read's diff, or its error; neither while it is pending. */
function selectorOf(query: DiffQuery): (state: RootState) => { diff?: ConfigDiff; error?: unknown } {
  if (query.kind === 'revisions') {
    const select = configDiffApi.endpoints.getRevisionDiff.select(query.args);
    return (state) => {
      const { data, error } = select(state);
      return { diff: data ? (data.Diff ?? NO_CHANGES) : undefined, error };
    };
  }
  const select = configDiffApi.endpoints.getConfigDiff.select(query.args);
  return (state) => {
    const { data, error } = select(state);
    if (!data) return { error };
    return { diff: isNothingToDiff(data) ? NO_CHANGES : (data.Diff ?? NO_CHANGES), error };
  };
}

export function useChangeSetDiffs(reads: readonly ChangeSetDiffRead[]): ChangeSetDiffs {
  const dispatch = useAppDispatch();
  const readsKey = useMemo(() => readsKeyOf(reads), [reads]);
  const queries = useMemo(() => (readsKey === '' ? [] : readsKey.split('\n').map(queryOf)), [readsKey]);

  // A read already in the cache is served from it when it is subscribed to again, so a new
  // set of units asks the server only for the units that are new or have moved.
  useEffect(() => {
    const subscriptions: { unsubscribe: () => void }[] = [];
    let cancelled = false;
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < queries.length) {
        const subscription = subscribe(dispatch, queries[next++]);
        subscriptions.push(subscription);
        await subscription;
      }
    };
    void Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_CHUNKS, queries.length) }, () => worker()));
    return () => {
      cancelled = true;
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [dispatch, queries]);

  const selectors = useMemo(() => queries.map(selectorOf), [queries]);
  // Flattened to [diff, error, diff, error, ...], so a shallow compare finds no change when
  // no read moved: each selected object is new on every call, its fields are not.
  const results = useAppSelector(
    (state) => selectors.flatMap((select) => {
      const { diff, error } = select(state);
      return [diff, error];
    }),
    shallowEqual,
  );

  return useMemo(() => {
    const diffByUnitId = new Map<string, ConfigDiff>();
    const errorByUnitId = new Map<string, string>();
    queries.forEach((query, at) => {
      const diff = results[2 * at] as ConfigDiff | undefined;
      const error = results[2 * at + 1];
      if (diff !== undefined) diffByUnitId.set(query.unitId, diff);
      else if (error !== undefined) errorByUnitId.set(query.unitId, getApiErrorMessage(error, 'The diff could not be read'));
    });
    return { diffByUnitId, errorByUnitId };
  }, [queries, results]);
}
