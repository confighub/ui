// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * releasePaneStyles — the styled primitives shared by `ReleasesPane` and
 * `ReleaseDiffPanel` (Releases v7, "height-encoded").
 *
 * Every value here is transcribed from the approved design file
 * `design-explorations/Releases v7 - Height-encoded, ConfigHub.html`, with the
 * mockup's CSS custom properties resolved back onto their `componentTheme`
 * tokens (`--t1` → fgDefault, `--t2` → fgMuted, `--rust` → accent, and so on).
 * Three rules are load-bearing and are enforced here:
 *
 *  1. LIGHT ONLY. There is no `prefers-color-scheme` branch anywhere in this
 *     module, by explicit design intent.
 *  2. RUST IS ACTION-ONLY. `componentTheme.accent` appears on focus rings, the
 *     selection ring, the span underline, the A/B markers and the Release
 *     button — never as a status or data colour.
 *  3. ONE TYPE SCALE, and no size literals. Every `fontSize` in the tab is one
 *     of `paneType`'s three role-named steps, and all-caps is spent only on
 *     the short list the casing rule below names. The mockup this module was
 *     transcribed from is a full-width page and its type is sized for one; the
 *     tab is a 380–650px side pane, and the two 30px mono headings that came
 *     across with it (the withdraw target and "0 differences") were display
 *     type in a column narrower than a phone. That is the one place this
 *     module deliberately departs from the design file.
 *
 * `PANE_PX` (11px) is the single horizontal padding token for the whole pane.
 * `ReleaseDiffPanel` and `ComponentRolloutsPane` import it and `paneType` from
 * here rather than restating them, so the pane's surfaces cannot drift apart.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { styled } from '@mui/material/styles';
import type { CSSObject } from '@mui/material/styles';

import { componentTheme } from './componentTheme';

/** The one horizontal padding value the whole Releases pane uses. */
export const PANE_PX = 11;

/**
 * THE type scale for the Releases tab. Three sizes, named by the ROLE each one
 * serves rather than by its number, plus the single tracking value the
 * surfaces that stay all-caps share.
 *
 * The tab is a 380–650px side pane, so the scale is a dense-panel scale: there
 * is no display or hero step in it, and the largest size is one point above
 * body. It replaces a set of scattered literals that had drifted as far as two
 * separate 30px mono headings (the withdraw-confirm target name and the diff
 * panel's "0 differences") plus a 16px per-unit name — display type in a
 * column narrower than a phone.
 *
 * Everything in `ReleasesPane`, `ReleaseDiffPanel` and this module reads these
 * three values and adds no literals of its own, which is what keeps one
 * type ramp across surfaces that are styled in separate files.
 */
export const paneType = {
  /**
   * Pills and inline controls that sit INSIDE a line of body text and must not
   * grow it: the "0 units" flag, the per-unit
   * badge and note. Also the tab's floor — nothing here is smaller.
   */
  secondary: 11,
  /**
   * The pane's reading size, and the default: every label, every sentence,
   * every count, every button. If a surface has no reason to be one of the
   * other two, it is this.
   */
  body: 12,
  /**
   * Mono names and values that are the SUBJECT of a line — a release name, a
   * unit slug, the empty state's "0 differences". One point above body, which
   * is enough to read as the thing a line is about without reading as a
   * heading.
   */
  subject: 13,
  /**
   * The one letter-spacing for the handful of surfaces that stay all-caps (see
   * the casing rule below). Was five different values between .05em and .09em;
   * the widest of them were the loudest things in the pane.
   */
  caps: '.06em',
} as const;

/**
 * ALL-CAPS IS RESERVED, and this is the whole list of what earns it:
 *
 *  a. a region label of two words or fewer — `Top`'s "Releases";
 *  b. a control label — `PaneButton`;
 *  c. a one-word data label — `UnitKind`.
 *
 * Everything else is sentence case, and in particular: anything that is a
 * sentence ("Identical declared values", "No releases yet.", the drift and
 * empty-bundle notes), and anything carrying user data or a release name — a
 * target name, a release label, a unit slug. Uppercasing those is not emphasis,
 * it is a misprint of a name the reader has to match against something else.
 */

/** Only `$`-prefixed props are transient; everything else reaches the DOM. */
const transientOnly = (prop: string | number | symbol): boolean =>
  typeof prop !== 'string' || !prop.startsWith('$');

