// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// A reference to another entity in Inspect (a Revision, a Unit, a Variant, a user, a ChangeSet...):
// a real link where the entity has a page, plain text where it has none, and on hover or focus a
// peek with a few facts the server returned. The peek opens after a short delay, stays open while
// the pointer moves into it, and Escape closes the peek only, not Inspect around it.

import { type ReactNode, useState } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import { Link as RouterLink } from 'react-router-dom';

import { INFO_PEEK_TOOLTIP_SX } from '@/components/info-peek/InfoPeek';

import { componentTheme as t } from '../componentTheme';

export interface EntityPeek {
  /** What the entity is: "Revision", "Unit", "Variant", "User"... */
  kind: string;
  /** Its name, as the page names it. */
  name: string;
  /** A few facts, one a line. */
  lines?: ReactNode[];
  /** Pages the peek leads to, besides the reference's own. */
  links?: { label: string; href: string; testId?: string }[];
}

/** How long the pointer rests on a reference before its peek opens, as the sheet's value card. */
const PEEK_DELAY_MS = 350;

const linkSx = {
  color: 'inherit',
  textDecorationLine: 'underline',
  textDecorationColor: t.borderEdge,
  textUnderlineOffset: '2px',
  borderRadius: '2px',
  outline: 'none',
  '&:hover': { textDecorationColor: t.fgDefault },
  '&:focus-visible': { outline: `2px solid ${t.accent}`, outlineOffset: '1px' },
} as const;

function PeekCard({ peek, testId, onKeyDown, onFollow }: { peek: EntityPeek; testId: string; onKeyDown: (e: React.KeyboardEvent) => void; onFollow?: () => void }) {
  return (
    <Box data-testid={`${testId}-peek`} onKeyDown={onKeyDown} sx={{ p: '10px 12px', minWidth: 180, maxWidth: 300, fontFamily: t.fontSans }}>
      <Box sx={{ fontSize: 11, fontWeight: 700, color: t.fgMuted }}>{peek.kind}</Box>
      <Box data-testid={`${testId}-peek-name`} sx={{ fontSize: 13, fontWeight: 700, color: t.fgDefault, overflowWrap: 'anywhere', mt: '1px' }}>
        {peek.name}
      </Box>
      {peek.lines?.map((line, i) => (
        <Box key={i} sx={{ fontSize: 12, lineHeight: 1.5, color: t.fgMuted, mt: '2px', overflowWrap: 'anywhere' }}>
          {line}
        </Box>
      ))}
      {peek.links && peek.links.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', mt: '8px', pt: '7px', borderTop: `1px solid ${t.borderSubtle}` }}>
          {peek.links.map((l) => (
            <Link key={l.href} component={RouterLink} to={l.href} data-testid={l.testId} onClick={() => onFollow?.()} underline='hover' sx={{ color: t.accent, fontSize: 12, fontWeight: 600 }}>
              {l.label}
            </Link>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function InspectRef({
  href,
  peek,
  testId,
  onFollow,
  children,
}: {
  /** The entity's page; absent when it has none, and the reference is plain text. */
  href?: string;
  peek: EntityPeek;
  testId: string;
  /** Called when the link is followed, before the page changes (Inspect closes). */
  onFollow?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Escape closes the peek and stops there: Inspect, a popover around it, closes on the next one.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    setOpen(false);
  };
  // Any focus opens the peek, as on the sheet's values; the tooltip alone opens it only for a
  // keyboard focus.
  const openNow = () => setOpen(true);
  return (
    <Tooltip
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      enterDelay={PEEK_DELAY_MS}
      enterNextDelay={PEEK_DELAY_MS}
      leaveDelay={120}
      placement='bottom-start'
      describeChild
      slotProps={{ tooltip: { sx: INFO_PEEK_TOOLTIP_SX } }}
      title={<PeekCard peek={peek} testId={testId} onKeyDown={onKeyDown} onFollow={onFollow} />}
    >
      {href ? (
        <Link component={RouterLink} to={href} data-testid={testId} onKeyDown={onKeyDown} onFocus={openNow} onClick={() => onFollow?.()} sx={linkSx}>
          {children}
        </Link>
      ) : (
        <Box component='span' tabIndex={0} data-testid={testId} onKeyDown={onKeyDown} onFocus={openNow} sx={{ borderRadius: '2px', outline: 'none', cursor: 'default', '&:focus-visible': { outline: `2px solid ${t.accent}`, outlineOffset: '1px' } }}>
          {children}
        </Box>
      )}
    </Tooltip>
  );
}
