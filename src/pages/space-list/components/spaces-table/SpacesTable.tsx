// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { useAttributeColumnManager } from '@/components/entity-data-grid/hooks/useAttributeColumnManager';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { ExtendedSpaceRead } from '@confighub/rtk-query';
import { CmpProps } from '@/types';
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';

import { SPACE_SUMMARY_COUNTS } from '@/utility/space-summary-counts';

import { createSpaceTableColumns } from './components/space-table-columns';
import { SPACE_COLUMN_GROUPS, SPACE_DYNAMIC_GROUPS } from './space-column-groups';

// The counts shown before the user picks others; the rest are in the column picker.
const DEFAULT_COUNT_COLUMNS = new Set(['TotalUnitCount', 'TotalTargetCount', 'TriggerCountByEventType']);

export type SpaceRow = {
  id: string;
  Slug: string;
  SpaceID: string;
  Component: string;
  Labels: Record<string, string>;
  CreatedAt: string;
  UpdatedAt: string;
  WhereTrigger: string;
  TriggerFilter: string;
  AppliedTriggerCount: number;
  ReleaseTarget: string;
  /** The summary counts, by their ExtendedSpace field */
  Counts: Record<string, number>;
  _extendedSpace: ExtendedSpaceRead;
};

export interface SpacesTableProps extends CmpProps {
  spaces: Array<ExtendedSpaceRead>;
  onRowSelected?: (newSelection: Array<string>) => void;
  filterElement?: React.ReactNode;
  noRowsOverlay?: React.ReactNode;
  /** Chrome-free empty state rendered instead of the grid when no spaces exist at all */
  emptyState?: React.ReactNode;
  /** True when the unfiltered space list is empty */
  hasNoData?: boolean;
  isLoading?: boolean;
}

export const SpacesTable = ({ spaces = [], onRowSelected, filterElement, noRowsOverlay, emptyState, hasNoData = false, isLoading = false }: SpacesTableProps) => {
  const gridDefaults = useMemo(() => ({
    sortModel: [
      { field: 'Component', sort: 'asc' as const },
    ],
    columnVisibility: {
      Component: true,
      Slug: true,
      SpaceID: false,
      'Labels.Environment': true,
      // The summary counts other than these are offered in the column picker
      ...Object.fromEntries(SPACE_SUMMARY_COUNTS.map((c) => [c.field, DEFAULT_COUNT_COLUMNS.has(c.field)])),
      WhereTrigger: false,
      TriggerFilter: false,
      AppliedTriggerCount: false,
      ReleaseTarget: false,
      CreatedAt: false,
      UpdatedAt: true,
    } as Record<string, boolean>,
  }), []);

  // Convert spaces to row items
  const rows = useMemo<SpaceRow[]>(() => {
    return spaces.map((space) => ({
      id: space.Space?.SpaceID || '',
      Slug: space.Space?.Slug || '',
      SpaceID: space.Space?.SpaceID || '',
      Component: space.Component?.Slug || '',
      Labels: space.Space?.Labels || {},
      CreatedAt: space.Space?.CreatedAt || '',
      UpdatedAt: space.Space?.UpdatedAt || '',
      WhereTrigger: space.Space?.WhereTrigger || '',
      TriggerFilter: space.TriggerFilter?.Slug || '',
      AppliedTriggerCount: space.Space?.TriggerIDs?.length || 0,
      ReleaseTarget: space.ReleaseTarget?.Slug || '',
      Counts: Object.fromEntries(SPACE_SUMMARY_COUNTS.map((c) => [c.field, c.getValue(space)])),
      _extendedSpace: space,
    }));
  }, [spaces]);

  // Use attribute column manager for Labels
  const { availableAttributeKeys, createAttributeColumn } = useAttributeColumnManager(rows, {
    attributeConfigs: [
      {
        fieldName: 'Labels',
        columnPrefix: 'Labels.',
        getAttributes: (row) => row.Labels,
      },
    ],
  });

  // Generate label columns
  const labelColumns = useMemo(() => {
    const labels = availableAttributeKeys.get('Labels') || [];
    return labels.map((label) =>
      createAttributeColumn(
        {
          fieldName: 'Labels',
          columnPrefix: 'Labels.',
          getAttributes: (row) => row.Labels,
        },
        label,
      ),
    );
  }, [availableAttributeKeys, createAttributeColumn]);

  // Create static columns
  const staticColumns = useMemo(() => createSpaceTableColumns(), []);

  // Combine all columns - insert label columns after Component and Slug
  const baseColumns = useMemo(() => {
    const [componentCol, slugCol, ...restCols] = staticColumns;
    return [componentCol, slugCol, ...labelColumns, ...restCols];
  }, [labelColumns, staticColumns]);

  const {
    handleColumnResize,
    applyStoredWidths,
    sortModel,
    onSortModelChange,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence('spaces-table', gridDefaults);

  // Apply stored widths to columns
  const allColumns = useMemo(
    () => applyStoredWidths(baseColumns as GridColDef<Record<string, unknown>>[]) as GridColDef<SpaceRow>[],
    [applyStoredWidths, baseColumns],
  );

  // Dynamic columns (Labels) default to hidden unless specified in gridDefaults
  const effectiveColumnVisibilityModel = useMemo(() => {
    const dynamicVisibility: Record<string, boolean> = {};
    baseColumns.forEach((col) => {
      if (col.field.startsWith('Labels.')) {
        dynamicVisibility[col.field] = gridDefaults.columnVisibility[col.field] ?? false;
      }
    });
    return { ...dynamicVisibility, ...columnVisibilityModel };
  }, [baseColumns, gridDefaults.columnVisibility, columnVisibilityModel]);

  const handleRowSelectionChange = (newSelection: GridRowSelectionModel) => {
    // @ts-expect-error GridRowSelectionModel is actually string[]
    onRowSelected?.(newSelection);
  };

  return (
    <EntityDataGrid
      rows={rows}
      columns={allColumns}
      checkboxSelection={!!onRowSelected}
      onRowSelectionModelChange={handleRowSelectionChange}
      sortModel={sortModel}
      columnVisibilityModel={effectiveColumnVisibilityModel}
      onColumnVisibilityModelChange={onColumnVisibilityModelChange}
      onSortModelChange={onSortModelChange}
      onColumnWidthChange={handleColumnResize}
      onClearState={clearStoredState}
      hasStateChanged={hasStateChanged}
      columnGroups={SPACE_COLUMN_GROUPS}
      dynamicGroups={SPACE_DYNAMIC_GROUPS}
      loading={isLoading}
      filterElement={filterElement}
      noRowsOverlay={noRowsOverlay}
      emptyState={emptyState}
      hasNoData={hasNoData}
      slots={DATE_TIME_GRID_SLOTS}
    />
  );
};
