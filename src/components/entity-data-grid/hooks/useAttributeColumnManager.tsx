// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { CenteredTableCell, Ellipses } from '@/components/styled';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { GridColDef, GridRenderCellParams, GridValidRowModel } from '@mui/x-data-grid';

import { HighlightedCell } from '../components/HighlightedCell';

export type AttributeLabel = {
  key: string;
  total: number;
};

/**
 * Configuration for creating an attribute column (Labels, Values, Parameters, etc.)
 */
export interface AttributeColumnConfig<T extends GridValidRowModel> {
  /** Field name in the row data (e.g., 'Labels', 'Values', 'Parameters') */
  fieldName: string;
  /** Column prefix for the grid field (e.g., 'Labels.', 'Values.') */
  columnPrefix: string;
  /** Function to get attribute data from a row */
  getAttributes: (row: T) => Record<string, string> | undefined;
  /** Optional custom header name formatter */
  formatHeaderName?: (key: string) => string;
  /** Optional custom cell renderer for regular rows */
  renderRegularCell?: (params: GridRenderCellParams<T>, value: string) => JSX.Element;
  /** Optional custom group cell renderer */
  renderGroupCell?: (
    params: GridRenderCellParams<T>,
    uniqueValues: string[],
    filteredRows: T[],
    isGroupingColumn: boolean,
    attentionBadge: JSX.Element | null,
  ) => JSX.Element;
  /** Column configuration overrides */
  columnConfig?: Partial<GridColDef<T>>;
}

/**
 * Configuration for attention badge functionality
 */
export interface AttentionConfig<T extends GridValidRowModel> {
  /** Function to determine if a row needs attention */
  needsAttention: (row: T) => boolean;
  /** Tooltip text formatter */
  tooltipText: (attentionCount: number, totalCount: number) => string;
}

/**
 * Configuration for the entire attribute column manager
 */
export interface UseAttributeColumnManagerConfig<T extends GridValidRowModel> {
  /** Array of attribute field configurations */
  attributeConfigs: AttributeColumnConfig<T>[];
  /** Optional attention badge configuration */
  attentionConfig?: AttentionConfig<T>;
}

/**
 * Create an attention badge chip
 */
const createAttentionChip = (
  attentionCount: number,
  tooltipText: string,
  isVisible: boolean = true,
): JSX.Element | null => {
  if (!isVisible || attentionCount === 0) {
    return null;
  }

  return (
    <Tooltip title={tooltipText} arrow>
      <Badge
        data-testid='attention-badge'
        badgeContent={attentionCount}
        color='error'
        sx={{
          ml: 1,
          '& .MuiBadge-badge': {
            fontSize: '0.625rem',
            height: '16px',
            minWidth: '16px',
            padding: '0 4px',
          },
        }}
      >
        <Box sx={{ width: 8, height: 8 }} />
      </Badge>
    </Tooltip>
  );
};

/**
 * Default renderer for regular (non-group) attribute cells
 */
const defaultRenderRegularCell = (value: string): JSX.Element => (
  <CenteredTableCell>
    <Tooltip title={value} arrow>
      <span>
        <Ellipses variant='body1'>
          <HighlightedCell value={value} />
        </Ellipses>
      </span>
    </Tooltip>
  </CenteredTableCell>
);

/**
 * Default renderer for group attribute cells (e.g., Labels.*, Values.*)
 */
const defaultRenderGroupCell = (
  uniqueValues: string[],
  labelKey: string,
  isGroupingColumn: boolean,
  attentionBadge: JSX.Element | null,
): JSX.Element => {
  // Single identical value
  if (uniqueValues.length === 1) {
    return (
      <CenteredTableCell>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 0.5,
          }}
        >
          <Ellipses variant='body1'>
            <HighlightedCell value={uniqueValues[0]} />
          </Ellipses>
        </Box>
        {isGroupingColumn && attentionBadge}
      </CenteredTableCell>
    );
  }

  // Multiple values
  if (uniqueValues.length > 1) {
    return (
      <CenteredTableCell>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 0.5,
          }}
        >
          <Tooltip title={uniqueValues.join(', ')} arrow>
            <Ellipses variant='body1' sx={{ fontWeight: 'medium', color: 'text.secondary' }}>
              {uniqueValues.length} {labelKey} values
            </Ellipses>
          </Tooltip>
        </Box>
        {isGroupingColumn && attentionBadge}
      </CenteredTableCell>
    );
  }

  // No values
  return <CenteredTableCell>{isGroupingColumn && attentionBadge}</CenteredTableCell>;
};

