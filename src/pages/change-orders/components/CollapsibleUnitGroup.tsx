// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import type { BoxProps } from '@mui/material/Box';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import {
  changeOrderBorder,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';

export interface CollapsibleUnitGroupProps {
  /** Accessible name for the region — the visible label alone does not say whose resources these are. */
  regionLabel: string;
  label: string;
  /** The count exactly as this header states it: `(3)` in one place, `3 resources` in another. */
  count: ReactNode;
  /** `id` of the body, which the header's `aria-controls` points at. Must be unique on the page. */
  bodyId: string;
  expanded: boolean;
  onToggle: () => void;
  sx?: BoxProps['sx'];
  children: ReactNode;
}

/**
 * A list of rows behind one disclosure: a sunk header bar naming the group and
 * its count, with Show/Hide, over a bordered body that mounts only while open.
 * "Passed over" is built on it.
 *
 * `bodyId` is the caller's to supply because uniqueness is the caller's
 * problem: the header's `aria-controls` points at it, so two groups on one
 * page need two ids.
 */
export function CollapsibleUnitGroup({
  regionLabel,
  label,
  count,
  bodyId,
  expanded,
  onToggle,
  sx,
  children,
}: CollapsibleUnitGroupProps) {
  return (
    <Box component="section" role="region" aria-label={regionLabel} sx={sx}>
      <Box
        component="button"
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
        sx={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 12px',
          borderRadius: `${changeOrderShape.radius.md}px`,
          border: `1px solid ${changeOrderBorder.default}`,
          background: changeOrderSurface.sunk,
          '&:focus-visible': { outline: `2px solid ${changeOrderStatus.accent}`, outlineOffset: '2px' },
        }}
      >
        <Box
          sx={{
            fontSize: changeOrderType.size.small,
            fontWeight: changeOrderType.weight.semibold,
            color: changeOrderInk.default,
          }}
        >
          {label}
        </Box>
        <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>{count}</Box>
        <Box
          sx={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: changeOrderType.size.small,
            fontWeight: changeOrderType.weight.semibold,
            color: changeOrderInk.muted,
          }}
        >
          {expanded ? 'Hide' : 'Show'}
          <ExpandMoreIcon
            aria-hidden="true"
            sx={{
              fontSize: 18,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform .15s ease',
            }}
          />
        </Box>
      </Box>
      {expanded ? (
        <Box
          id={bodyId}
          sx={{
            border: `1px solid ${changeOrderBorder.default}`,
            borderRadius: `${changeOrderShape.radius.md}px`,
            marginTop: '6px',
            padding: '6px 12px',
          }}
        >
          {children}
        </Box>
      ) : null}
    </Box>
  );
}
