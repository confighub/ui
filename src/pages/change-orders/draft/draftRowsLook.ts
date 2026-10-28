// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The look of the rows a kind of change has under the What track. */

import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { BARE_BUTTON, DRAFT_TRANSITION, FOCUS_RING, OPEN_PRESSED, PRESS } from './draftLook';

/** The rows' label column: as wide as the longest label of any kind, so no control moves on a switch. */
export const LABEL_COLUMN = 64;

/** The rows: a label column, and the controls beside it. */
export const ROWS_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: `${LABEL_COLUMN}px minmax(0, 1fr)`,
  columnGap: '14px',
  rowGap: '8px',
  alignItems: 'start',
  marginTop: '10px',
} as const;

/** An inline picker: a value on a dotted rule and a chevron. */
export const PICK_SX = {
  ...BARE_BUTTON,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
  height: 26,
  padding: '0 2px',
  borderRadius: '4px',
  fontFamily: changeOrderFontMono,
  fontSize: changeOrderType.size.body,
  color: changeOrderInk.default,
  whiteSpace: 'nowrap',
  textDecoration: `underline dotted ${changeOrderBorder.strong}`,
  textUnderlineOffset: '4px',
  transition: DRAFT_TRANSITION,
  '& > .MuiSvgIcon-root': { fontSize: 16, color: changeOrderInk.subtle, textDecoration: 'none' },
  '&:hover': { background: changeOrderSurface.sunk },
  '&:focus-visible': FOCUS_RING,
  ...OPEN_PRESSED,
  ...PRESS,
} as const;
