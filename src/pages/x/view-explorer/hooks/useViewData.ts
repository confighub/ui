// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import {
  Column,
  ExtendedViewRead,
  useListAllUnitsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import { GroupNavRow, getCellValue } from '../cell-value';
import { entityTypeOfView, getGroupByColumns, LABEL_PREFIX } from '../types';
import { spaceQueryFields } from '../space-query';
import { useResourceViewRows } from './useResourceViewRows';

/**
 * Translation from UI column name (as stored in View.Columns / GroupBy /
 * OrderBy) to the server `select` fields and `include` entities needed to
 * render it.
 *
 * See header note on the old useViewUnits hook for the design rationale. The
 * same pattern for Spaces is in `../space-query`.
 */
type ColumnMapping = { select?: readonly string[]; include?: readonly string[] };

const UNIT_COLUMN_MAPPING: Record<string, ColumnMapping> = {
  // Unit scalar fields (column name matches server field name)
  Slug: { select: ['Slug'] },
  ToolchainType: { select: ['ToolchainType'] },
  HeadRevisionNum: { select: ['HeadRevisionNum'] },
  LastReleasedRevisionNum: { select: ['LastReleasedRevisionNum'] },
  CreatedAt: { select: ['CreatedAt'] },
  UpdatedAt: { select: ['UpdatedAt'] },
  LastChangeDescription: { select: ['LastChangeDescription'] },
  ProviderType: { select: ['ProviderType'] },
  DisplayName: { select: ['DisplayName'] },
  UpstreamRevisionNum: { select: ['UpstreamRevisionNum'] },

  // Aliases for hydrated related entities (rendered as <entity>.Slug)
  Space: { include: ['SpaceID'] },
  Target: { include: ['TargetID'] },
  ChangeSetSlug: { include: ['ChangeSetID'] },
  UpstreamUnitSlug: { include: ['UpstreamUnitID'] },
  UpstreamSpaceSlug: { include: ['UpstreamSpaceID'] },

  // Fields read off hydrated Revision objects
  HeadRevisionCreatedAt: { include: ['HeadRevisionNum'] },

  // Auto-hydrated on UnitStatus — server always returns these
  // Client-computed from multiple fields
  UnreleasedChanges: { select: ['HeadRevisionNum', 'LastReleasedRevisionNum', 'TargetID'] },
  // Pre-Release name, still present in saved Views.
  UnappliedChanges: { select: ['HeadRevisionNum', 'LastReleasedRevisionNum', 'TargetID'] },
  UpgradeNeeded: { select: ['UpstreamRevisionNum'], include: ['UpstreamUnitID'] },
};

