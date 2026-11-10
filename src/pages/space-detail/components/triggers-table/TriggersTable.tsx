// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { HIDDEN_REASON_FIELD, hiddenReasonColumn } from '@/components/hidden-entities/hiddenReasonColumn';
import { useAttributeColumnManager } from '@/components/entity-data-grid/hooks/useAttributeColumnManager';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FilteredEmptyState } from '@/components/filtered-empty-state';
import { SkeletonTable } from '@/components/skeleton-table/SkeletonTable';
import { triggerPriority } from '@/utility/triggerEnforcement';
import type { TriggerSelectionStatus } from '@/components/trigger-selection/useTriggerSelection';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { EmptyTriggers } from '@/pages/space-detail/components/empty-triggers/EmptyTriggers';
import { getApiErrorMessage } from '@/utility/error-functions';
import { useListAllTriggersQuery } from '@confighub/rtk-query';
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
  /** The Space whose page this is: its Triggers open in the edit drawer here, others on their own Space's page */
  spaceID?: string;
  /** Where clause over all Triggers in the organization naming those to list */
  where: string;
  /** True when the Triggers are known to be none, such as an empty list of IDs */
  skip?: boolean;
  isLoading?: boolean;
  selectedRows?: string[];
  /** True when the list has a user-applied filter, so an empty result is shown as filtered */
  isFiltered?: boolean;
  /** Callback to clear all filters */
  onClearFilter?: () => void;
  /** Optional filter element (e.g. QueryBuilder) rendered inside the data grid toolbar */
  filterElement?: React.ReactNode;
  /** How each Trigger stands with the Space or Target selecting it; adds the Selection column */
  selectionStatusById?: Record<string, TriggerSelectionStatus>;
  /** Shown instead of the grid when there are no Triggers and no filter */
  emptyState?: React.ReactNode;
  /** Key the column layout is stored under, so each list keeps its own */
  persistenceKey?: string;
  /** Shows the Space column by default, for a list of Triggers from many Spaces */
  showSpaceColumn?: boolean;
  /** Every Trigger's name opens the edit drawer on this page, wherever the Trigger resides */
  editInPlace?: boolean;
  /** The list's include_hidden, naming the hidden Triggers to list too */
  includeHidden?: string;
  /** Controls for the grid's toolbar, before its Columns button */
  customToolbarActions?: React.ReactNode;
}

// The Pack label names the group of policies a Trigger belongs to, which a Space or Target opts
// into by listing it in its WhereTrigger, so it is shown beside the Trigger's name.
const PACK_LABEL_FIELD = 'Labels.Pack';

const GRID_DEFAULTS = {
  sortModel: [{ field: 'Slug', sort: 'asc' as const }],
  columnVisibility: {
    Slug: true,
    TriggerID: false,
    Space: false,
    [PACK_LABEL_FIELD]: true,
    SpaceID: false,
    Selection: false,
    // What a Trigger runs is in its drawer; the list shows what it is for and how far it is
    // enforced.
    FunctionName: false,
    ToolchainType: false,
    ChannelSlug: false,
    ChannelID: false,
    Arguments: false,
    Event: false,
    Validating: true,
    Priority: true,
    Disabled: true,
    [HIDDEN_REASON_FIELD]: false,
    CreatedAt: false,
    UpdatedAt: true,
  } as Record<string, boolean>,
};

// A list of Triggers from across Spaces shows where each is.
const ALL_SPACES_GRID_DEFAULTS = {
  ...GRID_DEFAULTS,
  columnVisibility: { ...GRID_DEFAULTS.columnVisibility, Space: true },
};

// A list of Triggers selected from across Spaces shows where each is and how it is selected.
const SELECTION_GRID_DEFAULTS = {
  ...GRID_DEFAULTS,
  columnVisibility: { ...GRID_DEFAULTS.columnVisibility, Space: true, Selection: true },
};

