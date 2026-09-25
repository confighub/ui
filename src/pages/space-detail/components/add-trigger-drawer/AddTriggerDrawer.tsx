// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';
import { Control, Controller, FieldErrors, useForm } from 'react-hook-form';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { DEFAULT_TOOLCHAIN_TYPES } from '@/components/query-builder';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FunctionParametersField } from '@/components/function-parameters-field/FunctionParametersField';
import { SimpleGateCard } from '@/components/simple-gate-card/SimpleGateCard';
import {
  SimpleFunctionPicker,
  type SimpleFunctionOption,
} from '@/components/simple-function-picker/SimpleFunctionPicker';
import { FixedSubmitContainer, SectionCard } from '@/components/styled';
import { IAddTriggerFormInput, useAddTrigger } from '@/hooks/useAddTrigger';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  BridgeWorkerRead,
  FunctionSignature,
  ListFunctionsApiResponse,
  TriggerRead,
  useListBridgeWorkersQuery,
  useListFunctionsQuery,
} from '@confighub/rtk-query';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Lock from '@mui/icons-material/Lock';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

// Types
export interface AddTriggerFormData {
  slug: string;
  displayName: string;
  toolchainType: string;
  eventType: string;
  functionName: string;
  bridgeWorkerId: string;
  disabled: boolean;
  warn: boolean;
  arguments: Array<{
    parameterName: string;
    value: string | number | boolean;
    dataType: string;
  }>;
  labels: Array<{ key: string; value: string; id: string }>;
  annotations: Array<{ key: string; value: string; id: string }>;
}

