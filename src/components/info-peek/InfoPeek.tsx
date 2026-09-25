// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';

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
  /** Accent action label; the "→" is appended. Omit for a purely informational peek with no follow-up action. */
  action?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * The "metric hero" info-peek card: leads with a number (when given), lists
 * supporting detail, and optionally ends with an accent hint at what a click
 * elsewhere on the trigger would do. Pair with `INFO_PEEK_TOOLTIP_SX` on the
 * wrapping Tooltip (or Popover) so the card itself supplies the only
 * chrome — this component renders content only, no border/shadow of its own.
 */
export const InfoPeekCard = ({ color, spec }: { color: string; spec: InfoPeekSpec }) => (
  <Box sx={{ p: '11px 12px 10px', minWidth: 176, fontFamily: INFO_PEEK_FONT_MONO }}>
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
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: 11,
          fontWeight: 700,
          color,
        }}
      >
        {spec.action}
        <Box component="span">→</Box>
      </Box>
    )}
  </Box>
);
