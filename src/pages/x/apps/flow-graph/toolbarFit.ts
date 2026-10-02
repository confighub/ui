// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The search field at full size. */
export const SEARCH_FULL_WIDTH = 240;
/** Below this the placeholder is cut too short to read, so the field folds to an icon. */
export const SEARCH_MIN_WIDTH = 140;
/** The search field folded to its icon; it opens below the row when focused. */
export const SEARCH_ICON_WIDTH = 32;
/** Group by with only its icon and arrow; the key moves to a tooltip. */
export const GROUP_COMPACT_WIDTH = 60;
export const TOOLBAR_GAP = 8;
/** React Flow's panel margin on each side of the canvas. */
export const PANEL_MARGIN = 15;
/**
 * Room the Graph / Dashboard toggle takes at the canvas's right edge: its
 * width (about 185 px), its 12 px inset and a 12 px gap. The toggle floats
 * over the canvas, outside the toolbar's row, so the toolbar's row stops short
 * of it by this much; without that, the toolbar measures the whole canvas and
 * the toggle covers its right end.
 */
export const TOGGLE_RESERVE = 210;

/** The room the toolbar has in a canvas of this width. */
export function toolbarRoom(canvasWidth: number): number {
  return canvasWidth - PANEL_MARGIN - TOGGLE_RESERVE;
}

/**
 * The Group by button's width with its label shown, from the label's length.
 * An estimate is enough: it only decides when the label hides, and the
 * button never measures itself, so the choice cannot flip back and forth as
 * the button changes size.
 */
export function groupButtonWidth(label: string): number {
  return Math.ceil(124 + 7.6 * label.length);
}

export interface ToolbarFit {
  groupCompact: boolean;
  /** The search field's width, or 'icon' when it folds to its icon. */
  search: number | 'icon';
}

/**
 * How the canvas toolbar fits the room left of the Auto / Custom toggle. The
 * canvas narrows when the side pane opens, and the toolbar shares the top row
 * with the toggle, so it gives up space in order: first the Group by label,
 * then search width, then the search field itself (to an icon). It never
 * overlaps the toggle.
 *
 * @param room px free for the toolbar; null before it is measured
 * @param groupLabel the text the Group by button shows at full size
 */
export function fitToolbar(room: number | null, groupLabel: string): ToolbarFit {
  if (
    room === null ||
    room >= SEARCH_FULL_WIDTH + TOOLBAR_GAP + groupButtonWidth(groupLabel)
  ) {
    return { groupCompact: false, search: SEARCH_FULL_WIDTH };
  }
  const searchRoom = room - TOOLBAR_GAP - GROUP_COMPACT_WIDTH;
  if (searchRoom >= SEARCH_MIN_WIDTH) {
    return { groupCompact: true, search: Math.min(SEARCH_FULL_WIDTH, Math.floor(searchRoom)) };
  }
  return { groupCompact: true, search: 'icon' };
}
