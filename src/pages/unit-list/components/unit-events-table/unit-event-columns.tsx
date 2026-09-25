// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { buildColumns } from '@/components/data-grid/cells';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import Chip from '@mui/material/Chip';
import { ChipPropsColorOverrides } from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { OverridableStringUnion } from '@mui/types';

export interface UnitEventRow {
  id: string;
  unitEventNum: number | null;
  actionType: string;
  status: string;
  message: string;
  createdAt: string;
  startedAt: string | null;
  terminatedAt: string | null;
  revisionNum: number | null;
}

const STATUS_MAP: {
  [key: string]: OverridableStringUnion<
    'error' | 'default' | 'secondary' | 'primary' | 'info' | 'warning' | 'success',
    ChipPropsColorOverrides
  >;
} = {
  None: 'default',
  Pending: 'secondary',
  Submitted: 'primary',
  Progressing: 'info',
  Completed: 'success',
  Failed: 'error',
  Canceled: 'warning',
};

const getStatusColor = (
  status: string,
): OverridableStringUnion<
  'error' | 'default' | 'secondary' | 'primary' | 'info' | 'warning' | 'success',
  ChipPropsColorOverrides
> => {
  if (status in STATUS_MAP) {
    return STATUS_MAP[status as keyof typeof STATUS_MAP];
  }
  return 'default';
};

export const createUnitEventTableColumns = () =>
  buildColumns<UnitEventRow>({
    unitEventNum: {
      type: 'custom',
      headerName: 'Number',
      minWidth: 100,
      flex: 1,
      valueGetter: (row) => row.unitEventNum,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant="body1">
            {params.row.unitEventNum !== null ? params.row.unitEventNum : '-'}
          </Typography>
        </CenteredTableCell>
      ),
    },

    actionType: {
      type: 'string',
      headerName: 'Action Type',
      minWidth: 120,
      flex: 1,
    },

    revisionNum: {
      type: 'custom',
      headerName: 'Revision',
      minWidth: 100,
      flex: 1,
      valueGetter: (row) => row.revisionNum,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant="body1">
            {params.row.revisionNum !== null ? params.row.revisionNum : '-'}
          </Typography>
        </CenteredTableCell>
      ),
    },

    status: {
      type: 'custom',
      headerName: 'Status',
      minWidth: 120,
      flex: 1,
      valueGetter: (row) => row.status,
      renderCell: (params) => (
        <CenteredTableCell>
          <Chip
            label={params.row.status}
            color={getStatusColor(params.row.status)}
            size="small"
          />
        </CenteredTableCell>
      ),
    },

    message: {
      type: 'custom',
      headerName: 'Message',
      minWidth: 240,
      flex: 2,
      valueGetter: (row) => row.message,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row.message} arrow>
            <Ellipses variant="body1">{params.row.message}</Ellipses>
          </Tooltip>
        </CenteredTableCell>
      ),
    },

    startedAt: {
      type: 'dateTime',
      headerName: 'Started At',
      minWidth: 160,
      flex: 1,
      valueGetter: (row) => (row.startedAt ? new Date(row.startedAt) : null),
    },

    terminatedAt: {
      type: 'dateTime',
      headerName: 'Terminated At',
      minWidth: 120,
      flex: 1,
      valueGetter: (row) => (row.terminatedAt ? new Date(row.terminatedAt) : null),
    },

    createdAt: {
      type: 'dateTime',
      headerName: 'Created At',
      minWidth: 120,
      flex: 1,
      valueGetter: (row) => (row.createdAt ? new Date(row.createdAt) : null),
    },
  });
