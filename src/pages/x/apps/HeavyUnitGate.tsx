// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The "show fast, load full on demand" placeholder for an oversized unit.
 *
 * Renders IN PLACE OF the field tree when `unitSizeGuard` says a unit's payload
 * is too big to build automatically. It is deliberately a dumb presentational
 * component: it receives the configuration string and never parses it
 * except on an explicit user action (Copy / Download). Rendering this card must
 * cost nothing — that is the entire point of the gate.
 *
 * Design: `design-large-unit-gate/01-inline-card.html` (direction 01, inline
 * placeholder card) plus the size chip from direction 02. Signed off with these
 * decisions:
 *   • SIZE ONLY. The mockup showed an estimated field count; it was cut because
 *     we bail before decoding, so any count would be invented.
 *   • No confirmation modal — "Render anyway" renders directly (components.md
 *     rule 11, and the removed `PromotionCommitSummaryDialog`).
 *   • Never auto-switch to Source view (components.md rule 13).
 *
 * Terminology: this card says "not loaded" and talks about BYTES. The treeview's
 * existing "Large unit (N fields) — folders collapsed by default" banner talks
 * about PATH COUNT, after a successful parse. Two different thresholds measuring
 * two different things — the vocabularies are kept apart on purpose.
 */

import { Box, Skeleton } from '@mui/material';
import { memo, useCallback, useState } from 'react';

import { componentTheme } from './componentTheme';
import { formatUnitDataSize } from './unitSizeGuard';

// ============================================================================
// ICONS (inlined from the mockup — see design-large-unit-gate/)
// ============================================================================

const InfoIcon = (
  <svg
    width='14'
    height='14'
    viewBox='0 0 14 14'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    style={{ display: 'block' }}
  >
    <circle cx='7' cy='7' r='5.5' />
    <line x1='7' y1='5' x2='7' y2='7.5' />
    <circle cx='7' cy='9.5' r='0.6' fill='currentColor' stroke='none' />
  </svg>
);

const CopyIcon = (
  <svg
    width='13'
    height='13'
    viewBox='0 0 14 14'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.4'
    style={{ display: 'block' }}
  >
    <rect x='4.5' y='4.5' width='8' height='8' rx='1.5' />
    <path d='M9.5 2.5h-7a1 1 0 00-1 1v7' />
  </svg>
);

const DownloadIcon = (
  <svg
    width='13'
    height='13'
    viewBox='0 0 14 14'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.4'
    style={{ display: 'block' }}
  >
    <path d='M7 2v7M4 6.5L7 9.5l3-3M2.5 12h9' />
  </svg>
);

/** The `< >` glyph the pane's own Tree/Source toggle uses for Source view. */
const SourceIcon = (
  <svg
    width='13'
    height='13'
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.4'
    style={{ display: 'block' }}
  >
    <path d='M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4' />
  </svg>
);

/** Left-pointing chevron for the "back to tree view" return path. */
const BackIcon = (
  <svg
    width='13'
    height='13'
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.6'
    style={{ display: 'block' }}
  >
    <path d='M9.5 4L5.5 8l4 4' />
  </svg>
);

// ============================================================================
// SHARED STYLE OBJECTS
// ============================================================================

/**
 * Button styling from the mockup's `.btn` / `.btn.primary` / `.btn.ghost`.
 * Kept as plain `sx` objects on `Box component='button'` rather than MUI
 * `<Button>` because the surrounding pane is entirely custom-tokened and an MUI
 * Button would drag in the app theme's palette, which is not `componentTheme`.
 */
const buttonBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: 28,
  px: '11px',
  border: `1px solid ${componentTheme.borderDefault}`,
  background: componentTheme.bgDefault,
  borderRadius: '6px',
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: componentTheme.fontSans,
  color: componentTheme.fgMuted,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all .14s cubic-bezier(0.16,1,0.3,1)',
  '&:hover': { borderColor: componentTheme.fgSubtle, color: componentTheme.fgDefault },
} as const;

const buttonPrimary = {
  ...buttonBase,
  height: 32,
  px: '14px',
  fontSize: 13,
  background: componentTheme.accent,
  color: componentTheme.fgOnEmphasis,
  borderColor: componentTheme.accentEmphasis,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 1px 2px rgba(140,44,0,0.18)',
  '&:hover': { background: componentTheme.accentEmphasis, color: componentTheme.fgOnEmphasis },
} as const;

