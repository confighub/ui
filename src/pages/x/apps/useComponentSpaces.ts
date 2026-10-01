// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';

import { useComponentSlugs } from '@/hooks/useComponentSlugs';
import { usePolling } from '@/hooks/usePolling';
import { type ExtendedSpaceRead } from '@confighub/rtk-query';
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { useListComponentSpacesQuery } from './componentSpacesApi';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Base `Space` columns the Components view actually reads, as a `select` clause.
 *
 * - `SpaceID` / `Slug` — identity (always returned, listed for clarity).
 * - `Labels` — `Component` / `Owner` grouping for the nav tree and the matrix.
 * - `Annotations` — live status written by reporters (e.g. argobot); this is the
 *   field that makes polling worth doing at all.
 * - `DisplayName`, `ReleaseTargetID` — read by the component graph / release UI.
 *
 * Deliberately does NOT set `summary=true`: that flag makes the server run ~18
 * COUNT queries PER SPACE, which is far too expensive for a 5s poll.
 */
export const COMPONENT_SPACE_SELECT = 'SpaceID,Slug,DisplayName,Labels,Annotations,ReleaseTargetID,ComponentID';

/**
 * Poll cadence for the cheap identity/annotation query — this is what stays live.
 * Driven by `usePolling` (see below), which pauses the interval while the tab is
 * backgrounded (`document.hidden`) instead of the raw RTK Query `pollingInterval`
 * option, which polls unconditionally even when nobody can see the result.
 */
const LIVE_POLL_INTERVAL_MS = 5_000;

/**
 * Poll cadence for the expensive `summary=true` query. The summary counts are
 * roll-ups of unit state that only move when someone applies/upgrades,
 * so a slow refresh is enough; the org-wide 5s poll it replaces was the single
 * most expensive thing this page did. Also driven by `usePolling` so it pauses
 * while the tab is hidden.
 */
const SUMMARY_POLL_INTERVAL_MS = 60_000;

/** Stable empty reference so consumers' `useMemo` deps don't churn. */
const NO_SPACES: ExtendedSpaceRead[] = [];

// ============================================================================
// TYPES
// ============================================================================