export interface ViewDataResult {
  /** Rows used to build the GroupNavPanel tree. Always populated when ready. */
  groupingRows: GroupNavRow[];
  /** Rows shown in the grid (filtered to the current group selection). */
  displayRows: GroupNavRow[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

interface UseViewDataArgs {
  selectedGroups: string[];
  groupByColumns: string[];
}

/**
 * Fetches the rows backing a view. Dispatches on the view's entity type and
 * builds a narrow select/include set from the view's column references so the
 * server doesn't ship full Revision / nested payloads when no column reads
 * them. RTK Query's `skip` parameter keeps the inactive branches idle —
 * hooks must be called unconditionally.
 *
 * All three entity types work the same way: one query for the row set, then
 * client-side filtering by the GroupNavPanel selection. Resource views used to
 * be the exception -- they needed the user to drill into a group before loading
 * anything, because building the rows meant invoking get-resources across every
 * unit in the organization. Reading the Resource entity instead makes an
 * org-wide load a single query, so the drill-in requirement is gone and
 * grouping by a resource's own attributes works like any other column.
 */
export function useViewData(
  view: ExtendedViewRead,
  { selectedGroups, groupByColumns }: UseViewDataArgs,
): ViewDataResult {
  const entityType = entityTypeOfView(view);
  const v = view.View;
  const filter = view.Filter;
  const whereClause = filter?.Where;
  const filterId = v?.FilterID;


  const referenced = [
    ...(v?.Columns ?? []).map((c: Column) => c.Name),
    ...getGroupByColumns(v),
    v?.OrderBy,
  ];

  // ── Unit query (active for Unit views) ────────────────────────────────────
  const unitSelectFields = new Set<string>(['UnitID', 'Slug', 'SpaceID', 'TargetID']);
  const unitIncludeFields = new Set<string>(['SpaceID', 'TargetID']);
  for (const col of referenced) {
    if (!col) continue;
    if (col.startsWith(LABEL_PREFIX)) {
      unitSelectFields.add('Labels');
      continue;
    }
    const mapping = UNIT_COLUMN_MAPPING[col];
    mapping?.select?.forEach((f) => unitSelectFields.add(f));
    mapping?.include?.forEach((f) => unitIncludeFields.add(f));
  }

  // When the view itself is passed, the server resolves the view's own
  // FilterID; sending `filter` as well is rejected outright ("cannot specify
  // both a filter parameter and a view with a FilterID"), which blanked every
  // unit view that had an attached filter. Pass the filter explicitly only
  // when there is no view to carry it.
  const unitsResult = useListAllUnitsQuery(
    {
      filter: v?.ViewID ? undefined : filterId,
      where: !filterId && whereClause ? whereClause : undefined,
      select: Array.from(unitSelectFields).sort().join(','),
      include: Array.from(unitIncludeFields).sort().join(','),
      // The server extracts the view's columns and returns them as ViewColumns.
      // Without this a column the row cannot answer from its own fields -- any
      // DataPath or DataExpression, and any metadata attribute whose name
      // differs from the field it reads -- renders as an empty cell.
      view: v?.ViewID,
    },
    { skip: entityType !== 'Unit' },
  );

  // ── Space query (active when entityType === 'Space') ──────────────────────
  // Filter API can be applied to Spaces too: the server resolves `filter=UUID`
  // generically. We use the same path for both entity types.
  const spacesResult = useListSpacesQuery(
    {
      filter: filterId,
      where: !filterId && whereClause ? whereClause : undefined,
      ...spaceQueryFields(referenced),
    },
    { skip: entityType !== 'Space' },
  );

  // ── Resource query (active when entityType === 'Resource') ────────────────
  // Only expand the entities some column actually reads. Unit.Slug and
  // Space.Slug are not among them: the Resource carries both slugs, and
  // expanding a Unit would fetch its configuration data to read one string.
  const resourceInclude = useMemo(() => {
    const includes = new Set<string>();
    for (const col of referenced) {
      if (!col) continue;
      if (col.startsWith(LABEL_PREFIX) || col.startsWith('Unit.')) {
        if (col !== 'Unit.Slug') includes.add('UnitID');
        continue;
      }
      if (col.startsWith('Space.') && col !== 'Space.Slug') includes.add('SpaceID');
    }
    return Array.from(includes).sort().join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenced.join(',')]);

  const resourcesResult = useResourceViewRows({
    where: whereClause || undefined,
    viewId: v?.ViewID,
    include: resourceInclude,
    skip: entityType !== 'Resource',
  });

  // ── Filter by the GroupNavPanel selection ─────────────────────────────────
  // Client-side for every entity type: the panel groups on the same values the
  // cells show, several of which are computed rather than stored, so the server
  // cannot express the selection as a WHERE clause.
  const active =
    entityType === 'Resource'
      ? resourcesResult
      : entityType === 'Unit'
        ? unitsResult
        : spacesResult;
  const allRows = (active.data ?? []) as GroupNavRow[];
  const displayRows =
    selectedGroups.length === 0 || groupByColumns.length === 0
      ? allRows
      : filterByGroupPath(allRows, groupByColumns, selectedGroups);
  return {
    groupingRows: allRows,
    displayRows,
    isLoading: active.isLoading,
    isFetching: active.isFetching,
    isError: active.isError,
    refetch: () => {
      void active.refetch();
    },
  };
}

/**
 * Apply the GroupNavPanel selection path to a row set. Mirrors what the
 * page used to do inline; lives here so the Resource path can share the
 * same iteration shape for any future client-side filtering.
 */
function filterByGroupPath(
  rows: GroupNavRow[],
  groupByColumns: string[],
  selectedGroups: string[],
): GroupNavRow[] {
  let filtered = rows;
  for (let i = 0; i < selectedGroups.length && i < groupByColumns.length; i++) {
    const value = selectedGroups[i];
    const col = groupByColumns[i];
    filtered = filtered.filter((r) => (getCellValue(r, col) || '(empty)') === value);
  }
  return filtered;
}
