// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { buildColumns } from '@/components/data-grid/cells';
import { KeyValueListCell } from '@/components/entity-data-grid';
import { ColumnGroup, DynamicGroupConfig } from '@/components/entity-data-grid/column-groups-types';
import { CenteredTableCell } from '@/components/styled';
import {
  TRIGGER_SELECTION_STATUS_DISPLAY,
  type TriggerSelectionStatus,
} from '@/components/trigger-selection/useTriggerSelection';
import { ExtendedTriggerRead } from '@confighub/rtk-query';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';

export const TRIGGER_COLUMN_GROUPS: ColumnGroup[] = [
  {
    header: 'Core Identity',
    columns: ['Slug', 'TriggerID', 'Space', 'SpaceID'],
  },
  {
    header: 'Selection',
    columns: ['Selection'],
  },
  {
    header: 'Configuration',
    columns: ['FunctionName', 'ToolchainType', 'Event'],
  },
  {
    header: 'Function Details',
    columns: ['Arguments'],
  },
  {
    header: 'Infrastructure',
    columns: ['BridgeWorkerSlug', 'BridgeWorkerID'],
  },
  {
    header: 'Status',
    columns: ['Validating', 'Disabled', 'Warn'],
  },
  {
    header: 'Timestamps',
    columns: ['CreatedAt', 'UpdatedAt'],
  },
];

export const TRIGGER_DYNAMIC_GROUPS: DynamicGroupConfig[] = [
  {
    name: 'Labels',
    columnPrefix: 'Labels.',
  },
];

export interface TriggerRowItem {
  id: string;
  Slug: string;
  TriggerID: string;
  SpaceID: string;
  Space: string;
  /** Where the name links: the edit drawer, on the page of the Space the Trigger is in */
  EditLink: string;
  /** Whether the Space or Target lists the Trigger, and whether it still selects it */
  Selection?: TriggerSelectionStatus;
  FunctionName: string;
  ToolchainType: string;
  Event: string;
  Arguments: string;
  BridgeWorkerSlug: string;
  BridgeWorkerID: string;
  Validating: boolean;
  Disabled: boolean;
  Warn: boolean;
  CreatedAt: string;
  UpdatedAt: string;
  Labels: {
    [key: string]: string;
  };
  _extendedTrigger?: ExtendedTriggerRead; // Store original for edit callback
}

export const createTriggerStaticColumns = () =>
  buildColumns<TriggerRowItem>({
    Slug: {
      type: 'link',
      headerName: 'Name',
      minWidth: 150,
      flex: 1.5,
      linkTo: (row) => row.EditLink,
      getText: (row) => row.Slug,
    },

    Selection: {
      type: 'custom',
      headerName: 'Selection',
      minWidth: 150,
      flex: 1,
      valueGetter: (row) => (row.Selection ? TRIGGER_SELECTION_STATUS_DISPLAY[row.Selection].label : ''),
      renderCell: (params) => {
        if (!params.row.Selection) return null;
        const display = TRIGGER_SELECTION_STATUS_DISPLAY[params.row.Selection];
        return (
          <CenteredTableCell>
            <Tooltip title={display.description} arrow>
              <Chip size='small' variant='outlined' color={display.color} label={display.label} />
            </Tooltip>
          </CenteredTableCell>
        );
      },
    },

    TriggerID: {
      type: 'uuid',
      headerName: 'Trigger ID',
      minWidth: 300,
      flex: 1.5,
    },

    Space: {
      type: 'link',
      headerName: 'Space',
      minWidth: 150,
      flex: 1,
      linkTo: (row) => `/spaces/${row.SpaceID}?tab=1`,
      getText: (row) => row.Space,
    },

    SpaceID: {
      type: 'uuid',
      headerName: 'Space ID',
      minWidth: 300,
      flex: 1.5,
    },

    FunctionName: {
      type: 'string',
      headerName: 'Function Name',
      minWidth: 180,
      flex: 1.5,
    },

    ToolchainType: {
      type: 'string',
      headerName: 'Type',
      minWidth: 120,
      flex: 1,
    },

    BridgeWorkerSlug: {
      type: 'string',
      headerName: 'Bridge Worker',
      minWidth: 120,
      flex: 1,
    },

    BridgeWorkerID: {
      type: 'uuid',
      headerName: 'Worker ID',
      minWidth: 300,
      flex: 1.5,
    },

    Arguments: {
      type: 'custom',
      headerName: 'Arguments',
      minWidth: 150,
      flex: 1.5,
      valueGetter: (row) => row.Arguments,
      renderCell: (params) => (
        <CenteredTableCell>
          <KeyValueListCell value={params.row.Arguments} />
        </CenteredTableCell>
      ),
    },

    Event: {
      type: 'string',
      headerName: 'Event',
      minWidth: 180,
      flex: 1,
    },

    Validating: {
      type: 'boolean',
      headerName: 'Validating',
      minWidth: 100,
      flex: 1,
    },

    Disabled: {
      type: 'boolean',
      headerName: 'Disabled',
      minWidth: 100,
      flex: 1,
      display: {
        true: () => <Chip size="small" color="error" label="Disabled" />,
        false: () => <Chip size="small" color="success" label="Enabled" />,
      },
    },

    Warn: {
      type: 'boolean',
      headerName: 'Warn',
      minWidth: 100,
      flex: 1,
      display: {
        true: () => <Chip size="small" color="warning" label="Warn" />,
        false: () => <Chip size="small" color="primary" label="Blocking" />,
      },
    },

    CreatedAt: {
      type: 'dateTime',
      headerName: 'Created At',
      valueGetter: (row) => (row.CreatedAt ? new Date(row.CreatedAt) : null),
      minWidth: 120,
      flex: 1,
    },

    UpdatedAt: {
      type: 'dateTime',
      headerName: 'Updated At',
      valueGetter: (row) => (row.UpdatedAt ? new Date(row.UpdatedAt) : null),
      minWidth: 120,
      flex: 1,
    },
  });
