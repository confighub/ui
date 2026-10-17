// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A strip of counted cards, each a shortcut into a list's filter: the triage strip
 * at the top of the ChangeOrders and ChangeSets lists.
 *
 * The cards hold no filter of their own. Each says whether the caller's filter is
 * exactly its group (`on`), takes it in part (`partial`), or not (`off`), and a
 * click asks the caller for the next filter. Every card renders, always, so the
 * strip is a stable set of filters rather than a layout that reshuffles as counts
 * change: an empty card is disabled instead of disappearing, unless it is part of
 * the filter, so the reader can still click it off.
 *
 * All presentation reaches this component through props; it owns the strip's
 * shape and behaviour, and the caller owns how it looks.
 */

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const ARIA_PRESSED = { on: 'true', partial: 'mixed', off: 'false' } as const;

export interface KpiCard {
  key: string;
  label: string;
  hint: string;
  count: number;
  status: 'on' | 'partial' | 'off';
  /** The figure's colour. */
  tone: string;
}

export interface KpiStripStyle {
  /** The figure's own type, layered over `variant='h6'`. */
  numSx: Record<string, unknown>;
  labelSx: Record<string, unknown>;
  hintSx: Record<string, unknown>;
  cardSx: Record<string, unknown>;
  activeCardSx: Record<string, unknown>;
  partialCardSx: Record<string, unknown>;
}

export function KpiStrip({
  cards,
  onSelect,
  testIdPrefix,
  numSx,
  labelSx,
  hintSx,
  cardSx,
  activeCardSx,
  partialCardSx,
}: {
  cards: readonly KpiCard[];
  onSelect: (key: string) => void;
  /** Each card's test id is `<prefix>-<key>`. */
  testIdPrefix: string;
} & KpiStripStyle) {
  // Nothing in any group (still loading, an empty org, or only rows in no
  // group) is the one case that hides the whole bar — a strip of disabled
  // chips with nothing to report is not status-by-exception, it is noise
  // with extra steps.
  const nothingToCount = cards.every((card) => card.count === 0);
  if (nothingToCount) return null;

  return (
    <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap sx={{ px: 3, pb: 2 }}>
      {cards.map((card) => {
        const status = card.status;
        const isActive = status === 'on';
        const isPartial = status === 'partial';
        const isDisabled = card.count === 0 && status === 'off';
        return (
          <Box
            key={card.key}
            component='button'
            type='button'
            data-testid={`${testIdPrefix}-${card.key}`}
            aria-pressed={ARIA_PRESSED[status]}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            onClick={isDisabled ? undefined : () => onSelect(card.key)}
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
              sx={{ color: isDisabled ? 'text.disabled' : card.tone, lineHeight: 1, ...numSx }}
            >
              {card.count}
            </Typography>
            <Stack>
              <Typography
                variant='body2'
                component='span'
                fontWeight={600}
                color={isDisabled ? 'text.disabled' : undefined}
                sx={labelSx}
              >
                {card.label}
              </Typography>
              {/*
                ⚠️ `variant='caption'` UPPERCASES: this theme's `caption`
                role carries `textTransform: uppercase` globally
                (`ThemeProvider.tsx:195`). Sentence case is the caller's to
                ask for — `hintSx={{ textTransform: 'none' }}` alongside its
                colour override — so the role keeps the theme default here
                and the override stays visible at the call site that wants
                it. Same shape as `ChangeOrderStageStrip.tsx:186`.
              */}
              <Typography variant='caption' component='span' color='text.secondary' sx={hintSx}>
                {card.hint}
              </Typography>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
