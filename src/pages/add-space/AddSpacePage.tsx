// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { EnableBackingUnitField } from '@/components/backing-unit/EnableBackingUnitField';
import {
  type BackingUnitChoice,
  isBackingUnitChoiceComplete,
  NO_BACKING_UNIT,
} from '@/components/backing-unit/backingUnitChoice';
import { MapFieldSection } from '@/components/map-field-editor/MapFieldSection';
import { type MapRow, rowsToMap } from '@/components/map-field-editor/map-rows';
import { ServerErrorBox } from '@/components/styled';
import { FullScreenDialog } from '@/components/styled';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useCreateSpaceMutation } from '@confighub/rtk-query';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import CloseIcon from '@mui/icons-material/Close';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

const Container = styled('form')`
  width: 70%;
  margin-top: 10px;
`;

interface AddSpaceFormData {
  Slug: string;
  Labels: MapRow[];
  Annotations: MapRow[];
}

export const AddSpacePage = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AddSpaceFormData>({
    defaultValues: {
      Slug: '',
      Labels: [],
      Annotations: [],
    },
  });

  const [createSpace, { isLoading, isSuccess, error, data }] = useCreateSpaceMutation();
  const { trackEntityCreated } = useAnalytics();
  const [serverError, setServerError] = useState<string>('');
  const [backingUnit, setBackingUnit] = useState<BackingUnitChoice>(NO_BACKING_UNIT);

  useEffect(() => {
    if (isSuccess && data) {
      // Track space creation (no user input, only entity ID)
      trackEntityCreated({
        entity_type: ENTITY_TYPES.SPACE,
        entity_id: data.SpaceID || '',
      });
      reset();
      setBackingUnit(NO_BACKING_UNIT);
      onClose?.();
    } else if (error) {
      // @ts-expect-error TODO:
      setServerError(error.data?.message || 'An error occurred');
    }
  }, [isSuccess, reset, error, data, trackEntityCreated]);

  const handleClose = () => {
    reset();
    setBackingUnit(NO_BACKING_UNIT);
    onClose();
  };

  const onSubmit = (data: AddSpaceFormData) => {
    if (!isBackingUnitChoiceComplete(backingUnit, true)) {
      setServerError('Choose the Space to hold the backing Unit.');
      return;
    }
    const body = {
      ...(backingUnit.enabled ? { withBackingUnits: true, backingUnitSpace: backingUnit.spaceId } : {}),
      space: {
        Slug: data.Slug,
        Labels: rowsToMap(data.Labels),
        Annotations: rowsToMap(data.Annotations),
      },
    };

    createSpace(body);
  };

  return (
    <FullScreenDialog fullScreen open={open} onClose={handleClose}>
      <DialogTitle>
        <Breadcrumbs aria-label='breadcrumb'>
          <Typography variant='h5'>Spaces</Typography>
          <Typography variant='h5' sx={{ fontStyle: 'italic' }}>
            Add Space
          </Typography>
        </Breadcrumbs>
        <IconButton
          aria-label='close'
          onClick={handleClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Container onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <ServerErrorBox $display={!!serverError}>
                <Typography variant='caption'>Error: {serverError}</Typography>
                <IconButton
                  aria-label='close'
                  onClick={() => setServerError('')}
                  sx={{
                    color: (theme) => theme.palette.error.main,
                  }}
                  size='small'
                >
                  <CloseIcon />
                </IconButton>
              </ServerErrorBox>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Controller
                name='Slug'
                control={control}
                rules={{
                  required: 'Slug is required',
                  pattern: {
                    value: SLUG_PATTERN,
                    message: SLUG_PATTERN_MESSAGE,
                  },
                }}
                render={({ field }) => (
                  <TextField
                    fullWidth
                    label='Name'
                    size='small'
                    error={!!errors.Slug}
                    helperText={errors.Slug?.message}
                    {...field}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <EnableBackingUnitField value={backingUnit} onChange={setBackingUnit} needsSpace disabled={isLoading} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <MapFieldSection
                control={control}
                name='Labels'
                title='Labels'
                itemLabel='label'
                validation='label'
                keyPlaceholder='Environment'
                valuePlaceholder='production'
                testId='add-space-labels'
              />
              <MapFieldSection
                control={control}
                name='Annotations'
                title='Annotations'
                itemLabel='annotation'
                validation='annotation'
                multilineValues
                testId='add-space-annotations'
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Button
                disabled={isLoading}
                variant='contained'
                type='submit'
                fullWidth
              >
                Save
              </Button>
            </Grid>
          </Grid>
        </Container>
      </DialogContent>
    </FullScreenDialog>
  );
};