export interface AddTriggerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  orgID: string;
  spaceId: string;
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
  workers,
  selectedFunction,
  selectedFunctionOption,
  handleFunctionSelect,
  updateArgumentValue,
}: {
  control: Control<IAddTriggerFormInput>;
  errors: FieldErrors<IAddTriggerFormInput>;
  selectedFunction: FunctionSignature;
  selectedFunctionOption: SimpleFunctionOption | null;
  functions: ListFunctionsApiResponse | undefined;
  workers: Array<BridgeWorkerRead>;
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
        {/* Function Selection */}
        <Grid size={{ xs: 6 }}>
          <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
            Function
          </Typography>
          <Controller
            name='FunctionName'
            control={control}
            rules={{ required: 'Function is required' }}
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

        {/* Bridge Worker */}
        <Grid size={{ xs: 6 }}>
          <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
            Bridge Worker
          </Typography>
          <Controller
            name='BridgeWorkerID'
            control={control}
            render={({ field }) => (
              <FormControl fullWidth size='small'>
                <InputLabel>Bridge Worker (Optional)</InputLabel>
                <Select
                  {...field}
                  label='Bridge Worker (Optional)'
                  input={<OutlinedInput label='Bridge Worker (Optional)' />}
                >
                  <MenuItem value=''>None</MenuItem>
                  {workers.map((worker) => (
                    <MenuItem key={worker.BridgeWorkerID} value={worker.BridgeWorkerID}>
                      {worker.DisplayName}
                    </MenuItem>
                  ))}
                </Select>
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

        {/* Function Parameters */}
        {selectedFunction.Parameters?.map((param) => (
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
      {selectedFunction && selectedFunction.FunctionName && (
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
 * LabelsAndAnnotationsCard
 *
 * Handles labels and annotations management.
 */
const LabelsAndAnnotationsCard = ({
  addLabel,
  addAnnotation,
  removeLabel,
  removeAnnotation,
  newLabelKey,
  newLabelValue,
  newAnnotationKey,
  newAnnotationValue,
  setNewLabelKey,
  setNewLabelValue,
  setNewAnnotationKey,
  setNewAnnotationValue,
  labels,
  annotations,
}: {
  addLabel: () => void;
  addAnnotation: () => void;
  removeLabel: (id: string) => void;
  removeAnnotation: (id: string) => void;
  newLabelKey: string;
  newLabelValue: string;
  newAnnotationKey: string;
  newAnnotationValue: string;
  setNewLabelKey: React.Dispatch<React.SetStateAction<string>>;
  setNewLabelValue: React.Dispatch<React.SetStateAction<string>>;
  setNewAnnotationKey: React.Dispatch<React.SetStateAction<string>>;
  setNewAnnotationValue: React.Dispatch<React.SetStateAction<string>>;
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
 * AddTriggerDrawer
 *
 * Main component for adding triggers with a drawer interface.
 */
export const AddTriggerDrawer = ({
  isOpen,
  onClose,
  orgID,
  spaceId,
  onTriggerCreated,
  onTriggerUpdated,
  existingTrigger,
}: AddTriggerDrawerProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!existingTrigger;

  const { workers = [] } = useListBridgeWorkersQuery(
    { spaceId },
    {
      selectFromResult: ({ data }) => ({
        workers: data?.map((worker) => worker.BridgeWorker || ({} as BridgeWorkerRead)) || [],
      }),
    },
  );

  const { data: functions = {} } = useListFunctionsQuery({
    spaceId,
    entity: '',
  });

  const defaultValues: IAddTriggerFormInput = {
    BridgeWorkerID: '',
    Slug: '',
    Labels: [],
    Annotations: [],
    DeleteGates: {},
    EventType: 'Mutation',
    FunctionName: '',
    ToolchainType: 'Kubernetes/YAML',
    Disabled: false,
    Warn: false,
  };

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
    addLabel,
    addAnnotation,
    removeLabel,
    removeAnnotation,
    labels,
    annotations,
    newLabelKey,
    newLabelValue,
    newAnnotationKey,
    newAnnotationValue,
    newDeleteGateKey,
    setNewLabelKey,
    setNewLabelValue,
    setNewAnnotationKey,
    setNewAnnotationValue,
    setNewDeleteGateKey,
    selectedFunction,
    isSuccess,
    error,
    data,
    serverError,
    setServerError,
    setSelectedFunction,
  } = useAddTrigger(orgID, spaceId, existingTrigger, { setValue, watch, reset });

  const watchedToolchainType = watch('ToolchainType');

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
    onClose();
    setServerError('');
    setSelectedFunction({});
  };

  useApiErrorMessage(error, isSuccess, setServerError, {
    onSuccess: () => {
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
      await submitTrigger(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid: boolean =
    !!watchedValues.Slug &&
    !!watchedValues.ToolchainType &&
    !!watchedValues.EventType &&
    !!watchedValues.FunctionName;

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
            <BasicInfoCard control={control} errors={errors} />
            <StatusAndFunctionCard
              control={control}
              errors={errors}
              functions={filteredFunctions}
              handleFunctionSelect={handleFunctionSelect}
              selectedFunction={selectedFunction}
              selectedFunctionOption={selectedFunctionOption}
              workers={workers}
              updateArgumentValue={updateArgumentValue}
            />
            <LabelsAndAnnotationsCard
              addLabel={addLabel}
              addAnnotation={addAnnotation}
              removeLabel={removeLabel}
              removeAnnotation={removeAnnotation}
              labels={labels}
              annotations={annotations}
              newLabelKey={newLabelKey}
              newLabelValue={newLabelValue}
              newAnnotationKey={newAnnotationKey}
              newAnnotationValue={newAnnotationValue}
              setNewLabelKey={setNewLabelKey}
              setNewLabelValue={setNewLabelValue}
              setNewAnnotationKey={setNewAnnotationKey}
              setNewAnnotationValue={setNewAnnotationValue}
            />
            <SimpleGateCard<IAddTriggerFormInput>
              watch={watch}
              setValue={setValue}
              gateFieldName='DeleteGates'
              gateType='Delete'
              title='Delete Gates'
              description='Delete gates prevent accidental deletion of this trigger. Remove all gates before deletion.'
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
                ? 'Updating Trigger...'
                : 'Creating Trigger...'
              : isEditMode
                ? 'Update Trigger'
                : 'Create Trigger'}
          </Button>
        </FixedSubmitContainer>
      </Box>
    </Drawer>
  );
};
