// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export interface SelectedApp {
  name: string;
  owner: string;
}

/**
 * A partial write to the Components view's URL, passed to
 * `AppsComponentLayout`'s `updateParams` helper — the ONE place that
 * actually touches `useSearchParams`. `undefined` leaves a param
 * untouched; `null` deletes it.
 */
export interface ViewParamsPatch {
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
}

export const AUTOMATED_USER_ID = '00000000-0000-0000-0000-000000000000';

export const OVERVIEW_ITEM_ID = '__overview__';

export const ROUTE_UNIT_DASHBOARD = '/unit-dashboard';
export const ROUTE_COMPONENTS = '/components';
