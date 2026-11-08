// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How the open step moves when it changes: where the move came from, and the rail's marker.
 *
 * The page moves on by itself when the open stage's work is done (`changeOrderOpenStage.ts`): after
 * Promote on a stage with no release Target, and after Release on a stage with one, because the next
 * stage's entry gate needs it released. That move after the reader's own Promote or Release takes
 * them up to the promotion path and shows the marker go from the old step to the new one, so that
 * they see the stage change. A rail click or the address (a link, Back) shows the marker move but
 * does not scroll: the reader is already where they look. A move nobody here asked for (another
 * user's promote) scrolls nothing and moves nothing: the rail and the step change in place.
 */
import {
  changeOrderAction,
  changeOrderSelectedRing,
  changeOrderShape,
} from '../changeOrdersTokens';

export type StageMoveKind = 'own' | 'rail' | 'address' | 'other';

/**
 * How the page's address changed with the move: `same`, not at all; `reader`, a new address from a
 * link or Back; `movedOn`, the bare address the page went to by itself after the reader's own action.
 */
export type AddressChange = 'same' | 'reader' | 'movedOn';

/** The promotion path's node that is open now carries `aria-pressed="true"`. */
export const RAIL_SELECTOR = '[data-testid="promotion-path"]';
const OPEN_NODE_SELECTOR = '[aria-pressed="true"]';
/** The controls whose action moves the page on: Promote, Release, and the confirm that sends them. */
const ACTION_SELECTOR = '[data-promote-stage], [data-release-stage], [data-confirm]';
/** How long after the reader's action its move still counts as theirs: the action's reads come first. */
const OWN_ACTION_MS = 60_000;
/** How long after a rail click the move counts as that click's. */
const RAIL_CLICK_MS = 3_000;

/** The last thing the reader activated in this tab, with a click or a key. */
let lastActivation: { target: Element; at: number } | null = null;
let listeners = 0;

/** A click, or any key: typing puts the reader somewhere other than the action they took before. */
function onActivate(event: Event) {
  if (event.target instanceof Element)
    lastActivation = { target: event.target, at: Date.now() };
}

/** Listens, for as long as one caller needs it, to what the reader activates. */
export function watchActivations(): () => void {
  if (listeners === 0) {
    document.addEventListener('click', onActivate, true);
    document.addEventListener('keydown', onActivate, true);
  }
  listeners += 1;
  return () => {
    listeners -= 1;
    if (listeners === 0) {
      document.removeEventListener('click', onActivate, true);
      document.removeEventListener('keydown', onActivate, true);
      lastActivation = null;
    }
  };
}

/**
 * Where a move of the open step came from. The reader's own action moves the page on its bare
 * address. When the address named the stage their action finished, the page goes to the bare address
 * itself (`movedOn`), so that move can be 'own' too; a new address from the reader (a link, Back) never is.
 * Pure, as a render needs: the caller forgets the activation once the move is drawn.
 */
export function stageMoveKind(address: AddressChange, now = Date.now()): StageMoveKind {
  const last = lastActivation;
  if (last !== null) {
    if (now - last.at < RAIL_CLICK_MS && last.target.closest(RAIL_SELECTOR) !== null)
      return 'rail';
    // The control is gone by now (the card changed), so its place in the document is read from the event.
    if (
      address !== 'reader' &&
      now - last.at < OWN_ACTION_MS &&
      last.target.closest(ACTION_SELECTOR) !== null
    )
      return 'own';
  }
  return address === 'same' ? 'other' : 'address';
}

/** An activation counts for one move only: a later move with no new input is nobody's. */
export function forgetActivation() {
  lastActivation = null;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The open node of the rail, in the rail's own coordinates; `undefined` with no rail or no open node. */
export function openNodeRect(): Rect | undefined {
  const rail = document.querySelector<HTMLElement>(RAIL_SELECTOR);
  const node = rail?.querySelector<HTMLElement>(OPEN_NODE_SELECTOR);
  if (rail === null || rail === undefined || node === null || node === undefined)
    return undefined;
  const r = rail.getBoundingClientRect();
  const n = node.getBoundingClientRect();
  return {
    left: n.left - r.left - rail.clientLeft,
    top: n.top - r.top - rail.clientTop,
    width: n.width,
    height: n.height,
  };
}

/**
 * The rail's marker, drawn on its own over the node that was open, until it moves.
 * The new node does not show itself as open until the marker reaches it.
 */
export class RailMarker {
  private readonly node: HTMLElement;
  private readonly mark: HTMLElement;
  private animation: Animation | null = null;

  private constructor(rail: HTMLElement, node: HTMLElement, from: Rect) {
    this.node = node;
    this.mark = document.createElement('div');
    this.mark.setAttribute('data-testid', 'rail-marker');
    this.mark.setAttribute('aria-hidden', 'true');
    // The open node's own edge (`railNodeSx`): the same border, ring and corner.
    Object.assign(this.mark.style, {
      position: 'absolute',
      boxSizing: 'border-box',
      pointerEvents: 'none',
      border: `${changeOrderShape.borderWidth}px solid ${changeOrderAction.ink}`,
      boxShadow: changeOrderSelectedRing,
      borderRadius: `${changeOrderShape.radius.lg}px`,
      ...px(from),
    });
    rail.appendChild(this.mark);
    node.setAttribute('data-marker-arriving', '');
  }

  /** Puts a marker on the node that was open (`from`), when the rail has moved its open node elsewhere. */
  static from(from: Rect | undefined): RailMarker | null {
    const rail = document.querySelector<HTMLElement>(RAIL_SELECTOR);
    const node = rail?.querySelector<HTMLElement>(OPEN_NODE_SELECTOR);
    if (
      from === undefined ||
      rail === null ||
      rail === undefined ||
      node === null ||
      node === undefined
    )
      return null;
    return new RailMarker(rail, node, from);
  }

  /** Moves the marker to the open node; resolves when it is there. */
  moveTo(durationMs: number, easing: string): Promise<void> {
    const to = openNodeRect();
    if (to === undefined) return Promise.resolve();
    this.animation = this.mark.animate([px(rectOf(this.mark.style)), px(to)], {
      duration: durationMs,
      easing,
      fill: 'forwards',
    });
    return this.animation.finished.then(
      () => undefined,
      () => undefined,
    );
  }

  /** The marker goes; the open node shows itself as open again. */
  remove() {
    this.animation?.cancel();
    this.mark.remove();
    this.node.removeAttribute('data-marker-arriving');
  }
}

function px(rect: Rect) {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function rectOf(style: CSSStyleDeclaration): Rect {
  return {
    left: parseFloat(style.left),
    top: parseFloat(style.top),
    width: parseFloat(style.width),
    height: parseFloat(style.height),
  };
}

/** The nearest ancestor that scrolls vertically. */
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    if (
      /(auto|scroll)/.test(getComputedStyle(node).overflowY) &&
      node.scrollHeight > node.clientHeight
    )
      return node;
  }
  return null;
}

/** Room left above the rail when the page brings it into view. */
const RAIL_TOP_MARGIN = 16;
/** The longest wait for a smooth scroll to end. */
const SCROLL_WAIT_MS = 1_200;

/**
 * Brings the promotion path into view near the top, unless it is in view already; resolves when the
 * scroll has stopped.
 */
export function scrollToRail(smooth: boolean): Promise<void> {
  const rail = document.querySelector<HTMLElement>(RAIL_SELECTOR);
  const scroller = rail === null ? null : scrollParentOf(rail);
  if (rail === null || scroller === null) return Promise.resolve();
  const r = rail.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();
  if (r.top >= s.top && r.bottom <= s.bottom) return Promise.resolve();
  scroller.scrollBy({
    top: r.top - s.top - RAIL_TOP_MARGIN,
    behavior: smooth ? 'smooth' : 'auto',
  });
  if (!smooth) return Promise.resolve();
  return new Promise((resolve) => {
    const started = performance.now();
    let last = scroller.scrollTop;
    let still = 0;
    const check = () => {
      const now = scroller.scrollTop;
      still = now === last ? still + 1 : 0;
      last = now;
      if (still >= 3 || performance.now() - started > SCROLL_WAIT_MS) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}
