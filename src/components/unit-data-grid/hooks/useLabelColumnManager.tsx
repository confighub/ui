// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { DateTimeCell } from '@/components/data-grid/cells';
import { HighlightedCell, KeyValueListCell } from '@/components/entity-data-grid';
import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import {
  LABEL_COLUMN_CONFIG,
  Label,
  UnitRowItem,
} from '@/components/unit-data-grid/utils/data-grid-helpers';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';

const createAttentionChip = (
  attentionCount: number,
  totalCount: number,
  isVisible: boolean = true,
): JSX.Element | null => {
  if (!isVisible || attentionCount === 0) {
    return null;
  }

  return (
    <Tooltip title={`${attentionCount} of ${totalCount} units need attention`} arrow>
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

// Group-row rendering was removed when row grouping moved to GroupNavPanel.
// Community DataGrid never produces `rowNode.type === 'group'`, so the
// previous group-aggregation branches were unreachable. The wrapper is kept
// so call-site signatures stay unchanged.
const createIntelligentGroupRenderer = <T,>(
  rows: UnitRowItem[],
  valueExtractor: (row: UnitRowItem) => T,
  singularLabel: string,
  pluralLabel: string,
  fallbackRenderer: (params: GridRenderCellParams<UnitRowItem>) => JSX.Element,
  customRenderer?: (uniqueValues: T[], filteredRows: UnitRowItem[]) => JSX.Element,
) => {
  // The signature is preserved for call-site compatibility; only fallbackRenderer
  // is still meaningful. Discard the others so static analysis stays clean.
  void rows;
  void valueExtractor;
  void singularLabel;
  void pluralLabel;
  void customRenderer;
  return (params: GridRenderCellParams<UnitRowItem>) => fallbackRenderer(params);
};

/**
 * Custom hook for managing label column state and operations in a data grid
 * @param rows - Array of unit row items containing label data
 * @param openLinksInNewTab - When true, slug links open in a new browser tab
 * @param allowedLabelColumns - When provided, only label keys in this list are surfaced as
 *   columns via `availableLabelKeys`. Pass an empty array to suppress all auto-added label
 *   columns. Leave undefined to preserve the default (auto-add every label key found on rows).
 * @returns Object with state and handlers for label column management
 */
export const useLabelColumnManager = (
  rows: Array<UnitRowItem>,
  openLinksInNewTab = false,
  allowedLabelColumns?: string[],
) => {
  /**
   * Extract and count unique label keys from all rows
   * Returns sorted array of labels with their occurrence counts
   */
  const availableLabelKeys = useMemo(() => {
    const allowSet = allowedLabelColumns ? new Set(allowedLabelColumns) : null;
    const labelCounts = rows.reduce<Record<string, number>>((acc, row) => {
      const labels = row?.Labels;
      if (!labels) return acc;

      Object.keys(labels).forEach((key) => {
        if (allowSet && !allowSet.has(key)) return;
        acc[key] = (acc[key] ?? 0) + 1;
      });
      return acc;
    }, {});

    return Object.entries(labelCounts)
      .map(([key, total]) => ({ key, total }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [rows, allowedLabelColumns]);

  /**
   * Extract and count unique value keys from all rows
   * Returns sorted array of values with their occurrence counts
   */
  const availableValueKeys = useMemo(() => {
    const valueCounts = rows.reduce<Record<string, number>>((acc, row) => {
      const values = row?.Values;
      if (!values) return acc;

      Object.keys(values).forEach((key) => {
        acc[key] = (acc[key] ?? 0) + 1;
      });
      return acc;
    }, {});

    return Object.entries(valueCounts)
      .map(([key, total]) => ({ key, total }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [rows]);

  /**
   * Create a data grid column definition for a specific label with attention aggregation
   */
  const createLabelColumn = (label: Label): GridColDef<UnitRowItem> => ({
    field: `Labels.${label.key}`,
    headerName: label.key,
    ...LABEL_COLUMN_CONFIG,
    valueGetter: (_, row) => row.Labels?.[label.key] || '',
    groupable: true,
    renderCell: (params) => {
      // Handle group rows - show label values and their counts
      if (params.rowNode.type === 'group') {
        const groupIds = params.rowNode.children || [];
        const filteredRows = rows.filter((row) => groupIds.includes(row.id));

        // Get all label values for this specific label key from the filtered rows
        const labelValues = filteredRows.map((row) => row.Labels?.[label.key]).filter(Boolean);
        const uniqueLabelValues = Array.from(new Set(labelValues));

        // Check if this is the generated grouping column (not the original column)
        const isGroupingColumn = false;

        // Only show attention info if this is the grouping column
        let totalUnitsNeedingAttention = 0;
        if (isGroupingColumn) {
          totalUnitsNeedingAttention = filteredRows.filter((row) => {
            return (
              row.UnreleasedChanges === 'Yes' ||
              row.UpgradeNeeded === 'Yes' ||
              Object.keys(row.ValidationErrors || {}).length > 0
            );
          }).length;
        }

        // If single label value, show it with attention info (only if grouping column)
        if (uniqueLabelValues.length === 1) {
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
                  <HighlightedCell value={uniqueLabelValues[0]} />
                </Ellipses>
              </Box>
              {isGroupingColumn &&
                totalUnitsNeedingAttention > 0 &&
                createAttentionChip(totalUnitsNeedingAttention, filteredRows.length, true)}
            </CenteredTableCell>
          );
        }

        // Multiple label values - show count with tooltip
        if (uniqueLabelValues.length > 1) {
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
                <Tooltip title={uniqueLabelValues.join(', ')} arrow>
                  <Ellipses
                    variant='body1'
                    sx={{ fontWeight: 'medium', color: 'text.secondary' }}
                  >
                    {uniqueLabelValues.length} {label.key} values
                  </Ellipses>
                </Tooltip>
              </Box>
              {isGroupingColumn &&
                totalUnitsNeedingAttention > 0 &&
                createAttentionChip(totalUnitsNeedingAttention, filteredRows.length, true)}
            </CenteredTableCell>
          );
        }

        // No label values - show empty
        return <CenteredTableCell />;
      }

      // Handle regular data rows
      return (
        <CenteredTableCell>
          <Tooltip title={params.value} arrow>
            <span>
              <Ellipses variant='body1'>
                <HighlightedCell value={params.value} />
              </Ellipses>
            </span>
          </Tooltip>
        </CenteredTableCell>
      );
    },
  });

  /**
   * Create a data grid column definition for a specific value with attention aggregation
   */
  const createValueColumn = (valueKey: Label): GridColDef<UnitRowItem> => {
    // A Values key is "<space slug>/<trigger slug>/<attribute name>", or "<trigger slug>/<attribute
    // name>" on a Unit not resolved since the Space slug was added. The header is the Trigger slug,
    // the segment before the attribute, in either.
    const keyParts = valueKey.key.split('/');
    const headerName = keyParts.length >= 2 ? keyParts[keyParts.length - 2] : valueKey.key;

    return {
      field: `Values.${valueKey.key}`,
      headerName,
      ...LABEL_COLUMN_CONFIG,
      valueGetter: (_, row) => row.Values?.[valueKey.key] || '',
      groupable: true,
      renderCell: (params) => {
        // Handle group rows - show values and their counts
        if (params.rowNode.type === 'group') {
          const groupIds = params.rowNode.children || [];
          const filteredRows = rows.filter((row) => groupIds.includes(row.id));

          // Get all values for this specific value key from the filtered rows
          const values = filteredRows.map((row) => row.Values?.[valueKey.key]).filter(Boolean);
          const uniqueValues = Array.from(new Set(values));

          // Check if this is the generated grouping column (not the original column)
          const isGroupingColumn = false;

          // Only show attention info if this is the grouping column
          let totalUnitsNeedingAttention = 0;
          if (isGroupingColumn) {
            totalUnitsNeedingAttention = filteredRows.filter((row) => {
              return (
                row.UnreleasedChanges === 'Yes' ||
                row.UpgradeNeeded === 'Yes' ||
                Object.keys(row.ValidationErrors || {}).length > 0
              );
            }).length;
          }

          // If single value, show it with attention info (only if grouping column)
          if (uniqueValues.length === 1) {
            return (
              <CenteredTableCell>
                <Tooltip title={uniqueValues[0]} arrow>
                  <Ellipses variant='body1'>
                    <HighlightedCell value={uniqueValues[0]} />
                  </Ellipses>
                </Tooltip>
                {isGroupingColumn &&
                  totalUnitsNeedingAttention > 0 &&
                  createAttentionChip(totalUnitsNeedingAttention, filteredRows.length, true)}
              </CenteredTableCell>
            );
          }

          // Multiple values - show as comma-delimited with ellipses and tooltip
          if (uniqueValues.length > 1) {
            const commaSeparatedValues = uniqueValues.join(', ');
            return (
              <CenteredTableCell>
                <Tooltip title={commaSeparatedValues} arrow>
                  <Ellipses variant='body1'>{commaSeparatedValues}</Ellipses>
                </Tooltip>
                {isGroupingColumn &&
                  totalUnitsNeedingAttention > 0 &&
                  createAttentionChip(totalUnitsNeedingAttention, filteredRows.length, true)}
              </CenteredTableCell>
            );
          }

          // No values - show empty
          return <CenteredTableCell />;
        }

        // Handle regular data rows
        const value = params.row?.Values?.[valueKey.key];
        return (
          <CenteredTableCell>
            {value && (
              <Tooltip title={value} arrow>
                <Ellipses variant='body1'>
                  <HighlightedCell value={value} />
                </Ellipses>
              </Tooltip>
            )}
          </CenteredTableCell>
        );
      },
    };
  };

  // Function to create columns with group row support
  const createColumnsWithGrouping = (
    rows: UnitRowItem[],
    onRowItemEdit?: (id: string) => void,
  ): GridColDef<UnitRowItem>[] => [
    {
      field: 'Slug',
      headerName: 'Slug',
      flex: 1.4,
      minWidth: 200,
      valueGetter: (_, row) => row.Slug,
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.Slug,
        'Slug',
        'Slug',
        (params) => (
          <CenteredTableCell>
            <Tooltip
              title={params.value}
              arrow
              slotProps={{ popper: { sx: { pointerEvents: 'none', userSelect: 'none' } } }}
            >
              <span style={{ minWidth: 0 }}>
                <NavLink
                  to={`/units/${params.row?.SpaceID}/${params.row.id}`}
                  target={openLinksInNewTab ? '_blank' : undefined}
                  rel={openLinksInNewTab ? 'noopener noreferrer' : undefined}
                >
                  <Ellipses
                    variant='body1'
                    sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    {params.value}
                  </Ellipses>
                </NavLink>
              </span>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'ID',
      headerName: 'ID',
      flex: 1.4,
      width: 350,
      valueGetter: (_, row) => row.id || '',
      groupable: false,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.id,
        'ID',
        'ID',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.value} arrow>
              <Ellipses variant='body1'>{params.value}</Ellipses>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'Space',
      headerName: 'Space',
      flex: 1.4,
      width: 200,
      valueGetter: (_, row) => row.Space,
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.Space,
        'Spaces',
        'Spaces',
        (params) => (
          <CenteredTableCell sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title={params.row?.SpaceID} arrow>
              <span>
                <NavLink to={`/spaces/${params.row?.SpaceID}`}>
                  <Ellipses
                    variant='body1'
                    sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    {params.value}
                  </Ellipses>
                </NavLink>
              </span>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'SpaceID',
      headerName: 'Space ID',
      flex: 1.4,
      width: 350,
      valueGetter: (_, row) => row.SpaceID || '',
      groupable: false,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.SpaceID,
        'SpaceID',
        'SpaceID',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.value} arrow>
              <Ellipses variant='body1'>{params.value}</Ellipses>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'Target',
      headerName: 'Target',
      flex: 1.4,
      width: 200,
      valueGetter: (_, row) => row.Target,
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.Target,
        'Targets',
        'Targets',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.row?.TargetID} arrow>
              <Ellipses
                variant='body1'
                onClick={() => onRowItemEdit?.(params.row?.TargetID || '')}
                sx={{ textDecoration: 'underline', cursor: 'pointer' }}
              >
                {params.value}
              </Ellipses>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'TargetID',
      headerName: 'Target ID',
      flex: 1.4,
      width: 350,
      valueGetter: (_, row) => row.TargetID || '',
      groupable: false,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.TargetID,
        'TargetID',
        'TargetID',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.value} arrow>
              <Ellipses variant='body1'>{params.value}</Ellipses>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'ToolchainType',
      headerName: 'Toolchain Type',
      flex: 1,
      minWidth: 150,
      valueGetter: (_, row) => row.ToolchainType || '',
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.ToolchainType,
        'Types',
        'Types',
        (params) => (
          <CenteredTableCell>
            <Chip size='small' label={params.value} />
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'LastChangeDescription',
      headerName: 'Last Change',
      flex: 1,
      minWidth: 200,
      valueGetter: (_, row) => {
        return row.LastChangeDescription || '';
      },
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.LastChangeDescription,
        'Changes',
        'Changes',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.value} arrow>
              <span>
                <Ellipses variant='body1'>{params.value}</Ellipses>
              </span>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },

    {
      field: 'HeadRevisionNum',
      headerName: 'Head Revision',
      minWidth: 100,
      flex: 0.5,
      valueGetter: (_, row) => {
        return row?.HeadRevisionNum || 0;
      },
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row?.HeadRevisionNum || 0,
        'Revisions',
        'Revisions',
        (params) => (
          <CenteredTableCell>
            <Tooltip
              title={`You have ${(params.row?.HeadRevisionNum ?? 0) - (params.row?.LastReleasedRevisionNum ?? 0)} unreleased revisions.`}
              placement='top'
            >
              <Typography variant='body1'>{params.value}</Typography>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'LastReleasedRevisionNum',
      headerName: 'Last Released Revision',
      minWidth: 100,
      flex: 0.5,
      valueGetter: (_, row) => {
        return row?.LastReleasedRevisionNum || 0;
      },
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row?.LastReleasedRevisionNum || 0,
        'Revisions',
        'Revisions',
        (params) => (
          <CenteredTableCell>
            <Typography variant='body1'>{params.value != 0 ? params.value : ''}</Typography>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'ValidationErrors',
      headerName: 'Validation Errors',
      flex: 0.5,
      minWidth: 100,
      groupable: false,
      type: 'number',
      headerAlign: 'left',
      align: 'left',
      valueGetter: (_, row) => Object.keys(row.ValidationErrors || {}).length,
      renderCell: (params) => {
        // For group rows, show the aggregated sum
        if (params.rowNode.type === 'group') {
          const groupIds = params.rowNode.children || [];
          const filteredRows = rows.filter((row) => groupIds.includes(row.id));

          // Calculate total validation errors count
          const totalCount = filteredRows.reduce(
            (sum, row) => sum + Object.keys(row.ValidationErrors || {}).length,
            0,
          );

          // Get all unique validation error names
          const allValidationErrors = filteredRows.reduce<string[]>((acc, row) => {
            const gateNames = Object.keys(row.ValidationErrors || {});
            return [...acc, ...gateNames];
          }, []);
          const uniqueGateNames = Array.from(new Set(allValidationErrors));

          return totalCount > 0 ? (
            <CenteredTableCell>
              <Tooltip
                title={
                  uniqueGateNames.length > 0
                    ? uniqueGateNames.join(', ')
                    : 'No validation errors'
                }
                arrow
              >
                <span>
                  <Chip color='error' label={totalCount} size='small' />
                </span>
              </Tooltip>
            </CenteredTableCell>
          ) : null;
        }

        // For regular rows, show individual count with tooltip
        const validationErrors = params.row?.ValidationErrors || {};
        return (
          <CenteredTableCell>
            <Tooltip
              title={Object.entries(validationErrors).map(([key], index) => {
                return (
                  <>
                    {index !== 0 ? ', ' : ''}
                    {key}
                  </>
                );
              })}
              arrow
            >
              <span>
                {params.value > 0 ? <Chip color='error' label={params.value} /> : null}
              </span>
            </Tooltip>
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'ValidationWarnings',
      headerName: 'Validation Warnings',
      flex: 0.5,
      minWidth: 100,
      groupable: false,
      type: 'number',
      headerAlign: 'left',
      align: 'left',
      valueGetter: (_, row) => Object.keys(row.ValidationWarnings || {}).length,
      renderCell: (params) => {
        // For group rows, show the aggregated sum
        if (params.rowNode.type === 'group') {
          const groupIds = params.rowNode.children || [];
          const filteredRows = rows.filter((row) => groupIds.includes(row.id));

          // Calculate total validation warnings count
          const totalCount = filteredRows.reduce(
            (sum, row) => sum + Object.keys(row.ValidationWarnings || {}).length,
            0,
          );

          // Get all unique validation warning names
          const allValidationWarnings = filteredRows.reduce<string[]>((acc, row) => {
            const warningNames = Object.keys(row.ValidationWarnings || {});
            return [...acc, ...warningNames];
          }, []);
          const uniqueWarningNames = Array.from(new Set(allValidationWarnings));

          return totalCount > 0 ? (
            <CenteredTableCell>
              <Tooltip
                title={
                  uniqueWarningNames.length > 0
                    ? uniqueWarningNames.join(', ')
                    : 'No validation warnings'
                }
                arrow
              >
                <span>
                  <Chip color='warning' label={totalCount} size='small' />
                </span>
              </Tooltip>
            </CenteredTableCell>
          ) : null;
        }

        // For regular rows, show individual count with tooltip
        const validationWarnings = params.row?.ValidationWarnings || {};
        return (
          <CenteredTableCell>
            <Tooltip
              title={Object.entries(validationWarnings).map(([key], index) => {
                return (
                  <>
                    {index !== 0 ? ', ' : ''}
                    {key}
                  </>
                );
              })}
              arrow
            >
              <span>
                {params.value > 0 ? <Chip color='warning' label={params.value} /> : null}
              </span>
            </Tooltip>
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'UpgradeNeeded',
      headerName: 'Upgrade Needed',
      flex: 0.7,
      minWidth: 120,
      valueGetter: (_, row) => row.UpgradeNeeded || '',
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.UpgradeNeeded,
        'Upgrades needed',
        'Upgrades needed',
        (params) => (
          <CenteredTableCell>
            {params.value === 'Yes' && <Chip label='Yes' color='error' size='small' />}
            {params.value === 'No' && <Chip label='No' color='success' size='small' />}
          </CenteredTableCell>
        ),
        (uniqueValues) => (
          <CenteredTableCell sx={{ gap: 1 }}>
            {uniqueValues.map((value) => (
              <Chip
                key={value}
                label={value}
                color={value === 'Yes' ? 'error' : 'success'}
                size='small'
              />
            ))}
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'UnreleasedChanges',
      headerName: 'Unreleased Changes',
      flex: 0.7,
      minWidth: 140,
      valueGetter: (_, row) => row.UnreleasedChanges || '',
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.UnreleasedChanges,
        'Unreleased Changes',
        'Unreleased Changes',
        (params) => (
          <CenteredTableCell>
            {params.value === 'Yes' && <Chip label='Yes' color='error' size='small' />}
          </CenteredTableCell>
        ),
        (uniqueValues) => (
          <CenteredTableCell sx={{ gap: 1 }}>
            {uniqueValues.map((value) => (
              <Chip
                key={value || 'No'}
                label={value || 'No'}
                color={value === 'Yes' ? 'error' : 'success'}
                size='small'
              />
            ))}
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'UpdatedAt',
      headerName: 'Updated At',
      minWidth: 160,
      groupable: true,
      type: 'dateTime',
      valueGetter: (_, row) => (row.UpdatedAt ? new Date(row.UpdatedAt) : null),
      renderCell: (params) => <DateTimeCell params={params} />,
    },
    {
      field: 'CreatedAt',
      headerName: 'Created At',
      minWidth: 160,
      groupable: true,
      type: 'dateTime',
      valueGetter: (_, row) => {
        const createdAt = row.CreatedAt;
        return createdAt && createdAt !== '0001-01-01T00:00:00Z' ? new Date(createdAt) : null;
      },
      renderCell: (params) => <DateTimeCell params={params} />,
    },
    // Status & Actions columns
    // Revision Tracking columns
    {
      field: 'HeadMutationNum',
      headerName: 'Head Mutation',
      minWidth: 100,
      flex: 0.6,
      valueGetter: (_, row) => row?.HeadMutationNum || 0,
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row?.HeadMutationNum || 0,
        'Mutations',
        'Mutations',
        (params) => (
          <CenteredTableCell>
            <Typography variant='body1'>{params.value != 0 ? params.value : ''}</Typography>
          </CenteredTableCell>
        ),
      ),
    },
    // Clone/Upstream columns
    {
      field: 'UpstreamUnitSlug',
      headerName: 'Upstream Unit',
      flex: 1,
      minWidth: 150,
      valueGetter: (_, row) => row.UpstreamUnitSlug || '',
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.UpstreamUnitSlug,
        'Units',
        'Units',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.value} arrow>
              <Ellipses variant='body1'>{params.value}</Ellipses>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'UpstreamUnitID',
      headerName: 'Upstream Unit ID',
      flex: 1,
      width: 350,
      valueGetter: (_, row) => row.UpstreamUnitID || '',
      groupable: false,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.UpstreamUnitID,
        'UpstreamUnitID',
        'UpstreamUnitID',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.value} arrow>
              <Ellipses variant='body1'>{params.value}</Ellipses>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'UpstreamSpaceSlug',
      headerName: 'Upstream Space',
      flex: 1,
      minWidth: 150,
      valueGetter: (_, row) => row.UpstreamSpaceSlug || '',
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.UpstreamSpaceSlug,
        'Spaces',
        'Spaces',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.value} arrow>
              <Ellipses variant='body1'>{params.value}</Ellipses>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'UpstreamSpaceID',
      headerName: 'Upstream Space ID',
      flex: 1,
      width: 350,
      valueGetter: (_, row) => row.UpstreamSpaceID || '',
      groupable: false,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.UpstreamSpaceID,
        'UpstreamSpaceID',
        'UpstreamSpaceID',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.value} arrow>
              <Ellipses variant='body1'>{params.value}</Ellipses>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    // Operations & Gates columns
    {
      field: 'DestroyGates',
      headerName: 'Destroy Gates',
      flex: 0.6,
      minWidth: 120,
      groupable: false,
      type: 'number',
      valueGetter: (_, row) => Object.keys(row.DestroyGates || {}).length,
      renderCell: (params) => {
        if (params.rowNode.type === 'group') {
          const groupIds = params.rowNode.children || [];
          const filteredRows = rows.filter((row) => groupIds.includes(row.id));
          const totalCount = filteredRows.reduce(
            (sum, row) => sum + Object.keys(row.DestroyGates || {}).length,
            0,
          );
          return totalCount > 0 ? (
            <CenteredTableCell>
              <Chip color='warning' label={totalCount} size='small' />
            </CenteredTableCell>
          ) : null;
        }
        const destroyGates = params.row?.DestroyGates || {};
        const count = Object.keys(destroyGates).length;
        return (
          <CenteredTableCell>
            {count > 0 ? (
              <Tooltip title={Object.keys(destroyGates).join(', ')} arrow>
                <span>
                  <Chip color='warning' label={count} size='small' />
                </span>
              </Tooltip>
            ) : null}
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'DeleteGates',
      headerName: 'Delete Gates',
      flex: 0.6,
      minWidth: 120,
      groupable: false,
      type: 'number',
      valueGetter: (_, row) => Object.keys(row.DeleteGates || {}).length,
      renderCell: (params) => {
        if (params.rowNode.type === 'group') {
          const groupIds = params.rowNode.children || [];
          const filteredRows = rows.filter((row) => groupIds.includes(row.id));
          const totalCount = filteredRows.reduce(
            (sum, row) => sum + Object.keys(row.DeleteGates || {}).length,
            0,
          );
          return totalCount > 0 ? (
            <CenteredTableCell>
              <Chip color='warning' label={totalCount} size='small' />
            </CenteredTableCell>
          ) : null;
        }
        const deleteGates = params.row?.DeleteGates || {};
        const count = Object.keys(deleteGates).length;
        return (
          <CenteredTableCell>
            {count > 0 ? (
              <Tooltip title={Object.keys(deleteGates).join(', ')} arrow>
                <span>
                  <Chip color='warning' label={count} size='small' />
                </span>
              </Tooltip>
            ) : null}
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'ChangeSetID',
      headerName: 'Change Set ID',
      flex: 1,
      width: 350,
      valueGetter: (_, row) => row.ChangeSetID || '',
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.ChangeSetID,
        'ChangeSets',
        'ChangeSets',
        (params) => (
          <CenteredTableCell>
            <Tooltip title={params.value} arrow>
              <Ellipses variant='body1'>{params.value}</Ellipses>
            </Tooltip>
          </CenteredTableCell>
        ),
      ),
    },
    {
      field: 'ChangeSetSlug',
      headerName: 'Change Set Slug',
      flex: 1,
      minWidth: 200,
      valueGetter: (_, row) => row.ChangeSetSlug || '',
      groupable: true,
      renderCell: createIntelligentGroupRenderer(
        rows,
        (row) => row.ChangeSetSlug,
        'ChangeSets',
        'ChangeSets',
        (params) => (
          <CenteredTableCell>
            <Ellipses variant='body1'>{params.value}</Ellipses>
          </CenteredTableCell>
        ),
      ),
    },
    // Metadata columns
    {
      field: 'Annotations',
      headerName: 'Annotations',
      flex: 1,
      width: 350,
      valueGetter: (_, row) => JSON.stringify(row.Annotations),
      groupable: false,
      renderCell: (params) => {
        // Handle group rows
        if (params.rowNode.type === 'group') {
          const groupIds = params.rowNode.children || [];
          const filteredRows = rows.filter((row) => groupIds.includes(row.id));

          // Collect all unique annotation keys from the group
          const allAnnotations = filteredRows.reduce<Record<string, Set<string>>>(
            (acc, row) => {
              if (row.Annotations) {
                Object.entries(row.Annotations).forEach(([key, value]) => {
                  if (!acc[key]) {
                    acc[key] = new Set();
                  }
                  acc[key].add(value);
                });
              }
              return acc;
            },
            {},
          );

          const annotationEntries = Object.entries(allAnnotations);

          if (annotationEntries.length === 0) {
            return <CenteredTableCell />;
          }

          return (
            <CenteredTableCell>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {annotationEntries.slice(0, 2).map(([key, values]) => (
                  <Tooltip
                    key={key}
                    title={
                      values.size > 1 ? Array.from(values).join(', ') : Array.from(values)[0]
                    }
                    arrow
                  >
                    <Chip
                      label={values.size > 1 ? `${key} (${values.size})` : key}
                      size='small'
                      color='default'
                    />
                  </Tooltip>
                ))}
                {annotationEntries.length > 2 && (
                  <Tooltip
                    title={annotationEntries
                      .slice(2)
                      .map(([key]) => key)
                      .join(', ')}
                    arrow
                  >
                    <Chip
                      label={`+${annotationEntries.length - 2}`}
                      size='small'
                      color='default'
                    />
                  </Tooltip>
                )}
              </Box>
            </CenteredTableCell>
          );
        }

        // Handle regular data rows
        const annotations = params.row?.Annotations || {};
        const annotationEntries = Object.entries(annotations);

        if (annotationEntries.length === 0) {
          return <CenteredTableCell />;
        }

        // Convert to "key=value, key2=value2" format for KeyValueListCell
        const annotationsString = annotationEntries
          .map(([key, value]) => `${key}=${value}`)
          .join(', ');

        return (
          <CenteredTableCell>
            <KeyValueListCell value={annotationsString} />
          </CenteredTableCell>
        );
      },
    },
  ];

  return {
    availableLabelKeys,
    availableValueKeys,
    createLabelColumn,
    createValueColumn,
    createColumnsWithGrouping,
  } as const;
};
