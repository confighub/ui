// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React from 'react';

import { styled } from '@mui/material';
import Box from '@mui/material/Box';
import { SxProps, Theme } from '@mui/material/styles';
import {
  DataGrid,
  GridApi,
  GridCallbackDetails,
  GridColDef,
  GridColumnVisibilityModel,
  GridEventListener,
  GridInitialState,
  GridRowSelectionModel,
  GridSlotsComponent,
  GridSortModel,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarProps,
  GridOverlay,
  GridToolbarQuickFilter,
  GridValidRowModel,
  gridClasses,
} from '@mui/x-data-grid';

import { ResetTableButton } from '../common/ResetTableButton';
import { ColumnGroup, DynamicGroupConfig } from './column-groups-types';
import { GroupedColumnsPanel } from './GroupedColumnsPanel';
import { HighlightedCell } from './components/HighlightedCell';

// Reusable scrollbar styles to avoid duplication
const scrollbarStyles = (theme: Theme) => ({
  '::-webkit-scrollbar': {
    WebkitAppearance: 'none',
    width: '12px',
    height: '12px',
  },
  '::-webkit-scrollbar-track': {
    background: theme.palette.grey[100],
    borderRadius: '10px',
  },
  '::-webkit-scrollbar-thumb': {
    background: '#aaa',
    borderRadius: '10px',
    border: '2px solid ' + theme.palette.grey[100],
  },
  '::-webkit-scrollbar-thumb:hover': {
    background: '#888',
  },
});
/**
 * Enhances column definitions to automatically add search highlighting
 * to columns that don't have a custom renderCell defined.
 */
const enhanceColumnsWithHighlighting = <T extends GridValidRowModel>(
  columns: GridColDef<T>[],
): GridColDef<T>[] => {
  return columns.map((col) => {
    // Skip if column already has a custom renderCell
    if (col.renderCell) {
      return col;
    }

    // Skip for certain column types that shouldn't have text highlighting
    if (col.type === 'actions' || col.type === 'boolean' || col.type === 'singleSelect') {
      return col;
    }

    // Add HighlightedCell as the default renderCell for text-based columns
    return {
      ...col,
      renderCell: (params) => <HighlightedCell value={params.value} />,
    };
  });
};

