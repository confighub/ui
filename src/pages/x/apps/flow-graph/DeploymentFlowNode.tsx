// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useEffect, useState } from 'react';
import { Handle, type NodeProps, Position, useStore } from 'reactflow';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import { keyframes, styled } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import type { ComponentDeployment } from '../componentTypes';
import { componentTheme } from '../componentTheme';
import { formatRelative } from '@/utility/date-format';
import {
  deriveHealthPresentation,
  deriveSyncPresentation,
  formatLiveRevision,
  LIVE_STATUS_PROVIDER_NAME,
  type LiveStatus,
  type LiveStatusProvider,
  liveStatusLabel,
  type VitalPresentation,
  type VitalTone,
} from '../liveStatus';
import { LiveStatusProviderMark } from './LiveStatusProviderMark';
import { INFO_PEEK_TOOLTIP_SX, InfoPeekCard, type InfoPeekSpec } from '@/components/info-peek/InfoPeek';

// Config-side (desired) chip colors, and the Live/Synced tag color map.
// Previously lived in a shared `nodeStatusModel.ts` alongside the signal
// rail's geometry — folded back in here once the rail was removed (per
// direct product direction: "it's pointless"), since these four one-line
// color lookups no longer need a dedicated module of their own.
const LIVE_TONE_COLOR: Record<VitalTone, string> = {
  ok: componentTheme.success,
  neutral: componentTheme.fgSubtle,
  progress: componentTheme.variation,
  attention: componentTheme.attention,
  danger: componentTheme.danger,
};

/**
 * Every tone a status chip can take — the live-status tones plus the three
 * config-side ones that are not live readings at all.
 */
type ChipTone = VitalTone | 'stale' | 'unreleased' | 'gated';

/**
 * A chip's ink and its two backgrounds, chosen together.
 *
 * ⚠️ KEYED ON THE TONE, NOT ON THE COLOUR, AND THAT IS THE WHOLE POINT.
 *
 * These two backgrounds used to be built by appending hex digits to whatever
 * colour the chip had been handed — `${$color}26`, "~15% tint" by the comment
 * beside it. Two things were wrong with that, and the second is why it is worth
 * changing the prop rather than adding a lookup.
 *
 * The mechanical fault: once a token is a `var(--ct-…)`, appending two hex
 * digits makes the declaration invalid. The browser drops it in silence and the
 * chip falls back to whatever it inherits. Nothing throws. **This pair is what
 * caused the theme indirection to be reverted**, so re-attempting that work
 * without this fix reproduces the failure exactly.
 *
 * The structural fault: a map from COLOUR to tint would have fixed the syntax
 * and kept the real hazard. A colour arriving that nobody put in the map gets
 * no tint and no error — the same silent-drop shape as a guard that skips a
 * record without counting it. Keyed on the tone, `Record<ChipTone, …>` makes
 * the compiler refuse an incomplete map, so the failure moves from runtime and
 * invisible to build time and loud.
 *
 * The alphas are the exact rgba equivalents of the hex suffixes they replace —
 * 0x26 = 38/255 = 0.149, 0x42 = 66/255 = 0.259 — verified against the browser's
 * own colour parser, so no chip may change appearance.
 */
const CHIP_TONE: Record<ChipTone, { color: string; tint: string; tintHover: string }> = {
  ok: { color: componentTheme.success, tint: 'rgba(21,128,61,0.149)', tintHover: 'rgba(21,128,61,0.259)' },
  neutral: { color: componentTheme.fgSubtle, tint: 'rgba(142,154,170,0.149)', tintHover: 'rgba(142,154,170,0.259)' },
  progress: { color: componentTheme.variation, tint: 'rgba(68,103,220,0.149)', tintHover: 'rgba(68,103,220,0.259)' },
  attention: { color: componentTheme.attention, tint: 'rgba(159,66,0,0.149)', tintHover: 'rgba(159,66,0,0.259)' },
  danger: { color: componentTheme.danger, tint: 'rgba(154,0,5,0.149)', tintHover: 'rgba(154,0,5,0.259)' },
  /** Config-side, not a live reading: an upgrade is waiting to be taken. */
  stale: { color: componentTheme.upgrade, tint: 'rgba(153,81,244,0.149)', tintHover: 'rgba(153,81,244,0.259)' },
  /** Config-side: promoted, but not released where it landed. */
  unreleased: { color: componentTheme.variation, tint: 'rgba(68,103,220,0.149)', tintHover: 'rgba(68,103,220,0.259)' },
  /** Config-side: a prerequisite is holding this stage. */
  gated: { color: componentTheme.attention, tint: 'rgba(159,66,0,0.149)', tintHover: 'rgba(159,66,0,0.259)' },
};

// ============================================================================
// TYPES
// ============================================================================

export interface NodeUnitSummary {
  slug: string;
  /** Left column: pending (not yet applied), gated, or neither */
  applyStatus: 'pending' | 'gated' | null;
  /** Right column: has upstream upgrade available */
  upgrading: boolean;
}

export interface DeploymentFlowNodeData {
  deployment: ComponentDeployment;
  /** True for the deployment the side pane is open on AND every deployment in its comparison — they all get the same selected look, told apart only by `compareLetter`. */
  isSelected: boolean;
  isUpgradeActive: boolean;
  onSelect: (deploymentId: string) => void;
  onUpgradeToggle: (parentDeploymentId: string, childDeploymentId: string) => void;
  /** Whether this deployment has an error state */
  hasError?: boolean;
  /** Individual unit summaries for footer counts */
  units: NodeUnitSummary[];
  /** Whether this deployment is currently being upgraded */
  isUpgrading?: boolean;
  /** Flash success message (shown briefly after action completes) */
  successMessage?: string;
  /** Latest release for this node — release-enabled deployments only (deployment.releaseTargetId set). */
  latestRelease?: { num: number; createdAt?: string };
  /** True while this node's Space has a publish in flight (drives the node-card ripple). */
  isReleasing?: boolean;
  /**
   * The slot letter this deployment holds in the side pane's comparison — `A`
   * for the deployment the pane is open on, then `B`, `C`… Absent when the node
   * is not being compared, which is every node until the user asks for one.
   *
   * The same badge the selector row draws, so a column in the pane and a node
   * on the canvas are recognisably the same thing.
   */
  compareLetter?: string;
  /**
   * Open this deployment's side pane focused on a specific tab — used by the
   * status-chip peeks to deep-link (Stale → Configuration/upgradable,
   * Unreleased changes / Gated → Releases). Non-toggling: always opens.
   * `releaseNum`, when given (currently only the release-stamp peek), asks
   * the Releases tab to scroll to and highlight that specific release rather
   * than just land on the tab and leave the user to hunt for it.
   */
  onOpenTab?: (deploymentId: string, tab: 'config' | 'releases', releaseNum?: number) => void;
  /**
   * Opens the inline variant composer anchored to this node as parent —
   * fired by the node's own "+" affordance or the 'V' key while hovering
   * this node (see ComponentFlowGraph.tsx). Deliberately NOT routed through
   * onSelect/onDeploymentToggle: that path inherits setCenter/fitView calls
   * that would pan the canvas, which the composer's whole design argument
   * depends on never happening.
   */
  onComposerOpen?: (deploymentId: string) => void;
}

