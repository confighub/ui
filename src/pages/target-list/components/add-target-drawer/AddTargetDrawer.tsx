// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * AddTargetDrawer
 *
 * Drawer component for adding or editing Targets.
 * Follows the same pattern as AddTriggerDrawer with card-based layout.
 *
 * Features:
 * - Add new targets or edit existing ones
 * - Labels and annotations management
 * - Space selection
 * - Granting a worker access to the target, so it can pull the target's releases
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Control, Controller, FieldErrors, useForm } from 'react-hook-form';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { ErrorList } from '@/components/error-list/ErrorList';
import { SimpleGateCard } from '@/components/simple-gate-card/SimpleGateCard';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  BridgeWorkerRead,
  CreateTargetApiArg,
  SpaceRead,
  Target,
  TargetRead,
  UpdateTargetApiArg,
  useCreateTargetMutation,
  useListAllBridgeWorkersQuery,
  useListSpacesQuery,
  useUpdateTargetMutation,
} from '@confighub/rtk-query';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import { setWorkerTargetAccess, workerHasTargetAccess } from '@/utility/bridge-worker-utils';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export interface AddTargetDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onTargetCreated?: (target: TargetRead) => void;
  onTargetUpdated?: (target: TargetRead) => void;
  existingTarget?: TargetRead; // If provided, drawer is in edit mode
}

/**
 * BasicInfoCard
 *
 * Handles basic target information: name, space, and a worker to grant access to.
 */
