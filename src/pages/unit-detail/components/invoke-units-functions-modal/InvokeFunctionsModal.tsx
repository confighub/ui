// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Control, Controller, FieldErrors, useForm } from 'react-hook-form';

import { DEFAULT_TOOLCHAIN_TYPES } from '@/components/query-builder';
import {
  FunctionArgument,
  FunctionParameter,
  FunctionSignature,
  useCreateInvocationMutation,
  useCreateTriggerMutation,
  useListAllChangeSetsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import { useListExtendedRevisionsQuery } from '@confighub/rtk-query';
import { IUnitMutationModalProps } from '@/types';
import { firstInvocationFunction } from '@/utility/invocation-functions';
import { formatParamNames } from '@/utility/query-functions';
import SaveIcon from '@mui/icons-material/Save';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Fade from '@mui/material/Fade';
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

export interface InvokeFunctionsModalProps {
  isFuncModalOpen: boolean;
  onModalClosed?: () => void;
  onSubmit: (data: Record<string, string>) => void;
  func: FunctionSignature | null;
}

export const InvokeFunctionsModal = ({
  isOpen,
  onClose,
  onSubmit,
  func,
  unitsToEdit,
  defaultToolchainType,
  invocationToEdit,
}: IUnitMutationModalProps) => {
  const selectedUnit = unitsToEdit?.[0];
  const [isRevisionEnabled, setIsRevisionEnabled] = useState(false);
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

  const [createTriggerMutation] = useCreateTriggerMutation();
  const [createInvocationMutation] = useCreateInvocationMutation();

  const { data: revisions } = useListExtendedRevisionsQuery({
    unitId: selectedUnit?.UnitID || '',
    spaceId: selectedUnit?.SpaceID || '',
  });

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
            variant='outlined'
            size='small'
            fullWidth
            label={formatParamNames(param.ParameterName ?? '')}
            error={param.ParameterName ? !!errors[param.ParameterName] : false}
            helperText={param.Description}
            {...field}
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
            variant='outlined'
            size='small'
            type='number'
            fullWidth
            label={formatParamNames(param.ParameterName ?? '')}
            error={param.ParameterName ? !!errors[param.ParameterName] : false}
            helperText={param.Description}
            {...field}
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

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
    setValue,
  } = useForm<FormValues>({
    defaultValues: {},
  });

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
            .filter(([, value]) => value != null)
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
      await createInvocationMutation({
        spaceId: selectedSpace,
        invocation: {
          Slug: invocationName.toLowerCase().replace(/\s+/g, '-'),
          DisplayName: invocationName,
          ToolchainType: toolchainType,
          FunctionInvocations: [
            {
              FunctionName: func?.FunctionName || '',
              Arguments: Object.entries(data)
                .filter(([, value]) => value != null)
                .map(([key, value]) => ({
                  ParameterName: key,
                  Value: value,
                })),
            },
          ],
        },
      });
      setShowSaveOptions(false);
      setInvocationName('');
    } catch (error) {
      console.error('Failed to save invocation:', error);
    }
  };

  // Reset form when function changes, and populate if editing an invocation
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
      // Clear form when opening for a fresh function
      reset({});
    }

    setIsRevisionEnabled(false);
    setIsDryRun(false);
    if (defaultToolchainType && !invocationToEdit?.ToolchainType) {
      setToolchainType(defaultToolchainType);
    }
  }, [func, invocationToEdit, isOpen, reset, defaultToolchainType]);

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        reset();
        setIsRevisionEnabled(false);
        setIsDryRun(false);
        onClose();
      }}
      disableRestoreFocus
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit((data, event) => {
          event?.preventDefault();
          event?.stopPropagation();
          const submissionData = {
            ...data,
            ...(isDryRun && { dryRun: 'true' }),
            ...(selectedUnit?.ChangeSetID && { changeSetId: selectedUnit.ChangeSetID }),
          };
          onSubmit?.(submissionData);
          reset();
          onClose();
          setIsRevisionEnabled(false);
          setIsDryRun(false);
        }),
      }}
    >
      <DialogTitle>{func?.FunctionName}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} data-testid='invoke-function-parameters'>
          <Grid size={{ xs: 12 }}>
            <Typography
              variant='subtitle1'
              color='text.secondary'
              sx={{ wordWrap: 'break-word', whiteSpace: 'pre-line' }}
            >
              {func?.Description}
            </Typography>
          </Grid>
          {func?.Parameters?.map?.((param: FunctionParameter) => (
            <Grid size={{ xs: 6 }} key={param.ParameterName}>
              {getComponent(param, control, errors)}
            </Grid>
          ))}
          {(func?.Parameters?.length ?? 0) % 2 !== 0 && <Grid size={{ xs: 6 }} />}

          {selectedUnit?.ChangeSetID && (
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                size='small'
                label='Changeset'
                value={
                  changeSets.find((cs) => cs?.ChangeSetID === selectedUnit.ChangeSetID)
                    ?.DisplayName || selectedUnit.ChangeSetID
                }
                InputProps={{
                  readOnly: true,
                }}
                helperText='This unit is part of a change set'
              />
            </Grid>
          )}

          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth size='small'>
              <InputLabel>Toolchain Type</InputLabel>
              <Select
                value={toolchainType}
                onChange={(e) => setToolchainType(e.target.value)}
                label='Toolchain Type'
                input={<OutlinedInput label='Toolchain Type' />}
                data-testid='toolchain-type-select'
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
                fullWidth
                size='small'
                label='Change Description (Optional)'
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
          <Grid size={{ xs: 12 }}>
            <FormControlLabel
              control={
                <Checkbox
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setIsRevisionEnabled(event.target.checked)
                  }
                />
              }
              label='Invoke function on revision?'
            />
          </Grid>

          <Grid size={{ xs: 6 }}>
            <Fade in={isRevisionEnabled}>
              <FormControl fullWidth variant='outlined' size='small'>
                <InputLabel id='revision-num-label'>Revision Num</InputLabel>
                <Select
                  labelId='revision-num-label'
                  id='revision-num-label-select'
                  value={watch('revisionId') || ''}
                  size='small'
                  onChange={(event) => {
                    setValue('revisionId', event.target.value);
                    setValue(
                      'revisionNum',
                      revisions
                        ?.find(
                          (revision) => revision.Revision?.RevisionID === event.target.value,
                        )
                        ?.Revision?.RevisionNum?.toString() || '',
                    );
                  }}
                  label='Revision Num'
                >
                  {revisions?.map((revision) => (
                    <MenuItem
                      key={revision.Revision?.RevisionID}
                      value={revision.Revision?.RevisionID}
                    >
                      {revision.Revision?.RevisionNum}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Fade>
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
        <Stack direction='row' spacing={1} sx={{ width: '100%' }}>
          <Button variant='outlined' onClick={onClose}>
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
