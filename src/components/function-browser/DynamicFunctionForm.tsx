// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Control, Controller, FieldErrors, useForm, useWatch } from 'react-hook-form';

import { ErrorList } from '@/components/error-list/ErrorList';
// import { alpha } from '@mui/material/styles';
import {
  type InvocationResults,
  buildDiffUnits,
  useInvokeFunction,
} from '@/hooks/useInvokeFunctions';
import type {
  ExtendedUnitRead,
  FunctionArgument,
  FunctionParameter,
  FunctionSignature,
} from '@confighub/rtk-query';
import {
  useCreateInvocationMutation,
  useCreateTriggerMutation,
} from '@confighub/rtk-query';
import { formatParamNames } from '@/utility/query-functions';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useUnitDataMap } from '@/hooks/useUnitData';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface FormPreviewProps {
  functionName: string;
  params: FunctionParameter[];
  values: Record<string, string>;
}

const FormPreview = ({ functionName, params, values }: FormPreviewProps) => {
  const [copied, setCopied] = useState(false);

  const args = params
    .map((p) => {
      const val = values[p.ParameterName || ''];
      return `--${p.ParameterName}=${val || `<${p.ParameterName}>`}`;
    })
    .join(' ');

  const command =
    params.length > 0
      ? `cub function do -- ${functionName} ${args}`
      : `cub function do ${functionName}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        bgcolor: theme.palette.background.default,
        borderRadius: 1,
        p: 1.5,
        fontFamily: '"Roboto Mono", monospace',
        fontSize: '0.7rem',
        wordBreak: 'break-all',
        lineHeight: 1.6,
        color: 'text.primary',
        pr: 4,
        border: `1px solid ${theme.palette.divider}`,
        mb: 2,
      })}
    >
      {command}
      <Tooltip title={copied ? 'Copied!' : 'Copy'}>
        <IconButton
          size='small'
          onClick={handleCopy}
          sx={{ position: 'absolute', top: 4, right: 4, p: 0.5 }}
        >
          {copied ? (
            <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />
          ) : (
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          )}
        </IconButton>
      </Tooltip>
    </Box>
  );
};

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

export interface FunctionInvocationResultData {
  diffUnits: ExtendedUnitRead[];
  /** Configuration for the preview's synthetic Revisions; see buildDiffUnits. */
  dataOverrides: Map<string, string>;
  results: InvocationResults;
  selectedFunction: FunctionSignature;
}

export interface IDynamicFunctionFormProps {
  selectedFunction: FunctionSignature;
  units: ExtendedUnitRead[];
  spaceId?: string;
  onClose?: () => void;
  onResults?: (data: FunctionInvocationResultData) => void;
}

const TOOLCHAIN_OPTIONS = [
  { value: 'Kubernetes/YAML', label: 'Kubernetes/YAML' },
  { value: 'AppConfig/Properties', label: 'AppConfig/Properties' },
  { value: 'AppConfig/YAML', label: 'AppConfig/YAML' },
  { value: 'AppConfig/TOML', label: 'AppConfig/TOML' },
  { value: 'AppConfig/INI', label: 'AppConfig/INI' },
  { value: 'AppConfig/JSON', label: 'AppConfig/JSON' },
  { value: 'AppConfig/Env', label: 'AppConfig/Env' },
  { value: 'AppConfig/Text', label: 'AppConfig/Text' },
  { value: 'ConfigHub/YAML', label: 'ConfigHub/YAML' },
];

const TRIGGER_EVENTS = [
  { value: 'Mutation', label: 'Mutation' },
  { value: 'PostClone', label: 'Post Clone' },
];

type SaveType = 'invocation' | 'trigger';

/** Converts a display name to a URL-safe slug */
const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ============================================================================
// SAVE SECTION SUB-COMPONENT
// ============================================================================

interface SaveSectionProps {
  spaceId: string;
  functionName: string;
  toolchainType: string;
  watchedValues: Record<string, string>;
  params: FunctionParameter[];
}

const SaveSection = ({
  spaceId,
  functionName,
  toolchainType,
  watchedValues,
  params,
}: SaveSectionProps) => {
  const [saveType, setSaveType] = useState<SaveType>('invocation');
  const [displayName, setDisplayName] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('Mutation');
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [createInvocation, { isLoading: isSavingInvocation }] = useCreateInvocationMutation();
  const [createTrigger, { isLoading: isSavingTrigger }] = useCreateTriggerMutation();

  const isSaving = isSavingInvocation || isSavingTrigger;

  const slug = toSlug(displayName) || toSlug(functionName);

  const buildArguments = (): FunctionArgument[] =>
    params
      .map((p) => ({
        ParameterName: p.ParameterName,
        Value: watchedValues[p.ParameterName || ''] ?? '',
      }))
      .filter((a) => a.ParameterName);

  const handleSave = async () => {
    setSaveErrors([]);
    setSaveSuccess(false);

    try {
      if (saveType === 'invocation') {
        await createInvocation({
          spaceId,
          invocation: {
            Slug: slug,
            DisplayName: displayName || undefined,
            ToolchainType: toolchainType,
            FunctionInvocations: [{ FunctionName: functionName, Arguments: buildArguments() }],
          },
        }).unwrap();
      } else {
        await createTrigger({
          spaceId,
          trigger: {
            Slug: slug,
            DisplayName: displayName || undefined,
            FunctionName: functionName,
            ToolchainType: toolchainType,
            Arguments: buildArguments(),
            Event: triggerEvent,
          },
        }).unwrap();
      }
      setSaveSuccess(true);
      setDisplayName('');
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      const msg =
        typeof err === 'object' && err !== null && 'data' in err
          ? String((err as { data: unknown }).data)
          : 'Failed to save';
      setSaveErrors([msg]);
    }
  };

  return (
    <Box
      sx={() => ({
        mt: 2,
        borderRadius: 1,
        //border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      })}
    >
      {/* Section header */}
      <Stack
        direction='row'
        alignItems='center'
        spacing={1}
        justifyContent='flex-end'
        sx={() => ({
          px: 1.5,
          py: 1,
          // bgcolor: alpha(theme.palette.primary.main, 0.04),
          // borderBottom: `1px solid ${theme.palette.divider}`,
        })}
      >
        {/* <BookmarkAddIcon sx={{ fontSize: 15, color: 'primary.main' }} /> */}
        {/* <Typography variant='caption' fontWeight={600} color='primary.main' sx={{ flex: 1 }}>
          Save as
        </Typography> */}
        <ToggleButtonGroup
          value={saveType}
          exclusive
          size='small'
          onChange={(_, v) => {
            if (v) setSaveType(v as SaveType);
          }}
          sx={{ height: 24 }}
        >
          <ToggleButton
            value='invocation'
            sx={{ px: 1.25, fontSize: '0.7rem', textTransform: 'none' }}
          >
            Invocation
          </ToggleButton>
          <ToggleButton
            value='trigger'
            sx={{ px: 1.25, fontSize: '0.7rem', textTransform: 'none' }}
          >
            Trigger
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Body */}
      <Box sx={{ p: 1.5 }}>
        {saveErrors.length > 0 && (
          <Box mb={1.5}>
            <ErrorList errors={saveErrors} onClose={() => setSaveErrors([])} />
          </Box>
        )}

        <Stack spacing={1.5}>
          <TextField
            size='small'
            fullWidth
            label='Display name'
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={functionName}
            helperText={
              displayName ? `Slug: ${slug}` : 'Leave blank to use function name as slug'
            }
            FormHelperTextProps={{ sx: { fontSize: '0.65rem', mt: 0.25 } }}
          />

          {saveType === 'trigger' && (
            <FormControl fullWidth size='small'>
              <InputLabel>Event</InputLabel>
              <Select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value)}
                label='Event'
                input={<OutlinedInput label='Event' />}
              >
                {TRIGGER_EVENTS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Button
            size='small'
            variant='outlined'
            onClick={() => void handleSave()}
            disabled={isSaving || saveSuccess}
            startIcon={
              isSaving ? (
                <CircularProgress size={12} color='inherit' />
              ) : saveSuccess ? (
                <CheckIcon sx={{ fontSize: 14 }} />
              ) : (
                <BookmarkAddIcon sx={{ fontSize: 14 }} />
              )
            }
            color={saveSuccess ? 'success' : 'primary'}
            sx={{ alignSelf: 'flex-end', fontSize: '0.75rem' }}
          >
            {isSaving
              ? 'Saving…'
              : saveSuccess
                ? 'Saved!'
                : `Save ${saveType === 'invocation' ? 'invocation' : 'trigger'}`}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DynamicFunctionForm = ({
  selectedFunction,
  units,
  spaceId,
  onClose,
  onResults,
}: IDynamicFunctionFormProps) => {
  // The "before" side of a preview diff is the stored configuration, fetched in one request.
  const { dataFor: unitDataFor } = useUnitDataMap(units.map((u) => u.Unit?.UnitID));
  const [isDryRun, setIsDryRun] = useState(false);
  const [toolchainType, setToolchainType] = useState('Kubernetes/YAML');
  const [changeDescription, setChangeDescription] = useState('');
  const [showSave, setShowSave] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formInput =
    selectedFunction?.Parameters?.map?.((param: FunctionArgument) => ({
      name: param.ParameterName,
    })).filter((param) => param.name !== undefined) || [];

  type FormValues = {
    [Key in Exclude<(typeof formInput)[number]['name'], undefined>]: string;
  };

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: {} });

  const watchedValues = useWatch({ control }) as Record<string, string>;

  const { handleFunctionInvoke, isInvoking, errorMessages, setErrorMessages } =
    useInvokeFunction({
      units,
      selectedFunction,
      isDryRun,
      changeDescription,
    });

  const onSubmit = handleSubmit(async (data, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    const result = await handleFunctionInvoke(data);
    if (result && onResults) {
      const invocationResults = result as InvocationResults;
      onResults({
        ...(selectedFunction.Mutating
          ? buildDiffUnits(invocationResults, units, unitDataFor)
          : { diffUnits: [], dataOverrides: new Map<string, string>() }),
        results: invocationResults,
        selectedFunction,
      });
    }
    reset();
    setIsDryRun(false);
    onClose?.();
  });

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
            <Typography variant='body2' color='text.secondary'>
              {formatParamNames(param.ParameterName ?? '')}
            </Typography>
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
  ) =>
    componentMap[param.DataType as keyof typeof componentMap]?.(param, control, errors) ||
    componentMap['string'](param, control, errors);

  const params = selectedFunction?.Parameters ?? [];

  return (
    <Box component='form' onSubmit={onSubmit} sx={{ mt: 1.5 }}>
      <Paper
        elevation={0}
        sx={(theme) => ({
          borderRadius: 1,
          p: 2,
          bgcolor: 'background.paper',
          border: `1px solid ${theme.palette.divider}`,
          borderLeft: `3px solid ${theme.palette.primary.main}`,
        })}
      >
        {/* Header */}
        <Stack direction='row' alignItems='flex-start' justifyContent='space-between' mb={1.5}>
          <Box>
            <Typography variant='subtitle2' fontWeight={700}>
              {selectedFunction.FunctionName}
            </Typography>
            {selectedFunction.Description && (
              <Typography variant='caption' color='text.secondary'>
                {selectedFunction.Description}
              </Typography>
            )}
          </Box>
          <Chip
            label={selectedFunction.Mutating ? 'MUTATING' : 'READ-ONLY'}
            size='small'
            color={selectedFunction.Mutating ? 'warning' : 'default'}
            sx={{ fontSize: '0.65rem', height: 20, flexShrink: 0, ml: 1 }}
          />
        </Stack>

        {errorMessages?.length > 0 && (
          <Stack spacing={1} mb={1.5}>
            <ErrorList errors={errorMessages} onClose={() => setErrorMessages([])} />
          </Stack>
        )}

        {/* Parameters */}
        {params.length > 0 && (
          <Stack spacing={1.5} mb={1.5}>
            {params.map((param: FunctionParameter) => (
              <Box key={param.ParameterName}>{getComponent(param, control, errors)}</Box>
            ))}
          </Stack>
        )}

        {/* Execution preview */}
        <Box mb={1.5}>
          <FormPreview
            functionName={selectedFunction.FunctionName || ''}
            params={params}
            values={watchedValues}
          />
        </Box>

        {/* Change description */}
        {selectedFunction?.Mutating && (
          <Box mb={1.5}>
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
          </Box>
        )}

        {/* Footer: toolchain + dry run + invoke */}
        <Stack direction='row' spacing={1} alignItems='center'>
          <FormControl fullWidth size='small' sx={{ flex: 1, minWidth: 0 }}>
            <InputLabel>Toolchain Type</InputLabel>
            <Select
              name='toolchainType'
              data-testid='toolchain-type-select'
              value={toolchainType}
              onChange={(e) => setToolchainType(e.target.value)}
              label='Toolchain Type'
              input={<OutlinedInput label='Toolchain Type' />}
            >
              {TOOLCHAIN_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            sx={{ flexShrink: 0, mr: 0 }}
            control={
              <Switch
                size='small'
                checked={isDryRun}
                onChange={(e) => setIsDryRun(e.target.checked)}
              />
            }
            label={<Typography variant='caption'>Dry run</Typography>}
          />
          <Button
            size='small'
            variant='contained'
            type='submit'
            disabled={isInvoking}
            sx={{ flexShrink: 0 }}
          >
            {isInvoking ? <CircularProgress size={14} color='inherit' /> : 'Invoke'}
          </Button>
        </Stack>

        {/* Save section toggle */}
        {spaceId && (
          <>
            <Divider sx={{ mt: 2 }} />
            <Stack
              direction='row'
              alignItems='center'
              justifyContent='space-between'
              sx={{ mt: 1, cursor: 'pointer' }}
              onClick={() => setShowSave((v) => !v)}
            >
              <Stack direction='row' alignItems='center' spacing={0.75}>
                <BookmarkAddIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                <Typography variant='caption' color='text.secondary' fontWeight={500}>
                  Save as invocation or trigger
                </Typography>
              </Stack>
              <IconButton
                size='small'
                sx={{
                  p: 0.25,
                  transform: showSave ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                <ExpandMoreIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>

            <Collapse in={showSave}>
              <SaveSection
                spaceId={spaceId}
                functionName={selectedFunction.FunctionName || ''}
                toolchainType={toolchainType}
                watchedValues={watchedValues}
                params={params}
              />
            </Collapse>
          </>
        )}
      </Paper>
    </Box>
  );
};
