// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback } from 'react';

import {
  Column,
  FilterRead,
  ViewRead,
  useCreateFilterMutation,
  useCreateViewMutation,
  useDeleteViewMutation,
  usePatchFilterMutation,
  usePatchViewMutation,
} from '@confighub/rtk-query';

import {
  DraftView,
  filterSlugFromViewSlug,
  VIEW_TARGET_ANNOTATION,
} from '../types';

interface SaveResult {
  view: ViewRead;
  filter: FilterRead;
}

/**
 * Manages the transparent create/update of a Filter + View pair.
 * The user only sees a single "save" action; the filter is managed behind the scenes.
 */
export function useTransparentFilter() {
  const [createFilter] = useCreateFilterMutation();
  const [patchFilter] = usePatchFilterMutation();
  const [createView] = useCreateViewMutation();
  const [patchView] = usePatchViewMutation();
  const [deleteView] = useDeleteViewMutation();

  /**
   * Save a view (and its backing filter), creating them if they don't exist yet,
   * or patching them if they do.
   *
   * @param spaceId - The space in which to store new views and filters
   * @param draft - The current draft state from the view builder
   * @param existingViewId - If editing an existing view, its ViewID
   * @param existingFilterId - If editing an existing view, its FilterID
   * @param existingFilterSpaceId - The space where the existing filter lives (may differ from spaceId)
   * @param existingViewSpaceId - The space where the existing view lives (may differ from spaceId)
   */
  const saveView = useCallback(
    async (
      spaceId: string,
      draft: DraftView,
      existingViewId?: string,
      existingFilterId?: string,
      existingFilterSpaceId?: string,
      existingViewSpaceId?: string,
    ): Promise<SaveResult> => {
      const filterSlug = filterSlugFromViewSlug(draft.slug);

      // Step 1: Create or update the filter. Resource is a real entity type, so
      // it goes on the wire as itself.
      const filterFrom = draft.entityType;
      // WhereData and ResourceType exist for entity types whose configuration is
      // opaque and has to be queried by a function. A Resource's is stored as
      // JSON, so its predicates live in Where alongside everything else; clear
      // them for the others too, so converting a view doesn't carry stale
      // fields forward.
      const supportsData = draft.entityType === 'Unit';
      const whereData = supportsData ? draft.whereDataClause || null : null;
      const resourceType = supportsData ? draft.resourceType || null : null;
      let filter: FilterRead;
      if (existingFilterId && existingFilterId.length > 0) {
        const result = await patchFilter({
          spaceId: existingFilterSpaceId || spaceId,
          filterId: existingFilterId,
          body: {
            DisplayName: `${draft.displayName} Filter`,
            Slug: filterSlug,
            Where: draft.whereClause || null,
            WhereData: whereData,
            ResourceType: resourceType,
          },
        }).unwrap();
        filter = result;
      } else {
        const result = await createFilter({
          spaceId,
          allowExists: 'true',
          filter: {
            Slug: filterSlug,
            DisplayName: `${draft.displayName} Filter`,
            From: filterFrom,
            Where: draft.whereClause || undefined,
            WhereData: whereData ?? undefined,
            ResourceType: resourceType ?? undefined,
          },
        }).unwrap();
        filter = result;
      }

      const filterId = filter.FilterID!;

      // Backend requires GroupBy/OrderBy columns to be in the columns list.
      // They are excluded from the UI display in viewToDraft.
      const columnNames = new Set(draft.columns.map((c) => c.Name));
      const extraColumns: Column[] = [];
      for (const gb of draft.groupBys) {
        if (!columnNames.has(gb)) {
          extraColumns.push({ Name: gb });
        }
      }
      if (draft.orderBy && !columnNames.has(draft.orderBy)) {
        extraColumns.push({ Name: draft.orderBy });
      }
      // The schema has no per-column groupBy ordering field, so getGroupByColumns
      // reconstructs order from the columns array position. Move column-level
      // groupBys to the end in `draft.groupBys.slice(1)` order so reload
      // preserves the user's intended grouping precedence. Display columns are
      // unaffected because the table hides groupBy columns (see ViewExplorer).
      const columnGroupBys = draft.groupBys.slice(1);
      const columnGroupBySet = new Set(columnGroupBys);
      const allCols = [...draft.columns, ...extraColumns];
      const displayCols = allCols.filter((c) => !columnGroupBySet.has(c.Name));
      const orderedGroupCols = columnGroupBys
        .map((name) => allCols.find((c) => c.Name === name))
        .filter((c): c is Column => !!c);
      const columns = [...displayCols, ...orderedGroupCols].map((c) => ({
        ...c,
        GroupBy: columnGroupBySet.has(c.Name) ? true : undefined,
      }));

      // Step 2: Create or update the view
      // First groupBy becomes top-level GroupBy; the rest are column-level (already set above).
      const topLevelGroupBy = draft.groupBys[0] ?? '';
      // View.Of carries the entity type directly. The annotation that used to
      // stand in for it is cleared on save, so a view rewritten here stops
      // depending on the legacy fallback in entityTypeOfView.
      const viewOf = draft.entityType;
      const viewTarget = null;
      let view: ViewRead;
      if (existingViewId && existingViewId.length > 0) {
        const result = await patchView({
          spaceId: existingViewSpaceId || spaceId,
          viewId: existingViewId,
          body: {
            DisplayName: draft.displayName,
            Slug: draft.slug,
            FilterID: filterId,
            Of: viewOf,
            Annotations: { [VIEW_TARGET_ANNOTATION]: viewTarget },
            Columns: columns.length > 0 ? columns : null,
            GroupBy: topLevelGroupBy || null,
            OrderBy: draft.orderBy || null,
            OrderByDirection: draft.orderBy ? draft.orderByDirection : null,
          },
        }).unwrap();
        view = result;
      } else {
        const result = await createView({
          spaceId,
          allowExists: 'true',
          view: {
            Slug: draft.slug,
            DisplayName: draft.displayName,
            FilterID: filterId,
            Of: viewOf,
            Annotations: viewTarget ? { [VIEW_TARGET_ANNOTATION]: viewTarget } : undefined,
            Columns: columns.length > 0 ? columns : undefined,
            GroupBy: topLevelGroupBy || undefined,
            OrderBy: draft.orderBy || undefined,
            OrderByDirection: draft.orderBy ? draft.orderByDirection : undefined,
          },
        }).unwrap();
        view = result;
      }

      return { view, filter };
    },
    [createFilter, patchFilter, createView, patchView],
  );

  const removeView = useCallback(
    async (spaceId: string, viewId: string) => {
      await deleteView({ spaceId, viewId }).unwrap();
    },
    [deleteView],
  );

  return { saveView, removeView };
}
