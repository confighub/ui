// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';
import { Control, Controller, FieldErrors, useForm } from 'react-hook-form';

import { BackingUnitHeaderField } from '@/components/backing-unit/BackingUnitHeaderField';
import {
  type BackingUnitChoice,
  NO_BACKING_UNIT,
} from '@/components/backing-unit/backingUnitChoice';
import { backingUnitFailureMessage, enableBackingUnit } from '@/components/backing-unit/enableBackingUnit';
import { ClearanceFieldSection } from '@/components/clearance-field/ClearanceFieldSection';
import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { EntityRefSelect, type EntityRefOption } from '@/components/entity-ref-select/EntityRefSelect';
import {
  useFilterRefOptions,
  useParameterlessInvocationRefOptions,
} from '@/components/entity-ref-select/useEntityRefOptions';
import { DEFAULT_TOOLCHAIN_TYPES } from '@/components/query-builder';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FunctionParametersField } from '@/components/function-parameters-field/FunctionParametersField';
import { MapFieldSection } from '@/components/map-field-editor/MapFieldSection';
import {
  SimpleFunctionPicker,
  type SimpleFunctionOption,
} from '@/components/simple-function-picker/SimpleFunctionPicker';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { defaultTriggerFormInput } from '@/hooks/triggerFormBody';
import { IAddTriggerFormInput, useAddTrigger } from '@/hooks/useAddTrigger';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useAppDispatch } from '@/hooks/useApp';
import {
  FunctionChannelOption,
  functionListArgs,
  useFunctionChannels,
} from '@/hooks/useFunctionChannels';
import {
  FunctionSignature,
  ListFunctionsApiResponse,
  SpaceRead,
  TriggerRead,
  useListFunctionsQuery,
} from '@confighub/rtk-query';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import ArrowBack from '@mui/icons-material/ArrowBack';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Lock from '@mui/icons-material/Lock';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { TriggerDocumentDialog } from './TriggerDocumentDialog';

// Types
export interface AddTriggerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  orgID: string;
  /** The Space a new Trigger is created in; empty to have the user pick one of `spaces` */
  spaceId: string;
  /** The Spaces a new Trigger can be created in, when `spaceId` is empty */
  spaces?: SpaceRead[];
  onTriggerCreated?: (trigger: TriggerRead) => void;
  onTriggerUpdated?: (trigger: TriggerRead) => void;
  existingTrigger?: TriggerRead;
}

/**
 * BasicInfoCard
 *
 * Handles basic trigger information like slug, display name, toolchain type, and event type.
 */
const BasicInfoCard = ({
  control,
  errors,
}: {
  control: Control<IAddTriggerFormInput>;
  errors: FieldErrors<IAddTriggerFormInput>;
}) => {
  return (
    <SectionCard title='Basic Information'>
      <Grid container spacing={2}>
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
                placeholder='my-trigger-name'
              />
            )}
          />
        </Grid>

        <Grid size={{ xs: 6 }}>
          <Controller
            name='DisplayName'
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label='Display Name (Optional)'
                fullWidth
                size='small'
              />
            )}
          />
        </Grid>

        <Grid size={{ xs: 6 }}>
          <Controller
            name='ToolchainType'
            control={control}
            rules={{ required: 'Toolchain Type is required' }}
            render={({ field }) => (
              <FormControl fullWidth size='small' error={!!errors.ToolchainType}>
                <InputLabel>Toolchain Type</InputLabel>
                <Select
                  {...field}
                  label='Toolchain Type'
                  input={<OutlinedInput label='Toolchain Type' />}
                >
                  {DEFAULT_TOOLCHAIN_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </Select>
                {errors.ToolchainType && (
                  <FormHelperText>{errors.ToolchainType.message}</FormHelperText>
                )}
              </FormControl>
            )}
          />
        </Grid>

        <Grid size={{ xs: 6 }}>
          <Controller
            name='EventType'
            control={control}
            rules={{ required: 'Event Type is required' }}
            render={({ field }) => (
              <FormControl fullWidth size='small' error={!!errors.EventType}>
                <InputLabel>Event Type</InputLabel>
                <Select
                  {...field}
                  label='Event Type'
                  input={<OutlinedInput label='Event Type' />}
                >
                  <MenuItem value='Mutation'>Mutation</MenuItem>
                  <MenuItem value='PostClone'>Post-Clone</MenuItem>
                </Select>
                {errors.EventType && (
                  <FormHelperText>{errors.EventType.message}</FormHelperText>
                )}
              </FormControl>
            )}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Controller
            name='Description'
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label='Description (Optional)'
                fullWidth
                size='small'
                multiline
                minRows={2}
                helperText='What the Trigger is for, what it detects, and how to fix what it finds. Shown with its results.'
                data-testid='trigger-description'
              />
            )}
          />
        </Grid>
      </Grid>
    </SectionCard>
  );
};

