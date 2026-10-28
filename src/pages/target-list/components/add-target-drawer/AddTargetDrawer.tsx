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
 * - Labels, annotations, facts and delete gates, edited as rows of key/value fields
 * - Space selection
 * - Selecting the Triggers invoked on the Units attached to the target, and showing which are
 */
import { useEffect, useState } from 'react';
import { Control, Controller, FieldErrors, useForm } from 'react-hook-form';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { EntityRefSelect } from '@/components/entity-ref-select/EntityRefSelect';
import { useFilterRefOptions } from '@/components/entity-ref-select/useEntityRefOptions';
import { ErrorList } from '@/components/error-list/ErrorList';
import { MapFieldSection } from '@/components/map-field-editor/MapFieldSection';
import { type MapRow, mapToRows, rowsToGates, rowsToMap } from '@/components/map-field-editor/map-rows';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { TriggerSelectionBar } from '@/components/trigger-selection/TriggerSelectionBar';
import { useTriggerSelection } from '@/components/trigger-selection/useTriggerSelection';
import { TriggersTable } from '@/pages/space-detail/components/triggers-table/TriggersTable';
import { getApiErrorMessage } from '@/utility/error-functions';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  CreateTargetApiArg,
  SpaceRead,
  Target,
  TargetRead,
  UpdateTargetApiArg,
  useCreateTargetMutation,
  useListSpacesQuery,
  usePatchTargetMutation,
  useUpdateTargetMutation,
} from '@confighub/rtk-query';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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

// The form edits the target's maps as rows, so an entry can be changed in place.
type TargetFormValues = Omit<Target, 'Labels' | 'Annotations' | 'DeleteGates' | 'Facts'> & {
  Labels: MapRow[];
  Annotations: MapRow[];
  DeleteGates: MapRow[];
  Facts: MapRow[];
};

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
 * Handles basic target information: name and space.
 */
const BasicInfoCard = ({
  control,
  errors,
  spaces,
  isEditMode,
}: {
  control: Control<TargetFormValues>;
  errors: FieldErrors<TargetFormValues>;
  spaces: SpaceRead[];
  isEditMode: boolean;
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

        <Grid size={{ xs: 12 }}>
          <Controller
            name='DisplayName'
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value || ''}
                label='Display Name'
                fullWidth
                size='small'
                placeholder='Defaults to the name'
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
      </Grid>
    </SectionCard>
  );
};

// How long the Where Trigger has to stay unchanged before the Triggers it selects are listed.
const WHERE_TRIGGER_PREVIEW_DELAY_MS = 400;

/**
 * TriggersCard
 *
 * Selects the Triggers invoked on the Units attached to the target, and lists them: those it
 * applies, and those its selector, as edited, selects.
 */
const TriggersCard = ({
  control,
  whereTrigger,
  triggerFilterId,
  existingTarget,
}: {
  control: Control<TargetFormValues>;
  whereTrigger: string;
  triggerFilterId: string;
  existingTarget?: TargetRead;
}) => {
  const { options: triggerFilterOptions, isFetching: isTriggerFiltersLoading } =
    useFilterRefOptions('Trigger');
  const [patchTarget, { isLoading: isRefreshing, error: refreshError }] = usePatchTargetMutation();

  const [previewWhere, setPreviewWhere] = useState(whereTrigger);
  useEffect(() => {
    const timer = setTimeout(() => setPreviewWhere(whereTrigger), WHERE_TRIGGER_PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [whereTrigger]);

  const selection = useTriggerSelection({
    selector: {
      WhereTrigger: previewWhere.trim(),
      TriggerFilterID: triggerFilterId,
      TriggerIDs: existingTarget?.TriggerIDs,
    },
  });

  const selectorChanged =
    whereTrigger.trim() !== (existingTarget?.WhereTrigger || '') ||
    triggerFilterId !== (existingTarget?.TriggerFilterID || '');

  const refreshTriggers = async () => {
    if (!existingTarget?.TargetID || !existingTarget.SpaceID) return;
    await patchTarget({
      spaceId: existingTarget.SpaceID,
      targetId: existingTarget.TargetID,
      refreshTriggers: true,
      body: {},
    });
    selection.refetch();
  };

  const triggerFilterName = triggerFilterOptions.find((o) => o.id === triggerFilterId)?.label;

  return (
    <SectionCard title='Triggers'>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
        Triggers selected here are invoked on the Units attached to this target, in addition to
        those their Space selects. With neither a Where Trigger nor a Trigger Filter, none are;
        with both, a Trigger must match both.
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 7 }}>
          <Controller
            name='WhereTrigger'
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value || ''}
                label='Where Trigger'
                fullWidth
                size='small'
                placeholder="Labels.Purpose = 'policy'"
                helperText='A where expression over Triggers in any Space'
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: {
                    'data-testid': 'target-where-trigger-input',
                    style: { fontFamily: 'monospace' },
                  },
                }}
              />
            )}
          />
        </Grid>
        <Grid size={{ xs: 5 }}>
          <Controller
            name='TriggerFilterID'
            control={control}
            render={({ field }) => (
              <EntityRefSelect
                label='Trigger Filter'
                value={field.value || ''}
                onChange={field.onChange}
                options={triggerFilterOptions}
                loading={isTriggerFiltersLoading}
                helperText='A Trigger Filter from any Space'
                testId='target-trigger-filter-select'
              />
            )}
          />
        </Grid>
      </Grid>
      <TriggerSelectionBar
        entityName='Target'
        whereTrigger={previewWhere.trim()}
        triggerFilterName={triggerFilterName}
        selection={selection}
        onRefresh={existingTarget ? refreshTriggers : undefined}
        isRefreshing={isRefreshing}
        refreshError={
          refreshError
            ? getApiErrorMessage(refreshError, 'The Triggers could not be refreshed.')
            : undefined
        }
        selectorChanged={selectorChanged}
      />
      <TriggersTable
        where={`TriggerID IN (${selection.allIds.map((id) => `'${id}'`).join(',')})`}
        skip={selection.allIds.length === 0}
        selectionStatusById={selection.statusById}
        persistenceKey='target-triggers-table'
        emptyState={
          <Typography variant='body2' color='text.secondary'>
            No Triggers are selected.
          </Typography>
        }
      />
    </SectionCard>
  );
};

