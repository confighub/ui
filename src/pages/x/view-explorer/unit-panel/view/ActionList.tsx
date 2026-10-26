// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useId } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';

import { Kbd } from '../../lenses/parts';
import type { PanelLinks } from '../links';
import type { ActionState } from '../verdict';
import { newTab } from './new-tab';
import type { PanelActions } from './types';

function ActionItem({ action, run, href }: { action: ActionState; run: () => void; href?: string }) {
  const reasonId = useId();
  const off = !action.enabled;
  return (
    <Box component='li' sx={{ borderBottom: 1, borderColor: 'grey.100', '&:last-of-type': { borderBottom: 0 } }}>
      <ButtonBase
        // Disabled items stay focusable, so the reason can be read.
        aria-disabled={off || undefined}
        aria-describedby={off ? reasonId : undefined}
        aria-keyshortcuts={action.key}
        {...(off ? {} : newTab(href))}
        onClick={off || href ? undefined : () => run()}
        data-action={action.id}
        sx={{
          width: 'calc(100% + 12px)',
          mx: '-6px',
          px: '6px',
          py: '7px',
          borderRadius: 'var(--r-sm)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 1.25,
          alignItems: 'baseline',
          textAlign: 'left',
          cursor: off ? 'not-allowed' : 'pointer',
          '&:hover': { bgcolor: off ? undefined : 'grey.100' },
          '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main', outlineOffset: -2 },
        }}
      >
        <Box component='span' sx={{ fontWeight: 600, fontSize: 13, color: off ? 'text.disabled' : 'text.primary', minWidth: 0 }}>
          {action.label}
          <Box component='small' sx={{ display: 'block', color: 'text.disabled', fontWeight: 500, fontSize: 11.5, mt: '1px' }}>
            {action.hint}
          </Box>
        </Box>
        {off ? (
          <Box component='span' id={reasonId} sx={{ color: 'warning.main', fontWeight: 600, fontSize: 11 }}>
            {action.reason}
          </Box>
        ) : action.key ? (
          <Kbd aria-hidden>{action.key}</Kbd>
        ) : (
          <span />
        )}
      </ButtonBase>
    </Box>
  );
}

/** The other actions, as a plain list; each says what it does and the key that runs it. */
export function ActionList({ list, actions, links }: { list: readonly ActionState[]; actions: PanelActions; links: PanelLinks }) {
  return (
    <Box component='ul' data-testid='vx-unit-actions' sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {list.map((a) => {
        const run = actions[a.id];
        return run ? <ActionItem key={a.id} action={a} run={run} href={links[a.id]} /> : null;
      })}
    </Box>
  );
}
