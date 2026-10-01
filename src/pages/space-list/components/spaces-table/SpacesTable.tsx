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

import { createSpaceTableColumns } from './components/space-table-columns';
import { SPACE_COLUMN_GROUPS, SPACE_DYNAMIC_GROUPS } from './space-column-groups';

export type SpaceRow = {
  id: string;
  Slug: string;
  SpaceID: string;
  Labels: Record<string, string>;
  CreatedAt: string;
  UpdatedAt: string;
  TotalUnitCount: number;
  TotalBridgeWorkerCount: number;
  TotalTargets: number;
  TotalTriggers: number;
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
      { field: 'UpdatedAt', sort: 'desc' as const },
    ],
    columnVisibility: {
      Slug: true,
      SpaceID: false,
      'Labels.Environment': true,
      TotalUnitCount: true,
      TotalBridgeWorkerCount: true,
      TotalTargets: true,
      TotalTriggers: true,
      CreatedAt: false,
      UpdatedAt: true,
    } as Record<string, boolean>,
  }), []);

  // Convert spaces to row items
  const rows = useMemo<SpaceRow[]>(() => {
    return spaces.map((space) => {
      const triggerCount = space.TriggerCountByEventType
        ? Object.values(space.TriggerCountByEventType).reduce((sum, count) => sum + count, 0)
        : 0;

      return {
        id: space.Space?.SpaceID || '',
        Slug: space.Space?.Slug || '',
        SpaceID: space.Space?.SpaceID || '',
        Labels: space.Space?.Labels || {},
        CreatedAt: space.Space?.CreatedAt || '',
        UpdatedAt: space.Space?.UpdatedAt || '',
        TotalUnitCount: space.TotalUnitCount || 0,
        TotalBridgeWorkerCount: space.TotalBridgeWorkerCount || 0,
        TotalTargets: space.TotalTargetCount || 0,
        TotalTriggers: triggerCount,
        _extendedSpace: space,
      };
    });
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

  // Combine all columns - insert label columns after Slug (index 0)
  const baseColumns = useMemo(() => {
    const [slugCol, ...restCols] = staticColumns;
    return [slugCol, ...labelColumns, ...restCols];
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