/**
 * StatusAndFunctionCard
 *
 * Combined card for status toggle and function configuration.
 */
const StatusAndFunctionCard = ({
  control,
  errors,
  functions,
  channels,
  selectedFunction,
  selectedFunctionOption,
  handleFunctionSelect,
  updateArgumentValue,
  runsInvocation,
  invocations,
  invocationsLoading,
}: {
  control: Control<IAddTriggerFormInput>;
  errors: FieldErrors<IAddTriggerFormInput>;
  runsInvocation: boolean;
  invocations: EntityRefOption[];
  invocationsLoading: boolean;
  selectedFunction: FunctionSignature;
  selectedFunctionOption: SimpleFunctionOption | null;
  functions: ListFunctionsApiResponse | undefined;
  channels: FunctionChannelOption[];
  handleFunctionSelect: (functionData: FunctionSignature) => void;
  updateArgumentValue: (paramName: string, value: string) => void;
}) => {
  const [showFunctionInfo, setShowFunctionInfo] = useState(false);

  return (
    <SectionCard
      title='Function Configuration'
      action={
        <Controller
          name='Disabled'
          control={control}
          render={({ field }) => (
            <Stack direction='row' spacing={1} alignItems='center'>
              <Typography
                variant='body2'
                sx={{
                  color: field.value ? 'text.secondary' : 'primary.main',
                  fontWeight: 500,
                }}
              >
                {field.value ? 'Disabled' : 'Enabled'}
              </Typography>
              <ToggleButtonGroup
                value={field.value}
                color='primary'
                exclusive
                size='small'
                onChange={(_event, value) => {
                  if (value !== null) {
                    field.onChange(value);
                  }
                }}
                sx={{
                  '& .MuiToggleButton-root': {
                    px: 1.5,
                    py: 0.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    '&.Mui-selected': {
                      backgroundColor: 'primary.main',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                    },
                  },
                }}
              >
                <Tooltip title='Trigger is enabled and will execute on matching events' arrow>
                  <ToggleButton value={false}>
                    <CheckCircle fontSize='small' />
                  </ToggleButton>
                </Tooltip>
                <Tooltip title='Trigger is disabled and will not execute' arrow>
                  <ToggleButton value={true}>
                    <Lock fontSize='small' />
                  </ToggleButton>
                </Tooltip>
              </ToggleButtonGroup>
            </Stack>
          )}
        />
      }
    >
      <Grid container spacing={2}>
        {/* What the Trigger runs */}
        <Grid size={{ xs: 12 }}>
          <Controller
            name='Source'
            control={control}
            render={({ field }) => (
              <ToggleButtonGroup
                value={field.value}
                color='primary'
                exclusive
                size='small'
                onChange={(_event, value) => {
                  if (value !== null) {
                    field.onChange(value);
                  }
                }}
                sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.5, textTransform: 'none' } }}
              >
                <Tooltip title='Run a function with the arguments given here' arrow>
                  <ToggleButton value='Function'>Function</ToggleButton>
                </Tooltip>
                <Tooltip title='Run a stored Invocation, which names its functions and where they run' arrow>
                  <ToggleButton value='Invocation'>Invocation</ToggleButton>
                </Tooltip>
              </ToggleButtonGroup>
            )}
          />
        </Grid>

        {runsInvocation ? (
          <Grid size={{ xs: 6 }}>
            <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
              Invocation
            </Typography>
            <Controller
              name='InvocationID'
              control={control}
              rules={{
                validate: (value, values) =>
                  values.Source !== 'Invocation' || !!value || 'Invocation is required',
              }}
              render={({ field }) => (
                <EntityRefSelect
                  label='Invocation'
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  options={invocations}
                  loading={invocationsLoading}
                  helperText={
                    errors.InvocationID?.message ||
                    'Invocations of this toolchain that declare no parameters, since a Trigger has no caller to supply them'
                  }
                  testId='trigger-invocation'
                />
              )}
            />
          </Grid>
        ) : (
        <Grid size={{ xs: 6 }}>
          <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
            Function
          </Typography>
          <Controller
            name='FunctionName'
            control={control}
            rules={{
              validate: (value, values) =>
                values.Source === 'Invocation' || !!value || 'Function is required',
            }}
            render={() => (
              <Box>
                <SimpleFunctionPicker
                  label='Function Name'
                  functions={functions}
                  onSelect={handleFunctionSelect}
                  value={selectedFunctionOption}
                  size='small'
                  fullWidth
                />
                {errors.FunctionName && (
                  <FormHelperText error sx={{ ml: '14px' }}>
                    {errors.FunctionName.message}
                  </FormHelperText>
                )}
              </Box>
            )}
          />
        </Grid>

        )}

        {/* Channel */}
        <Grid size={{ xs: 6 }}>
          <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
            Channel
          </Typography>
          <Controller
            name='ChannelID'
            control={control}
            render={({ field }) => (
              <FormControl fullWidth size='small'>
                <InputLabel>Channel (Optional)</InputLabel>
                <Select
                  {...field}
                  value={runsInvocation ? '' : (field.value ?? '')}
                  disabled={runsInvocation}
                  label='Channel (Optional)'
                  input={<OutlinedInput label='Channel (Optional)' />}
                >
                  <MenuItem value=''>None</MenuItem>
                  {channels.map((channel) => (
                    <MenuItem key={channel.id} value={channel.id}>
                      {channel.label}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {runsInvocation
                    ? 'A Trigger that runs an Invocation runs it where the Invocation says.'
                    : 'A Trigger on a Channel holds changes until the Channel\u2019s client runs it.'}
                </FormHelperText>
              </FormControl>
            )}
          />
        </Grid>

        {/* Warn Mode */}
        <Grid size={{ xs: 6 }}>
          <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
            Validation Mode
          </Typography>
          <Controller
            name='Warn'
            control={control}
            render={({ field }) => (
              <ToggleButtonGroup
                value={field.value || false}
                color='primary'
                exclusive
                size='small'
                onChange={(_event, value) => {
                  if (value !== null) {
                    field.onChange(value);
                  }
                }}
                sx={{
                  '& .MuiToggleButton-root': {
                    px: 1.5,
                    py: 0.5,
                    textTransform: 'none',
                  },
                }}
              >
                <Tooltip title='Validation failures block Apply operations' arrow>
                  <ToggleButton value={false}>Blocking</ToggleButton>
                </Tooltip>
                <Tooltip title='Validation failures produce non-blocking warnings' arrow>
                  <ToggleButton value={true}>Warn</ToggleButton>
                </Tooltip>
              </ToggleButtonGroup>
            )}
          />
        </Grid>

        {/* Other data source */}
        <Grid size={{ xs: 6 }}>
          <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
            Other Data Source
          </Typography>
          <Controller
            name='OtherDataSource'
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label='Revision (Optional)'
                fullWidth
                size='small'
                placeholder='LastReleasedRevisionNum'
                helperText='Another revision of the Unit to pass to the function, for one that compares against a baseline, such as vet-immutable. Takes what restore takes, such as Before:HeadRevisionNum. Empty uses what the function expects.'
              />
            )}
          />
        </Grid>

        {/* Function Parameters */}
        {!runsInvocation && selectedFunction.Parameters?.map((param) => (
          <Grid size={{ xs: 6 }} key={param.ParameterName}>
            <FunctionParametersField
              param={param}
              // @ts-expect-error: TODO: Fix type
              control={control}
              // @ts-expect-error: TODO: Fix type
              errors={errors}
              updateArgumentValue={updateArgumentValue}
              selectedFunction={selectedFunction}
            />
          </Grid>
        ))}
      </Grid>

      {/* Function Info - Expandable */}
      {!runsInvocation && selectedFunction && selectedFunction.FunctionName && (
        <Box sx={{ mt: 2 }}>
          <Button
            size='small'
            endIcon={showFunctionInfo ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setShowFunctionInfo(!showFunctionInfo)}
            sx={{
              textTransform: 'none',
              fontWeight: 'normal',
              color: 'text.secondary',
              mb: showFunctionInfo ? 1 : 0,
            }}
          >
            <Typography variant='caption' sx={{ color: 'text.secondary' }}>
              {showFunctionInfo ? 'Hide' : 'Show'} function details
            </Typography>
          </Button>

          {showFunctionInfo && (
            <Alert severity='info'>
              <Typography variant='body2'>
                <strong>Selected Function:</strong> {selectedFunction.Description}
              </Typography>
              <Typography variant='caption' display='block' sx={{ mt: 1 }}>
                Type:{' '}
                {selectedFunction.Mutating
                  ? 'Mutating'
                  : selectedFunction.Validating
                    ? 'Validating'
                    : 'Readonly'}{' '}
                | Affected Resources:{' '}
                {selectedFunction.AffectedResourceTypes?.join(', ') || 'All'}
              </Typography>
            </Alert>
          )}
        </Box>
      )}
    </SectionCard>
  );
};

