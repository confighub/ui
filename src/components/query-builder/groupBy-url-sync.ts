// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Pure helpers for GROUP_BY URL-param synchronisation.
 *
 * Extracted from the URL-init effect in useQueryBuilder so the logic can be
 * unit-tested without the full hook harness and imported into tests without
 * redefining local copies.
 *
 * The core bug these helpers guard against:
 *   Old condition: `!groupByParam && view?.GroupBy`
 *   → Only synced when URL had *no* param AND the view *had* one.
 *   → Never deleted a stale param when the new view had *no* GroupBy.
 *
 * Fixed condition (this module):
 *   `(groupByParam ?? '') !== (viewGroupBy ?? '')`
 *   → Handles both directions: stale param → delete; missing param → set.
 */

/**
 * Returns true when the GROUP_BY URL param needs to be synced to match the
 * view's GroupBy field.
 *
 * @param groupByParam - Current value of the GROUP_BY URL param (or null if absent).
 * @param viewGroupBy  - The view's saved GroupBy value (or null/undefined if absent).
 */
export function computeNeedsGroupBySync(
  groupByParam: string | null,
  viewGroupBy: string | null | undefined,
): boolean {
  return (groupByParam ?? '') !== (viewGroupBy ?? '');
}

/**
 * Apply the GROUP_BY sync to a URLSearchParams instance (mutates in-place).
 * Returns the mutated params for chaining.
 *
 * @param params      - The URLSearchParams to mutate.
 * @param groupByParam - Current value of the GROUP_BY URL param (or null).
 * @param viewGroupBy  - The view's saved GroupBy value (or null/undefined).
 * @param groupByKey  - The URL parameter key name (e.g. `'viewGroupBy'`).
 */
export function applyGroupBySync(
  params: URLSearchParams,
  groupByParam: string | null,
  viewGroupBy: string | null | undefined,
  groupByKey: string,
): URLSearchParams {
  if (!computeNeedsGroupBySync(groupByParam, viewGroupBy)) return params;
  if (viewGroupBy) {
    params.set(groupByKey, viewGroupBy);
  } else {
    params.delete(groupByKey);
  }
  return params;
}
