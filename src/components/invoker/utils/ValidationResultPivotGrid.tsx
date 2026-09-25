// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box, Chip, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useMemo } from 'react';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { ValidationPivotRow } from './result-formatters';

// Row type with numeric id for grid compatibility
type ValidationPivotRowWithId = Omit<ValidationPivotRow, 'id'> & { id: number };

interface ValidationResultPivotGridProps {
  pivotRows: ValidationPivotRow[];
  unitSlugs: string[];
}

export const ValidationResultPivotGrid = ({
  pivotRows,
  unitSlugs,
}: ValidationResultPivotGridProps) => {
  // Add numeric ids for grid
  const rowsWithId: ValidationPivotRowWithId[] = useMemo(
    () => pivotRows.map((row, idx) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...rest } = row;
      return { ...rest, id: idx };
    }),
    [pivotRows],
  );

  const columns: GridColDef<ValidationPivotRowWithId>[] = useMemo(() => {
    const baseColumns: GridColDef<ValidationPivotRowWithId>[] = [
      // Test Name column
      {
        field: 'testName',
        headerName: 'Validation Test',
        width: 250,
        renderCell: (params) => (
          <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
            {params.value}
          </Typography>
        ),
      },
    ];

    // Add a column for each unit
    for (const unitSlug of unitSlugs) {
      baseColumns.push({
        field: unitSlug,
        headerName: unitSlug,
        width: 180,
        valueGetter: (_value, row) => {
          return row.unitValues[unitSlug];
        },
        renderCell: (params) => {
          const result = params.value as ValidationPivotRow['unitValues'][string] | undefined;

          if (!result) {
            return (
              <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                -
              </Typography>
            );
          }

          return (
            <Box sx={{ width: '100%', py: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                {result.passed ? (
                  <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                ) : (
                  <ErrorIcon sx={{ fontSize: 14, color: 'error.main' }} />
                )}
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: result.passed ? 'success.main' : 'error.main',
                  }}
                >
                  {result.passed ? 'Passed' : 'Failed'}
                </Typography>
              </Box>

              {result.failedAttributes && result.failedAttributes.length > 0 && (
                <Box sx={{ mt: 0.5 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {result.failedAttributes.map((attr, i) => (
                      <Chip
                        key={i}
                        label={attr}
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={{ fontSize: '0.6rem', height: 16 }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {result.details && result.details.length > 0 && (
                <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 1.5 }}>
                  {result.details.map((detail, i) => (
                    <Typography key={i} component="li" variant="caption" sx={{ fontSize: '0.65rem' }}>
                      {detail}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          );
        },
      });
    }

    return baseColumns;
  }, [unitSlugs]);

  return (
    <Box sx={{ width: '100%' }}>
      <DataGrid
        rows={rowsWithId}
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
        getRowHeight={() => 'auto'}
      />
    </Box>
  );
};
