// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Control, FieldErrors, UseFormWatch, UseFormSetValue, useForm } from 'react-hook-form';

import { ErrorList } from '@/components/error-list/ErrorList';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { runChunkedBulkWrite } from '@/hooks/chunkedBulkWrite';
import { getApiErrorMessage } from '@/utility/error-functions';
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
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

// Types
export interface BulkEditTriggersFormData {
  labels: Array<{ key: string; value: string; id: string }>;
  removeLabels: Array<string>;
  deleteGates: Array<{ key: string; id: string }>;
  removeDeleteGates: Array<string>;
  /** What to set Disabled to on every selected Trigger; empty leaves each as it is */
  disabled: '' | 'enabled' | 'disabled';
  /** What to set Warn to on every selected Trigger; empty leaves each as it is */
  warn: '' | 'blocking' | 'warn';
}

/** How many of the Triggers have a flag set, as "2 disabled, 3 enabled". */
const flagCounts = (
  triggers: TriggerRead[],
  isSet: (trigger: TriggerRead) => boolean,
  setLabel: string,
  unsetLabel: string,
): string => {
  const set = triggers.filter(isSet).length;
  const unset = triggers.length - set;
  return [set > 0 ? `${set} ${setLabel}` : '', unset > 0 ? `${unset} ${unsetLabel}` : '']
    .filter(Boolean)
    .join(', ');
};

/**
 * StatusCard
 *
 * Sets Disabled and Warn on every selected Trigger, or leaves each as it is.
 */
const StatusCard = ({ watch, setValue, triggersToEdit = [] }: TriggerMetadataInputProps) => {
  const disabled = watch('disabled');
  const warn = watch('warn');
  return (
    <SectionCard title='Status'>
      <Stack spacing={2}>
        <Box>
          <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
            Disabled
          </Typography>
          <ToggleButtonGroup
            exclusive
            size='small'
            color='primary'
            value={disabled}
            onChange={(_, value: BulkEditTriggersFormData['disabled'] | null) =>
              value !== null && setValue('disabled', value)
            }
            data-testid='bulk-trigger-disabled'
          >
            <ToggleButton value=''>Leave as is</ToggleButton>
            <ToggleButton value='enabled'>Enabled</ToggleButton>
            <ToggleButton value='disabled'>Disabled</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
            Now: {flagCounts(triggersToEdit, (t) => !!t.Disabled, 'disabled', 'enabled')}
          </Typography>
        </Box>
        <Box>
          <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
            Warn
          </Typography>
          <ToggleButtonGroup
            exclusive
            size='small'
            color='primary'
            value={warn}
            onChange={(_, value: BulkEditTriggersFormData['warn'] | null) =>
              value !== null && setValue('warn', value)
            }
            data-testid='bulk-trigger-warn'
          >
            <ToggleButton value=''>Leave as is</ToggleButton>
            <ToggleButton value='blocking'>Blocking</ToggleButton>
            <ToggleButton value='warn'>Warn</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
            Now: {flagCounts(triggersToEdit, (t) => !!t.Warn, 'warn', 'blocking')}. A failed
            validation by a Blocking Trigger is a validation error, which blocks Releases; by a
            Warn Trigger, a validation warning, which blocks nothing.
          </Typography>
        </Box>
      </Stack>
    </SectionCard>
  );
};

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
  const [bulkPatchTriggers] = useBulkPatchTriggersMutation();

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
      disabled: '',
      warn: '',
    },
  });

  const handleClose = () => {
    reset();
    setErrorMessage([]);
    onClose();
  };

  const watchedValues = watch();

  const onSubmit = async (data: BulkEditTriggersFormData) => {
    setIsSubmitting(true);

    try {
      const updateData = {
        ...(data.disabled ? { Disabled: data.disabled === 'disabled' } : {}),
        ...(data.warn ? { Warn: data.warn === 'warn' } : {}),
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

      // A selection can be every Trigger in the organization, so it is patched in chunks.
      const failures = await runChunkedBulkWrite(
        'TriggerID',
        triggersToEdit.flatMap((trigger) => (trigger.TriggerID ? [trigger.TriggerID] : [])),
        (where) =>
          bulkPatchTriggers({
            where,
            // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
            body: JSON.stringify(updateData),
          }).unwrap(),
        (error) => getApiErrorMessage(error, 'The Triggers could not be updated.'),
      );
      refresh?.();
      if (failures.length > 0) {
        setErrorMessage(failures);
      } else {
        handleClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges =
    (watchedValues.labels && watchedValues.labels.length > 0) ||
    (watchedValues.removeLabels && watchedValues.removeLabels.length > 0) ||
    (watchedValues.deleteGates && watchedValues.deleteGates.length > 0) ||
    (watchedValues.removeDeleteGates && watchedValues.removeDeleteGates.length > 0) ||
    !!watchedValues.disabled ||
    !!watchedValues.warn;

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
              Update the status, labels and delete gates of {triggersToEdit.length} selected triggers
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
          <Stack spacing={1}>
            <StatusCard
              control={control}
              errors={errors}
              watch={watch}
              setValue={setValue}
              triggersToEdit={triggersToEdit}
            />
            <UnifiedMetadataManagementCard
              control={control}
              errors={errors}
              watch={watch}
              setValue={setValue}
              triggersToEdit={triggersToEdit}
            />
          </Stack>
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
            }}
          >
            {isSubmitting ? 'Updating Triggers...' : 'Update Triggers'}
          </Button>
        </FixedSubmitContainer>
      </Box>
    </Drawer>
  );
};
