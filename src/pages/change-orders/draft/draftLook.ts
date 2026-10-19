// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The draft page's shared styles: the detail view's tokens, composed into the few shapes
 * the summary card repeats (chips, popovers, the ledger's grid). Every colour and size is a
 * token from `changeOrdersTokens` or `componentTheme`; the shapes are named here once so the
 * ledger, the sticky bar and the popovers cannot drift apart.
 */

import type { SxProps, Theme } from '@mui/material/styles';

import { componentTheme } from '../../x/apps/componentTheme';
import {
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderFontMono,
  changeOrderFontSans,
  changeOrderInk,
  changeOrderSelectedRing,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import type { DraftDecisionOrigin } from './draftTypes';

/** One easing for every state change on the page: quick out, no bounce. */
export const DRAFT_EASE = 'cubic-bezier(.32,.72,0,1)';

/** Colour, border and shadow move together; nothing animates layout. */
export const DRAFT_TRANSITION = ['background-color', 'border-color', 'color', 'box-shadow', 'transform']
  .map((property) => `${property} .18s ${DRAFT_EASE}`)
  .join(',');

/** A control's keyboard ring: the accent line, outside the control. */
export const FOCUS_RING = {
  outline: `2px solid ${changeOrderStatus.accent}`,
  outlineOffset: 2,
} as const;

/** A control whose popover is open reads as pressed. */
export const OPEN_PRESSED = { '&[aria-expanded="true"]': { background: changeOrderSurface.inset } } as const;

/** Press feedback, held back for those who ask for less motion. */
export const PRESS = {
  '&:active': { transform: 'scale(.98)' },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:active': { transform: 'none' } },
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

/**
 * The ledger's columns: the decision's name, last time, the arrow, this time, and the revert.
 * The right side is wider because it holds the controls.
 */
export const LEDGER_COLUMNS = '96px minmax(0,1fr) 22px minmax(0,1.6fr) 34px';

/** Inline code: a container or field name inside running text. */
export const CODE_SX = {
  fontFamily: changeOrderFontMono,
  fontSize: 11,
  background: changeOrderSurface.inset,
  borderRadius: `${changeOrderShape.radius.sm}px`,
  padding: '0 3px',
  whiteSpace: 'nowrap',
} as const;

/** A value from last time that this draft changes: struck, quiet. */
export const STRUCK_QUIET_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: changeOrderType.size.body,
  color: changeOrderInk.subtle,
  textDecoration: 'line-through',
  textDecorationColor: changeOrderBorder.strong,
} as const;

/** A value from last time that this draft changes, in a row that marks its difference. */
export const STRUCK_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: changeOrderType.size.body,
  color: componentTheme.danger,
  textDecoration: 'line-through',
  textDecorationColor: componentTheme.dangerEdge,
} as const;

/** A value as last time, unchanged. */
export const SAME_VALUE_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: changeOrderType.size.body,
  color: changeOrderInk.muted,
} as const;

/** A value this draft sets. */
export const NOW_VALUE_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 13,
  fontWeight: changeOrderType.weight.strong,
  color: changeOrderInk.default,
} as const;

/** The pill-shaped control of the Same row and the template picker. */
export const PILL_SX = {
  ...BARE_BUTTON,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  height: 24,
  padding: '0 6px 0 7px',
  borderRadius: `${changeOrderShape.radius.pill}px`,
  border: `1px solid ${changeOrderBorder.default}`,
  background: changeOrderSurface.card,
  fontSize: 12,
  color: changeOrderInk.muted,
  whiteSpace: 'nowrap',
  transition: DRAFT_TRANSITION,
  '&:hover': { borderColor: changeOrderBorder.strong },
  '&:focus-visible': FOCUS_RING,
  '& .MuiSvgIcon-root': { fontSize: 14, color: changeOrderInk.subtle },
  ...OPEN_PRESSED,
  ...PRESS,
} as const;

/** An inline control that reads as the value it edits: dotted underline, no box. */
export const FIELD_BUTTON_SX = {
  ...BARE_BUTTON,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  borderRadius: '4px',
  padding: '0 2px',
  marginLeft: '-2px',
  textDecoration: `underline dotted ${changeOrderBorder.strong}`,
  textUnderlineOffset: '3px',
  whiteSpace: 'nowrap',
  transition: DRAFT_TRANSITION,
  '&:hover': { background: changeOrderSurface.sunk },
  '&:focus-visible': FOCUS_RING,
  ...OPEN_PRESSED,
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
  '&:focus-visible': { outline: `2px solid ${changeOrderStatus.accent}`, outlineOffset: -2 },
  '&[aria-checked="true"]': { boxShadow: changeOrderSelectedRing, background: changeOrderStatus.accentSoft },
  '& > .MuiSvgIcon-root': { fontSize: 17, color: changeOrderInk.subtle, marginTop: '1px' },
} as const;

/** Where a decision's value came from: icon tile colours. */
export const PROVENANCE_TONE: Record<DraftDecisionOrigin, { bg: string; fg: string }> = {
  last: { bg: changeOrderSurface.inset, fg: changeOrderInk.muted },
  policy: { bg: changeOrderStatus.accentSoft, fg: changeOrderStatus.accent },
  you: { bg: changeOrderStatus.successGround, fg: changeOrderStatus.success },
};

/** A row's two sides when it differs from last time. */
export const WAS_GROUND = componentTheme.dangerFaint;
export const NOW_GROUND = componentTheme.successFaint;

/** The figure in the Where row: the loudest number on the page. */
export const FIGURE_SX = {
  fontSize: 26,
  fontWeight: changeOrderType.weight.bold,
  letterSpacing: '-.02em',
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
} as const;

/** The sticky Create bar's lift: the card's own shadow, cast upward, as the bar sits over the page. */
export const STICKY_BAR_SHADOW = changeOrderCardTokens.shadow.replace(/0 (\d+)px/g, '0 -$1px');
