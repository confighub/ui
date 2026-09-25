// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { Column, ExtendedViewRead } from '@confighub/rtk-query';

import { GroupNavRow } from '../../cell-value';
import { EntityAdapter } from '../../adapters';
import { getGroupByColumns } from '../../types';
import CachedIcon from '@mui/icons-material/Cached';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { EntityTable } from './EntityTable';

interface ViewExplorerProps {
  view: ExtendedViewRead;
  adapter: EntityAdapter;
  rows: GroupNavRow[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRefetch: () => void;
  onRowClick?: (row: GroupNavRow, event: React.MouseEvent) => void;
}

export function ViewExplorer({
  view,
  adapter,
  rows,
  isLoading,
  isFetching,
  isError,
  onRefetch,
  onRowClick,
}: ViewExplorerProps) {
  const v = view.View;
  const filter = view.Filter;
  const whereClause = filter?.Where;

  // Hide all groupBy columns from the table — they're shown in the GroupNavPanel
  const groupBySet = new Set(getGroupByColumns(v));
  const columns: Column[] = useMemo(() => v?.Columns ?? [], [v?.Columns]);
  const columnNames = columns.map((c) => c.Name).filter((n) => !groupBySet.has(n));
  const orderBy = v?.OrderBy ?? '';
  const orderByDirection = (v?.OrderByDirection as 'ASC' | 'DESC') ?? 'ASC';

  const countLabel = `${rows.length} ${rows.length === 1 ? adapter.noun : adapter.nounPlural}`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Explorer toolbar */}
      <Stack
        direction='row'
        alignItems='center'
        justifyContent='space-between'
        mb={1.5}
        spacing={1}
      >
        <Stack direction='row' alignItems='center' spacing={1}>
          <Typography variant='subtitle2' color='text.secondary'>
            {isLoading || isFetching ? 'Loading…' : countLabel}
          </Typography>
          {whereClause && (
            <Typography
              variant='caption'
              sx={{
                fontFamily: 'monospace',
                backgroundColor: 'action.selected',
                px: 1,
                py: 0.25,
                borderRadius: 1,
                color: 'text.secondary',
                maxWidth: 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              WHERE {whereClause}
            </Typography>
          )}
        </Stack>
        <Tooltip title='Refresh'>
          <span>
            <IconButton size='small' onClick={onRefetch} disabled={isLoading || isFetching}>
              <CachedIcon fontSize='small' />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {isError && (
        <Alert severity='error' sx={{ mb: 2 }}>
          Failed to load {adapter.nounPlural}. Check the filter expression and try again.
        </Alert>
      )}

      {isLoading ? (
        <Box display='flex' justifyContent='center' pt={6}>
          <CircularProgress />
        </Box>
      ) : (
        <EntityTable
          rows={rows}
          adapter={adapter}
          columnNames={columnNames}
          orderBy={orderBy}
          orderByDirection={orderByDirection}
          loading={isFetching}
          onRowClick={onRowClick}
        />
      )}
    </Box>
  );
}

