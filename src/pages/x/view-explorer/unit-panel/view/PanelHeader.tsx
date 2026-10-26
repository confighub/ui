// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { Kbd } from '../../lenses/parts';
import { HEADER } from '../copy';
import type { UnitPanelModel } from './types';

interface Props {
  title: string;
  model: UnitPanelModel;
  href?: string;
  onClose: () => void;
  onCompare?: (anchor: HTMLElement) => void;
  compareExpanded?: boolean;
}

const quiet = {
  minWidth: 0,
  px: 1,
  height: 30,
  gap: 0.75,
  whiteSpace: 'nowrap',
  fontSize: 12,
  fontWeight: 600,
  color: 'text.secondary',
  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
} as const;

function Sub({ children, clip }: { children: string; clip?: boolean }) {
  return (
    <Box
      component='b'
      title={clip ? children : undefined}
      sx={{
        color: 'text.secondary',
        fontWeight: 600,
        // A long Target name gives way, so the revisions after it stay on one line.
        ...(clip && { display: 'inline-block', maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }),
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The head of a Unit's panel: its name, previous and next with its place in
 * the view, Compare with…, its page and close; under them, where it lives and
 * its revisions.
 */
export function PanelHeader({ title, model, href, onClose, onCompare, compareExpanded }: Props) {
  const { facts, position, total } = model;
  return (
    <Box sx={{ px: '14px', pt: 1.5, pb: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <Typography variant='h2' component='div' noWrap data-testid='vx-drawer-title' sx={{ minWidth: 0, flex: '0 1 auto' }}>
          {title}
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          <Tooltip title={`${HEADER.previous} (k)`}>
            <span>
              <IconButton size='small' aria-label={HEADER.previous} aria-keyshortcuts='k' disabled={!model.onPrevious} onClick={model.onPrevious} data-testid='vx-unit-previous'>
                <ArrowUpwardIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          {position !== null && (
            <Typography component='span' data-testid='vx-unit-position' sx={{ fontSize: 11.5, color: 'text.disabled', fontVariantNumeric: 'tabular-nums', px: '2px', whiteSpace: 'nowrap' }}>
              {HEADER.position(position, total)}
            </Typography>
          )}
          <Tooltip title={`${HEADER.next} (j)`}>
            <span>
              <IconButton size='small' aria-label={HEADER.next} aria-keyshortcuts='j' disabled={!model.onNext} onClick={model.onNext} data-testid='vx-unit-next-row'>
                <ArrowDownwardIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          {onCompare && (
            <Button
              size='small'
              color='inherit'
              aria-haspopup='dialog'
              aria-expanded={!!compareExpanded}
              aria-keyshortcuts='c'
              onClick={(e) => onCompare(e.currentTarget)}
              data-testid='vx-drawer-compare'
              sx={{
                ...quiet,
                fontWeight: 500,
                color: compareExpanded ? 'primary.dark' : 'text.secondary',
                bgcolor: compareExpanded ? 'primary.light' : undefined,
                '&:hover': { bgcolor: compareExpanded ? 'primary.light' : 'action.hover', color: compareExpanded ? 'primary.dark' : 'text.primary' },
              }}
            >
              Compare with…
              <Kbd aria-hidden>c</Kbd>
            </Button>
          )}
          {href && (
            <Button size='small' color='inherit' component={Link} href={href} target='_blank' rel='noopener noreferrer' aria-label={HEADER.open} sx={quiet}>
              Open ↗
            </Button>
          )}
          <IconButton size='small' onClick={onClose} aria-label={HEADER.close}>
            <CloseIcon fontSize='small' />
          </IconButton>
        </Box>
      </Box>
      <Typography component='div' data-testid='vx-unit-sub' sx={{ mt: '3px', fontSize: 12, color: 'text.disabled', overflowWrap: 'anywhere' }}>
        Unit · Space <Sub>{facts.spaceSlug || '—'}</Sub> · {facts.targetSlug ? <>Target <Sub clip>{facts.targetSlug}</Sub></> : HEADER.noTarget} ·{' '}
        <Box component='span' sx={{ whiteSpace: 'nowrap' }}>
          {HEADER.revs(facts.head, facts.released, !!facts.targetId)}
        </Box>
      </Typography>
    </Box>
  );
}
