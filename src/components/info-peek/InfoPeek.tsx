// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type ReactElement, useState } from 'react';

import Box from '@mui/material/Box';
import Tooltip, { type TooltipProps } from '@mui/material/Tooltip';

// ============================================================================
// TOKENS
// ============================================================================
//
// The "nice popout" recipe: a light, bordered card with a soft shadow,
// standing in for MUI's default dark Tooltip whenever the content is
// genuinely explanatory (more than a one-line label). See
// docs/dev/ui-design-system.md → Informational Popouts (Peek Cards) — this
// is the shared implementation that doc points at. Values are the same ones
// validated on the component-view node chips (Stale / Live / Release peeks);
// kept as literal constants here (rather than importing a page-scoped theme
// module) so this component has no dependency on any one feature's tokens.

const INFO_PEEK_BG = '#ffffff';
const INFO_PEEK_FG_MUTED = '#505969';
const INFO_PEEK_FG_SUBTLE = '#8e9aaa';
const INFO_PEEK_BORDER = '#e6e8ec';
const INFO_PEEK_BORDER_SUBTLE = '#f3f4f6';
const INFO_PEEK_RADIUS = 9;
const INFO_PEEK_SHADOW = '0 4px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)';
const INFO_PEEK_FONT_MONO = '"JetBrains Mono", "Courier New", monospace';

/** Drop into `<Tooltip slotProps={{ tooltip: { sx: INFO_PEEK_TOOLTIP_SX } }}>` to render
 *  the light "nice popout" card instead of MUI's default dark tooltip bubble. */
export const INFO_PEEK_TOOLTIP_SX = {
  bgcolor: INFO_PEEK_BG,
  color: '#111214',
  p: 0,
  m: 0,
  border: `1px solid ${INFO_PEEK_BORDER}`,
  borderRadius: `${INFO_PEEK_RADIUS}px`,
  boxShadow: INFO_PEEK_SHADOW,
  maxWidth: 'none',
  overflow: 'hidden',
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface InfoPeekSpec {
  /** Small-caps eyebrow, e.g. "Stale · behind upstream". */
  eyebrow: string;
  /** Hero metric (the "2d stale" moment). Optional. */
  metric?: { value: string; unit?: string };
  /** Muted supporting lines. */
  lines: string[];
  /**
   * Accent action label; the "→" is appended. With `onAction` it is a link the pointer can move
   * onto and click; without it, a hint at what clicking the peek's trigger does. Omit for a
   * purely informational peek with no follow-up action.
   */
  action?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * The "metric hero" info-peek card: leads with a number (when given), lists
 * supporting detail, and optionally ends with an accent action: a link when
 * `onAction` is given, else a hint at what a click on the trigger does.
 * Prefer `InfoPeekTooltip`, which wraps a trigger in this card; used directly,
 * pair it with `INFO_PEEK_TOOLTIP_SX` on the wrapping Tooltip (or Popover) so
 * the card itself supplies the only chrome — this component renders content
 * only, no border/shadow of its own.
 */
export const InfoPeekCard = ({
  color,
  spec,
  onAction,
  testId,
}: {
  color: string;
  spec: InfoPeekSpec;
  onAction?: () => void;
  testId?: string;
}) => (
  <Box data-testid={testId} sx={{ p: '11px 12px 10px', minWidth: 176, fontFamily: INFO_PEEK_FONT_MONO }}>
    <Box sx={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>
      {spec.eyebrow}
    </Box>
    {spec.metric && (
      <Box sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.05, m: '3px 0 1px' }}>
        {spec.metric.value}
        {spec.metric.unit && (
          <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: INFO_PEEK_FG_SUBTLE, ml: '5px' }}>
            {spec.metric.unit}
          </Box>
        )}
      </Box>
    )}
    {spec.lines.map((line, i) => (
      <Box key={i} sx={{ fontSize: 11, lineHeight: 1.5, color: INFO_PEEK_FG_MUTED, mt: spec.metric ? 0 : '3px' }}>
        {line}
      </Box>
    ))}
    {spec.action && (
      <Box
        sx={{
          mt: '9px',
          pt: '8px',
          borderTop: `1px solid ${INFO_PEEK_BORDER_SUBTLE}`,
        }}
      >
        <Box
          {...(onAction
            ? {
                component: 'button' as const,
                type: 'button' as const,
                onClick: onAction,
                'data-testid': 'info-peek-action',
              }
            : {})}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            p: 0,
            border: 0,
            background: 'none',
            font: 'inherit',
            fontSize: 11,
            fontWeight: 700,
            color,
            ...(onAction && {
              cursor: 'pointer',
              '&:hover, &:focus-visible': { textDecoration: 'underline', textUnderlineOffset: '2px' },
            }),
          }}
        >
          {spec.action}
          <Box component="span">→</Box>
        </Box>
      </Box>
    )}
  </Box>
);

/**
 * A trigger with its info-peek card on hover. With `onAction` (and an `action`
 * in the spec) the card stays open while the pointer moves onto it, and its
 * action is a link that does `onAction` and closes the card; without, the card
 * is a pure hover preview, gone the instant the pointer leaves the trigger.
 *
 * Clicks and presses inside the card stop at it: it is portaled out of the
 * page's DOM but not out of React's tree, so they would otherwise reach the
 * trigger's ancestors, such as a graph node that selects itself on click.
 */
export const InfoPeekTooltip = ({
  color,
  spec,
  onAction,
  placement = 'bottom-start',
  testId,
  describeChild,
  children,
}: {
  color: string;
  spec: InfoPeekSpec;
  onAction?: () => void;
  placement?: TooltipProps['placement'];
  /** `data-testid` of the card. */
  testId?: string;
  /**
   * The open card describes the trigger instead of naming it, so a trigger
   * with its own `aria-label` keeps that name while the card is open.
   */
  describeChild?: boolean;
  children: ReactElement;
}) => {
  const [open, setOpen] = useState(false);
  const interactive = !!spec.action && !!onAction;
  return (
    <Tooltip
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      placement={placement}
      describeChild={describeChild}
      enterDelay={120}
      // A short grace period lets the pointer cross from the trigger to the card.
      leaveDelay={interactive ? 150 : 0}
      disableInteractive={!interactive}
      slotProps={{
        tooltip: { sx: INFO_PEEK_TOOLTIP_SX },
        transition: { timeout: { enter: 120, exit: interactive ? 100 : 0 } },
      }}
      title={
        <Box
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <InfoPeekCard
            color={color}
            spec={spec}
            testId={testId}
            onAction={
              interactive
                ? () => {
                    setOpen(false);
                    onAction();
                  }
                : undefined
            }
          />
        </Box>
      }
    >
      {children}
    </Tooltip>
  );
};
