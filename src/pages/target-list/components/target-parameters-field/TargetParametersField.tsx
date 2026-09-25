// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * TargetParametersField
 *
 * Component for managing Target parameters with individual field inputs.
 * Splits out common Kubernetes parameters (KubeContext, KubeNamespace, WaitTimeout)
 * into separate fields but aggregates them into a JSON string for submission.
 *
 * Supported Parameters:
 * - KubeContext: Kubernetes context to use
 * - KubeNamespace: Kubernetes namespace (defaults to "default")
 * - WaitTimeout: Timeout duration (defaults to "2m0s")
 */
import { useEffect, useState } from 'react';
import { Control, Controller, FieldErrors } from 'react-hook-form';

import { Target } from '@confighub/rtk-query';
import Code from '@mui/icons-material/Code';
import ViewComfy from '@mui/icons-material/ViewComfy';
import Alert from '@mui/material/Alert';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

export interface TargetParametersFieldProps {
  control: Control<Target>;
  errors: FieldErrors<Target>;
  onParametersChange: (params: string) => void;
  initialParameters?: string;
  disabled?: boolean;
}

interface ParsedParameters {
  KubeContext?: string;
  KubeNamespace?: string;
  WaitTimeout?: string;
  [key: string]: string | undefined;
}

/**
 * Parse JSON parameters string into individual fields
 */
const parseParameters = (parametersJson: string): ParsedParameters => {
  try {
    return JSON.parse(parametersJson || '{}');
  } catch {
    return {};
  }
};

/**
 * Build JSON parameters string from individual field values
 */
const buildParameters = (
  kubeContext: string,
  kubeNamespace: string,
  waitTimeout: string,
): string => {
  const params: Record<string, string> = {};

  if (kubeContext?.trim()) {
    params.KubeContext = kubeContext.trim();
  }
  if (kubeNamespace?.trim()) {
    params.KubeNamespace = kubeNamespace.trim();
  }
  if (waitTimeout?.trim()) {
    params.WaitTimeout = waitTimeout.trim();
  }

  return JSON.stringify(params);
};

