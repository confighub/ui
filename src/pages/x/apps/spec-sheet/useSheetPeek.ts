// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Which value the sheet's one peek is on: delegated `pointermove` / `focusin` on the sheet root.
//
// A value takes the peek only when the pointer rests on it for the hover delay, so a value the
// pointer only passes over never takes it. While a card is open, the pointer may cross the gap
// and other values on its way to the card: inside the safe triangle (from where it left its
// value to the card's near edge) the card holds for a longer grace, so a slow move still
// reaches it.

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the pointer rests on a value before the peek opens (section 6, hover). */
const HOVER_DELAY_MS = 400;
/** How long the card stays after the pointer leaves the value and the card, away from the card. */
const LEAVE_GRACE_MS = 250;
/** How long the card stays while the pointer is heading for it (in the safe triangle). */
const TOWARD_CARD_GRACE_MS = 500;
/** Slack around the safe triangle, in px, for an unsteady hand. */
const TRIANGLE_SLACK_PX = 6;

interface Point {
  x: number;
  y: number;
}

/** Whether `p` is in the triangle from `apex` to the card's near edge, or within the slack of it. */
function inSafeTriangle(p: Point, apex: Point, card: DOMRect): boolean {
  const y = card.top >= apex.y ? card.top : card.bottom;
  const a = apex;
  const b = { x: card.left - TRIANGLE_SLACK_PX, y };
  const c = { x: card.right + TRIANGLE_SLACK_PX, y };
  const side = (p1: Point, p2: Point, p3: Point) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = side(p, a, b);
  const d2 = side(p, b, c);
  const d3 = side(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  if (!(neg && pos)) return true;
  // Near the apex the triangle is thin: a small circle around it counts too.
  return Math.hypot(p.x - a.x, p.y - a.y) <= TRIANGLE_SLACK_PX * 2;
}

const VALUE_SELECTOR = '.v[data-stage-key], .v .item[data-stage-key]';

export interface PeekTarget {
  el: HTMLElement;
  key: string;
  path: string;
}

/** The class of the peek card, which takes the pointer and the focus (one hover card per value). */
export const PEEK_CARD_CLASS = 'fpeek-card';

/** `root` is state, not a ref: the sheet's root mounts after its loading state, and the listeners must follow it. */
export function useSheetPeek(root: HTMLElement | null) {
  const [target, setTarget] = useState<PeekTarget | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);
  // While the pointer is on the card, no other value takes the peek.
  const onCard = useRef(false);

  const toTarget = (el: Element | null): PeekTarget | null => {
    const v = el?.closest<HTMLElement>(VALUE_SELECTOR);
    if (!v) return null;
    return { el: v, key: v.dataset.stageKey ?? '', path: v.dataset.path ?? '' };
  };

  const openOn = useCallback((el: HTMLElement) => {
    window.clearTimeout(timer.current);
    setTarget(toTarget(el));
  }, []);

  const inCard = (el: EventTarget | null) => el instanceof Element && !!el.closest(`.${PEEK_CARD_CLASS}`);
  // The card stays while the pointer or the focus is on its value or on it.
  const dropUnlessHeld = useCallback(() => {
    setTarget((t) => (t && (onCard.current || document.activeElement === t.el || inCard(document.activeElement)) ? t : null));
  }, []);

  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    window.clearTimeout(leaveTimer.current);
    onCard.current = false;
    setTarget(null);
  }, []);

  /** The pointer is on the card: it holds the card, and no value under the path can take it. */
  const cardEnter = useCallback(() => {
    onCard.current = true;
    window.clearTimeout(timer.current);
    window.clearTimeout(leaveTimer.current);
  }, []);
  /** The pointer left the card: it closes after the grace period, unless the pointer is back. */
  const cardLeave = useCallback(() => {
    onCard.current = false;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(dropUnlessHeld, LEAVE_GRACE_MS);
  }, [dropUnlessHeld]);

  // The open card's value, and where the pointer last was on it (the safe triangle's apex).
  const targetRef = useRef<PeekTarget | null>(null);
  targetRef.current = target;
  const apex = useRef<Point | null>(null);

  useEffect(() => {
    if (!root) return;
    let resting: Element | null = null;
    const onMove = (e: PointerEvent) => {
      if (onCard.current) return;
      const next = toTarget(e.target as Element);
      const open = targetRef.current;
      const p = { x: e.clientX, y: e.clientY };
      if (open && next?.el === open.el) {
        // On the open card's value: it holds, and this is where a move to the card starts.
        window.clearTimeout(leaveTimer.current);
        window.clearTimeout(timer.current);
        resting = null;
        apex.current = p;
        return;
      }
      // Another value takes the peek only once the pointer rests on it: each move restarts the wait.
      window.clearTimeout(timer.current);
      resting = next?.el ?? null;
      if (next) {
        timer.current = window.setTimeout(() => {
          if (!onCard.current && resting === next.el) setTarget(next);
        }, HOVER_DELAY_MS);
      }
      if (!open) return;
      const card = document.querySelector(`.${PEEK_CARD_CLASS}`)?.getBoundingClientRect();
      const toward = !!card && !!apex.current && inSafeTriangle(p, apex.current, card);
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(dropUnlessHeld, toward ? TOWARD_CARD_GRACE_MS : LEAVE_GRACE_MS);
    };
    const onLeave = () => {
      window.clearTimeout(timer.current);
      resting = null;
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(dropUnlessHeld, LEAVE_GRACE_MS);
    };
    const onFocus = (e: FocusEvent) => {
      window.clearTimeout(timer.current);
      const next = toTarget(e.target as Element);
      if (next) setTarget(next);
    };
    const onBlur = (e: FocusEvent) => {
      // Focus moving into the value's card keeps it.
      if (inCard(e.relatedTarget)) return;
      if (!onCard.current) setTarget(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTarget((t) => (t ? null : t));
    };
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('focusin', onFocus);
    root.addEventListener('focusout', onBlur);
    root.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(leaveTimer.current);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('focusout', onBlur);
      root.removeEventListener('keydown', onKey);
    };
  }, [root, dropUnlessHeld]);

  return { target, openOn, close, cardEnter, cardLeave };
}
