// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';

import { Kbd } from '../../lenses/parts';
import { KEYS } from '../copy';

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
      {children}
    </Box>
  );
}

/**
 * The panel's keys, as a reminder. Hidden from assistive technology: each
 * control names its own key in `aria-keyshortcuts`. "c" is not here: the
 * header's "Compare with…" shows it. A narrow panel wraps the hints onto a
 * second line rather than cut any off.
 */
export function KeysFooter({ primary }: { primary: boolean }) {
  return (
    <Box
      aria-hidden
      data-testid='vx-unit-keys'
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        whiteSpace: 'nowrap',
        gap: '4px 14px',
        px: '14px',
        py: '9px',
        borderTop: 1,
        borderColor: 'divider',
        color: 'text.disabled',
        fontSize: 11.5,
        flexShrink: 0,
      }}
    >
      <Hint keys={['j', 'k']}>{KEYS.rows}</Hint>
      <Hint keys={['⇧J', '⇧K']}>{KEYS.problems}</Hint>
      {primary && <Hint keys={['↵']}>{KEYS.primary}</Hint>}
      <Hint keys={['Esc']}>{KEYS.close}</Hint>
    </Box>
  );
}