export interface ComponentSpacesResult {
  /**
   * Live space rows (identity + labels + annotations) with the most recently
   * fetched summary counts merged in. Summary fields are absent until the
   * summary query resolves — gate count-reading UI on `isSummaryLoaded`.
   */
  spaces: ExtendedSpaceRead[];
  /** True once spaces are available to render (scoped fast path or org-wide). */
  isSpacesLoaded: boolean;
  /** True once the summary counts have resolved at least once. */
  isSummaryLoaded: boolean;
  /** True while a `?app=` deep-link is still showing only its scoped spaces. */
  isLoadingFullAppList: boolean;
  /** True when no space list could be loaded at all (nothing can be rendered). */
  isSpacesError: boolean;
  /** True when the summary counts failed to load. */
  isSummaryError: boolean;
  /**
   * The first error object set among the scoped, live, and summary queries,
   * checked in that order. `undefined` unless at least one of them failed.
   * Pass to `QueryErrorState`'s `error` prop when `isSpacesError` is true.
   */
  spacesError: FetchBaseQueryError | SerializedError | undefined;
  /** Which query `spacesError` came from, for the technical-detail panel. */
  failedSpacesQuery: 'scoped spaces' | 'live spaces' | 'summary spaces' | undefined;
  /** Refetches all three underlying queries. Wire to `QueryErrorState`'s `onRetry`. */
  retrySpaces: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Overlay the summary-only fields (`TotalTargetCount`,
 * `UnreleasedUnitCount`, `GatedUnitCount`, `UpgradableUnitCount`, …) onto the
 * live rows, keeping only the live query's `Space` (Labels/Annotations) as
 * the freshly polled part.
 *
 * The count fields on `ExtendedSpaceRead` are not `omitempty` server-side, so
 * the "live" query's response (no `summary=true`) still comes back with every
 * count field present at its zero value rather than the key being absent —
 * confirmed via direct API inspection, not merely inferred from Go struct
 * tags. Spreading the whole live `space` object over `summary` (as an earlier
 * version of this function did) therefore clobbers every real count with
 * that zero, silently zeroing the entire Components Overview KPI dashboard
 * regardless of what the summary query returned. Only `Space` is genuinely
 * "live" here, so only it is taken from `space` — every count field comes
 * from `summary`.
 */
function mergeSummaryCounts(
  live: ExtendedSpaceRead[],
  summaryById: Map<string, ExtendedSpaceRead>,
): ExtendedSpaceRead[] {
  if (summaryById.size === 0) return live;
  return live.map((space) => {
    const spaceId = space.Space?.SpaceID;
    const summary = spaceId ? summaryById.get(spaceId) : undefined;
    return summary ? { ...summary, Space: space.Space } : space;
  });
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Loads the spaces backing the Components view as three cooperating queries:
 *
 * 1. A scoped query for `?app=<name>` deep-links, so the requested component can
 *    paint before the org-wide list resolves.
 * 2. A cheap org-wide query that polls every 5s — this is what keeps live status
 *    (Space.Annotations) fresh on the cards and graph.
 * 3. An expensive `summary=true` org-wide query that supplies the overview
 *    matrix's KPI counts, polled on a much slower timer.
 *
 * All three start in parallel on mount (no waterfall); the results are merged so
 * consumers still see a single `ExtendedSpaceRead[]`. Queries (2) and (3) poll via
 * `usePolling`, so both pause while the tab is backgrounded and resume on
 * refocus instead of hammering the backend from hidden tabs.
 */
export function useComponentSpaces(appParam: string | null): ComponentSpacesResult {
  const hasApp = !!appParam;
  const { idBySlug } = useComponentSlugs();

  // `?app=<name>` selects spaces of the Component whose Slug is <name> (see
  // `AppsComponentLayout.selectedAppSpaces`).
  const appComponentId = appParam ? idBySlug.get(appParam) : undefined;
  const scopedWhere = useMemo(
    () => (appComponentId ? `ComponentID = '${appComponentId}'` : undefined),
    [appComponentId],
  );

  // (1) Priority deep-link query. Same cheap shape as the org-wide live query so
  // the layout reads Labels/Annotations identically from either source. Uses
  // the dashboard-scoped endpoint (see componentSpacesApi.ts) purely for its
  // longer `keepUnusedDataFor` — a `keepUnusedDataFor` hook option doesn't
  // exist in RTK Query, it's baked into the endpoint definition.
  const {
    data: scopedData,
    isError: scopedIsError,
    error: scopedQueryError,
    refetch: refetchScoped,
  } = useListComponentSpacesQuery(
    { select: COMPONENT_SPACE_SELECT, where: scopedWhere },
    { skip: !scopedWhere },
  );

  // (2) Cheap org-wide query — the live one. Polling is driven by `usePolling`
  // below (visibility-aware) rather than RTK Query's own `pollingInterval`,
  // which keeps firing while the tab is backgrounded.
  const {
    data: liveData,
    isError: liveIsError,
    error: liveQueryError,
    refetch: refetchLive,
  } = useListComponentSpacesQuery({
    select: COMPONENT_SPACE_SELECT,
  });
  usePolling(refetchLive, LIVE_POLL_INTERVAL_MS);

  // (3) Expensive summary query — counts only, slow cadence. Same
  // visibility-aware polling as above.
  const {
    data: summaryData,
    isError: summaryIsError,
    error: summaryQueryError,
    refetch: refetchSummary,
  } = useListComponentSpacesQuery({
    summary: true,
  });
  usePolling(refetchSummary, SUMMARY_POLL_INTERVAL_MS);

  const summaryById = useMemo(() => {
    const map = new Map<string, ExtendedSpaceRead>();
    for (const space of summaryData ?? []) {
      const spaceId = space.Space?.SpaceID;
      if (spaceId) map.set(spaceId, space);
    }
    return map;
  }, [summaryData]);

  const spaces = useMemo(() => {
    // Prefer the org-wide list once available; until then fall back to the
    // priority-scoped spaces so a deep-linked component paints immediately.
    const base = liveData ?? scopedData;
    if (!base) return NO_SPACES;
    return mergeSummaryCounts(base, summaryById);
  }, [liveData, scopedData, summaryById]);

  // Checked in this order — scoped, then live, then summary — per the design
  // spec. `isSpacesError` (below) only ever depends on the scoped and live
  // queries, so in practice this never resolves to the summary error alone:
  // by the time `isSpacesError` is true, `scopedQueryError` or
  // `liveQueryError` is already set. The summary case is included because
  // this value is defined generally, not only for the `isSpacesError` branch.
  const spacesError = scopedQueryError ?? liveQueryError ?? summaryQueryError;
  const failedSpacesQuery = scopedQueryError
    ? 'scoped spaces'
    : liveQueryError
      ? 'live spaces'
      : summaryQueryError
        ? 'summary spaces'
        : undefined;

  const retrySpaces = useCallback(() => {
    if (scopedWhere) refetchScoped();
    refetchLive();
    refetchSummary();
  }, [scopedWhere, refetchScoped, refetchLive, refetchSummary]);

  return {
    spaces,
    isSpacesLoaded: liveData !== undefined || (hasApp && scopedData !== undefined),
    isSummaryLoaded: summaryData !== undefined,
    isLoadingFullAppList: hasApp && liveData === undefined,
    // On the deep-link fast path a scoped failure is not fatal while the
    // org-wide query is still in flight.
    isSpacesError: hasApp ? scopedIsError && liveIsError : liveIsError,
    isSummaryError: summaryIsError,
    spacesError,
    failedSpacesQuery,
    retrySpaces,
  };
}
