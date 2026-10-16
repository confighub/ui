// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { DATE_TIME_GRID_SLOTS, DateTimeCell, UuidCell } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { ColumnGroup } from '@/components/entity-data-grid/column-groups-types';
import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import { EmptyMutations } from '@/components/mutation-table/components/empty-mutations/EmptyMutations';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import {
  ExtendedMutationRead,
  ExtendedUnitRead,
  FunctionArgument,
  useListExtendedMutationsQuery,
} from '@confighub/rtk-query';
import { UNIT_DETAIL_TAB } from '@/pages/unit-detail/unitDetailHrefs';
import { CmpProps } from '@/types';
import { isGoZeroTime } from '@/utility/datetime-utils';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

export interface IMutationsTableProps extends CmpProps {
  unitExtended: ExtendedUnitRead;
  onTabSelected: (tab: number) => void;
}

export type MutationRow = { id: string } & ExtendedMutationRead;

dayjs.extend(relativeTime);

/**
 * The Columns panel lists the columns by group, so every column the table defines is named in
 * exactly one of these.
 */
const MUTATION_COLUMN_GROUPS: ColumnGroup[] = [
  {
    header: 'Mutation',
    columns: ['mutationNum', 'MutationID', 'revisionNum', 'source', 'Subgroup'],
  },
  {
    header: 'Function',
    columns: ['functionName', 'arguments', 'whereResource', 'invocation', 'BridgeWorkerID'],
  },
  {
    header: 'Cause',
    columns: ['trigger', 'link', 'providedPath', 'providedResource'],
  },
  {
    header: 'Restore & Merge',
    columns: ['RestoredRevisionNum', 'mergeSource', 'MergeBaseRevisionNum', 'MergeEndRevisionNum'],
  },
  {
    header: 'Replay',
    columns: ['ReplayOutcome', 'ReplayReason'],
  },
  {
    header: 'Timestamps',
    columns: ['createdAt'],
  },
];

const MUTATION_COLUMN_VISIBILITY: Record<string, boolean> = {
  mutationNum: true,
  MutationID: false,
  revisionNum: true,
  source: true,
  Subgroup: false,
  functionName: true,
  arguments: true,
  whereResource: false,
  invocation: false,
  BridgeWorkerID: false,
  trigger: true,
  link: true,
  providedPath: true,
  providedResource: false,
  RestoredRevisionNum: false,
  mergeSource: false,
  MergeBaseRevisionNum: false,
  MergeEndRevisionNum: false,
  ReplayOutcome: false,
  ReplayReason: false,
  createdAt: false,
};

/** The arguments the function ran with, or the Trigger's when the Mutation records none. */
const mutationArguments = (row: MutationRow): string => {
  const functionArgs = row.Mutation?.FunctionInvocation?.Arguments ?? [];
  const triggerArgs = row.Trigger?.Arguments ?? [];
  return (functionArgs.length > 0 ? functionArgs : triggerArgs)
    .map((arg: FunctionArgument) => `${arg.ParameterName || 'arg'}=${arg.Value?.toString() || ''}`)
    .join(', ');
};

const renderText = (params: GridRenderCellParams<MutationRow>) => {
  const text = params.value === undefined || params.value === null ? '' : String(params.value);
  return (
    <CenteredTableCell>
      <Tooltip title={text}>
        <Ellipses variant='body1'>{text}</Ellipses>
      </Tooltip>
    </CenteredTableCell>
  );
};

const renderUuid = (params: GridRenderCellParams<MutationRow>) => <UuidCell params={params} />;

/** A revision number column; 0 is what the server reports for none. */
const revisionNumColumn = (
  field: string,
  headerName: string,
  value: (row: MutationRow) => number | undefined,
): GridColDef<MutationRow> => ({
  field,
  headerName,
  type: 'number',
  minWidth: 100,
  flex: 0.5,
  valueGetter: (_, row) => value(row) || null,
  renderCell: renderText,
});

