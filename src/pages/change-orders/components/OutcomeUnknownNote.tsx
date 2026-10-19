// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import {
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';

/** A variant the note names. */
export interface OutcomeUnknownVariant {
  spaceId: string;
  label: string;
}

export interface OutcomeUnknownNoteProps {
  variants: readonly OutcomeUnknownVariant[];
  /**
   * Where a variant's chip leads, or `null` for a plain chip. The chip opens the
   * variant itself in a new tab, not the ChangeOrder at it.
   */
  hrefFor?: (spaceId: string) => string | null;
}

/**
 * The variants whose outcome could not be established, as a note and never as
 * a bar segment or a card: "we could not look" is not one of the ways a
 * promotion can come out, so it does not belong in the partition that draws
 * how it did. Neutral ink, not a warning tone, for the same reason
 * `OUTCOME_META` gives `unknown` none.
 *
 * Named, not just counted: a reader who wants to look into why needs to know
 * which variants.
 */
export function OutcomeUnknownNote({ variants, hrefFor }: OutcomeUnknownNoteProps) {
  return (
    <Box
      data-testid="outcome-unknown-note"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '8px 12px',
        marginBottom: '10px',
        borderRadius: `${changeOrderShape.radius.md}px`,
        border: `1px solid ${changeOrderBorder.default}`,
        background: changeOrderSurface.sunk,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <HelpOutlineIcon aria-hidden="true" sx={{ fontSize: 16, color: changeOrderInk.subtle, flex: '0 0 auto' }} />
        <Box component="span" sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>
          <b style={{ color: changeOrderInk.muted }}>{variants.length}</b>{' '}
          {variants.length === 1 ? 'variant' : 'variants'} could not be
          established this round.
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: '5px', flexWrap: 'wrap', paddingLeft: '24px' }}>
        {variants.map(({ spaceId, label }) => {
          const href = hrefFor?.(spaceId) ?? null;
          return (
            <Box
              key={spaceId}
              component={href !== null ? 'a' : 'span'}
              href={href ?? undefined}
              target={href !== null ? '_blank' : undefined}
              rel={href !== null ? 'noopener noreferrer' : undefined}
              data-testid="outcome-unknown-chip"
              sx={{
                height: 22,
                padding: '0 8px',
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: `${changeOrderShape.radius.pill}px`,
                border: `1px solid ${changeOrderBorder.strong}`,
                background: changeOrderSurface.card,
                fontFamily: changeOrderFontMono,
                fontSize: changeOrderType.size.small,
                color: changeOrderInk.muted,
                whiteSpace: 'nowrap',
                textDecoration: href !== null ? 'underline' : 'none',
                textDecorationColor: changeOrderBorder.strong,
              }}
            >
              {label}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
