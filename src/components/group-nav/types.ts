// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { MouseEvent } from 'react';

import { ViewRead } from '@confighub/rtk-query';

export const LABEL_PREFIX = 'Labels.';
export const SPACE_LABEL_PREFIX = 'Space.Labels.';

/** Sentinel value representing "show all groups" in GroupNavPanel */
export const ALL_GROUPS = '__all__' as const;

/** A node's identity while the tree walks it — used by `GroupNavPanel`'s `getItemProps`. */
export interface GroupNavNodeContext {
  /** Values chosen at each level up to and including this node. */
  path: string[];
  /** 0-indexed level of this node in `groupByColumns`. */
  depth: number;
  /**
   * True for a leaf. With `GroupNavPanel`'s `leaf` option, a leaf is one item,
   * one level below the last group level. Without it, a leaf is a node at the
   * deepest configured level.
   */
  isLeaf: boolean;
}

/** Extra DOM/interaction props `GroupNavPanel`'s `getItemProps` may attach to a node. */
export interface GroupNavItemProps {
  'data-testid'?: string;
  $hasSelections?: boolean;
  /** Runs after the row's own click handling (select, and toggle when the row expands on click). */
  onClick?: (e: MouseEvent) => void;
}

/**
 * Extract the ordered list of group-by column names from a ViewRead.
 * Order: top-level GroupBy first (if set), then columns with GroupBy=true in column list order.
 *
 * @deprecated Annotation-blind: does not read `ui.confighub.io/group-by`, which is the
 * canonical source of truth for multi-level groupings saved since the annotation was introduced.
 * Use `hydrateGroupByFromView(extendedView)` from `@/components/query-builder/groupBy-annotation`
 * instead — it resolves the annotation first and falls back to `View.GroupBy` for legacy views.
 * Calling this function for grouping resolution will cause multi-level views to appear "modified"
 * immediately after save.
 */
export function getGroupByColumns(view: ViewRead | undefined): string[] {
  if (!view) return [];
  const result: string[] = [];
  if (view.GroupBy) {
    result.push(view.GroupBy);
  }
  for (const col of view.Columns ?? []) {
    // col.Name is typed string (non-optional) but guard against null API data
    if (col.GroupBy && col.Name && col.Name !== view.GroupBy) {
      result.push(col.Name);
    }
  }
  return result;
}
