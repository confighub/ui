// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { DraftProblem, DraftRow } from './draftTypes';

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
   * redraws it, an end chip gives way to its opposite), and focusing it would lose focus with it.
   */
  fresh?: boolean;
  /**
   * Where the keyboard waits if the element it is on goes before its successor is drawn (an id,
   * with `tabIndex={-1}`): never on the page's body in between.
   */
  holdAt?: string;
  /**
   * Wait until the element shows what the change drew (a field its new value): focusing it
   * sooner would keep the old text in a field that does not take a new value while focused.
   */
  ready?: (element: HTMLElement) => boolean;
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
 * For a control that a decision redraws (the end chip after "End at", which gives way to its
 * opposite): the element the keyboard was on is gone, and the reader should land on its
 * successor rather than at the top of the page.
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
    const ready = element !== null && element !== stale && (options.ready === undefined || options.ready(element));
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

/**
 * The parts of the summary card a problem is said in: under the title, under the facts, under
 * the dry run's outcome, under What and How much.
 */
export type DraftPlace = 'title' | 'facts' | 'outcome' | 'change';

/** The id of a part of the summary card: the fallback focus target for a problem with no control of its own. */
export const draftPlaceId = (place: DraftPlace) => `draft-place-${place}`;

/** A short, stable hash of a text, for an id made from it. */
function textHash(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 33 + text.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(36);
}

/** The id of a problem's words on the card: what the control it is about is described by. */
export const draftProblemId = (problem: Pick<DraftProblem, 'code' | 'message'>) =>
  `draft-problem-${problem.code}-${textHash(problem.message)}`;

/** The id of a problem's fix: where the blocker sends the keyboard when the control is not drawn. */
export const draftFixId = (problem: Pick<DraftProblem, 'code' | 'message'>) => `${draftProblemId(problem)}-fix`;

/** Where each kind of problem is said. A refusal of Create itself is said beside Create, not in the card. */
export const DRAFT_PLACE_OF_ROW: Readonly<Record<DraftRow, DraftPlace | undefined>> = {
  template: 'title',
  name: 'title',
  description: 'title',
  what: 'change',
  howMuch: 'change',
  where: 'outcome',
  path: 'facts',
  same: 'change',
  create: undefined,
};

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
