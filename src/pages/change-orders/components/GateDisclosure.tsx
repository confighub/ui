// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

import type { ChangeOrderGateState } from '../../x/apps/change-order/changeOrderGates';
import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';

export interface GateDisclosureProps {
  /** `gateStateFor` over the stage's gates. `held` and `unknown` draw differently: a refusal somebody issued, and a check nobody made. */
  state: ChangeOrderGateState;
  /** The tally beside "Gates", as the caller words it. */
  summary: ReactNode;
  /** `id` of the list, which the bar's `aria-controls` points at. */
  bodyId: string;
  expanded: boolean;
  onToggle: () => void;
  /** The gate list. */
  children: ReactNode;
}

/** A stage's gates behind one bar: a padlock in the state's tone, the tally, and Show/Hide. */
export function GateDisclosure({ state, summary, bodyId, expanded, onToggle, children }: GateDisclosureProps) {
  const GateStateIcon = state === 'open' ? LockOpenOutlinedIcon : LockOutlinedIcon;
  const tone =
    state === 'open' ? changeOrderStatus.success : state === 'unknown' ? changeOrderInk.muted : changeOrderStatus.warn;
  return (
    <>
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
          marginBottom: expanded ? '8px' : 0,
          '&:focus-visible': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: '2px' },
        }}
      >
        <GateStateIcon aria-hidden="true" sx={{ fontSize: 16, color: tone, flex: '0 0 auto' }} />
        <Box
          sx={{
            fontSize: changeOrderType.size.small,
            fontWeight: changeOrderType.weight.semibold,
            color: changeOrderInk.default,
          }}
        >
          Gates
        </Box>
        <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>{summary}</Box>
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
            overflow: 'hidden',
            marginBottom: '4px',
          }}
        >
          {children}
        </Box>
      ) : null}
    </>
  );
}
