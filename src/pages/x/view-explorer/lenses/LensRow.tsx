// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type MouseEvent, forwardRef } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import type { LensCount } from '../model/counts';
import type { EntityKind, Lens, LensSpec } from '../model/types';
import { noun } from './layer';
import { lensTitle, shortLens } from './lensShort';

/**
 * One lens on one line: the eye, the short form (`Space ~ payments-*`, the
 * `+N` chip outside the ellipsis), and on the right what it does now:
 * "−N" and "alone N" when shown, "off · would −N" when hidden. The numbers do
 * not depend on the order of the lenses: −N is what this lens removes given
 * all the others, and "alone" is what it keeps by itself.
 */

interface LensLineProps {
  entity: EntityKind;
  lens: Lens | LensSpec;
  dim?: boolean;
}

/** The short form, styled: field, operator (red when it excludes), value, and the `+N` chip. */
export function LensLine({ entity, lens, dim }: LensLineProps) {
  const s = shortLens(entity, lens);
  const custom = lens.kind === 'custom';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 0.5 }}>
      <Typography
        component='span'
        noWrap
        sx={{
          fontSize: 13,
          minWidth: 0,
          color: dim ? 'text.disabled' : 'text.secondary',
          lineHeight: '20px',
        }}
      >
        {custom ? (
          <Box
            component='span'
            sx={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: dim ? 'text.disabled' : 'text.secondary',
              mr: 0.75,
            }}
          >
            WHERE
          </Box>
        ) : (
          <Box
            component='span'
            sx={{ fontWeight: 700, color: dim ? 'text.disabled' : 'text.primary' }}
          >
            {s.field}
          </Box>
        )}
        {!custom && (
          <Box
            component='span'
            sx={{
              mx: 0.625,
              color: dim ? 'text.disabled' : s.negated ? 'error.main' : 'text.disabled',
              fontWeight: 600,
            }}
          >
            {s.op}
          </Box>
        )}
        <Box
          component='span'
          sx={{
            fontWeight: 600,
            color: dim ? 'text.disabled' : 'text.primary',
            fontFamily: custom ? 'var(--font-mono)' : undefined,
            fontSize: custom ? 12 : undefined,
          }}
        >
          {s.value}
        </Box>
      </Typography>
      {s.more > 0 && (
        <Box
          component='span'
          sx={{
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 700,
            lineHeight: '16px',
            px: 0.625,
            borderRadius: 999,
            bgcolor: 'action.hover',
            color: dim ? 'text.disabled' : 'text.secondary',
          }}
        >
          +{s.more}
        </Box>
      )}
    </Box>
  );
}

/**
 * Popper offset that puts a tooltip on the eye just past the column's right
 * edge, so it never covers the lens rows under it.
 */
function beyondColumn({
  reference,
}: {
  reference: { x: number; width: number };
}): [number, number] {
  const column = document
    .querySelector('[data-testid="vx-lens-column"]')
    ?.getBoundingClientRect();
  return [0, column ? Math.max(8, column.right - (reference.x + reference.width) + 8) : 8];
}

interface LensRowProps {
  entity: EntityKind;
  lens: Lens;
  count: LensCount | undefined;
  total: number;
  /** Why the lens is not applied (no value yet, a value WHERE cannot hold). */
  problem: string | null;
  /** The server's message when it refused this lens's condition: the lens then matches no rows. */
  refused: string | null;
  /** Set when live counts are off for this view: the reason, shown on the "—" in place of the numbers. */
  countsOff?: string;
  selected: boolean;
  entering: boolean;
  onEye: (e: MouseEvent) => void;
  onOpen: (anchor: HTMLElement) => void;
  onRemove: () => void;
}

