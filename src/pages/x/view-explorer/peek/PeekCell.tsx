// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';

import { type EntityRow, fieldById } from '../model/fields';
import type { EntityKind } from '../model/types';
import { absoluteTime, shortRelative, shortToolchain, toolchainColor } from '../table/format';

/**
 * One cell of a peek: the value as the table writes it (short toolchain with
 * its colour mark, "r3", relative times, status chips), but plain text, not a
 * control. The table's cells are buttons (a value opens the cell popover);
 * in a peek nothing would answer, so nothing looks clickable.
 */

const STATUS_COLOR: Record<string, 'warning' | 'secondary' | 'success' | 'default'> = {
  Unreleased: 'warning',
  'Upgrade available': 'secondary',
  Released: 'success',
};

const ellipsis = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
} as const;

export function PeekCell({
  entity,
  name,
  row,
  primary,
}: {
  entity: EntityKind;
  name: string;
  row: EntityRow;
  primary: boolean;
}) {
  const field = fieldById(entity, name);
  const value = field?.value(row) ?? null;
  if (value === null || value === '') {
    return (
      <Box component='span' sx={{ color: 'text.disabled' }}>
        —
      </Box>
    );
  }
  const text = String(value);
  if (field?.type === 'status') {
    return (
      <Chip
        size='small'
        color={STATUS_COLOR[text] ?? 'default'}
        label={text}
        sx={{ height: 20, fontSize: '11px', fontWeight: 600, maxWidth: '100%' }}
      />
    );
  }
  if (field?.type === 'time') {
    return (
      <Box
        component='span'
        title={absoluteTime(text)}
        sx={{ ...ellipsis, color: 'text.secondary' }}
      >
        {shortRelative(text)}
      </Box>
    );
  }
  if (field?.id === 'ToolchainType' || field?.id === 'Unit.ToolchainType') {
    return (
      <Box
        component='span'
        title={text}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          minWidth: 0,
          color: 'text.secondary',
        }}
      >
        <Box
          component='span'
          sx={{
            width: 8,
            height: 8,
            borderRadius: 0.5,
            flexShrink: 0,
            bgcolor: `${toolchainColor(text)}.main`,
          }}
        />
        <Box component='span' sx={ellipsis}>
          {shortToolchain(text)}
        </Box>
      </Box>
    );
  }
  if (field?.type === 'number' && /RevisionNum$/.test(field.id)) {
    return (
      <Box component='span' sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
        {Number(value) > 0 ? `r${text}` : '—'}
      </Box>
    );
  }
  return (
    <Box
      component='span'
      title={text}
      sx={{
        ...ellipsis,
        fontWeight: primary ? 700 : 400,
        color: primary ? 'text.primary' : 'text.secondary',
      }}
    >
      {text}
    </Box>
  );
}
