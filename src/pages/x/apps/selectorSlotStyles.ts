// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The slot-row primitives: chips, the empty square, the gutter and its swap,
 * the picker sheet that drops below rather than over.
 *
 * Two surfaces draw this row — the Releases tab compares two releases, the
 * Configuration tab compares N deployments — and they must not drift apart,
 * because a reader who learns the shape on one is entitled to it on the other.
 * The two components differ in what a slot HOLDS and how many there are; they
 * do not differ in what a slot LOOKS like, so only the looks live here.
 */

import { keyframes } from '@mui/material/styles';

import { componentTheme } from './componentTheme';

export const SLOTS_SX = {
  position: 'relative',
  flex: 'none',
  display: 'flex',
  alignItems: 'stretch',
  gap: 0,
  padding: '10px 12px 11px',
  background: componentTheme.bgSubtle,
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
} as const;

/**
 * The CSS container name every slot shares.
 *
 * One name across both surfaces, so `@container` rules written against a slot
 * hold wherever a slot is drawn. Renaming it per surface would let one of them
 * silently stop responding.
 */
export const SLOT_CONTAINER_NAME = 'releaseslot';

/**
 * Slot content-box width below which the badge goes rather than the label
 * giving up characters.
 *
 * The rule this follows is the pane's own, set by the image rows: degrade by
 * PRIORITY and surrender identity LAST. A label reading `rel…` tells a reader
 * nothing, and it was the CURRENT release that truncated — so the one release
 * the reader could not name was the one the chip was pointing at.
 *
 * IN CONTENT-BOX PIXELS, like `DIGEST_PREFIX_MIN_ROW`: `container-type:
 * inline-size` queries the content box, so this excludes the slot's own border
 * and padding.
 *
 * DERIVED FROM THE LAYOUT, NOT YET MEASURED IN A BROWSER. At the pane's
 * narrowest the two slots and the 46px gutter divide about 356px, giving a slot
 * content box near 153px; at 575 the same arithmetic gives about 235px. 200
 * sits between them. The chip costs roughly 52px plus its gap, which is the
 * difference between a label that fits and one that clips.
 */
export const SLOT_BADGE_MIN = 200;

export const SLOT_SX = {
  flex: '1 1 0',
  minWidth: 0,
  containerType: 'inline-size',
  containerName: SLOT_CONTAINER_NAME,
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: `${componentTheme.radiusMd}px`,
  boxShadow: componentTheme.shadowSm,
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'left',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
  '&:hover': { borderColor: componentTheme.borderEdge },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '1px' },
  '&[aria-expanded="true"]': {
    borderColor: componentTheme.accent,
    boxShadow: `0 0 0 3px ${componentTheme.accentMuted}`,
  },
} as const;

/** Something not yet published — a working configuration, an unreleased deployment — says so before it is read. */
export const SLOT_DECLARED_SX = {
  borderStyle: 'dashed',
  borderColor: componentTheme.attentionMuted,
  background: componentTheme.attentionMuted,
} as const;

export const LETTER_SX = {
  flex: 'none',
  width: 16,
  height: 16,
  borderRadius: '4px',
  display: 'grid',
  placeItems: 'center',
  fontFamily: componentTheme.fontMono,
  fontSize: 9.5,
  fontWeight: 700,
  color: componentTheme.fgOnEmphasis,
} as const;

export const TAG_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 12.5,
  fontWeight: 700,
  color: componentTheme.fgDefault,
  flex: '0 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export const META_SX = {
  padding: '2px 8px 7px',
  fontFamily: componentTheme.fontMono,
  fontSize: 10,
  color: componentTheme.fgMuted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

export const NAME_SX = {
  padding: '1px 8px 0',
  fontSize: 11.5,
  color: componentTheme.fgMuted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

export const BADGE_SX = {
  fontSize: 8.5,
  fontWeight: 800,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  padding: '1px 4px',
  borderRadius: '3px',
  flex: 'none',
  whiteSpace: 'nowrap',
} as const;

export const SLOT_TOP_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 8px 0',
  minWidth: 0,
} as const;

export const GUTTER_SX = {
  flex: 'none',
  width: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
} as const;

/** The hairline the swap button sits on, drawn behind it. */
export const GUTTER_RULE_SX = {
  position: 'absolute',
  left: 3,
  right: 3,
  top: '50%',
  height: '1px',
  background: componentTheme.borderEdge,
} as const;

export const SWAP_SX = {
  position: 'relative',
  width: 26,
  height: 26,
  borderRadius: '50%',
  border: `1px solid ${componentTheme.borderEdge}`,
  background: componentTheme.bgDefault,
  display: 'grid',
  placeItems: 'center',
  color: componentTheme.fgMuted,
  cursor: 'pointer',
  boxShadow: componentTheme.shadowSm,
  '&:hover': { color: componentTheme.accent, borderColor: componentTheme.accent },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '2px' },
  '&[disabled]': {
    opacity: 0.45,
    cursor: 'default',
    '&:hover': { color: componentTheme.fgMuted, borderColor: componentTheme.borderEdge },
  },
} as const;

