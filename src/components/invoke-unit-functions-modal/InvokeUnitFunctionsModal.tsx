// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Control, Controller, FieldErrors, useForm } from 'react-hook-form';

import { DEFAULT_TOOLCHAIN_TYPES } from '@/components/query-builder';
import { useAnalytics } from '@/hooks/useAnalytics';
import {
  FunctionArgument,
  FunctionInvocationsResponse,
  FunctionParameter,
  InvokeFunctionsApiArg,
  useCreateInvocationMutation,
  useCreateTriggerMutation,
  useInvokeFunctionsMutation,
  useListAllChangeSetsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import { firstInvocationFunction } from '@/utility/invocation-functions';
import SaveIcon from '@mui/icons-material/Save';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
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

import { IUnitMutationModalProps } from '../../types';
import { formatParamNames } from '../../utility/query-functions';

export const InvokeUnitFunctionsModal = ({
  isOpen,
  onClose,
  func,
  refresh,
  unitsToEdit = [],
  onSubmit,
  defaultToolchainType,
  defaultChangeSetId,
  invocationToEdit,
}: IUnitMutationModalProps) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {},
  });

  useEffect(() => {
    setSelectedChangeSet(defaultChangeSetId || '');
  }, [defaultChangeSetId]);

  // Reset form when function or invocation changes
  useEffect(() => {
    if (!isOpen) return;

    if (invocationToEdit) {
      // Pre-populate form when editing an existing invocation
      const defaultValues: Record<string, string> = {};
      // The form edits one function, so it reads the first one the Invocation calls.
      firstInvocationFunction(invocationToEdit)?.Arguments?.forEach((arg) => {
        if (arg.ParameterName) {
          defaultValues[arg.ParameterName] = String(arg.Value ?? '');
        }
      });
      reset(defaultValues);

      if (invocationToEdit.ToolchainType) {
        setToolchainType(invocationToEdit.ToolchainType);
      }
    } else {
      // Clear form when opening for a fresh function (prevents stale arguments from previous function)
      reset({});
    }
  }, [func, invocationToEdit, isOpen, reset]);

  const [invokeFunctionMutation] = useInvokeFunctionsMutation();
  const [createTriggerMutation] = useCreateTriggerMutation();
  const [createInvocationMutation] = useCreateInvocationMutation();
  const { trackEntityCreated } = useAnalytics();
  const [isDryRun, setIsDryRun] = useState(false);
  const [toolchainType, setToolchainType] = useState(
    defaultToolchainType || 'Kubernetes/YAML',
  );
  const [changeDescription, setChangeDescription] = useState('');
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<string>('');
  const [triggerName, setTriggerName] = useState('');
  const [triggerEventType, setTriggerEventType] = useState('Mutation');
  const [invocationName, setInvocationName] = useState('');
  const [selectedChangeSet, setSelectedChangeSet] = useState<string>(defaultChangeSetId || '');

  const { data: spacesData } = useListSpacesQuery({});
  const spaces = spacesData?.map((item) => item.Space).filter(Boolean) || [];

  const { data: changeSetsData } = useListAllChangeSetsQuery({});
  const changeSets = changeSetsData?.map((item) => item.ChangeSet).filter(Boolean) || [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formInput =
    func?.Parameters?.map?.((param: FunctionArgument) => ({
      name: param.ParameterName,
    })).filter((param) => param.name !== undefined) || [];

  type FormValues = {
    [Key in Exclude<(typeof formInput)[number]['name'], undefined>]: string;
  };

  const componentMap = {
    string: (
      param: FunctionParameter,
      control: Control<FormValues, unknown>,
      errors: FieldErrors<FormValues>,
    ) => (
      <Controller
        name={param.ParameterName || ''}
        control={control}
        rules={{ required: param.Required }}
        render={({ field }) => (
          <TextField
            {...field}
            variant='outlined'
            fullWidth
            size='small'
            label={formatParamNames(param.ParameterName ?? '')}
            error={param.ParameterName ? !!errors[param.ParameterName] : false}
            helperText={param.Description}
          />
        )}
      />
    ),
    bool: (
      param: FunctionParameter,
      control: Control<FormValues, unknown>,
      errors: FieldErrors<FormValues>,
    ) => (
      <Controller
        name={param.ParameterName || ''}
        control={control}
        rules={{
          required: param.Required
            ? `${formatParamNames(param.ParameterName ?? '')} is required`
            : false,
        }}
        render={({ field }) => (
          <>
            <Typography variant='body1'>{param.ParameterName}</Typography>
            <Tooltip title={param.Description} placement='top'>
              <ToggleButtonGroup
                value={field.value}
                exclusive
                size='small'
                onChange={(_, value) => field.onChange(value)}
                aria-label={formatParamNames(param.ParameterName ?? '')}
                fullWidth
              >
                {/* Boolean values are strings here because false isn't accepted as a value for form validation.  The function executor handles this. */}
                <ToggleButton value='true' aria-label='true'>
                  True
                </ToggleButton>
                <ToggleButton value='false' aria-label='false'>
                  False
                </ToggleButton>
              </ToggleButtonGroup>
            </Tooltip>
            {param.ParameterName && errors[param.ParameterName] && (
              <FormHelperText error>{errors[param.ParameterName]?.message}</FormHelperText>
            )}
          </>
        )}
      />
    ),
    // TODO: Default to a text editor for now
    // TODO: Allow the user to select kind first.  Kind will trigger the component to show based on different schema files...
    // AttributeValueList: null,
    int: (
      param: FunctionParameter,
      control: Control<FormValues, unknown>,
      errors: FieldErrors<FormValues>,
    ) => (
      <Controller
        name={param.ParameterName || ''}
        control={control}
        rules={{ required: param.Required }}
        render={({ field }) => (
          <TextField
            {...field}
            variant='outlined'
            size='small'
            type='number'
            fullWidth
            label={formatParamNames(param.ParameterName ?? '')}
            error={param.ParameterName ? !!errors[param.ParameterName] : false}
            helperText={param.Description}
          />
        )}
      />
    ),
    enum: (
      param: FunctionParameter,
      control: Control<FormValues, unknown>,
      errors: FieldErrors<FormValues>,
    ) => (
      <Controller
        name={param.ParameterName || ''}
        control={control}
        rules={{ required: param.Required }}
        render={({ field }) => (
          <>
            <FormControl fullWidth size='small'>
              <InputLabel>{formatParamNames(param.ParameterName || '')}</InputLabel>
              <Select
                {...field}
                label={param.ParameterName || ''}
                input={<OutlinedInput label={formatParamNames(param.ParameterName || '')} />}
                error={!!errors[param.ParameterName || '']}
                size='small'
              >
                {param?.EnumValues?.map((item: string) => (
                  <MenuItem key={item} value={item}>
                    {item}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {errors?.[param.ParameterName || ''] && (
              <FormHelperText error>
                {errors[param.ParameterName || '']?.message}
              </FormHelperText>
            )}
          </>
        )}
      />
    ),
  };

  const getComponent = (
    param: FunctionParameter,
    control: Control<FormValues, unknown>,
    errors: FieldErrors<FormValues>,
  ) => {
    return (
      componentMap[param.DataType as keyof typeof componentMap]?.(param, control, errors) ||
      componentMap['string'](param, control, errors)
    );
  };

  const onInvokeFunction = async (data: Record<string, string>) => {
    const results = await Promise.all(
      unitsToEdit.map(async (unit) => {
        const input: InvokeFunctionsApiArg = {
          spaceId: unit?.SpaceID || '',
          where: `UnitID='${unit.UnitID}'`,
          dryRun: isDryRun ? 'true' : undefined,
          ...(selectedChangeSet ? { changeSetId: selectedChangeSet } : {}),
          functionInvocationsRequest: {
            ToolchainType: toolchainType,
            ChangeDescription: changeDescription || undefined,
            FunctionInvocations: [
              {
                FunctionName: func?.FunctionName || '',
                // Filter to only include arguments that are valid parameters for the current function
                Arguments: Object.entries(data)
                  .filter(
                    ([key, value]) =>
                      value != null && func?.Parameters?.some((p) => p.ParameterName === key),
                  )
                  .map(([key, value]) => ({
                    ParameterName: key,
                    Value: value,
                  })),
              },
            ],
          },
        };

        return await invokeFunctionMutation(input);
      }),
    );

    // Check for API errors (total failures)
    const apiErrors = results
      .filter((result) => result.error)
      .map((result) => {
        const error = result.error as { data?: { message?: string }; message?: string };
        return error?.data?.message || error?.message || 'An error occurred';
      });

    // Get successful function responses (partial successes or full successes)
    const filteredResults = results.flatMap((result) => result.data)?.filter(Boolean);

    // Call onSubmit with both results and any API error
    const apiError = apiErrors.length > 0 ? apiErrors.join(', ') : undefined;
    onSubmit?.(filteredResults as FunctionInvocationsResponse[], apiError, apiErrors);

    // If a mutation is fired then the list should update.  I don't want to do a full refresh probably...
    if (func?.Mutating) refresh?.();
  };

  const onSaveTrigger = async (data: Record<string, string>) => {
    if (!triggerName.trim() || !selectedSpace) return;

    try {
      await createTriggerMutation({
        spaceId: selectedSpace,
        trigger: {
          Slug: triggerName.toLowerCase().replace(/\s+/g, '-'),
          DisplayName: triggerName,
          ToolchainType: toolchainType,
          Event: triggerEventType,
          FunctionName: func?.FunctionName || '',
          Arguments: Object.entries(data)
            .filter(
              ([key, value]) =>
                value != null && func?.Parameters?.some((p) => p.ParameterName === key),
            )
            .map(([key, value]) => ({
              ParameterName: key,
              Value: value,
            })),
        },
      });
      setShowSaveOptions(false);
      setTriggerName('');
    } catch (error) {
      console.error('Failed to save trigger:', error);
    }
  };

  const onSaveInvocation = async (data: Record<string, string>) => {
    if (!invocationName.trim() || !selectedSpace) return;

    try {
      const result = await createInvocationMutation({
        spaceId: selectedSpace,
        invocation: {
          Slug: invocationName.toLowerCase().replace(/\s+/g, '-'),
          DisplayName: invocationName,
          ToolchainType: toolchainType,
          FunctionInvocations: [
            {
              FunctionName: func?.FunctionName || '',
              Arguments: Object.entries(data)
                .filter(
                  ([key, value]) =>
                    value != null && func?.Parameters?.some((p) => p.ParameterName === key),
                )
                .map(([key, value]) => ({
                  ParameterName: key,
                  Value: value,
                })),
            },
          ],
        },
      });

      // Track invocation creation (only dropdown values, no user input)
      if ('data' in result && result.data) {
        trackEntityCreated({
          entity_type: ENTITY_TYPES.INVOCATION,
          entity_id: result.data.InvocationID || '',
          toolchain_type: toolchainType,
        });
      }

      setShowSaveOptions(false);
      setInvocationName('');
    } catch (error) {
      console.error('Failed to save invocation:', error);
    }
  };

  return (
    <Dialog
      key={func?.FunctionName}
      open={isOpen}
      onClose={() => {
        reset();
        setIsDryRun(false);
        onClose();
      }}
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit((data, event) => {
          event?.preventDefault();
          event?.stopPropagation();
          onInvokeFunction(data);
          reset();
          setIsDryRun(false);
          onClose?.();
        }),
      }}
    >
      <DialogTitle>{func?.FunctionName}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} data-testid='invoke-function-parameters'>
          <Grid size={{ xs: 12 }}>
            <Typography variant='subtitle1' color='text.secondary'>
              {func?.Description}
            </Typography>
          </Grid>
          {/* TODO: Dynamic form input here... */}
          {func?.Parameters?.map?.((param: FunctionParameter) => (
            <Grid size={{ xs: 6 }} key={param.ParameterName}>
              {getComponent(param, control, errors)}
            </Grid>
          ))}

          {(func?.Parameters?.length ?? 0) % 2 !== 0 && <Grid size={{ xs: 6 }} />}

          <Grid size={{ xs: 6 }}>
            <Autocomplete
              size='small'
              options={changeSets}
              getOptionLabel={(option) => option?.DisplayName || ''}
              value={changeSets.find((cs) => cs?.ChangeSetID === selectedChangeSet) || null}
              readOnly={defaultChangeSetId ? true : false}
              onChange={(_, newValue) => setSelectedChangeSet(newValue?.ChangeSetID || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={`Changeset ${defaultChangeSetId ? '' : '(Optional)'}`}
                  required={false}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth size='small'>
              <InputLabel>Toolchain Type</InputLabel>
              <Select
                name='toolchainType'
                data-testid='toolchain-type-select'
                value={toolchainType}
                onChange={(e) => setToolchainType(e.target.value)}
                label='Toolchain Type'
                input={<OutlinedInput label='Toolchain Type' />}
              >
                {DEFAULT_TOOLCHAIN_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {func?.Mutating && (
            <Grid size={{ xs: 12 }}>
              <TextField
                name='changeDescription'
                fullWidth
                size='small'
                label='Change Description'
                multiline
                rows={2}
                value={changeDescription}
                onChange={(e) => setChangeDescription(e.target.value)}
                placeholder='Describe what this change accomplishes...'
              />
            </Grid>
          )}
          <Grid size={{ xs: 12 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={isDryRun}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setIsDryRun(event.target.checked)
                  }
                />
              }
              label='Dry run (preview changes without saving them)'
            />
          </Grid>
        </Grid>
      </DialogContent>

      <Collapse in={showSaveOptions}>
        <DialogContent
          sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}
        >
          <Typography variant='h6' sx={{ mb: 2 }}>
            Save Function Call
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Autocomplete
                size='small'
                options={spaces}
                getOptionLabel={(option) => option?.DisplayName || ''}
                value={spaces.find((space) => space?.SpaceID === selectedSpace) || null}
                onChange={(_, newValue) => setSelectedSpace(newValue?.SpaceID || '')}
                renderInput={(params) => <TextField {...params} label='Space' />}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                size='small'
                label='Trigger Name'
                value={triggerName}
                onChange={(e) => setTriggerName(e.target.value)}
                placeholder='my-trigger'
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size='small'>
                <InputLabel>Event Type</InputLabel>
                <Select
                  value={triggerEventType}
                  onChange={(e) => setTriggerEventType(e.target.value)}
                  label='Event Type'
                  input={<OutlinedInput label='Event Type' />}
                >
                  <MenuItem value='Mutation'>Mutation</MenuItem>
                  <MenuItem value='PostClone'>PostClone</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                size='small'
                label='Invocation Name'
                value={invocationName}
                onChange={(e) => setInvocationName(e.target.value)}
                placeholder='my-invocation'
              />
            </Grid>
          </Grid>
        </DialogContent>
      </Collapse>

      <DialogActions>
        <Stack
          direction='row'
          spacing={1}
          sx={{ width: '100%', mb: 1.5 }}
          justifyContent='flex-end'
        >
          <Button
            variant='text'
            onClick={() => {
              reset();
              setIsDryRun(false);
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button variant='outlined' onClick={() => setShowSaveOptions(!showSaveOptions)}>
            {showSaveOptions ? 'Hide Save Options' : 'Save Options'}
          </Button>
          {showSaveOptions && (
            <>
              <Button
                variant='outlined'
                startIcon={<SaveIcon />}
                onClick={handleSubmit((data) => {
                  onSaveTrigger(data);
                })}
                disabled={!triggerName.trim() || !selectedSpace}
              >
                SAVE TRIGGER
              </Button>
              <Button
                variant='outlined'
                startIcon={<SaveIcon />}
                onClick={handleSubmit((data) => {
                  onSaveInvocation(data);
                })}
                disabled={!invocationName.trim() || !selectedSpace}
              >
                SAVE INVOCATION
              </Button>
            </>
          )}
          <Button variant='contained' type='submit' data-testid='invoke-function-submit-button'>
            Invoke
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};