const BasicInfoCard = ({
  control,
  errors,
  spaces,
  workers,
  isEditMode,
  accessWorkerIds,
  setAccessWorkerIds,
  workerLabel,
}: {
  control: Control<Target>;
  errors: FieldErrors<Target>;
  spaces: SpaceRead[];
  workers: BridgeWorkerRead[];
  isEditMode: boolean;
  accessWorkerIds: string[];
  setAccessWorkerIds: (workerIds: string[]) => void;
  workerLabel: (worker: BridgeWorkerRead) => string;
}) => {
  return (
    <SectionCard title='Basic Information'>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
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
                placeholder='my-target-name'
              />
            )}
          />
        </Grid>

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

        <Grid size={{ xs: 6 }}>
          <FormControl fullWidth size='small'>
            <InputLabel shrink>Workers with access</InputLabel>
            <Select
              multiple
              value={accessWorkerIds}
              label='Workers with access'
              input={<OutlinedInput label='Workers with access' notched />}
              displayEmpty
              data-testid='target-worker-access-select'
              renderValue={(selected) =>
                selected.length === 0 ? (
                  <em>None</em>
                ) : (
                  workers
                    .filter((worker) => selected.includes(worker.BridgeWorkerID || ''))
                    .map(workerLabel)
                    .join(', ')
                )
              }
              onChange={(e) => {
                const value = e.target.value;
                setAccessWorkerIds(typeof value === 'string' ? value.split(',') : value);
              }}
            >
              {workers.map((worker) => (
                <MenuItem key={worker.BridgeWorkerID} value={worker.BridgeWorkerID}>
                  <Checkbox
                    size='small'
                    checked={accessWorkerIds.includes(worker.BridgeWorkerID || '')}
                  />
                  {workerLabel(worker)}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              A worker with access can find the target and pull the releases published for it
            </FormHelperText>
          </FormControl>
        </Grid>
      </Grid>
    </SectionCard>
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
            onKeyPress={(e) => e.key === 'Enter' && addLabel()}
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
            onKeyPress={(e) => e.key === 'Enter' && addLabel()}
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
            onKeyPress={(e) => e.key === 'Enter' && addAnnotation()}
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
            onKeyPress={(e) => e.key === 'Enter' && addAnnotation()}
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
 * AddTargetDrawer
 *
 * Main drawer component for adding/editing targets.
 */
export const AddTargetDrawer = ({
  isOpen,
  onClose,
  onTargetCreated,
  onTargetUpdated,
  existingTarget,
}: AddTargetDrawerProps) => {
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
  const [accessWorkerIds, setAccessWorkerIds] = useState<string[]>([]);

  const isEditMode = !!existingTarget;

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
  } = useForm<Target>({
    defaultValues: {
      Slug: existingTarget?.Slug || '',
      SpaceID: existingTarget?.SpaceID || '',
      Labels: existingTarget?.Labels || {},
      Annotations: existingTarget?.Annotations || {},
      DeleteGates: existingTarget?.DeleteGates || {},
    },
  });

  // A grant may be to a worker in another Space, so every worker in the organization is offered.
  const { data: extendedBridgeWorkers = [] } = useListAllBridgeWorkersQuery({
    include: 'SpaceID',
  });

  // A worker without a bot user cannot be granted anything.
  const bridgeWorkers = useMemo(
    () =>
      extendedBridgeWorkers
        .map((ebw) => ebw.BridgeWorker)
        .filter((bw): bw is BridgeWorkerRead => bw !== undefined && !!bw.UserID),
    [extendedBridgeWorkers],
  );

  // Workers in different Spaces may share a name, so each is shown with its Space.
  const workerLabel = useCallback(
    (worker: BridgeWorkerRead) => {
      const space = extendedBridgeWorkers.find(
        (ebw) => ebw.BridgeWorker?.BridgeWorkerID === worker.BridgeWorkerID,
      )?.Space;
      return space?.Slug ? `${space.Slug}/${worker.Slug}` : worker.Slug || '';
    },
    [extendedBridgeWorkers],
  );

  // The field opens showing who has access now: the workers the target's Permissions grant.
  const grantedWorkerKey = bridgeWorkers
    .filter((bw) => workerHasTargetAccess(existingTarget?.Permissions, bw))
    .map((bw) => bw.BridgeWorkerID || '')
    .join(',');
  useEffect(() => {
    setAccessWorkerIds(grantedWorkerKey ? grantedWorkerKey.split(',') : []);
  }, [grantedWorkerKey, existingTarget?.TargetID, isOpen]);

  const [createTarget, { isSuccess: isCreateSuccess, error: createError, data: createData }] =
    useCreateTargetMutation();
  const [updateTarget, { isSuccess: isUpdateSuccess, error: updateError, data: updateData }] =
    useUpdateTargetMutation();
  const { trackEntityCreated } = useAnalytics();

  // Initialize form and labels/annotations from existing target
  useEffect(() => {
    if (existingTarget) {
      // Reset form with existing target values
      reset({
        Slug: existingTarget.Slug || '',
        SpaceID: existingTarget.SpaceID || '',
        Labels: existingTarget.Labels || {},
        Annotations: existingTarget.Annotations || {},
        DeleteGates: existingTarget.DeleteGates || {},
      });

      // Initialize labels and annotations lists
      const labelsList = Object.entries(existingTarget.Labels || {}).map(([key, value]) => ({
        id: `${key}-${value}-${Date.now()}`,
        key,
        value,
      }));
      const annotationsList = Object.entries(existingTarget.Annotations || {}).map(
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
        Labels: {},
        Annotations: {},
        DeleteGates: {},
      });
      setLabels([]);
      setAnnotations([]);
    }
  }, [existingTarget, reset]);

  useApiErrorMessage(createError, isCreateSuccess, setServerError, {
    onSuccess: () => {
      if (onTargetCreated && createData) {
        // Track target creation (only dropdown values, no user input)
        trackEntityCreated({
          entity_type: ENTITY_TYPES.TARGET,
          entity_id: createData.TargetID || '',
        });
        onTargetCreated(createData as TargetRead);
      }
      handleClose();
    },
  });

  useApiErrorMessage(updateError, isUpdateSuccess, setServerError, {
    onSuccess: () => {
      if (onTargetUpdated && updateData) {
        onTargetUpdated(updateData as TargetRead);
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
    onClose();
  };

  const onSubmit = async (data: Target) => {
    setIsSubmitting(true);

    try {
      if (isEditMode && existingTarget) {
        // Update existing target
        const input: UpdateTargetApiArg = {
          targetId: existingTarget.TargetID || '',
          spaceId: data.SpaceID || '',
          target: {
            ...existingTarget,
            Slug: data.Slug,
            Labels: data.Labels,
            Annotations: data.Annotations,
            DeleteGates: data.DeleteGates,
            Permissions: setWorkerTargetAccess(
              existingTarget.Permissions,
              bridgeWorkers,
              accessWorkerIds,
            ),
          },
        };
        await updateTarget(input);
      } else {
        // Create new target
        const space =
          spaces?.find((space) => space.SpaceID === data.SpaceID) || ({} as SpaceRead);

        const input: CreateTargetApiArg = {
          spaceId: data.SpaceID || '',
          target: {
            Slug: data.Slug,
            SpaceID: data.SpaceID,
            OrganizationID: space.OrganizationID || '',
            Labels: data.Labels,
            Annotations: data.Annotations,
            DeleteGates: data.DeleteGates,
            Permissions: setWorkerTargetAccess(undefined, bridgeWorkers, accessWorkerIds),
          },
        };
        await createTarget(input);
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
              Back to Targets
            </Button>
          </Stack>
          <Stack spacing={1}>
            <Typography variant='h4' component='h1' sx={{ fontWeight: 600 }}>
              {isEditMode ? 'Edit Target' : 'Add Target'}
            </Typography>
            {isEditMode && existingTarget?.TargetID && (
              <Stack direction='row' spacing={1} alignItems='center'>
                <Typography variant='body1' color='text.secondary'>
                  UUID: {existingTarget.TargetID}
                </Typography>
                <CopyToClipboard text={existingTarget.TargetID} />
              </Stack>
            )}
          </Stack>
        </Box>

        {/* Content */}
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
            <BasicInfoCard
              control={control}
              errors={errors}
              spaces={spaces}
              workers={bridgeWorkers}
              isEditMode={isEditMode}
              accessWorkerIds={accessWorkerIds}
              setAccessWorkerIds={setAccessWorkerIds}
              workerLabel={workerLabel}
            />
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
            <SimpleGateCard
              watch={watch}
              setValue={setValue}
              gateFieldName='DeleteGates'
              gateType='Delete'
              title='Delete Gates'
              description='Delete gates prevent accidental deletion of this target. Remove all gates before deletion.'
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
                ? 'Updating Target...'
                : 'Creating Target...'
              : isEditMode
                ? 'Update Target'
                : 'Create Target'}
          </Button>
        </FixedSubmitContainer>
      </Box>
    </Drawer>
  );
};