const buttonGhost = {
  ...buttonBase,
  height: 24,
  px: '9px',
  fontSize: 11.5,
  borderColor: 'transparent',
  background: 'transparent',
  '&:hover': { background: componentTheme.bgInset, color: componentTheme.fgDefault },
} as const;

// ============================================================================
// SIZE CHIP
// ============================================================================

export interface UnitSizeChipProps {
  /** The unit's configuration. Never parsed. */
  data: string | undefined;
  /**
   * True while the unit's fields are being withheld. Renders the attention-toned
   * "· not loaded" variant; once rendered, the chip drops to a neutral size label
   * and stays as the standing explanation for why the unit felt slow.
   */
  held?: boolean;
}

/**
 * The `4.9 MB` / `4.9 MB · not loaded` chip that sits next to a unit's slug in
 * the pane's unit header row. Taken from design direction 02 — worth having on
 * every oversized unit, gated or not, because it explains slowness before the
 * user has to ask.
 *
 * It is a SIZE, never a change count: components.md explicitly rejected a
 * per-unit-row "N changes" counter, and this must not drift into one.
 */
export const UnitSizeChip = memo(function UnitSizeChip({ data, held = false }: UnitSizeChipProps) {
  return (
    <Box
      component='span'
      data-testid='unit-size-chip'
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        height: 18,
        px: '7px',
        borderRadius: `${componentTheme.radiusMd}px`,
        border: `1px solid ${held ? 'rgba(180,83,9,0.25)' : componentTheme.borderMuted}`,
        background: held ? componentTheme.attentionMuted : componentTheme.bgDefault,
        fontFamily: componentTheme.fontMono,
        fontSize: 10,
        fontWeight: 700,
        color: held ? componentTheme.attentionEmphasis : componentTheme.fgMuted,
        flexShrink: 0,
      }}
    >
      {held && (
        <Box
          component='span'
          sx={{ width: 5, height: 5, borderRadius: '50%', background: componentTheme.attention }}
        />
      )}
      {formatUnitDataSize(data)}
      {held ? ' · not loaded' : ''}
    </Box>
  );
});

// ============================================================================
// LOADING PLACEHOLDER
// ============================================================================

/**
 * What replaces the card between "Render anyway" and the tree appearing, and
 * what a merely-large (allowed) unit shows on its first paint.
 *
 * This only ever appears if the heavy build is deferred off the click — a
 * synchronous build in the handler would freeze straight from card to finished
 * tree and this would never paint. See `ComponentSidePane`'s `startTransition`
 * / `useDeferredValue` wiring.
 */
export const HeavyUnitLoading = memo(function HeavyUnitLoading({
  narrate = false,
}: {
  /**
   * Show the progress strip. True when the user ASKED for this (they clicked
   * Render anyway and deserve an acknowledgement); false for a deferred first
   * paint, where nothing was requested and narration would be noise.
   */
  narrate?: boolean;
}) {
  return (
    <Box data-testid='heavy-unit-loading'>
      {narrate && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            m: '8px 8px 6px',
            p: '9px 12px',
            border: `1px solid ${componentTheme.borderMuted}`,
            borderRadius: '7px',
            background: componentTheme.bgDefault,
            fontSize: 11.5,
            fontFamily: componentTheme.fontSans,
            color: componentTheme.fgMuted,
          }}
        >
          <Box
            sx={{
              flex: 1,
              height: 3,
              borderRadius: '2px',
              background: componentTheme.bgInset,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                width: '32%',
                height: '100%',
                borderRadius: '2px',
                background: componentTheme.accent,
                animation: 'heavyUnitIndet 1.15s cubic-bezier(0.16,1,0.3,1) infinite',
                '@keyframes heavyUnitIndet': {
                  '0%': { transform: 'translateX(-100%)' },
                  '100%': { transform: 'translateX(320%)' },
                },
              }}
            />
          </Box>
          <Box component='span' sx={{ whiteSpace: 'nowrap' }}>
            Loading fields — a few seconds
          </Box>
        </Box>
      )}
      {/* Skeleton field rows mirroring the real row columns (path / before / after). */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Box
          key={i}
          sx={{ display: 'flex', alignItems: 'center', gap: '12px', p: '2px 16px' }}
        >
          <Skeleton variant='rounded' sx={{ width: '38%', height: 11, borderRadius: '4px' }} />
          <Skeleton variant='rounded' sx={{ width: '26%', height: 11, borderRadius: '4px' }} />
          <Skeleton variant='rounded' sx={{ flex: 1, height: 11, borderRadius: '4px' }} />
        </Box>
      ))}
    </Box>
  );
});