export const StripedDataGrid = styled(DataGrid)(({ theme }) => ({
  borderRadius: 0,
  border: 0,
  '--DataGrid-containerBackground': theme.palette.background.paper,

  // ── Column headers — hairline: 10.5px uppercase, muted, thin underline ───
  [`& .${gridClasses.columnHeaders}`]: {
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  [`& .${gridClasses.columnHeader}`]: {
    backgroundColor: theme.palette.background.paper,
    '&:focus, &:focus-within': { outline: 'none' },
  },
  [`& .${gridClasses.columnHeaderTitle}`]: {
    fontSize: '10.5px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: theme.palette.text.disabled,
    lineHeight: 'normal',
  },
  [`& .${gridClasses.columnSeparator}`]: {
    color: theme.palette.divider,
    '&:hover': { color: theme.palette.text.disabled },
    '&.MuiDataGrid-columnSeparator--resizing': { color: theme.palette.text.secondary },
  },

  // ── Cells — near-invisible row divider at rgba(0,0,0,0.045) ─────────────
  [`& .${gridClasses.cell}`]: {
    borderColor: 'rgba(0,0,0,0.045)',
    '&:focus, &:focus-within': { outline: 'none' },
  },
  // Pull cell-level Typography down to the 14px the grid uses elsewhere.
  // Many renderCells wrap text in `<Typography variant='body1'>` (16px),
  // which makes the table feel chunky. Centralised here so renderCells
  // don't all need individual overrides.
  [`& .${gridClasses.cell} .MuiTypography-body1`]: {
    fontSize: '0.875rem',
    lineHeight: 1.43,
    letterSpacing: '0.01071em',
  },

  // ── Rows ─────────────────────────────────────────────────────────────────
  [`& .${gridClasses.row}`]: {
    backgroundColor: theme.palette.background.paper,
    '&:hover': {
      // Barely-perceptible shift — lighter than MUI's default action.hover
      backgroundColor: 'rgba(0,0,0,0.018)',
      '@media (hover: none)': { backgroundColor: 'transparent' },
    },
    '&.Mui-selected': {
      // 3px rust inset accent + tint — never a solid rust fill
      backgroundColor: 'var(--rust-bg)',
      boxShadow: 'inset 3px 0 0 var(--rust)',
      '&:hover': {
        backgroundColor: 'var(--rust-bg)',
        '@media (hover: none)': { backgroundColor: 'var(--rust-bg)' },
      },
    },
  },

  // ── Footer ───────────────────────────────────────────────────────────────
  [`& .${gridClasses.footerContainer}`]: {
    backgroundColor: theme.palette.background.paper,
    borderTop: `1px solid ${theme.palette.divider}`,
    minHeight: 40,
  },

  // ── Scrollbar ────────────────────────────────────────────────────────────
  ...scrollbarStyles(theme),
  '::-webkit-scrollbar:horizontal': { height: '12px' },
  '::-webkit-scrollbar:vertical': { width: '12px' },
  [`& .${gridClasses.virtualScroller}`]: {
    paddingBottom: '12px',
    ...scrollbarStyles(theme),
    scrollbarWidth: 'thin',
    scrollbarColor: '#aaa ' + theme.palette.grey[100],
  },
  [`& .${gridClasses.scrollbar}`]: { ...scrollbarStyles(theme) },
  [`& .${gridClasses.main}`]: { ...scrollbarStyles(theme) },
}));

/**
 * Stable toolbar component defined outside EntityDataGrid to prevent
 * unmount/remount cycles when props change. Custom data is passed via
 * slotProps.toolbar so the component reference stays the same.
 */
interface CustomToolbarSlotProps extends Partial<GridToolbarProps> {
  customToolbarActions?: React.ReactNode;
  onClearState?: () => void;
  hasStateChanged?: boolean;
  filterElement?: React.ReactNode;
}

// Stable style constants extracted outside the component to avoid re-creating objects on every render
const toolbarContainerSx = { backgroundColor: 'white', px: 1.5, pt: 1.5, flexWrap: 'nowrap', alignItems: 'flex-start' } as const;
const toolbarLeftSx = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 } as const;
const quickFilterSx = { flexShrink: 0 } as const;
const columnsButtonSlotProps = {
  button: {
    size: 'small' as const,
    sx: (theme: Theme) => ({
      fontSize: '0.75rem',
      fontWeight: 500,
      textTransform: 'none',
      height: 32,
      color: theme.palette.text.secondary,
      backgroundColor: 'transparent',
      border: `1px solid ${theme.palette.divider}`,
      padding: theme.spacing(1.5),
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        color: theme.palette.text.primary,
        backgroundColor: theme.palette.grey[200],
        borderColor: theme.palette.grey[400],
      },
      '& svg': {
        fontSize: '18px !important',
      },
    }),
  },
};

const getRowClassName = (params: { indexRelativeToCurrentPage: number }) =>
  params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd';

/**
 * Custom NoRowsOverlay that renders children passed via slotProps.
 * The default MUI GridNoRowsOverlay ignores children and only shows locale text.
 * Uses GridOverlay for proper positioning within the DataGrid body area.
 * Backs both the `noRowsOverlay` and `noResultsOverlay` slots so server-side
 * filtering and the toolbar quick filter show the same empty state.
 */
const CustomNoRowsOverlay = ({ children }: { children?: React.ReactNode }) => (
  <GridOverlay sx={{ flexDirection: 'column' }}>
    {children}
  </GridOverlay>
);

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;

const CustomToolbar = (props: CustomToolbarSlotProps) => {
  const { customToolbarActions, onClearState, hasStateChanged, filterElement } = props;
  return (
    <GridToolbarContainer sx={toolbarContainerSx}>
      <Box sx={toolbarLeftSx}>
        {onClearState && (
          <ResetTableButton onClick={onClearState} disabled={!hasStateChanged} />
        )}
        {customToolbarActions}
        <GridToolbarColumnsButton slotProps={columnsButtonSlotProps} />
        {filterElement}
      </Box>
      <GridToolbarQuickFilter sx={quickFilterSx} />
    </GridToolbarContainer>
  );
};

