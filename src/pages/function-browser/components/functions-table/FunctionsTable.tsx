// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React, { useState } from 'react';

import { Tooltip } from '@mui/material';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';

import { CenteredTableCell, Ellipses, StripedDataGrid } from '../../../../components/styled';
import { ProcessedFunction } from '../../utils/function-browser-utils';
import { getPimaryPropertyChip, getResourceTypeLabel } from '../index';

// Define all possible column fields for type safety
type FunctionColumnFields = 'functionName' | 'description' | 'toolchainType' | 'functionType' | 'properties' | 'parameters' | 'output';

// Create a type that requires all columns to be specified
type FunctionColumnVisibility = Record<FunctionColumnFields, boolean>;

export interface FunctionsTableProps {
  functions: Array<ProcessedFunction>;
  onRowSelected?: (newSelection: Array<string>) => void;
  actions?: React.ReactNode;
  onFunctionClick?: (func: ProcessedFunction) => void;
}

export const FunctionsTable = ({
  onRowSelected,
  functions = [],
  onFunctionClick,
}: FunctionsTableProps) => {
  const [, setSelectedRows] = useState<GridRowSelectionModel>([]);

  const handleRowSelection = (newSelection: GridRowSelectionModel) => {
    setSelectedRows(newSelection);
    // @ts-expect-error it's actually a string array
    onRowSelected?.(newSelection);
  };

  const mappedFunctions = functions.map((func, index) => ({
    id: func.FunctionName || `function-${index}`,
    ...func,
  }));

  const columns: GridColDef<ProcessedFunction>[] = [
    {
      field: 'functionName',
      headerName: 'Function Name',
      minWidth: 180,
      flex: 1,
      valueGetter: (_, row) => row?.FunctionName,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row.FunctionName} arrow>
            <Ellipses
              sx={{
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
              variant='body1'
              onClick={() => onFunctionClick?.(params.row)}
            >
              {params.row.FunctionName}
            </Ellipses>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      minWidth: 250,
      flex: 2,
      valueGetter: (_, row) => row?.Description,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row.Description || ''} arrow>
            <Ellipses variant='body1'>{params.row.Description}</Ellipses>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'toolchainType',
      headerName: 'Toolchain',
      minWidth: 150,
      flex: 1,
      valueGetter: (_, row) => getResourceTypeLabel(row?.resourceTypes || ''),
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={getResourceTypeLabel(params.row.resourceTypes || '')} arrow>
            <Chip
              size='small'
              label={getResourceTypeLabel(params.row.resourceTypes)}
              variant='filled'
              color='default'
            />
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'functionType',
      headerName: 'Type',
      minWidth: 100,
      flex: 0.8,
      valueGetter: (_, row) => row?.FunctionType,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body2' color='text.secondary'>
            {params.row.FunctionType}
          </Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'properties',
      headerName: 'Properties',
      minWidth: 200,
      flex: 2,
      sortable: false,
      renderCell: (params) => {
        const primaryChip = getPimaryPropertyChip(params.row);
        return (
          primaryChip && (
            <CenteredTableCell>
              <Chip
                label={primaryChip.label}
                // @ts-expect-error MUI types are not compatible with our types
                color={primaryChip.color}
                size='small'
                sx={{ flexShrink: 0 }}
              />
            </CenteredTableCell>
          )
        );
      },
    },
    {
      field: 'parameters',
      headerName: 'Parameters',
      minWidth: 200,
      flex: 2,
      sortable: false,
      renderCell: (params) => {
        const parameters = params.row.Parameters || [];
        const requiredCount = params.row.RequiredParameters || 0;
        const hasVarArgs = params.row.VarArgs;

        if (parameters.length === 0) {
          return (
            <CenteredTableCell>
              <Chip size='small' label='None' variant='outlined' color='default' />
            </CenteredTableCell>
          );
        }

        // Create parameter summary
        const requiredParams = parameters.slice(0, requiredCount);
        const optionalParams = parameters.slice(requiredCount);

        const parameterSummary = [
          ...requiredParams.map((p) => p.ParameterName),
          ...optionalParams.map((p) => `[${p.ParameterName}]`),
          ...(hasVarArgs ? ['...'] : []),
        ].join(', ');

        const tooltipContent =
          parameters
            .map((param, index) => {
              const isRequired = index < requiredCount;
              const prefix = isRequired ? '• ' : '• [Optional] ';
              return `${prefix}${param.ParameterName}: ${param.Description || 'No description'}${param.DataType ? ` (${param.DataType})` : ''}`;
            })
            .join('\n') + (hasVarArgs ? '\n• ... (variable arguments)' : '');

        return (
          <CenteredTableCell>
            <Tooltip title={tooltipContent} arrow>
              <Stack direction='row' spacing={0.5} alignItems='center'>
                <Chip
                  size='small'
                  label={`${requiredCount}${hasVarArgs ? '+' : ''}/${parameters.length}`}
                  color={
                    requiredCount === parameters.length && !hasVarArgs ? 'success' : 'primary'
                  }
                  variant='outlined'
                />
                <Ellipses
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                    maxWidth: 150,
                  }}
                >
                  {parameterSummary}
                </Ellipses>
              </Stack>
            </Tooltip>
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'output',
      headerName: 'Output',
      minWidth: 120,
      flex: 1,
      valueGetter: (_, row) => row?.OutputInfo?.OutputType,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body2' color='text.secondary'>
            {params.row.OutputInfo?.OutputType || 'None'}
          </Typography>
        </CenteredTableCell>
      ),
    },
  ];

  return (
    mappedFunctions?.length > 0 && (
      <StripedDataGrid
        sx={{ borderRadius: '10px', mb: 2 }}
        rows={mappedFunctions}
        // @ts-expect-error MUI types are not compatible with our types
        columns={columns}
        initialState={{
          pagination: {
            paginationModel: { page: 0, pageSize: 100 },
          },
          sorting: {
            sortModel: [{ field: 'functionName', sort: 'asc' }],
          },
          columns: {
            columnVisibilityModel: {
              functionName: true,
              description: true,
              toolchainType: true,
              functionType: true,
              properties: true,
              parameters: true,
              output: true,
            } satisfies FunctionColumnVisibility,
          },
        }}
        getRowClassName={(params) =>
          params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd'
        }
        onRowSelectionModelChange={handleRowSelection}
        rowHeight={50}
      />
    )
  );
};
