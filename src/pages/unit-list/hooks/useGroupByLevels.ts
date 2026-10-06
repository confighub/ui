// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';

import { hydrateGroupByFromView } from '@/components/query-builder/groupBy-annotation';
import { type ExtendedViewRead } from '@confighub/rtk-query';
import { VIEW_URL_PARAMS } from '@/utility/constants/url-params';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fallback grouping when the active view has no GroupBy configured, and the
 * caller doesn't pass its own `fallbackLevels` (every existing — Unit-list —
 * caller doesn't, so this stays the exact default it always was). */
const FALLBACK_GROUP_BY_COLUMNS = ['Space'];

/** Stable empty default for `clearParamsOnEdit` so callers that omit it don't
 * churn `handleEditLevels`'s memoization with a fresh array every render. */
const EMPTY_CLEAR_PARAMS: string[] = [];

function shallowArrayEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Resolve the committed (persisted) group-by columns from the active view,
 * falling back to `fallbackLevels` (default `['Space']`) when none is configured.
 *
 * Uses `hydrateGroupByFromView` (annotation-aware) rather than the legacy
 * `getGroupByColumns` so that multi-level groupings stored in the
 * `ui.confighub.io/group-by` annotation are correctly read back after save.
 */
export function resolveCommitted(
  activeView: ExtendedViewRead | null | undefined,
  fallbackLevels: string[] = FALLBACK_GROUP_BY_COLUMNS,
): string[] {
  const cols = hydrateGroupByFromView(activeView ?? undefined);
  return cols.length > 0 ? cols : fallbackLevels;
}