/**
 * AppliesToCard
 *
 * Which Units the Trigger applies to, and which resources in them its function operates on.
 */
const AppliesToCard = ({
  control,
  unitFilters,
  unitFiltersLoading,
}: {
  control: Control<IAddTriggerFormInput>;
  unitFilters: EntityRefOption[];
  unitFiltersLoading: boolean;
}) => (
  <SectionCard title='Applies To'>
    <Grid container spacing={2}>
      <Grid size={{ xs: 6 }}>
        <Controller
          name='WhereUnit'
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              label='Where Unit (Optional)'
              fullWidth
              size='small'
              placeholder="Space.Labels.Environment = 'prod'"
              helperText='Only the Units this expression selects. It takes what a Unit list takes, attributes of what a Unit refers to included.'
              data-testid='trigger-where-unit'
            />
          )}
        />
      </Grid>
      <Grid size={{ xs: 6 }}>
        <Controller
          name='UnitFilterID'
          control={control}
          render={({ field }) => (
            <EntityRefSelect
              label='Unit Filter (Optional)'
              value={field.value ?? ''}
              onChange={field.onChange}
              options={unitFilters}
              loading={unitFiltersLoading}
              helperText='Only the Units a Filter of Units selects. With Where Unit, both apply.'
              testId='trigger-unit-filter'
            />
          )}
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Controller
          name='WhereResource'
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              label='Where Resource (Optional)'
              fullWidth
              size='small'
              placeholder="ConfigHub.ResourceType = 'apps/v1/Deployment'"
              helperText="Only the resources in each Unit's configuration this expression selects."
            />
          )}
        />
      </Grid>
    </Grid>
  </SectionCard>
);

