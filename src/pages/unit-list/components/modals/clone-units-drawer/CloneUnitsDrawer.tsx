// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { ErrorList } from '@/components/error-list/ErrorList';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import {
  SpaceRead,
  TargetRead,
  UnitRead,
  useBulkCreateUnitsMutation,
  useCreateUnitMutation,
  useListAllTargetsQuery,
} from '@confighub/rtk-query';
import { IUnitMutationModalProps } from '@/types';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
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
import { styled } from '@mui/material/styles';

const Form = styled('form')`
  background-color: rgb(249, 250, 251);
`;

// Types
interface UnitMetadata {
  labels: Array<{ key: string; value: string; id: string }>;
  deleteGates: Array<{ key: string; id: string }>;
  destroyGates: Array<{ key: string; id: string }>;
  annotations: Array<{ key: string; value: string; id: string }>;
}

interface SingleUnitFormData extends UnitMetadata {
  targetSpaceId: string;
  cloneName: string;
  sourceSpaceId: string;
  newSpaceName: string;
  targetId: string;
}

interface MultiUnitFormData extends UnitMetadata {
  targetSpaceId: string;
  sourceSpaceId: string;
  newSpaceName: string;
  targetId: string;
}

/**
 * UnitMetadataManagementCard
 *
 * Expandable card for managing labels, annotations, delete gates, and destroy gates for cloned units
 */
