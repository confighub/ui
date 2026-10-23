// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { resourceTypeProblem, whereDataProblem } from './extraChecks';

/**
 * The Filter's two other fields, for Units: ResourceType and WhereData, one
 * line each, as the Filter model has them. The server does not refuse a bad
 * value in a one-row check, so they are checked only here, and the hint says so.
 */

interface FieldRowProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  testId: string;
  invalid: boolean;
}

function FieldRow({ label, value, placeholder, onChange, testId, invalid }: FieldRowProps) {
  return (
    <Stack direction='row' alignItems='center' spacing={1}>
      <Typography
        component='label'
        htmlFor={testId}
        variant='caption'
        sx={{
          width: 92,
          flexShrink: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'text.disabled',
        }}
      >
        {label}
      </Typography>
      <InputBase
        id={testId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        inputProps={{ spellCheck: false, 'data-testid': testId, 'aria-invalid': invalid }}
        sx={{
          flex: 1,
          minWidth: 0,
          height: 30,
          px: 1,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: invalid ? 'error.main' : 'divider',
          borderRadius: 1,
          '&.Mui-focused': { borderColor: invalid ? 'error.main' : 'primary.main' },
          '& input::placeholder': { color: 'text.disabled', opacity: 1 },
        }}
      />
    </Stack>
  );
}

interface ExtraFieldsProps {
  resourceType: string;
  whereData: string;
  onResourceType: (value: string) => void;
  onWhereData: (value: string) => void;
}

export function ExtraFields({ resourceType, whereData, onResourceType, onWhereData }: ExtraFieldsProps) {
  const rtProblem = resourceTypeProblem(resourceType);
  const wdProblem = whereDataProblem(whereData);
  const problem = rtProblem ?? wdProblem;
  return (
    <Box sx={{ mt: 1.5 }} data-testid='vx-text-extra'>
      <Stack spacing={0.75}>
        <FieldRow
          label='ResourceType'
          value={resourceType}
          placeholder='apps/v1/Deployment'
          onChange={onResourceType}
          testId='vx-text-resource-type'
          invalid={!!rtProblem}
        />
        <FieldRow
          label='WhereData'
          value={whereData}
          placeholder='spec.replicas > 2'
          onChange={onWhereData}
          testId='vx-text-where-data'
          invalid={!!wdProblem}
        />
      </Stack>
      {problem ? (
        <Typography sx={{ fontSize: 12, color: 'error.main', mt: 0.5, fontWeight: 600 }} data-testid='vx-text-extra-error'>
          {problem}
        </Typography>
      ) : (
        (resourceType.trim() || whereData.trim()) && (
          <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.5, lineHeight: 1.45 }} data-testid='vx-text-extra-hint'>
            Checked here only: ConfigHub does not confirm ResourceType or WhereData before the view runs.
          </Typography>
        )
      )}
    </Box>
  );
}
