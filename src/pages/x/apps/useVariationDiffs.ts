// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What each downstream Unit differs from its upstream in, as the server diffs it: one
 * `POST /diff` per Unit from the upstream's head to the Unit's head (the live variation),
 * and, for a Unit with an upgrade dry run, one more from the upstream's head to the
 * configuration the dry run produced, sent inline (the post-upgrade variation). The server
 * has no bulk form of either.
 *
 * Each head is named by its Revision number, so a read stays valid until that Unit or its
 * upstream gets a new head, and carries no tag: a write to one Unit reads that Unit again
 * and leaves the rest in the cache. The inline configuration is part of the cache key, so
 * a new dry run is a new read; the old one is unsubscribed and dropped from the cache.
 *
 * The reads go a few at a time, and each stays subscribed while the caller is mounted and
 * still asks for it. While a Unit's new read is in flight, its last answer stands in, as
 * the upgrade preview keeps its last dry run until the next lands: a Unit is pending only
 * until its first answer.
 */
import { useEffect, useMemo, useRef } from 'react';
import { shallowEqual } from 'react-redux';

import type { ConfigDiff } from '@confighub/rtk-query';

import { MAX_PARALLEL_CHUNKS } from '@/hooks/chunkedQueriesApi';
import { configDiffApi, type ConfigDiffArgs } from '@/hooks/configDiffApi';
import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import type { RootState } from '@/state/store';
import { getApiErrorMessage } from '@/utility/error-functions';

import type { VariationDiffs } from './entryBuilders';

/** One downstream Unit whose variation to read. */
export interface VariationDiffRead {
  unitId: string;
  revisionNum: number;
  upstreamUnitId: string;
  upstreamRevisionNum: number;
  toolchainType?: string;
}

export interface VariationDiffsResult extends VariationDiffs {
  /** Units with a read neither landed nor failed. */
  pendingUnitIds: ReadonlySet<string>;
  /** Why a Unit's read failed, by UnitID. */
  errorByUnitId: ReadonlyMap<string, string>;
}

interface VariationQuery {
  unitId: string;
  side: 'live' | 'postUpgrade';
  args: ConfigDiffArgs;
}

const FIELD_SEPARATOR = '|';

/** One object for every empty answer, so selecting it twice finds no change. */
const NO_CHANGES: ConfigDiff = {};

/**
 * One line per read, sorted, so that a new list of the same Units at the same Revisions
 * reads nothing again. The Unit list refetches often, and most refetches change none of
 * these numbers.
 */
function readsKeyOf(reads: readonly VariationDiffRead[]): string {
  return reads
    .map((r) => [r.unitId, r.revisionNum, r.upstreamUnitId, r.upstreamRevisionNum, r.toolchainType ?? ''].join(FIELD_SEPARATOR))
    .sort()
    .join('\n');
}

function queriesOf(readsKey: string, dryRunData: ReadonlyMap<string, string> | undefined): VariationQuery[] {
  if (readsKey === '') return [];
  return readsKey.split('\n').flatMap((line) => {
    const [unitId, revisionNum, upstreamUnitId, upstreamRevisionNum, toolchainType] = line.split(FIELD_SEPARATOR);
    const from = { UnitID: upstreamUnitId, Revision: upstreamRevisionNum };
    const queries: VariationQuery[] = [
      { unitId, side: 'live', args: { diffRequest: { From: from, To: { UnitID: unitId, Revision: revisionNum } } } },
    ];
    const data = dryRunData?.get(unitId);
    if (data !== undefined) {
      queries.push({
        unitId,
        side: 'postUpgrade',
        args: { diffRequest: { From: from, To: { Data: data, ...(toolchainType ? { ToolchainType: toolchainType } : {}) } } },
      });
    }
    return queries;
  });
}

function selectorOf(query: VariationQuery): (state: RootState) => { diff?: ConfigDiff; error?: unknown } {
  const select = configDiffApi.endpoints.getConfigDiff.select(query.args);
  return (state) => {
    const { data, error } = select(state);
    return { diff: data ? (data.Diff ?? NO_CHANGES) : undefined, error };
  };
}

/**
 * The variation diffs of `reads`. `dryRunData` is the configuration each Unit's upgrade
 * dry run produced, by UnitID; a Unit in it is read post-upgrade too.
 */
export function useVariationDiffs(
  reads: readonly VariationDiffRead[],
  dryRunData: ReadonlyMap<string, string> | undefined,
): VariationDiffsResult {
  const dispatch = useAppDispatch();
  const readsKey = useMemo(() => readsKeyOf(reads), [reads]);
  const queries = useMemo(() => queriesOf(readsKey, dryRunData), [readsKey, dryRunData]);

  // A read already in the cache is served from it when it is subscribed to again, so a new
  // set of Units asks the server only for the Units that are new or have moved.
  useEffect(() => {
    const subscriptions: { unsubscribe: () => void }[] = [];
    let cancelled = false;
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < queries.length) {
        const subscription = dispatch(configDiffApi.endpoints.getConfigDiff.initiate(queries[next++].args));
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

  // The last answer of each Unit's read on each side, by `${side}:${unitId}`.
  const lastAnswerRef = useRef(new Map<string, ConfigDiff>());

  return useMemo(() => {
    const live = new Map<string, ConfigDiff>();
    const postUpgrade = new Map<string, ConfigDiff>();
    const pendingUnitIds = new Set<string>();
    const errorByUnitId = new Map<string, string>();
    const lastAnswers = new Map<string, ConfigDiff>();
    queries.forEach((query, at) => {
      const slot = `${query.side}:${query.unitId}`;
      const error = results[2 * at + 1];
      const diff = (results[2 * at] as ConfigDiff | undefined)
        ?? (error === undefined ? lastAnswerRef.current.get(slot) : undefined);
      if (diff !== undefined) {
        (query.side === 'live' ? live : postUpgrade).set(query.unitId, diff);
        lastAnswers.set(slot, diff);
      } else if (error !== undefined) {
        errorByUnitId.set(query.unitId, getApiErrorMessage(error, 'The difference from upstream could not be read'));
      } else {
        pendingUnitIds.add(query.unitId);
      }
    });
    lastAnswerRef.current = lastAnswers;
    for (const unitId of errorByUnitId.keys()) pendingUnitIds.delete(unitId);
    return { live, postUpgrade, pendingUnitIds, errorByUnitId };
  }, [queries, results]);
}