/** Which side-pane tab a status chip's peek deep-links to. */
export type ChipTab = 'config' | 'releases';

// ============================================================================
// STATUS MODEL
// ============================================================================
//
//   • Config / ConfigHub (DESIRED)  → the signals row: Stale, Unreleased
//     changes, Gated. Fixed order, Gated pinned to the right edge. STATUS BY
//     EXCEPTION: renders nothing when none are active.
//   • Live-infra / cluster (ACTUAL) → two always-visible status tags (see
//     `LiveStateChip`): "Live" for health ("are the workloads up") and
//     "Synced" for sync ("does the cluster match what was released"), kept
//     as INDEPENDENT axes per the CTO's ask to see both facts, not one
//     collapsed word — see the defect noted on `deriveLiveStatusPresentation`
//     in liveStatus.ts. This is the one deliberate exception to status-by-
//     exception: per direct product direction, each tag renders — clearly,
//     not faintly — even when its axis is reporting-and-fine, because a
//     near-invisible healthy mark wasn't good enough to actually see. It
//     renders nothing only when that axis isn't reported at all.
//
// There is deliberately no single "most-urgent color" rail collapsing both
// dimensions into one left-edge stripe — an earlier version had one; direct
// product direction removed it as redundant once the Live/Synced tags and
// the config signals row both read clearly on their own.

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

/** A single calm expanding ring — not a neon glow. Loops while publishing is in flight (real latency is unknown, unlike the mockup's fixed 1.25s demo delay), then unmounts the instant isReleasing flips false. */
const nodeRipple = keyframes`
  0%   { opacity: 0.9; transform: scale(1); }
  70%  { opacity: 0.18; transform: scale(1.045); }
  100% { opacity: 0; transform: scale(1.06); }
`;

const NodeContainer = styled(Box, {
  shouldForwardProp: (p) => p !== '$selected' && p !== '$publishing' && p !== '$isBase',
})<{ $selected: boolean; $publishing?: boolean; $isBase?: boolean }>(({ theme, $selected, $publishing, $isBase }) => ({
  display: 'flex',
  flexDirection: 'column',
  // $selected (app-level: this node is the pane's open deployment, or one of
  // its compare slots — every slot reads identically, distinguished only by
  // its letter badge) gets the solid colored border. $isBase
  // (no target — a config-only node) gets the SAME fill as every other card
  // (no tint) and is distinguished purely by a dashed borderEmphasis outline
  // — "not yet a concrete thing," and it reuses the dashed-vs-solid
  // desired/actual convention already used one lane down in the chips.
  // borderEmphasis clears WCAG SC 1.4.11's 3:1 component-boundary bar with
  // margin (5.96:1 against the graph canvas's bgSubtle) — see
  // componentTheme.ts for the full computation and the fill-tint approach
  // that was tried and dropped in favor of this.
  background: componentTheme.bgDefault,
  border:
    $publishing || $selected
      ? `2px solid ${theme.palette.primary.main}`
      : $isBase
        ? `1.5px dashed ${componentTheme.borderEmphasis}`
        : `2px solid ${componentTheme.borderSubtle}`,
  borderRadius: componentTheme.radiusLg,
  // Border-box: a 2px border on a 240px card renders 244 otherwise, which
  // `flowLayout`'s 260px slot currently absorbs and would not have to.
  boxSizing: 'border-box',
  width: 240,
  // A calm minimum so a quiet (healthy, all-clear) card keeps presence and all
  // cards read as a tidy row; busier cards grow past this. The graph reserves a
  // fixed NODE_HEIGHT slot regardless, so growth here never shifts the layout.
  minHeight: 84,
  overflow: 'hidden',
  cursor: 'pointer',
  fontFamily: componentTheme.fontSans,
  transition: 'border-color 0.2s, box-shadow 0.2s, background-color 0.2s',
  pointerEvents: 'all',
  boxShadow: componentTheme.shadowSm,
  position: 'relative',
  '&:hover': {
    borderColor: $selected ? theme.palette.primary.main : $isBase ? componentTheme.borderEmphasis : componentTheme.borderMuted,
    // A Base's dashed outline solidifies on hover — a small cue that you're
    // about to act on it, mirroring the mockup's validated interaction.
    ...($isBase && !$selected && !$publishing && { borderStyle: 'solid' }),
  },
  ...($publishing && {
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: -2,
      borderRadius: 'inherit',
      border: `2px solid ${componentTheme.accent}`,
      pointerEvents: 'none',
      animation: `${nodeRipple} 1.15s cubic-bezier(0.16, 1, 0.3, 1) infinite`,
    },
  }),
}));

/**
 * `$quiet` centers the header (name + release stamp) dead-center in the
 * card when there's no body content at all — `margin: auto 0` inside
 * NodeContainer's flex column redistributes the card's full height around
 * it, which only works because NodeBody isn't rendered in that case (see
 * the `hasBodyContent` guard at the call site) — a present-but-empty
 * NodeBody would still claim its own padding and prevent true centering.
 * The moment any content appears, the header settles back to the top;
 * `transition: margin` makes that settling the notification, not a jump cut.
 */
const NodeHeader = styled(Box, {
  shouldForwardProp: (p) => p !== '$selected' && p !== '$quiet',
})<{ $selected: boolean; $quiet?: boolean }>(({ $quiet }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  margin: $quiet ? 'auto 0' : '0',
  transition: 'margin 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
}));

const NodeNameWrap = styled(Box)({
  flex: 1,
  overflow: 'hidden',
  minWidth: 0,
});

const NodeName = styled('span')({
  fontSize: 13,
  fontWeight: 600,
  color: componentTheme.fgDefault,
  fontFamily: componentTheme.fontSans,
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'block',
  width: 'fit-content',
  maxWidth: '100%',
});

const FloatingLabels = styled(Box)({
  position: 'absolute',
  top: -16,
  right: 0,
  display: 'flex',
  alignItems: 'center',
  fontSize: 9,
  fontWeight: 500,
  fontFamily: componentTheme.fontMono,
  color: componentTheme.fgSubtle,
  gap: 6,
  whiteSpace: 'nowrap',
});

const TargetLink = styled(Link)(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  color: componentTheme.fgSubtle,
  fontSize: 9,
  fontFamily: componentTheme.fontMono,
  fontWeight: 500,
  textDecoration: 'none',
  cursor: 'pointer',
  pointerEvents: 'all',
  '&:hover': {
    color: theme.palette.primary.main,
    textDecoration: 'underline',
  },
  '& svg': {
    width: 10,
    height: 10,
  },
}));

const TypeBadge = styled(Box, {
  shouldForwardProp: (p) => p !== '$kind',
})<{ $kind: 'Base' | 'Deployment' }>(({ $kind }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 9,
  fontWeight: 600,
  fontFamily: componentTheme.fontMono,
  letterSpacing: 0.3,
  textTransform: 'uppercase',
  borderRadius: componentTheme.radiusMd,
  padding: '1px 6px',
  border: `1px solid ${componentTheme.borderSubtle}`,
  color: $kind === 'Base' ? componentTheme.fgDefault : componentTheme.fgSubtle,
  background: $kind === 'Base' ? componentTheme.bgSubtle : 'transparent',
}));

