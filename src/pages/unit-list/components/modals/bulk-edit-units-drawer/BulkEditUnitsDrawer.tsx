// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Control, Controller, FieldErrors, useForm } from 'react-hook-form';

import { type BulkMetadataChange, BulkMetadataCard } from '@/components/bulk-edit/BulkMetadataCard';
import {
  type BulkMapField,
  bulkMetadataPatch,
  isBulkMetadataEditEmpty,
} from '@/components/bulk-edit/bulkMetadataEdit';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { useBulkPatchUnitsMutation } from '@confighub/rtk-query';
import { IUnitMutationModalProps } from '@/types';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// Types
/** How the edit changes whether the Units are in their Space's Releases; '' leaves it as it is. */
export type BulkEditReleases = '' | 'include' | 'leaveOut';

export interface BulkEditFormData {
  releases: BulkEditReleases;
}

/**
 * ReleasesCard
 *
 * Sets Unreleasable on every Unit being edited. A Unit's release Target is its Space's, so the
 * Units' Target is changed on the Space, not here.
 */
const ReleasesCard = ({
  control,
  errors,
}: {
  control: Control<BulkEditFormData>;
  errors: FieldErrors<BulkEditFormData>;
}) => {
  return (
    <SectionCard title='Releases'>
      <Controller
        name='releases'
        control={control}
        render={({ field }) => (
          <FormControl fullWidth error={!!errors.releases} size='small'>
            <InputLabel>Releases</InputLabel>
            <Select
              {...field}
              label='Releases'
              size='small'
              input={<OutlinedInput label='Releases' />}
              data-testid='unreleasable-select'
            >
              <MenuItem value=''>
                <em>No change</em>
              </MenuItem>
              <MenuItem value='include'>Include in releases</MenuItem>
              <MenuItem value='leaveOut'>Leave out of releases (Unreleasable)</MenuItem>
            </Select>
            {errors.releases && <FormHelperText>{errors.releases.message}</FormHelperText>}
          </FormControl>
        )}
      />
    </SectionCard>
  );
};

const NO_METADATA_CHANGE: BulkMetadataChange = { edit: {}, valid: true };

const UNIT_METADATA_FIELDS: ReadonlyArray<BulkMapField> = ['Labels', 'DeleteGates', 'DestroyGates'];

export const BulkEditUnitsDrawer = ({
  onClose,
  unitsToEdit = [],
  isOpen = false,
  refresh,
}: IUnitMutationModalProps) => {
  const [errorMessage, setErrorMessage] = useState<string[]>([]);
  const [bulkPatchUnits, { error, isSuccess, data }] = useBulkPatchUnitsMutation();


  const [isSubmitting, setIsSubmitting] = useState(false);
  const [metadata, setMetadata] = useState(NO_METADATA_CHANGE);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<BulkEditFormData>({
    mode: 'onChange',
    defaultValues: {
      releases: '',
    },
  });

  const handleClose = () => {
    reset();
    setMetadata(NO_METADATA_CHANGE);
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
        ...(data.releases && { Unreleasable: data.releases === 'leaveOut' }),
        ...bulkMetadataPatch(metadata.edit),
      };

      await bulkPatchUnits({
        where,
        body: updateData,
        // The selection names each Unit by ID, so a hidden one shown in the list is written too.
        includeHidden: '*',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges = watchedValues.releases !== '' || !isBulkMetadataEditEmpty(metadata.edit);

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
              Update releases, labels, delete gates and destroy gates for {unitsToEdit.length}{' '}
              selected units
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
            <ReleasesCard control={control} errors={errors} />

            <BulkMetadataCard
              entities={unitsToEdit}
              fields={UNIT_METADATA_FIELDS}
              onChange={setMetadata}
            />
          </Box>
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
            {isSubmitting ? 'Updating Units...' : 'Update Units'}
          </Button>
        </FixedSubmitContainer>
      </Box>
    </Drawer>
  );
};