/** Parse a `?viewGroupBy=` URL value into a levels array. Empty input → []. */
function parseGroupByParam(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseGroupByLevelsResult {
  /** Current local grouping levels — drives grid, sidebar, and breadcrumb. */
  localGroupByColumns: string[];
  /** True when localGroupByColumns differs from the view's persisted grouping. */
  isDirty: boolean;
  /**
   * Update levels immediately. Writes the new value to `?viewGroupBy=` in the
   * URL (replace history entry) and atomically resets `?group=` + the
   * in-memory selectedGroups so the displayed-units filter doesn't reference
   * columns that no longer exist. No network call is made until Save.
   */
  handleEditLevels: (newLevels: string[]) => void;
  /**
   * Reset levels to the view's committed state. Writes the committed value to
   * `?viewGroupBy=` and clears `?group=` + selectedGroups.  Called by the
   * unified Revert handler in UnitListPage.
   */
  resetToCommitted: () => void;
}

interface UseGroupByLevelsOptions {
  activeView: ExtendedViewRead | null | undefined;
  /** Current URL params (React Router). The live source of truth for groupBy. */
  searchParams: URLSearchParams;
  /** React Router's setSearchParams used to write `?viewGroupBy=`. */
  setSearchParams: SetURLSearchParams;
  /** Called whenever local levels change or revert, to reset the group tree selection. */
  setSelectedGroups: (groups: string[]) => void;
  /** Clears ?group= params from the URL. Called alongside setSelectedGroups. */
  clearGroupUrlParams: () => void;
  /**
   * Grouping levels used when the active view has no GroupBy configured.
   * Defaults to `['Space']`. The Components page passes `['Labels.Owner']`
   * so a view-less (or GroupBy-less) Components page never falls back to a
   * Unit-list field.
   */
  fallbackLevels?: string[];
  /**
   * Extra URL param names to delete in the SAME `setSearchParams` update as
   * the `?viewGroupBy=` write (default `[]` — every existing, Unit-list,
   * caller is unaffected).
   *
   * Do not rely on a *separate* `clearGroupUrlParams` call (even one using a
   * raw `window.history.replaceState`, bypassing `setSearchParams` entirely)
   * to remove a param that must be gone by the time this function returns:
   * with a React Router DATA router, a raw history write is invisible to the
   * router's own state. The `setSearchParams` call below is not applied
   * synchronously — it is a queued navigation — so the router's *next*
   * internal update still starts from its own last-known `prev` (which never
   * saw the raw write, param still present) and writes that back, silently
   * undoing it. Components passes `['group']` here for exactly this reason:
   * its tree selection is derived purely from the URL (no separate React
   * state as backstop), so this race is user-visible there in a way it never
   * was for the Unit list (which resets its own `selectedGroups` React state
   * regardless of what the URL ends up saying).
   */
  clearParamsOnEdit?: string[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * URL-first grouping hook.
 *
 * `?viewGroupBy=` in the URL is the live display state for groupBy levels —
 * exactly the same architecture used for columns, sort, and filter conditions.
 * This hook is a thin reader/writer over that URL param:
 *
 * - `localGroupByColumns` is a `useMemo` over the URL param (falling back to
 *   the view's committed levels when the param is absent).
 * - `handleEditLevels` writes the URL via `setSearchParams({ replace: true })`.
 * - `resetToCommitted` writes the view's committed levels back to the URL.
 *
 * Because the URL is the single source of truth, there is no separate React
 * state to keep in sync, no view-identity guard, and no draft-preloading ref:
 *
 * - Tab switches reset groupBy via `syncFilterStateToUrl` (in `useQueryBuilder`)
 *   which writes `?viewGroupBy=` atomically with the other view params.
 * - Draft rehydration writes `?viewGroupBy=draft.groupBy` directly via
 *   `setSearchParams`.
 *
 * The hook still owns `setSelectedGroups([])` + `clearGroupUrlParams()` on
 * every level change because the `?group=` breadcrumb path is selection state
 * tied to the previous level set — it becomes invalid the moment levels change.
 */
export function useGroupByLevels({
  activeView,
  searchParams,
  setSearchParams,
  setSelectedGroups,
  clearGroupUrlParams,
  fallbackLevels = FALLBACK_GROUP_BY_COLUMNS,
  clearParamsOnEdit = EMPTY_CLEAR_PARAMS,
}: UseGroupByLevelsOptions): UseGroupByLevelsResult {
  // Committed groupBy: the persisted baseline for the active view.  Used as
  // the default when the URL has no `?viewGroupBy=` and for dirty detection.
  const committed = useMemo(
    () => resolveCommitted(activeView, fallbackLevels),
    [activeView, fallbackLevels],
  );

  // Live groupBy: read from URL when present, otherwise fall back to committed.
  const localGroupByColumns = useMemo(() => {
    const fromUrl = parseGroupByParam(searchParams.get(VIEW_URL_PARAMS.GROUP_BY));
    return fromUrl.length > 0 ? fromUrl : committed;
  }, [searchParams, committed]);

  const isDirty = !shallowArrayEqual(localGroupByColumns, committed);

  /**
   * Write `?viewGroupBy=newLevels` (or delete it when empty) and reset the
   * breadcrumb selection. Uses functional `setSearchParams` so it composes
   * with other URL writers in the same event handler.
   */
  const handleEditLevels = useCallback(
    (newLevels: string[]) => {
      const csv = newLevels.filter(Boolean).join(',');
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (csv) next.set(VIEW_URL_PARAMS.GROUP_BY, csv);
          else next.delete(VIEW_URL_PARAMS.GROUP_BY);
          // Deleted in the SAME updater as the groupBy write — see
          // `clearParamsOnEdit`'s doc comment for why a separate call
          // (even `clearGroupUrlParams` below) cannot reliably do this.
          for (const key of clearParamsOnEdit) next.delete(key);
          return next;
        },
        { replace: true },
      );
      // Reset selection atomically — stale selection against changed levels
      // produces wrong filtering.
      setSelectedGroups([]);
      clearGroupUrlParams();
    },
    [setSearchParams, setSelectedGroups, clearGroupUrlParams, clearParamsOnEdit],
  );

  /**
   * Write the view's committed groupBy back to the URL. Called by the unified
   * Revert handler in UnitListPage when the user reverts a dirty groupBy.
   */
  const resetToCommitted = useCallback(() => {
    handleEditLevels(committed);
  }, [committed, handleEditLevels]);

  return {
    localGroupByColumns,
    isDirty,
    handleEditLevels,
    resetToCommitted,
  };
}
