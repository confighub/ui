// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useId } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { Kbd } from '../../lenses/parts';
import type { PanelLinks } from '../links';
import type { PrimaryAction } from '../verdict';
import { newTab } from './new-tab';
import type { PanelActions } from './types';

/**
 * The one filled button of the panel, with ↵ (or the key it is bound to) and
 * a line that says why it comes first. Nothing is drawn for an action that
 * cannot run from here.
 */
export function PrimaryRow({ primary, actions, links }: { primary: PrimaryAction; actions: PanelActions; links: PanelLinks }) {
  const whyId = useId();
  const run = primary.id ? actions[primary.id] : undefined;
  if (primary.id && !run) return null;
  // Going to the next problem has its own key, which reads better beside "Go to …" than ↵ (which also runs it).
  const nextProblem = primary.id === 'next-problem';
  const href = primary.enabled && primary.id ? links[primary.id] : undefined;
  return (
    // The line that says why stays beside the button, wrapping inside itself; under it only in a panel narrower than 440px.
    <Box sx={{ containerType: 'inline-size', mt: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, '@container (max-width: 410px)': { flexWrap: 'wrap' } }}>
        <Button
          variant='contained'
          size='small'
          disabled={!primary.enabled || !run}
          {...newTab(href)}
          onClick={href || !run ? undefined : () => run()}
          aria-keyshortcuts={nextProblem ? 'Enter Shift+J' : 'Enter'}
          aria-describedby={whyId}
          data-testid='vx-unit-primary'
          sx={{ height: 30, px: 1.5, gap: 1, fontSize: 12.5, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {primary.label}
          <Kbd
            aria-hidden
            sx={(t) => ({
              color: 'inherit',
              bgcolor: alpha(t.palette.common.white, 0.18),
              borderColor: alpha(t.palette.common.white, 0.35),
            })}
          >
            {nextProblem ? '⇧J' : '↵'}
          </Kbd>
        </Button>
        <Typography id={whyId} component='span' sx={{ fontSize: 12, color: 'text.disabled', minWidth: 0, lineHeight: 1.35 }}>
          {primary.why}
        </Typography>
      </Box>
    </Box>
  );
}
