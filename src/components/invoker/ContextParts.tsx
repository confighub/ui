// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The parts of the invoker's Context block: its caption, its count, a group header and a
 * selected Unit's row. The function invoker and the change panel's selection block both draw
 * the selected Units with them, so the two read the same.
 */
import type { ReactNode } from 'react';
import { Box, IconButton, Link, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { componentTheme } from '@/pages/x/apps/componentTheme';

/** "CONTEXT", "SELECTED": the block's caption. */
export function ContextCaption({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        fontFamily: componentTheme.fontSans,
        fontWeight: 600,
        fontSize: 10,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: componentTheme.fgMuted,
      }}
    >
      {children}
    </Typography>
  );
}

/** "3 units": the count beside the caption. */
export function ContextCount({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Typography data-testid={testId} sx={{ fontFamily: componentTheme.fontSans, fontSize: 12, color: componentTheme.fgDefault }}>
      {children}
    </Typography>
  );
}

/** A group's header, sticky at the top of the list while its rows scroll. */
export function ContextGroupHeader({ children, first }: { children: ReactNode; first: boolean }) {
  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.5,
        backgroundColor: componentTheme.bgSubtle,
        borderTop: first ? 'none' : `1px solid ${componentTheme.borderSubtle}`,
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
    >
      <Typography
        sx={{
          fontFamily: componentTheme.fontSans,
          fontWeight: 600,
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: componentTheme.fgMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}

/** One selected Unit: its name as a link to the Unit, what the caller puts on the right, and Remove from selection. */
export function ContextUnitRow({
  unitId,
  spaceId,
  name,
  first,
  dimmed = false,
  right,
  onRemove,
  testId = 'invoker-context-unit',
  nameSx,
}: {
  unitId: string;
  spaceId: string;
  name: string;
  first: boolean;
  dimmed?: boolean;
  right?: ReactNode;
  onRemove?: (unitId: string) => void;
  testId?: string;
  nameSx?: object;
}) {
  return (
    <Box
      data-testid={testId}
      data-unit-id={unitId}
      sx={{
        px: 1.5,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderTop: first ? 'none' : `1px solid ${componentTheme.borderSubtle}`,
        opacity: dimmed ? 0.45 : 1,
        '&:hover': { backgroundColor: componentTheme.bgSubtle },
        transition: 'background-color 120ms ease-in-out',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Link
          href={`/units/${spaceId}/${unitId}`}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          title={name}
          onClick={(e) => e.stopPropagation()}
          sx={{
            display: 'block',
            fontFamily: componentTheme.fontSans,
            fontWeight: 500,
            fontSize: 12,
            color: componentTheme.fgDefault,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            '&:hover': { color: componentTheme.accent },
            ...nameSx,
          }}
        >
          {name}
        </Link>
      </Box>
      {right}
      {onRemove && (
        <Tooltip title="Remove from selection">
          <IconButton
            size="small"
            aria-label="Remove from selection"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(unitId);
            }}
            sx={{
              color: componentTheme.fgMuted,
              p: 0.5,
              '&:hover': { color: componentTheme.danger, backgroundColor: componentTheme.dangerFaint },
            }}
          >
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
