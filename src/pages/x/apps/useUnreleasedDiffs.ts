// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What each Unit with unreleased changes changes since its last release, as the server diffs
 * it, so the Component search finds a Unit by a value that change replaces or removes.
 *
 * Each Unit is its own read of `GET /space/{s}/unit/{u}/diff` between two Revision numbers the
 * Unit list already holds. A numbered Revision never changes, so the read carries no tag: a
 * write to one Unit moves that Unit's head and reads that Unit again, and the others stay as
 * they are in the cache. A Unit never released needs no read, because every value of its head
 * is in its apply entry's `allPaths`, which the search reads already.
 *
 * The reads go a few at a time, and each stays subscribed while the caller is mounted.
 */
import { useEffect, useMemo } from 'react';
import { shallowEqual } from 'react-redux';

import type { ExtendedUnitRead, UnitDiff } from '@confighub/rtk-query';

import { MAX_PARALLEL_CHUNKS } from '@/hooks/chunkedQueriesApi';
import { configDiffApi, type RevisionDiffArgs } from '@/hooks/configDiffApi';
import { useAppDispatch, useAppSelector } from '@/hooks/useApp';

/** Each read Unit's diff by its UnitID. A Unit whose read is pending or failed is absent. */
export type UnreleasedDiffsByUnitId = Record<string, UnitDiff>;

const FIELD_SEPARATOR = '|';

/**
 * One line per Unit to read, sorted, so that a new list of the same Units at the same
 * Revisions reads nothing again. The Unit list refetches often, and most refetches change none
 * of these numbers.
 */
function rangesKeyOf(units: readonly ExtendedUnitRead[]): string {
  const lines: string[] = [];
  for (const u of units) {
    const spaceId = u.Unit?.SpaceID;
    const unitId = u.Unit?.UnitID;
    const head = u.Unit?.HeadRevisionNum ?? 0;
    const released = u.Unit?.LastReleasedRevisionNum ?? 0;
    if (!spaceId || !unitId || released <= 0 || head <= released) continue;
    lines.push([spaceId, unitId, released, head].join(FIELD_SEPARATOR));
  }
  return lines.sort().join('\n');
}

export function useUnreleasedDiffs(units: readonly ExtendedUnitRead[]): UnreleasedDiffsByUnitId {
  const dispatch = useAppDispatch();
  const rangesKey = useMemo(() => rangesKeyOf(units), [units]);

  const args = useMemo(
    (): RevisionDiffArgs[] =>
      rangesKey === ''
        ? []
        : rangesKey.split('\n').map((line) => {
            const [spaceId, unitId, from, to] = line.split(FIELD_SEPARATOR);
            return { spaceId, unitId, from, to };
          }),
    [rangesKey],
  );

  // A read already in the cache is served from it when it is subscribed to again, so a new
  // set of Units asks the server only for the Units that are new or have moved.
  useEffect(() => {
    const subscriptions: { unsubscribe: () => void }[] = [];
    let cancelled = false;
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < args.length) {
        const subscription = dispatch(configDiffApi.endpoints.getRevisionDiff.initiate(args[next++]));
        subscriptions.push(subscription);
        await subscription;
      }
    };
    void Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_CHUNKS, args.length) }, () => worker()));
    return () => {
      cancelled = true;
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [dispatch, args]);

  const selectors = useMemo(() => args.map((arg) => configDiffApi.endpoints.getRevisionDiff.select(arg)), [args]);
  const reads = useAppSelector((state) => selectors.map((select) => select(state).data), shallowEqual);

  return useMemo(() => {
    const byUnitId: UnreleasedDiffsByUnitId = {};
    args.forEach((arg, at) => {
      const diff = reads[at];
      if (diff !== undefined) byUnitId[arg.unitId] = diff;
    });
    return byUnitId;
  }, [args, reads]);
}
