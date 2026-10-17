// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The look of the list consoles (ChangeOrders, ChangeSets): tokens, control and
 * select chrome, the KPI cards, and the coarse times their rows print.
 */

import type { SxProps, Theme } from '@mui/material/styles';

import { componentTheme } from '../x/apps/componentTheme';

/**
 * THE CONSOLES' OWN TOKENS, TAKEN FROM `tools/design-fidelity/contract.json`.
 *
 * Shared by the ChangeOrders and ChangeSets lists, and by nothing else.
 * `componentTheme` is read by the Component view as well, so correcting its
 * values there would restyle screens outside these lists. These shadow it here.
 *
 * ⚠️ EVERY VALUE IS THE CONTRACT'S, NOT AN EYEBALLED MATCH. The reference's
 * designer refused to copy `#8e9aaa` out of the product on the grounds that
 * "copying a colour I had already established as unreadable would be fidelity
 * to the bug", so the contract holds a CORRECTION rather than a variant. Read
 * a value from the contract before changing one here.
 *
 * The worst offender was `fgSubtle` — `#8e9aaa` on white is **2.86:1**, under
 * the 4.5 floor, and it was carrying ten roles on this page: the space slug,
 * the age, the stage key, the column heads and the freshness line. Every piece
 * of secondary information on the screen was the least readable thing on it.
 * `#646b78` is the contract's answer at 5.36:1 on white and 5.09:1 on sunk.
 */
export const consoleTokens = {
  /** #191d23, 16.92:1 on white. Not `#111214` — the design contains no pure-black-adjacent ink. */
  ink: '#191d23',
  /** #4b5361, 7.75:1. Prose and secondary text. */
  ink2: '#4b5361',
  /** #646b78, 5.36:1 on white / 5.09:1 on sunk. Meta, labels, the quiet half of a two-ended line. */
  ink3: '#646b78',
  onEmphasis: '#ffffff',

  surface: '#ffffff',
  /** Not a row: column head and footer. */
  surfaceSunk: '#f8f9fb',
  /** Row and control hover. Distinct from `surfaceSunk`, which means "not a row". */
  surfaceHover: '#f2f5fa',

  /** Every internal rule and card border. */
  line: '#e2e5ea',
  /** Control borders. */
  lineStrong: '#cdd2da',
  /** The ring on a stage not yet reached. */
  idleLine: '#d3d8df',
  idleSoft: '#eef0f3',

  /** The ONLY accent: selection and primary action. */
  accent: '#2f5fd0',
  /** The text-on-white and hover value of the accent. */
  accentInk: '#234ba6',
  accentSoft: '#eaf0fd',

  ok: '#1c7a4c',
  wait: '#8a6100',
  waitSoft: '#fbf1dc',
  bad: '#ad2b2b',
  badSoft: '#fbeaea',
  badLine: '#eec5c5',

  shadow: '0 1px 2px rgba(25,29,35,.05), 0 1px 1px rgba(25,29,35,.04)',

  /**
   * ⚠️ DELIBERATELY NOT THE CONTRACT'S FAMILIES, and the one place this file
   * knowingly departs from a measured value.
   *
   * The reference declares `"Segoe UI", system-ui, …` and `ui-monospace, …`.
   * Those are a mockup author's system stacks, not a decision about the
   * product: ConfigHub's face is Manrope and every other screen uses it.
   * Adopting the reference's stack would make this the only page in the product
   * set in a different typeface — a brand change smuggled in as a fidelity fix.
   *
   * Expect `type-vocabulary` and `font-rendering` findings on the family field
   * of every role here. That is the deviation being visible, which is what the
   * instrument is for. It is a decision for the user, not for this file.
   */
  sans: componentTheme.fontSans,
  mono: componentTheme.fontMono,

  /**
   * The contract never renders `line-height: normal`. Its ramp is 1.25 / 1.35 /
   * 1.45 / 1.55, and 1.45 carries almost everything, so leaving it unset — which
   * is what `normal` means — is the single most repeated type defect available.
   *
   * ⚠️ LETTER-SPACING IS NOT THE SAME CASE, THOUGH IT LOOKS LIKE IT. The
   * contract stores `0px` and Chrome reports `normal` for the same declaration,
   * so the two READ as drift and are not. `probe.mjs:224` maps `normal` to
   * `0px` before comparing. Do not "fix" it: setting `letterSpacing: 0` changes
   * no pixel and no measurement, and leaves a comment claiming a correction
   * that never happened.
   */
  lh: 1.45,
} as const;

