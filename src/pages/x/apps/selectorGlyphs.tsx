// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The four marks a selector row draws. Shared so the two surfaces that draw one cannot drift. */

export const Chevron = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }} aria-hidden>
    <path d="M4 6.5 8 10.5l4-4" />
  </svg>
);

/**
 * TWO OPPOSING ARROWS, not a single return arc. The control EXCHANGES the two
 * endpoints; it does not undo, reverse or refresh anything, and one curved
 * arrow doubling back on itself is the undo glyph everywhere else. Stroke
 * weight, cap style and the 14px box match the chevron beside it.
 */
export const SwapGlyph = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }} aria-hidden>
    <path d="M3 5.5h9.5" />
    <path d="M10.2 3.2 12.5 5.5l-2.3 2.3" />
    <path d="M13 10.5H3.5" />
    <path d="M5.8 8.2 3.5 10.5l2.3 2.3" />
  </svg>
);

/** The empty square's affordance: this is where something goes. */
export const PlusGlyph = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{ width: 15, height: 15 }} aria-hidden>
    <path d="M8 3.4v9.2M3.4 8h9.2" />
  </svg>
);

export const CloseGlyph = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ width: 9, height: 9 }} aria-hidden>
    <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
  </svg>
);
