// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The triage strip: counts by state, exceptions first, each one a filter.
 *
 * Order is the design's and is load-bearing — the things needing a human come
 * before the things that do not, so the first numbers read are the ones worth
 * acting on. Every state renders, always, so the strip is a stable set of
 * filters rather than a layout that reshuffles as counts change — a state
 * with nothing in it renders its chip disabled instead of disappearing.
 *
 * These counts describe everything fetched, not the current page, because the
 * endpoint has no pagination to page. If pagination is ever added,
 * this is the component that starts lying.
 *
 * ⚠️ RE-SKIN WITHOUT RE-IMPLEMENTING, SAME SHAPE AS `RolloutStageStrip`'s
 * `tones` PROP. ALL presentation reaches this component through props —
 * `tones` for the figures' colours, `numSx` for their type, `labelSx` and
 * `hintSx` for the lines under them, `cardSx` and `activeCardSx` for the chip
 * itself. None is optional: this file owns the strip's SHAPE and its
 * behaviour, and a caller owns how it looks. A default palette here would be a
 * second opinion on that, visible only on a screen nobody had styled yet.
 *
 * Styling it by editing `componentTheme` instead is the wrong lever: that
 * module is imported by 58 files, so a value swapped there restyles all of
 * them rather than only the caller that asked. A prop costs one map at the
 * call site; a shared-token change costs a blast-radius argument every time.
 */

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ConsoleState } from '../../x/apps/rollout/rolloutsConsoleModel';
import { rolloutsConsoleCopy } from '../../x/apps/rollout/rolloutsConsoleCopy';

/**
 * Exceptions first, then the states that need no action. `aborted` sits with
 * `complete`/`unknown` at the tail — it is closed, not a call to act.
 *
 * `no-workflow` and `no-stages` sit together beside `unknown` for a related
 * reason: neither is a position in a rollout, and neither can be acted on
 * from this page. One means nothing governs the ChangeOrder; the other means
 * a ChangeWorkflow governs it but names nowhere to promote to. What is wrong
 * in either case is upstream of this screen — the ChangeOrder's annotations
 * or the Spaces' labels, never the promotion itself.
 */
const ORDER: ConsoleState[] = [
  'ready',
  'degraded',
  'blocked',
  'progressing',
  'complete',
  'complete-unverified',
  'aborted',
  'no-workflow',
  'no-stages',
  'unknown',
];

export function RolloutExceptions({
  counts,
  active,
  onSelect,
  tones,
  numSx,
  labelSx,
  hintSx,
  cardSx,
  activeCardSx,
}: {
  counts: Record<ConsoleState, number>;
  active: ConsoleState | 'all';
  onSelect: (state: ConsoleState | 'all') => void;
  /** Per-state figure colour. Every state, so no reading falls back to a guess. */
  tones: Record<ConsoleState, string>;
  /**
   * The figure's own type, layered over `variant='h6'` the same way the other
   * style props layer over their own base rules. Carried alongside `tones`
   * rather than separately: a caller matching a reference's larger, monospace
   * count would otherwise have no way to reach it, `tones` being colour-only.
   */
  numSx: Record<string, unknown>;
  /**
   * The label and hint lines' own styling, layered on top of the component's
   * base rules rather than replacing them — a caller overrides only what its
   * palette needs to change, and passes `{}` for the parts it does not.
   */
  labelSx: Record<string, unknown>;
  hintSx: Record<string, unknown>;
  cardSx: Record<string, unknown>;
  activeCardSx: Record<string, unknown>;
}) {
  // Nothing fetched at all (still loading, or a genuinely empty org) is the
  // one case that still hides the whole bar — a strip of disabled chips
  // before there is anything to report is not status-by-exception, it is
  // noise with extra steps.
  const nothingFetched = ORDER.every((state) => counts[state] === 0);
  if (nothingFetched) return null;

  return (
    <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap sx={{ px: 3, pb: 2 }}>
      {ORDER.map((state) => {
        const copy = rolloutsConsoleCopy.states[state];
        const isActive = active === state;
        const isDisabled = counts[state] === 0;
        return (
          <Box
            key={state}
            component='button'
            type='button'
            data-testid={`rollout-exception-${state}`}
            aria-pressed={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            onClick={isDisabled ? undefined : () => onSelect(isActive ? 'all' : state)}
            sx={{
              all: 'unset',
              cursor: isDisabled ? 'default' : 'pointer',
              opacity: isDisabled ? 0.5 : 1,
              display: 'flex',
              alignItems: 'baseline',
              gap: 1,
              px: 1.5,
              py: 1,
              border: 1,
              borderRadius: 1,
              borderColor: isActive ? 'primary.main' : 'divider',
              bgcolor: isActive ? 'action.selected' : 'background.paper',
              '&:hover': { bgcolor: isDisabled ? 'background.paper' : 'action.hover' },
              '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 2 },
              ...cardSx,
              ...(isActive ? activeCardSx : undefined),
            }}
          >
            <Typography
              variant='h6'
              component='span'
              sx={{ color: isDisabled ? 'text.disabled' : tones[state], lineHeight: 1, ...numSx }}
            >
              {counts[state]}
            </Typography>
            <Stack>
              <Typography
                variant='body2'
                component='span'
                fontWeight={600}
                color={isDisabled ? 'text.disabled' : undefined}
                sx={labelSx}
              >
                {copy.label}
              </Typography>
              {/*
                ⚠️ `variant='caption'` UPPERCASES: this theme's `caption`
                role carries `textTransform: uppercase` globally
                (`ThemeProvider.tsx:195`). Sentence case is the caller's to
                ask for — `hintSx={{ textTransform: 'none' }}` alongside its
                colour override — so the role keeps the theme default here
                and the override stays visible at the call site that wants
                it. Same shape as `RolloutStageStrip.tsx:186`.
              */}
              <Typography variant='caption' component='span' color='text.secondary' sx={hintSx}>
                {copy.hint}
              </Typography>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
