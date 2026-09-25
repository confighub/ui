// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The design contract's own values, for markup this page owns.
 *
 * Every value here is read from `tools/design-fidelity/contract.json`
 * (`contractVersion 1.1.0`) — the vocabulary measured off the frozen reference,
 * not values chosen by eye. Nothing in this file may be tuned to make a check
 * pass: if a value here is wrong, the contract is the thing to consult, and if
 * the contract is wrong that is a finding about the instrument.
 *
 * ⚠️ THIS COVERS THE MARKUP THIS PAGE WRITES, AND NOTHING ELSE. The reused diff
 * components — `ComponentValuesSection`, `RolloutGateList`, `RolloutUnitHeader`
 * — style themselves from `componentTheme`, which 58 files import. They cannot
 * be retuned from here, and retuning `componentTheme`'s values directly would
 * change the Component view as a side effect. That work is U3's CSS
 * custom-property indirection, which keeps present values as fallbacks so a
 * scoped override reaches this page alone. Until it lands, this page is on
 * contract values and the components it mounts are not.
 *
 * WHY A LOCAL MODULE RATHER THAN LITERALS AT THE CALL SITES. 27 occurrences of
 * one wrong colour is one token, not 27 edits — and a literal repeated across a
 * file cannot be re-pointed when the contract moves.
 */

/**
 * Ink.
 *
 * `subtle` is the one worth knowing about: `componentTheme.fgSubtle` is
 * `#8e9aaa`, which measures **2.86:1** on white and fails AA outright — the
 * single most repeated contrast defect on this page. The contract's counterpart
 * is `#646b78` at **5.36:1**. The reference's own designer declined to copy the
 * 2.86:1 value out of the product, on the grounds that copying a colour already
 * established as unreadable would be fidelity to the bug.
 */
export const rolloutInk = {
  default: '#191d23',
  muted: '#4b5361',
  subtle: '#646b78',
} as const;

export const rolloutSurface = {
  /**
   * The page canvas, `--bg` in the contract. Distinct from `card` on purpose:
   * the reference's whole layout is white cards on a grey ground, and losing
   * that contrast was the single largest visual gap against the design —
   * every region rendered flat on `page` with hairline dividers instead.
   */
  page: '#f4f5f7',
  card: '#ffffff',
  /** A card's own header band, `--surface-sunk`. Slightly off-white, never grey. */
  sunk: '#f8f9fb',
  subtle: '#f8f9fb',
  inset: '#eef0f3',
} as const;

/** Card chrome, `--r-surface` / `--shadow-1`. One definition, every card uses it. */
export const rolloutCardTokens = {
  radius: 10,
  shadow: '0 1px 2px rgba(25,29,35,.05), 0 1px 1px rgba(25,29,35,.04)',
  /**
   * `--col-block`. A property/value tree reads as a column of aligned
   * values, and a column has an optimal width independent of how wide its
   * container happens to be — the reference caps its diff trees at this
   * width while every other card on the page fills the row (mockup ~line
   * 671, 679: `.dv-unit`'s own `max-width` is set on the tree, never on
   * `.main`). Rendering these trees at full card width was found by direct
   * side-by-side screenshot comparison, not by any structural check — every
   * region-presence and chrome check the harness runs passed while this was
   * still wrong, because the tree was PRESENT, just proportioned differently
   * than the reference means it to be.
   */
  colBlock: 880,
} as const;

/** Outcome-kind border tints, for a panel's own edge — `--wait-line` / `--bad-line` / `--accent-line`. */
export const rolloutKindLine = {
  same: '#e2e5ea',
  differs: '#e8d5a6',
  adds: '#b9cbf3',
  unknown: '#eec5c5',
} as const;

export const rolloutBorder = {
  default: '#e2e5ea',
  strong: '#cdd2da',
} as const;

