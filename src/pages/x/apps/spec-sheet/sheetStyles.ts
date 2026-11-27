// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The sheet's styles, set once on its root and read by class name, so the many values of a
// large Unit mount plain elements. Tiers follow the width of the open Unit card (container
// queries), never the screen.
import { tokens } from '@/components/theme-provider/ThemeProvider';
import type { SxProps, Theme } from '@mui/material';

import { componentTheme as t } from '../componentTheme';
import { COMPARE_STAGED_TOKENS } from '../compare/rowTypeTokens';
import { HEADER_HEIGHT, HEADER_STICKY_TOP } from '../unitHeaderLayout';

/**
 * The sticky stack in the list, under the drawer's filter row: the open Unit's header, then the
 * part bar, whose active chip names the resource and part in view. The resource head scrolls
 * with its resource: it repeats what the active chip shows.
 */
const PART_BAR_TOP = HEADER_HEIGHT + HEADER_STICKY_TOP;
export const PART_BAR_HEIGHT = 43;
/** The list's (PaneContent's) top padding: sticky offsets start below it, scroll margins do not. */
const LIST_PADDING_TOP = 8;
/** How far the sticky stack reaches below the list's scroll edge. */
export const STICKY_STACK_PX = LIST_PADDING_TOP + PART_BAR_TOP + PART_BAR_HEIGHT;
/** Where a jump puts a section: 12px clear of the sticky stack, so its heading is not under it. */
export const SECTION_LAND_PX = STICKY_STACK_PX + 12;
/** The part bar stays under the Unit header (z 12) and over the values (z-index up to 10). */
const Z_PART_BAR = 11;

/** The block label column of the MEDIUM and WIDE tiers (an approved layout constant). */
export const BLOCK_LABEL_PX = 84;
/** Under this card width the block label goes above its block (NARROW). */
export const NARROW_MAX_PX = 559;
/** From this sheet width the sheet is WIDE: its sections are cards in two columns (cardColumns.ts). */
export const WIDE_MIN_PX = 840;

/**
 * The heading levels, in one place: the section heading (an icon, bold, more space above), the
 * label of a block that groups fields (Image, Env, Probes...: a small icon, fgDefault, 600, on
 * top of its content), and a plain field's label (Namespace, Labels: fgMuted, 400, beside its
 * value), so the three read as three levels.
 */
const HEADING_LEVELS = {
  '& .part > .phead': { pt: '20px' },
  '& .blk .blabel': { color: t.fgMuted, fontWeight: 400 },
  '& .blk.bhead .blabel': { color: t.fgDefault, fontWeight: 600, fontSize: 12.5 },
  '& .bicon': { width: 12, height: 12, flexShrink: 0, color: t.fgSubtle },
  // A heading block's label sits on top of its content, which takes the full row width; a
  // plain field (Namespace, Labels) stays a label and value row.
  '& .blk.bhead': { gridTemplateColumns: 'minmax(0, 1fr)', rowGap: '4px' },
  // One hairline between blocks (the `.blk + .blk` rule). For no rule between heading blocks,
  // add: '& .blk + .blk.bhead, & .blk.bhead + .blk': { borderTop: 'none' },
} as const;

