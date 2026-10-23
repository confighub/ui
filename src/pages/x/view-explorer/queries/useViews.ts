// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { type ExtendedViewRead, type FilterRead, type ViewRead, useListAllViewsQuery } from '@confighub/rtk-query';

import { VIEW_KIND_ANNOTATION_KEY } from '../model/annotations';

/** A saved View as the explorer shows it in its tab strip. */
export interface SavedView {
  viewId: string;
  spaceId: string;
  filterId?: string;
  filterSpaceId?: string;
  name: string;
  slug: string;
  updatedAt: string;
  view: ViewRead;
  filter?: FilterRead;
  /** The View with its Filter, as the row drawer takes it. */
  extended: ExtendedViewRead;
}

export const SYSTEM_SPACE_SLUG = 'confighub-system';

function toSaved(ev: ExtendedViewRead): SavedView | null {
  const v = ev.View;
  if (!v?.ViewID || !v.SpaceID) return null;
  return {
    viewId: v.ViewID,
    spaceId: v.SpaceID,
    filterId: v.FilterID || undefined,
    filterSpaceId: ev.Filter?.SpaceID || undefined,
    name: v.DisplayName || v.Slug || 'Untitled view',
    slug: v.Slug ?? '',
    updatedAt: v.UpdatedAt ?? '',
    view: v,
    filter: ev.Filter,
    extended: ev,
  };
}

/**
 * Every View in the organization the explorer can open, most recently updated
 * first. Views another page owns (a Components grouping view carries the
 * view-kind annotation) never appear: they are not general-purpose views.
 */
export function useViews() {
  const { data, isLoading, isError, error, refetch } = useListAllViewsQuery({ include: 'FilterID' });
  const views = useMemo(() => {
    const out: SavedView[] = [];
    for (const ev of data ?? []) {
      if (ev.View?.Annotations?.[VIEW_KIND_ANNOTATION_KEY]) continue;
      const saved = toSaved(ev);
      if (saved) out.push(saved);
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [data]);
  return { views, isLoading, isError, error, refetch } as const;
}