/**
 * WritesCard
 *
 * What the Trigger says about the paths its function writes: whether a merge from upstream leaves
 * them alone, the guards it records on them, and the guards it is cleared to write over.
 */
const WritesCard = ({
  control,
  validating,
}: {
  control: Control<IAddTriggerFormInput>;
  validating: boolean;
}) => {
  return (
    <SectionCard title='Writes'>
      <Stack spacing={2}>
        <Controller
          name='Protect'
          control={control}
          render={({ field }) => (
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={!validating && !!field.value}
                    disabled={validating}
                    onChange={(_, checked) => field.onChange(checked)}
                  />
                }
                label='Keep on merge'
              />
              <FormHelperText sx={{ mt: 0 }}>
                {validating
                  ? 'A validating function writes nothing to keep.'
                  : 'Record the paths the function writes as kept on merge, so a merge from upstream does not overwrite them. For a Trigger that decides a value once, such as a Post-Clone Trigger customizing a variant.'}
              </FormHelperText>
            </Box>
          )}
        />
        <MapFieldSection
          control={control}
          name='Guards'
          title='Guards'
          description='Reasons to record on the paths the function writes, so a later change has to be cleared for them before overwriting.'
          itemLabel='guard'
          validation='label'
          keyPlaceholder='owner'
          valuePlaceholder='platform'
          disabled={validating}
          testId='trigger-guards'
        />
        <ClearanceFieldSection
          control={control}
          name='Clearance'
          description='The guards the function may write over. A path whose guards it is not cleared for is left as it is, and the change it would have made is recorded as a conflict.'
          testId='trigger-clearance'
        />
      </Stack>
    </SectionCard>
  );
};

