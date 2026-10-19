// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactElement, ReactNode } from 'react';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';

import { INFO_PEEK_TOOLTIP_SX } from '@/components/info-peek/InfoPeek';

import { changeOrderFontSans, changeOrderInk, changeOrderStatus, changeOrderType } from '../changeOrdersTokens';
import { CODE_SX } from './draftLook';

export interface DraftPeekSpec {
  /** A short label in sentence case: what this is. Never data. */
  eyebrow: string;
  icon?: ReactNode;
  /** The thing itself, larger: a name, a slug. */
  title?: ReactNode;
  /** Supporting lines, plain text; code in `PeekCode`. */
  lines?: ReactNode[];
  /** What a click on the control does, in the accent. */
  action?: string;
}

export interface PeekCodeProps {
  children: ReactNode;
}

/** A name or value inside a peek's line: the page's inline code. */
export function PeekCode({ children }: PeekCodeProps) {
  return (
    <Box component="code" translate="no" sx={{ ...CODE_SX, fontSize: 11 }}>
      {children}
    </Box>
  );
}

interface PeekCardProps {
  spec: DraftPeekSpec;
}

function PeekCard({ spec }: PeekCardProps) {
  return (
    <Box
      sx={{
        padding: '10px 12px',
        maxWidth: 300,
        fontFamily: changeOrderFontSans,
        fontSize: changeOrderType.size.body,
        lineHeight: changeOrderType.lineHeight.body,
        color: changeOrderInk.default,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: changeOrderType.size.small,
          fontWeight: changeOrderType.weight.semibold,
          color: changeOrderInk.subtle,
          marginBottom: '3px',
          '& .MuiSvgIcon-root': { fontSize: 15 },
        }}
      >
        {spec.icon}
        {spec.eyebrow}
      </Box>
      {spec.title === undefined ? null : (
        <Box sx={{ fontSize: 18, fontWeight: changeOrderType.weight.strong, lineHeight: changeOrderType.lineHeight.tight, overflowWrap: 'anywhere' }}>
          {spec.title}
        </Box>
      )}
      {(spec.lines ?? []).map((line, index) => (
        <Box key={index} sx={{ color: changeOrderInk.muted, marginTop: '2px', overflowWrap: 'anywhere' }}>
          {line}
        </Box>
      ))}
      {spec.action === undefined ? null : (
        <Box sx={{ marginTop: '6px', color: changeOrderStatus.accent, fontWeight: changeOrderType.weight.semibold, fontSize: changeOrderType.size.small }}>
          {spec.action}
        </Box>
      )}
    </Box>
  );
}

export interface DraftPeekProps {
  spec: DraftPeekSpec;
  children: ReactElement;
}

/**
 * The page's hover and focus peek: a light card in the shared peek chrome, never a dark bubble
 * with structure in it. A pure preview: no controls, closed the moment the pointer leaves.
 */
export function DraftPeek({ spec, children }: DraftPeekProps) {
  return (
    <Tooltip
      placement="bottom-start"
      enterDelay={120}
      leaveDelay={0}
      disableInteractive
      describeChild
      slotProps={{ tooltip: { sx: { ...INFO_PEEK_TOOLTIP_SX, maxWidth: 300 } }, transition: { timeout: { enter: 120, exit: 0 } } }}
      title={<PeekCard spec={spec} />}
    >
      {children}
    </Tooltip>
  );
}
