// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { useAttributeColumnManager } from '@/components/entity-data-grid/hooks/useAttributeColumnManager';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { ExtendedBridgeWorkerRead } from '@confighub/rtk-query';
import { getAvailableFunctions } from '@/utility/bridge-worker-utils';
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';

import {
  BridgeWorkerRowItem,
  createBridgeWorkerStaticColumns,
  BRIDGE_WORKER_COLUMN_GROUPS,
  BRIDGE_WORKER_DYNAMIC_GROUPS,
} from './bridge-worker-columns';

export interface BridgeWorkerListTableProps {
  bridgeWorkers: ExtendedBridgeWorkerRead[];
  selectedRows?: string[];
  onRowSelected?: (newSelection: string[]) => void;
  isLoading?: boolean;
  filterElement?: React.ReactNode;
  noRowsOverlay?: React.ReactNode;
  /** Chrome-free empty state rendered instead of the grid when no workers exist at all */
  emptyState?: React.ReactNode;
  /** True when the unfiltered worker list is empty */
  hasNoData?: boolean;
}

const GRID_DEFAULTS = {
  sortModel: [{ field: 'Slug', sort: 'asc' as const }],
  columnVisibility: {
    Slug: true,
    BridgeWorkerID: false,
    Space: true,
    SpaceID: false,
    TargetCount: true,
    AvailableFunctions: true,
    Condition: true,
    LastSeenAt: true,
    LastMessage: false,
    IPAddress: false,
    CreatedAt: false,
    UpdatedAt: true,
  } as Record<string, boolean>,
};

export const BridgeWorkerListTable = ({
  bridgeWorkers,
  selectedRows = [],
  onRowSelected,
  isLoading = false,
  filterElement,
  noRowsOverlay,
  emptyState,
  hasNoData = false,
}: BridgeWorkerListTableProps) => {
  // Convert workers to row items
  const rows = useMemo<BridgeWorkerRowItem[]>(() => {
    return bridgeWorkers.map((worker) => {
      const providedInfo = worker.BridgeWorker?.ProvidedInfo;
      const availableFunctionsArray = providedInfo ? getAvailableFunctions(providedInfo) : [];
      const functionCount = availableFunctionsArray?.length ?? 0;

      // Convert ProvidedInfo to a string map for dynamic columns
      // Flatten nested structures for better display
      // Store arrays as JSON strings with a special marker so we can detect them later
      const providedInfoMap: { [key: string]: string } = {};
      if (providedInfo) {
        // Handle any other top-level properties
        Object.entries(providedInfo).forEach(([key, value]) => {
          // Skip the complex objects
          if (key === 'BridgeWorkerInfo' || key === 'FunctionWorkerInfo') {
            return;
          }
          providedInfoMap[key] = typeof value === 'string' ? value : JSON.stringify(value);
        });
      }

      return {
        id: worker.BridgeWorker?.BridgeWorkerID || '',
        Slug: worker.BridgeWorker?.Slug || '',
        BridgeWorkerID: worker.BridgeWorker?.BridgeWorkerID || '',
        Space: worker.Space?.Slug || '',
        SpaceID: worker.Space?.SpaceID || '',
        Condition: worker.BridgeWorker?.Condition || '',
        TargetCount: worker.TargetCount || 0,
        AvailableFunctions: functionCount,
        LastSeenAt: worker.BridgeWorker?.LastSeenAt || '',
        LastMessage: worker.BridgeWorker?.LastMessage || '',
        IPAddress: worker.BridgeWorker?.IPAddress || '',
        CreatedAt: worker.BridgeWorker?.CreatedAt || '',
        UpdatedAt: worker.BridgeWorker?.UpdatedAt || '',
        Labels: worker.BridgeWorker?.Labels || {},
        ProvidedInfo: providedInfoMap,
        _extendedWorker: worker, // Store original for edit callback
      };
    });
  }, [bridgeWorkers]);

  // Attribute configs (define once and reuse)
  const labelConfig = useMemo(
    () => ({
      fieldName: 'Labels' as const,
      columnPrefix: 'Labels.',
      getAttributes: (row: BridgeWorkerRowItem) => row.Labels,
    }),
    [],
  );

  const providedInfoConfig = useMemo(
    () => ({
      fieldName: 'ProvidedInfo' as const,
      columnPrefix: 'ProvidedInfo.',
      getAttributes: (row: BridgeWorkerRowItem) => row.ProvidedInfo,
    }),
    [],
  );

  // Use attribute column manager for Labels and ProvidedInfo
  const { availableAttributeKeys, createAttributeColumn } = useAttributeColumnManager(rows, {
    attributeConfigs: [labelConfig, providedInfoConfig],
  });

  // Generate dynamic columns
  const dynamicColumns = useMemo(() => {
    const columns = [];

    // Labels columns
    const labels = availableAttributeKeys.get('Labels') || [];
    columns.push(...labels.map((label) => createAttributeColumn(labelConfig, label)));

    // ProvidedInfo columns
    const providedInfoKeys = availableAttributeKeys.get('ProvidedInfo') || [];
    columns.push(
      ...providedInfoKeys.map((key) => createAttributeColumn(providedInfoConfig, key)),
    );

    return columns;
  }, [availableAttributeKeys, createAttributeColumn, labelConfig, providedInfoConfig]);

  // Create static columns
  const staticColumns = useMemo(() => createBridgeWorkerStaticColumns(), []);

  // Combine all columns
  const baseColumns = useMemo(
    () => [...staticColumns, ...dynamicColumns],
    [dynamicColumns, staticColumns],
  );

  const {
    handleColumnResize,
    applyStoredWidths,
    onSortModelChange,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence('bridge-workers-table', GRID_DEFAULTS);

  // Apply stored widths to columns
  const allColumns = useMemo(
    () => applyStoredWidths(baseColumns as GridColDef<Record<string, unknown>>[]) as GridColDef<BridgeWorkerRowItem>[],
    [applyStoredWidths, baseColumns],
  );

  // Dynamic columns (Labels, ProvidedInfo) default to hidden unless specified in GRID_DEFAULTS
  const effectiveColumnVisibilityModel = useMemo(() => {
    const dynamicVisibility: Record<string, boolean> = {};
    baseColumns.forEach((col) => {
      if (col.field.startsWith('Labels.') || col.field.startsWith('ProvidedInfo.')) {
        dynamicVisibility[col.field] = GRID_DEFAULTS.columnVisibility[col.field] ?? false;
      }
    });
    return { ...dynamicVisibility, ...columnVisibilityModel };
  }, [baseColumns, columnVisibilityModel]);

  const handleRowSelectionChange = (newSelection: GridRowSelectionModel) => {
    onRowSelected?.(newSelection as string[]);
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
      columnGroups={BRIDGE_WORKER_COLUMN_GROUPS}
      dynamicGroups={BRIDGE_WORKER_DYNAMIC_GROUPS}
      filterElement={filterElement}
      noRowsOverlay={noRowsOverlay}
      emptyState={emptyState}
      hasNoData={hasNoData}
      slots={DATE_TIME_GRID_SLOTS}
    />
  );
};