export const MutationsTable = ({ unitExtended, onTabSelected }: IMutationsTableProps) => {
  const {
    handleColumnResize,
    applyStoredWidths,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    sortModel,
    onSortModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence('mutations-table', {
    sortModel: [{ field: 'mutationNum', sort: 'desc' }],
    columnVisibility: MUTATION_COLUMN_VISIBILITY,
  });
  const unitId = unitExtended?.Unit?.UnitID || '';
  const spaceId = unitExtended?.Unit?.SpaceID || '';

  const { mutations = [] } = useListExtendedMutationsQuery(
    {
      spaceId,
      unitId,
      include: 'RevisionID,LinkID,TriggerID,SpaceID,UnitID,MergeSourceID,InvocationID',
    },
    {
      selectFromResult: ({ data }) => ({
        mutations: data?.map(
          (mutation): MutationRow => ({
            id: mutation.Mutation?.MutationID ?? '',
            ...mutation,
          }),
        ),
      }),
      skip: !spaceId || !unitId,
    },
  );

  // Memoize base columns definition
  const baseColumns: GridColDef<MutationRow>[] = useMemo(() => [
    {
      field: 'mutationNum',
      headerName: 'Num',
      flex: 0.25,
      minWidth: 100,
      valueGetter: (_, row) => row?.Mutation?.MutationNum,
      renderCell: (params) => (
        <CenteredTableCell>
          <Ellipses variant='body1'>{params.row?.Mutation?.MutationNum}</Ellipses>
        </CenteredTableCell>
      ),
    },
    {
      field: 'source',
      headerName: 'Source',
      flex: 0.7,
      minWidth: 100,
      valueGetter: (_, row) => row?.Revision?.Source,
      renderCell: (params) => (
        <CenteredTableCell>
          <Ellipses variant='body1'>{params.row?.Revision?.Source}</Ellipses>
        </CenteredTableCell>
      ),
    },
    {
      field: 'trigger',
      headerName: 'Trigger',
      flex: 0.7,
      minWidth: 100,
      valueGetter: (_, row) => row?.Trigger?.Slug,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row?.Trigger?.Slug} arrow>
            <NavLink
              to={`/triggers/${params.row?.Space?.SpaceID}/${params.row?.Trigger?.TriggerID}`}
            >
              <Ellipses variant='body1' sx={{ textDecoration: 'underline' }}>
                {params.row?.Trigger?.Slug}
              </Ellipses>
            </NavLink>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'link',
      headerName: 'Link',
      flex: 0.8,
      minWidth: 100,
      valueGetter: (_, row) => row?.Link?.Slug,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row?.Link?.Slug} arrow>
            <Ellipses
              variant='body1'
              sx={{ textDecoration: 'underline', cursor: 'pointer' }}
              onClick={() => onTabSelected(UNIT_DETAIL_TAB.links)}
            >
              {params.row?.Link?.Slug}
            </Ellipses>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'functionName',
      headerName: 'Function Name',
      flex: 0.8,
      minWidth: 100,
      valueGetter: (_, row) => row?.Mutation?.FunctionInvocation?.FunctionName,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row?.Mutation?.FunctionInvocation?.FunctionName} arrow>
            <Ellipses variant='body1'>
              {params.row?.Mutation?.FunctionInvocation?.FunctionName}
            </Ellipses>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'arguments',
      headerName: 'Arguments',
      minWidth: 150,
      flex: 1,
      valueGetter: (_, row) => mutationArguments(row),
      renderCell: (params) => {
        const aggregatedArguments = mutationArguments(params.row);
        return (
          <CenteredTableCell>
            {aggregatedArguments && aggregatedArguments.length > 0 && (
              <Tooltip title={aggregatedArguments} arrow>
                <Chip
                  key={params.row.id}
                  label={aggregatedArguments} // Display the aggregated arguments
                  size='small'
                />
              </Tooltip>
            )}
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'providedPath',
      headerName: 'Provided Path',
      flex: 1,
      minWidth: 130,
      valueGetter: (_, row) => row?.Mutation?.ProvidedPath,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row?.Mutation?.ProvidedPath} arrow>
            <Ellipses variant='body1'>{params.row?.Mutation?.ProvidedPath}</Ellipses>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'revisionNum',
      headerName: 'Revision Num',
      flex: 0.5,
      minWidth: 80,
      valueGetter: (_, row) => row?.Mutation?.RevisionNum,
      renderCell: (params) => (
        <CenteredTableCell>
          <Ellipses variant='body1'>{params.row?.Mutation?.RevisionNum}</Ellipses>
        </CenteredTableCell>
      ),
    },
    {
      field: 'MutationID',
      headerName: 'Mutation ID',
      minWidth: 160,
      flex: 1,
      valueGetter: (_, row) => row.Mutation?.MutationID ?? '',
      renderCell: renderUuid,
    },
    {
      field: 'Subgroup',
      headerName: 'Subgroup',
      type: 'number',
      minWidth: 90,
      flex: 0.4,
      valueGetter: (_, row) => row.Mutation?.Subgroup,
      renderCell: renderText,
    },
    {
      field: 'whereResource',
      headerName: 'Where Resource',
      minWidth: 150,
      flex: 1,
      valueGetter: (_, row) => row.Mutation?.FunctionInvocation?.WhereResource ?? '',
      renderCell: renderText,
    },
    {
      field: 'invocation',
      headerName: 'Invocation',
      minWidth: 130,
      flex: 0.8,
      valueGetter: (_, row) => row.Invocation?.Slug ?? '',
      renderCell: renderText,
    },
    {
      field: 'BridgeWorkerID',
      headerName: 'Bridge Worker ID',
      minWidth: 160,
      flex: 1,
      valueGetter: (_, row) => row.Mutation?.BridgeWorkerID ?? '',
      renderCell: renderUuid,
    },
    {
      field: 'providedResource',
      headerName: 'Provided Resource',
      minWidth: 160,
      flex: 1,
      valueGetter: (_, row) => {
        const resource = row.Mutation?.ProvidedResource;
        return resource?.ResourceName
          ? `${resource.ResourceType ?? ''} ${resource.ResourceName}`.trim()
          : '';
      },
      renderCell: renderText,
    },
    revisionNumColumn('RestoredRevisionNum', 'Restored Revision', (row) => row.Mutation?.RestoredRevisionNum),
    {
      field: 'mergeSource',
      headerName: 'Merge Source',
      minWidth: 130,
      flex: 0.8,
      valueGetter: (_, row) => row.MergeSource?.Slug ?? '',
      renderCell: (params) => {
        const source = params.row.MergeSource;
        if (!source?.Slug) return <CenteredTableCell />;
        return (
          <CenteredTableCell>
            <Tooltip title={source.Slug}>
              <NavLink to={`/units/${source.SpaceID}/${source.UnitID}`}>
                <Ellipses variant='body1' sx={{ textDecoration: 'underline' }}>
                  {source.Slug}
                </Ellipses>
              </NavLink>
            </Tooltip>
          </CenteredTableCell>
        );
      },
    },
    revisionNumColumn('MergeBaseRevisionNum', 'Merge Base', (row) => row.Mutation?.MergeBaseRevisionNum),
    revisionNumColumn('MergeEndRevisionNum', 'Merge End', (row) => row.Mutation?.MergeEndRevisionNum),
    {
      field: 'ReplayOutcome',
      headerName: 'Replay Outcome',
      minWidth: 130,
      flex: 0.8,
      valueGetter: (_, row) => row.Mutation?.ReplayOutcome ?? '',
      renderCell: renderText,
    },
    {
      field: 'ReplayReason',
      headerName: 'Replay Reason',
      minWidth: 150,
      flex: 1,
      valueGetter: (_, row) => row.Mutation?.ReplayReason ?? '',
      renderCell: renderText,
    },
    {
      field: 'createdAt',
      headerName: 'Created At',
      type: 'dateTime',
      minWidth: 140,
      flex: 1,
      valueGetter: (_, row) => {
        const createdAt = row.Mutation?.CreatedAt;
        return createdAt && !isGoZeroTime(createdAt) ? new Date(createdAt) : null;
      },
      renderCell: (params) => <DateTimeCell params={params} />,
    },
  ], [onTabSelected]);

  // Apply stored widths to columns
  const columns = useMemo(
    () => applyStoredWidths(baseColumns),
    [applyStoredWidths, baseColumns]
  );

  // A model stored before a column existed does not name it, and the grid shows every column a
  // model leaves out, so the defaults fill in whatever the stored model does not say.
  const effectiveColumnVisibilityModel = useMemo(
    () => ({ ...MUTATION_COLUMN_VISIBILITY, ...columnVisibilityModel }),
    [columnVisibilityModel],
  );

  if (mutations.length === 0) return <EmptyMutations />;

  return (
    <EntityDataGrid
      rows={mutations}
      columns={columns}
      columnVisibilityModel={effectiveColumnVisibilityModel}
      onColumnVisibilityModelChange={onColumnVisibilityModelChange}
      sortModel={sortModel}
      onSortModelChange={onSortModelChange}
      onColumnWidthChange={handleColumnResize}
      onClearState={clearStoredState}
      hasStateChanged={hasStateChanged}
      columnGroups={MUTATION_COLUMN_GROUPS}
      slots={DATE_TIME_GRID_SLOTS}
      disableRowSelectionOnClick
    />
  );
};
