// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Design tokens for the component view UX.
 * Aligned with the ConfigHub design system (nav-01 foundation).
 */
export const componentTheme = {
  // ── Brand — action signal only ──
  accent: '#ba3d03',
  accentEmphasis: '#8c2c00',
  accentMuted: 'rgba(186,61,3,0.055)',

  // ── Semantic — success/ready ──
  success: '#15803d',
  successEmphasis: '#0f5f2e',
  successMuted: '#f0fdf4',
  successFaint: 'rgba(21,128,61,0.06)',

  // ── Semantic — error/degraded ──
  // Contrast-ladder fix (component-node-card redesign, 2026-07): measured
  // against the card surface (ΔL* CIELAB), the old danger/attention/upgrade/
  // variation quartet ranked Degraded only 3rd-loudest of 4 in both directions
  // people actually view this — worst in dark theme. "Broken" must be the
  // single loudest status color; it wasn't. Only lightness (L*) was adjusted
  // for each token below — hue and chroma (a*/b*) are unchanged, so every
  // token stays the same color family. See design-mockups/component-node-card/
  // RAIL-EVIDENCE.md (Defect 3) for the measured before/after ΔL* ladders.
  danger: '#9a0005',
  dangerEmphasis: '#8f1515',
  dangerMuted: '#fef2f2',
  dangerFaint: 'rgba(185,28,28,0.06)',

  // ── Semantic — warning/gated ──
  attention: '#9f4200',
  attentionEmphasis: '#8c4007',
  attentionMuted: '#fffbeb',

  // ── Semantic — upgrade/secondary ──
  done: '#9951f4',
  doneEmphasis: '#4e1a96',
  doneMuted: '#f4f0ff',

  upgrade: '#9951f4',
  upgradeEmphasis: '#4e1a96',
  upgradeMuted: '#f4f0ff',

  // ── Semantic — apply/in-progress ──
  variation: '#4467dc',
  variationEmphasis: '#133a91',
  variationMuted: '#eff4ff',

  // ── Foreground ──
  fgDefault: '#111214',
  fgMuted: '#505969',
  fgSubtle: '#8e9aaa',
  fgOnEmphasis: '#ffffff',

  // ── Background ──
  bgDefault: '#ffffff',
  bgSubtle: '#f6f7f9',
  bgInset: '#f3f4f6',

  // ── Border ──
  borderDefault: '#e6e8ec',
  borderMuted: '#eeeff3',
  borderSubtle: '#f3f4f6',
  // The value-field stroke. Achromatic on purpose — it says "differs from
  // upstream", not "warning" — and deliberately darker than borderDefault,
  // which disappears at 1x on a 12px inline element.
  borderEdge: '#c8ced8',
  // Base-node (no target) card boundary. bgSubtle IS the graph canvas color
  // (see ComponentFlowGraph.tsx) and bgDefault/bgInset/borderSubtle all sit
  // within ~1.0-1.03 WCAG contrast of it — a filled Base card measured
  // identical-to-invisible against the real canvas (see git history: a
  // bgSubtle-filled Base card shipped and vanished). The current treatment
  // gives a Base card the same bgDefault fill as any other node — no tint,
  // no separate "is this a template" background signal — and puts the
  // entire distinguishing mark on the boundary: dashed, borderEmphasis.
  // borderEmphasis meets WCAG SC 1.4.11 (Non-text Contrast, 3:1) for a UI
  // component boundary — the standard that actually governs "can you tell
  // where the card ends and the canvas begins" — at 5.96:1 against the
  // bgSubtle canvas. An earlier fill-tint approach (bgMuted, ~1.2:1) was
  // tried and dropped in favor of this dashed-outline treatment; pushing a
  // fill dark enough to hit 3:1 on its own (~#8c8c8c) visually broke the
  // Stale/Unreleased/Gated chips, which assume a near-white card backdrop.
  borderEmphasis: '#5f5f5f',

  // ── Shadow ──
  /*
   * PRE-COMPOSITED TINTS — named by the role they play, not by their alpha.
   *
   * ⚠️ THESE REPLACE `${token}26`-STYLE CONCATENATION, AND THE NAMING IS THE
   * DURABLE HALF OF THAT FIX, NOT THE COMPATIBILITY.
   *
   * The mechanical reason to stop concatenating is that the moment a token
   * becomes a `var(--ct-…)`, appending two hex digits produces an invalid
   * declaration; the browser drops it silently and the element falls back to
   * whatever it inherits. Nothing throws and nothing looks obviously wrong.
   *
   * The lasting reason is different. `26` meant "~15% tint" only because a
   * comment beside it said so, and the next person to write `}26` will not have
   * read that comment either — the same way the alpha was never checked against
   * a contrast floor, because a magic number attached to no name is attached to
   * no requirement. Naming it is what makes it reviewable.
   *
   * Each value below is the EXACT rgba equivalent of the concatenation it
   * replaced — 0x11 = 17/255 = 0.067, 0x22 = 34/255 = 0.133, 0x26 = 38/255 =
   * 0.149, 0x33 = 51/255 = 0.2 — so nothing this touches may change colour. If
   * a census shows one of these moved, the arithmetic is wrong, not the design.
   */
  /** The wash under a hovered destructive control. */
  dangerHoverTint: 'rgba(154,0,5,0.067)',
  /** A danger hairline that must not read as a solid rule. */
  dangerEdge: 'rgba(154,0,5,0.2)',
  /** The border on an Upgrade explainer — belongs to the action, not a warning. */
  upgradeEdge: 'rgba(153,81,244,0.149)',
  /** The larger of the two Upgrade skeleton blocks while it loads. */
  upgradeSkeleton: 'rgba(153,81,244,0.133)',
  /** The quieter Upgrade skeleton blocks beneath it. */
  upgradeSkeletonQuiet: 'rgba(153,81,244,0.067)',
  /** The focus ring around an editable value cell. */
  accentFocusRing: 'rgba(186,61,3,0.2)',
  /**
   * The hairline around a value that diverges from a comparison's baseline.
   * Pairs with `variationMuted` as its wash; a solid `variation` rule would
   * outshout the value it surrounds at 12px.
   */
  variationEdge: 'rgba(68,103,220,0.28)',
  /** The wash behind a value only one of the compared deployments carries. */
  successTint: 'rgba(21,128,61,0.08)',
  /** The hairline around that same present-only value. */
  successEdge: 'rgba(21,128,61,0.3)',
  /** The wash behind a field a deployment leaves unset where the baseline sets one. */
  dangerTint: 'rgba(154,0,5,0.06)',

  shadowSm: '0 1px 2px rgba(0,0,0,0.04)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.07),0 1px 3px rgba(0,0,0,0.04)',

  // ── Border radius ──
  radiusSm: 5,
  radiusMd: 9,
  radiusLg: 9,

  // ── Typography ──
  fontSans: '"Manrope", system-ui, -apple-system, sans-serif',
  fontMono: '"JetBrains Mono", "Courier New", monospace',
} as const;
