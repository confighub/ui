// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * AddBridgeWorkerDrawer
 *
 * Drawer component for adding or editing Bridge Workers.
 * Follows the same pattern as AddTargetDrawer with card-based layout.
 *
 * Features:
 * - Add new bridge workers or edit existing ones
 * - Labels and annotations management
 * - Space selection
 * - Live preview of configuration
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Control, Controller, FieldErrors, useForm } from 'react-hook-form';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { ErrorList } from '@/components/error-list/ErrorList';
import { SimpleGateCard } from '@/components/simple-gate-card/SimpleGateCard';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  BridgeWorker,
  BridgeWorkerRead,
  SpaceRead,
  WorkerInfo,
  useCreateBridgeWorkerMutation,
  useListBridgeWorkerStatusesQuery,
  useListSpacesQuery,
  useUpdateBridgeWorkerMutation,
} from '@confighub/rtk-query';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import { getAvailableFunctions } from '@/utility/bridge-worker-utils';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import CloudIcon from '@mui/icons-material/Cloud';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export interface AddBridgeWorkerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkerCreated?: (worker: BridgeWorkerRead) => void;
  onWorkerUpdated?: (worker: BridgeWorkerRead) => void;
  existingWorker?: BridgeWorkerRead;
  /** The existing server-hosted worker for this org, if one already exists */
  existingServerHostedWorker?: BridgeWorkerRead;
}

/**
 * BasicInfoCard
 *
 * Handles basic worker information like slug.
 */
const BasicInfoCard = ({
  control,
  errors,
}: {
  control: Control<BridgeWorker>;
  errors: FieldErrors<BridgeWorker>;
}) => {
  return (
    <Grid size={{ xs: 6 }}>
      <Controller
        name='Slug'
        control={control}
        rules={{
          required: 'Name is required',
          pattern: {
            value: SLUG_PATTERN,
            message: SLUG_PATTERN_MESSAGE,
          },
        }}
        render={({ field }) => (
          <TextField
            {...field}
            label='Name'
            fullWidth
            size='small'
            error={!!errors.Slug}
            helperText={errors.Slug?.message}
            placeholder='my-bridge-worker'
          />
        )}
      />
    </Grid>
  );
};

/**
 * SpaceCard
 *
 * Handles space selection.
 */
const SpaceCard = ({
  control,
  errors,
  spaces,
  isEditMode,
}: {
  control: Control<BridgeWorker>;
  errors: FieldErrors<BridgeWorker>;
  spaces: SpaceRead[];
  isEditMode: boolean;
}) => {
  return (
    <Grid size={{ xs: 6 }}>
      <Controller
        name='SpaceID'
        control={control}
        rules={{ required: 'Space is required' }}
        render={({ field }) => (
          <FormControl fullWidth size='small' error={!!errors.SpaceID}>
            <InputLabel>Space</InputLabel>
            <Select
              {...field}
              label='Space'
              input={<OutlinedInput label='Space' />}
              disabled={isEditMode}
            >
              {spaces?.map((space) => (
                <MenuItem key={space.SpaceID} value={space.SpaceID}>
                  {space.DisplayName}
                </MenuItem>
              ))}
            </Select>
            {errors.SpaceID && <FormHelperText>{errors.SpaceID.message}</FormHelperText>}
          </FormControl>
        )}
      />
    </Grid>
  );
};

/**
 * LabelsAndAnnotationsCard
 *
 * Handles labels and annotations management.
 */
