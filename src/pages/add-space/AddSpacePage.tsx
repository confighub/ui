// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  AddLabelModal,
  IAddLabelInput,
  PropertyType,
} from '@/components/forms/add-label-modal/AddLabelModal';
import { LabelsAccordion } from '@/components/labels/LabelsAccordion';
import { ServerErrorBox } from '@/components/styled';
import { FullScreenDialog } from '@/components/styled';
import { useAnalytics } from '@/hooks/useAnalytics';
import { Space, useCreateSpaceMutation } from '@confighub/rtk-query';
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

export const AddSpacePage = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<Space>({
    defaultValues: {
      Slug: '',
      Labels: {},
      Annotations: {},
    },
  });

  const [createSpace, { isLoading, isSuccess, error, data }] = useCreateSpaceMutation();
  const { trackEntityCreated } = useAnalytics();
  const [serverError, setServerError] = useState<string>('');
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [isAddAnnotationModalOpen, setIsAddAnnotationModalOpen] = useState(false);

  useEffect(() => {
    if (isSuccess && data) {
      // Track space creation (no user input, only entity ID)
      trackEntityCreated({
        entity_type: ENTITY_TYPES.SPACE,
        entity_id: data.SpaceID || '',
      });
      reset();
      onClose?.();
    } else if (error) {
      // @ts-expect-error TODO:
      setServerError(error.data?.message || 'An error occurred');
    }
  }, [isSuccess, reset, error, data, trackEntityCreated]);

  const onLabelAdded = (label: IAddLabelInput, type = 'Labels' as PropertyType) => {
    // @ts-expect-error TODO:
    setValue(type, { ...watch(type), [label.key]: label.value });
  };

  const onLabelDeleted = (label: IAddLabelInput, type = 'Labels' as PropertyType) => {
    // @ts-expect-error TODO:
    const labels = watch(type);
    if (labels) {
      // @ts-expect-error TODO:
      delete labels[label.key];
      // @ts-expect-error TODO:
      setValue(type, labels);
    }
  };

  const onAnnotationAdded = (
    annotation: IAddLabelInput,
    type = 'annotations' as PropertyType,
  ) => {
    // @ts-expect-error TODO:
    setValue(type, { ...watch(type), [annotation.key]: annotation.value });
  };

  const onAnnotationDeleted = (
    annotation: IAddLabelInput,
    type = 'annotations' as PropertyType,
  ) => {
    // @ts-expect-error TODO:
    const annotations = watch(type);
    if (annotations) {
      // @ts-expect-error TODO:
      delete annotations[annotation.key];
      // @ts-expect-error TODO:
      setValue(type, annotations);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = (data: Space) => {
    const body = {
      space: {
        Slug: data.Slug,
        Labels: { ...data.Labels },
        Annotations: { ...data.Annotations },
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
              <LabelsAccordion
                onLabelAddClicked={() => setIsAddLabelModalOpen(true)}
                onLabelDeleted={onLabelDeleted}
                labels={watch('Labels') || {}}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <LabelsAccordion
                onLabelAddClicked={() => setIsAddAnnotationModalOpen(true)}
                onLabelDeleted={onAnnotationDeleted}
                type='Annotations'
                labels={watch('Annotations') || {}}
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
        <AddLabelModal
          isAddModalOpen={isAddLabelModalOpen}
          onAddModalClosed={() => setIsAddLabelModalOpen(false)}
          onLabelAdded={onLabelAdded}
        />
        <AddLabelModal
          isAddModalOpen={isAddAnnotationModalOpen}
          onAddModalClosed={() => setIsAddAnnotationModalOpen(false)}
          onLabelAdded={onAnnotationAdded}
          type='Annotations'
        />
      </DialogContent>
    </FullScreenDialog>
  );
};
