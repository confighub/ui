// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';

import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import {
  UNIT_COLUMN_GROUPS,
  UNIT_DYNAMIC_GROUPS,
} from '@/components/unit-data-grid/unit-column-groups';
import { createUnitListRow } from '@/components/unit-data-grid/utils/data-grid-helpers';
import { useAdvancedSearchQueryParams } from '@/hooks/useAdvancedSearchQueryParams';
import { ExtendedUnitRead } from '@confighub/rtk-query';
import {
  BASE_COLUMNS,
  DEFAULT_UNIT_COLUMNS,
  calculateColumnDelta,
  encodeColumnDelta,
  getColumnsFromDelta,
} from '@/utility/column-delta-functions';
import { VIEW_URL_PARAMS } from '@/utility/constants/url-params';
import {
  GridRowSelectionModel,
  GridSortModel,
  useGridApiRef,
} from '@mui/x-data-grid';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import type { PolicyViolation, UnitCheckResult } from '@/types/initiative';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';

import { EntityDataGrid } from '../entity-data-grid/EntityDataGrid';
import { useLabelColumnManager } from './hooks/useLabelColumnManager';
import type { UnitRowItem } from './utils/data-grid-helpers';

dayjs.extend(relativeTime);

const RESULT_CELL_SX = { display: 'flex', alignItems: 'center', height: '100%' } as const;

const VIOLATION_TOOLTIP_SX = {
  maxWidth: 420,
  p: 0,
  bgcolor: 'background.paper',
  color: 'text.primary',
  border: '1px solid',
  borderColor: 'divider',
  boxShadow: 3,
  '& .MuiTooltip-arrow': {
    color: 'background.paper',
    '&::before': { border: '1px solid', borderColor: 'divider' },
  },
} as const;

export interface UnitDataGridProps {
  units: Array<ExtendedUnitRead>;
  isLoading: boolean;
  onRowSelectionChange: (selectedUnits: string[]) => void;
  defaultRowSelection?: number;
  onRowItemEdit?: (id: string) => void;
  disableToolbar?: boolean;
  selectedUnitIds?: string[];
  filterElement?: React.ReactNode;
  customToolbarActions?: React.ReactNode;
  noRowsOverlay?: React.ReactNode;
  /** Override the default column visibility. Keys are column names, values are visibility. */
  initialColumnVisibility?: Record<string, boolean>;
  /** When true, unit name links open in a new browser tab */
  openLinksInNewTab?: boolean;
  /** Optional Kyverno policy check results — adds a "Result" column when provided.
   *  Pass `null` to reserve the column space before results load (avoids layout jump).
   *  Pass `undefined` (or omit) to hide the column entirely. */
  checkResults?: UnitCheckResult[] | null;
  /** When true, hides the row checkbox selection column */
  hideCheckboxes?: boolean;
  /** Default sort when no URL sort params are present. Example: `{ field: 'Slug', sort: 'asc' }` */
  defaultSort?: { field: string; sort: 'asc' | 'desc' };
  /** When true, grid state (sort, columns) is kept local — not synced to URL params */
  disableUrlSync?: boolean;
  /** When false, the grid fills its container and rows scroll internally. Defaults to true. */
  autoHeight?: boolean;
  /** Optional allowlist of label keys to auto-add as dynamic columns. When omitted, every label
   *  key found on the rows is auto-added (default behavior). Pass an empty array to suppress all
   *  label-derived columns. */
  allowedLabelColumns?: string[];
  /** When true, result cells that have no result yet show a spinner instead of blank */
  isResultPending?: boolean;
}