export const LensRow = forwardRef<HTMLDivElement, LensRowProps>(function LensRow(
  {
    entity,
    lens,
    count,
    total,
    problem,
    refused,
    countsOff,
    selected,
    entering,
    onEye,
    onOpen,
    onRemove,
  },
  ref,
) {
  const off = !lens.enabled;
  const effect = count?.effect ?? null;
  const alone = count?.alone ?? null;
  const many = noun(entity, 2);

  let n: string;
  let d: string;
  let nTitle: string;
  let dTitle: string;
  if (refused && !off) {
    n = 'refused';
    d = 'shows 0 rows';
    nTitle = `The server refused this filter: ${refused}`;
    dTitle = nTitle;
  } else if (problem) {
    n = '—';
    d = 'not applied';
    nTitle = problem;
    dTitle = problem;
  } else if (countsOff) {
    n = off ? 'off' : '—';
    d = '';
    nTitle = off ? 'This filter is hidden: it does not apply.' : countsOff;
    dTitle = countsOff;
  } else if (off) {
    n = 'off';
    d = effect === null ? 'would —' : `would −${effect}`;
    nTitle = 'This filter is hidden: it does not apply.';
    dTitle =
      effect === null
        ? 'Counting…'
        : `Showing this filter would hide ${effect} ${noun(entity, effect)}`;
  } else {
    n = effect === null ? '—' : effect ? `−${effect}` : '0';
    d = alone === null ? 'alone —' : `alone ${alone}`;
    nTitle =
      effect === null
        ? 'Counting…'
        : `Hiding this filter adds ${effect} ${noun(entity, effect)}`;
    dTitle =
      alone === null
        ? 'Counting…'
        : `This filter by itself keeps ${alone} of ${total} ${many}`;
  }

  return (
    <Box
      ref={ref}
      data-testid='vx-lens'
      data-lens-id={lens.id}
      data-enabled={lens.enabled}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '28px minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: 0.25,
        py: 0.625,
        pr: 0.75,
        pl: 0.25,
        borderRadius: 1,
        border: 1,
        borderColor: selected ? 'primary.main' : 'transparent',
        bgcolor: selected ? 'background.paper' : 'transparent',
        boxShadow: selected ? '0 0 0 3px var(--rust-ring)' : 'none',
        transition: 'background-color .15s, border-color .15s',
        '@keyframes vxLensIn': {
          from: { opacity: 0, transform: 'translateY(-4px)' },
          to: { opacity: 1, transform: 'none' },
        },
        animation: entering ? 'vxLensIn .3s ease-out' : 'none',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        '&:hover': { bgcolor: selected ? 'background.paper' : 'action.hover' },
        '&:hover .vx-lens-rm, & .vx-lens-rm:focus-visible': {
          opacity: 1,
          pointerEvents: 'auto',
        },
      }}
    >
      <Tooltip
        title={`${off ? 'Show' : 'Hide'} this filter · ⌥-click to show only this one`}
        enterDelay={400}
        placement='right'
        slotProps={{
          popper: { modifiers: [{ name: 'offset', options: { offset: beyondColumn } }] },
        }}
      >
        <IconButton
          size='small'
          aria-label={off ? 'Show filter' : 'Hide filter'}
          aria-pressed={!off}
          data-testid='vx-lens-eye'
          onClick={onEye}
          sx={{ width: 26, height: 26, color: off ? 'text.disabled' : 'text.secondary' }}
        >
          {off ? (
            <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} />
          ) : (
            <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Tooltip>
      <Tooltip
        title={`${lensTitle(entity, lens)} · click to edit`}
        enterDelay={600}
        placement='bottom-start'
      >
        <ButtonBase
          data-testid='vx-lens-open'
          onClick={(e) => onOpen(e.currentTarget.parentElement ?? e.currentTarget)}
          sx={{
            justifyContent: 'flex-start',
            minWidth: 0,
            px: 0.25,
            py: 0.125,
            borderRadius: 0.75,
            textAlign: 'left',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              minWidth: 0,
              width: '100%',
            }}
          >
            {(problem || refused) && (
              <ErrorOutlineIcon
                sx={{
                  fontSize: 14,
                  color: refused ? 'error.main' : 'warning.main',
                  flexShrink: 0,
                }}
              />
            )}
            <LensLine entity={entity} lens={lens} dim={off} />
          </Box>
        </ButtonBase>
      </Tooltip>
      <Box
        className='vx-lens-eff'
        sx={{
          position: 'relative',
          textAlign: 'right',
          minWidth: 50,
          lineHeight: 1.2,
          pl: 0.5,
        }}
        data-testid='vx-lens-effect'
      >
        <IconButton
          className='vx-lens-rm'
          size='small'
          aria-label='Remove filter'
          data-testid='vx-lens-remove'
          onClick={onRemove}
          sx={{
            opacity: 0,
            pointerEvents: 'none',
            position: 'absolute',
            // Left of the numbers, over the end of the label: the counts stay in sight.
            right: '100%',
            mr: 0.25,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 22,
            height: 22,
            bgcolor: 'background.paper',
            boxShadow: 1,
            '&:hover': { color: 'error.main', bgcolor: 'background.paper' },
          }}
        >
          <CloseIcon sx={{ fontSize: 13 }} />
        </IconButton>
        <Tooltip
          title={nTitle}
          enterDelay={300}
          placement='right'
          slotProps={{
            popper: { modifiers: [{ name: 'offset', options: { offset: beyondColumn } }] },
          }}
        >
          <Typography
            component='div'
            data-testid='vx-lens-effect-n'
            sx={{
              fontSize: 12.5,
              fontWeight: off || problem ? 700 : 800,
              color:
                refused && !off
                  ? 'error.main'
                  : off || problem
                    ? 'text.disabled'
                    : 'text.primary',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {n}
          </Typography>
        </Tooltip>
        <Typography
          component='div'
          title={dTitle}
          sx={{
            fontSize: 10.5,
            fontWeight: 600,
            color: refused && !off ? 'error.main' : problem ? 'warning.main' : 'text.disabled',
            whiteSpace: 'nowrap',
          }}
        >
          {d}
        </Typography>
      </Box>
    </Box>
  );
});
