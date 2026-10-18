// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import {
  AttributeColumnConfig,
  useAttributeColumnManager,
} from '@/components/entity-data-grid/hooks/useAttributeColumnManager';
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

const LABELS_CONFIG: AttributeColumnConfig<TargetRowItem> = {
  fieldName: 'Labels',
  columnPrefix: 'Labels.',
  getAttributes: (row) => row.Labels,
};

const FACTS_CONFIG: AttributeColumnConfig<TargetRowItem> = {
  fieldName: 'Facts',
  columnPrefix: 'Facts.',
  getAttributes: (row) => row.Facts,
};

// One column per label, annotation and fact key, rather than one column holding each whole map.
const ATTRIBUTE_CONFIGS: AttributeColumnConfig<TargetRowItem>[] = [
  LABELS_CONFIG,
  {
    fieldName: 'Annotations',
    columnPrefix: 'Annotations.',
    getAttributes: (row) => row.Annotations,
  },
  FACTS_CONFIG,
];

// The columns `cub target list` shows after a Target's name and Space, in its order: the
// well-known Target labels and the Kubernetes version of the cluster the Target represents.
// They are columns even before any Target has the key, as they are in the CLI.
const STANDARD_TARGET_LABELS = ['Owner', 'Environment', 'Region'];
const KUBERNETES_VERSION_FACT = 'Cluster.KubernetesVersion';

const STANDARD_COLUMN_FIELDS = new Set([
  ...STANDARD_TARGET_LABELS.map((label) => `${LABELS_CONFIG.columnPrefix}${label}`),
  `${FACTS_CONFIG.columnPrefix}${KUBERNETES_VERSION_FACT}`,
]);

// The columns before the standard ones, as in `cub target list`.
const IDENTITY_FIELDS = new Set(['Slug', 'TargetID', 'Space', 'SpaceID']);

const GRID_DEFAULTS = {
  sortModel: [{ field: 'Slug', sort: 'asc' as const }],
  columnVisibility: {
    Slug: true,
    TargetID: false,
    Space: true,
    SpaceID: false,
    ...Object.fromEntries([...STANDARD_COLUMN_FIELDS].map((field) => [field, true])),
    WhereTrigger: false,
    TriggerFilter: false,
    AppliedTriggerCount: true,
    CreatedAt: false,
    UpdatedAt: false,
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
      Labels: target.Target?.Labels || {},
      Annotations: target.Target?.Annotations || {},
      Facts: target.Target?.Facts || {},
      WhereTrigger: target.Target?.WhereTrigger || '',
      TriggerFilter: target.TriggerFilter?.Slug || '',
      AppliedTriggerCount: target.Target?.TriggerIDs?.length || 0,
      CreatedAt: target.Target?.CreatedAt || '',
      UpdatedAt: target.Target?.UpdatedAt || '',
      _extendedTarget: target, // Store original for edit callback
    }));
  }, [targets]);

  const { availableAttributeKeys, createAttributeColumn } = useAttributeColumnManager(rows, {
    attributeConfigs: ATTRIBUTE_CONFIGS,
  });

  const standardColumns = useMemo(() => {
    const total = (fieldName: string, key: string) =>
      availableAttributeKeys.get(fieldName)?.find((label) => label.key === key)?.total ?? 0;
    return [
      ...STANDARD_TARGET_LABELS.map((label) =>
        createAttributeColumn(LABELS_CONFIG, { key: label, total: total(LABELS_CONFIG.fieldName, label) }),
      ),
      {
        ...createAttributeColumn(FACTS_CONFIG, {
          key: KUBERNETES_VERSION_FACT,
          total: total(FACTS_CONFIG.fieldName, KUBERNETES_VERSION_FACT),
        }),
        headerName: 'Kubernetes Version',
        minWidth: 170,
      },
    ];
  }, [availableAttributeKeys, createAttributeColumn]);

  const attributeColumns = useMemo(
    () =>
      ATTRIBUTE_CONFIGS.flatMap((attrConfig) =>
        (availableAttributeKeys.get(attrConfig.fieldName) || [])
          .map((key) => createAttributeColumn(attrConfig, key))
          .filter((column) => !STANDARD_COLUMN_FIELDS.has(column.field)),
      ),
    [availableAttributeKeys, createAttributeColumn],
  );

  // Create static columns
  const staticColumns = useMemo(() => createTargetStaticColumns(), []);

  // The standard columns follow the name and Space, as in `cub target list`.
  const baseColumns = useMemo(
    () => [
      ...staticColumns.filter((column) => IDENTITY_FIELDS.has(column.field)),
      ...standardColumns,
      ...staticColumns.filter((column) => !IDENTITY_FIELDS.has(column.field)),
      ...attributeColumns,
    ],
    [attributeColumns, staticColumns, standardColumns],
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

  // Dynamic columns (Labels, Annotations, Facts) default to hidden unless specified in GRID_DEFAULTS
  const effectiveColumnVisibilityModel = useMemo(() => {
    const dynamicVisibility: Record<string, boolean> = {};
    baseColumns.forEach((col) => {
      if (ATTRIBUTE_CONFIGS.some((attrConfig) => col.field.startsWith(attrConfig.columnPrefix))) {
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