/**
 * The reference's radii, by name. `componentTheme.radiusSm` is 5px and
 * `radiusMd` 9px; the contract's closed `radius-vocabulary` holds neither 5px
 * nor the 4px that MUI's `borderRadius: 0.5` resolves to. These three are
 * members of it.
 */
export const R_MICRO = '3px';
export const R_CONTROL = '8px';
export const R_SURFACE = '10px';

/** The contract's own figure type: `ui-monospace | 18px | 650 | 1 | -0.36px`. */
export const KPI_NUM_SX = {
  fontFamily: consoleTokens.mono,
  fontSize: '18px',
  fontWeight: 650,
  lineHeight: 1,
  letterSpacing: '-0.36px',
} as const;

export const KPI_LABEL_SX = { fontFamily: consoleTokens.sans, fontSize: '12.5px', lineHeight: consoleTokens.lh, color: consoleTokens.ink } as const;

/**
 * `textTransform: 'none'` is the one override this file exists to make: the
 * component's own hint line is `variant='caption'`, which this theme
 * uppercases globally, and the ruling against uppercase applies here. The
 * reduced tracking matches every other place this file removes the same
 * transform — `.07em` was sized for capitals and reads loose without them.
 */
export const KPI_HINT_SX = {
  fontFamily: consoleTokens.sans,
  fontSize: '11.5px',
  lineHeight: consoleTokens.lh,
  color: consoleTokens.ink3,
  textTransform: 'none',
  letterSpacing: '.02em',
} as const;

/**
 * ⚠️ `opacity: 1` HERE IS NOT A NO-OP — it is overriding the component's own
 * `opacity: isDisabled ? 0.5 : 1` (R11: de-emphasis is a chosen colour, never
 * an opacity composite). Measured, not assumed: without this line the sweep
 * found five faded text elements — every zero-count chip. `cardSx` is layered
 * on top of the base rules by the component's own design (its header says
 * so), which is exactly the mechanism this uses; nothing in
 * `ChangeOrderExceptions.tsx` was touched.
 *
 * The visual distinction survives losing the opacity: the component already
 * sends a disabled chip's count and label to `text.disabled` (a real colour,
 * not a composite) — only the hint line stops dimming further, which costs
 * nothing a reader needs, since the count and label already say "empty".
 */
export const KPI_CARD_SX = {
  border: `1px solid ${consoleTokens.line}`,
  borderRadius: R_CONTROL,
  background: consoleTokens.surface,
  padding: '9px 13px 9px 11px',
  opacity: 1,
} as const;

export const KPI_ACTIVE_CARD_SX = {
  borderColor: consoleTokens.accent,
  background: consoleTokens.accentSoft,
  boxShadow: `inset 0 0 0 1px ${consoleTokens.accent}`,
} as const;

/**
 * The State dropdown holds some of this card's states, or these and others.
 * The accent border says the card takes part in the filter; the dash and the
 * plain surface say it is not the whole of it. Line style, never opacity (R11).
 */
export const KPI_PARTIAL_CARD_SX = {
  borderColor: consoleTokens.accent,
  borderStyle: 'dashed',
  background: consoleTokens.surface,
  boxShadow: 'none',
} as const;

