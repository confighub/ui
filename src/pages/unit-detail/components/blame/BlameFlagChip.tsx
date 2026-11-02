// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { MouseEvent, ReactNode } from 'react';

import type { BlameField } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, lighten, useTheme } from '@mui/material/styles';

import { VALIDATION_FLAGS, blameFlagMeta, validationSummary } from './blameFields';

export interface BlameFlagChipProps {
  code: string;
  /**
   * The field the flag is on. With it, a validation flag's tooltip lists the failed checks it
   * stands for.
   */
  field?: BlameField;
  /** Whether a filter chip is selected; a flag on a field is always shown as selected. */
  selected?: boolean;
  onClick?: (event: MouseEvent) => void;
}

/**
 * A flag, in its own hue: filled for a flag that needs attention, outlined for one that only
 * says something about the field.
 */
export const BlameFlagChip = ({
  code,
  field,
  selected = true,
  onClick,
}: BlameFlagChipProps) => {
  const theme = useTheme();
  const meta = blameFlagMeta(code);
  // A dark hue on a dark background is unreadable, so in dark mode the text is lightened.
  const text = theme.palette.mode === 'dark' ? lighten(meta.color, 0.45) : meta.color;
  const filled = meta.attention && selected;

  let title: ReactNode = meta.meaning;
  const checks =
    field && VALIDATION_FLAGS.includes(code)
      ? validationSummary(field, code === 'ValidationWarning')
      : [];
  if (checks.length > 0) {
    title = (
      <Box>
        <Typography
          variant='caption'
          component='div'
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          {meta.meaning}
        </Typography>
        {checks.map((check) => (
          <Typography
            key={check}
            variant='caption'
            component='div'
            sx={{ textTransform: 'none', mt: 0.5 }}
          >
            {check}
          </Typography>
        ))}
        {onClick && (
          <Typography
            variant='caption'
            component='div'
            sx={{ textTransform: 'none', mt: 0.5, fontStyle: 'italic' }}
          >
            Click to see the checks on the Overview tab
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Tooltip title={title}>
      <Chip
        size='small'
        label={meta.label}
        onClick={onClick}
        sx={{
          height: 22,
          fontSize: '0.75rem',
          color: filled ? theme.palette.getContrastText(meta.color) : text,
          backgroundColor: filled
            ? meta.color
            : selected
              ? alpha(meta.color, 0.12)
              : 'transparent',
          border: `1px solid ${selected ? meta.color : alpha(meta.color, 0.4)}`,
          opacity: selected ? 1 : 0.75,
          '&:hover': onClick
            ? { backgroundColor: filled ? meta.color : alpha(meta.color, 0.22), opacity: 1 }
            : undefined,
          '&.MuiChip-clickable:hover': {
            backgroundColor: filled ? meta.color : alpha(meta.color, 0.22),
          },
        }}
      />
    </Tooltip>
  );
};

export interface BlameFlagChipsProps {
  field: BlameField;
  /** Opens the Overview tab, from a validation flag. */
  onValidationClick?: () => void;
}

/** A field's flags, side by side and centered in their row. */
export const BlameFlagChips = ({ field, onValidationClick }: BlameFlagChipsProps) => (
  <Stack
    direction='row'
    spacing={0.5}
    alignItems='center'
    sx={{ height: '100%', overflow: 'hidden' }}
  >
    {(field.Flags ?? []).map((code) => (
      <BlameFlagChip
        key={code}
        code={code}
        field={field}
        onClick={
          onValidationClick && VALIDATION_FLAGS.includes(code)
            ? (event) => {
                // The row opens the field's drawer; the chip goes to the checks instead.
                event.stopPropagation();
                onValidationClick();
              }
            : undefined
        }
      />
    ))}
  </Stack>
);