/**
 * Generic hook for managing dynamic attribute columns in MUI DataGrid Premium
 *
 * Automatically discovers and creates columns for attribute fields (Labels, Values, etc.)
 * based on the actual data present in rows. Supports custom rendering for both regular
 * rows and grouped rows, with optional attention badges for grouped rows.
 *
 * @template T - The row data type extending GridValidRowModel
 * @param rows - Array of row data to analyze for available attribute keys
 * @param config - Configuration for attribute fields and optional attention badges
 *
 * @returns Object with:
 *   - availableAttributeKeys: Map of fieldName -> AttributeLabel[] with occurrence counts
 *   - createAttributeColumn: Function to generate GridColDef for a specific attribute key
 *
 * @example
 * // Basic usage with Labels
 * const { availableAttributeKeys, createAttributeColumn } = useAttributeColumnManager(rows, {
 *   attributeConfigs: [
 *     {
 *       fieldName: 'Labels',
 *       columnPrefix: 'Labels.',
 *       getAttributes: (row) => row.Labels,
 *     }
 *   ]
 * });
 *
 * // Generate columns for all discovered label keys
 * const labelColumns = (availableAttributeKeys.get('Labels') || [])
 *   .map(label => createAttributeColumn(
 *     { fieldName: 'Labels', columnPrefix: 'Labels.', getAttributes: row => row.Labels },
 *     label
 *   ));
 *
 * @example
 * // With custom rendering and attention badges
 * const { availableAttributeKeys, createAttributeColumn } = useAttributeColumnManager(rows, {
 *   attributeConfigs: [{
 *     fieldName: 'Values',
 *     columnPrefix: 'Values.',
 *     getAttributes: (row) => row.Values,
 *     renderRegularCell: (params, value) => <CustomCell value={value} />,
 *   }],
 *   attentionConfig: {
 *     needsAttention: (row) => row.status === 'error',
 *     tooltipText: (count, total) => `${count} of ${total} items need attention`
 *   }
 * });
 *
 * @remarks
 * - Memoized to prevent unnecessary recalculations when rows/config don't change
 * - Attribute keys are sorted alphabetically for consistent ordering
 * - Group rendering automatically handles unique value detection
 * - Attention badges only appear in the MUI grouping column to avoid clutter
 */
