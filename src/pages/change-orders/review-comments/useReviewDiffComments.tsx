// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useRef } from 'react';

import type { DiffComments, DiffRowComments } from '@/components/config-diff/diffComments';

import type { ReviewDiffTarget } from './reviewCommentsContext';
import { AddCommentButton, RowThreads } from './ReviewRowParts';

/**
 * The comments a Unit's diff takes, for `ConfigDiffView`'s `comments`, for a page that renders its
 * diffs under a `ReviewCommentsProvider`. Stable for one target, so a memoised diff does not draw
 * again for it: what the rows show is read from the provider as it changes. `undefined` when
 * `enabled` is false, which leaves the diff as it was.
 */
export function useReviewDiffComments(enabled: boolean): (target: ReviewDiffTarget | undefined) => DiffComments | undefined {
  const cache = useRef(new Map<string, DiffComments>());
  return useCallback(
    (target: ReviewDiffTarget | undefined) => {
      if (!enabled || target === undefined) return undefined;
      const key = [target.unitId, target.spaceId, ...(target.memberUnitIds ?? [])].join('|');
      const cached = cache.current.get(key);
      if (cached !== undefined) return cached;
      const byResource = new Map<string, DiffRowComments>();
      const comments: DiffComments = {
        forResource: (resource) => {
          const resourceKey = `${resource?.ResourceType ?? ''}/${resource?.ResourceName ?? ''}`;
          const known = byResource.get(resourceKey);
          if (known !== undefined) return known;
          const rows: DiffRowComments = {
            renderAdd: (path) => <AddCommentButton target={target} resource={resource} path={path} />,
            renderBelow: (path) => <RowThreads target={target} resource={resource} path={path} />,
          };
          byResource.set(resourceKey, rows);
          return rows;
        },
      };
      cache.current.set(key, comments);
      return comments;
    },
    [enabled],
  );
}
