// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';

/**
 * The results toolbar shrinks by its own width, not the window's: the filter
 * column and the app's Functions panel take room beside it. It is a size
 * container (`vxbar`), and its parts change at two widths. Nothing in it is
 * hidden; the labels give way to icons, and the counts to shorter text. It
 * never wraps to a second row, so the table under it does not move.
 */

export const TOOLBAR_CONTAINER = { containerType: 'inline-size', containerName: 'vxbar' } as const;

/** Under 600px: buttons show their icon only. */
export const COMPACT = '@container vxbar (max-width: 599.98px)';
/**
 * Under 760px: the save actions show their icons only. Labelled, they take
 * about 380px, and the labelled selection bar beside them about 330px; a
 * 1440px window with the Functions panel open leaves the toolbar about 650px.
 */
export const SAVE_COMPACT = '@container vxbar (max-width: 759.98px)';
/** Under 440px: the selection's count is shortest ("2 of 9"). */
export const NARROW = '@container vxbar (max-width: 439.98px)';

/** The part of a button that gives way: its words. Its key cap (`kbd`) goes with them. */
export const LABEL = 'vx-label';
/** The part that comes in their place. */
export const ICON = 'vx-icon';

/**
 * A button that shows its label, and below `query` only its icon, as a
 * `size`px square. It keeps its accessible name through an `aria-label`.
 */
export function iconOnlyBelow(query: string, size: number): SystemStyleObject<Theme> {
  return {
    [`& .${ICON}`]: { display: 'none' },
    [query]: {
      // Doubled, to win over a row's own button padding (the save actions set theirs).
      '&&': { minWidth: size, width: size, height: size, px: 0, gap: 0 },
      [`& .${LABEL}, & kbd, & .MuiButton-endIcon`]: { display: 'none' },
      [`& .${ICON}`]: { display: 'inline-flex' },
    },
  };
}