// ============================================================================
// THE GATE CARD
// ============================================================================

export interface HeavyUnitGateProps {
  /** The unit's configuration. Read for its LENGTH only, unless the user acts. */
  data: string | undefined;
  /** Unit slug — names the downloaded file. */
  slug: string;
  /** `Unit.ToolchainType`, e.g. `Kubernetes/YAML`. Shown as the Format fact. */
  toolchainType?: string;
  /** Build this unit's field tree now. Must defer the work off the click. */
  onRenderAnyway: () => void;
  /**
   * Show THIS unit — and only this unit — in Source view. Omit to hide the
   * action entirely.
   *
   * Deliberately NOT "switch the pane to Source view": the pane's Tree/Source
   * toggle is pane-wide, so wiring this to it would drag every sibling unit
   * into Monaco to answer a question about one of them. The caller owns a
   * per-unit override; see `ComponentSidePane`'s `sourceOverrideUnitIds`.
   */
  onOpenInSource?: () => void;
}

/**
 * Inline placeholder card shown instead of an oversized unit's field tree.
 *
 * The copy is deliberately calm and un-alarming: nothing has gone wrong, a
 * piece of work was postponed. No "warning", "error", "blocked" or "too large" —
 * "not loaded" describes a state the user can change; "too large" would be a
 * judgement about their config.
 */