const UnitMetadataManagementCard = ({
  labels,
  annotations,
  deleteGates,
  destroyGates,
  onLabelsChange,
  onAnnotationsChange,
  onDeleteGatesChange,
  onDestroyGatesChange,
  unitsToEdit = [],
}: {
  labels: Array<{ key: string; value: string; id: string }>;
  annotations: Array<{ key: string; value: string; id: string }>;
  deleteGates: Array<{ key: string; id: string }>;
  destroyGates: Array<{ key: string; id: string }>;
  onLabelsChange: (value: Array<{ key: string; value: string; id: string }>) => void;
  onAnnotationsChange: (value: Array<{ key: string; value: string; id: string }>) => void;
  onDeleteGatesChange: (value: Array<{ key: string; id: string }>) => void;
  onDestroyGatesChange: (value: Array<{ key: string; id: string }>) => void;
  unitsToEdit?: UnitRead[];
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelValue, setNewLabelValue] = useState('');
  const [newAnnotationKey, setNewAnnotationKey] = useState('');
  const [newAnnotationValue, setNewAnnotationValue] = useState('');
  const [newDeleteGateKey, setNewDeleteGateKey] = useState('');
  const [newDestroyGateKey, setNewDestroyGateKey] = useState('');

  const addLabel = () => {
    if (!newLabelKey.trim() || !newLabelValue.trim()) return;
    onLabelsChange([
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

  const addAnnotation = () => {
    if (!newAnnotationKey.trim() || !newAnnotationValue.trim()) return;
    onAnnotationsChange([
      ...annotations,
      {
        id: `${Date.now()}-${Math.random()}`,
        key: newAnnotationKey.trim(),
        value: newAnnotationValue.trim(),
      },
    ]);
    setNewAnnotationKey('');
    setNewAnnotationValue('');
  };

  const addDeleteGate = () => {
    if (!newDeleteGateKey.trim()) return;
    onDeleteGatesChange([
      ...deleteGates,
      { id: `${Date.now()}-${Math.random()}`, key: newDeleteGateKey.trim() },
    ]);
    setNewDeleteGateKey('');
  };

  const addDestroyGate = () => {
    if (!newDestroyGateKey.trim()) return;
    onDestroyGatesChange([
      ...destroyGates,
      { id: `${Date.now()}-${Math.random()}`, key: newDestroyGateKey.trim() },
    ]);
    setNewDestroyGateKey('');
  };

  // Get common items from selected units for suggestions
  const commonLabels = Object.keys(
    unitsToEdit.reduce(
      (acc, unit) => {
        Object.keys(unit.Labels || {}).forEach((key) => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  );

  const commonAnnotations = Object.keys(
    unitsToEdit.reduce(
      (acc, unit) => {
        Object.keys(unit.Annotations || {}).forEach((key) => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  );

  const commonDeleteGates = Object.keys(
    unitsToEdit.reduce(
      (acc, unit) => {
        Object.keys(unit.DeleteGates || {}).forEach((key) => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  );

  const commonDestroyGates = Object.keys(
    unitsToEdit.reduce(
      (acc, unit) => {
        Object.keys(unit.DestroyGates || {}).forEach((key) => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  );

  const hasAnyItems =
    labels.length > 0 ||
    annotations.length > 0 ||
    deleteGates.length > 0 ||
    destroyGates.length > 0;

  return (
    <SectionCard title='Unit Metadata (Optional)'>
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        sx={{ cursor: 'pointer', mb: isExpanded ? 2 : 0 }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Typography variant='body2' color='text.secondary'>
          Configure labels, annotations, and gates for cloned units
        </Typography>
        {isExpanded ? (
          <ExpandLess data-testid='collapse-unit-metadata-toggle' />
        ) : (
          <ExpandMore data-testid='expand-unit-metadata-toggle' />
        )}
      </Stack>

      <Collapse in={isExpanded}>
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

        {/* Annotations Section */}
        <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
          Annotations
        </Typography>
        <Grid container spacing={1} sx={{ mb: 2 }}>
          <Grid size={{ xs: 5 }}>
            <Autocomplete
              freeSolo
              size='small'
              value={newAnnotationKey}
              options={commonAnnotations}
              onChange={(_, newValue) => setNewAnnotationKey(newValue || '')}
              onInputChange={(_, newInputValue) => setNewAnnotationKey(newInputValue)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addAnnotation();
              }}
              renderInput={(params) => <TextField {...params} placeholder='key' />}
            />
          </Grid>
          <Grid size={{ xs: 5 }}>
            <TextField
              size='small'
              fullWidth
              value={newAnnotationValue}
              onChange={(e) => setNewAnnotationValue(e.target.value)}
              placeholder='value'
              onKeyDown={(e) => e.key === 'Enter' && addAnnotation()}
            />
          </Grid>
          <Grid size={{ xs: 2 }}>
            <Button
              data-testid='add-annotation-button'
              variant='outlined'
              fullWidth
              startIcon={<Add />}
              onClick={addAnnotation}
              disabled={!newAnnotationKey.trim() || !newAnnotationValue.trim()}
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

        {/* Destroy Gates Section */}
        <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
          Destroy Gates
        </Typography>
        <Grid container spacing={1} sx={{ mb: 2 }}>
          <Grid size={{ xs: 10 }}>
            <Autocomplete
              freeSolo
              size='small'
              data-testid='destroy-gate-autocomplete'
              value={newDestroyGateKey}
              options={commonDestroyGates}
              onChange={(_, newValue) => setNewDestroyGateKey(newValue || '')}
              onInputChange={(_, newInputValue) => setNewDestroyGateKey(newInputValue)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addDestroyGate();
              }}
              renderInput={(params) => (
                <TextField {...params} placeholder='e.g., production-protection' />
              )}
            />
          </Grid>
          <Grid size={{ xs: 2 }}>
            <Button
              data-testid='add-destroy-gate-button'
              variant='outlined'
              fullWidth
              startIcon={<Add />}
              onClick={addDestroyGate}
              disabled={!newDestroyGateKey.trim()}
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
                onDelete={() => onLabelsChange(labels.filter((label) => label.id !== l.id))}
              />
            ))}
            {annotations.map((a) => (
              <Chip
                key={a.id}
                label={`Annotation: ${a.key}: ${a.value}`}
                size='small'
                color='info'
                onDelete={() =>
                  onAnnotationsChange(
                    annotations.filter((annotation) => annotation.id !== a.id),
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
                  onDeleteGatesChange(deleteGates.filter((gate) => gate.id !== g.id))
                }
              />
            ))}
            {destroyGates.map((g) => (
              <Chip
                key={g.id}
                label={`Destroy Gate: ${g.key}`}
                size='small'
                color='error'
                onDelete={() =>
                  onDestroyGatesChange(destroyGates.filter((gate) => gate.id !== g.id))
                }
              />
            ))}
          </Box>
        )}
      </Collapse>
    </SectionCard>
  );
};

/**
 * SingleUnitCloneForm
 *
 * Form for cloning a single unit.
 * - Option to clone to existing space or create new space
 * - Clone name input
 */
const SingleUnitCloneForm = ({
  selectedUnit,
  spaces,
  control,
  errors,
  watch,
  setValue,
  targets,
}: {
  selectedUnit: UnitRead;
  spaces: SpaceRead[];
  control: ReturnType<typeof useForm<SingleUnitFormData>>['control'];
  errors: ReturnType<typeof useForm<SingleUnitFormData>>['formState']['errors'];
  watch: ReturnType<typeof useForm<SingleUnitFormData>>['watch'];
  setValue: ReturnType<typeof useForm<SingleUnitFormData>>['setValue'];
  targets: TargetRead[];
}) => {
  return (
    <Stack spacing={3}>
      <SectionCard title='Clone Configuration'>
        <Stack spacing={2}>
          <Box>
            <Grid container spacing={1}>
              <Grid size={{ xs: 12 }}>
                <Controller
                  name='targetSpaceId'
                  control={control}
                  rules={{
                    required: 'Space is required',
                  }}
                  render={({ field }) => (
                    <Autocomplete
                      data-testid='target-space-select'
                      options={spaces}
                      getOptionLabel={(option) => option?.DisplayName || ''}
                      value={spaces.find((s) => s.SpaceID === field.value) || null}
                      onChange={(_, newValue) => {
                        field.onChange(newValue?.SpaceID || '');
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label='Space'
                          placeholder='Select a space...'
                          error={!!errors.targetSpaceId}
                          helperText={errors.targetSpaceId?.message}
                          size='small'
                        />
                      )}
                      size='small'
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Box>

          <Controller
            name='cloneName'
            control={control}
            rules={{
              required: 'Clone name is required',
              pattern: {
                value: SLUG_PATTERN,
                message: SLUG_PATTERN_MESSAGE,
              },
            }}
            render={({ field }) => (
              <TextField
                {...field}
                data-testid='clone-name-input'
                label='Clone Name'
                placeholder='Enter name for the cloned unit...'
                error={!!errors.cloneName}
                helperText={errors.cloneName?.message}
                size='small'
                fullWidth
              />
            )}
          />

          {/* Target Section (Optional) */}
          <Box>
            <Controller
              name='targetId'
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={!!errors.targetId} size='small'>
                  <InputLabel>Target (Optional)</InputLabel>
                  <Select
                    {...field}
                    label='Target (Optional)'
                    size='small'
                    input={<OutlinedInput label='Target (Optional)' />}
                    data-testid='target-select'
                  >
                    <MenuItem value=''>
                      <em>No target assignment</em>
                    </MenuItem>
                    {targets.map((target) => (
                      <MenuItem key={target.TargetID} value={target.TargetID}>
                        <Stack spacing={0.5}>
                          <Typography variant='body2' sx={{ fontWeight: 500 }}>
                            {target.Slug}
                          </Typography>
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.targetId && (
                    <FormHelperText>{errors.targetId.message}</FormHelperText>
                  )}
                </FormControl>
              )}
            />
          </Box>
        </Stack>
      </SectionCard>
      <UnitMetadataManagementCard
        labels={watch('labels')}
        annotations={watch('annotations')}
        deleteGates={watch('deleteGates')}
        destroyGates={watch('destroyGates')}
        onLabelsChange={(value) => setValue('labels', value)}
        onAnnotationsChange={(value) => setValue('annotations', value)}
        onDeleteGatesChange={(value) => setValue('deleteGates', value)}
        onDestroyGatesChange={(value) => setValue('destroyGates', value)}
        unitsToEdit={[selectedUnit]}
      />
    </Stack>
  );
};

/**
 * MultiUnitCloneForm
 *
 * Form for cloning multiple units.
 * - Option to clone to existing space (different from source) or create new space
 * - Units keep their original names
 */
const MultiUnitCloneForm = ({
  selectedUnits,
  spaces,
  control,
  errors,
  watch,
  setValue,
  targets,
}: {
  selectedUnits: UnitRead[];
  spaces: SpaceRead[];
  control: ReturnType<typeof useForm<MultiUnitFormData>>['control'];
  errors: ReturnType<typeof useForm<MultiUnitFormData>>['formState']['errors'];
  watch: ReturnType<typeof useForm<MultiUnitFormData>>['watch'];
  setValue: ReturnType<typeof useForm<MultiUnitFormData>>['setValue'];
  targets: TargetRead[];
}) => {
  return (
    <Stack spacing={3}>
      <SectionCard title='Clone Configurations'>
        <Box sx={{ mt: 1 }}>
          <Grid container spacing={1}>
            <Grid size={{ xs: 12 }}>
              <Controller
                name='targetSpaceId'
                control={control}
                rules={{
                  required: 'Space is required',
                }}
                render={({ field }) => (
                  <Autocomplete
                    data-testid='target-space-select'
                    options={spaces}
                    getOptionLabel={(option) => option?.DisplayName || ''}
                    value={spaces.find((s) => s.SpaceID === field.value) || null}
                    onChange={(_, newValue) => {
                      field.onChange(newValue?.SpaceID || '');
                    }}
                    fullWidth
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label='Space'
                        placeholder='Select a space...'
                        error={!!errors.targetSpaceId}
                        helperText={
                          errors.targetSpaceId?.message ||
                          (spaces.length === 0
                            ? 'No other spaces available. Create a new space instead.'
                            : '')
                        }
                        size='small'
                      />
                    )}
                    size='small'
                    disabled={spaces.length === 0}
                  />
                )}
              />
            </Grid>
          </Grid>
        </Box>

        {/* Target Section (Optional) */}
        <Box sx={{ mt: 2 }}>
          <Controller
            name='targetId'
            control={control}
            render={({ field }) => (
              <FormControl fullWidth error={!!errors.targetId} size='small'>
                <InputLabel>Target (Optional)</InputLabel>
                <Select
                  {...field}
                  label='Target (Optional)'
                  size='small'
                  input={<OutlinedInput label='Target (Optional)' />}
                  data-testid='target-select'
                >
                  <MenuItem value=''>
                    <em>No target assignment</em>
                  </MenuItem>
                  {targets.map((target) => (
                    <MenuItem key={target.TargetID} value={target.TargetID}>
                      <Stack spacing={0.5}>
                        <Typography variant='body2' sx={{ fontWeight: 500 }}>
                          {target.Slug}
                        </Typography>
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
                {errors.targetId && <FormHelperText>{errors.targetId.message}</FormHelperText>}
              </FormControl>
            )}
          />
        </Box>
      </SectionCard>
      <UnitMetadataManagementCard
        labels={watch('labels')}
        annotations={watch('annotations')}
        deleteGates={watch('deleteGates')}
        destroyGates={watch('destroyGates')}
        onLabelsChange={(value) => setValue('labels', value)}
        onAnnotationsChange={(value) => setValue('annotations', value)}
        onDeleteGatesChange={(value) => setValue('deleteGates', value)}
        onDestroyGatesChange={(value) => setValue('destroyGates', value)}
        unitsToEdit={selectedUnits}
      />
    </Stack>
  );
};

/**
 * CloneUnitsDrawer - Main Modal Component
 *
 * A drawer for cloning units with different behavior based on selection count:
 *
 * SINGLE UNIT (1 unit):
 * - Select target space
 * - Enter custom name for the clone
 *
 * MULTIPLE UNITS (2+ units):
 * - Clone to existing space (different from source) OR create new space
 * - Units keep their original names
 *
 * @param isOpen - Controls drawer visibility
 * @param onClose - Callback when drawer closes
 * @param unitsToEdit - Array of units selected for cloning
 * @param spaces - Array of available spaces for cloning destination
 * @param refresh - Callback to refresh data after successful clone
 */
export const CloneUnitsDrawer = ({
  isOpen,
  onClose,
  unitsToEdit = [],
  spaces = [],
  refresh,
}: IUnitMutationModalProps) => {
  const navigate = useNavigate();
  const isSingleUnit = unitsToEdit.length === 1;
  const sourceSpaceId = unitsToEdit[0]?.SpaceID || '';

  // UI state
  const [isCloning, setIsCloning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<Array<string>>([]);

  // API mutations
  const [bulkCreateUnits, { data: bulkData, error: bulkError, isSuccess: bulkIsSuccess }] =
    useBulkCreateUnitsMutation();
  const [createUnit] = useCreateUnitMutation();
  const { trackEntityBulkCreated, trackEntityCreated } = useAnalytics();

  // Fetch targets for metadata card
  const { targets = [] } = useListAllTargetsQuery(
    {},
    {
      selectFromResult: (result) => ({
        targets:
          result?.data?.map((t) => t.Target).filter((t): t is TargetRead => t !== undefined) ||
          [],
      }),
    },
  );

  // Handle bulk create success/error (for multi-unit clone)
  useBulkApiErrorMessage(bulkError, bulkIsSuccess, bulkData, setErrorMessage, {
    onSuccess: () => {
      trackEntityBulkCreated({
        entity_type: ENTITY_TYPES.UNIT,
        count: unitsToEdit.length,
      });
      refresh?.();

      // Navigate to filtered view showing the newly cloned units
      if (bulkData && Array.isArray(bulkData)) {
        const clonedUnitIds = bulkData
          .filter((item) => item.Unit?.UnitID)
          .map((item) => `'${item.Unit?.UnitID}'`)
          .join(', ');

        if (clonedUnitIds) {
          const whereClause = `UnitID IN (${clonedUnitIds})`;
          navigate(`/units?${FILTER_URL_PARAMS.WHERE}=${encodeURIComponent(whereClause)}`);
        }
      }

      handleClose();
    },
  });

  // Single unit form - default to same space, empty name
  const singleUnitForm = useForm<SingleUnitFormData>({
    mode: 'onChange',
    defaultValues: {
      targetSpaceId: sourceSpaceId,
      cloneName: '',
      sourceSpaceId: '',
      newSpaceName: '',
      targetId: '',
      labels: [],
      deleteGates: [],
      destroyGates: [],
      annotations: [],
    },
  });

  // Multi-unit form
  const multiUnitForm = useForm<MultiUnitFormData>({
    mode: 'onChange',
    defaultValues: {
      targetSpaceId: '',
      sourceSpaceId: '',
      newSpaceName: '',
      targetId: '',
      labels: [],
      deleteGates: [],
      destroyGates: [],
      annotations: [],
    },
  });

  // Reset forms when drawer opens with new units
  useEffect(() => {
    if (isOpen) {
      singleUnitForm.reset({
        targetSpaceId: sourceSpaceId,
        cloneName: '',
        sourceSpaceId: '',
        newSpaceName: '',
        targetId: '',
        labels: [],
        deleteGates: [],
        destroyGates: [],
        annotations: [],
      });
      multiUnitForm.reset({
        targetSpaceId: '',
        sourceSpaceId: '',
        newSpaceName: '',
        targetId: '',
        labels: [],
        deleteGates: [],
        destroyGates: [],
        annotations: [],
      });
    }
  }, [isOpen, sourceSpaceId]);

  const handleClose = () => {
    singleUnitForm.reset({
      targetSpaceId: sourceSpaceId,
      cloneName: '',
      sourceSpaceId: '',
      newSpaceName: '',
      targetId: '',
      labels: [],
      deleteGates: [],
      destroyGates: [],
      annotations: [],
    });
    multiUnitForm.reset({
      targetSpaceId: '',
      sourceSpaceId: '',
      newSpaceName: '',
      targetId: '',
      labels: [],
      deleteGates: [],
      destroyGates: [],
      annotations: [],
    });
    setErrorMessage([]);
    onClose();
  };

  // Clone single unit using createUnit with upstream reference
  const handleSingleUnitClone = async (data: SingleUnitFormData) => {
    setIsCloning(true);
    try {
      const unit = unitsToEdit[0];
      const targetSpaceId = data.targetSpaceId;

      // Build metadata from form data
      const labels = data.labels.reduce(
        (acc, label) => {
          acc[label.key] = label.value;
          return acc;
        },
        {} as Record<string, string>,
      );

      const annotations = data.annotations.reduce(
        (acc, annotation) => {
          acc[annotation.key] = annotation.value;
          return acc;
        },
        {} as Record<string, string>,
      );

      const deleteGates = data.deleteGates.reduce(
        (acc, gate) => {
          acc[gate.key] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      );

      const destroyGates = data.destroyGates.reduce(
        (acc, gate) => {
          acc[gate.key] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      );

      const clonedUnit = await createUnit({
        spaceId: targetSpaceId,
        upstreamSpaceId: unit.SpaceID,
        upstreamUnitId: unit.UnitID,
        unit: {
          Slug: data.cloneName,
          ToolchainType: unit.ToolchainType || '',
          ...(data.targetId && { TargetID: data.targetId }),
          ...(Object.keys(labels).length > 0 && { Labels: labels }),
          ...(Object.keys(annotations).length > 0 && { Annotations: annotations }),
          ...(Object.keys(deleteGates).length > 0 && { DeleteGates: deleteGates }),
          ...(Object.keys(destroyGates).length > 0 && { DestroyGates: destroyGates }),
        },
      }).unwrap();

      // A write to a Unit answers with the operation's result; the Unit is inside it.
      const clonedUnitEntity = clonedUnit.Unit;
      trackEntityCreated({
        entity_type: ENTITY_TYPES.UNIT,
        entity_id: clonedUnitEntity?.UnitID || '',
      });
      refresh?.();
      handleClose();

      // Navigate to the cloned unit's detail page
      if (clonedUnitEntity?.SpaceID && clonedUnitEntity.UnitID) {
        navigate(`/units/${clonedUnitEntity.SpaceID}/${clonedUnitEntity.UnitID}`);
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) {
        const errorData = err as { data?: { message?: string } };
        setErrorMessage([errorData.data?.message || 'An error occurred']);
      }
    } finally {
      setIsCloning(false);
    }
  };

  // Clone multiple units
  const handleMultiUnitClone = async (data: MultiUnitFormData) => {
    setIsCloning(true);
    try {
      const targetSpaceId = data.targetSpaceId;

      const unitIds = unitsToEdit.map((unit) => `'${unit.UnitID}'`).join(',');
      const where = `UnitID IN (${unitIds})`;
      const whereSpace = `SpaceID IN ('${targetSpaceId}')`;

      // Build metadata from form data
      const labels = data.labels.reduce(
        (acc, label) => {
          acc[label.key] = label.value;
          return acc;
        },
        {} as Record<string, string>,
      );

      const annotations = data.annotations.reduce(
        (acc, annotation) => {
          acc[annotation.key] = annotation.value;
          return acc;
        },
        {} as Record<string, string>,
      );

      const deleteGates = data.deleteGates.reduce(
        (acc, gate) => {
          acc[gate.key] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      );

      const destroyGates = data.destroyGates.reduce(
        (acc, gate) => {
          acc[gate.key] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      );

      const bodyData = {
        ...(data.targetId && { TargetID: data.targetId }),
        ...(Object.keys(labels).length > 0 && { Labels: labels }),
        ...(Object.keys(annotations).length > 0 && { Annotations: annotations }),
        ...(Object.keys(deleteGates).length > 0 && { DeleteGates: deleteGates }),
        ...(Object.keys(destroyGates).length > 0 && { DestroyGates: destroyGates }),
      };

      // No namePrefixes needed - cloning to different space keeps original names
      await bulkCreateUnits({
        where,
        whereSpace,
        // @ts-expect-error RTK Query body serialization workaround
        body: JSON.stringify(bodyData),
      });
    } catch (err) {
      // Error handling is done by useBulkApiErrorMessage
      if (err && typeof err === 'object' && 'data' in err) {
        const errorData = err as { data?: { message?: string } };
        setErrorMessage([errorData.data?.message || 'An error occurred']);
      }
    } finally {
      setIsCloning(false);
    }
  };

  // Form validation
  const watchedMultiValues = multiUnitForm.watch();
  const watchedSingleValues = singleUnitForm.watch();

  const isSingleFormValid = Boolean(
    watchedSingleValues.targetSpaceId && watchedSingleValues.cloneName?.trim(),
  );

  const isMultiFormValid = Boolean(watchedMultiValues.targetSpaceId);

  const isFormValid = isSingleUnit ? isSingleFormValid : isMultiFormValid;

  return (
    <Drawer
      anchor='right'
      open={isOpen}
      onClose={handleClose}
      sx={{
        // Height is intentionally left to the theme's MuiDrawer override, which
        // sizes right-anchored drawers to the viewport minus the top nav.
        '& .MuiDrawer-paper': {
          width: { xs: 1000 },
        },
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
              Back to Units
            </Button>
          </Stack>
          <Typography
            variant='h5'
            component='h1'
            sx={{
              fontWeight: 600,
            }}
          >
            Clone {isSingleUnit ? 'Unit' : 'Units'}
          </Typography>
        </Box>

        {/* Content */}
        <Box
          sx={{
            flex: 1,
            p: 3,
            pb: 12,
            backgroundColor: 'rgb(249, 250, 251)',
            overflowY: 'auto',
          }}
        >
          <ErrorList errors={errorMessage} onClose={() => setErrorMessage([])} />

          <Form
            onSubmit={
              isSingleUnit
                ? singleUnitForm.handleSubmit(handleSingleUnitClone)
                : multiUnitForm.handleSubmit(handleMultiUnitClone)
            }
          >
            {isSingleUnit ? (
              <SingleUnitCloneForm
                selectedUnit={unitsToEdit[0]}
                spaces={spaces}
                control={singleUnitForm.control}
                errors={singleUnitForm.formState.errors}
                watch={singleUnitForm.watch}
                setValue={singleUnitForm.setValue}
                targets={targets}
              />
            ) : (
              <MultiUnitCloneForm
                selectedUnits={unitsToEdit}
                spaces={spaces}
                control={multiUnitForm.control}
                errors={multiUnitForm.formState.errors}
                watch={multiUnitForm.watch}
                setValue={multiUnitForm.setValue}
                targets={targets}
              />
            )}
          </Form>
        </Box>

        {/* Submit Button */}
        <FixedSubmitContainer>
          <Button
            variant='contained'
            fullWidth
            disabled={!isFormValid || isCloning}
            onClick={
              isSingleUnit
                ? singleUnitForm.handleSubmit(handleSingleUnitClone)
                : multiUnitForm.handleSubmit(handleMultiUnitClone)
            }
          >
            {isCloning ? 'Cloning...' : isSingleUnit ? 'Clone Unit' : `Clone Units`}
          </Button>
        </FixedSubmitContainer>
      </Box>
    </Drawer>
  );
};