export interface EntityDataGridProps<T extends GridValidRowModel> {
  rows: T[];
  columns: GridColDef[];
  loading?: boolean;
  initialState?: GridInitialState;
  columnVisibilityModel?: GridColumnVisibilityModel;
  onColumnVisibilityModelChange?: (model: GridColumnVisibilityModel) => void;
  onRowClick?: GridEventListener<'rowClick'>;
  sortModel?: GridSortModel;
  onSortModelChange?:
    | ((model: GridSortModel, details: GridCallbackDetails) => void)
    | undefined;
  onColumnWidthChange?: GridEventListener<'columnWidthChange'>;
  rowSelectionModel?: GridRowSelectionModel;
  onRowSelectionModelChange?: (
    rowSelectionModel: GridRowSelectionModel,
    details: GridCallbackDetails,
  ) => void;
  apiRef?: React.MutableRefObject<GridApi>;
  checkboxSelection?: boolean;
  density?: 'compact' | 'standard' | 'comfortable';
  disableRowSelectionOnClick?: boolean;
  customToolbarActions?: React.ReactNode;
  slotProps?: {
    toolbar?: Partial<GridToolbarProps>;
    columnsPanel?: Record<string, unknown>;
  };
  slots?: Partial<GridSlotsComponent>;
  sx?: SxProps<Theme>;
  disableToolbar?: boolean;
  /** Retained for source compatibility — Community DataGrid has no aggregation. */
  disableAggregation?: boolean;
  /** Static column groups powering the GroupedColumnsPanel sidebar in the toolbar's Columns button. */
  columnGroups?: ColumnGroup[];
  /** Dynamic groups (e.g., Labels.*, Values.*) for the GroupedColumnsPanel. */
  dynamicGroups?: DynamicGroupConfig[];
  /** Handler to clear/reset grid state */
  onClearState?: () => void;
  /** Whether the grid state has been changed from defaults */
  hasStateChanged?: boolean;
  /** Optional element rendered below the toolbar (e.g. query builder filters) */
  filterElement?: React.ReactNode;
  /**
   * Optional custom overlay shown when there are no rows but data exists
   * (i.e. filtered/searched down to zero). Rendered inside the grid body so
   * the toolbar, headers and footer stay available for clearing filters.
   */
  noRowsOverlay?: React.ReactNode;
  /**
   * Chrome-free empty state rendered INSTEAD of the grid when the underlying
   * (unfiltered) dataset is genuinely empty. Requires `hasNoData`.
   */
  emptyState?: React.ReactNode;
  /**
   * True when the unfiltered dataset has zero rows. Keyed off the unfiltered
   * data rather than the current filter state so that quick-filter searches
   * (whose state lives inside the grid) still show the "no results" overlay.
   */
  hasNoData?: boolean;
  /** When false, the grid fills its container and rows scroll internally. Defaults to true. */
  autoHeight?: boolean;
}

