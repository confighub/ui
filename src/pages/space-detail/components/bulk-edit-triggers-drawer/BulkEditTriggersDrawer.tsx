// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Control, FieldErrors, UseFormWatch, UseFormSetValue, useForm } from 'react-hook-form';

import { type BulkMetadataChange, BulkMetadataCard } from '@/components/bulk-edit/BulkMetadataCard';
import { bulkMetadataPatch, isBulkMetadataEditEmpty } from '@/components/bulk-edit/bulkMetadataEdit';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { runChunkedBulkWrite } from '@/hooks/chunkedBulkWrite';
import { getApiErrorMessage } from '@/utility/error-functions';
import { TriggerRead, useBulkPatchTriggersMutation } from '@confighub/rtk-query';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

// Types
export interface BulkEditTriggersFormData {
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

const NO_METADATA_CHANGE: BulkMetadataChange = { edit: {}, valid: true };

export const BulkEditTriggersDrawer = ({
  onClose,
  triggersToEdit = [],
  isOpen = false,
  refresh,
}: BulkEditTriggersDrawerProps) => {
  const [errorMessage, setErrorMessage] = useState<string[]>([]);
  const [bulkPatchTriggers] = useBulkPatchTriggersMutation();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [metadata, setMetadata] = useState(NO_METADATA_CHANGE);

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
      disabled: '',
      warn: '',
    },
  });

  const handleClose = () => {
    reset();
    setMetadata(NO_METADATA_CHANGE);
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
        ...bulkMetadataPatch(metadata.edit),
      };

      // A selection can be every Trigger in the organization, so it is patched in chunks.
      const failures = await runChunkedBulkWrite(
        'TriggerID',
        triggersToEdit.flatMap((trigger) => (trigger.TriggerID ? [trigger.TriggerID] : [])),
        (where) =>
          bulkPatchTriggers({
            where,
            body: updateData,
            // The selection names each Trigger by ID, so a hidden one shown in the list is written too.
            includeHidden: '*',
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
    !isBulkMetadataEditEmpty(metadata.edit) ||
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
            <BulkMetadataCard entities={triggersToEdit} onChange={setMetadata} />
          </Stack>
        </Box>

        {/* Fixed Submit Button */}
        <FixedSubmitContainer>
          <Button
            variant='contained'
            fullWidth
            disabled={!hasChanges || !metadata.valid || isSubmitting}
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
