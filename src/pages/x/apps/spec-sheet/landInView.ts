// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// A jump to a section or a field that lands clear of the sticky stack, and stays there while
// the drawer's chrome settles. A jump down folds the title and tabs rows (snap-on-scroll),
// which moves the list after the scroll; the target is put back each frame something moved,
// until it holds still. While a jump settles, its own scrolls are not the reader's: the
// scroller carries `data-chrome-jump` (until when, in ms), so the chrome does not unfold on a
// small scroll back up. The sheet root carries `data-jump="settling"` meanwhile, for tests.

/** The number of still frames after which a jump has landed. */
const STILL_FRAMES = 4;
/** A jump gives up re-placing its target after this many frames (about 1.5s). */
const MAX_FRAMES = 90;
/** How long the chrome treats the jump's scrolls as not the reader's. */
const CHROME_HOLD_MS = 1500;

function scrollerOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && !['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) node = node.parentElement;
  return node;
}

export function landInView(el: HTMLElement, block: ScrollLogicalPosition, root: HTMLElement | null) {
  const scroller = scrollerOf(el);
  if (scroller) scroller.dataset.chromeJump = String(performance.now() + CHROME_HOLD_MS);
  root?.setAttribute('data-jump', 'settling');
  const offset = () => el.getBoundingClientRect().top - (scroller?.getBoundingClientRect().top ?? 0);
  const geometry = () => {
    const r = scroller?.getBoundingClientRect();
    return r ? `${Math.round(r.top)}:${Math.round(r.height)}` : '';
  };
  el.scrollIntoView({ block });
  let prev = offset();
  let prevGeometry = geometry();
  let prevTop = scroller?.scrollTop ?? 0;
  let still = 0;
  let frames = 0;
  const done = () => {
    root?.removeAttribute('data-jump');
    if (scroller) delete scroller.dataset.chromeJump;
  };
  const step = () => {
    frames++;
    const now = offset();
    const g = geometry();
    const top = scroller?.scrollTop ?? 0;
    if (g !== prevGeometry || (Math.abs(now - prev) > 0.5 && top === prevTop)) {
      // The chrome folded (the list moved or grew), or a part mounted above: put it back.
      el.scrollIntoView({ block });
      still = 0;
    } else if (top !== prevTop) {
      // Someone else scrolled the list: the reader has moved on, so the jump stops here.
      done();
      return;
    } else {
      still++;
    }
    prev = offset();
    prevGeometry = g;
    prevTop = scroller?.scrollTop ?? 0;
    if (still < STILL_FRAMES && frames < MAX_FRAMES && el.isConnected) requestAnimationFrame(step);
    else done();
  };
  requestAnimationFrame(step);
}