const LabelsAndAnnotationsCard = ({
  newLabelKey,
  newLabelValue,
  newAnnotationKey,
  newAnnotationValue,
  setNewLabelKey,
  setNewLabelValue,
  setNewAnnotationKey,
  setNewAnnotationValue,
  addLabel,
  addAnnotation,
  removeLabel,
  removeAnnotation,
  labels,
  annotations,
}: {
  newLabelKey: string;
  newLabelValue: string;
  newAnnotationKey: string;
  newAnnotationValue: string;
  setNewLabelKey: (value: string) => void;
  setNewLabelValue: (value: string) => void;
  setNewAnnotationKey: (value: string) => void;
  setNewAnnotationValue: (value: string) => void;
  addLabel: () => void;
  addAnnotation: () => void;
  removeLabel: (id: string) => void;
  removeAnnotation: (id: string) => void;
  labels: Array<{ id: string; key: string; value: string }>;
  annotations: Array<{ id: string; key: string; value: string }>;
}) => {
  return (
    <SectionCard title='Labels & Annotations'>
      {/* Labels Section */}
      <Typography variant='subtitle1' sx={{ fontWeight: 500, mb: 2 }}>
        Labels
      </Typography>

      {/* Display existing labels */}
      {labels.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {labels.map((label) => (
            <Chip
              key={label.id}
              label={`${label.key}: ${label.value}`}
              onDelete={() => removeLabel(label.id)}
              color='primary'
              variant='outlined'
            />
          ))}
        </Box>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 5 }}>
          <TextField
            label='Label Key'
            fullWidth
            size='small'
            value={newLabelKey}
            onChange={(e) => setNewLabelKey(e.target.value)}
            placeholder='environment'
            onKeyDown={(e) => e.key === 'Enter' && addLabel()}
          />
        </Grid>
        <Grid size={{ xs: 5 }}>
          <TextField
            label='Label Value'
            fullWidth
            size='small'
            value={newLabelValue}
            onChange={(e) => setNewLabelValue(e.target.value)}
            placeholder='production'
            onKeyDown={(e) => e.key === 'Enter' && addLabel()}
          />
        </Grid>
        <Grid size={{ xs: 2 }}>
          <Button
            variant='outlined'
            fullWidth
            startIcon={<Add />}
            onClick={addLabel}
            disabled={!newLabelKey.trim() || !newLabelValue.trim()}
            sx={{ minWidth: 'auto', borderRadius: '8px' }}
          >
            Add
          </Button>
        </Grid>
      </Grid>

      {/* Annotations Section */}
      <Typography variant='subtitle1' sx={{ fontWeight: 500, mb: 2 }}>
        Annotations
      </Typography>

      {/* Display existing annotations */}
      {annotations.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {annotations.map((annotation) => (
            <Chip
              key={annotation.id}
              label={`${annotation.key}: ${annotation.value}`}
              onDelete={() => removeAnnotation(annotation.id)}
              color='secondary'
              variant='outlined'
            />
          ))}
        </Box>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 5 }}>
          <TextField
            label='Annotation Key'
            fullWidth
            size='small'
            value={newAnnotationKey}
            onChange={(e) => setNewAnnotationKey(e.target.value)}
            placeholder='config.hash'
            onKeyDown={(e) => e.key === 'Enter' && addAnnotation()}
          />
        </Grid>
        <Grid size={{ xs: 5 }}>
          <TextField
            label='Annotation Value'
            fullWidth
            size='small'
            value={newAnnotationValue}
            onChange={(e) => setNewAnnotationValue(e.target.value)}
            placeholder='abc123'
            onKeyDown={(e) => e.key === 'Enter' && addAnnotation()}
          />
        </Grid>
        <Grid size={{ xs: 2 }}>
          <Button
            variant='outlined'
            fullWidth
            startIcon={<Add />}
            onClick={addAnnotation}
            disabled={!newAnnotationKey.trim() || !newAnnotationValue.trim()}
            sx={{ minWidth: 'auto', borderRadius: '8px' }}
          >
            Add
          </Button>
        </Grid>
      </Grid>
    </SectionCard>
  );
};

/**
 * WorkerCapabilitiesCard
 *
 * Shows available functions for existing workers (Edit mode only).
 */
const WorkerCapabilitiesCard = ({ providedInfo }: { providedInfo?: WorkerInfo }) => {
  const availableFunctions = providedInfo ? getAvailableFunctions(providedInfo) : undefined;

  if (!availableFunctions) {
    return (
      <SectionCard title='Worker Capabilities'>
        <Typography variant='body2' color='text.secondary'>
          No capabilities information available for this worker.
        </Typography>
      </SectionCard>
    );
  }

  return (
    <SectionCard title='Worker Capabilities'>
      <Grid container spacing={2}>
        {/* Available Functions */}
        {availableFunctions && availableFunctions.length > 0 && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack direction='row' spacing={1} alignItems='center'>
              <Typography variant='subtitle1' sx={{ fontWeight: 500 }}>
                Available Functions
              </Typography>
            </Stack>
            <Box
              sx={{
                maxHeight: 100,
                overflowY: 'auto',
                pr: 1,
                '&::-webkit-scrollbar': {
                  width: '8px',
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: 'action.hover',
                  borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: 'grey.200',
                  borderRadius: '4px',
                },
              }}
            >
              {availableFunctions.map((func) => (
                <Chip size='small' label={func} sx={{ m: 0.2, ml: 'auto' }} color='primary' />
              ))}
            </Box>
          </Grid>
        )}

      </Grid>
    </SectionCard>
  );
};

