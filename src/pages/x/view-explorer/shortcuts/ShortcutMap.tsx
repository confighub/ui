// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { plainKey, useShortcutList } from '../keys/usePageShortcuts';
import { Kbd } from '../lenses/parts';
import { type Shortcut, useRegisterShortcut } from '../state/context';

/**
 * "?": every shortcut the page has now, read from the shortcut registry when
 * the sheet opens, so the list is never out of date. Each key is written as
 * the registry writes it.
 */
export function ShortcutMap() {
  const [open, setOpen] = useState(false);
  const shortcut = useMemo<Shortcut>(
    () => ({
      id: 'shortcut-map',
      keys: '?',
      label: 'Show the keyboard shortcuts',
      matches: plainKey('?'),
      run: () => setOpen((o) => !o),
    }),
    [],
  );
  useRegisterShortcut(shortcut);
  return open ? <ShortcutSheet onClose={() => setOpen(false)} /> : null;
}

/**
 * Keys that act only while something is open, so they are not always in the
 * registry: listed here with the condition in their label.
 */
const IN_CONTEXT: Array<Pick<Shortcut, 'id' | 'keys' | 'label'>> = [
  { id: 'peek-pin', keys: 'P', label: 'Pin the open peek as a temporary view' },
  { id: 'escape', keys: 'Esc', label: 'Close the open peek, menu, popover or dialog' },
];

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const registered = useShortcutList();
  const list = [
    ...registered,
    ...IN_CONTEXT.filter((c) => !registered.some((r) => r.id === c.id)),
  ];
  // One line per key: the same key can be registered by two parts of the page that are never on screen together.
  const shown = list.filter((s, i) => list.findIndex((x) => x.keys === s.keys) === i);
  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth='xs'
      fullWidth
      aria-labelledby='vx-shortcut-map-title'
      data-testid='vx-shortcut-map'
      // While the map is open no page shortcut acts: keys stop here (Esc goes on to close it).
      onKeyDown={(e) => {
        if (e.key === '?') onClose();
        if (e.key !== 'Escape') e.stopPropagation();
      }}
    >
      <DialogTitle id='vx-shortcut-map-title' sx={{ fontSize: 15, fontWeight: 700, pb: 1 }}>
        Keyboard shortcuts
      </DialogTitle>
      <DialogContent>
        <Stack component='dl' spacing={0.75} sx={{ m: 0 }}>
          {shown.map((s) => (
            <Stack
              key={s.id}
              direction='row'
              alignItems='center'
              spacing={1.5}
              data-testid='vx-shortcut'
            >
              <Typography component='dt' sx={{ minWidth: 56 }}>
                <Kbd>{s.keys}</Kbd>
              </Typography>
              <Typography component='dd' sx={{ m: 0, fontSize: 13, color: 'text.secondary' }}>
                {s.label}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
