// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export interface SelectedApp {
  name: string;
  owner: string;
}

/**
 * Whether a node graph shows the flow canvas or the Dashboard (the same
 * overview — KPI header, matrix, activity feed — the Overview root shows,
 * scoped to the node's own Space set). Named `Display`, not `View`, so it
 * isn't confused with the page's SAVED views (`viewID`/`viewGroupBy`/
 * `viewFilterID`, `type=view`).
 */
export type ComponentDisplayMode = 'graph' | 'dashboard';

/**
 * A partial write to the Components view's URL, passed to
 * `AppsComponentLayout`'s `updateParams` helper — the ONE place that
 * actually touches `useSearchParams`. `undefined` leaves a param
 * untouched; `null` deletes it.
 */
export interface ViewParamsPatch {
  /** Which Component is open (its Component Slug). */
  app?: string | null;
  space?: string | null;
  /**
   * The deployments compared ALONGSIDE `space`, comma-separated, in slot order.
   *
   * Kept apart from `space` on purpose. `space` is which deployment the side
   * pane is open on and stays single-valued, which every consumer already
   * relies on; this is the rest of the comparison. Slot A is always `space`, so
   * swapping A and B writes both params in one patch and the pane follows the
   * new baseline.
   */
  compare?: string | null;
  /**
   * The nav tree's group-node narrowing path, written as repeated `group=`
   * params (matching the Unit list's own `?group=` convention) — `null`
   * deletes every `group` entry, an array replaces them all atomically.
   */
  group?: string[] | null;
  /**
   * The node graph's display mode — `'dashboard'` to show the Dashboard
   * instead of the flow canvas, `null` for the graph (the default; never
   * stamped onto the URL, so an existing `?app=`/`?group=` link is
   * unchanged). Named `display`, not `view`, so it isn't confused with the
   * page's SAVED views (`viewID`/`viewGroupBy`/`viewFilterID`, `type=view`).
   */
  display?: 'dashboard' | null;
}

export const AUTOMATED_USER_ID = '00000000-0000-0000-0000-000000000000';

export const ROUTE_UNIT_DASHBOARD = '/unit-dashboard';
export const ROUTE_COMPONENTS = '/components';