/**
 * The "graph-forward" signature move — a release-state chip right in the node
 * header, scaled off the app's own small-pill idiom (MuiChip sizeSmall: height
 * 18, fontSize 10.5 — the same size the footer's staged-count Chip already
 * uses). Identity, not status: hoverable (peek) and clickable (deep-link to
 * that release), but its own visual weight — tint, border, presence — is
 * untouched by that interactivity. It never gains a rail contribution, never
 * counts toward the exception count, and its $fresh treatment is unchanged.
 */
const ReleaseChip = styled(Box, {
  shouldForwardProp: (p) => p !== '$fresh',
})<{ $fresh?: boolean }>(({ $fresh }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontFamily: componentTheme.fontMono,
  fontSize: 10.5,
  fontWeight: 600,
  color: $fresh ? componentTheme.accentEmphasis : componentTheme.fgSubtle,
  background: $fresh ? componentTheme.accentMuted : componentTheme.bgSubtle,
  border: `1px solid ${$fresh ? 'rgba(186,61,3,0.18)' : componentTheme.borderSubtle}`,
  borderRadius: 999,
  padding: '2px 8px 2px 6px',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'color 0.2s, background-color 0.2s, border-color 0.2s',
}));

const ReleaseChipDot = styled(Box, {
  shouldForwardProp: (p) => p !== '$fresh',
})<{ $fresh?: boolean }>(({ $fresh }) => ({
  width: 5,
  height: 5,
  borderRadius: '50%',
  background: $fresh ? componentTheme.accent : componentTheme.fgSubtle,
  flexShrink: 0,
}));

const NodeBody = styled(Box)({
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  flex: 1,
});

/**
 * Desired-side (config) row: Stale / Unreleased changes / Gated, fixed order.
 * Wraps to a new line when it runs out of width. Gated is right-anchored
 * (`$autoRight` → margin-left: auto on that one chip), which left-anchors
 * Stale for free and holds Gated's x-position invariant no matter which other
 * signals are lit — measured 0.0px drift vs 145.9px unanchored. Because
 * `flowLayout.ts` gives every node in a stage the same x, that fixed position
 * is genuinely scannable down a column. Costs nothing: the card stays 240px.
 */
const ChipRow = styled(Box)({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
});

/**
 * Desired vs. actual is now told apart by POSITION (this row vs. the always-on
 * Live/Synced tags, below) rather than by border style, so the chip itself
 * carries no border at all — just a tinted fill behind the word. Measured
 * calmest at 100% zoom and still the most findable signal at 45%; dropping
 * the outline lost almost nothing. See RECOMMENDATION.md.
 */
const StatusChip = styled(Box, {
  shouldForwardProp: (p) => p !== '$color' && p !== '$autoRight' && p !== '$tint' && p !== '$tintHover',
})<{ $color: string; $tint: string; $tintHover: string; $autoRight?: boolean }>(({
  $color,
  $tint,
  $tintHover,
  $autoRight,
}) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  maxWidth: '100%',
  minWidth: 0,
  fontSize: 10.5,
  fontWeight: 600,
  fontFamily: componentTheme.fontMono,
  whiteSpace: 'nowrap',
  color: $color,
  // The tint alone is the findable mark now there is no border. Pre-composited
  // by tone (see CHIP_TONE) rather than built by appending hex to `$color`.
  background: $tint,
  border: 0,
  borderRadius: 3,
  padding: '2px 7px',
  cursor: 'pointer',
  marginLeft: $autoRight ? 'auto' : undefined,
  transition: 'background-color 0.15s',
  '&:hover': {
    background: $tintHover,
  },
  '& svg': { width: 11, height: 11, flexShrink: 0 },
}));

/**
 * LIVE STATE — "is it synced" and "is it healthy", ALWAYS visible, including
 * when fine. Direct product direction reversed the earlier near-invisible
 * "vitals" tick treatment (1px marks at 0.4 opacity when healthy) — it was
 * too subtle to actually register, and both facts are important enough to
 * read as real text, every time, not just on exception. Renders nothing only
 * when that axis has no reporter at all (`LiveStateChip`'s `null` guard) —
 * "not reporting" still means "nothing to show," but "reporting, and fine"
 * is no longer treated the same way "not reporting" is.
 *
 * Placed as its own row right under the header — before any config
 * exceptions — because unlike Stale/Unreleased/Gated (which only matter when
 * something's wrong), Live/Synced are meant to be the first thing read on
 * every card, healthy or not.
 */
const LiveStateRow = styled(Box)({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
});

/** Small solid dot leading a Live/Synced tag — same idiom the old live-status
 *  chip used before the vitals rework, brought back now that these are full
 *  chips again rather than borderless ticks. */
const LiveDot = styled(Box, {
  shouldForwardProp: (p) => p !== '$color',
})<{ $color: string }>(({ $color }) => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: $color,
  flexShrink: 0,
}));

/**
 * `PeekSpec` = the shared `InfoPeekSpec` (eyebrow/metric/lines/action) plus
 * which side-pane tab the chip and the card's own action open — the one
 * piece that's specific to this node's chips, not the shared card shape.
 * See docs/dev/ui-design-system.md → Informational Popouts (Peek Cards).
 */
interface PeekSpec extends InfoPeekSpec {
  /** Which tab the action + chip click open. */
  tab: ChipTab;
}

/**
 * A status chip with its metric-hero peek. Hover opens the light card; clicking
 * the chip (or the card's action) opens the deployment's side pane on the chip's
 * tab. This renders desired-side (config) exceptions only — actual-side live
 * status is now the always-on `VitalTick` marks, not a chip.
 */
const StatusChipWithPeek = ({
  tone,
  autoRight,
  textColor,
  leading,
  label,
  meta,
  spec,
  onGo,
}: {
  /** The tone, not a colour — see `CHIP_TONE` for why the difference matters. */
  tone: ChipTone;
  /** Pins this chip to the right edge of its row (used for Gated only). */
  autoRight?: boolean;
  /** Overrides the label's text color — the one earned exception to neutral
   *  chip text, used for an actually-failing live-cluster state. */
  textColor?: string;
  leading: React.ReactNode;
  label: string;
  meta?: string;
  spec: PeekSpec;
  onGo?: (tab: ChipTab) => void;
}) => {
  const { color, tint, tintHover } = CHIP_TONE[tone];
  const handleGo = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onGo?.(spec.tab);
  };
  return (
    <Tooltip
      placement="bottom-start"
      enterDelay={120}
      leaveDelay={0}
      // Hide aggressively: not interactive (no grace period keeping it open as
      // the cursor drifts toward it) and an instant fade-out, so the peek is gone
      // the moment the pointer leaves the chip.
      disableInteractive
      slotProps={{ tooltip: { sx: INFO_PEEK_TOOLTIP_SX }, transition: { timeout: { enter: 120, exit: 0 } } }}
      title={<InfoPeekCard color={color} spec={spec} />}
    >
      <StatusChip
        $color={color}
        $tint={tint}
        $tintHover={tintHover}
        $autoRight={autoRight}
        className="nodrag nopan"
        onClick={handleGo}
        onMouseDown={(e) => e.stopPropagation()}
        sx={textColor ? { color: textColor } : undefined}
      >
        {leading}
        <Box component="span">{label}</Box>
        {meta && <ChipMeta>· {meta}</ChipMeta>}
      </StatusChip>
    </Tooltip>
  );
};

