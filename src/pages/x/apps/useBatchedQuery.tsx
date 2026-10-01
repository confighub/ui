// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';

/**
 * The subset of an RTK Query list-query hook's return value this module
 * needs. Every generated `useListAllXQuery` hook satisfies this structurally
 * (it also returns `data`, `refetch`, etc., which callers here don't need).
 */
interface BatchQueryHookResult<TResult> {
  currentData?: TResult[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error?: unknown;
}

interface BatchState<TResult> {
  data: TResult[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}

const EMPTY_RESULTS: never[] = [];

interface BatchSubscriptionProps<TArg, TResult> {
  batchKey: string;
  arg: TArg;
  pollingInterval: number;
  useQueryHook: (arg: TArg, options: { pollingInterval?: number }) => BatchQueryHookResult<TResult>;
  onResult: (batchKey: string, state: BatchState<TResult>) => void;
}

/**
 * Mounts exactly one real, subscribed RTK Query hook call for one batch —
 * the whole point of this module: a batch fetched imperatively into local
 * state (`useLazyQuery().unwrap()`, the shape this replaces) is invisible to
 * RTK Query's own cache-tag invalidation (a mutation elsewhere that should
 * refresh this data never does) and to `pollingInterval`. Reports its own
 * state up via `onResult` instead of rendering anything.
 */
function BatchSubscription<TArg, TResult>({
  batchKey,
  arg,
  pollingInterval,
  useQueryHook,
  onResult,
}: BatchSubscriptionProps<TArg, TResult>): null {
  const { currentData, isLoading, isFetching, isError, error } = useQueryHook(arg, { pollingInterval });
  useEffect(() => {
    onResult(batchKey, { data: currentData ?? (EMPTY_RESULTS as TResult[]), isLoading, isFetching, isError, error });
    // batchKey/useQueryHook/onResult are stable for a given call site; only
    // the query result fields should re-report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentData, isLoading, isFetching, isError, error]);
  return null;
}

/**
 * Splits a query that could overflow a GET query-string limit into several
 * batches, each a REAL subscribed query (via `BatchSubscription`) rather
 * than an imperative one-shot fetch — so cache invalidation and polling
 * reach every batch, and a batch's own error is visible instead of silently
 * swallowed. Returns the merged rows plus the aggregate loading/error state,
 * and a `subscriptions` element the caller MUST render somewhere in its
 * JSX tree (a hook cannot mount its own child components).
 *
 * `resetKey` clears accumulated results when it changes (e.g. a Component
 * graph switch) — otherwise a previous graph's batch rows would linger on
 * screen while the new graph's own queries are still loading.
 */
export function useBatchedQuery<TArg, TResult>(
  batchArgs: TArg[],
  useQueryHook: (arg: TArg, options: { pollingInterval?: number }) => BatchQueryHookResult<TResult>,
  { pollingInterval = 0, resetKey }: { pollingInterval?: number; resetKey: string },
): {
  data: TResult[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  errors: unknown[];
  subscriptions: ReactElement;
} {
  const [results, setResults] = useState<Map<string, BatchState<TResult>>>(() => new Map());

  useEffect(() => {
    setResults(new Map());
  }, [resetKey]);

  const handleResult = useCallback((batchKey: string, state: BatchState<TResult>) => {
    setResults((prev) => {
      const next = new Map(prev);
      next.set(batchKey, state);
      return next;
    });
  }, []);

  const subscriptions = useMemo(
    () => (
      <>
        {batchArgs.map((arg, i) => (
          <BatchSubscription<TArg, TResult>
            key={`batch-${i}`}
            batchKey={`batch-${i}`}
            arg={arg}
            pollingInterval={pollingInterval}
            useQueryHook={useQueryHook}
            onResult={handleResult}
          />
        ))}
      </>
    ),
    [batchArgs, pollingInterval, useQueryHook, handleResult],
  );

  const data = useMemo(() => {
    const merged: TResult[] = [];
    for (let i = 0; i < batchArgs.length; i++) {
      const r = results.get(`batch-${i}`);
      if (r) merged.push(...r.data);
    }
    return merged;
  }, [batchArgs, results]);

  const isLoading = batchArgs.some((_, i) => results.get(`batch-${i}`)?.isLoading ?? true);
  const isFetching = batchArgs.some((_, i) => results.get(`batch-${i}`)?.isFetching ?? true);
  const errors = useMemo(
    () =>
      batchArgs
        .map((_, i) => results.get(`batch-${i}`))
        .filter((r): r is BatchState<TResult> => !!r?.isError)
        .map((r) => r.error),
    [batchArgs, results],
  );
  const isError = errors.length > 0;

  return { data, isLoading, isFetching, isError, errors, subscriptions };
}