/**
 * Shared typography of every line-subject in the tab: mono, `paneType.subject`,
 * foreground default. One definition so the readout subject, the withdraw
 * target, the per-unit name and the empty-state value cannot drift apart —
 * they are the same kind of thing seen in four places.
 */
const subjectType: CSSObject = {
  fontFamily: componentTheme.fontMono,
  fontSize: paneType.subject,
  lineHeight: 1.4,
  fontWeight: 500,
  letterSpacing: 0,
  color: componentTheme.fgDefault,
  overflowWrap: 'anywhere',
};

// ============================================================================
// PANE HEAD
// ============================================================================

/** Sticky "RELEASES · <target>" strip at the top of the pane body. */
export const Top = styled(Box)({
  position: 'sticky',
  top: 0,
  zIndex: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: `9px ${PANE_PX}px`,
  background: componentTheme.bgDefault,
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
  fontFamily: componentTheme.fontSans,
  fontSize: paneType.body,
  lineHeight: 1.3,
  textTransform: 'uppercase',
  letterSpacing: paneType.caps,
  fontWeight: 700,
  '& b': { color: componentTheme.fgDefault, fontWeight: 800 },
  // The target's NAME, not a label: it opts out of the strip's all-caps so it
  // is printed the way it was typed.
  '& span': {
    color: componentTheme.fgMuted,
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: 0,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

/**
 * Stand-in for the selectors while there is no history to draw. It carries the
 * pane's own horizontal padding and the same bottom rule the selectors sit on,
 * so the empty and loading states keep the pane's rhythm instead of leaving a
 * seam where the comparison would be.
 */
export const LaneEmpty = styled(Box)({
  padding: `14px ${PANE_PX}px 13px`,
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
  fontFamily: componentTheme.fontSans,
  fontSize: paneType.body,
  lineHeight: 1.5,
  fontWeight: 600,
  // "No releases yet." is a sentence, not a label — sentence case.
  color: componentTheme.fgMuted,
});

// ============================================================================
// NOTES REGION
// ============================================================================

/** Wrapper for the conditions the selectors cannot show: a release that bundled
 *  nothing, units drifted out of the target, history not fully loaded, notes. */
export const Read = styled(Box)({
  padding: `9px ${PANE_PX}px`,
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
});

/**
 * THE secondary line of the tab: every sentence that sits under something else
 * and qualifies it — the notes region's release notes, empty-bundle warning,
 * drift note and truncation note, and the diff panel's unavailable and
 * empty-state lines.
 *
 * Sentence case. It was all-caps with .05em tracking, which is a label
 * treatment, and NONE of its callers is a label: they are sentences, several of
 * them carrying a release name ("rel-2 bundled 0 units.") or a user-typed
 * release name in quotes, both of which a text-transform silently misprints.
 *
 * Two former near-duplicates were folded into it once the casing matched:
 * `Hint` (identical but sentence case, which is now the only case) and
 * `EmptySub` (identical but without the `$tone`/`& b` extras).
 */
export const Sub = styled('p', { shouldForwardProp: transientOnly })<{
  $tone?: 'muted' | 'attention';
}>(({ $tone = 'muted' }) => ({
  fontFamily: componentTheme.fontSans,
  fontSize: paneType.body,
  lineHeight: 1.5,
  fontWeight: 600,
  color: $tone === 'attention' ? componentTheme.attentionEmphasis : componentTheme.fgMuted,
  margin: '8px 0 0',
  overflowWrap: 'anywhere',
  '& b': { color: componentTheme.fgDefault, fontWeight: 800 },
}));

/**
 * Release notes are freeform user text: rendered as plain text only (never
 * `dangerouslySetInnerHTML`), clamped to four lines with the full string on
 * the title attribute.
 */
export const Notes = styled('p')({
  fontFamily: componentTheme.fontSans,
  fontSize: paneType.body,
  lineHeight: 1.5,
  fontWeight: 500,
  color: componentTheme.fgMuted,
  margin: '8px 0 0',
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  textTransform: 'none',
  letterSpacing: 0,
});

/*
 * `Hint` lived here — a sentence-case copy of `Sub`, which existed only because
 * `Sub` was all-caps. `Sub` is sentence case now, so the two were the same
 * primitive; its one caller (the "no units are targeted" line) uses `Sub`.
 */

// ============================================================================
// BUTTONS
// ============================================================================

type PaneButtonTone = 'default' | 'go' | 'off' | 'red' | 'redSolid';

/**
 * The mockup's `.btn` family. `redSolid`'s hover (#7d0004) is a one-off
 * literal — there is no token a step darker than `danger`.
 */
export const PaneButton = styled(Button, { shouldForwardProp: transientOnly })<{
  $tone?: PaneButtonTone;
}>(({ $tone = 'default' }) => {
  const base = {
    flex: '0 0 auto',
    height: 36,
    minWidth: 0,
    fontFamily: componentTheme.fontSans,
    fontSize: paneType.body,
    lineHeight: 1,
    fontWeight: 800,
    // A control label — all-caps by rule (b), as every button in the app is.
    textTransform: 'uppercase' as const,
    letterSpacing: paneType.caps,
    padding: '0 14px',
    borderRadius: '6px',
    borderStyle: 'solid',
    borderWidth: 1,
    boxShadow: 'none',
    gap: 8,
    '&:focus-visible': {
      outline: `2px solid ${componentTheme.accent}`,
      outlineOffset: 1,
    },
  };

  switch ($tone) {
    case 'go':
      // White on rust measures 5.59:1 — the same pairing the design system's
      // contained button already ships.
      return {
        ...base,
        background: componentTheme.accent,
        borderColor: componentTheme.accent,
        color: '#ffffff',
        '&:hover': {
          background: componentTheme.accentEmphasis,
          borderColor: componentTheme.accentEmphasis,
          boxShadow: 'none',
        },
        '&.Mui-disabled': {
          background: componentTheme.bgInset,
          borderColor: componentTheme.borderDefault,
          color: componentTheme.fgMuted,
        },
      };
    case 'off':
      return {
        ...base,
        background: componentTheme.bgInset,
        borderColor: componentTheme.borderDefault,
        color: componentTheme.fgMuted,
        cursor: 'not-allowed',
        '&:hover': { background: componentTheme.bgInset },
        '&.Mui-disabled': {
          background: componentTheme.bgInset,
          borderColor: componentTheme.borderDefault,
          color: componentTheme.fgMuted,
        },
      };
    case 'red':
      return {
        ...base,
        background: componentTheme.bgDefault,
        borderColor: componentTheme.danger,
        color: componentTheme.danger,
        '&:hover': { background: componentTheme.dangerFaint },
        '&.Mui-disabled': {
          background: componentTheme.bgInset,
          borderColor: componentTheme.borderDefault,
          color: componentTheme.fgMuted,
        },
      };
    case 'redSolid':
      return {
        ...base,
        background: componentTheme.danger,
        borderColor: componentTheme.danger,
        color: '#ffffff',
        '&:hover': { background: '#7d0004', borderColor: '#7d0004' },
        '&.Mui-disabled': {
          background: componentTheme.bgInset,
          borderColor: componentTheme.borderDefault,
          color: componentTheme.fgMuted,
        },
      };
    default:
      // Inside the confirm block the neutral button keeps the pane background
      // rather than inheriting the block's danger wash — the mockup's own
      // `.cf .btn:not(.btn-red-solid)` specificity fix.
      return {
        ...base,
        background: componentTheme.bgDefault,
        borderColor: componentTheme.fgMuted,
        color: componentTheme.fgDefault,
        '&:hover': { background: componentTheme.bgInset },
        '&.Mui-disabled': {
          background: componentTheme.bgInset,
          borderColor: componentTheme.borderDefault,
          color: componentTheme.fgMuted,
        },
      };
  }
});

/** The footer's release-name field (`.inp`). */
export const NameInput = styled(TextField)({
  flex: '1 1 auto',
  minWidth: 0,
  '& .MuiInputBase-root': {
    height: 36,
    fontFamily: componentTheme.fontMono,
    // The field holds a release NAME, so it takes the subject size the pane
    // prints release names at everywhere else.
    fontSize: paneType.subject,
    lineHeight: 1.3,
    color: componentTheme.fgDefault,
    background: componentTheme.bgDefault,
    borderRadius: '6px',
    padding: 0,
  },
  '& .MuiInputBase-input': { padding: '0 9px', height: 36, boxSizing: 'border-box' },
  // Browsers fade placeholders by default; the design pins it so the measured
  // contrast is the rendered contrast.
  '& .MuiInputBase-input::placeholder': { color: componentTheme.fgMuted, opacity: 1 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: componentTheme.fgMuted },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: componentTheme.fgMuted },
  '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: componentTheme.accent,
    borderWidth: 1,
  },
});

// ============================================================================
// DIFF PANEL
// ============================================================================
export const UnitBlock = styled(Box)({
  borderBottom: `1px solid ${componentTheme.borderMuted}`,
  padding: `12px ${PANE_PX}px 14px`,
  '&:last-of-type': { borderBottom: 0 },
});

export const UnitHead = styled(Box)({
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  margin: '0 0 8px',
});

/** One-word data label ('Deployment', 'ConfigMap') — all-caps by rule (c). */
export const UnitKind = styled('span')({
  fontFamily: componentTheme.fontSans,
  fontSize: paneType.body,
  lineHeight: 1.3,
  textTransform: 'uppercase',
  letterSpacing: paneType.caps,
  fontWeight: 700,
  color: componentTheme.fgMuted,
  flex: '0 0 auto',
});

/**
 * Typography of the per-unit header name, shared by the linked and the plain
 * rendering so the two are pixel-identical: a unit whose id cannot be resolved
 * (deleted since the release was cut) must read as the same kind of thing as
 * every other unit, only as one you cannot click.
 */
const unitNameType: CSSObject = {
  ...subjectType,
  margin: 0,
  minWidth: 0,
};

export const UnitName = styled('p')(unitNameType);

/**
 * The same header name, as a link to the unit's details page.
 *
 * Rust stays action-only (module rule 2): the resting and hover states carry NO
 * colour change at all — the affordance is an underline drawn in an existing
 * foreground token (fgSubtle at rest under the pointer, fgMuted on hover), so
 * nothing here can be read as encoding a status on the unit. Accent appears
 * only on the focus ring, which is exactly how `PaneButton` already spends it.
 */
export const UnitNameLink = styled('a')({
  ...unitNameType,
  textDecoration: 'none',
  textUnderlineOffset: 2,
  textDecorationColor: componentTheme.fgSubtle,
  transition: 'text-decoration-color .12s',
  '&:hover': {
    textDecoration: 'underline',
    textDecorationColor: componentTheme.fgMuted,
  },
  '&:focus-visible': {
    textDecoration: 'underline',
    textDecorationColor: componentTheme.fgMuted,
    outline: `2px solid ${componentTheme.accent}`,
    outlineOffset: 2,
    borderRadius: 3,
  },
});

export const UnitCount = styled('span')({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontFamily: componentTheme.fontMono,
  fontSize: paneType.body,
  lineHeight: 1.3,
  color: componentTheme.fgMuted,
  fontVariantNumeric: 'tabular-nums',
});

/** "added in rel-N" — the never-released marker, carried over from the old section. */
export const UnitBadge = styled('span')({
  flex: '0 0 auto',
  fontFamily: componentTheme.fontSans,
  fontSize: paneType.secondary,
  fontWeight: 600,
  color: componentTheme.attentionEmphasis,
  background: componentTheme.attentionMuted,
  borderRadius: 999,
  padding: '1px 8px',
  whiteSpace: 'nowrap',
});
export const EmptyBlock = styled(Box)({
  padding: `16px ${PANE_PX}px 20px`,
});

/**
 * The diff panel's answer when there is nothing to draw: "0 differences", or
 * "Unavailable" when the comparison could not be fetched.
 *
 * It is the SUBJECT of the empty block — the same treatment a release name or
 * a unit slug gets — and no longer 30px display type with negative tracking.
 * A statement that nothing changed is the least eventful thing this panel can
 * say, and it was set larger than anything else in the tab.
 *
 * Its sub-line is `Sub`, which is where the sentence beneath it ("Identical
 * declared values") lives.
 */
export const EmptyValue = styled('p')({
  ...subjectType,
  margin: 0,
});

/** Screen-reader-only text — carries the per-unit link's "opens in a new tab" hint. */
export const VisuallyHidden = styled('span')({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
});