/** Faint trailing detail inside a chip (e.g. "· 3 behind · 2d", "· 30s"). */
const ChipMeta = styled('span')({
  color: componentTheme.fgSubtle,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

/** Transient in-flight line (upgrading…) — an action, not a state. */
const TransientRow = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 10,
});

const TransientStat = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  fontFamily: componentTheme.fontMono,
});

const ErrorBadge = styled(Box)({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  fontFamily: componentTheme.fontSans,
  color: componentTheme.danger,
  background: componentTheme.dangerMuted,
  borderRadius: componentTheme.radiusMd,
  padding: '1px 7px',
  border: `1px solid ${componentTheme.danger}`,
});

const tickFadeInOut = keyframes`
  0% { opacity: 0; transform: scale(0.8); }
  15% { opacity: 1; transform: scale(1); }
  85% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.8); }
`;

const SuccessTick = styled(Box)({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  fontFamily: componentTheme.fontMono,
  color: componentTheme.success,
  animation: `${tickFadeInOut} 3s ease-in-out forwards`,
  '& svg': { width: 11, height: 11 },
});

// The visible dot stays small (10px), but the actual clickable/draggable hit
// area is enlarged well beyond it via a transparent padded box. Without this,
// a mousedown that narrowly misses the small dot falls through to the pane's
// own pan-drag gesture instead of starting a connection, which pans the
// whole viewport mid-drag — an intermittent "ghosting" bug reported live.
//
// The same stylesheet-order trap is documented on StyledSourceHandle below,
// which solved it with `!important` on every property instead.
const StyledHandle = styled(Handle)({
  width: 24,
  height: 24,
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&::after': {
    content: '""',
    display: 'block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: componentTheme.bgDefault,
    border: `2px solid ${componentTheme.borderDefault}`,
    transition: 'border-color 0.2s',
  },
  '&:hover::after': {
    borderColor: componentTheme.accent,
  },
});

// The source (right) handle doubles as the composer-open affordance —
// zero permanent ink on a healthy card, per the validated mockup
// (design-mockups/variant-creation/option-a-inline-canvas/index.html:
// .handle.source-side). At rest it's an ordinary connection dot; on
// hover it grows, fills with the accent color, and shows a plus glyph.
// Dragging from here is the real gesture (wired in ComponentFlowGraph
// via onConnectStart/onConnectEnd); the 'V' key is the
// keyboard-accessible equivalent for whichever node is hovered. There
// is deliberately no separate click affordance/button — the mockup's
// only entry points besides drag are the handle and 'V'.
const StyledSourceHandle = styled(Handle, {
  shouldForwardProp: (p) => p !== '$hovered',
})<{ $hovered: boolean }>(({ $hovered }) => ({
  // !important everywhere here: reactflow's own stylesheet
  // (reactflow/dist/style.css, imported in ComponentFlowGraph.tsx) defines
  // `.react-flow__handle` with the SAME specificity as this emotion class
  // (both are single class selectors) -- which one wins is purely down to
  // which <style> tag lands later in <head>, and that order isn't something
  // we control (confirmed live: without !important this entire block was
  // silently losing to reactflow's defaults -- width stayed a real 6px, not
  // the 32px this claimed, background stayed reactflow's navy fill, and the
  // hover outline never appeared at all. The 6px real hit box was invisible
  // in normal use because SourceKnob, its child, is bigger and a flex
  // container doesn't clip an overflowing child by default -- so it LOOKED
  // right while the actual hit-testable/outlined area was reactflow's tiny
  // default, hugging the icon instead of the intended circle).
  width: '32px !important',
  height: '32px !important',
  // reactflow's own `.react-flow__handle-right` sets `right: -4px` -- tuned
  // to center ITS default 8px (6px + 1px border each side) box on the
  // node's right edge. That offset doesn't scale with width, so once ours
  // grew to 32px the box stayed anchored 4px past the edge and grew
  // leftward INTO the card instead of straddling the edge symmetrically
  // (half of the box's own width needs to sit outside the edge: -16px for
  // a 32px box, matching the same -width/2 ratio the default uses).
  right: '-16px !important',
  background: 'transparent !important',
  // The real hit target would otherwise be invisible (SourceKnob, the
  // visible dot, is only 10-18px and centered well inside it) -- with a
  // target this much bigger than what's drawn, it was hard to tell whether
  // the cursor was actually over the interactive zone or just near it. This
  // outline traces the ACTUAL hit-testable boundary, only while hovered, so
  // hovering gives an honest answer to "am I on it".
  border: 'none !important',
  outline: $hovered ? '2px solid #000' : 'none',
  outlineOffset: '-2px',
  borderRadius: '50% !important',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'crosshair',
}));

