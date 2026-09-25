// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box, Chip, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useMemo } from 'react';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { ValidationResultItemWithUnit } from './result-formatters';

export type ValidationResultRowWithId = ValidationResultItemWithUnit & { id: number };

interface ValidationResultDataGridProps {
  validationResults: ValidationResultItemWithUnit[];
  showUnitColumn?: boolean;
}

export const ValidationResultDataGrid = ({
  validationResults,
  showUnitColumn = false,
}: ValidationResultDataGridProps) => {
  // Create rows with id for the grid
  const rows: ValidationResultRowWithId[] = useMemo(
    () => validationResults.map((item, idx) => ({ ...item, id: idx })),
    [validationResults],
  );

  // Helper to check if item has unit info
  const hasUnitInfo = (item: ValidationResultItemWithUnit): boolean => {
    return 'unitSlug' in item;
  };

  // Create columns for the grid
  const columns: GridColDef<ValidationResultRowWithId>[] = useMemo(() => {
    const baseColumns: GridColDef<ValidationResultRowWithId>[] = [];

    // Add Unit column first if showing combined view
    if (showUnitColumn) {
      baseColumns.push({
        field: 'unitSlug',
        headerName: 'Unit',
        width: 140,
        renderCell: (params) => {
          const row = params.row;
          if (hasUnitInfo(row) && row.spaceId && row.unitId) {
            return (
              <Typography
                variant="body2"
                component="a"
                href={`/units/${row.spaceId}/${row.unitId}?`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'primary.main',
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {row.unitSlug}
              </Typography>
            );
          }
          return (
            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
              {row.unitSlug || '-'}
            </Typography>
          );
        },
      });
    }

    // Status column
    baseColumns.push({
      field: 'Passed',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {params.value ? (
            <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
          ) : (
            <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />
          )}
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: params.value ? 'success.main' : 'error.main',
            }}
          >
            {params.value ? 'Passed' : 'Failed'}
          </Typography>
        </Box>
      ),
    });

    // Message column
    baseColumns.push({
      field: 'Message',
      headerName: 'Message',
      flex: 1,
      minWidth: 200,
      valueGetter: (_value, row) => row.Message || row.Reason || '-',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
          {params.value}
        </Typography>
      ),
    });

    // Failed Attributes column
    baseColumns.push({
      field: 'FailedAttributes',
      headerName: 'Failed Attributes',
      width: 200,
      renderCell: (params) => {
        const failedAttrs = params.value as string[] | undefined;
        if (!failedAttrs || failedAttrs.length === 0) {
          return (
            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              -
            </Typography>
          );
        }
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {failedAttrs.map((attr, i) => (
              <Chip
                key={i}
                label={attr}
                size="small"
                color="error"
                variant="outlined"
                sx={{ fontSize: '0.65rem', height: 18 }}
              />
            ))}
          </Box>
        );
      },
    });

    // Details column
    baseColumns.push({
      field: 'Details',
      headerName: 'Details',
      width: 250,
      renderCell: (params) => {
        const details = params.value as string[] | undefined;
        if (!details || details.length === 0) {
          return (
            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              -
            </Typography>
          );
        }
        return (
          <Box component="ul" sx={{ mt: 0, mb: 0, pl: 2 }}>
            {details.map((detail, i) => (
              <Typography key={i} component="li" variant="caption" sx={{ fontSize: '0.7rem' }}>
                {detail}
              </Typography>
            ))}
          </Box>
        );
      },
    });

    return baseColumns;
  }, [showUnitColumn]);

  return (
    <Box sx={{ width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        density="compact"
        disableRowSelectionOnClick
        hideFooter
        sx={{
          border: 1,
          borderColor: 'divider',
          '& .MuiDataGrid-cell': {
            fontSize: '0.75rem',
          },
          '& .MuiDataGrid-columnHeader': {
            fontSize: '0.75rem',
            fontWeight: 600,
          },
          '& .MuiDataGrid-row': {
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          },
        }}
        getRowClassName={(params) =>
          params.row.Passed ? 'validation-passed-row' : 'validation-failed-row'
        }
        initialState={{
          sorting: {
            sortModel: [{ field: 'Passed', sort: 'asc' }],
          },
        }}
      />
    </Box>
  );
};
