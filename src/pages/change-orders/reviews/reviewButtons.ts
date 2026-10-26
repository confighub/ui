// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Button styles for the review UI.
 *
 * THE THEME'S PRIMARY IS FOR ACTIONS. Promote and Release are the theme's
 * contained primary, and the review actions that lead to them ("Go to promote",
 * "Go to release") are drawn the same way. Every review decision is outlined:
 * Approve and "Review now" in neutral ink with the strong border (the page's
 * Abort style), Reject in danger ink with the danger line border (the page's
 * Roll back style). A filled red or primary decision button would weigh a
 * review as heavily as a promotion.
 */

import { changeOrderBorder, changeOrderInk, changeOrderShape, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';

const base = {
  textTransform: 'none',
  fontWeight: changeOrderType.weight.semibold,
  borderRadius: `${changeOrderShape.radius.md}px`,
  boxShadow: 'none',
  whiteSpace: 'nowrap',
} as const;

/**
 * "Go to promote" and "Go to release": they lead to Promote and Release, so they
 * have their colour. Use with `variant="contained" color="primary"`, which gives
 * the fill and its hover from the theme; this sets only the band's shape.
 */
export const reviewPromoteButtonSx = {
  ...base,
  '&:hover': { boxShadow: 'none' },
} as const;

/** Reject submit and Reject confirm: outlined, danger ink, danger line border. */
export const reviewDangerButtonSx = {
  ...base,
  backgroundColor: changeOrderSurface.card,
  color: changeOrderStatus.danger,
  border: `1px solid ${changeOrderStatus.dangerLine}`,
  '&:hover': { backgroundColor: changeOrderStatus.dangerSoft, borderColor: changeOrderStatus.danger, boxShadow: 'none' },
} as const;

/**
 * The outlined neutral button: Approve submit and confirm, "Review now",
 * "Open review", "See who can", Cancel, and the disabled submit.
 */
export const reviewQuietButtonSx = {
  ...base,
  backgroundColor: changeOrderSurface.card,
  color: changeOrderInk.default,
  border: `1px solid ${changeOrderBorder.strong}`,
  '&:hover': { backgroundColor: changeOrderSurface.sunk, borderColor: changeOrderBorder.strong },
  '&.Mui-disabled': {
    backgroundColor: changeOrderSurface.inset,
    color: changeOrderInk.subtle,
    borderColor: changeOrderBorder.strong,
  },
} as const;

/** The underlined text button: "Change my decision", "Keep my approval". */
export const reviewTextButtonSx = {
  all: 'unset',
  cursor: 'pointer',
  fontSize: changeOrderType.size.body,
  fontWeight: changeOrderType.weight.semibold,
  color: changeOrderInk.muted,
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  textDecorationColor: changeOrderBorder.strong,
  '&:hover': { color: changeOrderInk.default, textDecorationColor: changeOrderInk.subtle },
  '&:focus-visible': { outline: `2px solid ${changeOrderStatus.accent}`, outlineOffset: 2 },
} as const;

/** The accent text link: "Review ›", "3 Revisions". */
export const reviewLinkButtonSx = {
  all: 'unset',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: changeOrderType.size.body,
  fontWeight: changeOrderType.weight.semibold,
  color: changeOrderStatus.accent,
  '&:hover': { textDecoration: 'underline' },
  '&:focus-visible': { outline: `2px solid ${changeOrderStatus.accent}`, outlineOffset: 2 },
} as const;

/** The semantic tones of the review UI, from the ChangeOrder tokens. */
export type ReviewTone = 'ok' | 'warn' | 'bad' | 'idle' | 'accent';

export const REVIEW_TONE: Record<ReviewTone, { fg: string; bg: string; line: string }> = {
  ok: { fg: changeOrderStatus.success, bg: changeOrderStatus.successGround, line: changeOrderStatus.successLine },
  warn: { fg: changeOrderStatus.warn, bg: changeOrderStatus.warnSoft, line: changeOrderStatus.warnLine },
  bad: { fg: changeOrderStatus.danger, bg: changeOrderStatus.dangerSoft, line: changeOrderStatus.dangerLine },
  idle: { fg: changeOrderInk.muted, bg: changeOrderSurface.inset, line: changeOrderBorder.strong },
  accent: { fg: changeOrderStatus.accent, bg: changeOrderStatus.accentSoft, line: changeOrderStatus.accentLine },
};