// The fields the form edits besides the slug and metadata maps; an empty one is cleared.
const selectionFields = (data: TargetFormValues): Partial<Target> => ({
  DisplayName: data.DisplayName || undefined,
  Facts: rowsToMap(data.Facts),
  WhereTrigger: (data.WhereTrigger || '').trim(),
  TriggerFilterID: data.TriggerFilterID || undefined,
});

// The form's values for a target, or for a new one.
const targetFormValues = (target: TargetRead | undefined): TargetFormValues => ({
  Slug: target?.Slug || '',
  DisplayName: target?.DisplayName || '',
  SpaceID: target?.SpaceID || '',
  Labels: mapToRows(target?.Labels),
  Annotations: mapToRows(target?.Annotations),
  DeleteGates: mapToRows(target?.DeleteGates),
  Facts: mapToRows(target?.Facts),
  WhereTrigger: target?.WhereTrigger || '',
  TriggerFilterID: target?.TriggerFilterID || '',
});

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

  const isEditMode = !!existingTarget;

  const { data: extendedSpaces = [] } = useListSpacesQuery({});
  const spaces = extendedSpaces
    .map((es) => es.Space)
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<TargetFormValues>({
    defaultValues: targetFormValues(existingTarget),
  });

  const [createTarget, { isSuccess: isCreateSuccess, error: createError, data: createData }] =
    useCreateTargetMutation();
  const [updateTarget, { isSuccess: isUpdateSuccess, error: updateError, data: updateData }] =
    useUpdateTargetMutation();
  const { trackEntityCreated } = useAnalytics();

  useEffect(() => {
    reset(targetFormValues(existingTarget));
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

  const handleClose = () => {
    reset();
    setServerError('');
    onClose();
  };

  const onSubmit = async (data: TargetFormValues) => {
    setIsSubmitting(true);

    try {
      if (isEditMode && existingTarget) {
        // Update existing target
        const input: UpdateTargetApiArg = {
          targetId: existingTarget.TargetID || '',
          spaceId: data.SpaceID || '',
          target: {
            ...existingTarget,
            ...selectionFields(data),
            Slug: data.Slug,
            Labels: rowsToMap(data.Labels),
            Annotations: rowsToMap(data.Annotations),
            DeleteGates: rowsToGates(data.DeleteGates),
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
            ...selectionFields(data),
            Slug: data.Slug,
            SpaceID: data.SpaceID,
            OrganizationID: space.OrganizationID || '',
            Labels: rowsToMap(data.Labels),
            Annotations: rowsToMap(data.Annotations),
            DeleteGates: rowsToGates(data.DeleteGates),
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
              isEditMode={isEditMode}
            />
            <MapFieldSection
              control={control}
              name='Labels'
              title='Labels'
              itemLabel='label'
              validation='label'
              keyPlaceholder='Environment'
              valuePlaceholder='production'
              testId='target-labels'
            />
            <MapFieldSection
              control={control}
              name='Annotations'
              title='Annotations'
              itemLabel='annotation'
              validation='annotation'
              multilineValues
              keyPlaceholder='config.hash'
              valuePlaceholder='abc123'
              testId='target-annotations'
            />
            <TriggersCard
              control={control}
              whereTrigger={watch('WhereTrigger') || ''}
              triggerFilterId={watch('TriggerFilterID') || ''}
              existingTarget={existingTarget}
            />
            <MapFieldSection
              control={control}
              name='Facts'
              title='Facts'
              description='Properties of the infrastructure this target represents, available to functions and in where expressions. Fact collection rewrites the facts it collects.'
              itemLabel='fact'
              keyPlaceholder='region'
              valuePlaceholder='us-west-2'
              testId='target-facts'
            />
            <MapFieldSection
              control={control}
              name='DeleteGates'
              title='Delete Gates'
              description='Delete gates prevent accidental deletion of this target. Remove all gates before deletion.'
              itemLabel='delete gate'
              validation='label'
              keysOnly
              keyPlaceholder='e.g., manual-review, backup-verified'
              testId='target-delete-gates'
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