/**
 * ServerHostedCard
 *
 * Checkbox to mark the worker as the server-hosted worker (add mode only).
 * If a server-hosted worker already exists, the option is disabled and a link is shown.
 */
const ServerHostedCard = ({
  isServerWorker,
  onChange,
  existingServerHostedWorker,
  existingWorkerPath,
}: {
  isServerWorker: boolean;
  onChange: (checked: boolean) => void;
  existingServerHostedWorker?: BridgeWorkerRead;
  existingWorkerPath: string;
}) => {
  const alreadyExists =
    !!existingServerHostedWorker && !!existingServerHostedWorker.BridgeWorkerID;

  return (
    <SectionCard title='Server Hosted Worker'>
      <Stack spacing={1}>
        <Tooltip
          title={
            alreadyExists
              ? `A server-hosted worker already exists for this organization.`
              : ''
          }
          placement='top-start'
        >
          <span>
            <FormControlLabel
              control={
                <Checkbox
                  checked={isServerWorker}
                  onChange={(e) => onChange(e.target.checked)}
                  disabled={alreadyExists}
                  size='small'
                />
              }
              label='Make this the server-hosted worker for this organization'
              sx={{ opacity: alreadyExists ? 0.5 : 1 }}
            />
          </span>
        </Tooltip>
        <Typography variant='body2' color='text.secondary'>
          Only one server-hosted worker can exist per organization. It is managed and run by the
          ConfigHub server.
        </Typography>
        {alreadyExists && (
          <Typography variant='body2'>
            A server-hosted worker already exists:{' '}
            <Link href={`${existingWorkerPath}?edit=${existingServerHostedWorker.BridgeWorkerID}`}>
              {existingServerHostedWorker.Slug}
            </Link>
          </Typography>
        )}
      </Stack>
    </SectionCard>
  );
};

/**
 * SuccessInstructionsView
 *
 * Shows next steps after successful worker creation.
 */
const SuccessInstructionsView = ({
  worker,
  space,
  onClose,
}: {
  worker: BridgeWorkerRead;
  space: SpaceRead | null;
  onClose: () => void;
}) => {
  const spaceName = space?.Slug || '<space>';
  const getEnvsCommand = `cub worker get-envs --space ${spaceName} ${worker.Slug}`;

  return (
    <Box
      sx={{
        flex: 1,
        p: 3,
        backgroundColor: 'rgb(249, 250, 251)',
        paddingBottom: '100px',
      }}
    >
      <Stack spacing={3}>
        {/* Success Message */}
        <SectionCard title='Worker Created Successfully!'>
          <Typography variant='h6' sx={{ fontWeight: 600, mb: 2 }}>
            Next Steps
          </Typography>
          <Typography variant='body1' sx={{ mb: 3 }}>
            You have registered a worker with ConfigHub, which creates an identity for it. Its
            credentials are what a CI job, an event consumer, or a worker process running your
            own functions authenticates with.
          </Typography>

          <Typography variant='subtitle1' sx={{ fontWeight: 500, mb: 2 }}>
            Fetch the credentials as environment variables:
          </Typography>

          <Box sx={{ position: 'relative' }}>
            <TextField
              value={getEnvsCommand}
              size='small'
              fullWidth
              multiline
              slotProps={{
                input: {
                  readOnly: true,
                },
              }}
              sx={{
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                },
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
              }}
            >
              <CopyToClipboard text={getEnvsCommand} />
            </Box>
          </Box>

          <Typography variant='body2' sx={{ mt: 3 }}>
            For more details about how to manage workers, including how to manage them using
            ConfigHub, see the guide:
            <br />
            <Link
              href='https://docs.confighub.com/guide/workers/'
              target='_blank'
              rel='noopener noreferrer'
            >
              https://docs.confighub.com/guide/workers/
            </Link>
          </Typography>
        </SectionCard>
      </Stack>

      {/* Close Button */}
      <FixedSubmitContainer>
        <Button
          variant='contained'
          fullWidth
          onClick={onClose}
          sx={{
            flexGrow: 1,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: '0 8px 25px rgba(25, 118, 210, 0.3)',
            },
          }}
        >
          Close
        </Button>
      </FixedSubmitContainer>
    </Box>
  );
};

/**
 * AddBridgeWorkerDrawer
 *
 * Main drawer component for adding/editing bridge workers.
 */
