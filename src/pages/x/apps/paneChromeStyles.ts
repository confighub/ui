// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The shared styles of the Components drawer's chrome rows and their light menus.

import { tokens } from '@/components/theme-provider/ThemeProvider';

import { componentTheme as t } from './componentTheme';

/** The height of the title row. */
export const TITLE_ROW_HEIGHT = 48;

/** The height of the filter row. */
export const FILTER_ROW_HEIGHT = 40;

/** The round 28px icon button of the title row. */
export const roundIconButtonSx = (pressed = false) =>
  ({
    width: 28,
    height: 28,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    p: 0,
    border: `1px solid ${pressed ? tokens.rustLine : t.borderDefault}`,
    borderRadius: '50%',
    color: pressed ? t.accent : t.fgMuted,
    backgroundColor: pressed ? t.accentMuted : t.bgDefault,
    cursor: 'pointer',
    '& svg': { fontSize: 15 },
    '&:hover': { backgroundColor: pressed ? t.accentMuted : t.bgInset, color: pressed ? t.accent : t.fgDefault },
    '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '2px' },
  }) as const;

/** The square, quiet icon button of the filter row. */
export const quietIconButtonSx = {
  width: 28,
  height: 28,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  p: 0,
  border: 0,
  borderRadius: `${t.radiusSm}px`,
  background: 'none',
  color: t.fgSubtle,
  cursor: 'pointer',
  '& svg': { fontSize: 16 },
  '&:hover': { backgroundColor: t.bgInset, color: t.fgMuted },
  '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '-2px' },
} as const;

/** The light card of a chrome menu. */
export const chromeMenuPaperSx = {
  mt: '4px',
  minWidth: 220,
  border: `1px solid ${t.borderDefault}`,
  borderRadius: `${t.radiusMd}px`,
  boxShadow: t.shadowMd,
  '& .MuiList-root': { p: '4px' },
} as const;

/** A menu heading, on a ListSubheader so the menu's keyboard focus skips it. */
export const menuHeadingSx = {
  lineHeight: 'normal',
  background: 'none',
  fontFamily: t.fontSans,
  fontSize: 11,
  fontWeight: 700,
  color: t.fgSubtle,
  p: '8px 10px 4px',
} as const;

export const menuItemSx = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minHeight: 30,
  p: '4px 10px',
  borderRadius: `${t.radiusSm}px`,
  fontFamily: t.fontSans,
  fontSize: 12.5,
  color: t.fgDefault,
  '& .mi-icon': { fontSize: 14, color: t.fgSubtle, flexShrink: 0 },
  '& .mi-ext': { fontSize: 12, color: t.fgSubtle, ml: 'auto' },
  '& .mi-text': { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& .mi-text.mono': { fontFamily: t.fontMono, fontSize: 12 },
  '&:hover': { backgroundColor: t.bgInset },
  '&[aria-checked="true"]': { color: t.accent, backgroundColor: tokens.rustSoft, '& .mi-icon': { color: t.accent } },
  '&.Mui-focusVisible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '-2px', backgroundColor: t.bgInset },
} as const;
