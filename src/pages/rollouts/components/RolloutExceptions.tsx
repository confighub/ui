// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The triage strip: counts by `ConsoleGroup` — what happens next to a
 * rollout — each one a shortcut into the State filter.
 *
 * The cards hold no filter of their own. Each reads the shared state
 * selection (`groupCardStatus`) and writes a new one through `onSelect`, so a
 * card and the State dropdown always show the same filter. A card is pressed
 * when the selection is exactly its group, and mixed when the dropdown has
 * changed the selection inside or around it.
 *
 * Order is load-bearing (`CONSOLE_GROUPS`) — the group needing a human comes
 * before the ones that do not, so the first number read is the one worth
 * acting on. Every group renders, always, so the strip is a stable set of
 * filters rather than a layout that reshuffles as counts change — a group
 * with nothing in it renders its chip disabled instead of disappearing,
 * unless the selection includes it, so the reader can still click it off.
 *
 * These counts describe everything fetched, not the current page, because the
 * endpoint has no pagination to page. If pagination is ever added,
 * this is the component that starts lying.
 *
 * ⚠️ RE-SKIN WITHOUT RE-IMPLEMENTING, SAME SHAPE AS `RolloutStageStrip`'s
 * `tones` PROP. ALL presentation reaches this component through props —
 * `tones` for the figures' colours, `numSx` for their type, `labelSx` and
 * `hintSx` for the lines under them, `cardSx`, `activeCardSx` and
 * `partialCardSx` for the chip itself. None is optional: this file owns the strip's SHAPE and its
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
import { CONSOLE_GROUPS, type ConsoleGroup } from '../../x/apps/rollout/rolloutsConsoleModel';
import { rolloutsConsoleCopy } from '../../x/apps/rollout/rolloutsConsoleCopy';
import { groupCardStatus, type StateSelection } from '../../x/apps/rollout/rolloutsConsoleStateFilter';

const ARIA_PRESSED = { on: 'true', partial: 'mixed', off: 'false' } as const;

export function RolloutExceptions({
  counts,
  selection,
  onSelect,
  tones,
  numSx,
  labelSx,
  hintSx,
  cardSx,
  activeCardSx,
  partialCardSx,
}: {
  counts: Readonly<Record<ConsoleGroup, number>>;
  /** The State filter's selection, shared with the dropdown. */
  selection: StateSelection;
  /** A card was clicked. The caller turns that into the next selection (`selectionAfterCardClick`). */
  onSelect: (group: ConsoleGroup) => void;
  /** Per-group figure colour. Every group, so no reading falls back to a guess. */
  tones: Record<ConsoleGroup, string>;
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
  /** A card whose group is only partly selected, or selected alongside other states. */
  partialCardSx: Record<string, unknown>;
}) {
  // Nothing in any group (still loading, an empty org, or only rows in no
  // group) is the one case that hides the whole bar — a strip of disabled
  // chips with nothing to report is not status-by-exception, it is noise
  // with extra steps.
  const nothingToCount = CONSOLE_GROUPS.every((group) => counts[group] === 0);
  if (nothingToCount) return null;

  return (
    <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap sx={{ px: 3, pb: 2 }}>
      {CONSOLE_GROUPS.map((group) => {
        const copy = rolloutsConsoleCopy.groups[group];
        const status = groupCardStatus(selection, group);
        const isActive = status === 'on';
        const isPartial = status === 'partial';
        const isDisabled = counts[group] === 0 && status === 'off';
        return (
          <Box
            key={group}
            component='button'
            type='button'
            data-testid={`rollout-exception-${group}`}
            aria-pressed={ARIA_PRESSED[status]}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            onClick={isDisabled ? undefined : () => onSelect(group)}
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
              borderColor: isActive || isPartial ? 'primary.main' : 'divider',
              borderStyle: isPartial ? 'dashed' : 'solid',
              bgcolor: isActive ? 'action.selected' : 'background.paper',
              '&:hover': { bgcolor: isDisabled ? 'background.paper' : 'action.hover' },
              '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 2 },
              ...cardSx,
              ...(isActive ? activeCardSx : undefined),
              ...(isPartial ? partialCardSx : undefined),
            }}
          >
            <Typography
              variant='h6'
              component='span'
              sx={{ color: isDisabled ? 'text.disabled' : tones[group], lineHeight: 1, ...numSx }}
            >
              {counts[group]}
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