export const AddBridgeWorkerDrawer = ({
  isOpen,
  onClose,
  onWorkerCreated,
  onWorkerUpdated,
  existingWorker,
  existingServerHostedWorker,
}: AddBridgeWorkerDrawerProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelValue, setNewLabelValue] = useState('');
  const [newAnnotationKey, setNewAnnotationKey] = useState('');
  const [newAnnotationValue, setNewAnnotationValue] = useState('');
  const [labels, setLabels] = useState<Array<{ id: string; key: string; value: string }>>([]);
  const [annotations, setAnnotations] = useState<
    Array<{ id: string; key: string; value: string }>
  >([]);
  const [newDeleteGateKey, setNewDeleteGateKey] = useState('');
  const [showSuccessInstructions, setShowSuccessInstructions] = useState(false);
  const [createdWorkerData, setCreatedWorkerData] = useState<BridgeWorkerRead | null>(null);
  const [createdWorkerSpace, setCreatedWorkerSpace] = useState<SpaceRead | null>(null);
  const [isServerWorker, setIsServerWorker] = useState(false);

  const location = useLocation();

  const isEditMode = !!existingWorker;
  const isServerHosted = existingWorker?.ProvidedInfo?.IsServerWorker === true;

  const { data: extendedSpaces = [] } = useListSpacesQuery({});
  const spaces = extendedSpaces
    .map((es) => es.Space)
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<BridgeWorker>({
    defaultValues: {
      Slug: existingWorker?.Slug || '',
      SpaceID: existingWorker?.SpaceID || '',
      OrganizationID: existingWorker?.OrganizationID || '',
      Labels: existingWorker?.Labels || {},
      Annotations: existingWorker?.Annotations || {},
      DeleteGates: existingWorker?.DeleteGates || {},
    },
  });

  // Get bridge worker statuses
  const { data: statuses = [] } = useListBridgeWorkerStatusesQuery(
    {
      spaceId: existingWorker?.SpaceID || '',
      bridgeWorkerId: existingWorker?.BridgeWorkerID || '',
    },
    { skip: !existingWorker?.SpaceID || !existingWorker.BridgeWorkerID },
  );

  // Sort statuses by SeenAt DESC
  const sortedStatuses = useMemo(() => {
    if (!Array.isArray(statuses)) return [];
    return [...statuses].sort(
      (a, b) => new Date(b.SeenAt || 0).getTime() - new Date(a.SeenAt || 0).getTime(),
    );
  }, [statuses]);

  const [createWorker, { isSuccess: isCreateSuccess, error: createError, data: createData }] =
    useCreateBridgeWorkerMutation();
  const [updateWorker, { isSuccess: isUpdateSuccess, error: updateError, data: updateData }] =
    useUpdateBridgeWorkerMutation();
  const { trackEntityCreated } = useAnalytics();

  // Initialize form and labels/annotations from existing worker
  useEffect(() => {
    if (existingWorker) {
      // Reset form with existing worker values
      reset({
        Slug: existingWorker.Slug || '',
        SpaceID: existingWorker.SpaceID || '',
        OrganizationID: existingWorker.OrganizationID || '',
        Labels: existingWorker.Labels || {},
        Annotations: existingWorker.Annotations || {},
        DeleteGates: existingWorker.DeleteGates || {},
      });

      // Initialize labels and annotations lists
      const labelsList = Object.entries(existingWorker.Labels || {}).map(([key, value]) => ({
        id: `${key}-${value}-${Date.now()}`,
        key,
        value,
      }));
      const annotationsList = Object.entries(existingWorker.Annotations || {}).map(
        ([key, value]) => ({
          id: `${key}-${value}-${Date.now()}`,
          key,
          value,
        }),
      );
      setLabels(labelsList);
      setAnnotations(annotationsList);
    } else {
      // Reset to empty state for add mode
      reset({
        Slug: '',
        SpaceID: '',
        OrganizationID: '',
        Labels: {},
        Annotations: {},
        DeleteGates: {},
      });
      setLabels([]);
      setAnnotations([]);
    }
  }, [existingWorker, reset]);

  useApiErrorMessage(createError, isCreateSuccess, setServerError, {
    onSuccess: () => {
      if (createData) {
        // Track bridge worker creation (no user input, only entity ID)
        trackEntityCreated({
          entity_type: ENTITY_TYPES.BRIDGE_WORKER,
          entity_id: createData.BridgeWorkerID || '',
        });

        const space = spaces?.find((s) => s.SpaceID === createData.SpaceID);
        setCreatedWorkerData(createData as BridgeWorkerRead);
        setCreatedWorkerSpace(space || null);
        setShowSuccessInstructions(true);
        // Call callback but don't close drawer yet - show success instructions first
        if (onWorkerCreated) {
          onWorkerCreated(createData as BridgeWorkerRead);
        }
      }
    },
  });

  useApiErrorMessage(updateError, isUpdateSuccess, setServerError, {
    onSuccess: () => {
      if (onWorkerUpdated && updateData) {
        onWorkerUpdated(updateData as BridgeWorkerRead);
      }
      handleClose();
    },
  });

  const addLabel = () => {
    if (newLabelKey.trim() && newLabelValue.trim()) {
      const newLabel = {
        id: `${newLabelKey}-${newLabelValue}-${Date.now()}`,
        key: newLabelKey.trim(),
        value: newLabelValue.trim(),
      };
      setLabels([...labels, newLabel]);

      // Update form value
      const updatedLabels = {
        ...watch('Labels'),
        [newLabelKey.trim()]: newLabelValue.trim(),
      };
      setValue('Labels', updatedLabels);

      setNewLabelKey('');
      setNewLabelValue('');
    }
  };

  const addAnnotation = () => {
    if (newAnnotationKey.trim() && newAnnotationValue.trim()) {
      const newAnnotation = {
        id: `${newAnnotationKey}-${newAnnotationValue}-${Date.now()}`,
        key: newAnnotationKey.trim(),
        value: newAnnotationValue.trim(),
      };
      setAnnotations([...annotations, newAnnotation]);

      // Update form value
      const updatedAnnotations = {
        ...watch('Annotations'),
        [newAnnotationKey.trim()]: newAnnotationValue.trim(),
      };
      setValue('Annotations', updatedAnnotations);

      setNewAnnotationKey('');
      setNewAnnotationValue('');
    }
  };

  const removeLabel = (id: string) => {
    const updatedLabels = labels.filter((label) => label.id !== id);
    setLabels(updatedLabels);

    // Update form value
    const labelsObject = updatedLabels.reduce(
      (acc, label) => {
        acc[label.key] = label.value;
        return acc;
      },
      {} as Record<string, string>,
    );
    setValue('Labels', labelsObject);
  };

  const removeAnnotation = (id: string) => {
    const updatedAnnotations = annotations.filter((annotation) => annotation.id !== id);
    setAnnotations(updatedAnnotations);

    // Update form value
    const annotationsObject = updatedAnnotations.reduce(
      (acc, annotation) => {
        acc[annotation.key] = annotation.value;
        return acc;
      },
      {} as Record<string, string>,
    );
    setValue('Annotations', annotationsObject);
  };

  const handleClose = () => {
    reset();
    setLabels([]);
    setAnnotations([]);
    setNewLabelKey('');
    setNewLabelValue('');
    setNewAnnotationKey('');
    setNewAnnotationValue('');
    setNewDeleteGateKey('');
    setServerError('');
    setShowSuccessInstructions(false);
    setCreatedWorkerData(null);
    setCreatedWorkerSpace(null);
    setIsServerWorker(false);
    onClose();
  };

  const onSubmit = async (data: BridgeWorker) => {
    setIsSubmitting(true);

    try {
      if (isEditMode && existingWorker) {
        // Update existing worker
        await updateWorker({
          bridgeWorkerId: existingWorker.BridgeWorkerID || '',
          spaceId: data.SpaceID || '',
          bridgeWorker: {
            ...existingWorker,
            Slug: data.Slug,
            Labels: data.Labels,
            Annotations: data.Annotations,
            DeleteGates: data.DeleteGates,
          },
        });
      } else {
        // Create new worker
        const space =
          spaces?.find((space) => space.SpaceID === data.SpaceID) || ({} as SpaceRead);

        await createWorker({
          spaceId: data.SpaceID || '',
          bridgeWorker: {
            Slug: data.Slug,
            SpaceID: data.SpaceID,
            OrganizationID: space.OrganizationID || '',
            Labels: data.Labels,
            Annotations: data.Annotations,
            DeleteGates: data.DeleteGates,
            ...(isServerWorker && {
              ProvidedInfo: { IsServerWorker: true },
            }),
          },
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const watchedValues = watch();
  const isFormValid = watchedValues.Slug && watchedValues.SpaceID;

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
          <Stack direction='row' sx={{ justifyContent: 'space-between', mb: 2 }}>
            <Button
              startIcon={<ArrowBack />}
              onClick={handleClose}
              sx={{ color: 'text.secondary' }}
            >
              Back to Bridge Workers
            </Button>
          </Stack>
          <Stack spacing={1}>
            <Stack direction='row' spacing={1} alignItems='center'>
              <Typography variant='h4' component='h1' sx={{ fontWeight: 600 }}>
                {isEditMode ? 'Edit Bridge Worker' : 'Add Bridge Worker'}
              </Typography>
              {isServerHosted && (
                <Chip
                  icon={<CloudIcon />}
                  size='small'
                  label='Server Hosted'
                  color='primary'
                  variant='outlined'
                />
              )}
            </Stack>
            <Stack direction='row' spacing={2} alignItems='center'>
              {isEditMode && existingWorker?.BridgeWorkerID && (
                <Stack direction='row' spacing={1} alignItems='center'>
                  <Typography variant='body1' color='text.secondary'>
                    UUID: {existingWorker.BridgeWorkerID}
                  </Typography>
                  <CopyToClipboard text={existingWorker.BridgeWorkerID} />
                </Stack>
              )}
              {isEditMode && (
                <Chip
                  size='small'
                  label={`${sortedStatuses[0]?.IPAddress && `IP Address ${sortedStatuses[0].IPAddress}`}`}
                />
              )}
            </Stack>
          </Stack>
        </Box>

        {/* Content - Conditional rendering based on success state */}
        {showSuccessInstructions && createdWorkerData ? (
          <SuccessInstructionsView
            worker={createdWorkerData}
            space={createdWorkerSpace}
            onClose={handleClose}
          />
        ) : (
          <>
            <Box
              sx={{
                flex: 1,
                p: 3,
                backgroundColor: 'rgb(249, 250, 251)',
                paddingBottom: '100px',
              }}
            >
              <ErrorList errors={[serverError]} onClose={() => setServerError('')} />

              <Stack spacing={1}>
                <SectionCard title='Basic Information'>
                  <Grid container spacing={2}>
                    <BasicInfoCard control={control} errors={errors} />
                    <SpaceCard
                      control={control}
                      errors={errors}
                      spaces={spaces}
                      isEditMode={isEditMode}
                    />
                  </Grid>
                </SectionCard>
                <LabelsAndAnnotationsCard
                  newLabelKey={newLabelKey}
                  newLabelValue={newLabelValue}
                  newAnnotationKey={newAnnotationKey}
                  newAnnotationValue={newAnnotationValue}
                  setNewLabelKey={setNewLabelKey}
                  setNewLabelValue={setNewLabelValue}
                  setNewAnnotationKey={setNewAnnotationKey}
                  setNewAnnotationValue={setNewAnnotationValue}
                  addLabel={addLabel}
                  addAnnotation={addAnnotation}
                  removeLabel={removeLabel}
                  removeAnnotation={removeAnnotation}
                  labels={labels}
                  annotations={annotations}
                />
                {isEditMode && existingWorker?.ProvidedInfo && (
                  <WorkerCapabilitiesCard
                    providedInfo={existingWorker.ProvidedInfo as WorkerInfo}
                  />
                )}
                {!isEditMode && (
                  <ServerHostedCard
                    isServerWorker={isServerWorker}
                    onChange={setIsServerWorker}
                    existingServerHostedWorker={existingServerHostedWorker}
                    existingWorkerPath={location.pathname}
                  />
                )}
                <SimpleGateCard
                  watch={watch}
                  setValue={setValue}
                  gateFieldName='DeleteGates'
                  gateType='Delete'
                  title='Delete Gates'
                  description='Delete gates prevent accidental deletion of this bridge worker. Remove all gates before deletion.'
                  newGateKey={newDeleteGateKey}
                  setNewGateKey={setNewDeleteGateKey}
                />
              </Stack>
            </Box>

            {/* Fixed Submit Button */}
            <FixedSubmitContainer>
              <Button
                variant='contained'
                fullWidth
                disabled={!isFormValid || isSubmitting}
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
                {isSubmitting
                  ? isEditMode
                    ? 'Updating Bridge Worker...'
                    : 'Creating Bridge Worker...'
                  : isEditMode
                    ? 'Update Bridge Worker'
                    : 'Create Bridge Worker'}
              </Button>
            </FixedSubmitContainer>
          </>
        )}
      </Box>
    </Drawer>
  );
};
