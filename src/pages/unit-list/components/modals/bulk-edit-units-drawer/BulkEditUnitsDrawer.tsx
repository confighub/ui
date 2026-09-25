// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Control, Controller, FieldErrors, UseFormWatch, useForm } from 'react-hook-form';
import { UseFormSetValue } from 'react-hook-form';

import { ErrorList } from '@/components/error-list/ErrorList';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import {
  TargetRead,
  UnitRead,
  useBulkPatchUnitsMutation,
  useListAllTargetsQuery,
} from '@confighub/rtk-query';
import { IUnitMutationModalProps } from '@/types';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

// Types
export interface BulkEditFormData {
  targetId: string;
  labels: Array<{ key: string; value: string; id: string }>;
  removeLabels: Array<string>;
  deleteGates: Array<{ key: string; id: string }>;
  removeDeleteGates: Array<string>;
  destroyGates: Array<{ key: string; id: string }>;
  removeDestroyGates: Array<string>;
}

export interface LabelInputProps {
  control: Control<BulkEditFormData>;
  errors: FieldErrors<BulkEditFormData>;
  watch: UseFormWatch<BulkEditFormData>;
  setValue: UseFormSetValue<BulkEditFormData>;
  unitsToEdit?: Array<UnitRead>;
}

/**
 * TargetSelectionCard
 *
 * Allows users to select a target for bulk assignment to units.
 */
