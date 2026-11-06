// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfigDiffView } from '@/components/config-diff/ConfigDiffView';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { ErrorBox } from '@/components/error-box/ErrorBox';
import { NavLink } from '@/components/nav-link/NavLink';
import { useAppDispatch } from '@/hooks/useApp';
import { setAlert } from '@/state/slices/alert';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type BlameField,
  type ConfigDiff,
  type UnitConflictSelector,
  useGetUnitBlameQuery,
  useInvokeFunctionsOnOrgMutation,
  useResolveUnitConflictsMutation,
  useSetUnitGuardMutation,
  useSetUnitProtectionMutation,
} from '@confighub/rtk-query';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  type GridColDef,
  type GridComparatorFn,
  type GridRowSelectionModel,
  type GridSortDirection,
  gridStringOrNumberComparator,
} from '@mui/x-data-grid';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { unitOverviewHref, unitRevisionHref } from '../../unitDetailHrefs';
import { BlameFlagChip, BlameFlagChips } from './BlameFlagChip';
import { BlamePathDrawer } from './BlamePathDrawer';
import {
  BLAME_FLAGS,
  type BlameRow,
  NEEDS_ATTENTION_FLAGS,
  blameActionApplies,
  blameResources,
  blameRows,
  conflictDismissalText,
  conflictSelectors,
  filterBlameRows,
  guardKeys,
  guardRemoveRequest,
  guardSetRequest,
  originUnitLabel,
  permanentDismissalSelectors,
  protectionRequest,
  setInThisUnit,
  setValueRequest,
  undismissSelectors,
} from './blameFields';

dayjs.extend(relativeTime);

export interface BlameTableProps {
  spaceId: string;
  unitId: string;
  /** The path the tab opened filtered to, from the URL. */
  initialPath?: string;
}

/** The columns `-o wide` adds in cub, hidden until asked for. */
const HIDDEN_COLUMNS = {
  resource: false,
  function: false,
  mutation: false,
  via: false,
  changeOrder: false,
};

const monoSx = { fontFamily: 'monospace', fontSize: '0.8125rem' } as const;

/**
 * Sorts within each resource: a column sorts the fields of every resource, which stay
 * together under the resource's own row, and the resources stay in their order.
 */
function withinResource(direction: GridSortDirection): GridComparatorFn {
  return (v1, v2, p1, p2) => {
    const a = p1.api.getRow(p1.id) as BlameRow | null;
    const b = p2.api.getRow(p2.id) as BlameRow | null;
    if (a && b) {
      if (a.group !== b.group) return a.group - b.group;
      if (a.isResource !== b.isResource) return a.isResource ? -1 : 1;
    }
    const order = gridStringOrNumberComparator(v1, v2, p1, p2);
    return direction === 'desc' ? -order : order;
  };
}

/** The resource's own row heads its fields, and is set apart from the resource before it. */
const RESOURCE_ROW_CLASS = 'blame-resource-row';

const resourceRowSx = {
  [`& .${RESOURCE_ROW_CLASS}`]: {
    bgcolor: 'action.selected',
    borderTop: 2,
    borderColor: 'divider',
  },
  [`& .${RESOURCE_ROW_CLASS}:hover`]: { bgcolor: 'action.focus' },
} as const;

/** The resource a row about one names: its kind and its name, with its full type on hover. */
const ResourceHeading = ({ row }: { row: BlameRow }) => {
  const type = row.field.ResourceType ?? '';
  const kind = type.slice(type.lastIndexOf('/') + 1);
  return (
    <Tooltip title={row.resource}>
      <Box
        component='span'
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 1,
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <Typography component='span' variant='body2' color='text.secondary' noWrap>
          {kind}
        </Typography>
        <Typography
          component='span'
          noWrap
          sx={{
            ...monoSx,
            fontWeight: 600,
            textDecoration: row.field.Deleted ? 'line-through' : undefined,
          }}
        >
          {row.field.ResourceName}
        </Typography>
      </Box>
    </Tooltip>
  );
};

