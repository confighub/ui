// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { createContext, useContext } from 'react';

import type { ChangeOrderReviewComments } from './useChangeOrderReviewComments';

/** The diff of one Unit, as a page offers it for review. */
export interface ReviewDiffTarget {
  /** The Unit new comments go on: the one whose diff is drawn. */
  unitId: string;
  spaceId: string;
  /**
   * Units whose comments show on the same rows: the other variants' Units an outcome card stands
   * for when it draws one representative. Their threads say which variant they are on.
   */
  memberUnitIds?: readonly string[];
}

export interface ReviewCommentsState {
  reviews: ChangeOrderReviewComments;
  /** The Revision each Unit's diff is read at: where a new thread is anchored, and what Outdated is measured against. */
  revisionNumByUnitId: ReadonlyMap<string, number>;
  /** A variant's name for a Unit, for a thread shown on another variant's row. */
  variantNameOf: (unitId: string) => string | undefined;
  /** Anchor keys with a new thread being written. */
  composing: ReadonlySet<string>;
  setComposing: (key: string, open: boolean) => void;
  /** Threads folded to one line on this page. */
  collapsed: ReadonlySet<string>;
  toggleCollapsed: (threadId: string) => void;
}

export const ReviewCommentsContext = createContext<ReviewCommentsState | undefined>(undefined);

export function useReviewCommentsState(): ReviewCommentsState | undefined {
  return useContext(ReviewCommentsContext);
}

