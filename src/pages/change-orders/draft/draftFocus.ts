// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** How many frames to wait for an element that a change is about to draw (about ten seconds). */
const WAIT_FRAMES = 600;

let pending: number | undefined;
/** The request `pending` belongs to. */
let current: symbol | undefined;

export interface FocusWhenDrawnOptions {
  /** Select an input's text once it has focus. */
  select?: boolean;
  /**
   * Wait for a new element with this id: the one there now is about to be replaced (a re-read
   * redraws it, a decision moves it to another row), and focusing it would lose focus with it.
   */
  fresh?: boolean;
  /**
   * Where the keyboard waits if the element it is on goes before its successor is drawn (an id,
   * with `tabIndex={-1}`): never on the page's body in between.
   */
  holdAt?: string;
}

/** The reader has not gone anywhere since asking: focus is on nothing, on what is being replaced, or where it was held. */
const focusIsFree = (stale: Element | null, hold: Element | null) => {
  const active = document.activeElement;
  return active === null || active === document.body || active === stale || (hold !== null && active === hold);
};

/**
 * Move focus to the element with `id` once it is in the document: at once if it is, else as soon
 * as it is drawn. A later request replaces an earlier one, and a reader who has moved focus
 * elsewhere in the meantime keeps it there. Returns a cancel, which does nothing once a later
 * request has replaced this one.
 *
 * For a control that a decision moves or redraws (the end chip after "End at", the update type
 * after it leaves the Same row): the element the keyboard was on is gone, and the reader should
 * land on its successor rather than at the top of the page.
 */
export function focusWhenDrawn(id: string, options: FocusWhenDrawnOptions = {}): () => void {
  if (pending !== undefined) window.cancelAnimationFrame(pending);
  const stale = options.fresh === true ? document.getElementById(id) : null;
  const hold = options.holdAt === undefined ? null : document.getElementById(options.holdAt);
  const request = Symbol(id);
  current = request;
  let frames = 0;
  const attempt = () => {
    const element = document.getElementById(id);
    const ready = element !== null && element !== stale;
    if (ready) {
      pending = undefined;
      if (options.fresh === true && !focusIsFree(stale, hold)) return;
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: 'nearest' });
      if (options.select === true && element instanceof HTMLInputElement) element.select();
      return;
    }
    // The control the keyboard was on has gone and its successor is not drawn yet.
    const active = document.activeElement;
    if (hold !== null && (active === null || active === document.body)) hold.focus({ preventScroll: true });
    frames += 1;
    pending = frames < WAIT_FRAMES ? window.requestAnimationFrame(attempt) : undefined;
  };
  pending = window.requestAnimationFrame(attempt);
  return () => {
    if (current !== request || pending === undefined) return;
    window.cancelAnimationFrame(pending);
    pending = undefined;
  };
}

/** The id of a ledger row: the fallback focus target for a problem with no control of its own. */
export const ledgerRowId = (row: string) => `draft-row-${row}`;

/**
 * Keep the keyboard's place after `control` asked for something that may redraw it away (a
 * retry, whose section shows a skeleton and then its answer): while it stays drawn focus stays
 * on it; once it is gone with focus, focus goes to `fallbackId` (a heading or a result, with
 * `tabIndex={-1}`).
 */
export function keepFocusAfter(control: HTMLElement, fallbackId: string) {
  let frames = 0;
  const check = () => {
    if (!control.isConnected) {
      const fallback = document.getElementById(fallbackId);
      const active = document.activeElement;
      if (fallback !== null && (active === null || active === document.body)) fallback.focus({ preventScroll: true });
      return;
    }
    frames += 1;
    if (frames < WAIT_FRAMES) window.requestAnimationFrame(check);
  };
  window.requestAnimationFrame(check);
}

/** The nearest ancestor that scrolls vertically: the app scrolls its content pane, not the window. */
export function scrollingAncestor(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
}

/** Frames a card may be drawn without the keyboard landing in it before it is scrolled to anyway (about two seconds). */
const LAND_FRAMES = 120;

/**
 * After "Show": once the card `getCard` returns holds the keyboard (its variant chip was focused
 * when drawn), bring the card's header to the top of the pane, `gap` px under the app bar, and
 * keep the focused chip clear of anything over the bottom of the pane (the sticky bar's scroll
 * padding). A card nothing in which takes focus is scrolled to all the same.
 */
export function revealCardWhenFocused(getCard: () => HTMLElement | null, gap: number, appBarHeight: number) {
  let frames = 0;
  let drawnFor = 0;
  const attempt = () => {
    const card = getCard();
    const active = document.activeElement;
    const landed = card !== null && active instanceof HTMLElement && card.contains(active);
    if (card !== null) drawnFor += 1;
    if (card !== null && (landed || drawnFor > LAND_FRAMES)) {
      const pane = scrollingAncestor(card);
      const top = Math.max(pane.getBoundingClientRect().top, appBarHeight) + gap;
      pane.scrollBy({ top: card.getBoundingClientRect().top - top, behavior: 'auto' });
      if (landed) active.scrollIntoView({ block: 'nearest' });
      return;
    }
    frames += 1;
    if (frames < WAIT_FRAMES) window.requestAnimationFrame(attempt);
  };
  window.requestAnimationFrame(attempt);
}