export const useAttributeColumnManager = <T extends GridValidRowModel>(
  rows: Array<T>,
  config: UseAttributeColumnManagerConfig<T>,
) => {
  const { attributeConfigs, attentionConfig } = config;

  /**
   * Extract available keys for each attribute field
   */
  const availableAttributeKeys = useMemo(() => {
    const result = new Map<string, AttributeLabel[]>();

    // Validate input
    if (!Array.isArray(rows)) {
      console.error(
        '[useAttributeColumnManager] Invalid rows provided (expected array). ' +
        'No columns will be generated.',
        { rows, attributeConfigs }
      );
      return result;
    }

    attributeConfigs.forEach((attrConfig) => {
      try {
        const keyCounts = rows.reduce<Record<string, number>>((acc, row) => {
          try {
            const attributes = attrConfig.getAttributes(row);

            // Validate attributes is an object
            if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
              return acc;
            }

            Object.keys(attributes).forEach((key) => {
              acc[key] = (acc[key] ?? 0) + 1;
            });
            return acc;
          } catch (error) {
            // Log but continue processing other rows
            console.error(
              `[useAttributeColumnManager] Failed to extract attributes from row for field "${attrConfig.fieldName}".`,
              { error, row }
            );
            return acc;
          }
        }, {});

        const labels = Object.entries(keyCounts)
          .map(([key, total]) => ({ key, total }))
          .sort((a, b) => a.key.localeCompare(b.key));

        result.set(attrConfig.fieldName, labels);
      } catch (error) {
        console.error(
          `[useAttributeColumnManager] Failed to extract attribute keys for field "${attrConfig.fieldName}".`,
          { error, fieldName: attrConfig.fieldName, rowCount: rows.length }
        );
        result.set(attrConfig.fieldName, []);
      }
    });

    return result;
  }, [rows, attributeConfigs]);

  /**
   * Creates a MUI DataGrid column definition for a specific attribute key
   *
   * Generates a column with:
   * - Value getter for sorting support
   * - Custom renderers for group rows (shows unique values or count)
   * - Custom renderers for regular rows (shows individual value)
   * - Optional attention badges for grouped rows
   * - Configurable grouping support
   *
   * @param attrConfig - Configuration for the attribute type (Labels, Values, etc.)
   * @param label - Specific key and occurrence count for this attribute
   * @returns GridColDef configured for the attribute column with custom renderers
   *
   * @example
   * const labelColumn = createAttributeColumn(
   *   { fieldName: 'Labels', columnPrefix: 'Labels.', getAttributes: row => row.Labels },
   *   { key: 'environment', total: 42 }
   * );
   */
  const createAttributeColumn = (
    attrConfig: AttributeColumnConfig<T>,
    label: AttributeLabel,
  ): GridColDef<T> => {
    const field = `${attrConfig.columnPrefix}${label.key}`;
    const headerName = attrConfig.formatHeaderName
      ? attrConfig.formatHeaderName(label.key)
      : label.key;

    const defaultConfig: GridColDef<T> = {
      field,
      headerName,
      minWidth: 120,
      flex: 0.8,
      valueGetter: (_, row) => {
        const attrs = attrConfig.getAttributes(row);
        return attrs?.[label.key] || '';
      },
      groupable: true,
      renderCell: (params: GridRenderCellParams<T>) => {
        try {
          // Validate params
          if (!params?.rowNode) {
            throw new Error('Invalid cell params: missing rowNode');
          }

          // Handle group rows
          if (params.rowNode.type === 'group') {
            const groupIds = Array.isArray(params.rowNode.children)
              ? params.rowNode.children
              : [];

            if (groupIds.length === 0) {
              return <CenteredTableCell>-</CenteredTableCell>;
            }

            const filteredRows = rows.filter((row) => {
              if (!row?.id) return false;
              const rowId = typeof row.id === 'string' ? row.id : String(row.id);
              return groupIds.includes(rowId);
            });

            // Get all attribute values for this specific key from the filtered rows
            const attrValues = filteredRows
              .map((row) => {
                try {
                  const attrs = attrConfig.getAttributes(row);
                  return attrs?.[label.key];
                } catch (error) {
                  console.error(
                    `[useAttributeColumnManager] Failed to get attributes for row in field "${field}".`,
                    { error, row }
                  );
                  return undefined;
                }
              })
              .filter(Boolean) as string[];

            const uniqueValues = Array.from(new Set(attrValues));

            // Check if this is the generated grouping column
            const isGroupingColumn = false;

            // Calculate attention badge if configured
            let attentionBadge: JSX.Element | null = null;
            if (isGroupingColumn && attentionConfig) {
              const totalUnitsNeedingAttention = filteredRows.filter(
                attentionConfig.needsAttention,
              ).length;
              if (totalUnitsNeedingAttention > 0) {
                attentionBadge = createAttentionChip(
                  totalUnitsNeedingAttention,
                  attentionConfig.tooltipText(totalUnitsNeedingAttention, filteredRows.length),
                );
              }
            }

            // Use custom renderer if provided, otherwise use default
            if (attrConfig.renderGroupCell) {
              return attrConfig.renderGroupCell(
                params,
                uniqueValues,
                filteredRows,
                isGroupingColumn,
                attentionBadge,
              );
            }

            return defaultRenderGroupCell(
              uniqueValues,
              label.key,
              isGroupingColumn,
              attentionBadge,
            );
          }

          // Handle regular data rows
          const value = params.value as string;
          if (attrConfig.renderRegularCell) {
            return attrConfig.renderRegularCell(params, value);
          }
          return defaultRenderRegularCell(value);
        } catch (error) {
          console.error(
            `[useAttributeColumnManager] Failed to render cell for field "${field}".`,
            { error, params }
          );

          return (
            <CenteredTableCell>
              <Tooltip title="Error rendering cell">
                <span style={{ color: 'red' }}>Error</span>
              </Tooltip>
            </CenteredTableCell>
          );
        }
      },
    };

    // Merge with custom column config if provided
    return { ...defaultConfig, ...attrConfig.columnConfig };
  };

  return {
    availableAttributeKeys,
    createAttributeColumn,
  } as const;
};
