// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { HIDDEN_REASON_FIELD, hiddenReasonColumn } from '@/components/hidden-entities/hiddenReasonColumn';
import { useAttributeColumnManager } from '@/components/entity-data-grid/hooks/useAttributeColumnManager';
import { FilteredEmptyState } from '@/components/filtered-empty-state';
import { SkeletonTable } from '@/components/skeleton-table/SkeletonTable';
import { triggerControls, triggerPriority } from '@/utility/triggerEnforcement';
import type { TriggerSelectionStatus } from '@/components/trigger-selection/useTriggerSelection';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { EmptyTriggers } from '@/pages/space-detail/components/empty-triggers/EmptyTriggers';
import { getApiErrorMessage } from '@/utility/error-functions';
import { useFilterRefOptions } from '@/components/entity-ref-select/useEntityRefOptions';
import { useUnitNamesById } from '@/hooks/useUnitNamesById';
import { useListAllTriggersQuery } from '@confighub/rtk-query';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
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
    Controls: true,
    Disabled: true,
    WhereUnit: false,
    UnitFilter: false,
    WhereResource: false,
    OtherUnits: false,
    OtherUnitSelections: false,
    [HIDDEN_REASON_FIELD]: false,
    CreatedAt: false,
    UpdatedAt: true,
  } as Record<string, boolean>,
};

// A list of Triggers from across Spaces shows where each is.
const ALL_SPACES_GRID_DEFAULTS = {
  ...GRID_DEFAULTS,
  columnVisibility: { ...GRID_DEFAULTS.columnVisibility, Space: true } as Record<string, boolean>,
};

// A list of Triggers selected from across Spaces shows where each is and how it is selected.
const SELECTION_GRID_DEFAULTS = {
  ...GRID_DEFAULTS,
  columnVisibility: { ...GRID_DEFAULTS.columnVisibility, Space: true, Selection: true } as Record<string, boolean>,
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
  const gridDefaults = selectionStatusById
    ? SELECTION_GRID_DEFAULTS
    : showSpaceColumn
      ? ALL_SPACES_GRID_DEFAULTS
      : GRID_DEFAULTS;
  const {
    currentData: extendedTriggers,
    isLoading,
    error: queryError,
  } = useListAllTriggersQuery(
    { where: where || undefined, include: 'SpaceID,ChannelID', includeHidden },
    { skip, refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );

  // The Triggers read for these arguments: none while a new filter's read is on its way, rather
  // than the last filter's, and kept when a later read of the same arguments fails, as a refetch
  // on focus can, so a list that was right a moment ago stays, with the error above it.
  const triggers = useMemo(() => (skip ? [] : extendedTriggers || []), [skip, extendedTriggers]);
  const readKnown = skip || extendedTriggers !== undefined;

  // A read that failed is not the same as there being no Triggers: it says so instead of an empty
  // state, and the grid and its filters stay, so a Where the server refused can be corrected.
  const readErrorMessage = queryError ? getApiErrorMessage(queryError, 'The Triggers could not be read.') : '';

  const {
    handleColumnResize,
    applyStoredWidths,
    onSortModelChange,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence(persistenceKey, gridDefaults);

  // A column a stored layout does not mention, such as one added since, takes its default.
  const columnShown = (field: string) =>
    (columnVisibilityModel[field] ?? gridDefaults.columnVisibility[field]) !== false;

  // The other Units the Triggers read, named space/unit, and the Unit Filters they and their
  // selections use, named the same way. Read only while their columns show.
  const otherUnitsShown = columnShown('OtherUnits');
  const filtersShown = columnShown('OtherUnitSelections') || columnShown('UnitFilter');
  const otherUnitNames = useUnitNamesById(
    useMemo(() => triggers.flatMap((t) => Object.values(t.Trigger?.OtherUnitIDs ?? {})), [triggers]),
    !otherUnitsShown,
  );
  const { options: unitFilters, isFetching: unitFiltersLoading } = useFilterRefOptions('Unit', !filtersShown);

  // Convert triggers to row items
  const rows = useMemo<TriggerRowItem[]>(() => {
    const filterName = new Map(unitFilters.map((option) => [option.id, option.label]));
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
        Controls: triggerControls(trigger?.Trigger?.Annotations),
        CreatedAt: trigger?.Trigger?.CreatedAt || '',
        UpdatedAt: trigger?.Trigger?.UpdatedAt || '',
        HiddenReason: trigger?.Trigger?.HiddenReason || '',
        Labels: trigger?.Trigger?.Labels || {},
        WhereUnit: trigger?.Trigger?.WhereUnit || '',
        UnitFilter: trigger?.Trigger?.UnitFilterID
          ? (filterName.get(trigger.Trigger.UnitFilterID) ??
            (unitFiltersLoading ? 'Loading…' : 'a Filter you cannot see'))
          : '',
        WhereResource: trigger?.Trigger?.WhereResource || '',
        OtherUnits: Object.entries(trigger?.Trigger?.OtherUnitIDs ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([key, unitId]) =>
              `${key}=${
                otherUnitNames.names.get(unitId) ??
                (otherUnitNames.isLoading
                  ? 'Loading…'
                  : otherUnitNames.isError
                    ? 'could not be read'
                    : 'a Unit you cannot see')
              }`,
          )
          .join(', '),
        OtherUnitSelections: Object.entries(trigger?.Trigger?.OtherUnitSelections ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, selection]) => ({
            key,
            where: selection.Where || undefined,
            filter: selection.FilterID
              ? (filterName.get(selection.FilterID) ??
                (unitFiltersLoading ? 'Loading…' : 'a Filter you cannot see'))
              : undefined,
            whereResource: selection.WhereResource || undefined,
          })),
        _extendedTrigger: trigger, // Store original for edit callback
      };
    });
  }, [triggers, spaceID, editInPlace, selectionStatusById, otherUnitNames, unitFilters, unitFiltersLoading]);

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
    return { ...gridDefaults.columnVisibility, ...dynamicVisibility, ...columnVisibilityModel };
  }, [baseColumns, columnVisibilityModel, gridDefaults]);

  const handleRowSelectionChange = (newSelection: GridRowSelectionModel) => {
    // @ts-expect-error GridRowSelectionModel is actually string[]
    onRowSelected?.(newSelection);
  };

  if (isLoading && !skip) {
    return <SkeletonTable />;
  }

  // Only a read that succeeded can say there are no Triggers.
  if (triggers.length === 0 && readKnown && !readErrorMessage) {
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
      {readErrorMessage && (
        <Alert severity='error' sx={{ mb: 1 }} data-testid='triggers-read-error'>
          {readErrorMessage}
        </Alert>
      )}
      <EntityDataGrid
        rows={rows}
        columns={allColumns}
        loading={!readKnown && !readErrorMessage}
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
        noRowsOverlay={
          readErrorMessage ? (
            <Typography variant='body2' color='error' sx={{ p: 2 }}>
              {readErrorMessage}
            </Typography>
          ) : undefined
        }
        slots={DATE_TIME_GRID_SLOTS}
      />
    </>
  );
};
