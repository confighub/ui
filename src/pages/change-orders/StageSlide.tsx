// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The open step (a stage, or Complete) changes with a visible move, rather than a jump.
 *
 * The page moves on by itself after a promote (to the next stage) and after the last release
 * (to Complete), and the reader moves it with the rail or the address. Only one step is ever
 * mounted, and the new one replaces the old at once: it slides in from the side of the path it
 * comes from, with what it has (the log's skeleton on a first read, until its reads answer), while
 * the box eases to its height. Nothing waits for anything. At the same time, after the reader's own
 * action the page goes up to the promotion path, and after the reader's action, a rail click or a
 * change of address the rail's marker goes from the old node to the new one (`stageMove.ts`). A
 * move nobody here asked for (another user's promote) scrolls nothing and moves nothing: the step
 * changes in place. Under prefers-reduced-motion the page goes to the rail at once after the
 * reader's own action, and the step changes in place.
 */
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

import {
  RAIL_SELECTOR,
  RailMarker,
  type Rect,
  type StageMoveKind,
  openNodeRect,
  scrollParentOf,
  forgetActivation,
  scrollToRail,
  stageMoveKind,
  watchActivations,
} from './stage/stageMove';

/** How long the slide takes. */
export const STAGE_SLIDE_MS = 250;
/** How long the rail's marker takes to go from the old node to the new one. */
const MARKER_MS = 300;
/** Where focus goes once the new step is drawn: its status heading, or the Complete step's. */
const HEADING_SELECTOR = '#stage-status-heading, [data-testid="complete-step-detail"] h2';
/** How long focus waits for the new step's heading to be drawn (a first read draws it later). */
const HEADING_WAIT_MS = 3000;

/**
 * Focus moves to the new step only from where the change came from: nowhere (the control that
 * started it is gone, as Promote and Release are), the step itself, or the rail link clicked. Focus
 * anywhere else is the reader's, for example in a comment they type while another user's promote
 * moves the page on, and it stays there.
 */
function focusFollowsStep(box: HTMLElement): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body || box.contains(active)) return true;
  return active.closest(`${RAIL_SELECTOR}, [data-promote-stage], [data-release-stage]`) !== null;
}

type Phase =
  /** Nothing moves. */
  | { kind: 'still' }
  /** The new step is placed at its start, off to the side, without a transition; the box keeps `from`. */
  | { kind: 'start'; from: number; dir: 1 | -1 }
  /** The step slides in and the box eases from `from` to `to`. */
  | { kind: 'slide'; from: number; to: number; dir: 1 | -1 };