export const UnitDataGrid = ({
  units,
  isLoading,
  onRowSelectionChange,
  defaultRowSelection,
  onRowItemEdit,
  disableToolbar = false,
  selectedUnitIds = [],
  filterElement,
  customToolbarActions,
  noRowsOverlay,
  initialColumnVisibility,
  openLinksInNewTab = false,
  checkResults,
  hideCheckboxes = false,
  defaultSort,
  disableUrlSync = false,
  autoHeight = true,
  allowedLabelColumns,
  isResultPending = false,
}: UnitDataGridProps) => {
  const apiRef = useGridApiRef();

  const { updateSearchParam, updateSearchParams, searchParams } =
    useAdvancedSearchQueryParams();
  const rows = useMemo(() => units.map((unit) => createUnitListRow(unit)), [units]);

  // Read from URL params (skipped when URL sync is disabled)
  const orderBy = disableUrlSync ? '' : searchParams.get(VIEW_URL_PARAMS.ORDER_BY) || '';
  const orderByDirection = disableUrlSync ? '' : (searchParams.get(VIEW_URL_PARAMS.ORDER_BY_DIRECTION) || '') as
    | 'ASC'
    | 'DESC'
    | '';
  const columnsParam = disableUrlSync ? '' : searchParams.get(VIEW_URL_PARAMS.COLUMNS) || '';

  const [columnVisibilityModel, setColumnVisibilityModel] = useState<Record<string, boolean>>(
    () => {
      if (initialColumnVisibility) {
        return initialColumnVisibility;
      }
      const baseVisibility = {
        ...BASE_COLUMNS,
      };
      return baseVisibility;
    },
  );

  // Track the last external columns to detect actual external changes
  const lastExternalColumnsRef = useRef<string[]>([]);
  const isManualColumnChangeRef = useRef(false);

  // Track when we're programmatically updating sort/columns to avoid saving to URL
  // Start as true to skip initial application from URL params
  const isProgrammaticSortChangeRef = useRef(true);
  const isProgrammaticColumnChangeRef = useRef(true);

  // Reset the manual change flag after a short delay to prevent it from blocking view selection
  useEffect(() => {
    if (isManualColumnChangeRef.current) {
      const timer = setTimeout(() => {
        isManualColumnChangeRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [columnVisibilityModel]);

  // Reset column programmatic flag after initial mount to allow user interactions
  useEffect(() => {
    const timer = setTimeout(() => {
      isProgrammaticColumnChangeRef.current = false;
    }, 500); // Delay to ensure initial column application completes
    return () => {
      clearTimeout(timer);
    };
  }, []);

  const {
    availableLabelKeys,
    availableValueKeys,
    createLabelColumn,
    createValueColumn,
    createColumnsWithGrouping,
  } = useLabelColumnManager(rows, openLinksInNewTab, allowedLabelColumns);

  // Whether the Result column should be shown (present when prop is explicitly passed, even as null)
  const showResultColumn = checkResults !== undefined;

  // Build a map from unitId → check result for the test result column
  const checkResultMap = useMemo(() => {
    if (!checkResults) return new Map<string, UnitCheckResult>();
    return new Map(checkResults.map((r) => [r.unitId, r]));
  }, [checkResults]);

  // "Result" column — always present when checkResults prop is passed (even as null),
  // so the column reserves its width before results load and avoids a layout jump.
  const testResultColumn = useMemo((): GridColDef<UnitRowItem> | null => {
    if (!showResultColumn) return null;
    return {
      field: 'TestResult',
      headerName: 'Result',
      width: 104,
      sortable: true,
      filterable: false,
      sortComparator: (v1: unknown, v2: unknown) => {
        // Untested rows sort at the top (alongside ''); real results rank Fail > Pass > N/A.
        const order: Record<string, number> = {
          '': 0,
          Fail: 1,
          Pass: 2,
          'N/A': 3,
        };
        const a = order[String(v1 ?? '')] ?? 99;
        const b = order[String(v2 ?? '')] ?? 99;
        return a - b;
      },
      valueGetter: (_value: unknown, row: UnitRowItem) => {
        const result = checkResultMap.get(row.id);
        if (!result) return '';
        if (result.notApplicable) return 'N/A';
        return result.success ? 'Pass' : 'Fail';
      },
      renderCell: (params: GridRenderCellParams<UnitRowItem>) => {
        const result = checkResultMap.get(params.row.id);
        if (!result) {
          if (isResultPending) {
            return (
              <Box sx={RESULT_CELL_SX}>
                <CircularProgress size={14} sx={{ color: 'text.disabled' }} />
              </Box>
            );
          }
          return null;
        }

        if (result.notApplicable) {
          return (
            <Tooltip title='No config to validate' arrow placement='right'>
              <Stack direction='row' spacing={0.5} alignItems='center' sx={RESULT_CELL_SX}>
                <RemoveCircleOutlineIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                <Typography variant='caption' color='text.disabled'>N/A</Typography>
              </Stack>
            </Tooltip>
          );
        }

        if (result.success) {
          return (
            <Tooltip title='Policy check passed' arrow placement='right'>
              <Stack direction='row' spacing={0.5} alignItems='center' sx={RESULT_CELL_SX}>
                <CheckCircleIcon sx={{ fontSize: 18, color: '#2e7d32' }} />
                <Typography variant='caption' sx={{ color: '#2e7d32' }}>Pass</Typography>
              </Stack>
            </Tooltip>
          );
        }

        const violations = result.violations ?? [];
        const violationCount = violations.length;
        const label = violationCount > 0
          ? `${violationCount} violation${violationCount !== 1 ? 's' : ''}`
          : result.message ?? 'Failed';

        const tooltipContent = violationCount > 0 ? (
          <ViolationTooltip violations={violations} />
        ) : (
          result.message ?? 'Failed'
        );

        return (
          <Tooltip
            title={tooltipContent}
            arrow
            placement='right'
            slotProps={{
              tooltip: {
                sx: violationCount > 0 ? VIOLATION_TOOLTIP_SX : undefined,
              },
            }}
          >
            <Box sx={RESULT_CELL_SX}>
              <Chip
                icon={<CancelIcon sx={{ fontSize: '14px !important', color: '#c62828 !important' }} />}
                label={label}
                size='small'
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  bgcolor: '#ffebee',
                  color: '#c62828',
                  cursor: 'default',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            </Box>
          </Tooltip>
        );
      },
    };
  }, [showResultColumn, checkResultMap, isResultPending]);

  const allColumns = useMemo(() => {
    const labelColumns = Array.from(availableLabelKeys).map(createLabelColumn);
    const valueColumns = Array.from(availableValueKeys).map(createValueColumn);
    const columnsWithGrouping = createColumnsWithGrouping(rows, onRowItemEdit);

    // Combine: static columns first, then dynamic labels and values
    const aggregatedColumns = [...columnsWithGrouping, ...labelColumns, ...valueColumns];

    // Inject test result column at the beginning if available
    if (testResultColumn) {
      aggregatedColumns.unshift(testResultColumn);
    }

    return aggregatedColumns;
  }, [availableLabelKeys, availableValueKeys, createLabelColumn, createValueColumn, rows, testResultColumn]);

  // Track which dynamic columns have been initialized in this mount cycle (resets on unmount)
  const [initializedDynamicColumns, setInitializedDynamicColumns] = useState<Set<string>>(
    new Set(),
  );

  // Update column visibility model to include label and value columns as hidden by default
  useEffect(() => {
    if (allColumns.length > 0) {
      const columnsToInitialize: string[] = [];

      // Get columns from URL if present
      const urlColumns = columnsParam
        ? getColumnsFromDelta(columnsParam).map((col) => col.Name)
        : [];
      const urlColumnsSet = new Set(urlColumns);

      // Find label columns that haven't been initialized yet
      Array.from(availableLabelKeys).forEach((label) => {
        const fieldName = `Labels.${label.key}`;
        const explicitlyVisible = initialColumnVisibility?.[fieldName] === true;
        if (
          !initializedDynamicColumns.has(fieldName) &&
          !urlColumnsSet.has(fieldName) &&
          !explicitlyVisible
        ) {
          columnsToInitialize.push(fieldName);
        }
        if (urlColumnsSet.has(fieldName) && !initializedDynamicColumns.has(fieldName)) {
          setInitializedDynamicColumns((prev) => new Set(prev).add(fieldName));
        }
      });

      // Find value columns that haven't been initialized yet
      Array.from(availableValueKeys).forEach((valueKey) => {
        const fieldName = `Values.${valueKey.key}`;
        const explicitlyVisible = initialColumnVisibility?.[fieldName] === true;
        if (
          !initializedDynamicColumns.has(fieldName) &&
          !urlColumnsSet.has(fieldName) &&
          !explicitlyVisible
        ) {
          columnsToInitialize.push(fieldName);
        }
        if (urlColumnsSet.has(fieldName) && !initializedDynamicColumns.has(fieldName)) {
          setInitializedDynamicColumns((prev) => new Set(prev).add(fieldName));
        }
      });

      if (columnsToInitialize.length > 0) {
        setColumnVisibilityModel((prev) => {
          const newVisibility = { ...prev };
          columnsToInitialize.forEach((fieldName) => {
            newVisibility[fieldName] = false;
          });
          return newVisibility;
        });

        setInitializedDynamicColumns((prev) => {
          const newSet = new Set(prev);
          columnsToInitialize.forEach((fieldName) => newSet.add(fieldName));
          return newSet;
        });
      }
    }
  }, [
    allColumns,
    availableLabelKeys,
    availableValueKeys,
    initializedDynamicColumns,
    columnsParam,
    initialColumnVisibility,
  ]);

  // Initial sort model based on external sort configuration
  const getInitialSortModel = useMemo<GridSortModel>(() => {
    if (orderBy && orderByDirection) {
      const sortDirection = orderByDirection.toLowerCase() as 'asc' | 'desc';
      return [{ field: orderBy, sort: sortDirection }];
    }
    if (defaultSort) {
      return [defaultSort];
    }
    return [];
  }, [orderBy, orderByDirection, defaultSort]);

  const initialState = useMemo(
    () => ({
      sorting: {
        sortModel: getInitialSortModel,
      },
      columns: {
        columnVisibilityModel: columnVisibilityModel,
      },
    }),
    // Intentional: only seed initialState on first mount; avoid recomputing on
    // every visibility/sort tick (the controlled props handle ongoing updates).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * Update column visibility based on the url changing
   */
  useEffect(() => {
    const columnsParam = searchParams.get(VIEW_URL_PARAMS.COLUMNS);

    // When initialColumnVisibility is provided and no URL columns param exists,
    // skip the default column sync — the caller controls the initial columns.
    if (initialColumnVisibility && !columnsParam) {
      return;
    }

    // Determine which columns to show
    const decodedColumns = columnsParam
      ? getColumnsFromDelta(columnsParam).map((col) => col.Name)
      : DEFAULT_UNIT_COLUMNS;

    // Always include TestResult in initiative context so it persists across resets
    const externalVisibleColumns = showResultColumn && !decodedColumns.includes('TestResult')
      ? [...decodedColumns, 'TestResult']
      : decodedColumns;

    // Skip if no columns have been loaded yet
    if (allColumns.length === 0) {
      return;
    }

    // Check if this is actually a change by comparing with the last external columns
    const externalColumnsString = JSON.stringify([...externalVisibleColumns].sort());
    const lastExternalColumnsString = JSON.stringify(lastExternalColumnsRef.current.sort());

    if (externalColumnsString === lastExternalColumnsString) {
      return;
    }

    if (isManualColumnChangeRef.current) {
      lastExternalColumnsRef.current = [...externalVisibleColumns];
      return;
    }

    lastExternalColumnsRef.current = [...externalVisibleColumns];

    setColumnVisibilityModel((previousVisibility) => {
      const newVisibility = { ...previousVisibility };
      let hasChanges = false;

      const allColumnFields = allColumns.map((col) => col.field);
      const externalColumnsSet = new Set(externalVisibleColumns);

      externalVisibleColumns.forEach((field: string) => {
        if (previousVisibility[field] !== true) {
          newVisibility[field] = true;
          hasChanges = true;
        }
      });

      allColumnFields.forEach((field) => {
        const shouldBeVisible = externalColumnsSet.has(field);

        if (!shouldBeVisible && previousVisibility[field] !== false) {
          newVisibility[field] = false;
          hasChanges = true;
        }
      });

      return hasChanges ? newVisibility : previousVisibility;
    });
  }, [searchParams, allColumns, initialColumnVisibility, showResultColumn]);

  useEffect(() => {
    const updateSortModel = () => {
      if (apiRef.current && apiRef.current.setSortModel) {
        try {
          isProgrammaticSortChangeRef.current = true;
          apiRef.current.setSortModel(getInitialSortModel);

          setTimeout(() => {
            isProgrammaticSortChangeRef.current = false;
          }, 50);
        } catch (error) {
          console.error('Error setting sort model:', error);
          isProgrammaticSortChangeRef.current = false;
        }
      }
    };

    const timeoutId = setTimeout(updateSortModel, 100);

    return () => clearTimeout(timeoutId);
  }, [getInitialSortModel, orderBy, orderByDirection, apiRef]);

  // Select all items when defaultRowSelection changes (filter is applied)
  useEffect(() => {
    if (defaultRowSelection && defaultRowSelection > 0 && rows.length > 0) {
      const allRowIds = rows.map((r) => r.id);
      onRowSelectionChange(allRowIds);
      apiRef.current.setRowSelectionModel(allRowIds);
    }
  }, [defaultRowSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!apiRef.current?.setRowSelectionModel) return;
    const current = apiRef.current.getSelectedRows?.();
    if (!current) return;
    const currentLeafIds = Array.from(current.keys())
      .map(String)
      .filter((id) => !id.toLocaleLowerCase().includes('auto-generated'));
    const next = [...selectedUnitIds].sort();
    const currentSorted = [...currentLeafIds].sort();
    if (
      currentSorted.length === next.length &&
      currentSorted.every((id, i) => id === next[i])
    ) {
      return;
    }
    apiRef.current.setRowSelectionModel(selectedUnitIds);
  }, [selectedUnitIds]);


  return (
    <EntityDataGrid
      autoHeight={autoHeight}
      disableToolbar={disableToolbar}
      disableRowSelectionOnClick
      columnVisibilityModel={columnVisibilityModel}
      filterElement={filterElement}
      customToolbarActions={customToolbarActions}
      noRowsOverlay={noRowsOverlay}
      columnGroups={UNIT_COLUMN_GROUPS}
      dynamicGroups={UNIT_DYNAMIC_GROUPS}
      slots={DATE_TIME_GRID_SLOTS}
      onColumnVisibilityModelChange={(newModel) => {
        isManualColumnChangeRef.current = true;

        setColumnVisibilityModel(newModel);

        const visibleColumns = allColumns
          .map((col) => col.field)
          .filter((field) => newModel[field] !== false);

        if (disableUrlSync) return;

        const delta = calculateColumnDelta(visibleColumns);
        const encodedDelta = encodeColumnDelta(delta);

        updateSearchParam(VIEW_URL_PARAMS.COLUMNS, encodedDelta);
      }}
      onSortModelChange={(newSortModel: GridSortModel) => {
        if (isProgrammaticSortChangeRef.current) return;

        if (disableUrlSync) return;

        if (newSortModel.length > 0) {
          const sortField = newSortModel[0].field;
          const sortDirection = newSortModel[0].sort;

          if (
            sortDirection?.toLocaleLowerCase() === orderByDirection.toLocaleLowerCase() &&
            sortField.toLocaleLowerCase() === orderBy.toLocaleLowerCase()
          )
            return;

          updateSearchParams({
            [VIEW_URL_PARAMS.ORDER_BY]: sortField,
            [VIEW_URL_PARAMS.ORDER_BY_DIRECTION]: sortDirection === 'asc' ? 'ASC' : 'DESC',
          } as Record<string, string>);
        } else {
          updateSearchParams({
            [VIEW_URL_PARAMS.ORDER_BY]: '',
            [VIEW_URL_PARAMS.ORDER_BY_DIRECTION]: '',
          } as Record<string, string>);
        }
      }}
      apiRef={apiRef}
      initialState={initialState}
      rows={rows}
      columns={allColumns}
      checkboxSelection={!hideCheckboxes}
      loading={isLoading}
      onRowSelectionModelChange={(rowSelectionModel: GridRowSelectionModel) => {
        const selectedIDs = rowSelectionModel
          .map(String)
          .filter((id) => !id.toLocaleLowerCase().includes('auto-generated'));

        onRowSelectionChange(selectedIDs);
      }}
    />
  );
};

/** Rich tooltip content showing policy violation details on hover */
function ViolationTooltip({ violations }: { violations: PolicyViolation[] }) {
  return (
    <Box sx={{ p: 1.5, maxHeight: 320, overflowY: 'auto' }}>
      <Typography variant='caption' fontWeight={700} sx={{ mb: 1, display: 'block' }}>
        {violations.length} violation{violations.length !== 1 ? 's' : ''}
      </Typography>
      <Stack spacing={0.75}>
        {violations.map((v, i) => (
          <Box
            key={i}
            sx={{
              px: 1.5,
              py: 1,
              bgcolor: '#fff5f5',
              border: '1px solid',
              borderColor: '#ffcdd2',
              borderRadius: '4px',
            }}
          >
            <Stack direction='row' spacing={0.75} alignItems='center' sx={{ mb: 0.25 }}>
              <Typography variant='caption' fontWeight={700} sx={{ color: '#c62828' }}>
                {v.rule}
              </Typography>
              <Typography variant='caption' color='text.secondary'>
                {v.resourceName}
              </Typography>
              {v.resourceType && (
                <Chip
                  label={v.resourceType}
                  size='small'
                  sx={{ height: 16, fontSize: '0.6rem', fontWeight: 600, bgcolor: 'grey.200' }}
                />
              )}
            </Stack>
            <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
              {v.message}
            </Typography>
            {v.path && (
              <Typography
                variant='caption'
                sx={{ display: 'block', mt: 0.25, fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'text.disabled' }}
              >
                {v.path}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