export const HeavyUnitGate = memo(function HeavyUnitGate({
  data,
  slug,
  toolchainType,
  onRenderAnyway,
  onOpenInSource,
}: HeavyUnitGateProps) {
  const [copied, setCopied] = useState(false);
  const sizeLabel = formatUnitDataSize(data);

  /**
   * The payload as text. Configuration data arrives as-is now, so this is the
   * identity — kept as a callback because the gate hands it to the copy and
   * download handlers, which only run from an explicit click.
   */
  const decode = useCallback((): string => data ?? '', [data]);

  const handleCopy = useCallback(() => {
    const text = decode();
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [decode]);

  const handleDownload = useCallback(() => {
    const text = decode();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [decode, slug]);

  return (
    <Box
      data-testid='heavy-unit-gate'
      sx={{
        m: '8px 8px 10px',
        border: `1px solid ${componentTheme.borderMuted}`,
        borderRadius: `${componentTheme.radiusMd}px`,
        background: componentTheme.bgSubtle,
        overflow: 'hidden',
        fontFamily: componentTheme.fontSans,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px', p: '14px 14px 0' }}>
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: '7px',
            background: componentTheme.bgDefault,
            border: `1px solid ${componentTheme.borderDefault}`,
            color: componentTheme.fgMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {InfoIcon}
        </Box>
        <Box>
          <Box
            sx={{
              fontSize: 13.5,
              fontWeight: 700,
              letterSpacing: '-0.005em',
              color: componentTheme.fgDefault,
            }}
          >
            Fields not loaded
          </Box>
          <Box sx={{ fontSize: 12, lineHeight: 1.6, color: componentTheme.fgMuted, mt: '4px' }}>
            This unit is{' '}
            <Box component='b' sx={{ color: componentTheme.fgDefault, fontWeight: 700 }}>
              {sizeLabel}
            </Box>
            . Drawing a tree that size takes several seconds, and nothing on the page responds
            while it happens, so we left it out. Everything else here loaded normally.
          </Box>
        </Box>
      </Box>

      {/* Fact strip: SIZE ONLY, plus the format we already know from the unit's
          metadata. The mockup also showed an estimated field count; it was cut
          because the gate bails before decoding and any count would be invented. */}
      <Box
        sx={{
          display: 'flex',
          m: '12px 14px 0',
          border: `1px solid ${componentTheme.borderDefault}`,
          borderRadius: '7px',
          background: componentTheme.bgDefault,
          overflow: 'hidden',
        }}
      >
        {[
          { k: 'Size', v: sizeLabel },
          { k: 'Format', v: toolchainType ?? 'Unknown' },
        ].map((fact, i, arr) => (
          <Box
            key={fact.k}
            sx={{
              flex: 1,
              p: '8px 10px',
              borderRight:
                i === arr.length - 1 ? 0 : `1px solid ${componentTheme.borderMuted}`,
            }}
          >
            <Box
              sx={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: componentTheme.fgSubtle,
              }}
            >
              {fact.k}
            </Box>
            <Box
              sx={{
                fontFamily: componentTheme.fontMono,
                fontSize: 13,
                fontWeight: 600,
                color: componentTheme.fgDefault,
                mt: '2px',
              }}
            >
              {fact.v}
            </Box>
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          p: '12px 14px 14px',
          flexWrap: 'wrap',
        }}
      >
        <Box
          component='button'
          type='button'
          data-testid='heavy-unit-render-anyway'
          onClick={onRenderAnyway}
          sx={buttonPrimary}
        >
          Render anyway
        </Box>
        {/* The escape hatch for "I only wanted to READ it". Measured at ~120ms
            of blocked main thread on the 5.3MB kyverno fixture versus ~900ms
            for the tree — Monaco virtualizes, and above
            `MONACO_SCHEMA_MAX_BYTES` it drops schema validation, the per-line
            decoration pass and the minimap (see CodeEditor.tsx). Secondary,
            never primary: components.md rule 13 keeps the treeview the
            default, so this is a button the user presses, never a redirect. */}
        {onOpenInSource && (
          <Box
            component='button'
            type='button'
            data-testid='heavy-unit-open-source'
            onClick={onOpenInSource}
            sx={buttonBase}
          >
            {SourceIcon}
            Open in Source view
          </Box>
        )}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Box
            component='button'
            type='button'
            data-testid='heavy-unit-copy'
            onClick={handleCopy}
            title='Copy source'
            sx={buttonGhost}
          >
            {CopyIcon}
            {copied ? 'Copied' : 'Copy'}
          </Box>
          <Box
            component='button'
            type='button'
            data-testid='heavy-unit-download'
            onClick={handleDownload}
            title='Download source'
            sx={buttonGhost}
          >
            {DownloadIcon}
            Download
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          fontSize: 11,
          color: componentTheme.fgSubtle,
          p: '8px 14px',
          borderTop: `1px solid ${componentTheme.borderMuted}`,
          background: componentTheme.bgDefault,
          lineHeight: 1.55,
        }}
      >
        Upgrade, Apply and revision history for this unit still work — only the field tree is
        held back.
      </Box>
    </Box>
  );
});

// ============================================================================
// PER-UNIT SOURCE-VIEW BAR (the way back)
// ============================================================================

export interface UnitSourceOverrideBarProps {
  /** Return this unit to the treeview — i.e. back to the placeholder card. */
  onBackToTree: () => void;
}

/**
 * The strip above a single unit's Monaco editor when that ONE unit was opened
 * in Source view from its placeholder card, while the rest of the pane is still
 * in Tree view.
 *
 * It exists to keep "Open in Source view" from being a one-way door, and to
 * explain the discrepancy: without it the pane's Tree/Source toggle would read
 * "Tree" while one unit visibly showed source, which looks like a bug. Naming
 * the scope ("this component only") makes it read as a deliberate override.
 *
 * Vocabulary is the treeview's own — "Tree view" matches the pane toggle's
 * tooltip, not a new term for the same thing.
 */
export const UnitSourceOverrideBar = memo(function UnitSourceOverrideBar({
  onBackToTree,
}: UnitSourceOverrideBarProps) {
  return (
    <Box
      data-testid='unit-source-override-bar'
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        m: '8px 8px 0',
        p: '6px 8px 6px 10px',
        border: `1px solid ${componentTheme.borderMuted}`,
        borderRadius: '7px',
        background: componentTheme.bgSubtle,
        fontFamily: componentTheme.fontSans,
        fontSize: 11.5,
        color: componentTheme.fgMuted,
      }}
    >
      <Box component='span' sx={{ display: 'flex', color: componentTheme.fgSubtle }}>
        {SourceIcon}
      </Box>
      <Box component='span' sx={{ mr: 'auto' }}>
        Source view — this component only
      </Box>
      <Box
        component='button'
        type='button'
        data-testid='unit-source-back-to-tree'
        onClick={onBackToTree}
        sx={buttonGhost}
      >
        {BackIcon}
        Back to tree view
      </Box>
    </Box>
  );
});
