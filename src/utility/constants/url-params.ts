// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * URL parameter constants for filter and view state
 * Used for deep linking and sharing filters/views via URL
 */

// Filter URL Parameters
export const FILTER_URL_PARAMS = {
  FILTER_ID: 'filterID',
  /** Space ID for filtering units from a specific space */
  SPACE_ID: 'filterSpaceID',
  /** Resource type for content-based filtering */
  RESOURCE_TYPE: 'filterResourceType',
  /** WHERE DATA clause for content-based filtering */
  WHERE_DATA: 'filterWhereData',
  /** WHERE clause for metadata-based filtering */
  WHERE: 'filterWhere',
  SAVED: 'filterSaved',
} as const;

// View URL Parameters
export const VIEW_URL_PARAMS = {
  VIEW_ID: 'viewID',
  /** Filter ID associated with the view */
  FILTER_ID: 'viewFilterID',
  /** Column to group units by */
  GROUP_BY: 'viewGroupBy',
  /** Comma-separated list of visible columns */
  COLUMNS: 'viewColumns',
  /** Space ID for the view */
  SPACE_ID: 'viewSpaceID',
  /** Column to sort by */
  ORDER_BY: 'viewOrderBy',
  /** Sort direction (ASC or DESC) */
  ORDER_BY_DIRECTION: 'viewOrderByDirection',
  /** Type of the current selection: 'view' or 'filter' */
  TYPE: 'type',
  SAVED: 'viewSaved',
} as const;

export const VIEW_TYPES = {
  VIEW: 'view',
  FILTER: 'filter',
}

export type FilterUrlParamValue = (typeof FILTER_URL_PARAMS)[keyof typeof FILTER_URL_PARAMS];

export type ViewUrlParamValue = (typeof VIEW_URL_PARAMS)[keyof typeof VIEW_URL_PARAMS];

/**
 * All URL parameters combined
 */
export const URL_PARAMS = {
  ...FILTER_URL_PARAMS,
  ...VIEW_URL_PARAMS,
} as const;

/**
 * Type representing all valid URL parameter keys
 */
export type UrlParamKey = (typeof URL_PARAMS)[keyof typeof URL_PARAMS];