export const sheetSx: SxProps<Theme> = {
  containerType: 'inline-size',
  position: 'relative',
  pb: 1,
  fontFamily: t.fontSans,
  color: t.fgDefault,
  '& [data-hidden="true"]': { display: 'none !important' },
  '& .res + .res': { borderTop: `2px solid ${t.borderDefault}` },
  // A resource upstream adds or deletes whole: a plus or minus on its head, its fields
  // drawn muted below it, never ticked one by one.
  '& .rhead .wtag': { display: 'inline-flex', alignItems: 'center', alignSelf: 'center', flexShrink: 0 },
  '& .rhead .wtag.added': { color: COMPARE_STAGED_TOKENS.add.fill },
  '& .rhead .wtag.deleted': { color: COMPARE_STAGED_TOKENS.delete.fill },
  '& .res.whole > :not(.rhead)': { opacity: 0.6 },
  // A search match: a 2px underline in the text colour, drawn by the browser
  // (searchHighlight.ts). Not rust, so it does not read as a link; not a fill, so it never
  // reads as the ground of a staged value.
  '& ::highlight(sheet-search)': {
    textDecorationLine: 'underline',
    textDecorationColor: t.fgDefault,
    textDecorationThickness: '2px',
  },
  '& .partbar': {
    position: 'sticky',
    top: PART_BAR_TOP,
    zIndex: Z_PART_BAR,
    bgcolor: t.bgDefault,
    height: PART_BAR_HEIGHT,
    boxSizing: 'border-box',
    borderBottom: `1px solid ${t.borderMuted}`,
  },
  '& .partnav': {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    px: 1.5,
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  // The arrow at an edge with more chips past it: a plate in the bar's ground over the edge,
  // with one hairline on the side that faces the chips. It covers the cut part of a chip; the
  // snap keeps a cut no wider than the plate (PartBar's ARROW_PLATE_PX).
  '& .pscroll': {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    p: 0,
    border: 'none',
    bgcolor: t.bgDefault,
    color: t.fgMuted,
    cursor: 'pointer',
    '&:hover': { color: t.fgDefault },
    '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '-3px' },
  },
  '& .pscroll-back': { left: 0, borderRight: `1px solid ${t.borderMuted}` },
  '& .pscroll-more': { right: 0, borderLeft: `1px solid ${t.borderMuted}` },
  '& .pspacer': { flexShrink: 0, alignSelf: 'stretch', width: 0, ml: '-4px' },
  '& .pchip': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: 26,
    maxWidth: 220,
    px: '9px',
    borderRadius: `${t.radiusSm}px`,
    border: '1px solid transparent',
    background: 'none',
    fontFamily: t.fontSans,
    fontSize: 12,
    fontWeight: 600,
    color: t.fgMuted,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    flexShrink: 0,
    '&:hover': { bgcolor: t.bgInset, color: t.fgDefault },
    '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '-2px' },
  },
  '& .pchip.on': { color: t.accent, bgcolor: tokens.rustSoft, boxShadow: tokens.shSelInset },
  '& .pchip.res': { color: t.fgDefault },
  '& .pchip.on.res': { color: t.accent },
  '& .pchip .kind': { width: 14, height: 14, color: t.fgSubtle, flexShrink: 0 },
  '& .pchip.on .kind': { color: t.accent },
  '& .pchip-text': { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
  '& .pchip b': { fontWeight: 700 },
  '& .rhead .kind': { width: 16, height: 16, color: t.fgDefault, flexShrink: 0, alignSelf: 'center' },
  '& .phead .kind': { width: 16, height: 16, color: t.fgMuted, flexShrink: 0 },
  '& .common': { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, px: 1.5, pt: 1.25, pb: 0.5 },
  '& .ctile': {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    p: '6px 10px 7px',
    border: `1px solid ${t.borderMuted}`,
    borderRadius: `${t.radiusMd}px`,
    bgcolor: t.bgDefault,
    textAlign: 'left',
    cursor: 'pointer',
    minWidth: 0,
    font: 'inherit',
    transition: 'border-color .12s, background .12s',
    '&:hover': { borderColor: t.accent, bgcolor: t.accentMuted },
    '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '2px' },
  },
  '& .ctile .cl': {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    // fgMuted, not fgSubtle: a 10px label needs 4.5:1 too.
    color: t.fgMuted,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  '& .ctile .cv': {
    fontFamily: t.fontMono,
    fontSize: 13,
    fontWeight: 600,
    color: t.fgDefault,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '& .ctile .dim': { color: t.fgMuted, fontWeight: 400 },
  '& .cut-narrow': { display: 'none' },
  '& .fold': {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    mx: 1.5,
    mb: 0.75,
    px: 1.25,
    py: 0.75,
    width: 'calc(100% - 24px)',
    borderRadius: `${t.radiusSm}px`,
    bgcolor: t.bgSubtle,
    border: 0,
    textAlign: 'left',
    cursor: 'pointer',
    color: t.fgMuted,
    fontSize: 12,
    minWidth: 0,
    '&:hover': { bgcolor: t.bgInset },
    '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '-2px' },
  },
  '& .fold svg': { width: 14, height: 14, color: t.fgSubtle, flexShrink: 0 },
  '& .fold .fv': { fontFamily: t.fontMono, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& .fold .dim': { color: t.fgMuted },
  '& .fold .n': { ml: 'auto', color: t.fgMuted, fontFamily: t.fontMono, fontSize: 11, whiteSpace: 'nowrap' },
  // A chip or a jump lands a section just under the sticky stack.
  '& .res, & .part': { scrollMarginTop: SECTION_LAND_PX },
  // A value the focus moves to (Tab, a tile) scrolls clear of the sticky stack too.
  '& .v[data-stage-key], & .v .item[data-stage-key]': { scrollMarginTop: SECTION_LAND_PX, scrollMarginBottom: 12 },
  '& .rhead': {
    position: 'relative',
    display: 'flex',
    alignItems: 'baseline',
    gap: 1,
    px: 1.5,
    pt: 1.5,
    pb: 1.25,
    borderBottom: `1px solid ${t.borderMuted}`,
    minWidth: 0,
    bgcolor: t.bgDefault,
  },
  '& .rkind': { fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' },
  '& .rname': {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& .rname .v': { fontSize: 14, color: t.fgDefault, fontWeight: 600 },
  '& .rapi': { fontFamily: t.fontMono, fontSize: 11, color: t.fgMuted, whiteSpace: 'nowrap' },
  '& .part': { pt: 0.5, pb: 0.75 },
  '& .part + .part': { borderTop: `1px solid ${t.borderDefault}` },
  '& .phead': {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    px: 1.5,
    pt: 1.5,
    pb: 0.75,
    minWidth: 0,
  },
  '& .pname': {
    fontSize: 14,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  '& .pkind': { fontSize: 12, color: t.fgMuted, whiteSpace: 'nowrap' },
  '& .blk': {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: `${BLOCK_LABEL_PX}px minmax(0, 1fr)`,
    columnGap: 1.5,
    py: '7px',
    pr: 1.5,
    pl: '14px',
    alignItems: 'start',
  },
  '& .blk + .blk': { borderTop: `1px solid ${t.borderSubtle}` },
  // The three levels of the sheet: section heading, heading block label, field label.
  ...HEADING_LEVELS,
  '& .blabel': {
    columnGap: '3px',
    fontSize: 12,
    fontWeight: 600,
    color: t.fgMuted,
    lineHeight: '22px',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '5px',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  // overflowX: clip keeps a long secret ref or key inside its block at any pane width.
  '& .bbody': { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25, overflowX: 'clip' },
  '& .v': {
    fontFamily: t.fontMono,
    fontSize: 12,
    lineHeight: '20px',
    color: t.fgMuted,
    borderRadius: '4px',
    px: '3px',
    py: '1px',
    mx: '-3px',
    cursor: 'default',
    overflowWrap: 'anywhere',
    unicodeBidi: 'isolate',
    outline: 'none',
  },
  '& .v:hover, & .v .item:hover': { bgcolor: t.bgInset },
  '& .v:focus-visible, & .v .item:focus-visible': {
    outline: `2px solid ${tokens.rustFocus}`,
    outlineOffset: 0,
  },
  '& .v .item': { borderRadius: '3px', outline: 'none' },
  '& .v.clamp1': {
    display: 'block',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '& .v.clamp2': {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  '& .v.here, & .v .item.here': { color: t.fgDefault, fontWeight: 600 },
  '& .v.unk, & .v .item.unk': {
    textDecoration: `underline dotted ${tokens.t4}`,
    textUnderlineOffset: '3px',
  },
  // The value with its marks: one 22px line, as a plain value's row is, whatever the inherited font.
  '& .vm': { display: 'inline', overflowWrap: 'anywhere', fontSize: 12, lineHeight: '22px' },
  '& .vm > .v': { display: 'inline' },
  '& .mk': {
    display: 'inline-flex',
    width: 11,
    height: 11,
    verticalAlign: '-1px',
    ml: 0.5,
    flexShrink: 0,
  },
  '& .mk svg': { width: 11, height: 11 },
  '& .marks': { display: 'inline-flex', alignItems: 'center' },
  '& .pmarks': { ml: 'auto', display: 'flex', gap: 0.5, alignSelf: 'center', flexShrink: 0 },
  '& .bbody > .v, & .bbody > .vm': { alignSelf: 'flex-start', maxWidth: '100%' },
  '& .blabel .mk': { ml: 0 },
  '& .inc': { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  '& .inc-row': { display: 'inline-flex', alignItems: 'center', minWidth: 0 },
  // An Incoming field draws one value in its place: what the field becomes, its changed
  // tokens marked; a deletion struck through; an addition on the add ground. A held-back change
  // keeps the current value. The other value is in the hover card.
  '& .inc-val': { display: 'inline-flex', alignItems: 'baseline', gap: '4px', minWidth: 0 },
  '& .inc-val .mk': { ml: 0, alignSelf: 'center', color: t.upgradeInk },
  '& .inc-val.held .mk': { color: t.heldInk },
  '& .v.inc-removed': { bgcolor: t.stagedDeleteGround, textDecoration: 'line-through', color: t.fgMuted },
  '& .inc-val:has(.inc-removed) .mk': { color: COMPARE_STAGED_TOKENS.delete.fill },
  '& .v.inc-added': { bgcolor: t.stagedAddGround, color: t.fgDefault, fontWeight: 700 },
  '& .inc-val:has(.inc-added) .mk': { color: COMPARE_STAGED_TOKENS.add.fill },
  '& .marks.chips .mk': { width: 18, height: 18, borderRadius: `${t.radiusSm}px`, alignItems: 'center', justifyContent: 'center', ml: 0.5 },
  '& .marks.chips .mk svg': { width: 11, height: 11 },
  '& .ctile .cl .marks': { ml: 'auto' },
  // The block's actions: a light bordered cluster at the right end of the block's first
  // row, over the values; a value's own cluster (z 9) covers it where they meet.
  '& .bactions': {
    display: 'none',
    position: 'absolute',
    top: 4,
    right: 8,
    zIndex: 8,
    alignItems: 'center',
    gap: '2px',
    p: '2px',
    bgcolor: t.bgDefault,
    border: `1px solid ${t.borderDefault}`,
    borderRadius: `${t.radiusSm}px`,
    boxShadow: t.shadowSm,
  },
  '& .blk:hover .bactions, & .blk:focus-within .bactions': { display: 'inline-flex' },
  // While a value's card is open, the card holds that value's actions; the block's cluster would
  // be a second set of buttons beside it, so it hides until the card closes.
  '& .blk:has([data-peek-open]) .bactions': { display: 'none' },
  '& .v[role="button"]': { cursor: 'text' },
  // A staged value is a 22px chip of its own, so its ground reads at a glance.
  // A staged value is a 22px chip: its ground grows by inline padding, so it never lifts the
  // value off its row or makes the row taller.
  '& .v.staged, & .v.added, & .v.removed': { py: '3px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' },
  '& .v.staged': { bgcolor: t.stagedEditGround, color: t.fgDefault },
  '& .v.added': { bgcolor: t.stagedAddGround, color: t.fgDefault, fontWeight: 700, textDecoration: 'none' },
  '& .v.removed': { bgcolor: t.stagedDeleteGround, textDecoration: 'line-through', color: t.fgMuted },
  '& .fedit': { display: 'inline-flex', flexDirection: 'column', gap: '2px', maxWidth: '100%', minWidth: 0 },
  '& .fedit-row': { display: 'inline-flex', alignItems: 'center', gap: '2px', maxWidth: '100%', minWidth: 0 },
  '& .fedit-prefix': { mr: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  '& .fedit-error': { color: t.danger, fontSize: 11.5, fontFamily: t.fontSans },
  '& .lit': { color: t.fgMuted, fontFamily: t.fontMono, fontSize: 12 },
  '& .ret': { color: tokens.t4, mx: '1px' },
  // Readable text in the sheet is never lighter than fgMuted (7.06:1 on white): fgSubtle
  // (2.86:1) is under the 4.5:1 that text needs, so it is kept for icons only. Keys (pull,
  // type, runAsUser, annotation keys) are text.
  '& .k': {
    fontSize: 12,
    color: t.fgMuted,
    lineHeight: '22px',
    // A dotted key wraps after a dot (Dotted); inside a segment only when the segment alone is
    // wider than its column. `anywhere` would also shrink the column to one letter.
    overflowWrap: 'break-word',
    maxWidth: 200,
  },
  '& .kv': {
    display: 'grid',
    gridTemplateColumns: 'minmax(64px, max-content) minmax(0, 1fr)',
    columnGap: 1.5,
    alignItems: 'start',
  },
  '& .kvr': { display: 'contents' },

  // Shapes. A row of a table is a subgrid, so its cells line up with the other rows and are
  // placed by column (`.c1`, `.c2`), whatever order the document gives them.
  '& .srow': {
    gridColumn: '1 / -1',
    display: 'grid',
    gridTemplateColumns: 'subgrid',
    alignItems: 'baseline',
    minWidth: 0,
  },
  '& .c1': { gridColumn: 1, gridRow: 1, minWidth: 0 },
  '& .c2': { gridColumn: 2, gridRow: 1, minWidth: 0 },
  // The shapes' glyphs carry meaning (Secret, ConfigMap, optional, true and false), so they keep
  // 3:1: fgMuted, not fgSubtle (2.86:1).
  '& .ic': {
    display: 'inline-flex',
    width: 12,
    height: 12,
    color: t.fgMuted,
    flexShrink: 0,
    alignSelf: 'center',
  },
  '& .ic svg': { width: 12, height: 12 },
  '& .line': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: '14px',
    rowGap: '2px',
    minWidth: 0,
  },
  '& .pair': {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '6px',
    minWidth: 0,
    maxWidth: '100%',
  },
  '& .pair > .k': { lineHeight: '20px', whiteSpace: 'normal' },
  '& .pair > .ic': { alignSelf: 'flex-start', mt: '4px' },
  '& .toks': { display: 'flex', flexWrap: 'wrap', gap: '4px 6px', minWidth: 0 },
  '& .tok': {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '5px',
    border: `1px solid ${t.borderMuted}`,
    borderRadius: `${tokens.rSm}px`,
    pl: '5px',
    pr: '6px',
    bgcolor: t.bgDefault,
    minWidth: 0,
    maxWidth: '100%',
  },
  '& .tok .v': { mx: 0, px: '1px', py: 0 },
  // A value that does not fit beside its key goes whole onto the next line of the token, not
  // split in the middle of a word.
  '& .tok.kvtok': { gap: 0, flexWrap: 'wrap' },
  // A key=value token: the key in fgMuted, the value in fgDefault, so the value reads first even
  // when it is inherited (set here, it is also bold).
  '& .tok.kvtok .v:not(.removed):not(.inc-removed)': { color: t.fgDefault },
  '& .tok > .ic': { width: 11, height: 11 },
  '& .tok > .ic svg': { width: 11, height: 11 },
  '& .tk': {
    fontFamily: t.fontMono,
    fontSize: 12,
    lineHeight: '20px',
    color: t.fgMuted,
    overflowWrap: 'anywhere',
    flexShrink: 1,
    minWidth: 0,
  },
  // A name in t3 (port, mount, volume), read first in its token or row.
  // A line of 12px values sets its own line height: with the inherited 16px font, its strut
  // made the line 2 to 4px taller than the values in it.
  '& .pn': { order: -1, minWidth: 0, fontSize: 12, lineHeight: '20px' },
  '& .pn .v': { color: t.fgMuted },
  '& .pn .v.here': { color: t.fgMuted },
  '& .kname': { fontSize: 12, lineHeight: '22px', maxWidth: 200 },
  // Image: the repository in t3, the image tag strong; the whole is one value that wraps.
  '& .iline': { order: 0, minWidth: 0, fontSize: 12, lineHeight: '20px' },
  '& .ipull': { order: 1 },
  '& .irepo': { color: t.fgMuted, fontWeight: 400 },
  '& .itag': { color: t.fgMuted },
  '& .v.here .itag': { color: t.fgDefault },
  // Tables of numbers: resources and probes.
  '& .grid': { display: 'grid', columnGap: '14px', alignItems: 'baseline', minWidth: 0 },
  '& .rgrid .srow': { fontSize: 12, lineHeight: '20px' },
  '& .grid .h': {
    fontSize: 11,
    fontWeight: 600,
    color: t.fgMuted,
    lineHeight: '18px',
    whiteSpace: 'nowrap',
  },
  '& .grid .rl': { fontSize: 12, color: t.fgMuted, lineHeight: '22px', whiteSpace: 'nowrap' },
  '& .grid .num': { textAlign: 'right', justifySelf: 'end', whiteSpace: 'nowrap' },
  '& .none': { color: tokens.t4, fontFamily: t.fontMono, fontSize: 12, lineHeight: '22px' },
  '& .c2span': { gridColumn: '2 / -1' },
  '& .pcheck': { minWidth: 0 },
  '& .check': { display: 'flex', alignItems: 'baseline', gap: '4px', minWidth: 0 },
  '& .check .cmd': { minWidth: 0, flex: 1 },
  '& .check .cport': { order: 1, whiteSpace: 'nowrap', flexShrink: 0 },
  '& .check .cpath': { order: 2, minWidth: 0, flex: 1 },
  '& .check .cother': { order: 3 },
  '& .pextra': { gridColumn: '2 / -1' },
  // Env: name / value table.
  '& .env': {
    display: 'grid',
    // The name column takes only the width its names need, up to 40% of the row; a longer name
    // wraps after an underscore. The value column keeps the rest, so a key reference fits more.
    gridTemplateColumns: 'fit-content(40%) minmax(0, 1fr)',
    columnGap: 1.5,
    alignItems: 'baseline',
  },
  '& .en': {
    fontFamily: t.fontMono,
    fontSize: 11.5,
    color: t.fgMuted,
    lineHeight: '22px',
    minWidth: 0,
  },
  // A long name wraps after an underscore (BreakAfter) and is never cut.
  '& .en .v': { fontSize: 11.5, lineHeight: '20px' },
  '& .ev': {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    minWidth: 0,
    flexWrap: 'wrap',
  },
  // A key reference is one unit on one line: icon, name / key, optional. No part shrinks or is
  // cut. Where it does not fit beside the name (EnvShape measures it), the whole reference goes
  // on a row of its own under the name, indented; only there, if it is wider than the row, does
  // it wrap, after its separators.
  '& .ev.secret': { flexWrap: 'nowrap', '& > *': { flexShrink: 0 } },
  '& .ev.secret.under': { gridColumn: '1 / -1', gridRow: 2, pl: 2, flexWrap: 'wrap' },
  '& .ev.secret > .ic': { order: 0 },
  '& .ev.secret .sname': { order: 1 },
  '& .ev.secret .sep': {
    order: 2,
    color: tokens.t4,
    fontFamily: t.fontMono,
    fontSize: 12,
  },
  '& .ev.secret .skey': {
    order: 3,
    display: 'inline-flex',
    gap: '4px',
    alignItems: 'baseline',
  },
  '& .ev.secret .sopt.loose': { order: 4 },
  '& .ev.secret .sother': { order: 5 },
  '& .sopt': { display: 'inline-flex', alignSelf: 'center', flexShrink: 0 },
  '& .sopt .v': { display: 'inline-flex', p: '2px', mx: 0 },
  // Security: flags first, then the pairs on a line of their own (CSS order).
  '& .flags': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: '4px 6px',
    minWidth: 0,
  },
  '& .flags > .flag': { order: 0 },
  '& .flags > .fbreak': { order: 1, flexBasis: '100%', height: 0 },
  '& .flags > .fpair': { order: 2, mr: '8px' },
  // The fold rule of a long list (FoldMore.tsx).
  '& .rest': { display: 'none' },
  '& .rest[data-open="true"]': { display: 'contents' },
  '& .morewrap': { gridColumn: '1 / -1', display: 'flex' },
  '& .more': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    height: 22,
    px: 1,
    border: `1px solid ${t.borderMuted}`,
    borderRadius: `${tokens.rSm}px`,
    bgcolor: t.bgSubtle,
    fontFamily: t.fontMono,
    fontSize: 11,
    fontWeight: 600,
    color: t.fgMuted,
    cursor: 'pointer',
  },
  '& .more:hover': { bgcolor: t.bgInset },
  // The fold line of a part's quiet Kubernetes defaults (kubeDefaults.ts).
  '& .dfoot': { display: 'flex', p: '6px 12px 4px 14px', borderTop: `1px solid ${t.borderSubtle}` },
  '& .dfold': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: 22,
    p: '0 8px 0 5px',
    border: `1px solid ${t.borderMuted}`,
    borderRadius: `${tokens.rSm}px`,
    bgcolor: t.bgSubtle,
    fontFamily: t.fontSans,
    fontSize: 11.5,
    fontWeight: 600,
    color: t.fgMuted,
    cursor: 'pointer',
  },
  '& .dfold:hover': { bgcolor: t.bgInset },
  '& .dfold:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '2px' },
  '& .dfold svg': { width: 12, height: 12, transition: 'transform .12s' },
  '& .dfold.open svg': { transform: 'rotate(90deg)' },
  '& .more:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '2px' },
  '& .more .mk': { ml: 0 },

  // WIDE: each section is a bordered card, in two columns. The class is set with the columns
  // (SpecSheet's useTwoColumns), so the styles and the layout change on the same render.
  '&.two .cols': {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    columnGap: '20px',
    alignItems: 'start',
    p: '12px 12px 4px',
  },
  '&.two .col': { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 },
  '&.two .col > .part': {
    border: `1px solid ${t.borderDefault}`,
    borderRadius: `${t.radiusMd}px`,
    bgcolor: t.bgDefault,
    pt: 0,
    pb: '6px',
    minWidth: 0,
  },
  '&.two .col > .part > .phead': { pt: '12px', pb: '8px', mb: '2px', borderBottom: `1px solid ${t.borderMuted}` },
  '&.two .col > .part .fold': { mt: '6px', mb: '4px' },
  '&.two .common': { pb: 0 },
  // A card titled with its only block: the block's label is not drawn again; its actions stay.
  '& .blk.lone > .blabel': { display: 'contents' },
  [`@container (max-width: ${NARROW_MAX_PX}px)`]: {
    '& .cut-wide': { display: 'none' },
    '& .cut-narrow': { display: 'inline' },
    '& .blk': { gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 0.25 },
  },
};
