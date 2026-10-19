// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Hides content from sight while keeping it in the accessibility tree: text a
 * screen reader needs for something the screen draws as a shape.
 *
 * ⚠️ PUT IT INSIDE A POSITIONED PARENT. It is `position: absolute`, so it sits in
 * the nearest positioned ancestor. With none, that is the page itself: inside a
 * scrolling pane the span lands where the pane's content would be, past the end of
 * the document, and the whole app scrolls into blank space. `top`/`left` pin it to
 * the corner of whatever contains it, so even a misplaced span cannot reach
 * beyond the top of its container, but the positioned parent is what keeps it there.
 */
export const VISUALLY_HIDDEN_SX = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