function buildColumns(onValidationClick: (field: BlameField) => void): GridColDef<BlameRow>[] {
  return columnsWithinResource([
    {
      field: 'flags',
      headerName: 'Flags',
      width: 220,
      sortable: false,
      valueGetter: (_, row) => (row.field.Flags ?? []).join(','),
      renderCell: (params) => (
        <BlameFlagChips
          field={params.row.field}
          onValidationClick={() => onValidationClick(params.row.field)}
        />
      ),
    },
    {
      field: 'resource',
      headerName: 'Resource',
      width: 260,
      valueGetter: (_, row) => row.resource,
    },
    {
      field: 'path',
      headerName: 'Path',
      flex: 2,
      minWidth: 240,
      valueGetter: (_, row) => row.field.Path ?? '',
      // A resource's own row has no value, so its heading takes the Value cell too.
      colSpan: (_, row) => (row.isResource ? 2 : 1),
      renderCell: (params) =>
        params.row.isResource ? (
          <ResourceHeading row={params.row} />
        ) : (
          <Tooltip title={params.row.resource}>
            <Typography
              component='span'
              sx={{
                ...monoSx,
                pl: 2,
                fontStyle: params.row.field.Absent ? 'italic' : undefined,
                textDecoration: params.row.field.Deleted ? 'line-through' : undefined,
                color: params.row.field.Deleted ? 'text.secondary' : undefined,
              }}
            >
              {params.row.field.Path}
            </Typography>
          </Tooltip>
        ),
    },
    {
      field: 'value',
      headerName: 'Value',
      flex: 1,
      minWidth: 140,
      valueGetter: (_, row) => (row.field.Value ?? '').trim(),
      renderCell: (params) =>
        params.row.field.Deleted ? (
          <Typography
            component='span'
            variant='body2'
            color='text.secondary'
            sx={{ fontStyle: 'italic' }}
          >
            deleted
          </Typography>
        ) : (
          <Typography
            component='span'
            sx={{ ...monoSx, overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {params.value}
          </Typography>
        ),
    },
    {
      field: 'setBy',
      headerName: 'Set by',
      flex: 1,
      minWidth: 140,
      valueGetter: (_, row) => row.origin?.SetBy ?? '',
    },
    {
      field: 'function',
      headerName: 'Function',
      width: 160,
      valueGetter: (_, row) =>
        row.origin?.Function !== row.origin?.SetBy ? (row.origin?.Function ?? '') : '',
    },
    {
      field: 'user',
      headerName: 'User',
      width: 160,
      valueGetter: (_, row) => row.origin?.User ?? '',
    },
    {
      field: 'where',
      headerName: 'Where',
      width: 200,
      valueGetter: (_, row) => originUnitLabel(row.origin),
      // A value set in this Unit is bold, and one set upstream is muted, so that the Unit's own
      // changes stand out from what it took from upstream.
      renderCell: (params) => {
        const origin = params.row.origin;
        if (!origin?.SpaceID || !origin.UnitID) return params.value;
        const local = setInThisUnit(params.row);
        const here = params.row.here;
        const title = local
          ? 'Set in this Unit'
          : `Set upstream in ${params.value}${here?.SetBy ? `, and brought here by ${here.SetBy}` : ''}`;
        return (
          <Tooltip title={title}>
            <Box
              component='span'
              sx={local ? { fontWeight: 600 } : { color: 'text.secondary' }}
            >
              <NavLink to={`/units/${origin.SpaceID}/${origin.UnitID}`}>
                {params.value}
              </NavLink>
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'revision',
      headerName: 'Rev',
      width: 70,
      type: 'number',
      valueGetter: (_, row) => row.origin?.RevisionNum ?? null,
      renderCell: (params) => {
        const origin = params.row.origin;
        if (!origin?.RevisionNum || !origin.SpaceID || !origin.UnitID)
          return params.value ?? '';
        return (
          <NavLink to={unitRevisionHref(origin.SpaceID, origin.UnitID, origin.RevisionNum)}>
            {origin.RevisionNum}
          </NavLink>
        );
      },
    },
    {
      field: 'mutation',
      headerName: 'Mut',
      width: 70,
      type: 'number',
      valueGetter: (_, row) => row.origin?.MutationNum ?? null,
    },
    {
      field: 'when',
      headerName: 'When',
      width: 130,
      valueGetter: (_, row) => row.origin?.When ?? '',
      renderCell: (params) =>
        params.value ? (
          <Tooltip title={dayjs(params.value).format('YYYY-MM-DD HH:mm:ss')}>
            <span>{dayjs(params.value).fromNow()}</span>
          </Tooltip>
        ) : (
          ''
        ),
    },
    {
      field: 'via',
      headerName: 'Via',
      width: 160,
      // The change in this Unit that brought a value set upstream.
      valueGetter: (_, row) =>
        (row.field.Chain ?? []).length > 1 ? (row.here?.SetBy ?? '') : '',
    },
    {
      field: 'changeOrder',
      headerName: 'ChangeOrder',
      width: 160,
      valueGetter: (_, row) => (row.here?.ChangeOrders ?? []).join(', '),
    },
  ]);
}

function columnsWithinResource(columns: GridColDef<BlameRow>[]): GridColDef<BlameRow>[] {
  return columns.map((column) =>
    column.sortable === false ? column : { ...column, getSortComparator: withinResource },
  );
}

type DialogKind =
  | ''
  | 'guard'
  | 'removeGuard'
  | 'applyConflicts'
  | 'dismissConflicts'
  | 'undismissConflicts'
  | 'setValue';

/** The Blame tab: what set each field of the Unit, and actions on the fields selected. */
export const BlameTable = ({ spaceId, unitId, initialPath = '' }: BlameTableProps) => {
  const dispatch = useAppDispatch();
  const [needsAttention, setNeedsAttention] = useState(false);
  const [includeComments, setIncludeComments] = useState(false);
  const [path, setPath] = useState(initialPath);
  const [resource, setResource] = useState('');
  const [flags, setFlags] = useState<string[]>([]);
  const [selected, setSelected] = useState<GridRowSelectionModel>([]);
  const [drawerField, setDrawerField] = useState<BlameField | undefined>(undefined);
  const [dialog, setDialog] = useState<DialogKind>('');
  const [errorMessage, setErrorMessage] = useState('');
  const [readErrorDismissed, setReadErrorDismissed] = useState(false);

  useEffect(() => setPath(initialPath), [initialPath]);

  const { data, error, isFetching } = useGetUnitBlameQuery(
    {
      spaceId,
      unitId,
      flags: needsAttention ? NEEDS_ATTENTION_FLAGS : undefined,
      includeComments,
    },
    { skip: !spaceId || !unitId },
  );

  const rows = useMemo(() => blameRows(data?.Fields), [data?.Fields]);
  const resources = useMemo(() => blameResources(rows), [rows]);
  const shownRows = useMemo(
    () => filterBlameRows(rows, { path, resource, flags }),
    [rows, path, resource, flags],
  );
  const navigate = useNavigate();
  // A validation flag opens the Overview tab at the first check that names the field, where the
  // checks are shown in full.
  const columns = useMemo(
    () =>
      buildColumns((field) =>
        navigate(unitOverviewHref(spaceId, unitId, field.Validation?.[0]?.Gate ?? '')),
      ),
    [navigate, spaceId, unitId],
  );
  const selectedFields = useMemo(() => {
    const ids = new Set(selected.map(String));
    return rows.filter((row) => ids.has(row.id) && !row.placeholder).map((row) => row.field);
  }, [rows, selected]);

  const [setProtection, { isLoading: isProtecting }] = useSetUnitProtectionMutation();
  const [setGuard, { isLoading: isGuarding }] = useSetUnitGuardMutation();
  const [resolveConflicts, { isLoading: isResolving }] = useResolveUnitConflictsMutation();
  const [invokeFunctions, { isLoading: isInvoking }] = useInvokeFunctionsOnOrgMutation();
  const busy = isProtecting || isGuarding || isResolving || isInvoking;

  const done = (message: string) => {
    setDialog('');
    setSelected([]);
    dispatch(setAlert({ message, type: 'success', isOpen: true }));
  };
  const failed = (err: unknown, fallback: string) =>
    setErrorMessage(getApiErrorMessage(err, fallback));

  const onProtect = async (protect: boolean) => {
    try {
      await setProtection({
        spaceId,
        unitId,
        unitProtectionRequest: {
          ResourceProtection: protectionRequest(selectedFields, protect),
        },
      }).unwrap();
      done(
        protect
          ? 'The selected fields and resources are kept on merge'
          : 'Merges may update the selected fields and resources',
      );
    } catch (err) {
      failed(err, 'Failed to set protection');
    }
  };

  const onDismissConflicts = async (permanent: boolean) => {
    try {
      const result = await resolveConflicts({
        spaceId,
        unitId,
        unitConflictsRequest: permanent
          ? {
              Action: 'Dismiss',
              Permanent: true,
              Select: permanentDismissalSelectors(selectedFields),
            }
          : { Action: 'Dismiss', Select: conflictSelectors(selectedFields) },
      }).unwrap();
      const dismissed = `Dismissed ${result.Dismissed ?? 0} conflict${result.Dismissed === 1 ? '' : 's'}`;
      done(permanent ? `${dismissed}, and later merges will dismiss them too` : dismissed);
    } catch (err) {
      failed(err, 'Failed to dismiss the conflicts');
    }
  };

  const onUndismissConflicts = async () => {
    try {
      const result = await resolveConflicts({
        spaceId,
        unitId,
        unitConflictsRequest: {
          Action: 'Undismiss',
          Select: undismissSelectors(selectedFields),
        },
      }).unwrap();
      const removed = result.Removed ?? 0;
      done(
        `Removed ${removed} conflict dismissal${removed === 1 ? '' : 's'}; later merges will report those conflicts again`,
      );
    } catch (err) {
      failed(err, 'Failed to undismiss the conflicts');
    }
  };

  const customToolbarActions = (
    <>
      <Tooltip title='A merge from upstream leaves these values alone'>
        <span>
          <Button
            size='small'
            disabled={busy || !blameActionApplies.protect(selectedFields)}
            onClick={() => onProtect(true)}
          >
            Keep on merge
          </Button>
        </span>
      </Tooltip>
      <Button
        size='small'
        disabled={busy || !blameActionApplies.unprotect(selectedFields)}
        onClick={() => onProtect(false)}
      >
        Let merges update this
      </Button>
      <Button
        size='small'
        disabled={busy || !blameActionApplies.guard(selectedFields)}
        onClick={() => setDialog('guard')}
      >
        Set guard
      </Button>
      <Button
        size='small'
        disabled={busy || !blameActionApplies.removeGuard(selectedFields)}
        onClick={() => setDialog('removeGuard')}
      >
        Remove guard
      </Button>
      <Button
        size='small'
        disabled={busy || !blameActionApplies.conflicts(selectedFields)}
        onClick={() => setDialog('applyConflicts')}
      >
        Apply conflicts
      </Button>
      <Button
        size='small'
        disabled={busy || !blameActionApplies.conflicts(selectedFields)}
        onClick={() => setDialog('dismissConflicts')}
      >
        Dismiss conflicts
      </Button>
      <Button
        size='small'
        disabled={busy || !blameActionApplies.undismiss(selectedFields)}
        onClick={() => setDialog('undismissConflicts')}
      >
        Undismiss conflicts
      </Button>
      <Button
        size='small'
        disabled={busy || !blameActionApplies.setValue(selectedFields)}
        onClick={() => setDialog('setValue')}
      >
        Set value
      </Button>
    </>
  );

  return (
    <Box data-testid='blame-tab'>
      <ErrorBox sx={{ mb: 1 }} error={errorMessage} onClose={() => setErrorMessage('')} />
      {error && !readErrorDismissed && (
        <ErrorBox
          sx={{ mb: 1 }}
          error={getApiErrorMessage(error, 'Failed to read what set each field')}
          onClose={() => setReadErrorDismissed(true)}
        />
      )}
      <Stack
        direction='row'
        spacing={2}
        alignItems='center'
        flexWrap='wrap'
        useFlexGap
        sx={{ mb: 1 }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={needsAttention}
              onChange={(e) => setNeedsAttention(e.target.checked)}
            />
          }
          label='Needs attention'
        />
        <TextField
          size='small'
          label='Path contains'
          value={path}
          onChange={(e) => setPath(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        <TextField
          select
          size='small'
          label='Resource'
          value={resource}
          onChange={(e) => setResource(e.target.value)}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value=''>All resources</MenuItem>
          {resources.map((r) => (
            <MenuItem key={r} value={r}>
              {r}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Checkbox
              checked={includeComments}
              onChange={(e) => setIncludeComments(e.target.checked)}
            />
          }
          label='Show comments'
        />
      </Stack>
      <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap sx={{ mb: 1 }}>
        {BLAME_FLAGS.map((flag) => {
          const on = flags.includes(flag.code);
          return (
            <BlameFlagChip
              key={flag.code}
              code={flag.code}
              selected={on}
              onClick={() =>
                setFlags(on ? flags.filter((f) => f !== flag.code) : [...flags, flag.code])
              }
            />
          );
        })}
      </Stack>
      <EntityDataGrid
        rows={shownRows}
        columns={columns}
        loading={isFetching}
        checkboxSelection
        disableRowSelectionOnClick
        initialState={{ columns: { columnVisibilityModel: HIDDEN_COLUMNS } }}
        rowSelectionModel={selected}
        onRowSelectionModelChange={setSelected}
        customToolbarActions={customToolbarActions}
        sx={resourceRowSx}
        rowClassName={(row) => (row.isResource ? RESOURCE_ROW_CLASS : undefined)}
        isRowSelectable={(row) => !row.placeholder}
        onRowClick={(params) => {
          const row = params.row as BlameRow;
          if (!row.placeholder) setDrawerField(row.field);
        }}
        hasNoData={!isFetching && rows.length === 0}
        emptyState={
          <Typography variant='body2' color='text.secondary' sx={{ p: 2 }}>
            {needsAttention ? 'No field needs attention.' : 'The Unit has no configuration.'}
          </Typography>
        }
      />
      <BlamePathDrawer
        spaceId={spaceId}
        unitId={unitId}
        field={drawerField}
        onClose={() => setDrawerField(undefined)}
      />
      <GuardDialog
        open={dialog === 'guard'}
        busy={busy}
        onClose={() => setDialog('')}
        onSubmit={async (key, value) => {
          try {
            await setGuard({
              spaceId,
              unitId,
              unitGuardRequest: {
                ResourceGuards: guardSetRequest(selectedFields, key, value),
              },
            }).unwrap();
            done(`Guard ${key} set on the selected fields`);
          } catch (err) {
            failed(err, 'Failed to set the guard');
          }
        }}
      />
      <RemoveGuardDialog
        open={dialog === 'removeGuard'}
        busy={busy}
        keys={guardKeys(selectedFields)}
        onClose={() => setDialog('')}
        onSubmit={async (key, clearance) => {
          try {
            await setGuard({
              spaceId,
              unitId,
              unitGuardRequest: {
                ResourceGuards: guardRemoveRequest(selectedFields, key),
                // Retiring a guard is a write to a guarded path, so it is cleared for the guard's
                // own values.
                Clearance: clearance ? [{ Key: key, Operator: 'Exists' }] : undefined,
              },
            }).unwrap();
            done(`Guard ${key} removed from the selected fields`);
          } catch (err) {
            failed(err, 'Failed to remove the guard');
          }
        }}
      />
      <ApplyConflictsDialog
        open={dialog === 'applyConflicts'}
        busy={busy}
        onClose={() => setDialog('')}
        preview={async () =>
          (
            await resolveConflicts({
              spaceId,
              unitId,
              unitConflictsRequest: {
                Action: 'Apply',
                DryRun: true,
                Select: conflictSelectors(selectedFields),
              },
            }).unwrap()
          ).Diff
        }
        onSubmit={async () => {
          try {
            const result = await resolveConflicts({
              spaceId,
              unitId,
              unitConflictsRequest: {
                Action: 'Apply',
                Select: conflictSelectors(selectedFields),
              },
            }).unwrap();
            done(
              `Applied ${result.Applied ?? 0} withheld change${result.Applied === 1 ? '' : 's'}`,
            );
          } catch (err) {
            failed(err, 'Failed to apply the conflicts');
          }
        }}
      />
      <DismissConflictsDialog
        open={dialog === 'dismissConflicts'}
        busy={busy}
        conflicts={permanentDismissalSelectors(selectedFields)}
        onClose={() => setDialog('')}
        onSubmit={onDismissConflicts}
      />
      <UndismissConflictsDialog
        open={dialog === 'undismissConflicts'}
        busy={busy}
        fields={selectedFields}
        onClose={() => setDialog('')}
        onSubmit={onUndismissConflicts}
      />
      <SetValueDialog
        open={dialog === 'setValue'}
        busy={busy}
        field={selectedFields[0]}
        onClose={() => setDialog('')}
        onSubmit={async (value, description, keep) => {
          const field = selectedFields[0];
          if (!field) return;
          try {
            const results = await invokeFunctions({
              executorSpace: spaceId,
              where: `UnitID = '${unitId}'`,
              protect: keep || undefined,
              functionInvocationsRequest: setValueRequest(field, value, description),
            }).unwrap();
            const unitError = results?.find((result) => result.Error)?.Error;
            if (unitError) {
              setErrorMessage(unitError.Message ?? 'Failed to set the value');
              return;
            }
            done(`${field.Path} set`);
          } catch (err) {
            failed(err, 'Failed to set the value');
          }
        }}
      />
    </Box>
  );
};

const GuardDialog = ({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (key: string, value: string) => void;
}) => {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>Set guard</DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          A guard records why a value is what it is. An operation must be cleared for it to
          overwrite the value.
        </Typography>
        <Stack spacing={2}>
          <TextField
            size='small'
            label='Key'
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder='owner'
          />
          <TextField
            size='small'
            label='Value'
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='platform'
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          disabled={busy || key === '' || value === ''}
          onClick={() => onSubmit(key, value)}
        >
          Set guard
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const RemoveGuardDialog = ({
  open,
  busy,
  keys,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  keys: string[];
  onClose: () => void;
  onSubmit: (key: string, clearance: boolean) => void;
}) => {
  const [key, setKey] = useState<string | null>(null);
  const [clearance, setClearance] = useState(true);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>Remove guard</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Autocomplete
            options={keys}
            value={key}
            onChange={(_, v) => setKey(v)}
            renderInput={(params) => <TextField {...params} size='small' label='Key' />}
          />
          <FormControlLabel
            control={
              <Checkbox checked={clearance} onChange={(e) => setClearance(e.target.checked)} />
            }
            label='Clear the removal for the guard, saying its reason is understood'
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          disabled={busy || !key}
          onClick={() => key && onSubmit(key, clearance)}
        >
          Remove guard
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ApplyConflictsDialog = ({
  open,
  busy,
  onClose,
  preview,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  preview: () => Promise<ConfigDiff | undefined>;
  onSubmit: () => void;
}) => {
  const [diff, setDiff] = useState<ConfigDiff | undefined>(undefined);
  const [previewError, setPreviewError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) {
      setDiff(undefined);
      setPreviewError('');
      return;
    }
    setLoading(true);
    preview()
      .then(setDiff)
      .catch((err) =>
        setPreviewError(getApiErrorMessage(err, 'Failed to preview the withheld changes')),
      )
      .finally(() => setLoading(false));
    // The preview is asked for once each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='lg'>
      <DialogTitle>Apply withheld upstream changes</DialogTitle>
      <DialogContent>
        <ErrorBox error={previewError} onClose={() => setPreviewError('')} />
        {loading && <Typography variant='body2'>Previewing…</Typography>}
        {!loading &&
          diff &&
          ((diff.Resources ?? []).length > 0 ? (
            <ConfigDiffView diff={diff} hideContext />
          ) : (
            <Typography variant='body2'>
              Applying these conflicts changes nothing in the configuration.
            </Typography>
          ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          disabled={busy || loading || previewError !== ''}
          onClick={onSubmit}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Dismissing drops the selected conflicts. Checked, it also records them on the Unit, so that a
 * later merge reporting the same conflict leaves it dismissed rather than outstanding.
 */
const DismissConflictsDialog = ({
  open,
  busy,
  conflicts,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  conflicts: UnitConflictSelector[];
  onClose: () => void;
  onSubmit: (permanent: boolean) => void;
}) => {
  const [permanent, setPermanent] = useState(false);
  useEffect(() => {
    if (open) setPermanent(false);
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='md'>
      <DialogTitle>Dismiss conflicts</DialogTitle>
      <DialogContent>
        <Stack spacing={0.5} sx={{ mb: 2 }} data-testid='dismiss-conflicts-list'>
          {conflicts.map((conflict) => (
            <Typography
              key={[
                conflict.ResourceType,
                conflict.ResourceName,
                conflict.Path,
                conflict.Reason,
                ...(conflict.Guards ?? []),
              ].join('\u0000')}
              variant='body2'
              sx={{ ...monoSx, wordBreak: 'break-all' }}
            >
              {[
                conflict.Reason,
                `${conflict.ResourceType} ${conflict.ResourceName}`,
                conflict.Path || '(whole resource)',
                (conflict.Guards ?? []).length > 0
                  ? `guard ${(conflict.Guards ?? []).join(', ')}`
                  : '',
              ]
                .filter(Boolean)
                .join('  ')}
            </Typography>
          ))}
        </Stack>
        <FormControlLabel
          control={
            <Checkbox checked={permanent} onChange={(e) => setPermanent(e.target.checked)} />
          }
          label='Also dismiss them whenever a later merge reports them'
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          disabled={busy || conflicts.length === 0}
          onClick={() => onSubmit(permanent)}
        >
          Dismiss
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Undismissing removes the conflict dismissals recorded for the selected rows, so that a later merge
 * reports those conflicts again. Each is listed where it is recorded.
 */
const UndismissConflictsDialog = ({
  open,
  busy,
  fields,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  fields: readonly BlameField[];
  onClose: () => void;
  onSubmit: () => void;
}) => {
  const lines = Array.from(
    new Set(
      fields.flatMap((field) =>
        (field.ConflictDismissals ?? []).map(
          (dismissal) =>
            `${conflictDismissalText(dismissal)}  (${field.ResourceType} ${field.ResourceName})`,
        ),
      ),
    ),
  );
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='md'>
      <DialogTitle>Undismiss conflicts</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ mb: 1 }}>
          Later merges will report these conflicts again.
        </Typography>
        <Stack spacing={0.5} data-testid='undismiss-conflicts-list'>
          {lines.map((line) => (
            <Typography key={line} variant='body2' sx={{ ...monoSx, wordBreak: 'break-all' }}>
              {line}
            </Typography>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant='contained' disabled={busy || lines.length === 0} onClick={onSubmit}>
          Undismiss
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const SetValueDialog = ({
  open,
  busy,
  field,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  field?: BlameField;
  onClose: () => void;
  onSubmit: (value: string, description: string, keep: boolean) => void;
}) => {
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [keep, setKeep] = useState(false);
  useEffect(() => {
    if (open) {
      setValue((field?.Value ?? '').trim());
      setDescription('');
      setKeep(false);
    }
  }, [open, field?.Value]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>Set value</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ ...monoSx, mb: 2, wordBreak: 'break-all' }}>
          {field?.ResourceType} {field?.ResourceName} {field?.Path}
        </Typography>
        <Stack spacing={2}>
          <TextField
            label='Value (YAML)'
            value={value}
            onChange={(e) => setValue(e.target.value)}
            multiline
            minRows={1}
            maxRows={12}
            slotProps={{ input: { sx: monoSx } }}
          />
          <TextField
            size='small'
            label='Change description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FormControlLabel
            control={<Checkbox checked={keep} onChange={(e) => setKeep(e.target.checked)} />}
            label='Keep on merge'
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          disabled={busy || value === ''}
          onClick={() => onSubmit(value, description, keep)}
        >
          Set value
        </Button>
      </DialogActions>
    </Dialog>
  );
};