/**
 * AN EMPTY SLOT: a 36px square, not a full-width chip.
 *
 * The pane is already comparing something — slot A against its own predecessor
 * on the Releases tab, this deployment against its upstream on the Configuration
 * tab — whether or not the next slot holds anything. So an empty slot is not a
 * missing value and must not be drawn as a hole the size of one. What it is, is
 * an invitation: pick something else to compare against. A chip-sized "Choose a
 * release" spends the pane's widest control on an instruction, and reads as a
 * broken half of a pair.
 *
 * DASHED IS NOT A NEW SIGNAL. `SLOT_DECLARED_SX` above already spends a dashed
 * border on "this is not yet a real published value", and this is the same
 * claim about a different thing.
 *
 * SMALL MEANS EMPTY, AND NOTHING ELSE. That is why a slot grows to full size the
 * moment it is filled — see `SLOT_FILLED_SX`.
 */
export const EMPTY_SLOT_SX = {
  width: 36,
  height: 36,
  flex: 'none',
  padding: 0,
  font: 'inherit',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  background: componentTheme.bgDefault,
  border: `1px dashed ${componentTheme.borderEdge}`,
  borderRadius: `${componentTheme.radiusMd}px`,
  boxShadow: componentTheme.shadowSm,
  color: componentTheme.fgSubtle,
  '&:hover': {
    borderStyle: 'solid',
    borderColor: componentTheme.accent,
    color: componentTheme.accent,
    background: componentTheme.accentMuted,
    boxShadow: `0 0 0 3px ${componentTheme.accentMuted}`,
  },
  '&:focus-visible': {
    outline: `2px solid ${componentTheme.accent}`,
    outlineOffset: '1px',
    borderStyle: 'solid',
    borderColor: componentTheme.accent,
    color: componentTheme.accent,
  },
  // The same ring a filled chip wears while its picker is open, so the two
  // shapes do not disagree about what "my sheet is open" looks like.
  '&[aria-expanded="true"]': {
    borderStyle: 'solid',
    borderColor: componentTheme.accent,
    color: componentTheme.accent,
    background: componentTheme.accentMuted,
    boxShadow: `0 0 0 3px ${componentTheme.accentMuted}`,
  },
} as const;

/** Centres the square in a row whose other children are full-height chips. */
export const EMPTY_SLOT_TRACK_SX = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
} as const;

/** The chip that has just been filled announces itself once, quietly. */
const fillIn = keyframes`
  from { opacity: .4; transform: translateY(-2px); }
  to   { opacity: 1;  transform: none; }
`;

/**
 * A slot's half of the row once it holds something — and the anchor its clear
 * control hangs off.
 *
 * A WRAPPER, BECAUSE A BUTTON CANNOT CONTAIN A BUTTON. The clear control is a
 * SIBLING of the chip, never a child: nesting it is invalid markup and the
 * browser resolves it by dropping one of the two.
 */
export const SLOT_FILLED_SX = {
  flex: '1 1 0',
  minWidth: 0,
  position: 'relative',
  display: 'flex',
  animation: `${fillIn} .16s cubic-bezier(.16,1,.3,1)`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
} as const;

/** 20px of paint; 32px of target, from the inset pseudo-element below. */
export const CLEAR_SLOT_SX = {
  position: 'absolute',
  top: '-7px',
  right: '-7px',
  zIndex: 3,
  width: 20,
  height: 20,
  padding: 0,
  font: 'inherit',
  cursor: 'pointer',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.borderEdge}`,
  boxShadow: componentTheme.shadowSm,
  color: componentTheme.fgMuted,
  // Small to the eye, not to the thumb.
  '&::after': { content: '""', position: 'absolute', inset: '-6px', borderRadius: '50%' },
  '&:hover': {
    color: componentTheme.danger,
    borderColor: componentTheme.dangerEdge,
    background: componentTheme.dangerHoverTint,
  },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '1px' },
} as const;

/**
 * The picker, BELOW the slots and never over them.
 *
 * Choosing what to compare means holding the other endpoints in mind, and a
 * menu that covers them makes the user hold them in their head instead.
 */
export const SHEET_SX = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: '100%',
  zIndex: 20,
  maxHeight: 340,
  background: componentTheme.bgDefault,
  borderTop: `1px solid ${componentTheme.borderEdge}`,
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
  boxShadow: componentTheme.shadowMd,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
} as const;

export const OPTION_SX = {
  display: 'flex',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: '7px 12px 9px',
  cursor: 'pointer',
  font: 'inherit',
  borderBottom: `1px solid ${componentTheme.borderMuted}`,
  flexDirection: 'column',
  '&:hover': { background: componentTheme.bgSubtle },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '-2px' },
  '&[aria-checked="true"]': {
    background: componentTheme.accentMuted,
    boxShadow: `inset 3px 0 0 ${componentTheme.accent}`,
  },
  '&[disabled]': { cursor: 'not-allowed', opacity: 0.55 },
} as const;
