// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { useAttributeColumnManager } from '@/components/entity-data-grid/hooks/useAttributeColumnManager';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { ExtendedTargetRead } from '@confighub/rtk-query';
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';

import {
  TARGET_COLUMN_GROUPS,
  TARGET_DYNAMIC_GROUPS,
  TargetRowItem,
  createTargetStaticColumns,
} from './target-columns';

export interface TargetsTableProps {
  targets: Array<ExtendedTargetRead>;
  onRowSelected?: (newSelection: Array<string>) => void;
  isLoading?: boolean;
  selectedRows?: string[];
  filterElement?: React.ReactNode;
  noRowsOverlay?: React.ReactNode;
  /** Chrome-free empty state rendered instead of the grid when no targets exist at all */
  emptyState?: React.ReactNode;
  /** True when the unfiltered target list is empty */
  hasNoData?: boolean;
}

const GRID_DEFAULTS = {
  sortModel: [{ field: 'Slug', sort: 'asc' as const }],
  columnVisibility: {
    Slug: true,
    TargetID: false,
    Space: true,
    SpaceID: false,
    ProviderType: true,
    Parameters: true,
    BridgeWorkerSlug: true,
    BridgeWorkerID: false,
    CreatedAt: false,
    UpdatedAt: true,
  } as Record<string, boolean>,
};

export const TargetsTable = ({
  targets = [],
  onRowSelected,
  isLoading = false,
  selectedRows = [],
  filterElement,
  noRowsOverlay,
  emptyState,
  hasNoData = false,
}: TargetsTableProps) => {
  // Convert targets to row items
  const rows = useMemo<TargetRowItem[]>(() => {
    return targets.map((target) => ({
      id: target.Target?.TargetID || '',
      Slug: target.Target?.Slug || '',
      TargetID: target.Target?.TargetID || '',
      Space: target.Space?.Slug || '',
      SpaceID: target.Space?.SpaceID || '',
      ProviderType: target.Target?.ProviderType || '',
      Parameters: target.Target?.Parameters || '',
      Labels: target.Target?.Labels || {},
      BridgeWorkerID: target.Target?.BridgeWorkerID || '',
      BridgeWorkerSlug: target.BridgeWorker?.Slug || '',
      CreatedAt: target.Target?.CreatedAt || '',
      UpdatedAt: target.Target?.UpdatedAt || '',
      _extendedTarget: target, // Store original for edit callback
    }));
  }, [targets]);

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
  const staticColumns = useMemo(() => createTargetStaticColumns(), []);

  // Combine all columns
  const baseColumns = useMemo(
    () => [...staticColumns, ...labelColumns],
    [labelColumns, staticColumns],
  );

  const {
    handleColumnResize,
    applyStoredWidths,
    onSortModelChange,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence('targets-table', GRID_DEFAULTS);

  // Apply stored widths to columns
  const allColumns = useMemo(
    () =>
      applyStoredWidths(
        baseColumns as GridColDef<Record<string, unknown>>[],
      ) as GridColDef<TargetRowItem>[],
    [applyStoredWidths, baseColumns],
  );

  // Dynamic columns (Labels) default to hidden unless specified in GRID_DEFAULTS
  const effectiveColumnVisibilityModel = useMemo(() => {
    const dynamicVisibility: Record<string, boolean> = {};
    baseColumns.forEach((col) => {
      if (col.field.startsWith('Labels.')) {
        dynamicVisibility[col.field] = GRID_DEFAULTS.columnVisibility[col.field] ?? false;
      }
    });
    return { ...dynamicVisibility, ...columnVisibilityModel };
  }, [baseColumns, columnVisibilityModel]);

  const handleRowSelectionChange = (newSelection: GridRowSelectionModel) => {
    // @ts-expect-error GridRowSelectionModel is actually string[]
    onRowSelected?.(newSelection);
  };

  return (
    <EntityDataGrid
      rows={rows}
      columns={allColumns}
      loading={isLoading}
      checkboxSelection={!!onRowSelected}
      rowSelectionModel={selectedRows}
      onRowSelectionModelChange={handleRowSelectionChange}
      columnVisibilityModel={effectiveColumnVisibilityModel}
      onColumnVisibilityModelChange={onColumnVisibilityModelChange}
      onSortModelChange={onSortModelChange}
      onColumnWidthChange={handleColumnResize}
      onClearState={clearStoredState}
      hasStateChanged={hasStateChanged}
      columnGroups={TARGET_COLUMN_GROUPS}
      dynamicGroups={TARGET_DYNAMIC_GROUPS}
      filterElement={filterElement}
      noRowsOverlay={noRowsOverlay}
      emptyState={emptyState}
      hasNoData={hasNoData}
      slots={DATE_TIME_GRID_SLOTS}
    />
  );
};