const SourceKnob = styled(Box, {
  shouldForwardProp: (p) => p !== '$hovered',
})<{ $hovered: boolean }>(({ $hovered }) => ({
  width: $hovered ? 18 : 10,
  height: $hovered ? 18 : 10,
  aspectRatio: '1',
  flexShrink: 0,
  flexGrow: 0,
  boxSizing: 'border-box',
  borderRadius: '50%',
  background: $hovered ? componentTheme.accent : componentTheme.bgDefault,
  border: `2px solid ${$hovered ? componentTheme.accent : componentTheme.borderDefault}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Decorative only — StyledSourceHandle (the 24x24 box around this) is
  // the real hit target, same reasoning as the padded-hit-area comment
  // above: a mousedown that narrowly misses this small dot must still
  // reach the Handle underneath, not fall through to the pane's own
  // pan-drag gesture.
  pointerEvents: 'none',
  transition: 'width 0.15s ease, height 0.15s ease, border-color 0.15s, background-color 0.15s',
  '& svg': {
    opacity: $hovered ? 1 : 0,
    color: '#fff',
    transition: 'opacity 0.12s',
  },
}));

// ============================================================================
// ICONS
// ============================================================================

const PendingIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4.5l4 3.5-4 3.5" />
    <path d="M9 4.5l4 3.5-4 3.5" />
  </svg>
);

const GatedIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="7" width="8" height="6" rx="1" />
    <path d="M6 7V5a2 2 0 014 0v2" />
  </svg>
);

const UpgradingIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M8 12V4M4 8l4-4 4 4" />
  </svg>
);

const TickIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.5l3.5 3.5 6.5-8" />
  </svg>
);

// ============================================================================
// LIVE STATE CHIP
// ============================================================================

/** Build the peek card content for one live-status axis. `eyebrowAxis` is the
 *  word shown before the state in the peek's eyebrow — normally the same as
 *  the real `axis` ("sync · OutOfSync" for ArgoCD, "sync · Stalled" for
 *  Flux), but the Flux MERGED chip (see `deriveFluxVital` below) passes
 *  `'status'` instead, since a single collapsed chip calling itself "sync" or
 *  "health" would misstate what it represents. */
const buildLiveStatePeek = (
  eyebrowAxis: string,
  status: LiveStatus | undefined,
  presentation: VitalPresentation,
  label: string,
): PeekSpec => {
  const lines: string[] = [presentation.desc];
  // `formatLiveRevision` returns '' for a revision that is nothing but
  // whitespace, which would render a bare "revision:" label with no value —
  // the very thing this line exists to avoid.
  const revision = status?.revision ? formatLiveRevision(status.revision) : '';
  if (revision) lines.push(`revision: ${revision}`);
  if (status?.message) lines.push(status.message);
  if (status?.observedAt) lines.push(`observed ${formatRelative(status.observedAt)}`);
  if (status?.source) lines.push(`via ${status.source}`);
  return { tab: 'config', eyebrow: `${eyebrowAxis} · ${label}`, lines, action: 'Open to inspect' };
};

/**
 * One always-visible live-status tag (sync or health). Renders NOTHING when
 * the axis isn't reported at all — there's genuinely nothing to show — but
 * ALWAYS renders otherwise, including when fine.
 *
 * The word it carries is the reporting system's own (Synced/Healthy for
 * ArgoCD, Ready/Reconciling for Flux) so the card agrees with the console the
 * user opens next; only when no system is identified does it fall back to the
 * generic "Live"/"Synced" house wording. See `liveStatusLabel` in
 * liveStatus.ts — the TONE (which states read as good/bad) is unaffected by
 * the provider, deliberately.
 */
const LiveStateChip = ({
  axis,
  eyebrowAxis,
  status,
  presentation,
  provider,
  deploymentId,
  onOpenTab,
}: {
  /** Which internal axis this reading came from — selects the correct Flux
   *  vocabulary map (FLUX_SYNC_LABEL vs FLUX_HEALTH_LABEL) in `liveStatusLabel`. */
  axis: 'sync' | 'health';
  /** Word shown in the peek eyebrow; defaults to `axis`. See `buildLiveStatePeek`. */
  eyebrowAxis?: string;
  status: LiveStatus | undefined;
  presentation: VitalPresentation | null;
  provider: LiveStatusProvider;
  deploymentId: string;
  onOpenTab?: (deploymentId: string, tab: ChipTab) => void;
}) => {
  if (!presentation) return null;
  const label = liveStatusLabel(provider, axis, presentation);
  const spec = buildLiveStatePeek(eyebrowAxis ?? axis, status, presentation, label);
  const color = LIVE_TONE_COLOR[presentation.tone];
  return (
    <StatusChipWithPeek
      tone={presentation.tone}
      leading={<LiveDot $color={color} />}
      label={label}
      spec={spec}
      onGo={onOpenTab ? (tab) => onOpenTab(deploymentId, tab) : undefined}
    />
  );
};

// ── Flux: one condition, one chip ──
//
// Flux collapses "is it synced" and "is it healthy" into a single `Ready`
// condition (see FLUX_SYNC_LABEL / FLUX_HEALTH_LABEL in liveStatus.ts) — ArgoCD
// is the only system that genuinely reports two independent facts. Rendering
// `syncVital` and `healthVital` as two separate chips for a Flux node produced
// two adjacent tags that either read the same word twice ("● Ready ● Ready")
// or, worse, disagreed in COLOR for what is definitionally one fact ("●
// Stalled" amber next to "● Stalled" red) — reading as a rendering bug rather
// than two real signals. `deriveFluxVital` picks the single more-severe axis
// to represent as the one chip Flux itself would show.

const TONE_SEVERITY: Record<VitalTone, number> = {
  ok: 0,
  neutral: 1,
  progress: 2,
  attention: 3,
  danger: 4,
};

/**
 * Collapse a Flux node's independently-derived sync/health vitals to the ONE
 * fact Flux itself reports. Picks whichever axis is more severe (danger >
 * attention > progress > neutral > ok); ties prefer health, since Flux's
 * `Ready` condition is fundamentally a health/reconciliation signal. Returns
 * `null` when neither axis is reported at all — callers should already be on
 * the `showUnreported` path in that case, not this one.
 */
const deriveFluxVital = (
  healthVital: VitalPresentation | null,
  syncVital: VitalPresentation | null,
): { axis: 'health' | 'sync'; presentation: VitalPresentation } | null => {
  if (!healthVital && !syncVital) return null;
  if (!syncVital) return { axis: 'health', presentation: healthVital! };
  if (!healthVital) return { axis: 'sync', presentation: syncVital! };
  return TONE_SEVERITY[syncVital.tone] > TONE_SEVERITY[healthVital.tone]
    ? { axis: 'sync', presentation: syncVital }
    : { axis: 'health', presentation: healthVital };
};

/**
 * The comparison slot badge, on the node's top-left corner.
 *
 * A SIBLING OF THE CARD, NOT A CHILD. `NodeContainer` clips to its own rounded
 * corners with `overflow: hidden` — which it needs, so the header fill and the
 * status rail stop at the border radius — and a badge hung inside it loses the
 * third of itself that overhangs. It sits on the unclipped wrapper instead, the
 * same place the floating target labels already sit for the same reason.
 *
 * Same 16px square, same mono 9.5/700 as the selector row's badge: a node and
 * its column must be recognisable as one thing, and the letter is the only
 * thing that says WHICH column a node became. No column is a reference any
 * more, so every letter — including A — wears the same neutral fill.
 */
const CompareLetter = styled('span')(() => ({
  position: 'absolute',
  top: -8,
  left: -8,
  zIndex: 4,
  width: 16,
  height: 16,
  borderRadius: 4,
  display: 'grid',
  placeItems: 'center',
  fontFamily: componentTheme.fontMono,
  fontSize: 9.5,
  fontWeight: 700,
  color: componentTheme.fgOnEmphasis,
  background: componentTheme.fgDefault,
  boxShadow: componentTheme.shadowSm,
}));

// ============================================================================
// COMPONENT
// ============================================================================

export const DeploymentFlowNode = memo(({ data }: NodeProps<DeploymentFlowNodeData>) => {
  const {
    deployment,
    isSelected,
    hasError,
    units,
    isUpgrading,
    successMessage,
    latestRelease,
    isReleasing,
    compareLetter,
    onOpenTab,
  } = data;

  const openTab = onOpenTab
    ? (tab: ChipTab) => onOpenTab(deployment.deploymentId, tab)
    : undefined;

  // Hover state for the source handle's composer-open affordance (see
  // StyledSourceHandle/SourceKnob above) — plain useState rather than CSS
  // :hover, since the knob is a real child that needs its own grown
  // size/fill/icon-opacity computed in JS, not just toggled via a class.
  //
  // Two independent triggers, matching the mockup
  // (option-a-inline-canvas/index.html: `.node-wrap:hover .handle.source-side
  // .knob` OR `.handle.source-side:hover .knob`) — hovering the CARD reveals
  // the knob (so the affordance is discoverable without first finding the
  // small handle sitting just outside the card's edge), and hovering the
  // HANDLE itself does too, redundantly. Two separate booleans OR'd together
  // rather than one shared boolean toggled from both places, so a mouse
  // moving from card to handle (an overlapping-but-distinct region) can
  // never race a false-clear against a still-true hover.
  // The root of a component's variant tree is the node with no parent — the
  // same test `data-variant` uses below. `deployment.type` is NOT a reliable
  // stand-in: it is 'Deployment' for a base Space that has no target, so a
  // badge keyed on it silently vanished from exactly the target-less base the
  // guided tour builds, and could label a child node BASE.
  const isBaseNode = !deployment.parentDeploymentId;

  const [isCardHovered, setIsCardHovered] = useState(false);
  const [isSourceHandleHovered, setIsSourceHandleHovered] = useState(false);
  // A THIRD trigger, not hover-based: once a drag actually starts, the
  // pointer immediately leaves the handle's small hit area, clearing
  // isSourceHandleHovered's onMouseLeave — without this the knob would
  // revert to its quiet resting state the instant the drag begins, even
  // though a connection is actively being dragged FROM this exact handle.
  // React Flow tracks the in-progress connection's source in its own store
  // (connectionNodeId/connectionHandleType) independent of any DOM
  // hover/leave events, so read it directly rather than trying to keep a
  // local boolean in sync with a gesture this component doesn't own.
  const isDraggingFromThisHandle = useStore(
    (s) => s.connectionNodeId === deployment.deploymentId && s.connectionHandleType === 'source',
  );
  const showComposerKnob = isCardHovered || isSourceHandleHovered || isDraggingFromThisHandle;

  // The release stamp deep-links to the SPECIFIC release, not just the
  // Releases tab — the third argument threads through handleOpenTab's
  // tabFocus state to ReleasesPane, which selects that release's bar and
  // has ReleaseLane scroll it into view and pulse it. See
  // AppComponentView.tsx / ComponentSidePane.tsx / ReleasesPane.tsx.
  const handleReleaseGo = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (latestRelease) onOpenTab?.(deployment.deploymentId, 'releases', latestRelease.num);
  };

  // Track success message with a local key to re-trigger animation on each new message
  const [localSuccess, setLocalSuccess] = useState<{ msg: string; key: number } | null>(null);
  useEffect(() => {
    if (successMessage) {
      setLocalSuccess({ msg: successMessage, key: Date.now() });
    } else {
      setLocalSuccess(null);
    }
  }, [successMessage]);

  let pendingCount = 0;
  let gatedCount = 0;
  let upgradingCount = 0;
  for (const u of units) {
    if (u.applyStatus === 'pending') pendingCount++;
    if (u.applyStatus === 'gated') gatedCount++;
    if (u.upgrading) upgradingCount++;
  }

  const hasUnits = units.length > 0;
  const isTransient = isUpgrading;
  // Config-side (desired) signals only make sense for a node that has units.
  // They are ADDITIVE to an in-flight action or the post-action success
  // flash, never superseded by them: a release does not make a node
  // un-Stale, hiding config signals during isTransient would be the card
  // quietly contradicting what it was showing a moment before.
  const showConfig = hasUnits;
  const isStale = showConfig && upgradingCount > 0;
  const isUnreleased = showConfig && pendingCount > 0;
  const isGated = showConfig && gatedCount > 0;
  // Exception to the additive rule above: Stale is specifically what an
  // in-flight upgrade resolves, so showing "upgrading…" and "Stale" at once
  // reads as the card unsure whether it's stale. Suppress just the Stale
  // chip while the upgrade transient is showing; it reappears if any units
  // are still unupgraded once the settle window clears isTransient.
  const showStaleChip = isStale && !isTransient;

  // Vitals — "is it synced" and "is it healthy" as two independent, always-on
  // facts (per the CTO's ask), read straight from the raw annotation rather
  // than through the rail's single collapsed severity (which folds
  // OutOfSync into Progressing — see the defect note on
  // deriveLiveStatusPresentation in liveStatus.ts). Each is null — and
  // renders nothing — when that axis isn't reported at all.
  const syncVital = deriveSyncPresentation(deployment.liveStatus);
  const healthVital = deriveHealthPresentation(deployment.liveStatus);

  // Which delivery system this reading came from — drives the leading brand
  // mark and the vocabulary the chips speak.
  const liveProvider = deployment.liveStatusProvider;
  // A node that actually deploys somewhere (has a Target) but carries no
  // live-status reading says so explicitly, REGARDLESS of whether the
  // delivery system was identifiable. Gating this on `liveProvider !==
  // 'unknown'` was a bug: with no live status yet, the provider can only
  // resolve to a NAMED system via the legacy ArgoCD*/Flux* `ProviderType`
  // values — bridges being sunset (see liveStatus.ts). The modern replacement
  // path (`cub cluster up`) creates Targets with the generic `ProviderType:
  // "OCI"`, which resolves to `'unknown'` — so the old gate silently hid the
  // very "not reported yet" state it exists to show for the go-forward case.
  // A Base (no Target) is correctly excluded: nothing is deployed from it, so
  // there is nothing that could have reported.
  const hasTargets = deployment.targets.length > 0;
  const showUnreported = hasTargets && !healthVital && !syncVital;
  const unreportedSpec: PeekSpec = {
    tab: 'config',
    eyebrow: 'live status · not reported',
    lines: [
      liveProvider === 'unknown'
        ? 'No live status has been reported for this deployment yet'
        : `${LIVE_STATUS_PROVIDER_NAME[liveProvider]} has not reported on this deployment yet`,
    ],
    action: 'Open to inspect',
  };

  // Flux reports one condition, not two — see `deriveFluxVital`'s docstring.
  // `null` whenever the provider isn't Flux (the two-chip path below applies)
  // or Flux has no reading at all yet (the `showUnreported` path applies).
  const fluxVital = liveProvider === 'flux' ? deriveFluxVital(healthVital, syncVital) : null;

  // Staleness detail for the "Stale" chip. The face shows only the magnitude
  // ("N behind") — a relative time is noise at a glance and precise only when
  // already investigating, at which point the peek is one hover away. The
  // peek leads with the time as a hero metric (a lower bound on how long it
  // has been stale — the newest upstream change it is behind on), so the time
  // is relocated, not lost.
  const staleBehind = deployment.staleRevisionsBehind;
  const staleChangedAt = deployment.staleUpstreamChangedAt;
  const staleMeta = staleBehind ? `${staleBehind} behind` : '';
  const staleSpec: PeekSpec = {
    tab: 'config',
    eyebrow: 'Stale · behind upstream',
    metric: staleChangedAt
      ? // formatRelative appends " ago"; strip it so the hero reads
        // "10 days stale", not "10 days ago stale".
        { value: formatRelative(staleChangedAt).replace(/\s*ago$/i, ''), unit: 'stale' }
      : staleBehind
        ? { value: String(staleBehind), unit: staleBehind === 1 ? 'revision behind' : 'revisions behind' }
        : undefined,
    lines:
      staleBehind && staleChangedAt ? [`${staleBehind} revision${staleBehind !== 1 ? 's' : ''} behind upstream`] : [],
    action: 'Review & upgrade',
  };
  const unreleasedSpec: PeekSpec = {
    tab: 'releases',
    eyebrow: 'Unreleased changes',
    lines: ['Local edits not yet released'],
    action: 'Review & release',
  };
  const gatedSpec: PeekSpec = {
    tab: 'releases',
    eyebrow: 'Gated',
    lines: ['Release blocked by a release-gate'],
    action: 'Review the gate',
  };

  // Release-stamp peek. The timestamp removed from the face becomes the hero
  // metric here (same "strip the trailing 'ago', it's carried by `unit`"
  // trick as the Stale peek, so it reads "3 hours ago" rather than "3 hours
  // ago ago"). `latestRelease` only carries `{num, createdAt}` at this layer —
  // no release name/notes reach the flow-graph node data model, so this peek
  // can't show them; `deployment.releaseTargetName` is the one additional
  // cheaply-available, genuinely useful field.
  const releaseSpec: PeekSpec | null = latestRelease
    ? {
        tab: 'releases',
        eyebrow: `Release · rel-${latestRelease.num}`,
        metric: latestRelease.createdAt
          ? { value: formatRelative(latestRelease.createdAt).replace(/\s*ago$/i, ''), unit: 'ago' }
          : undefined,
        lines: deployment.releaseTargetName ? [`Published to ${deployment.releaseTargetName}`] : [],
        action: 'Open this release',
      }
    : null;

  // Whether NodeBody would render anything at all. When it wouldn't, NodeBody
  // is skipped entirely (not just left empty) and the header centers
  // vertically in the full card height — a present-but-empty NodeBody would
  // still claim its own padding and stop the header from reaching dead center.
  const hasBodyContent =
    !!healthVital ||
    !!syncVital ||
    showUnreported ||
    isTransient ||
    (!isTransient && !!localSuccess) ||
    isStale ||
    isUnreleased ||
    isGated;

  return (
    <>
      {/*
        Deliberately NOT wiring `isConnectable` through, despite the Phase 3
        plan's recommendation — traced the naive version and it's an active
        regression, not a safe no-op "future lever". React Flow's
        NodeRenderer computes this NodeProps value as
        `node.connectable || (nodesConnectable && node.connectable ===
        undefined)` — wherever `nodesConnectable` is false, `isConnectable`
        here would be `false`. Handle's own `connectionindicator` CSS class —
        the ONLY thing that re-enables `pointer-events` on a
        `.react-flow__handle` (reactflow/dist/style.css:130-142 defaults it to
        `none`) — is computed as `isConnectable && (...)`, so passing
        `isConnectable={false}` drops that class entirely, and StyledHandle
        (below) never re-sets pointer-events itself. Net effect: forwarding
        this prop would make the handles NON-interactive — and Phase 3's drag
        gesture needs them working. Left
        unwired, `Handle`'s own hardcoded default (isConnectable=true)
        applies instead, which is what already keeps them hit-testable today
        (confirmed against the installed reactflow source — see the Phase 3
        report).
      */}
      <StyledHandle type="target" position={Position.Left} />
      <Box
        sx={{ position: 'relative' }}
        onMouseEnter={() => setIsCardHovered(true)}
        onMouseLeave={() => setIsCardHovered(false)}
      >
        {compareLetter ? (
          <CompareLetter
            data-testid="node-compare-letter"
            title={`Selector ${compareLetter} in the side pane's comparison`}
          >
            {compareLetter}
          </CompareLetter>
        ) : null}
        {(deployment.targets.length > 0 || isBaseNode) && (
          <FloatingLabels>
            <TypeBadge
              $kind={isBaseNode ? 'Base' : deployment.type}
              // Pure attribute instrumentation, no behavior change. This chip has
              // no click handler of its own, so a click here bubbles normally and
              // selects the node exactly like clicking blank card space would.
              // Only ever one Base per component, so the value is fixed (not
              // parameterized by the runtime deploymentId UUID).
              data-testid={isBaseNode ? 'flow-node-base-badge' : undefined}
            >
              {isBaseNode ? 'Base' : deployment.type}
            </TypeBadge>
            {deployment.targets.map(({ targetId, name, url }, i) => {
              return (
                <span key={targetId} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  {i > 0 && <span>·</span>}
                  {url ? (
                    <Tooltip title={`Open ${name}`} placement="top">
                      <TargetLink
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nodrag nopan"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        {name}
                        <OpenInNewIcon />
                      </TargetLink>
                    </Tooltip>
                  ) : (
                    <span>{name}</span>
                  )}
                </span>
              );
            })}
          </FloatingLabels>
        )}
        <NodeContainer
          data-testid={`flow-node-${deployment.deploymentId}`}
          // Static hook for tour anchoring: `deployment.deploymentId` is a
          // runtime Space UUID, so a tour step cannot hardcode it. The root
          // node (no parent) is always 'base'; every other node's variant
          // name is exactly what was typed into the composer's
          // `composer-variant-name-input` (e.g. 'dev', 'prod') — this is
          // pure attribute instrumentation, no behavior change.
          data-variant={deployment.parentDeploymentId ? deployment.displayName : 'base'}
          // Same instrumentation purpose as `data-variant` above, one level
          // up: lets a tour step confirm THIS node's side pane is actually
          // open (`isSelected`) instead of trusting a preceding "click if
          // not already open" step's Next button — see ownershipAndProd.tsx's
          // `edit-open-dev`/`reedit-open-base`. Only stamped on the
          // container, not the `flow-node-select-target` strip below, so a
          // combined `[data-variant="x"][data-selected="true"]` selector
          // matches exactly one element. Pure attribute instrumentation, no
          // behavior change.
          data-selected={isSelected ? 'true' : 'false'}
          $selected={isSelected}
          $publishing={isReleasing}
          $isBase={deployment.type === 'Base'}
          className="nopan"
        >
        <NodeHeader $selected={isSelected} $quiet={!hasBodyContent}>
          <NodeNameWrap>
            <NodeName>{deployment.displayName}</NodeName>
          </NodeNameWrap>
          {deployment.releaseTargetId && latestRelease && releaseSpec && (
            <Tooltip
              placement="bottom-start"
              enterDelay={120}
              leaveDelay={0}
              disableInteractive
              slotProps={{ tooltip: { sx: INFO_PEEK_TOOLTIP_SX }, transition: { timeout: { enter: 120, exit: 0 } } }}
              title={<InfoPeekCard color={componentTheme.fgMuted} spec={releaseSpec} />}
            >
              <ReleaseChip
                $fresh={!!localSuccess}
                className="nodrag nopan"
                onClick={handleReleaseGo}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <ReleaseChipDot $fresh={!!localSuccess} />
                rel-{latestRelease.num}
              </ReleaseChip>
            </Tooltip>
          )}
          {hasError && <ErrorBadge>Error</ErrorBadge>}
        </NodeHeader>

        {hasBodyContent && (
        <NodeBody>
          {/* Live status — always visible, including when fine. The first
              thing read on every card: is the cluster healthy and is it synced
              to what was released, in the reporting system's own words, led by
              that system's mark so the reading is attributed rather than
              presented as ConfigHub's own. Each tag independently renders
              nothing only when that axis has no reporter at all. Flux renders
              ONE chip (its single collapsed condition), ArgoCD renders TWO
              (its genuinely independent sync/health facts) — see
              `deriveFluxVital`. */}
          {(healthVital || syncVital || showUnreported) && (
            <LiveStateRow>
              <LiveStatusProviderMark provider={liveProvider} />
              {showUnreported ? (
                <StatusChipWithPeek
                  tone="neutral"
                  leading={<LiveDot $color={LIVE_TONE_COLOR.neutral} />}
                  label="Not reported yet"
                  spec={unreportedSpec}
                  onGo={openTab}
                />
              ) : fluxVital ? (
                <LiveStateChip
                  axis={fluxVital.axis}
                  eyebrowAxis="status"
                  status={deployment.liveStatus}
                  presentation={fluxVital.presentation}
                  provider={liveProvider}
                  deploymentId={deployment.deploymentId}
                  onOpenTab={onOpenTab}
                />
              ) : (
                <>
                  <LiveStateChip
                    axis="health"
                    status={deployment.liveStatus}
                    presentation={healthVital}
                    provider={liveProvider}
                    deploymentId={deployment.deploymentId}
                    onOpenTab={onOpenTab}
                  />
                  <LiveStateChip
                    axis="sync"
                    status={deployment.liveStatus}
                    presentation={syncVital}
                    provider={liveProvider}
                    deploymentId={deployment.deploymentId}
                    onOpenTab={onOpenTab}
                  />
                </>
              )}
            </LiveStateRow>
          )}

          {/* In-flight action (transient) — an action, not a state. */}
          {isTransient && (
            <TransientRow>
              {isUpgrading && (
                <TransientStat sx={{ color: componentTheme.upgrade }}>
                  <CircularProgress size={9} sx={{ color: 'inherit' }} /> upgrading…
                </TransientStat>
              )}
            </TransientRow>
          )}

          {/* Post-action success flash. */}
          {!isTransient && localSuccess && (
            <SuccessTick key={localSuccess.key}>
              <TickIcon /> {localSuccess.msg}
            </SuccessTick>
          )}

          {/* Desired-side (config) signals — tinted, borderless, fixed order
              Stale → Unreleased changes → Gated, with Gated right-anchored.
              Status by exception: every all-clear signal shows nothing, so a
              healthy card has no chips at all. */}
          {(showStaleChip || isUnreleased || isGated) && (
            <ChipRow>
              {showStaleChip && (
                <StatusChipWithPeek
                  tone="stale"
                  leading={<UpgradingIcon />}
                  label="Stale"
                  meta={staleMeta || undefined}
                  spec={staleSpec}
                  onGo={openTab}
                />
              )}
              {isUnreleased && (
                <StatusChipWithPeek
                  tone="unreleased"
                  leading={<PendingIcon />}
                  label="Unreleased changes"
                  spec={unreleasedSpec}
                  onGo={openTab}
                />
              )}
              {isGated && (
                <StatusChipWithPeek
                  tone="gated"
                  leading={<GatedIcon />}
                  label="Gated"
                  spec={gatedSpec}
                  onGo={openTab}
                  autoRight
                />
              )}
            </ChipRow>
          )}
        </NodeBody>
        )}
        {/* Pure instrumentation, no visual change beyond its own 18px strip: a
            guided-tour step that needs to SELECT this node (open its side
            pane) cannot safely click anywhere else in the card. NodeName
            above no longer links out (main removed the clickable node-name
            link this instrumentation originally worked around — see git
            history), but for a target-less node, which is every node this
            tour ever creates, NodeHeader is $quiet, so `margin: auto 0`
            centers it and NodeName's flex:1 wrapper still fills nearly the
            entire card, leaving no reliable blank space to click instead.
            This is the one location guaranteed free of interactive children
            regardless of node type, target, or live status — it has no
            click handler of its own, so a click bubbles normally and
            selects the node exactly like clicking blank card space would.
            Sized for a comfortable click target (not the minimum that would
            fit) since a tour step also spotlights exactly this rect — the
            spotlighted area must itself be safe to click, not just the point
            a test happens to pick within it.

            A full-card version of this (an absolutely-positioned underlay
            behind the header) was tried and reverted: giving it a negative
            z-index so the Link stayed clickable also made the underlay
            unreachable at its own visual center on a quiet node, since the
            Link's flex:1 hit area covers nearly that whole area — confirmed
            live via Playwright's own (correct, hit-test-checking) `.click()`
            failing at the element's default center point, which a raw
            coordinate click elsewhere on the card had masked. If a step
            needs its SPOTLIGHT to visually cover the whole card without
            touching this click target, use TourStep's `spotlightAnchor`
            instead of trying to enlarge this element again. */}
        <Box
          data-testid="flow-node-select-target"
          data-variant={deployment.parentDeploymentId ? deployment.displayName : 'base'}
          sx={{ height: 18, flexShrink: 0 }}
        />
      </NodeContainer>
      </Box>
      {/* disableInteractive: MUI's Tooltip popper defaults to
          pointer-events: auto (so a tooltip WITH interactive content, e.g. a
          link, can be moused into) -- for this plain-text tooltip that only
          means it sits on top of and swallows the pointerup that ends a
          drag-to-clone drop, right where the cursor lands. disableInteractive
          reverts it to pointer-events: none. */}
      <Tooltip title="Drag to clone, or press V" placement="right" disableInteractive>
        <StyledSourceHandle
          data-testid={`flow-node-composer-handle-${deployment.deploymentId}`}
          // A DIFFERENT attribute name than NodeContainer's `data-variant`
          // above, deliberately: another chapter (changeAndPromote.tsx)
          // already relies on `[data-variant="base"]` uniquely matching the
          // node's card to click-select it, so reusing that name here (this
          // element also being an ancestor-free sibling in the DOM) would
          // make that selector match two elements. `data-handle-variant`
          // carries the identical value (base vs. the variant's own display
          // name) but under its own name, so
          // `[data-handle-variant="base"]` finds the base node's own
          // composer-open handle with no UUID and no collision. See
          // tours/chapters/deployAndRelease.tsx.
          data-handle-variant={deployment.parentDeploymentId ? deployment.displayName : 'base'}
          type="source"
          position={Position.Right}
          $hovered={isSourceHandleHovered}
          onMouseEnter={() => setIsSourceHandleHovered(true)}
          onMouseLeave={() => setIsSourceHandleHovered(false)}
        >
          <SourceKnob $hovered={showComposerKnob}>
            <AddIcon sx={{ fontSize: 9 }} />
          </SourceKnob>
        </StyledSourceHandle>
      </Tooltip>
    </>
  );
});

DeploymentFlowNode.displayName = 'DeploymentFlowNode';
