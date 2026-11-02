// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { ValidationResult } from '@confighub/rtk-query';
import { Box, Chip, Link, Stack, Typography } from '@mui/material';

import { FieldFinding, validationFindings } from './validationFindings';

const COLLAPSED_COUNT = 3;

export interface ValidationFindingsListProps {
  results: ValidationResult[] | undefined;
  isWarning?: boolean;
  /** Shows every finding rather than the first few, with a toggle for the rest. */
  showAll?: boolean;
  /**
   * Where a failed field links to, such as the field in the Unit's blame. Without it, the path
   * is shown as text.
   */
  fieldHref?: (finding: FieldFinding) => string | undefined;
}

const findingTextSx = { fontSize: '0.7rem', wordBreak: 'break-word' } as const;

const FieldFindingRow = ({
  finding,
  isWarning,
  fieldHref,
}: {
  finding: FieldFinding;
  isWarning: boolean;
  fieldHref?: (finding: FieldFinding) => string | undefined;
}) => {
  const resource = [finding.resourceType, finding.resourceName].filter(Boolean).join('/');
  const href = fieldHref?.(finding);
  const pathText = (
    <Typography
      component='span'
      sx={{ ...findingTextSx, fontFamily: 'monospace', fontWeight: 600 }}
    >
      {finding.path || '(whole resource)'}
    </Typography>
  );
  return (
    <Box
      data-testid='validation-field-finding'
      sx={{
        borderLeft: '2px solid',
        borderColor: isWarning ? 'warning.light' : 'error.light',
        pl: 1,
      }}
    >
      <Stack direction='row' spacing={0.5} alignItems='center' flexWrap='wrap'>
        {href ? (
          <Link
            component={RouterLink}
            to={href}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {pathText}
          </Link>
        ) : (
          pathText
        )}
        {finding.score && (
          <Chip label={finding.score} size='small' sx={{ height: 16, fontSize: '0.6rem' }} />
        )}
      </Stack>
      {resource && (
        <Typography
          variant='caption'
          display='block'
          color='text.secondary'
          sx={findingTextSx}
        >
          {resource}
        </Typography>
      )}
      {finding.messages.map((message, index) => (
        <Typography key={index} variant='caption' display='block' sx={findingTextSx}>
          {message}
        </Typography>
      ))}
      {finding.value !== undefined && (
        <Typography variant='caption' display='block' sx={findingTextSx}>
          Found:{' '}
          <Box component='span' sx={{ fontFamily: 'monospace' }}>
            {finding.value}
          </Box>
        </Typography>
      )}
    </Box>
  );
};

/**
 * The fields a gate's failed checks name, each with what the function said about it and the
 * value it found, followed by the checks that name no field.
 */
export const ValidationFindingsList = ({
  results,
  isWarning = false,
  showAll = false,
  fieldHref,
}: ValidationFindingsListProps) => {
  const [expanded, setExpanded] = useState(false);
  const findings = useMemo(() => validationFindings(results), [results]);
  const total = findings.fields.length + findings.unit.length;
  if (total === 0) {
    return null;
  }

  const limit = showAll || expanded ? Infinity : COLLAPSED_COUNT;
  const fields = findings.fields.slice(0, limit);
  const unit = findings.unit.slice(0, Math.max(0, limit - fields.length));
  const hidden = total - fields.length - unit.length;

  return (
    <Stack spacing={0.75} data-testid='validation-findings'>
      {fields.map((finding) => (
        <FieldFindingRow
          key={finding.key}
          finding={finding}
          isWarning={isWarning}
          fieldHref={fieldHref}
        />
      ))}
      {unit.map((finding) => (
        <Box
          key={finding.key}
          data-testid='validation-unit-finding'
          sx={{
            borderLeft: '2px solid',
            borderColor: isWarning ? 'warning.light' : 'error.light',
            pl: 1,
          }}
        >
          <Stack direction='row' spacing={0.5} alignItems='center'>
            <Typography sx={{ ...findingTextSx, fontWeight: 600 }}>
              {finding.functionName ? `${finding.functionName} failed` : 'Check failed'}
            </Typography>
            {finding.score && (
              <Chip
                label={finding.score}
                size='small'
                sx={{ height: 16, fontSize: '0.6rem' }}
              />
            )}
          </Stack>
          {finding.messages.map((message, index) => (
            <Typography key={index} variant='caption' display='block' sx={findingTextSx}>
              {message}
            </Typography>
          ))}
        </Box>
      ))}
      {!showAll && (hidden > 0 || expanded) && (
        <Typography
          variant='caption'
          role='button'
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          sx={{ fontSize: '0.7rem', color: 'primary.main', cursor: 'pointer' }}
        >
          {expanded ? 'Show fewer' : `Show ${hidden} more`}
        </Typography>
      )}
    </Stack>
  );
};