export const TargetParametersField = ({
  control,
  errors,
  onParametersChange,
  initialParameters,
  disabled = false,
}: TargetParametersFieldProps) => {
  const [kubeContext, setKubeContext] = useState('');
  const [kubeNamespace, setKubeNamespace] = useState('');
  const [waitTimeout, setWaitTimeout] = useState('');
  const [customJson, setCustomJson] = useState('{}');
  const [inputMode, setInputMode] = useState<'fields' | 'json'>('fields');
  const [jsonError, setJsonError] = useState('');

  // Parse initial parameters when component mounts or initialParameters changes
  useEffect(() => {
    if (initialParameters) {
      const parsed = parseParameters(initialParameters);
      if (parsed) {
        setKubeContext(parsed.KubeContext || '');
        setKubeNamespace(parsed.KubeNamespace || '');
        setWaitTimeout(parsed.WaitTimeout || '');
        setCustomJson(initialParameters || '{}');
      }
    }
  }, [initialParameters]);

  // Update aggregated parameters whenever individual fields change
  useEffect(() => {
    if (inputMode === 'fields') {
      const aggregated = buildParameters(kubeContext, kubeNamespace, waitTimeout);
      onParametersChange(aggregated);
    }
  }, [kubeContext, kubeNamespace, waitTimeout, onParametersChange, inputMode]);

  // Handle custom JSON input changes
  const handleCustomJsonChange = (value: string) => {
    setCustomJson(value);
    try {
      JSON.parse(value);
      setJsonError('');
      onParametersChange(value);
    } catch (e) {
      setJsonError('Invalid JSON format');
      console.log(e);
    }
  };

  // Handle mode toggle
  const handleModeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newMode: 'fields' | 'json',
  ) => {
    if (newMode !== null) {
      if (newMode === 'json' && inputMode === 'fields') {
        // Switching from fields to JSON - convert current field values to JSON
        const currentParams = buildParameters(kubeContext, kubeNamespace, waitTimeout);
        setCustomJson(JSON.stringify(JSON.parse(currentParams), null, 2));
      } else if (newMode === 'fields' && inputMode === 'json') {
        // Switching from JSON to fields - parse JSON into fields
        try {
          const parsed = parseParameters(customJson);
          setKubeContext(parsed.KubeContext || '');
          setKubeNamespace(parsed.KubeNamespace || '');
          setWaitTimeout(parsed.WaitTimeout || '');
        } catch {
          // If parsing fails, keep current field values
        }
      }
      setInputMode(newMode);
    }
  };

  return (
    <>
      <Grid size={{ xs: 12 }}>
        <Stack
          direction='row'
          justifyContent='space-between'
          alignItems='center'
          sx={{ mb: 1 }}
        >
          <Typography variant='subtitle2' sx={{ fontWeight: 500 }}>
            Target Parameters
          </Typography>
          <ToggleButtonGroup
            value={inputMode}
            exclusive
            onChange={handleModeChange}
            size='small'
            disabled={disabled}
          >
            <ToggleButton value='fields'>
              <ViewComfy sx={{ fontSize: 18, mr: 0.5 }} />
              Fields
            </ToggleButton>
            <ToggleButton value='json'>
              <Code sx={{ fontSize: 18, mr: 0.5 }} />
              JSON
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Grid>

      {inputMode === 'fields' ? (
        <>
          <Grid size={{ xs: 12 }}>
            <FormControl fullWidth error={!!errors.Parameters}>
              <TextField
                name='KubeContext'
                label='Kube Context'
                placeholder='kind-space17005'
                value={kubeContext}
                onChange={(e) => setKubeContext(e.target.value)}
                size='small'
                fullWidth
                disabled={disabled}
                helperText='Kubernetes context name (required for Kubernetes targets)'
              />
            </FormControl>
          </Grid>

          <Grid size={{ xs: 6 }}>
            <TextField
              label='Kube Namespace'
              placeholder='default'
              value={kubeNamespace}
              onChange={(e) => setKubeNamespace(e.target.value)}
              size='small'
              fullWidth
              disabled={disabled}
              helperText='Kubernetes namespace'
            />
          </Grid>

          <Grid size={{ xs: 6 }}>
            <TextField
              label='Wait Timeout'
              placeholder='2m0s'
              value={waitTimeout}
              onChange={(e) => setWaitTimeout(e.target.value)}
              size='small'
              fullWidth
              disabled={disabled}
              helperText='Timeout duration (e.g., 2m0s, 5m, 30s)'
            />
          </Grid>
        </>
      ) : (
        <>
          <Grid size={{ xs: 12 }}>
            <TextField
              label='Custom Parameters (JSON)'
              placeholder='{"KubeContext": "kind-space17005", "KubeNamespace": "default"}'
              value={customJson}
              onChange={(e) => handleCustomJsonChange(e.target.value)}
              size='small'
              fullWidth
              multiline
              rows={6}
              disabled={disabled}
              error={!!jsonError}
              helperText={jsonError || 'Enter custom parameters as valid JSON'}
              sx={{
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                },
              }}
            />
          </Grid>
          {jsonError && (
            <Grid size={{ xs: 12 }}>
              <Alert severity='error' sx={{ mt: 1 }}>
                {jsonError}
              </Alert>
            </Grid>
          )}
        </>
      )}

      {/* Hidden field that stores the aggregated JSON */}
      <Controller
        name='Parameters'
        control={control}
        rules={{ required: 'Parameters is required' }}
        render={({ field }) => (
          <input
            type='hidden'
            {...field}
            value={
              inputMode === 'fields'
                ? buildParameters(kubeContext, kubeNamespace, waitTimeout)
                : customJson
            }
          />
        )}
      />

      {errors.Parameters && (
        <Grid size={{ xs: 12 }}>
          <FormHelperText error>{errors.Parameters.message}</FormHelperText>
        </Grid>
      )}
    </>
  );
};
