// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { ReviewCommentsContext } from './reviewCommentsContext';
import type { ChangeOrderReviewComments } from './useChangeOrderReviewComments';

export interface ReviewCommentsProviderProps {
  reviews: ChangeOrderReviewComments;
  revisionNumByUnitId: ReadonlyMap<string, number>;
  variantNameOf: (unitId: string) => string | undefined;
  children: ReactNode;
}

/** Review comments for every diff under it: each asks `useReviewDiffComments` for its Unit's. */
export function ReviewCommentsProvider({ reviews, revisionNumByUnitId, variantNameOf, children }: ReviewCommentsProviderProps) {
  const [composing, setComposingSet] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsedSet] = useState<ReadonlySet<string>>(new Set());
  const setComposing = useCallback((key: string, open: boolean) => {
    setComposingSet((current) => {
      if (current.has(key) === open) return current;
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const toggleCollapsed = useCallback((threadId: string) => {
    setCollapsedSet((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }, []);
  const value = useMemo(
    () => ({ reviews, revisionNumByUnitId, variantNameOf, composing, setComposing, collapsed, toggleCollapsed }),
    [reviews, revisionNumByUnitId, variantNameOf, composing, setComposing, collapsed, toggleCollapsed],
  );
  return <ReviewCommentsContext.Provider value={value}>{children}</ReviewCommentsContext.Provider>;
}