/** `"needs a Release"` -> `"Needs a Release"`. The copy module writes hints as fragments; this is the only place they are read as sentences. */
export function sentenceCase(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A short label, not a clipped sentence — cut at the last whole word inside
 * `max`, never mid-word.
 *
 * ⚠️ THE CSS ELLIPSIS ON THE DETAIL LINE TRUNCATES THE PIXELS, NOT THE
 * CHARACTERS. `text-overflow: ellipsis` hides overflow visually; the full
 * sentence is still every one of its own characters in the DOM, so a reader
 * using a browser's own "find in page", copy, or any tool that reads
 * `textContent` — including a structural fidelity probe — sees the whole
 * paragraph regardless of what is painted. Cutting the STRING here, not just
 * its rendering, is what makes "a short label" actually true rather than
 * only true to the eye. The full sentence survives as the `title` tooltip.
 */
export function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Coarse on purpose: an exact duration on a list row is noise, not information. */
export function ageFrom(createdAt: string | undefined, now: number): string {
  if (createdAt === undefined) return '';
  const then = Date.parse(createdAt);
  if (Number.isNaN(then)) return '';
  return elapsed(now - then);
}

export function elapsed(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** `Updated 4m ago`. The number is the message; there is no sentence around it. */
export function freshnessFrom(lastLoadedAt: number | null, now: number): string {
  if (lastLoadedAt === null) return '';
  const ms = now - lastLoadedAt;
  return ms < 60000 ? 'Updated just now' : `Updated ${elapsed(ms)} ago`;
}

/** A control's chrome, shared so `Refresh` and a row action cannot drift apart. */
export function controlSx(variant: 'primary' | 'quiet', enabled: boolean): SxProps<Theme> {
  return {
    all: 'unset',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    padding: '0 11px',
    fontFamily: consoleTokens.sans,
    fontSize: 12.5,
    lineHeight: consoleTokens.lh,
    fontWeight: 600,
    borderRadius: R_CONTROL,
    border: '1px solid',
    cursor: enabled ? 'pointer' : 'not-allowed',
    /*
     * ⚠️ DISABLED IS A CHOSEN COLOUR, NEVER `opacity` (R11).
     *
     * An opacity composite produces a value nobody picked and no vocabulary
     * check can see: the token says `#2f5fd0`, the screen shows whatever 0.55
     * of it over whatever happens to be behind it comes to. That mechanism is
     * behind the reference's four worst below-AA pairs — the ratio is never
     * wrong on purpose, it is simply never anybody's decision.
     *
     * The disabled TEXT is measured, not assumed: `#646b78` on white is
     * **5.36:1**, clearing the 4.5 floor.
     *
     * ⚠️ THE BORDER IS NOT AT THE 3:1 TIER AND THIS COMMENT ORIGINALLY CLAIMED
     * IT WAS. `#cdd2da` on white measures **1.52:1**. It is the reference's own
     * `--line-strong`, carried deliberately and used on every quiet control
     * here, enabled ones included — so it is a property of the contract rather
     * than of this button, and WCAG exempts a disabled control's boundary in
     * any case. The ENABLED controls using it are not exempt; recorded as a
     * finding against the palette rather than patched locally, which would
     * leave this one button inconsistent with every other.
     *
     * Left as a warning about the shape: I wrote the ratio into the comment
     * before measuring it, in the same edit that removed an opacity for being
     * a value nobody had checked.
     */
    ...(!enabled
      ? { background: consoleTokens.surface, color: consoleTokens.ink3, borderColor: consoleTokens.lineStrong }
      : variant === 'primary'
        ? {
            background: consoleTokens.accent,
            color: consoleTokens.onEmphasis,
            borderColor: consoleTokens.accentInk,
            '&:hover': { background: consoleTokens.accentInk },
          }
        : {
            background: consoleTokens.surface,
            color: consoleTokens.ink,
            borderColor: consoleTokens.lineStrong,
            '&:hover': { background: consoleTokens.surfaceSunk },
          }),
    '&:focus-visible': {
      outline: `2px solid ${consoleTokens.accent}`,
      outlineOffset: 2,
      borderRadius: R_MICRO,
    },
  };
}

export const SELECT_SX: SxProps<Theme> = {
  height: 30,
  fontFamily: consoleTokens.sans,
  fontSize: 13,
  lineHeight: consoleTokens.lh,
  color: consoleTokens.ink,
  background: consoleTokens.surface,
  border: `1px solid ${consoleTokens.lineStrong}`,
  borderRadius: R_CONTROL,
  padding: '0 8px',
  '&:focus-visible': { outline: `2px solid ${consoleTokens.accent}`, outlineOffset: 1 },
};

/**
 * A native `<select>` sizes itself to its widest option, which leaves the
 * label pressed against the arrow. A floor gives both filters the same width
 * and room around their text; the filter bar wraps rather than shrinking them.
 */
export const FILTER_SELECT_SX: SxProps<Theme> = {
  ...SELECT_SX,
  minWidth: 180,
  flexShrink: 0,
  padding: '0 10px',
};
