// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { ErrorBox } from '@/components/error-box/ErrorBox';
import { MapFieldSection } from '@/components/map-field-editor/MapFieldSection';
import { type MapRow, rowsToMap } from '@/components/map-field-editor/map-rows';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  BridgeWorkerRead,
  CreateTargetApiArg,
  SpaceRead,
  TargetRead,
  useCreateTargetMutation,
  useListBridgeWorkersQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import { grantWorkerTargetAccess } from '@/utility/bridge-worker-utils';
// Removed service layer imports - using RTK Query directly
import CloseIcon from '@mui/icons-material/Close';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { FullScreenDialog } from '../../components/styled';

const Container = styled('form')`
  width: 70%;
  margin-top: 10px;
`;

interface AddTargetFormData {
  Slug: string;
  SpaceID: string;
  Labels: MapRow[];
  Annotations: MapRow[];
}

const emptyForm: AddTargetFormData = { Slug: '', SpaceID: '', Labels: [], Annotations: [] };

export interface IAddTargetPageProps {
  open: boolean;
  onClose: () => void;
  onTargetAdded?: (target: TargetRead) => void;
}

export const AddTargetPage = ({ open, onClose, onTargetAdded }: IAddTargetPageProps) => {
  const [errorMessage, setErrorMessage] = useState('');

  const [createTarget, { isSuccess, error, data: createResponse }] = useCreateTargetMutation();
  const { data: extendedSpaces = [] } = useListSpacesQuery({});
  const { trackEntityCreated } = useAnalytics();

  useApiErrorMessage(error, isSuccess, setErrorMessage, {
    onSuccess: () => {
      // Track target creation (only dropdown values, no user input)
      if (createResponse) {
        trackEntityCreated({
          entity_type: ENTITY_TYPES.TARGET,
          entity_id: createResponse.TargetID || '',
        });
      }
      onTargetAdded?.(createResponse as TargetRead);
      handleClose();
    },
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<AddTargetFormData>({
    defaultValues: emptyForm,
  });

  const watchedSpaceId = watch('SpaceID');
  const [accessWorkerId, setAccessWorkerId] = useState('');

  const spaces = extendedSpaces
    .map((es) => es.Space)
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  // Fetch bridge workers for the selected space
  const { data: extendedBridgeWorkers = [] } = useListBridgeWorkersQuery(
    { spaceId: watchedSpaceId || '' },
    { skip: !watchedSpaceId },
  );

  // Extract BridgeWorkerRead objects from ExtendedBridgeWorkerRead
  const bridgeWorkers = extendedBridgeWorkers
    .map((ebw) => ebw.BridgeWorker)
    .filter((bw): bw is BridgeWorkerRead => bw !== undefined);

  const accessWorker = useMemo(
    () => bridgeWorkers.find((bw) => bw.BridgeWorkerID === accessWorkerId),
    [bridgeWorkers, accessWorkerId],
  );

  const onSubmit = async (data: AddTargetFormData) => {
    const space = spaces?.find((space) => space.SpaceID === data.SpaceID) || ({} as SpaceRead);

    const input = {
      spaceId: data.SpaceID,
      target: {
        Labels: rowsToMap(data.Labels),
        Annotations: rowsToMap(data.Annotations),
        Slug: data.Slug,
        SpaceID: data.SpaceID,
        OrganizationID: space.OrganizationID || '',
        Permissions: grantWorkerTargetAccess(undefined, accessWorker),
      },
    } as CreateTargetApiArg;

    await createTarget(input);
  };

  const handleClose = () => {
    reset(emptyForm);
    setAccessWorkerId('');
    setErrorMessage('');
    onClose();
  };

  return (
    <FullScreenDialog fullScreen open={open} onClose={handleClose}>
      <DialogTitle>
        <Breadcrumbs aria-label='breadcrumb'>
          <Typography variant='h5'>Targets</Typography>
          <Typography variant='h5' sx={{ fontStyle: 'italic' }}>
            Add Target
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
              <ErrorBox error={errorMessage} onClose={() => setErrorMessage('')} />
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
                    error={!!errors.Slug}
                    helperText={errors.Slug?.message}
                    size='small'
                    {...field}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Controller
                name='SpaceID'
                control={control}
                rules={{ required: 'Space is required' }}
                render={({ field }) => (
                  <FormControl fullWidth size='small'>
                    <InputLabel>Space</InputLabel>
                    <Select
                      label='Space'
                      input={<OutlinedInput label='Space' />}
                      error={!!errors.SpaceID}
                      size='small'
                      {...field}
                    >
                      {spaces?.map((space) => (
                        <MenuItem key={space.SpaceID} value={space.SpaceID}>
                          {space.DisplayName}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth size='small'>
                <InputLabel shrink>Grant access to worker (optional)</InputLabel>
                <Select
                  value={accessWorkerId}
                  label='Grant access to worker (optional)'
                  input={<OutlinedInput label='Grant access to worker (optional)' notched />}
                  size='small'
                  disabled={!watchedSpaceId}
                  displayEmpty
                  onChange={(e) => setAccessWorkerId(e.target.value as string)}
                >
                  <MenuItem value=''>
                    <em>None</em>
                  </MenuItem>
                  {bridgeWorkers?.map((worker) => (
                    <MenuItem key={worker.BridgeWorkerID} value={worker.BridgeWorkerID}>
                      {worker.DisplayName}
                    </MenuItem>
                  ))}
                </Select>
                {!watchedSpaceId && <FormHelperText>Select a space first</FormHelperText>}
                {!!watchedSpaceId && (
                  <FormHelperText>
                    The worker can find the target and pull the releases published for it
                  </FormHelperText>
                )}
              </FormControl>
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
                testId='add-target-labels'
              />
              <MapFieldSection
                control={control}
                name='Annotations'
                title='Annotations'
                itemLabel='annotation'
                validation='annotation'
                multilineValues
                testId='add-target-annotations'
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Button variant='contained' type='submit' fullWidth>
                Save
              </Button>
            </Grid>
          </Grid>
        </Container>
      </DialogContent>
    </FullScreenDialog>
  );
};
