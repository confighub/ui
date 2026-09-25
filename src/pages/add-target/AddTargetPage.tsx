// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { ErrorBox } from '@/components/error-box/ErrorBox';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useKeyValueHandlers } from '@/hooks/useKeyValueHandlers';
import {
  BridgeWorkerRead,
  CreateTargetApiArg,
  SpaceRead,
  Target,
  TargetRead,
  useCreateTargetMutation,
  useListBridgeWorkersQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import {
  DEFAULT_WORKERLESS_PROVIDER,
  DEFAULT_WORKERLESS_TOOLCHAIN,
  WORKERLESS_PROVIDER_TYPES,
  getAvailableBridges,
  getToolchainsForProvider,
  getWorkerlessToolchains,
} from '@/utility/bridge-worker-utils';
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

import { AddLabelModal } from '../../components/forms/add-label-modal/AddLabelModal';
import { LabelsAccordion } from '../../components/labels/LabelsAccordion';
import { FullScreenDialog } from '../../components/styled';

const Container = styled('form')`
  width: 70%;
  margin-top: 10px;
`;

export interface IAddTargetPageProps {
  open: boolean;
  onClose: () => void;
  onTargetAdded?: (target: TargetRead) => void;
}

export const AddTargetPage = ({ open, onClose, onTargetAdded }: IAddTargetPageProps) => {
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [isAddAnnotationsModalOpen, setIsAddAnnotationsModalOpen] = useState(false);
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
          provider_type: createResponse.ProviderType || '',
          toolchain_type: createResponse.ToolchainType || '',
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
    setValue,
    reset,
  } = useForm<Target>({
    defaultValues: {
      BridgeWorkerID: '',
      Slug: '',
      Parameters: '',
      ProviderType: DEFAULT_WORKERLESS_PROVIDER,
      ToolchainType: DEFAULT_WORKERLESS_TOOLCHAIN,
      SpaceID: '',
      Labels: {},
      Annotations: {},
    },
  });

  const { labelHandlers, annotationHandlers } = useKeyValueHandlers(setValue, watch);

  const watchedSpaceId = watch('SpaceID');
  const watchedBridgeWorkerId = watch('BridgeWorkerID');
  const watchedProviderType = watch('ProviderType');

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

  const selectedWorker = useMemo(
    () => bridgeWorkers.find((bw) => bw.BridgeWorkerID === watchedBridgeWorkerId),
    [bridgeWorkers, watchedBridgeWorkerId],
  );

  const workerSelected = !!watchedBridgeWorkerId && !!selectedWorker;

  // Without a worker there is no ProvidedInfo to derive the pickers from, so offer
  // the pull-based defaults instead of disabling them.
  const providerOptions = useMemo(
    () =>
      watchedBridgeWorkerId
        ? getAvailableBridges(selectedWorker?.ProvidedInfo)
        : WORKERLESS_PROVIDER_TYPES,
    [watchedBridgeWorkerId, selectedWorker],
  );

  const toolchainOptions = useMemo(
    () =>
      watchedBridgeWorkerId
        ? getToolchainsForProvider(selectedWorker?.ProvidedInfo, watchedProviderType)
        : getWorkerlessToolchains(watchedProviderType),
    [watchedBridgeWorkerId, selectedWorker, watchedProviderType],
  );

  const onSubmit = async (data: Target) => {
    const space = spaces?.find((space) => space.SpaceID === data.SpaceID) || ({} as SpaceRead);

    let parameters = '{}';

    try {
      // Attempt to parse the parameters to ensure it's valid JSON
      parameters = JSON.stringify(JSON.parse(data.Parameters || ''));
    } catch (error) {
      console.log(error);
    }

    const input = {
      spaceId: data.SpaceID,
      target: {
        BridgeWorkerID: data.BridgeWorkerID || undefined,
        Labels: data.Labels,
        Annotations: data.Annotations,
        Parameters: parameters,
        Slug: data.Slug,
        SpaceID: data.SpaceID,
        OrganizationID: space.OrganizationID || '',
        ToolchainType: data.ToolchainType,
        ProviderType: data.ProviderType,
      },
    } as CreateTargetApiArg;

    await createTarget(input);
  };

  const handleClose = () => {
    reset({
      BridgeWorkerID: '',
      Slug: '',
      Parameters: '',
      ProviderType: DEFAULT_WORKERLESS_PROVIDER,
      ToolchainType: DEFAULT_WORKERLESS_TOOLCHAIN,
      SpaceID: '',
      Labels: {},
      Annotations: {},
    });
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
                name='Parameters'
                control={control}
                rules={{ required: 'Parameters is required' }}
                render={({ field }) => (
                  <TextField
                    fullWidth
                    label='Parameters'
                    error={!!errors.Parameters}
                    size='small'
                    placeholder='{"KubeContext":"space-name-here"}'
                    helperText={
                      errors.Parameters?.message ||
                      '{"KubeContext":"kind-space17005","KubeNamespace":"default","WaitTimeout":"2m0s"}'
                    }
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
              <Controller
                name='BridgeWorkerID'
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth size='small' error={!!errors.BridgeWorkerID}>
                    <InputLabel shrink>Worker (optional)</InputLabel>
                    <Select
                      label='Worker (optional)'
                      input={<OutlinedInput label='Worker (optional)' notched />}
                      size='small'
                      disabled={!watchedSpaceId}
                      displayEmpty
                      {...field}
                      onChange={(e) => {
                        const newWorkerId = e.target.value as string;
                        field.onChange(newWorkerId);
                        if (!newWorkerId) {
                          setValue('ProviderType', DEFAULT_WORKERLESS_PROVIDER);
                          setValue('ToolchainType', DEFAULT_WORKERLESS_TOOLCHAIN);
                          return;
                        }
                        const newWorker = bridgeWorkers.find(
                          (bw) => bw.BridgeWorkerID === newWorkerId,
                        );
                        const newProviders = getAvailableBridges(newWorker?.ProvidedInfo);
                        const autoProvider = newProviders.length === 1 ? newProviders[0] : '';
                        setValue('ProviderType', autoProvider);
                        if (autoProvider) {
                          const newToolchains = getToolchainsForProvider(
                            newWorker?.ProvidedInfo,
                            autoProvider,
                          );
                          setValue(
                            'ToolchainType',
                            newToolchains.length === 1 ? newToolchains[0] : '',
                          );
                        } else {
                          setValue('ToolchainType', '');
                        }
                      }}
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
                    {errors.BridgeWorkerID && (
                      <FormHelperText>{errors.BridgeWorkerID.message}</FormHelperText>
                    )}
                    {!watchedSpaceId && <FormHelperText>Select a space first</FormHelperText>}
                    {!!watchedSpaceId && !workerSelected && (
                      <FormHelperText>
                        A target needs no worker; grant access to it with permissions
                      </FormHelperText>
                    )}
                  </FormControl>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Controller
                name='ProviderType'
                control={control}
                rules={{ required: 'Provider Type is required' }}
                render={({ field }) => (
                  <FormControl fullWidth size='small' error={!!errors.ProviderType}>
                    <InputLabel>Provider Type</InputLabel>
                    <Select
                      label='Provider Type'
                      input={<OutlinedInput label='Provider Type' />}
                      size='small'
                      disabled={!watchedSpaceId}
                      {...field}
                      onChange={(e) => {
                        const newProvider = e.target.value as string;
                        field.onChange(newProvider);
                        const newToolchains = workerSelected
                          ? getToolchainsForProvider(selectedWorker?.ProvidedInfo, newProvider)
                          : getWorkerlessToolchains(newProvider);
                        setValue(
                          'ToolchainType',
                          newToolchains.length >= 1 &&
                            (newToolchains.length === 1 || !workerSelected)
                            ? newToolchains[0]
                            : '',
                        );
                      }}
                    >
                      {providerOptions.map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </Select>
                    {workerSelected && providerOptions.length === 0 && (
                      <FormHelperText error>
                        Selected bridge worker has not reported any supported config types — a
                        target cannot be created against it
                      </FormHelperText>
                    )}
                    {errors.ProviderType && (
                      <FormHelperText>{errors.ProviderType.message}</FormHelperText>
                    )}
                  </FormControl>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Controller
                name='ToolchainType'
                control={control}
                rules={{ required: 'Toolchain Type is required' }}
                render={({ field }) => (
                  <FormControl fullWidth size='small' error={!!errors.ToolchainType}>
                    <InputLabel>Toolchain Type</InputLabel>
                    <Select
                      label='Toolchain Type'
                      input={<OutlinedInput label='Toolchain Type' />}
                      size='small'
                      disabled={!watchedSpaceId || !watchedProviderType}
                      {...field}
                    >
                      {toolchainOptions.map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </Select>
                    {!!watchedSpaceId && !watchedProviderType && (
                      <FormHelperText>Select a provider first</FormHelperText>
                    )}
                    {workerSelected &&
                      !!watchedProviderType &&
                      toolchainOptions.length === 0 && (
                        <FormHelperText error>
                          Selected bridge worker has not reported any toolchain types for this
                          provider
                        </FormHelperText>
                      )}
                    {errors.ToolchainType && (
                      <FormHelperText>{errors.ToolchainType.message}</FormHelperText>
                    )}
                  </FormControl>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <LabelsAccordion
                onLabelAddClicked={() => setIsAddLabelModalOpen(true)}
                onLabelDeleted={labelHandlers.onDeleted}
                labels={watch('Labels') || {}}
                variant='outlined'
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <LabelsAccordion
                onLabelAddClicked={() => setIsAddAnnotationsModalOpen(true)}
                onLabelDeleted={annotationHandlers.onDeleted}
                labels={watch('Annotations') || {}}
                type='Annotations'
                variant={'outlined'}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Button variant='contained' type='submit' fullWidth>
                Save
              </Button>
            </Grid>
          </Grid>
        </Container>
        <AddLabelModal
          isAddModalOpen={isAddLabelModalOpen}
          onAddModalClosed={() => setIsAddLabelModalOpen(false)}
          onLabelAdded={labelHandlers.onAdded}
        />
        <AddLabelModal
          isAddModalOpen={isAddAnnotationsModalOpen}
          onAddModalClosed={() => setIsAddAnnotationsModalOpen(false)}
          onLabelAdded={annotationHandlers.onAdded}
        />
      </DialogContent>
    </FullScreenDialog>
  );
};
