// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The draft page's shared styles: the detail view's tokens, composed into the few shapes
 * the summary card repeats (chips, the facts you can change, popovers). Every colour and size
 * is a token from `changeOrdersTokens`; the shapes are named here once so
 * the facts, the sticky bar and the popovers cannot drift apart.
 */

import type { SxProps, Theme } from '@mui/material/styles';

import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderFontMono,
  changeOrderFontSans,
  changeOrderInk,
  changeOrderSelectedRing,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';

/** One easing for every state change on the page: quick out, no bounce. */
export const DRAFT_EASE = 'cubic-bezier(.32,.72,0,1)';

/** Colour, border and shadow move together; nothing animates layout. */
export const DRAFT_TRANSITION = ['background-color', 'border-color', 'color', 'box-shadow', 'transform']
  .map((property) => `${property} .18s ${DRAFT_EASE}`)
  .join(',');

/** A control's keyboard ring: 2px solid rust, outside the control. 5.59:1 on white. */
export const FOCUS_RING = {
  outline: `2px solid ${changeOrderAction.focus}`,
  outlineOffset: 2,
} as const;

/** A control whose popover is open reads as pressed. */
export const OPEN_PRESSED = { '&[aria-expanded="true"]': { background: changeOrderSurface.inset } } as const;

/** The media query of those who ask for less motion. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Press feedback, held back for those who ask for less motion. */
export const PRESS = {
  '&:active': { transform: 'scale(.98)' },
  [`@media ${REDUCED_MOTION}`]: { transition: 'none', '&:active': { transform: 'none' } },
} as const;

/** A `<button>` with the browser's own look taken off, for controls drawn as chips and rows. */
export const BARE_BUTTON = {
  appearance: 'none',
  border: 0,
  margin: 0,
  padding: 0,
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
} as const;

/** Inline code: a container or field name inside running text. */
export const CODE_SX = {
  fontFamily: changeOrderFontMono,
  fontSize: 11,
  background: changeOrderSurface.inset,
  borderRadius: `${changeOrderShape.radius.sm}px`,
  padding: '0 3px',
  whiteSpace: 'nowrap',
} as const;

/** The class of a fact slot's value: the text that sits on the slot's dashed rule. */
export const FACT_SLOT_VALUE = 'draft-fact-slot-value';

/**
 * A fact the draft can change: the detail view's fact value on a dashed rule, a chevron, and a
 * popover under it. A value this draft changes from last time has its rule in rust; the chevron
 * turns over while the popover is open.
 */
export const FACT_SLOT_SX = {
  ...BARE_BUTTON,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1px',
  maxWidth: '100%',
  minWidth: 0,
  margin: 0,
  padding: '0 1px 0 3px',
  borderRadius: '4px',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
  transition: DRAFT_TRANSITION,
  [`& .${FACT_SLOT_VALUE}`]: {
    whiteSpace: 'nowrap',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    // Room under the text for the rule, which `overflow` would otherwise clip.
    paddingBottom: '5px',
    marginBottom: '-5px',
    textDecoration: `underline dashed ${changeOrderBorder.strong}`,
    textDecorationThickness: '1px',
    textUnderlineOffset: '4px',
    transition: `text-decoration-color .18s ${DRAFT_EASE}`,
  },
  '& > .MuiSvgIcon-root': { fontSize: 16, flex: 'none', color: changeOrderInk.subtle, transition: `transform .18s ${DRAFT_EASE}` },
  '&:hover': { background: changeOrderSurface.sunk },
  [`&:hover .${FACT_SLOT_VALUE}`]: { textDecorationColor: changeOrderInk.subtle },
  // One pixel off, not two: the ring clears the term above it.
  '&:focus-visible': { ...FOCUS_RING, outlineOffset: 1 },
  '&[aria-expanded="true"]': { background: changeOrderSurface.inset },
  '&[aria-expanded="true"] > .MuiSvgIcon-root': { transform: 'rotate(180deg)' },
  [`&[data-changed] .${FACT_SLOT_VALUE}`]: { textDecorationColor: changeOrderAction.line },
  ...PRESS,
  [`@media ${REDUCED_MOTION}`]: {
    transition: 'none',
    '&:active': { transform: 'none' },
    '& > .MuiSvgIcon-root': { transition: 'none' },
  },
} as const;

/** A slug or a code word as a fact's value: the detail view's mono, a size under the prose around it. */
export const FACT_MONO_SX = {
  fontFamily: changeOrderFontMono,
  fontSize: changeOrderType.size.body,
  letterSpacing: '-.01em',
} as const;

/** The popover's own chrome: a light card over the page. */
export const POPOVER_PAPER_SX: SxProps<Theme> = {
  boxSizing: 'border-box',
  borderRadius: `${changeOrderShape.radius.xl}px`,
  border: `1px solid ${changeOrderBorder.default}`,
  padding: '6px',
  minWidth: 240,
  maxWidth: 380,
  fontSize: changeOrderType.size.body,
  lineHeight: changeOrderType.lineHeight.body,
  color: changeOrderInk.default,
  // A popover renders outside the page's root, so it does not inherit the page's face.
  fontFamily: changeOrderFontSans,
};

/** A choice in a popover: a full-width row, the chosen one ringed. */
export const OPTION_SX = {
  ...BARE_BUTTON,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  width: '100%',
  padding: '7px 8px',
  borderRadius: `${changeOrderShape.radius.md}px`,
  transition: DRAFT_TRANSITION,
  '&:hover, &:focus-visible': { background: changeOrderSurface.sunk },
  '&:focus-visible': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: -2 },
  '&[aria-checked="true"]': { boxShadow: changeOrderSelectedRing, background: changeOrderAction.soft },
  '& > .MuiSvgIcon-root': { fontSize: 17, color: changeOrderInk.subtle, marginTop: '1px' },
} as const;

/** How far a problem's edge hangs left of its column, so the words stay on the column's line. */
const PROBLEM_EDGE_HANG = 11;

/**
 * Words about a problem, hung so that the one the blocker beside Create names (`next`) can carry
 * the rust leading edge: a shape, so it never rests on rust vs amber. The words do not move when
 * it comes and goes.
 */
export function problemEdgeSx(next: boolean) {
  return {
    marginLeft: `-${PROBLEM_EDGE_HANG}px`,
    paddingLeft: `${PROBLEM_EDGE_HANG}px`,
    boxShadow: next ? `inset ${changeOrderShape.leadingEdge}px 0 0 ${changeOrderAction.ink}` : 'none',
    transition: 'box-shadow .18s',
  } as const;
}

/**
 * A part of the summary card the keyboard is sent to when what fixes its problem is not drawn:
 * no ring of its own until then.
 */
export const PLACE_SX = {
  outline: 'none',
  borderRadius: '4px',
  '&:focus-visible': { ...FOCUS_RING, outlineOffset: 4 },
} as const;

/** The dry run's figure, "6 of 8 same": the loudest number on the page. */
export const FIGURE_SX = {
  fontSize: 26,
  fontWeight: changeOrderType.weight.bold,
  letterSpacing: '-.02em',
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
} as const;

/** The sticky Create bar's lift: the card's own shadow, cast upward, as the bar sits over the page. */
export const STICKY_BAR_SHADOW = changeOrderCardTokens.shadow.replace(/0 (\d+)px/g, '0 -$1px');
