// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { ErrorList } from '@/components/error-list/ErrorList';
import {
  type UnitRowItem,
  createUnitListRow,
} from '@/components/unit-data-grid/utils/data-grid-helpers';
import {
  type ExtendedUnitRead,
  useCreateLinkMutation,
  useListUnitsQuery,
} from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';

// ============================================================================
// COLUMNS
// ============================================================================

const COLUMNS: GridColDef<UnitRowItem>[] = [
  {
    field: 'Slug',
    headerName: 'Slug',
    flex: 1.5,
    minWidth: 160,
    valueGetter: (_, row) => row.Slug,
  },
  {
    field: 'Space',
    headerName: 'Space',
    flex: 1,
    minWidth: 120,
    valueGetter: (_, row) => row.Space,
  },
  {
    field: 'Target',
    headerName: 'Target',
    flex: 1,
    minWidth: 120,
    valueGetter: (_, row) => row.Target,
  },
  {
    field: 'ToolchainType',
    headerName: 'Toolchain',
    flex: 1,
    minWidth: 130,
    valueGetter: (_, row) => row.ToolchainType ?? '',
  },
];

// ============================================================================
// TYPES
// ============================================================================

export interface ILinkUnitModalProps {
  isOpen: boolean;
  unit: ExtendedUnitRead;
  onClose: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const LinkUnitModal = ({ isOpen, unit, onClose }: ILinkUnitModalProps) => {
  const [selectionModel, setSelectionModel] = useState<GridRowSelectionModel>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const spaceId = unit.Unit?.SpaceID ?? '';
  const currentUnitId = unit.Unit?.UnitID ?? '';

  const [createLink, { isLoading }] = useCreateLinkMutation();

  const { data: allUnits = [], isFetching } = useListUnitsQuery(
    { spaceId, include: 'SpaceID,TargetID,UnitEventID' },
    { skip: !spaceId },
  );

  const rows = useMemo(
    () =>
      allUnits
        .filter((u) => u.Unit?.UnitID !== currentUnitId)
        .map((u) => createUnitListRow(u)),
    [allUnits, currentUnitId],
  );

  const handleClose = () => {
    setSelectionModel([]);
    setErrors([]);
    onClose();
  };

  const handleConfirm = async () => {
    if (selectionModel.length === 0) return;
    setErrors([]);

    const selectedUnits = allUnits.filter((u) =>
      selectionModel.includes(u.Unit?.UnitID ?? ''),
    );

    try {
      const results = await Promise.allSettled(
        selectedUnits.map((targetUnit) =>
          createLink({
            spaceId,
            link: {
              Slug: '',
              FromUnitID: currentUnitId,
              ToUnitID: targetUnit.Unit?.UnitID ?? '',
              ToSpaceID: targetUnit.Unit?.SpaceID ?? '',
              // Named rather than left to the legacy default: a Link with no UpdateType
              // meant NeedsProvides resolved automatically, which is what this creates.
              UpdateType: 'NeedsProvides',
              AutoUpdate: true,
            },
          }).unwrap(),
        ),
      );

      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      if (failures.length > 0) {
        const messages = failures.map((f) => {
          const reason = f.reason as { data?: { message?: string } };
          return reason?.data?.message ?? 'Unknown error';
        });
        setErrors(messages);
      } else {
        handleClose();
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to create links']);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      sx={{ '& .MuiDialog-paper': { width: '100%', maxWidth: 1000 } }}
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 2 } } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction='row' alignItems='center' gap={1}>
          <Typography variant='h6' component='span'>
            Link to upstream
          </Typography>
        </Stack>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
          Select units to act as upstream producers for{' '}
          <Box component='span' fontWeight={600} color='text.primary'>
            {unit.Unit?.Slug}
          </Box>
          . On each apply, config data flows from the selected upstream units into this one —
          keeping it in sync automatically.
        </Typography>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 2 }}>
        {errors.length > 0 && (
          <Box sx={{ px: 2.5, pt: 1.5 }}>
            <ErrorList errors={errors} onClose={() => setErrors([])} />
          </Box>
        )}

        <Box sx={{ height: 420 }}>
          <EntityDataGrid
            rows={rows}
            columns={COLUMNS}
            loading={isFetching}
            checkboxSelection
            disableRowSelectionOnClick
            rowSelectionModel={selectionModel}
            onRowSelectionModelChange={(model) => setSelectionModel(model)}
            disableToolbar
            density='compact'
          />
        </Box>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 2.5, py: 1.5, justifyContent: 'space-between' }}>
        <Typography variant='caption' color='text.secondary'>
          {selectionModel.length > 0
            ? `${selectionModel.length} unit${selectionModel.length !== 1 ? 's' : ''} selected`
            : 'Select units to link'}
        </Typography>
        <Stack direction='row' spacing={1}>
          <Button onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant='contained'
            onClick={() => void handleConfirm()}
            disabled={selectionModel.length === 0 || isLoading}
            startIcon={isLoading && <CircularProgress size={14} color='inherit' />}
            sx={{ minWidth: 110 }}
          >
            {isLoading
              ? 'Linking…'
              : `Link${selectionModel.length > 1 ? ` ${selectionModel.length} units` : ''}`}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};
