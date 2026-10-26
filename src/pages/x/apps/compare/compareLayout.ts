// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Where the comparison is drawn, for the few things that differ with it.
 *
 * Components draws it in a side pane 380 to 650px wide: a fixed 220px field
 * column, value columns that only grow, folder labels cut in the middle, and
 * mono column heads. The View explorer draws it across the results area of a
 * page, where the field column can afford to grow and the reader scans long
 * paths, so `page` turns on:
 *
 * - a field column of at least 280px that takes 1.6 shares of the room, and
 *   value columns of 120 to 220px;
 * - a folder with a single row under it drawn as one row with that row
 *   ("template.spec.containers[alpha]"), and a path cut on the LEFT at a
 *   segment boundary ("…containers[alpha].resources.limits.memory"), so the
 *   field's own name always shows (the whole path is in its title);
 * - sans column heads of two lines when a column gives them (`heading`), and
 *   "N differing" for a document's count;
 * - 16px after the last column, and the filter strip inset to the 16px the
 *   rest of the surface uses;
 * - "not set" in the image rows drawn as the grid's cells draw it.
 *
 * The default is the pane, so a page that sets nothing draws as it always has.
 */

import { createContext, useContext } from 'react';

export interface CompareLayoutValue {
  page: boolean;
}

export const PANE_LAYOUT: CompareLayoutValue = { page: false };
export const PAGE_LAYOUT: CompareLayoutValue = { page: true };

export const CompareLayout = createContext<CompareLayoutValue>(PANE_LAYOUT);

export function useComparePageLayout(): boolean {
  return useContext(CompareLayout).page;
}
