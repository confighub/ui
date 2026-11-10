// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * When the server's gate rows were last asked for, and which of a decision's records the rows
 * cannot have seen yet.
 *
 * The rows say which records count on each Revision. A record the page read after it last asked
 * for the rows can be missing from them only because the rows are older, so the page must not
 * conclude that the decision "does not cover" the change until it has asked again.
 *
 * Known gap: the History card keeps its own reads, so one opened in that window can still show
 * the decision as not covering until its next read.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * The moment (epoch ms) each source of gate rows was last asked for the answer it now holds,
 * the earliest of them. A stable object whose value moves on every poll, so a reader subscribes
 * to it instead of the detail carrying it as a field.
 */
export interface RowsAskedAt {
  get: () => number | undefined;
  /** Sets one source's moment; undefined when that source has no rows. */
  set: (source: string, at: number | undefined) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createRowsAskedAt(): RowsAskedAt {
  const bySource = new Map<string, number>();
  const listeners = new Set<() => void>();
  let current: number | undefined;
  const earliest = () => earliestAskedAt([...bySource.values()]);
  return {
    get: () => current,
    set: (source, at) => {
      if (at === undefined) bySource.delete(source);
      else bySource.set(source, at);
      const next = earliest();
      if (next === current) return;
      current = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const NEVER_ASKED: RowsAskedAt = createRowsAskedAt();

export function useRowsAskedAt(source: RowsAskedAt | undefined): number | undefined {
  const store = source ?? NEVER_ASKED;
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export interface QueryTimes {
  isUninitialized: boolean;
  isFetching: boolean;
  startedTimeStamp?: number;
}

/**
 * The start of the last request an RTK query finished. While it runs again the data it holds is
 * still the answer of the one before, so that start is kept until the new one lands. A query that
 * is not started, or was skipped, holds no rows: it has no start, so it never counts.
 */
export function nextSettledStart(previous: number | undefined, query: QueryTimes): number | undefined {
  if (query.isUninitialized) return undefined;
  if (!query.isFetching && query.startedTimeStamp !== undefined) return query.startedTimeStamp;
  return previous;
}

/** `nextSettledStart` as state, set after the render that holds the data, as the rows' own moment is. */
export function useSettledStart(query: QueryTimes): number | undefined {
  const [settled, setSettled] = useState<number | undefined>(undefined);
  const { isUninitialized, isFetching, startedTimeStamp } = query;
  useEffect(() => {
    setSettled((previous) => nextSettledStart(previous, { isUninitialized, isFetching, startedTimeStamp }));
  }, [isUninitialized, isFetching, startedTimeStamp]);
  return settled;
}

/**
 * The Final probe's moment. It is asked again on a poll only until the workflow is complete, so
 * after that its old moment says nothing about any record and must not count.
 */
export function finalRowsAskedAt(probing: boolean, completed: boolean, settledStart: number | undefined): number | undefined {
  return probing && !completed ? settledStart : undefined;
}

/** The earliest moment of the sources that hold rows. */
export function earliestAskedAt(moments: readonly (number | undefined)[]): number | undefined {
  const asked = moments.filter((moment): moment is number => moment !== undefined);
  return asked.length === 0 ? undefined : Math.min(...asked);
}

/** The client time each record id was first read, for one ChangeOrder. Ids of the first read are 0. */
export interface RecordsSeen {
  changeOrderId: string | undefined;
  loaded: boolean;
  at: ReadonlyMap<string, number>;
}

export const NOTHING_SEEN: RecordsSeen = { changeOrderId: undefined, loaded: false, at: new Map() };

/**
 * The state after a read of `ids`, a new object only when something changed. The first read of a
 * ChangeOrder is what the page opened on: no rows were asked for before it, so it is not "ahead"
 * of any.
 */
export function recordsSeenAfter(seen: RecordsSeen, changeOrderId: string | undefined, ids: readonly string[], loaded: boolean, now: number): RecordsSeen {
  const base = seen.changeOrderId === changeOrderId ? seen : { ...NOTHING_SEEN, changeOrderId };
  if (!loaded) return base;
  const fresh = ids.filter((id) => !base.at.has(id));
  if (base.loaded && fresh.length === 0) return base;
  const at = new Map(base.at);
  for (const id of fresh) at.set(id, base.loaded ? now : 0);
  return { changeOrderId, loaded: true, at };
}

/** The ids read after the rows were last asked for. With no rows asked for, none: no row can lack a record. */
export function recordsAheadOfRows(seen: RecordsSeen, rowsAskedAt: number | undefined): string[] {
  if (rowsAskedAt === undefined) return [];
  return [...seen.at]
    .filter(([, at]) => at > rowsAskedAt)
    .map(([id]) => id)
    .sort();
}
