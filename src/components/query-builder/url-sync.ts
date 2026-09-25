// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { SetURLSearchParams } from 'react-router-dom';

import { FILTER_URL_PARAMS, VIEW_URL_PARAMS } from '@/utility/constants/url-params';

/**
 * Represents the filter/view state to be synced to URL
 */
export interface FilterUrlState {
  /** WHERE clause for metadata-based filtering */
  where?: string;
  /** WHERE DATA clause for content-based filtering */
  whereData?: string;
  /** Resource type for content-based filtering */
  resourceType?: string;
  /** ID of the active saved filter */
  filterId?: string;
  /** Space ID that the saved filter belongs to (FromSpaceID) */
  spaceId?: string;
  /** ID of the active saved view */
  viewId?: string;
  /** Type of selection: 'filter' or 'view' */
  type?: 'filter' | 'view';
  /** Column delta string for visible columns (view-specific) */
  columns?: string;
  /** Column to order by (view-specific) */
  orderBy?: string;
  /** Order direction ASC or DESC (view-specific) */
  orderByDirection?: string;
  /** Column to group by (view-specific) */
  groupBy?: string;
}

/**
 * All filter-related URL parameter keys that should be cleared together
 */
const ALL_FILTER_PARAMS = [
  FILTER_URL_PARAMS.WHERE,
  FILTER_URL_PARAMS.WHERE_DATA,
  FILTER_URL_PARAMS.RESOURCE_TYPE,
  FILTER_URL_PARAMS.FILTER_ID,
  FILTER_URL_PARAMS.SPACE_ID,
] as const;

/**
 * All view-related URL parameter keys that should be cleared together
 */
const ALL_VIEW_PARAMS = [
  VIEW_URL_PARAMS.VIEW_ID,
  VIEW_URL_PARAMS.TYPE,
] as const;

/**
 * Sync filter state to URL parameters.
 *
 * This is the single source of truth for URL manipulation in the query builder.
 * All filter/view URL updates should go through this function.
 *
 * @param state - The filter state to sync to URL
 * @param setSearchParams - React Router's setSearchParams function
 *
 * @example
 * // Sync manual filter to URL
 * syncFilterStateToUrl({
 *   where: "Slug ILIKE '%test%'",
 *   type: 'filter',
 * }, setSearchParams);
 *
 * @example
 * // Sync saved filter selection to URL
 * syncFilterStateToUrl({
 *   where: filter.Where,
 *   whereData: filter.WhereData,
 *   resourceType: filter.ResourceType,
 *   filterId: filter.FilterID,
 *   spaceId: filter.FromSpaceID,
 *   type: 'filter',
 * }, setSearchParams);
 */
export const syncFilterStateToUrl = (
  state: FilterUrlState,
  setSearchParams: SetURLSearchParams
): void => {
  setSearchParams((prevParams) => {
    const newParams = new URLSearchParams(prevParams);

    // Set or delete each parameter based on whether it has a value
    // Using a helper to avoid repetition
    const setOrDelete = (key: string, value: string | undefined) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    };

    // Filter params
    setOrDelete(FILTER_URL_PARAMS.WHERE, state.where);
    setOrDelete(FILTER_URL_PARAMS.WHERE_DATA, state.whereData);
    setOrDelete(FILTER_URL_PARAMS.RESOURCE_TYPE, state.resourceType);
    setOrDelete(FILTER_URL_PARAMS.FILTER_ID, state.filterId);
    setOrDelete(FILTER_URL_PARAMS.SPACE_ID, state.spaceId);

    // View params
    setOrDelete(VIEW_URL_PARAMS.VIEW_ID, state.viewId);
    setOrDelete(VIEW_URL_PARAMS.TYPE, state.type);

    // View-specific display params (columns, sorting, grouping)
    setOrDelete(VIEW_URL_PARAMS.COLUMNS, state.columns);
    setOrDelete(VIEW_URL_PARAMS.ORDER_BY, state.orderBy);
    setOrDelete(VIEW_URL_PARAMS.ORDER_BY_DIRECTION, state.orderByDirection);
    setOrDelete(VIEW_URL_PARAMS.GROUP_BY, state.groupBy);

    return newParams;
  });
};

/**
 * Clear all filter and view-related URL parameters.
 *
 * Use this when clearing all filters or removing the active filter/view.
 *
 * @param setSearchParams - React Router's setSearchParams function
 */
export const clearFilterStateFromUrl = (
  setSearchParams: SetURLSearchParams
): void => {
  setSearchParams((prevParams) => {
    const newParams = new URLSearchParams(prevParams);

    // Clear all filter params
    for (const param of ALL_FILTER_PARAMS) {
      newParams.delete(param);
    }

    // Clear all view params
    for (const param of ALL_VIEW_PARAMS) {
      newParams.delete(param);
    }

    return newParams;
  });
};

/**
 * Clear only the saved filter/view reference from URL, keeping the filter conditions.
 *
 * Use this when the user removes a saved filter block but keeps the expanded conditions.
 *
 * @param setSearchParams - React Router's setSearchParams function
 */
export const clearSavedFilterReferenceFromUrl = (
  setSearchParams: SetURLSearchParams
): void => {
  setSearchParams((prevParams) => {
    const newParams = new URLSearchParams(prevParams);

    // Only clear the saved filter/view identifiers, not the filter conditions
    newParams.delete(FILTER_URL_PARAMS.FILTER_ID);
    newParams.delete(FILTER_URL_PARAMS.SPACE_ID);
    newParams.delete(VIEW_URL_PARAMS.VIEW_ID);
    newParams.delete(VIEW_URL_PARAMS.TYPE);

    return newParams;
  });
};
