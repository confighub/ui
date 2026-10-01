// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import type { ExtendedFilterRead, ExtendedViewRead } from '@confighub/rtk-query';
import { DEFAULT_UNIT_COLUMNS, getColumnsFromDelta } from '@/utility/column-delta-functions';
import { FILTER_URL_PARAMS, VIEW_URL_PARAMS } from '@/utility/constants/url-params';

import type { FilterCondition } from './types';
import { buildWhereClauses } from './utils';
import {
  compareSnapshotToView,
  type DirtyFields,
  type ViewSnapshot,
} from './view-comparison';

// Re-export DirtyFields so consumers keep their existing import path stable.
export type { DirtyFields } from './view-comparison';

export interface UseViewModificationTrackingResult {
  /** True when any tracked field differs from the saved baseline. */
  isViewModified: boolean;
  /** Granular dirty indicators — used to decide which mutations to call. */
  dirtyFields: DirtyFields;
}

/**
 * Build a `ViewSnapshot` from the current URL params and in-memory filter
 * conditions.  Mirrors the persisted draft shape so the snapshot can be
 * compared against a saved baseline by the same primitives used for the
 * draft → view dot computation.
 *
 * GroupBy is read from the `viewGroupBy` URL param — the live source of truth.
 * `useGroupByLevels` writes the param on every chip edit via
 * `setSearchParams({ replace: true })`, so reading from the URL here keeps
 * dirty detection on the same single source of truth as columns, sort, and
 * filter conditions.
 *
 * Exported for tests; not part of the public hook surface.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function buildLiveSnapshot(
  filters: FilterCondition[],
  searchParams: URLSearchParams,
  defaultColumns: string[] = DEFAULT_UNIT_COLUMNS,
): ViewSnapshot {
  const { where, whereData, resourceType } = buildWhereClauses(filters);
  const columnsDeltaParam = searchParams.get(VIEW_URL_PARAMS.COLUMNS);
  const columns = columnsDeltaParam
    ? getColumnsFromDelta(columnsDeltaParam).map((c) => c.Name ?? '')
    : defaultColumns;
  return {
    filter: { Where: where, WhereData: whereData, ResourceType: resourceType },
    columns,
    groupBy: searchParams.get(VIEW_URL_PARAMS.GROUP_BY) ?? '',
    sortOrder: {
      orderBy: searchParams.get(VIEW_URL_PARAMS.ORDER_BY) ?? '',
      orderByDirection: searchParams.get(VIEW_URL_PARAMS.ORDER_BY_DIRECTION) ?? '',
    },
  };
}

/**
 * Replaces `useSavedFilterTracking`.
 *
 * Compares the live UI state against the saved view/filter baseline and returns
 * a coarse `isViewModified` flag plus a `dirtyFields` breakdown for targeted
 * PATCH calls.
 *
 * Sentinel behaviour: when `activeView` is null (the "All units" tab),
 * `isViewModified` is true whenever any non-default URL params are present.
 */
export function useViewModificationTracking(
  activeView: ExtendedViewRead | null,
  activeFilter: ExtendedFilterRead | null,
  filters: FilterCondition[],
  searchParams: URLSearchParams,
  defaultColumns: string[] = DEFAULT_UNIT_COLUMNS,
): UseViewModificationTrackingResult {
  return useMemo(() => {
    // ── Sentinel tab ──────────────────────────────────────────────────────────
    // We build the sentinel snapshot directly from URL params (not via
    // buildLiveSnapshot, which uses in-memory filter conditions).  This matches
    // the prior behaviour where the sentinel dot reflects "raw URL state" so a
    // fully-cleared URL is not dirty even if filter conditions haven't been
    // committed back to it yet.
    if (!activeView) {
      const hasWhere = Boolean(searchParams.get(FILTER_URL_PARAMS.WHERE));
      const hasWhereData = Boolean(searchParams.get(FILTER_URL_PARAMS.WHERE_DATA));
      const hasResourceType = Boolean(searchParams.get(FILTER_URL_PARAMS.RESOURCE_TYPE));
      const hasColumns = Boolean(searchParams.get(VIEW_URL_PARAMS.COLUMNS));
      const hasGroupBy = Boolean(searchParams.get(VIEW_URL_PARAMS.GROUP_BY));
      const hasOrderBy = Boolean(searchParams.get(VIEW_URL_PARAMS.ORDER_BY));
      const filterDirty = hasWhere || hasWhereData || hasResourceType;
      const viewFieldsDirty = hasColumns || hasGroupBy || hasOrderBy;
      return {
        isViewModified: filterDirty || viewFieldsDirty,
        dirtyFields: { filter: filterDirty, viewFields: viewFieldsDirty },
      };
    }

    // ── Mid-transition guard ──────────────────────────────────────────────────
    // React batches setState but setSearchParams (React Router) triggers a
    // separate render. During that render activeView is already the new view
    // but the URL still has the old view's params (or vice versa), producing a
    // spurious dirty signal. Suppress it until both sides agree.
    const urlViewId = searchParams.get(VIEW_URL_PARAMS.VIEW_ID) ?? '';
    if (urlViewId !== (activeView.View?.ViewID ?? '')) {
      return { isViewModified: false, dirtyFields: { filter: false, viewFields: false } };
    }

    // ── View tab — delegate to shared snapshot comparison ────────────────────
    const snapshot = buildLiveSnapshot(filters, searchParams, defaultColumns);
    const dirtyFields = compareSnapshotToView(
      snapshot,
      activeView,
      activeFilter,
      defaultColumns,
    );
    return {
      isViewModified: dirtyFields.filter || dirtyFields.viewFields,
      dirtyFields,
    };
  }, [activeView, activeFilter, filters, searchParams, defaultColumns]);
}
