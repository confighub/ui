// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useSearchParams } from 'react-router-dom';

import {
  FILTER_URL_PARAMS,
  FilterUrlParamValue,
  VIEW_URL_PARAMS,
  ViewUrlParamValue,
} from '@/utility/constants/url-params';

export const useAdvancedSearchQueryParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * Update multiple search parameters at once.
   *
   * Uses functional `setSearchParams` so this call composes correctly with
   * concurrent `setSearchParams` calls (e.g. from `syncFilterStateToUrl`).
   * Passing an empty string for a key deletes that param.
   */
  const updateSearchParams = (
    params: Record<ViewUrlParamValue | FilterUrlParamValue, string>,
  ) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(params).forEach(([key, value]) => {
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
  };

  /**
   * Update a specific URL parameter.
   *
   * Uses functional `setSearchParams` so this call composes correctly with
   * concurrent `setSearchParams` calls (e.g. from `syncFilterStateToUrl`).
   * Passing an empty string deletes the param.
   */
  const updateSearchParam = (key: ViewUrlParamValue | FilterUrlParamValue, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  /**
   * Clear all filter and view display-state params from the URL.
   *
   * VIEW_ID and TYPE are view-identity params owned by useQueryBuilder — they
   * are intentionally NOT cleared here so the active view/filter tab is
   * preserved. Only display-state params are cleared.
   *
   * Uses functional `setSearchParams` for safe composition.
   */
  const clearSearchParams = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(VIEW_URL_PARAMS.FILTER_ID);
      next.delete(VIEW_URL_PARAMS.GROUP_BY);
      next.delete(VIEW_URL_PARAMS.COLUMNS);
      next.delete(VIEW_URL_PARAMS.SPACE_ID);
      next.delete(VIEW_URL_PARAMS.ORDER_BY);
      next.delete(VIEW_URL_PARAMS.ORDER_BY_DIRECTION);
      next.delete(FILTER_URL_PARAMS.FILTER_ID);
      next.delete(FILTER_URL_PARAMS.SPACE_ID);
      next.delete(FILTER_URL_PARAMS.RESOURCE_TYPE);
      next.delete(FILTER_URL_PARAMS.WHERE_DATA);
      next.delete(FILTER_URL_PARAMS.WHERE);
      return next;
    });
  };

  return {
    clearSearchParams,
    updateSearchParam,
    updateSearchParams,
    searchParams,
    setSearchParams,
  };
};