/**
 * AddTriggerDrawer
 *
 * Main component for adding triggers with a drawer interface.
 */
export const AddTriggerDrawer = ({
  isOpen,
  onClose,
  orgID,
  spaceId: fixedSpaceId,
  spaces,
  onTriggerCreated,
  onTriggerUpdated,
  existingTrigger,
}: AddTriggerDrawerProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingDocument, setEditingDocument] = useState(false);
  const isEditMode = !!existingTrigger;
  const dispatch = useAppDispatch();
  const [backingUnit, setBackingUnit] = useState<BackingUnitChoice>(NO_BACKING_UNIT);
  // While an update is followed by giving the Trigger a backing Unit, the drawer stays open until
  // that is done too, so that a failure is shown rather than closed away.
  const enablingAfterUpdate = useRef(false);

  // A Trigger is changed where it resides; a new one is created in the page's Space, or, on a
  // page of Triggers from all Spaces, in the one picked here.
  const [pickedSpaceId, setPickedSpaceId] = useState('');
  const picksSpace = !isEditMode && !fixedSpaceId;
  const spaceId = existingTrigger?.SpaceID || fixedSpaceId || pickedSpaceId;
  const pickedSpace = spaces?.find((space) => space.SpaceID === spaceId);
  const organizationId = orgID || existingTrigger?.OrganizationID || pickedSpace?.OrganizationID || '';

  const { channels } = useFunctionChannels();

  const defaultValues = useMemo(() => defaultTriggerFormInput(), []);

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<IAddTriggerFormInput>({
    defaultValues,
  });

  const {
    handleFunctionSelect,
    updateArgumentValue,
    submitTrigger,
    selectedFunction,
    isSuccess,
    error,
    data,
    serverError,
    setServerError,
    setSelectedFunction,
  } = useAddTrigger(organizationId, spaceId, existingTrigger, { setValue, watch, reset });

  const watchedToolchainType = watch('ToolchainType');
  const watchedChannelId = watch('ChannelID');
  const runsInvocation = watch('Source') === 'Invocation';

  const { options: invocationOptions, isFetching: invocationsLoading } = useParameterlessInvocationRefOptions(
    watchedToolchainType,
    !isOpen || !runsInvocation,
  );
  const { options: unitFilterOptions, isFetching: unitFiltersLoading } = useFilterRefOptions(
    'Unit',
    !isOpen,
  );
  // Keep on merge and guards are about what a function writes; a validating function writes
  // nothing. A Trigger that runs an Invocation is checked by the server, which reads its functions.
  const validatingFunction =
    !runsInvocation && !!selectedFunction.Validating && !selectedFunction.Mutating;

  // The function picker offers what the chosen executor serves, which the server checks the
  // Trigger's function against when it is stored.
  const { data: functions = {} } = useListFunctionsQuery(
    {
      spaceId,
      ...functionListArgs(watchedChannelId),
    },
    { skip: !spaceId },
  );

  /**
   * Filtered subset of functions for the current toolchain, restricted to
   * Mutating, Validating, and AttributeValueList functions — the only types
   * that make sense as trigger functions.
   */
  const filteredFunctions = useMemo<ListFunctionsApiResponse | undefined>(() => {
    if (!watchedToolchainType) return undefined;
    const toolchainFuncs = functions[watchedToolchainType];
    if (!toolchainFuncs) return undefined;
    const filtered = Object.fromEntries(
      Object.entries(toolchainFuncs).filter(
        ([, func]) =>
          func.Mutating ||
          func.Validating ||
          func.OutputInfo?.OutputType === 'AttributeValueList',
      ),
    );
    return Object.keys(filtered).length > 0 ? { [watchedToolchainType]: filtered } : undefined;
  }, [functions, watchedToolchainType]);

  /** SimpleFunctionOption shape of the currently selected function for controlled display. */
  const selectedFunctionOption = useMemo<SimpleFunctionOption | null>(() => {
    if (!selectedFunction.FunctionName) return null;
    return { ...selectedFunction, category: watchedToolchainType };
  }, [selectedFunction, watchedToolchainType]);

  // Clear selected function when toolchain type changes and the function is no longer valid
  useEffect(() => {
    if (watchedToolchainType && selectedFunction.FunctionName) {
      const isValidFunction = !!(
        filteredFunctions?.[watchedToolchainType]?.[selectedFunction.FunctionName]
      );
      if (!isValidFunction) {
        setSelectedFunction({});
        setValue('FunctionName', '');
      }
    }
  }, [watchedToolchainType, selectedFunction.FunctionName, filteredFunctions, setSelectedFunction, setValue]);

  // Populate selectedFunction when editing an existing trigger
  useEffect(() => {
    if (existingTrigger && existingTrigger.FunctionName && functions) {
      const toolchainType = existingTrigger.ToolchainType;
      // @ts-expect-error: TODO: Fix type
      const functionData: FunctionSignature =
        toolchainType && functions[toolchainType]
          ? Object.values(functions[toolchainType]).find(
              (fn) => fn.FunctionName === existingTrigger.FunctionName,
            )
          : null;

      if (functionData) {
        setSelectedFunction(functionData);
      }
    }
  }, [existingTrigger, functions, setSelectedFunction]);

  const handleClose = () => {
    reset(defaultValues);
    setPickedSpaceId('');
    setBackingUnit(NO_BACKING_UNIT);
    onClose();
    setServerError('');
    setSelectedFunction({});
  };

  useApiErrorMessage(error, isSuccess, setServerError, {
    onSuccess: () => {
      if (enablingAfterUpdate.current) return;
      if (isEditMode && onTriggerUpdated && data) {
        onTriggerUpdated(data);
        handleClose();
      } else if (!isEditMode && onTriggerCreated && data) {
        onTriggerCreated(data);
        handleClose();
      }
    },
  });

  const watchedValues = watch();

  const onSubmit = async (formData: IAddTriggerFormInput) => {
    setIsSubmitting(true);

    try {
      if (!isEditMode) {
        await submitTrigger(formData, backingUnit.enabled);
        return;
      }
      enablingAfterUpdate.current = backingUnit.enabled;
      const updated = await submitTrigger(formData);
      if (enablingAfterUpdate.current && updated?.TriggerID) {
        try {
          await enableBackingUnit(dispatch, 'Trigger', updated.TriggerID);
          onTriggerUpdated?.(updated);
          handleClose();
        } catch (e) {
          setServerError(backingUnitFailureMessage('Trigger', e));
        }
      }
    } finally {
      enablingAfterUpdate.current = false;
      setIsSubmitting(false);
    }
  };

  const isFormValid: boolean =
    !!spaceId &&
    !!watchedValues.Slug &&
    !!watchedValues.ToolchainType &&
    !!watchedValues.EventType &&
    (runsInvocation ? !!watchedValues.InvocationID : !!watchedValues.FunctionName);

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
              Back to Triggers
            </Button>
          </Stack>
          <Stack direction='row' spacing={3} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Stack spacing={1}>
              <Typography variant='h4' component='h1' sx={{ fontWeight: 600 }}>
                {isEditMode ? 'Edit Trigger' : 'Add Trigger'}
              </Typography>
              {isEditMode && existingTrigger?.TriggerID && (
                <Stack direction='row' spacing={1} alignItems='center'>
                  <Typography variant='body1' color='text.secondary'>
                    UUID: {existingTrigger.TriggerID}
                  </Typography>
                  <CopyToClipboard text={existingTrigger.TriggerID} />
                </Stack>
              )}
            </Stack>
            <BackingUnitHeaderField
              backingUnitId={existingTrigger?.BackingUnitID}
              choice={backingUnit}
              onChoiceChange={setBackingUnit}
              disabled={isSubmitting}
            />
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
          <ErrorList errors={[serverError]} onClose={() => setServerError('')} />

          <Stack spacing={1}>
            {picksSpace && (
              <SectionCard title='Space'>
                <Autocomplete
                  size='small'
                  options={spaces ?? []}
                  getOptionLabel={(space) => space.Slug || ''}
                  value={pickedSpace ?? null}
                  onChange={(_, space) => setPickedSpaceId(space?.SpaceID || '')}
                  data-testid='trigger-space-select'
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label='Space'
                      required
                      helperText='The Space the Trigger resides in'
                    />
                  )}
                />
              </SectionCard>
            )}
            <BasicInfoCard control={control} errors={errors} />
            <StatusAndFunctionCard
              control={control}
              errors={errors}
              functions={filteredFunctions}
              handleFunctionSelect={handleFunctionSelect}
              selectedFunction={selectedFunction}
              selectedFunctionOption={selectedFunctionOption}
              channels={channels}
              updateArgumentValue={updateArgumentValue}
              runsInvocation={runsInvocation}
              invocations={invocationOptions}
              invocationsLoading={invocationsLoading}
            />
            <AppliesToCard
              control={control}
              unitFilters={unitFilterOptions}
              unitFiltersLoading={unitFiltersLoading}
            />
            <WritesCard control={control} validating={validatingFunction} />
            <MapFieldSection
              control={control}
              name='Labels'
              title='Labels'
              itemLabel='label'
              validation='label'
              keyPlaceholder='Environment'
              valuePlaceholder='production'
              testId='trigger-labels'
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
              testId='trigger-annotations'
            />
            <MapFieldSection
              control={control}
              name='DeleteGates'
              title='Delete Gates'
              description='Delete gates prevent accidental deletion of this trigger. Remove all gates before deletion.'
              itemLabel='delete gate'
              validation='label'
              keysOnly
              keyPlaceholder='e.g., manual-review, backup-verified'
              testId='trigger-delete-gates'
            />
          </Stack>
        </Box>

        {/* Fixed Submit Button */}
        <FixedSubmitContainer sx={{ display: 'flex', gap: 2 }}>
          {isEditMode && (
            // A save as YAML reloads the Trigger, which resets the form to what was saved.
            <Button
              onClick={() => setEditingDocument(true)}
              disabled={isSubmitting}
              sx={{ flexShrink: 0 }}
              data-testid='trigger-edit-yaml'
            >
              Edit as YAML
            </Button>
          )}
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
                ? 'Updating Trigger...'
                : 'Creating Trigger...'
              : isEditMode
                ? 'Update Trigger'
                : 'Create Trigger'}
          </Button>
        </FixedSubmitContainer>
      </Box>
      {editingDocument && existingTrigger && (
        <TriggerDocumentDialog trigger={existingTrigger} onClose={() => setEditingDocument(false)} />
      )}
    </Drawer>
  );
};