export function StageSlide({
  slideKey,
  order,
  children,
}: {
  /** Which step: a stage id, or the Complete step's. */
  slideKey: string;
  /** Its place on the promotion path, for the direction. */
  order: number;
  children: ReactNode;
}) {
  const theme = useTheme();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [shown, setShown] = useState<{ key: string; order: number; move: StageMoveKind; count: number }>({
    key: slideKey,
    order,
    move: 'other',
    count: 0,
  });
  const [phase, setPhase] = useState<Phase>({ kind: 'still' });
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  /** The box's height at the last commit: the old step's height when a new one arrives. */
  const lastHeight = useRef(0);
  /** The page's path at the last commit: a new one says the address moved the step. */
  const lastPath = useRef(window.location.pathname);
  /** Where the rail's marker was before this move: where it moves from. */
  const lastMark = useRef<Rect | undefined>(undefined);
  useEffect(() => watchActivations(), []);

  // A new step, also in the middle of a move (the latest one wins): it is drawn at once.
  if (slideKey !== shown.key) {
    // 1: a later step, so it comes from the right; -1: an earlier one, from the left.
    const dir = order >= shown.order ? 1 : -1;
    // The first step of a page load (nothing shown before) is drawn as it comes.
    const first = shown.key === '';
    const move = first ? 'other' : stageMoveKind(window.location.pathname !== lastPath.current);
    setShown({ key: slideKey, order, move, count: first ? 0 : shown.count + 1 });
    setPhase(first || reduced || move === 'other' ? { kind: 'still' } : { kind: 'start', from: lastHeight.current, dir });
  }

  const moved = shown.count;
  /** The commit of a move has drawn the new open node on the rail; the marker leaves the one before. */
  const markFrom = useRef(moved);
  useLayoutEffect(() => {
    if (box.current !== null) lastHeight.current = box.current.offsetHeight;
    lastPath.current = window.location.pathname;
    if (markFrom.current === moved) lastMark.current = openNodeRect();
    markFrom.current = moved;
  });

  /*
   * With the new step, at the same time: the page goes up to the rail after the reader's own action,
   * and the marker goes from the old node to the new one. The marker is put on the old node before
   * the first paint, so the rail never shows two open nodes, or none.
   */
  useLayoutEffect(() => {
    if (moved === 0 || shown.move === 'other') return;
    if (shown.move === 'own' || shown.move === 'rail') forgetActivation();
    const marker = reduced ? null : RailMarker.from(lastMark.current);
    if (shown.move === 'own') void scrollToRail(!reduced);
    let cancelled = false;
    void marker?.moveTo(MARKER_MS, theme.transitions.easing.easeInOut).then(() => {
      if (!cancelled) marker.remove();
    });
    return () => {
      cancelled = true;
      marker?.remove();
    };
    // One run per move; `moved` counts them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moved]);

  // The start position is measured and drawn for one frame, so the move to the end is a transition.
  useLayoutEffect(() => {
    if (phase.kind !== 'start') return;
    const to = inner.current?.offsetHeight ?? phase.from;
    const frame = requestAnimationFrame(() => setPhase({ kind: 'slide', from: phase.from, to, dir: phase.dir }));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase.kind !== 'slide') return;
    const done = window.setTimeout(() => setPhase({ kind: 'still' }), STAGE_SLIDE_MS);
    return () => window.clearTimeout(done);
  }, [phase]);

  /*
   * Focus goes to the new step's heading, without a scroll, if the reader was not busy elsewhere when
   * the step changed. A first read draws the heading a little later, so it is waited for.
   */
  useEffect(() => {
    if (moved === 0) return;
    const el = box.current;
    if (el === null || !focusFollowsStep(el)) return;
    const started = performance.now();
    let frame = 0;
    const tryFocus = () => {
      const heading = el.querySelector<HTMLElement>(HEADING_SELECTOR);
      if (heading !== null) heading.focus({ preventScroll: true });
      else if (performance.now() - started < HEADING_WAIT_MS) frame = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, [moved]);

  /*
   * After a rail click or a change of address, once the step stands: if its top is above the
   * visible part, it comes into view. The reader's own action already took the page to the rail
   * above it, and nobody's move scrolls nothing.
   */
  const standing = moved > 0 && phase.kind === 'still' && (shown.move === 'rail' || shown.move === 'address');
  useEffect(() => {
    if (!standing) return;
    const el = box.current;
    const scroller = el === null ? null : scrollParentOf(el);
    if (el === null || scroller === null) return;
    const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (offset < 0) scroller.scrollBy({ top: offset - 16, behavior: reduced ? 'auto' : 'smooth' });
    // Once per move, when it stands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standing, moved]);

  const easing = theme.transitions.easing.easeInOut;
  const boxSx =
    phase.kind === 'start'
      ? { height: `${phase.from}px`, overflow: 'hidden' }
      : phase.kind === 'slide'
        ? { height: `${phase.to}px`, overflow: 'hidden', transition: `height ${STAGE_SLIDE_MS}ms ${easing}` }
        : {};
  const innerSx =
    phase.kind === 'start'
      ? { transform: `translateX(${phase.dir * 100}%)` }
      : phase.kind === 'slide'
        ? { transform: 'none', transition: `transform ${STAGE_SLIDE_MS}ms ${easing}` }
        : {};
  return (
    <Box
      ref={box}
      data-testid="stage-slide"
      data-sliding={phase.kind === 'still' ? undefined : phase.kind}
      data-move={moved === 0 ? undefined : shown.move}
      sx={{ position: 'relative', ...boxSx }}
    >
      <Box ref={inner} data-testid="stage-slide-in" sx={innerSx}>
        {children}
      </Box>
    </Box>
  );
}