export const EntityDataGrid = <T extends GridValidRowModel>({
  rows,
  columns,
  loading = false,
  autoHeight: autoHeightProp = true,
  initialState,
  columnVisibilityModel,
  onColumnVisibilityModelChange,
  onRowClick,
  rowSelectionModel,
  onRowSelectionModelChange,
  sortModel,
  onSortModelChange,
  onColumnWidthChange,
  apiRef,
  checkboxSelection = false,
  disableToolbar = false,
  disableRowSelectionOnClick = false,
  customToolbarActions,
  slotProps,
  slots,
  sx,
  columnGroups,
  dynamicGroups,
  onClearState,
  hasStateChanged = false,
  filterElement,
  noRowsOverlay,
  emptyState,
  hasNoData = false,
}: EntityDataGridProps<T>) => {
  const hasColumnGroups = !!columnGroups && columnGroups.length > 0;
  // Enhance columns with automatic highlighting
  const enhancedColumns = React.useMemo(
    () => enhanceColumnsWithHighlighting(columns),
    [columns],
  );

  // Memoize default slotProps to prevent object recreation on every render
  const defaultSlotProps = React.useMemo(
    () => ({
      toolbar: {
        showQuickFilter: true,
        quickFilterProps: { debounceMs: 500 },
      },
    }),
    [],
  );

  // Merge user slotProps with defaults, including custom toolbar props.
  // The community DataGrid's slotProps type doesn't know about our custom
  // columnsPanel slot, so we narrow with a cast at this single boundary
  // rather than weakening the public slotProps type.
  const mergedSlotProps = React.useMemo(
    () => ({
      ...defaultSlotProps,
      ...slotProps,
      toolbar: {
        ...defaultSlotProps.toolbar,
        ...slotProps?.toolbar,
        customToolbarActions,
        onClearState,
        hasStateChanged,
        filterElement,
      },
      ...(hasColumnGroups && {
        columnsPanel: {
          ...slotProps?.columnsPanel,
          columnGroups,
          dynamicGroups,
        },
      }),
      ...(noRowsOverlay && {
        noRowsOverlay: { children: noRowsOverlay },
        noResultsOverlay: { children: noRowsOverlay },
      }),
    }),
    [
      defaultSlotProps,
      slotProps,
      customToolbarActions,
      onClearState,
      hasStateChanged,
      filterElement,
      noRowsOverlay,
      hasColumnGroups,
      columnGroups,
      dynamicGroups,
    ],
  );

  // Memoize slots to prevent object recreation on every render. Only override
  // columnsPanel when the caller supplied column groups; otherwise fall back
  // to MUI's default flat panel so grids without group config aren't affected.
  const mergedSlots = React.useMemo(
    () => ({
      toolbar: disableToolbar ? null : CustomToolbar,
      ...(hasColumnGroups && { columnsPanel: GroupedColumnsPanel }),
      ...(noRowsOverlay && {
        noRowsOverlay: CustomNoRowsOverlay,
        // MUI uses a separate slot when its own client-side filtering (the
        // toolbar quick filter) reduces a non-empty row set to zero.
        noResultsOverlay: CustomNoRowsOverlay,
      }),
      ...slots,
    }),
    [disableToolbar, hasColumnGroups, noRowsOverlay, slots],
  );

  // Genuinely empty: the unfiltered dataset has no rows, so there is nothing to
  // filter, sort or paginate. Render only the empty state — mounting the grid
  // would show a toolbar, column headers and a "0–0 of 0" footer behind it.
  // Gated on `loading` so the empty state never flashes during the first fetch.
  if (hasNoData && !loading && emptyState) {
    return (
      <Box data-testid='entity-grid-empty-state' sx={{ width: '100%' }}>
        {emptyState}
      </Box>
    );
  }

  return (
    <StripedDataGrid
      rows={rows}
      columns={enhancedColumns}
      sx={{
        // Ensure overlay content (e.g. FilteredEmptyState) has room to render.
        // Covers both the no-rows overlay (rows.length === 0) and the
        // no-results overlay, which MUI shows when the quick filter hides every
        // row and so has rows.length > 0. Skipped while loading with rows
        // present so a refetch doesn't insert 300px of blank space.
        //
        // `--DataGrid-overlayHeight` is MUI's own knob for the body height it
        // reserves when no rows are visible (default `rowHeight * 2` = 80px).
        // Sizing the wrapper instead is not enough: the wrapper is a zero-height
        // sticky box and MUI writes an inline height onto the inner element from
        // the measured viewport, so the overlay box stays 80px and its centred
        // content spills upwards over the column headers. The min-height on the
        // inner element is a backstop — it can only grow downwards from the
        // headers' bottom edge, so the content can never paint over them.
        ...(noRowsOverlay && (rows.length === 0 || !loading) && {
          '--DataGrid-overlayHeight': '300px',
          '& .MuiDataGrid-overlayWrapperInner': {
            minHeight: 300,
          },
        }),
        '& .MuiDataGrid-toolbarContainer': {
          backgroundColor: 'white',
        },
        // Force scrollbar visibility
        '& .MuiDataGrid-virtualScroller': {
          paddingBottom: '12px',
          overflowX: 'auto !important',
          overflowY: 'auto !important',
          '::-webkit-scrollbar': {
            WebkitAppearance: 'none !important',
            width: '12px !important',
            height: '12px !important',
          },
          '::-webkit-scrollbar-track': {
            background: '#f5f5f5',
            borderRadius: '10px',
          },
          '::-webkit-scrollbar-thumb': {
            background: '#aaa',
            borderRadius: '10px',
            border: '2px solid #f5f5f5',
          },
          '::-webkit-scrollbar-thumb:hover': {
            background: '#888',
          },
          scrollbarWidth: 'thin',
          scrollbarColor: '#aaa #f5f5f5',
        },
        // Ensure the main container doesn't prevent scrolling
        '& .MuiDataGrid-main': {
          overflow: 'visible',
        },
        ...sx,
      }}
      apiRef={apiRef}
      loading={loading}
      initialState={initialState}
      disableRowSelectionOnClick={disableRowSelectionOnClick}
      getRowClassName={getRowClassName}
      slots={mergedSlots}
      slotProps={mergedSlotProps}
      columnVisibilityModel={columnVisibilityModel}
      onColumnVisibilityModelChange={onColumnVisibilityModelChange}
      sortModel={sortModel}
      onSortModelChange={onSortModelChange}
      onColumnWidthChange={onColumnWidthChange}
      checkboxSelection={checkboxSelection}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      pagination
      rowSelectionModel={rowSelectionModel}
      onRowSelectionModelChange={onRowSelectionModelChange}
      onRowClick={onRowClick}
      rowHeight={40}
      autoHeight={autoHeightProp}
    />
  );
};
