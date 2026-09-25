// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { ErrorList } from '@/components/error-list/ErrorList';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  UnitRead,
  useBulkPatchUnitsMutation,
  useCreateChangeSetMutation,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export interface CreateChangesetFormData {
  spaceId: string;
  name: string;
  description: string;
  changeDescription: string;
  tags: Array<{ displayName: string; id: string }>;
}

export interface CreateChangeSetAccordionProps {
  onClose: () => void;
  selectedUnits: UnitRead[];
  onSuccess: (changesetId: string, spaceId: string) => void;
  selectedUnitIds: string[];
}

export const CreateChangeSetAccordion = ({
  onClose,
  selectedUnits,
  onSuccess,
  selectedUnitIds,
}: CreateChangeSetAccordionProps) => {
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Create changeset mutation
  const [createChangeSet, { isSuccess, error }] = useCreateChangeSetMutation();
  const [bulkPatchUnits, { isSuccess: isPatchSuccess, error: isErrorSuccess }] =
    useBulkPatchUnitsMutation();

  const { spaces = [] } = useListSpacesQuery(
    {},
    {
      selectFromResult: (result) => ({
        spaces: result?.data?.map((space) => space.Space).filter(Boolean),
      }),
    },
  );

  // Form setup
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateChangesetFormData>({
    mode: 'onChange',
    defaultValues: {
      spaceId: '',
      name: '',
      description: '',
      changeDescription: '',
      tags: [],
    },
  });

  const watchedValues = watch();

  useApiErrorMessage(error, isSuccess, setErrorMessage, {
    onError: () => setIsSaving(false),
  });
  useApiErrorMessage(isErrorSuccess, isPatchSuccess, setErrorMessage);

  const handleClose = () => {
    reset();
    setErrorMessage('');
    onClose();
  };

  const handleCreate = async (formData: CreateChangesetFormData) => {
    try {
      setIsSaving(true);
      const result = await createChangeSet({
        spaceId: formData.spaceId,
        changeSet: {
          Slug: formData.name,
          DisplayName: formData.name,
          Description: formData.description,
        },
      });

      // Check if changeset was created successfully
      if ('data' in result && result.data?.ChangeSetID) {
        const changesetId = result.data.ChangeSetID;
        try {
          const unitIds = selectedUnitIds.map((id) => `'${id}'`).join(',');
          const patchResult = await bulkPatchUnits({
            where: `UnitID IN (${unitIds})`,
            changeSetId: changesetId,
            // @ts-expect-error TODO:
            body: JSON.stringify({
              ChangeSetID: changesetId,
              LastChangeDescription: formData.changeDescription || undefined,
            }),
          });

          if (patchResult.data) {
            // Pass the created changeset info back to parent
            onSuccess?.(changesetId, formData.spaceId);
            handleClose();
          }
        } catch (patchError) {
          console.error('Failed to patch units with changeset:', patchError);
          setIsSaving(false);
          // Don't fail the whole operation if patch fails
        } finally {
          setIsSaving(false);
        }
      }
    } catch (error) {
      console.error('Failed to create changeset:', error);
    }
  };

  const isFormValid = !!watchedValues.name && selectedUnits.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header section */}
      <Box
        sx={{
          bgcolor: 'grey.50',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography
          variant='caption'
          fontWeight={600}
          color='text.secondary'
          textTransform='uppercase'
        >
          Create Changeset
        </Typography>
      </Box>

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          backgroundColor: 'background.paper',
        }}
      >
        <ErrorList errors={[errorMessage]} onClose={() => setErrorMessage('')} />
        <Grid container spacing={1}>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {selectedUnitIds?.map((id) => {
              const unit = selectedUnits.find((u) => u.UnitID === id);

              return (
                <Box
                  key={unit?.UnitID}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    bgcolor: 'primary.main',
                    color: 'background.paper',
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <Typography variant='caption' fontWeight={600}>
                    {unit?.Slug?.toUpperCase() || 'Unknown'}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          {/* Basic Info Section */}
          <Grid size={{ xs: 12 }}>
            <Grid container spacing={1}>
              <Grid size={{ xs: 6 }}>
                <Controller
                  name='name'
                  control={control}
                  rules={{ required: 'Changeset name is required' }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      placeholder='release-v452'
                      size='small'
                      label='Changeset Name'
                      fullWidth
                      required
                      error={!!errors.name}
                      helperText={errors.name?.message}
                    />
                  )}
                />
              </Grid>

              <Grid size={{ xs: 6 }}>
                <Controller
                  name='spaceId'
                  control={control}
                  rules={{ required: 'Space is required' }}
                  render={({ field: { onChange, value, ...field } }) => (
                    <Autocomplete
                      {...field}
                      options={spaces}
                      getOptionLabel={(option) => option?.DisplayName || ''}
                      value={
                        spaces.find(
                          (space) =>
                            space?.SpaceID === (Array.isArray(value) ? value[0] : value),
                        ) || null
                      }
                      onChange={(_, newValue) => {
                        onChange(
                          newValue && typeof newValue === 'object' && 'SpaceID' in newValue
                            ? newValue.SpaceID
                            : '',
                        );
                      }}
                      renderOption={(props, option) => {
                        const { key, ...optionProps } = props;
                        return (
                          <li key={key} {...optionProps}>
                            {option?.DisplayName}
                          </li>
                        );
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder='Select a space...'
                          error={!!errors.spaceId}
                          helperText={errors.spaceId?.message}
                          size='small'
                          data-testid='space-select'
                        />
                      )}
                      size='small'
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Grid>

          {/* Description Section */}
          <Grid size={{ xs: 12 }}>
            <Controller
              name='changeDescription'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  placeholder='Brief summary of this change (e.g., Starting Release 452 rollout)'
                  size='small'
                  label='Change Summary'
                  fullWidth
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontSize: 14,
                      '&:hover fieldset': {
                        borderColor: 'primary.main',
                      },
                    },
                  }}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='description'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  placeholder='Provide details about what this changeset contains...'
                  size='small'
                  fullWidth
                  label='Description'
                  multiline
                  rows={4}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontSize: 14,
                      '&:hover fieldset': {
                        borderColor: 'primary.main',
                      },
                    },
                  }}
                />
              )}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Footer with action buttons */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: 'grey.50',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction='row' spacing={2} justifyContent='end' alignItems='center'>
          <Stack direction='row' spacing={2}>
            <Button variant='outlined' size='small' onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant='contained'
              size='small'
              onClick={handleSubmit(handleCreate)}
              disabled={!isFormValid || isSaving}
            >
              {isSaving ? 'Creating Changeset...' : 'Create Changeset'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
};