/**
 * Status hues.
 *
 * Adopting `#1c7a4c` over `componentTheme`'s `#15803d` also fixes the gate
 * chips: measured on the contract's own chip ground `#e7f4ed`, `#1c7a4c` is
 * **4.71:1** where `#15803d` was 4.21:1 — so one token change clears AA rather
 * than needing a second fix at the chip.
 */
export const rolloutStatus = {
  success: '#1c7a4c',
  successGround: '#e7f4ed',
  /** `--ok-line`. A done dot's own border — `successGround` is its fill. */
  successLine: '#b4dcc6',
  danger: '#ad2b2b',
  /** `--bad-soft`. A held dot's own fill. */
  dangerSoft: '#fbeaea',
  warn: '#8a6100',
  /** `--wait-soft`. A "differs" outcome badge's own fill. */
  warnSoft: '#fbf1dc',
  accent: '#234ba6',
  /** `--accent-soft`. A next/promoting dot's own fill. */
  accentSoft: '#eaf0fd',
  /** `--accent-line`, same value as `rolloutKindLine.adds` — a different property, coincidentally identical in the reference. A next/promoting dot's own border. */
  accentLine: '#b9cbf3',
} as const;

/**
 * The type ramp, from `contract.typeScale`.
 *
 * ⚠️ LINE HEIGHT IS THE LOAD-BEARING HALF. The contract never uses `normal` —
 * it uses 1.25 / 1.35 / 1.45 / 1.55, with 1.45 carrying the overwhelming
 * majority of rendered text. Leaving line-height unset is what put most of this
 * page's type roles off-contract, and it is invisible to every check that looks
 * only at size and weight.
 */
/** `--mono`. The order slug and the stage heading are set in this face in the reference. */
export const rolloutFontMono = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

/**
 * `--font`. Every type-scale entry in `contract.json` was measured against
 * "Segoe UI" as the resolved family — this is the stack that resolves to it,
 * copied from the reference's own `body { font-family: var(--font) }`.
 *
 * ⚠️ NEVER RELY ON INHERITANCE FOR THIS ONE. This app's global theme sets
 * `body`'s font to Manrope (`ThemeProvider.tsx:74`), and every plain `Box` on
 * this page inherits it unless told otherwise — measured directly:
 * `getComputedStyle(root).fontFamily` returned `"Manrope, system-ui,
 * -apple-system, sans-serif"` before this token existed anywhere on the page.
 * Every size/weight/line-height value in `rolloutType` was correct in isolation
 * and the whole page still rendered in the wrong typeface, because nothing
 * in this file had ever set the family itself — found by direct comparison
 * against the reference, not by any structural or chrome check, both of
 * which are blind to what font actually painted the pixels.
 */
export const rolloutFontSans =
  '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

export const rolloutType = {
  size: {
    micro: 10.5,
    small: 11.5,
    body: 12.5,
    prose: 13.5,
    lead: 15,
    heading: 18,
    display: 21,
    figure: 34,
    /** `--n-2`. A count that heads a card — the outcome-group badge. */
    cardFigure: 26,
  },
  lineHeight: {
    tight: 1.25,
    heading: 1.35,
    body: 1.45,
    loose: 1.55,
    flush: 1,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    strong: 650,
    bold: 700,
  },
} as const;

/**
 * Shape.
 *
 * The contract contains **no circle** and **no 2px border** — radii are
 * 2/3/6/8/9/10/999 and border widths are 1px, with 3px and 4px appearing only
 * as accent edges on one side. A selected state therefore reads as an inset
 * ring rather than a doubled border, which is also what keeps a selection from
 * shifting its own content by a pixel.
 */
export const rolloutShape = {
  radius: { xs: 2, sm: 3, md: 6, lg: 8, xl: 10, pill: 999 },
  borderWidth: 1,
  accentEdge: 3,
  gap: { xs: 2, sm: 6, md: 8, lg: 10, xl: 16, xxl: 20 },
} as const;

/** The selected-state ring, from `contract.geometry.shadow`. */
export const rolloutSelectedRing = `inset 0 0 0 1.5px ${rolloutStatus.accent}`;
