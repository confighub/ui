// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { useAttributeColumnManager } from '@/components/entity-data-grid/hooks/useAttributeColumnManager';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FilteredEmptyState } from '@/components/filtered-empty-state';
import { SkeletonTable } from '@/components/skeleton-table/SkeletonTable';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { EmptyTriggers } from '@/pages/space-detail/components/empty-triggers/EmptyTriggers';
import { useLazyListTriggersQuery } from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';

import {
  TRIGGER_COLUMN_GROUPS,
  TRIGGER_DYNAMIC_GROUPS,
  TriggerRowItem,
  createTriggerStaticColumns,
} from './trigger-columns';

export interface TriggersTableProps {
  onRowSelected?: (newSelection: Array<string>) => void;
  onAddTrigger?: () => void;
  spaceID: string;
  isLoading?: boolean;
  selectedRows?: string[];
  /** Optional WHERE clause for filtering triggers */
  where?: string;
  /** Callback to clear all filters */
  onClearFilter?: () => void;
  /** Optional filter element (e.g. QueryBuilder) rendered inside the data grid toolbar */
  filterElement?: React.ReactNode;
}

const GRID_DEFAULTS = {
  sortModel: [{ field: 'Slug', sort: 'asc' as const }],
  columnVisibility: {
    Slug: true,
    TriggerID: false,
    SpaceID: false,
    FunctionName: true,
    ToolchainType: true,
    BridgeWorkerSlug: true,
    BridgeWorkerID: false,
    Arguments: true,
    Event: true,
    Validating: true,
    Disabled: true,
    CreatedAt: false,
    UpdatedAt: true,
  } as Record<string, boolean>,
};

export const TriggersTable = ({
  onRowSelected,
  onAddTrigger,
  spaceID,
  selectedRows = [],
  where,
  onClearFilter,
  filterElement,
}: TriggersTableProps) => {
  const [getTriggersBySpaceID, { data: extendedTriggers, isLoading, error: queryError }] =
    useLazyListTriggersQuery();

  const filterError = queryError ? getApiErrorMessage(queryError) : undefined;

  // Track dismissed error so user can dismiss without clearing filter inputs
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // Reset dismissed state when a new error comes in
  useEffect(() => {
    if (filterError && filterError !== dismissedError) {
      setDismissedError(null);
    }
  }, [filterError, dismissedError]);

  useEffect(() => {
    if (spaceID) {
      getTriggersBySpaceID({
        spaceId: spaceID,
        where,
      });
    }
  }, [spaceID, getTriggersBySpaceID, where]);

  const triggers = extendedTriggers || [];

  // Convert triggers to row items
  const rows = useMemo<TriggerRowItem[]>(() => {
    return triggers.map((trigger) => {
      const args = (trigger?.Trigger?.Arguments || [])
        .map((arg) => `${arg.ParameterName}=${arg.Value}`)
        .join(', ');

      return {
        id: trigger?.Trigger?.TriggerID || '',
        Slug: trigger?.Trigger?.Slug || 'Unknown Name',
        TriggerID: trigger?.Trigger?.TriggerID || '',
        SpaceID: trigger?.Trigger?.SpaceID || '',
        FunctionName: trigger?.Trigger?.FunctionName || 'Unknown Function',
        ToolchainType: trigger?.Trigger?.ToolchainType || 'Unknown Type',
        Event: String(trigger?.Trigger?.Event || 'N/A'),
        Arguments: args,
        BridgeWorkerSlug: trigger?.BridgeWorker?.Slug || '',
        BridgeWorkerID: trigger?.BridgeWorker?.BridgeWorkerID || '',
        Validating: trigger?.Trigger?.Validating || false,
        Disabled: trigger?.Trigger?.Disabled || false,
        Warn: trigger?.Trigger?.Warn || false,
        CreatedAt: trigger?.Trigger?.CreatedAt || '',
        UpdatedAt: trigger?.Trigger?.UpdatedAt || '',
        Labels: trigger?.Trigger?.Labels || {},
        _extendedTrigger: trigger, // Store original for edit callback
      };
    });
  }, [triggers]);

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
  const staticColumns = useMemo(() => createTriggerStaticColumns(), []);

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
  } = useGridPersistence('triggers-table', GRID_DEFAULTS);

  // Apply stored widths to columns
  const allColumns = useMemo(
    () =>
      applyStoredWidths(
        baseColumns as GridColDef<Record<string, unknown>>[],
      ) as GridColDef<TriggerRowItem>[],
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

  if (isLoading) {
    return <SkeletonTable />;
  }

  // Check if error should be shown (not dismissed)
  const showError = filterError && filterError !== dismissedError;

  if (triggers.length === 0) {
    if (showError) {
      return (
        <ErrorList errors={[filterError]} onClose={() => setDismissedError(filterError)} />
      );
    }
    if (where && onClearFilter) {
      return <FilteredEmptyState entityName='triggers' onClearFilters={onClearFilter} />;
    }
    if (onAddTrigger) {
      return <EmptyTriggers onAddTrigger={onAddTrigger} />;
    }
    return null;
  }

  return (
    <>
      {showError && (
        <ErrorList errors={[filterError]} onClose={() => setDismissedError(filterError)} />
      )}
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
        columnGroups={TRIGGER_COLUMN_GROUPS}
        dynamicGroups={TRIGGER_DYNAMIC_GROUPS}
        filterElement={filterElement}
        slots={DATE_TIME_GRID_SLOTS}
      />
    </>
  );
};