export const TriggersTable = ({
  onRowSelected,
  onAddTrigger,
  spaceID,
  where,
  skip = false,
  selectedRows = [],
  isFiltered = false,
  onClearFilter,
  filterElement,
  selectionStatusById,
  emptyState,
  persistenceKey = 'triggers-table',
  showSpaceColumn = false,
  editInPlace = false,
  includeHidden,
  customToolbarActions,
}: TriggersTableProps) => {
  const {
    data: extendedTriggers,
    isLoading,
    error: queryError,
  } = useListAllTriggersQuery(
    { where: where || undefined, include: 'SpaceID,ChannelID', includeHidden },
    { skip, refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );

  const filterError = queryError ? getApiErrorMessage(queryError) : undefined;

  // Track dismissed error so user can dismiss without clearing filter inputs
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // Reset dismissed state when a new error comes in
  useEffect(() => {
    if (filterError && filterError !== dismissedError) {
      setDismissedError(null);
    }
  }, [filterError, dismissedError]);

  const triggers = useMemo(
    () => (skip ? [] : extendedTriggers || []),
    [skip, extendedTriggers],
  );

  // Convert triggers to row items
  const rows = useMemo<TriggerRowItem[]>(() => {
    return triggers.map((trigger) => {
      const args = (trigger?.Trigger?.Arguments || [])
        .map((arg) => `${arg.ParameterName}=${arg.Value}`)
        .join(', ');
      const triggerID = trigger?.Trigger?.TriggerID || '';
      const triggerSpaceID = trigger?.Trigger?.SpaceID || '';

      return {
        id: triggerID,
        Slug: trigger?.Trigger?.Slug || 'Unknown Name',
        TriggerID: triggerID,
        SpaceID: triggerSpaceID,
        Space: trigger?.Space?.Slug || '',
        EditLink:
          editInPlace || triggerSpaceID === spaceID
            ? `?edit=${triggerID}`
            : `/spaces/${triggerSpaceID}?tab=1&edit=${triggerID}`,
        Selection: selectionStatusById?.[triggerID],
        FunctionName: trigger?.Trigger?.FunctionName || 'Unknown Function',
        ToolchainType: trigger?.Trigger?.ToolchainType || 'Unknown Type',
        Event: String(trigger?.Trigger?.Event || 'N/A'),
        Arguments: args,
        ChannelSlug: trigger?.Channel?.Slug || '',
        ChannelID: trigger?.Trigger?.ChannelID || '',
        Validating: trigger?.Trigger?.Validating || false,
        Disabled: trigger?.Trigger?.Disabled || false,
        Warn: trigger?.Trigger?.Warn || false,
        Priority: trigger?.Trigger?.Validating ? triggerPriority(trigger.Trigger.Annotations) : undefined,
        CreatedAt: trigger?.Trigger?.CreatedAt || '',
        UpdatedAt: trigger?.Trigger?.UpdatedAt || '',
        HiddenReason: trigger?.Trigger?.HiddenReason || '',
        Labels: trigger?.Trigger?.Labels || {},
        _extendedTrigger: trigger, // Store original for edit callback
      };
    });
  }, [triggers, spaceID, editInPlace, selectionStatusById]);

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
  const staticColumns = useMemo(
    () => [...createTriggerStaticColumns(), hiddenReasonColumn<TriggerRowItem>((row) => row.HiddenReason)],
    [],
  );

  // Combine all columns, the Pack label's after the Space's
  const baseColumns = useMemo(() => {
    const pack = labelColumns.filter((col) => col.field === PACK_LABEL_FIELD);
    const otherLabels = labelColumns.filter((col) => col.field !== PACK_LABEL_FIELD);
    const afterSpace = staticColumns.findIndex((col) => col.field === 'Space') + 1;
    return [
      ...staticColumns.slice(0, afterSpace),
      ...pack,
      ...staticColumns.slice(afterSpace),
      ...otherLabels,
    ];
  }, [labelColumns, staticColumns]);

  const {
    handleColumnResize,
    applyStoredWidths,
    onSortModelChange,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence(
    persistenceKey,
    selectionStatusById
      ? SELECTION_GRID_DEFAULTS
      : showSpaceColumn
        ? ALL_SPACES_GRID_DEFAULTS
        : GRID_DEFAULTS,
  );

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

  if (isLoading && !skip) {
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
    if (isFiltered && onClearFilter) {
      return <FilteredEmptyState entityName='triggers' onClearFilters={onClearFilter} />;
    }
    if (emptyState) {
      return emptyState;
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
        customToolbarActions={customToolbarActions}
        slots={DATE_TIME_GRID_SLOTS}
      />
    </>
  );
};
