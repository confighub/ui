// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Control, FieldErrors, UseFormWatch, UseFormSetValue, useForm } from 'react-hook-form';

import { ErrorList } from '@/components/error-list/ErrorList';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { TriggerRead, useBulkPatchTriggersMutation } from '@confighub/rtk-query';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

// Types
export interface BulkEditTriggersFormData {
  labels: Array<{ key: string; value: string; id: string }>;
  removeLabels: Array<string>;
  deleteGates: Array<{ key: string; id: string }>;
  removeDeleteGates: Array<string>;
}

export interface TriggerMetadataInputProps {
  control: Control<BulkEditTriggersFormData>;
  errors: FieldErrors<BulkEditTriggersFormData>;
  watch: UseFormWatch<BulkEditTriggersFormData>;
  setValue: UseFormSetValue<BulkEditTriggersFormData>;
  triggersToEdit?: Array<TriggerRead>;
}

export interface BulkEditTriggersDrawerProps {
  onClose: () => void;
  triggersToEdit?: Array<TriggerRead>;
  isOpen?: boolean;
  refresh?: () => void;
}

/**
 * UnifiedMetadataManagementCard
 *
 * Consolidated interface for managing labels and delete gates
 */
const UnifiedMetadataManagementCard = ({
  watch,
  setValue,
  triggersToEdit = [],
}: TriggerMetadataInputProps) => {
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelValue, setNewLabelValue] = useState('');
  const [newDeleteGateKey, setNewDeleteGateKey] = useState('');

  const labels = watch('labels') || [];
  const removeLabels = watch('removeLabels') || [];
  const deleteGates = watch('deleteGates') || [];
  const removeDeleteGates = watch('removeDeleteGates') || [];

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

  // Get common items from selected triggers for removal suggestions
  const commonLabels = Object.keys(
    triggersToEdit.reduce(
      (acc, trigger) => {
        Object.keys(trigger.Labels || {}).forEach((key) => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).filter((key) => !removeLabels.includes(key));

  const commonDeleteGates = Object.keys(
    triggersToEdit.reduce(
      (acc, trigger) => {
        Object.keys(trigger.DeleteGates || {}).forEach((key) => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).filter((key) => !removeDeleteGates.includes(key));

  const hasAnyItems =
    labels.length > 0 ||
    removeLabels.length > 0 ||
    deleteGates.length > 0 ||
    removeDeleteGates.length > 0;

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
        </Box>
      )}
    </SectionCard>
  );
};

export const BulkEditTriggersDrawer = ({
  onClose,
  triggersToEdit = [],
  isOpen = false,
  refresh,
}: BulkEditTriggersDrawerProps) => {
  const [errorMessage, setErrorMessage] = useState<string[]>([]);
  const [bulkPatchTriggers, { error, isSuccess, data }] = useBulkPatchTriggersMutation();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BulkEditTriggersFormData>({
    mode: 'onChange',
    defaultValues: {
      labels: [],
      removeLabels: [],
      deleteGates: [],
      removeDeleteGates: [],
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

  const onSubmit = async (data: BulkEditTriggersFormData) => {
    setIsSubmitting(true);

    try {
      const triggerIds = triggersToEdit.map((trigger) => `'${trigger.TriggerID}'`).join(',');
      const where = `TriggerID IN (${triggerIds})`;

      const updateData = {
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
      };

      await bulkPatchTriggers({
        where,
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify(updateData),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges =
    (watchedValues.labels && watchedValues.labels.length > 0) ||
    (watchedValues.removeLabels && watchedValues.removeLabels.length > 0) ||
    (watchedValues.deleteGates && watchedValues.deleteGates.length > 0) ||
    (watchedValues.removeDeleteGates && watchedValues.removeDeleteGates.length > 0);

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
              Back to Triggers
            </Button>
          </Stack>
          <Stack spacing={1}>
            <Typography variant='h4' component='h1' sx={{ fontWeight: 600 }}>
              Bulk Edit Triggers
            </Typography>
            <Typography variant='body1' color='text.secondary'>
              Update labels and delete gates for {triggersToEdit.length} selected triggers
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
            <UnifiedMetadataManagementCard
              control={control}
              errors={errors}
              watch={watch}
              setValue={setValue}
              triggersToEdit={triggersToEdit}
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
            {isSubmitting ? 'Updating Triggers...' : 'Update Triggers'}
          </Button>
        </FixedSubmitContainer>
      </Box>
    </Drawer>
  );
};
