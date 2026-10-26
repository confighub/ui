// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { isReviewState } from './stageCardState';
import type { StageCardStateKind } from './stageTypes';

/** Where focus goes once an action's outcome is on screen. */
export type OutcomeFocusTarget = 'heading' | 'release' | 'review';

interface PendingFocus {
  target: OutcomeFocusTarget;
  at: number;
  /** When focus first landed; for a moment after, a render that drops it puts it back. */
  landedAt?: number;
}

const FOCUS_WAIT_MS = 15_000;
const FOCUS_HOLD_MS = 1_500;
/** The Release button after Promote only: if the box does not offer it this soon, the headline. */
const RELEASE_FALLBACK_MS = 2_000;
/** After a recorded decision, Approve… takes focus when the box is still a review this long after. */
const REVIEW_FOCUS_FALLBACK_MS = 4_000;

/**
 * Focus follows an action's outcome: the headline that says what happened (also
 * when the state did not change, so focus is never left on the page), the Release
 * button after Promote only, the next action after a review (Approve… while the box
 * is still a review).
 *
 * Call `focusAfter` once the outcome is drawn or about to be (Confirm calls it after
 * the read that follows its write). It lands on the next render that has its target,
 * and gives up after a while. The box can be redrawn just after, so for a moment
 * focus that fell to the page is put back.
 */
export function useOutcomeFocus(stateKind: StageCardStateKind, approveRef: RefObject<HTMLButtonElement>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<PendingFocus | null>(null);

  const focusAfter = useCallback((target: OutcomeFocusTarget) => {
    pending.current = { target, at: Date.now() };
  }, []);

  // Runs after every render: the outcome arrives with a later render, and a ref cannot say when.
  useEffect(() => {
    const p = pending.current;
    if (p === null) return;
    const now = Date.now();
    const targetOf = (target: OutcomeFocusTarget) => (target === 'release' ? mainRef.current : headingRef.current);
    if (p.landedAt !== undefined) {
      if (now - p.landedAt > FOCUS_HOLD_MS) pending.current = null;
      else if (document.activeElement === null || document.activeElement === document.body) targetOf(p.target)?.focus();
      return;
    }
    const age = now - p.at;
    if (age > FOCUS_WAIT_MS) {
      pending.current = null;
      return;
    }
    let el: HTMLElement | null = null;
    if (p.target === 'heading') el = headingRef.current;
    else if (p.target === 'release') {
      if (stateKind === 'promoted') el = mainRef.current;
      else if (age > RELEASE_FALLBACK_MS) {
        p.target = 'heading';
        el = headingRef.current;
      }
    } else if (!isReviewState(stateKind)) el = mainRef.current ?? headingRef.current;
    else if (age > REVIEW_FOCUS_FALLBACK_MS) el = approveRef.current;
    if (el === null) return;
    el.focus();
    // A review's next action is wherever the box puts it, so only an outcome's own target is held.
    if (p.target === 'review') pending.current = null;
    else p.landedAt = now;
  });

  return { headingRef, mainRef, focusAfter };
}
