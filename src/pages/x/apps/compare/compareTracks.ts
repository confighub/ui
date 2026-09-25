// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The compare grid's column tracks — their own module so "stated once" is true
 * of the source and not only of the intent.
 */

/** Wide enough for `readinessProbe.initialDelaySeconds` to wrap to two lines rather than be cut. */
export const KEY_COLUMN_PX = 220;
export const VALUE_COLUMN_PX = 104;
/**
 * There is no tail gutter cell.
 *
 * One used to sit past the last column so a value was never flush against the
 * pane edge. With fixed tracks it cost nothing; with growing ones it is 28px the
 * columns cannot absorb, which is the dead strip at the right that this work
 * exists to remove. The breathing room comes from each value cell's own right
 * padding instead, which travels with the column rather than sitting after it.
 */

/**
 * THE TRACKS, AND THE ONLY PLACE THEY ARE STATED.
 *
 * Every cell in every row type reads its width from these, so a row cannot
 * declare a width of its own and land the divider somewhere else. That is what
 * went wrong: each row type carried its own `width: 220`, and because the cells
 * were CONTENT-box, each row's own padding and indent were then added on top of
 * it. The dividers landed at 221, 237, 249 and 259 in one pane — the folder row
 * was the only correct one, and only by accident, because a `<button>` is
 * border-box by UA default while a `<div>` is not.
 *
 * So both halves are fixed here rather than at the call sites: one source for
 * the number, and `border-box` everywhere so padding is spent INSIDE the track
 * instead of widening it. Indentation in particular has to live inside the key
 * cell — it is what distinguishes a leaf from its folder, and it must never be
 * able to move a column.
 */
export const KEY_COLUMN_VAR = '--compare-key-col';
export const VALUE_COLUMN_VAR = '--compare-val-col';

/** Declares the tracks. Put on one ancestor of every grid so all groups share them. */
export const COMPARE_TRACK_VARS = {
  [KEY_COLUMN_VAR]: `${KEY_COLUMN_PX}px`,
  [VALUE_COLUMN_VAR]: `${VALUE_COLUMN_PX}px`,
} as const;

/**
 * Every cell that occupies the key track. NEVER grows.
 *
 * `0 0` rather than `none` so it reads as a deliberate refusal beside the value
 * track's `1 0` below. The key column is the one thing on this grid whose width
 * is a design decision rather than a consequence: it is sized to hold
 * `readinessProbe.initialDelaySeconds`, and letting it take a share of the slack
 * would spend on key text the room the VALUES need. It is also the sticky
 * offset the key column itself holds, so a key column that moved would take
 * the freeze with it.
 */
export const KEY_TRACK_SX = {
  boxSizing: 'border-box',
  flex: `0 0 var(${KEY_COLUMN_VAR}, ${KEY_COLUMN_PX}px)`,
  minWidth: 0,
} as const;

/**
 * Every cell that occupies a value track. 104px is a FLOOR, not a width.
 *
 * `1 0 104px` — grow equally into whatever the pane has spare, never shrink
 * below the floor. That gives both behaviours from one declaration and makes the
 * crossover free: while `key + N × floor` fits the pane there is slack and the
 * columns share it, and once it does not there is none and they sit at the
 * floor while the pane scrolls. No N is special-cased, so there is no seam to
 * get wrong.
 *
 * `minWidth: 0` matters more than it looks: without it a long unbroken value
 * would raise the cell's minimum content size, which becomes the row's, which
 * becomes the scroller's — and the grid would scroll at N=2 with the pane
 * half empty, for one long string.
 *
 * NO `overflow: hidden` HERE, deliberately. The value pill clips itself; the
 * CELL must not, because the inline editor floats out of it — and a clipping
 * ancestor is exactly how the comparison badge lost a third of itself on the
 * flow-graph node. `position: relative` makes the cell the editor's anchor.
 */
export const VALUE_TRACK_SX = {
  boxSizing: 'border-box',
  flex: `1 0 var(${VALUE_COLUMN_VAR}, ${VALUE_COLUMN_PX}px)`,
  minWidth: 0,
  position: 'relative',
} as const;


/**
 * How wide the grid's content is, for `n` value columns.
 *
 * STATED, NOT MEASURED. Letting the rows size themselves with
 * `min-width: max-content` looked equivalent and is not: max-content is the sum
 * of what the cells CONTAIN, so one long value widens its row, every row sizes
 * itself independently, and the columns drift apart again — the same defect
 * class, arrived at from the other direction. Worse, it silently overshoots the
 * floor at high N, so the grid scrolls further than it needs to because one
 * string was long.
 *
 * One declared width for the whole scroller instead: the floor times the number
 * of columns. Below the pane it is slack the tracks share; above it, it is the
 * scroll extent. Nothing depends on what any cell holds.
 */
export function compareContentWidth(n: number): string {
  return `calc(var(${KEY_COLUMN_VAR}, ${KEY_COLUMN_PX}px) + ${n} * var(${VALUE_COLUMN_VAR}, ${VALUE_COLUMN_PX}px))`;
}