const TargetSelectionCard = ({
  control,
  errors,
  targets,
}: {
  control: Control<BulkEditFormData>;
  errors: FieldErrors<BulkEditFormData>;
  targets: Array<TargetRead>;
}) => {
  return (
    <SectionCard title='Target'>
      <Controller
        name='targetId'
        control={control}
        render={({ field }) => (
          <FormControl fullWidth error={!!errors.targetId} size='small'>
            <InputLabel>Select Target</InputLabel>
            <Select
              {...field}
              label='Select Target'
              size='small'
              input={<OutlinedInput label='Select Target' />}
              data-testid='target-select'
            >
              <MenuItem value=''>
                <em>No change</em>
              </MenuItem>
              {targets.map((target) => (
                <MenuItem key={target.TargetID} value={target.TargetID}>
                  <Stack spacing={0.5}>
                    <Typography variant='body2' sx={{ fontWeight: 500 }}>
                      {target.Slug}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {target.ToolchainType}
                    </Typography>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
            {errors.targetId && <FormHelperText>{errors.targetId.message}</FormHelperText>}
          </FormControl>
        )}
      />
    </SectionCard>
  );
};

/**
 * UnifiedMetadataManagementCard
 *
 * Consolidated interface for managing labels, delete gates, and destroy gates
 */
const UnifiedMetadataManagementCard = ({
  watch,
  setValue,
  unitsToEdit = [],
}: LabelInputProps) => {
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelValue, setNewLabelValue] = useState('');
  const [newDeleteGateKey, setNewDeleteGateKey] = useState('');
  const [newDestroyGateKey, setNewDestroyGateKey] = useState('');

  const labels = watch('labels') || [];
  const removeLabels = watch('removeLabels') || [];
  const deleteGates = watch('deleteGates') || [];
  const removeDeleteGates = watch('removeDeleteGates') || [];
  const destroyGates = watch('destroyGates') || [];
  const removeDestroyGates = watch('removeDestroyGates') || [];

  const addLabel = () => {
    if (!newLabelKey.trim() || !newLabelValue.trim()) return;
    setValue('labels', [
      ...labels,
      {
        id: `${Date.now()}-${Math.random()}`,
        key: newLabelKey.trim(),
        value: newLabelValue.trim(),
      },
    ]);
    setNewLabelKey('');
    setNewLabelValue('');
  };

  const addDeleteGate = () => {
    if (!newDeleteGateKey.trim()) return;
    setValue('deleteGates', [
      ...deleteGates,
      { id: `${Date.now()}-${Math.random()}`, key: newDeleteGateKey.trim() },
    ]);
    setNewDeleteGateKey('');
  };

  const addDestroyGate = () => {
    if (!newDestroyGateKey.trim()) return;
    setValue('destroyGates', [
      ...destroyGates,
      { id: `${Date.now()}-${Math.random()}`, key: newDestroyGateKey.trim() },
    ]);
    setNewDestroyGateKey('');
  };

  // Get common items from selected units for removal suggestions
  const commonLabels = Object.keys(
    unitsToEdit.reduce(
      (acc, unit) => {
        Object.keys(unit.Labels || {}).forEach((key) => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).filter((key) => !removeLabels.includes(key));
  const commonDeleteGates = Object.keys(
    unitsToEdit.reduce(
      (acc, unit) => {
        Object.keys(unit.DeleteGates || {}).forEach((key) => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).filter((key) => !removeDeleteGates.includes(key));
  const commonDestroyGates = Object.keys(
    unitsToEdit.reduce(
      (acc, unit) => {
        Object.keys(unit.DestroyGates || {}).forEach((key) => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).filter((key) => !removeDestroyGates.includes(key));

  const hasAnyItems =
    labels.length > 0 ||
    removeLabels.length > 0 ||
    deleteGates.length > 0 ||
    removeDeleteGates.length > 0 ||
    destroyGates.length > 0 ||
    removeDestroyGates.length > 0;

  return (
    <SectionCard title='Metadata Management'>
      {/* Labels Section */}
      <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
        Labels
      </Typography>
      <Grid container spacing={1} sx={{ mb: 2 }}>
        <Grid size={{ xs: 5 }}>
          <Autocomplete
            freeSolo
            size='small'
            value={newLabelKey}
            options={commonLabels}
            onChange={(_, newValue) => setNewLabelKey(newValue || '')}
            onInputChange={(_, newInputValue) => setNewLabelKey(newInputValue)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addLabel();
            }}
            renderInput={(params) => <TextField {...params} placeholder='key' />}
          />
        </Grid>
        <Grid size={{ xs: 5 }}>
          <TextField
            size='small'
            fullWidth
            value={newLabelValue}
            onChange={(e) => setNewLabelValue(e.target.value)}
            placeholder='value'
            onKeyDown={(e) => e.key === 'Enter' && addLabel()}
          />
        </Grid>
        <Grid size={{ xs: 2 }}>
          <Button
            data-testid='add-label-button'
            variant='outlined'
            fullWidth
            startIcon={<Add />}
            onClick={addLabel}
            disabled={!newLabelKey.trim() || !newLabelValue.trim()}
            sx={{ height: '40px' }}
          >
            Add
          </Button>
        </Grid>
      </Grid>

      {/* Delete Gates Section */}
      <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
        Delete Gates
      </Typography>
      <Grid container spacing={1} sx={{ mb: 2 }}>
        <Grid size={{ xs: 10 }}>
          <Autocomplete
            freeSolo
            data-testid='delete-gate-autocomplete'
            size='small'
            value={newDeleteGateKey}
            options={commonDeleteGates}
            onChange={(_, newValue) => setNewDeleteGateKey(newValue || '')}
            onInputChange={(_, newInputValue) => setNewDeleteGateKey(newInputValue)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addDeleteGate();
            }}
            renderInput={(params) => (
              <TextField {...params} placeholder='e.g., manual-review' />
            )}
          />
        </Grid>
        <Grid size={{ xs: 2 }}>
          <Button
            data-testid='add-delete-gate-button'
            variant='outlined'
            fullWidth
            startIcon={<Add />}
            onClick={addDeleteGate}
            disabled={!newDeleteGateKey.trim()}
            sx={{ height: '40px' }}
          >
            Add
          </Button>
        </Grid>
      </Grid>

      {/* Destroy Gates Section */}
      <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
        Destroy Gates
      </Typography>
      <Grid container spacing={1} sx={{ mb: 2 }}>
        <Grid size={{ xs: 10 }}>
          <Autocomplete
            freeSolo
            size='small'
            data-testid='destroy-gate-autocomplete'
            value={newDestroyGateKey}
            options={commonDestroyGates}
            onChange={(_, newValue) => setNewDestroyGateKey(newValue || '')}
            onInputChange={(_, newInputValue) => setNewDestroyGateKey(newInputValue)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addDestroyGate();
            }}
            renderInput={(params) => (
              <TextField {...params} placeholder='e.g., production-protection' />
            )}
          />
        </Grid>
        <Grid size={{ xs: 2 }}>
          <Button
            data-testid='add-destroy-gate-button'
            variant='outlined'
            fullWidth
            startIcon={<Add />}
            onClick={addDestroyGate}
            disabled={!newDestroyGateKey.trim()}
            sx={{ height: '40px' }}
          >
            Add
          </Button>
        </Grid>
      </Grid>

      {/* All Changes Display */}
      {hasAnyItems && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {labels.map((l) => (
            <Chip
              key={l.id}
              label={`Label: ${l.key}: ${l.value}`}
              size='small'
              color='success'
              onDelete={() =>
                setValue(
                  'labels',
                  labels.filter((label) => label.id !== l.id),
                )
              }
            />
          ))}
          {removeLabels.map((key) => (
            <Chip
              key={`remove-label-${key}`}
              label={`Label: -${key}`}
              size='small'
              color='error'
              variant='outlined'
              onDelete={() =>
                setValue(
                  'removeLabels',
                  removeLabels.filter((k) => k !== key),
                )
              }
            />
          ))}
          {deleteGates.map((g) => (
            <Chip
              key={g.id}
              label={`Delete Gate: ${g.key}`}
              size='small'
              color='warning'
              onDelete={() =>
                setValue(
                  'deleteGates',
                  deleteGates.filter((gate) => gate.id !== g.id),
                )
              }
            />
          ))}
          {removeDeleteGates.map((key) => (
            <Chip
              key={`remove-delete-${key}`}
              label={`Delete Gate: -${key}`}
              size='small'
              color='error'
              variant='outlined'
              onDelete={() =>
                setValue(
                  'removeDeleteGates',
                  removeDeleteGates.filter((k) => k !== key),
                )
              }
            />
          ))}
          {destroyGates.map((g) => (
            <Chip
              key={g.id}
              label={`Destroy Gate: ${g.key}`}
              size='small'
              color='error'
              onDelete={() =>
                setValue(
                  'destroyGates',
                  destroyGates.filter((gate) => gate.id !== g.id),
                )
              }
            />
          ))}
          {removeDestroyGates.map((key) => (
            <Chip
              key={`remove-destroy-${key}`}
              label={`Destroy Gate: -${key}`}
              size='small'
              color='error'
              variant='outlined'
              onDelete={() =>
                setValue(
                  'removeDestroyGates',
                  removeDestroyGates.filter((k) => k !== key),
                )
              }
            />
          ))}
        </Box>
      )}
    </SectionCard>
  );
};

export const BulkEditUnitsDrawer = ({
  onClose,
  unitsToEdit = [],
  isOpen = false,
  refresh,
}: IUnitMutationModalProps) => {
  const [errorMessage, setErrorMessage] = useState<string[]>([]);
  const [bulkPatchUnits, { error, isSuccess, data }] = useBulkPatchUnitsMutation();

  const { targets = [] } = useListAllTargetsQuery(
    {},
    {
      selectFromResult: (result) => ({
        targets: result?.data?.map((t) => t.Target) || [],
      }),
    },
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BulkEditFormData>({
    mode: 'onChange',
    defaultValues: {
      targetId: '',
      labels: [],
      removeLabels: [],
      deleteGates: [],
      removeDeleteGates: [],
      destroyGates: [],
      removeDestroyGates: [],
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  useBulkApiErrorMessage(error, isSuccess, data, setErrorMessage, {
    onSuccess: () => {
      refresh?.();
      handleClose();
    },
  });

  const watchedValues = watch();

  const onSubmit = async (data: BulkEditFormData) => {
    setIsSubmitting(true);

    try {
      const unitIds = unitsToEdit.map((unit) => `'${unit.UnitID}'`).join(',');
      const where = `UnitID IN (${unitIds})`;

      const updateData = {
        ...(data.targetId && { TargetID: data.targetId }), // Conditionally add TargetID if it exists
        Labels: data.labels.reduce(
          (acc, label) => {
            acc[label.key] = label.value;
            return acc;
          },
          {} as Record<string, string>,
        ),
        DeleteGates: {
          // Add new delete gates
          ...data.deleteGates.reduce(
            (acc, gate) => {
              acc[gate.key] = true;
              return acc;
            },
            {} as Record<string, boolean>,
          ),
          // Remove delete gates by setting them to null
          ...data.removeDeleteGates.reduce(
            (acc, key) => {
              acc[key] = null;
              return acc;
            },
            {} as Record<string, null>,
          ),
        },
        DestroyGates: {
          // Add new destroy gates
          ...data.destroyGates.reduce(
            (acc, gate) => {
              acc[gate.key] = true;
              return acc;
            },
            {} as Record<string, boolean>,
          ),
          // Remove destroy gates by setting them to null
          ...data.removeDestroyGates.reduce(
            (acc, key) => {
              acc[key] = null;
              return acc;
            },
            {} as Record<string, null>,
          ),
        },
      };

      await bulkPatchUnits({
        where,
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify(updateData),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges =
    watchedValues.targetId !== '' ||
    (watchedValues.labels && watchedValues.labels.length > 0) ||
    (watchedValues.removeLabels && watchedValues.removeLabels.length > 0) ||
    (watchedValues.deleteGates && watchedValues.deleteGates.length > 0) ||
    (watchedValues.removeDeleteGates && watchedValues.removeDeleteGates.length > 0) ||
    (watchedValues.destroyGates && watchedValues.destroyGates.length > 0) ||
    (watchedValues.removeDestroyGates && watchedValues.removeDestroyGates.length > 0);

  return (
    <Drawer
      anchor='right'
      open={isOpen}
      onClose={handleClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: 1000 },
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction='row'>
            <Button
              startIcon={<ArrowBack />}
              onClick={handleClose}
              sx={{ color: 'text.secondary' }}
            >
              Back to Units
            </Button>
          </Stack>
          <Stack spacing={1}>
            <Typography variant='h4' component='h1' sx={{ fontWeight: 600 }}>
              Bulk Edit Units
            </Typography>
            <Typography variant='body1' color='text.secondary'>
              Update labels, delete gates, destroy gates, and target assignments for{' '}
              {unitsToEdit.length} selected units
            </Typography>
          </Stack>
        </Box>

        {/* Content */}
        <Box
          sx={{
            flex: 1,
            p: 3,
            backgroundColor: 'rgb(249, 250, 251)',
            paddingBottom: '100px', // Add space for fixed button
          }}
        >
          <ErrorList errors={errorMessage} onClose={() => setErrorMessage([])} />
          <Box>
            <TargetSelectionCard
              control={control}
              errors={errors}
              targets={targets.filter((t): t is TargetRead => t !== undefined)}
            />

            <UnifiedMetadataManagementCard
              control={control}
              errors={errors}
              watch={watch}
              setValue={setValue}
              unitsToEdit={unitsToEdit}
            />
          </Box>
        </Box>

        {/* Fixed Submit Button */}
        <FixedSubmitContainer>
          <Button
            variant='contained'
            fullWidth
            disabled={!hasChanges || isSubmitting}
            onClick={handleSubmit(onSubmit)}
            sx={{
              flexGrow: 1,
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateY(-1px)',
                boxShadow: '0 8px 25px rgba(25, 118, 210, 0.3)',
              },
            }}
          >
            {isSubmitting ? 'Updating Units...' : 'Update Units'}
          </Button>
        </FixedSubmitContainer>
      </Box>
    </Drawer>
  );
};
