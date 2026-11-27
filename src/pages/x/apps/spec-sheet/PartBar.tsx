// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The part bar: one chip per resource, then one chip per part of it, in document order,
// sticky under the Unit header. It scrolls sideways and never wraps. The active chip follows the
// scroll, and the bar scrolls itself sideways to keep it in view; a click scrolls to that part.
// When chips do not fit, an arrow button at each edge with more chips past it scrolls the bar
// that way, a chip at a time to its edge. The arrow is a solid plate over the edge, which covers
// the cut part of a chip (no fade: the arrows say there is more).

import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { rollUp, useSheetOverlay } from './sheetOverlay';
import { PartIcon, ResourceIcon } from './sheetIcons';
import type { SheetAtom, SheetPart, SheetResource } from './specSheetModel';
import { StateMarks } from './StateMark';
import { SECTION_LAND_PX } from './sheetStyles';

function* partAtoms(part: SheetPart): Generator<SheetAtom> {
  if (part.titleAtom) yield part.titleAtom;
  for (const b of part.blocks) yield* b.atoms;
}

const resSectionId = (r: SheetResource) => `res-${r.id}`;
const partSectionId = (p: SheetPart) => `part-${p.testKey}`;

interface PartBarProps {
  resources: SheetResource[];
  /** The sheet root: the bar looks up the sections in it. */
  rootRef: RefObject<HTMLElement | null>;
  onSelect: (sectionTestId: string) => void;
}

/**
 * The section in view: the one whose top passed under the sticky stack (the Unit header and this
 * bar) last, that is the lowest top above the line. A part starts after its resource's head, so
 * inside a resource its part wins. In two columns, of two cards side by side the first in
 * document order wins. Read on scroll, once a frame.
 */
function useCurrentSection(
  rootRef: RefObject<HTMLElement | null>,
  ids: string[],
  first: string,
): [string, (id: string) => void] {
  const [current, setCurrent] = useState(first);
  // A chip the reader clicked stays active while its section is on screen: the last parts of a
  // Unit can never scroll up to the stack, and would otherwise never be active.
  const picked = useRef<string | null>(null);
  const key = ids.join('\u0000');
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let scroller: HTMLElement | null = root.parentElement;
    while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller) return;
    const list = scroller;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // A little past the stack, so a section a chip has just scrolled to counts as in view.
      const line = list.getBoundingClientRect().top + SECTION_LAND_PX + 8;
      if (picked.current) {
        const box = root.querySelector(`[data-testid="${picked.current}"]`)?.getBoundingClientRect();
        if (box && box.bottom > line && box.top < list.getBoundingClientRect().bottom) return;
        picked.current = null;
      }
      let next = ids[0];
      let nextTop = -Infinity;
      for (const id of ids) {
        const box = root.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
        // A section the search hides has no box: it is not in view.
        if (!box || box.height === 0) continue;
        const top = box.top;
        if (top <= line && top > nextTop + 0.5) {
          next = id;
          nextTop = top;
        }
      }
      if (next) setCurrent(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    list.addEventListener('scroll', schedule, { passive: true });
    return () => {
      list.removeEventListener('scroll', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
    // `key` stands for `ids`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef, key]);
  const pick = (id: string) => {
    picked.current = id;
    setCurrent(id);
  };
  return [current, pick];
}

/** The width of an arrow's plate over the bar's edge, with its gap: chips snap clear of it. */
const ARROW_PLATE_PX = 34;

/**
 * Scrolls the bar to `target`. Near its end the bar cannot scroll so far, and the chip it
 * snaps would stay cut wider than the plate: the spacer after the last chip then grows by what
 * is missing, so every snap is reached and a plate covers all of a cut.
 */
function scrollBarTo(nav: HTMLElement, target: number) {
  const spacer = nav.querySelector<HTMLElement>('.pspacer');
  const spacerWidth = spacer?.offsetWidth ?? 0;
  const max = nav.scrollWidth - spacerWidth - nav.clientWidth;
  if (spacer) spacer.style.width = `${Math.max(0, Math.ceil(target - max))}px`;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  nav.scrollTo({ left: Math.max(0, target), behavior: reduced ? 'auto' : 'smooth' });
}

/** Scrolls the bar sideways so its active chip is in view, without moving the page. */
function useChipInView(navRef: RefObject<HTMLElement | null>, current: string) {
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !chip) return;
    const left = chip.offsetLeft - nav.offsetLeft;
    const right = left + chip.offsetWidth;
    // In view means clear of the arrow plates, where there are arrows.
    const backPlate = nav.scrollLeft > 1 ? ARROW_PLATE_PX : 0;
    const morePlate = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1 ? ARROW_PLATE_PX : 0;
    if (left >= nav.scrollLeft + backPlate && right <= nav.scrollLeft + nav.clientWidth - morePlate) return;
    let target = Math.max(0, left - (nav.clientWidth - chip.offsetWidth) / 2);
    // Snap to a chip's edge, so no chip shows cut at the back arrow's plate.
    if (target > 0) {
      const box = nav.getBoundingClientRect();
      const cut = [...nav.querySelectorAll<HTMLElement>('.pchip')]
        .map((c) => c.getBoundingClientRect())
        .map((r) => ({ left: r.left - box.left + nav.scrollLeft, right: r.right - box.left + nav.scrollLeft }))
        .find((c) => c.right > target + ARROW_PLATE_PX);
      if (cut) target = Math.max(0, cut.left - ARROW_PLATE_PX);
    }
    scrollBarTo(nav, target);
  }, [navRef, current]);
}

/** Which edges of the bar have chips past them. */
function useOverflowEdges(navRef: RefObject<HTMLElement | null>, key: string) {
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      const start = nav.scrollLeft > 1;
      const end = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    };
    update();
    nav.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => {
      nav.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [navRef, key]);
  return edges;
}

const ArrowIcon = ({ back }: { back?: boolean }) => (
  <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden>
    <path d={back ? 'M10 3.5L5.5 8l4.5 4.5' : 'M6 3.5L10.5 8 6 12.5'} />
  </svg>
);

export const PartBar = memo(function PartBar({ resources, rootRef, onSelect }: PartBarProps) {
  const overlay = useSheetOverlay();
  const ids = resources.flatMap((r) => (r.structured ? [resSectionId(r)] : []).concat(r.parts.map(partSectionId)));
  const [current, pick] = useCurrentSection(rootRef, ids, ids[0] ?? '');
  const select = (id: string) => {
    pick(id);
    onSelect(id);
  };
  const navRef = useRef<HTMLElement | null>(null);
  useChipInView(navRef, current);
  const edges = useOverflowEdges(navRef, ids.join('\u0000'));
  const page = (dir: 1 | -1) => {
    const nav = navRef.current;
    if (!nav) return;
    // Snap to a chip's edge: forward, the first chip cut at the right edge starts just after the
    // back arrow's plate; back, the chip cut at the left edge ends just before the more arrow's.
    const box = nav.getBoundingClientRect();
    const chips = [...nav.querySelectorAll<HTMLElement>('.pchip')].map((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left - box.left + nav.scrollLeft, right: r.right - box.left + nav.scrollLeft };
    });
    const viewLeft = nav.scrollLeft + ARROW_PLATE_PX;
    const viewRight = nav.scrollLeft + nav.clientWidth - ARROW_PLATE_PX;
    let target: number;
    if (dir === 1) {
      const next = chips.find((c) => c.right > viewRight + 1);
      target = next ? next.left - ARROW_PLATE_PX : nav.scrollWidth - nav.clientWidth;
    } else {
      const prev = [...chips].reverse().find((c) => c.left < viewLeft - 1);
      target = prev ? prev.right - nav.clientWidth + ARROW_PLATE_PX : 0;
    }
    scrollBarTo(nav, target);
  };
  return (
    <div className='partbar' data-testid='part-bar'>
      {edges.start && (
        <button type='button' className='pscroll pscroll-back' data-testid='part-nav-back' aria-label='Earlier parts' onClick={() => page(-1)}>
          <ArrowIcon back />
        </button>
      )}
      <nav ref={navRef} className='partnav' data-testid='part-nav' aria-label='Parts'>
        {resources.map((r) => (
          <ResourceChips key={r.id} resource={r} current={current} onSelect={select} overlayMarks={(p) => rollUp(overlay, partAtoms(p))} />
        ))}
        {/* Its width is set by scrollBarTo, not by React. */}
        <span className='pspacer' aria-hidden />
      </nav>
      {edges.end && (
        <button type='button' className='pscroll pscroll-more' data-testid='part-nav-more' aria-label='More parts' onClick={() => page(1)}>
          <ArrowIcon />
        </button>
      )}
    </div>
  );
});

function ResourceChips({
  resource,
  current,
  onSelect,
  overlayMarks,
}: {
  resource: SheetResource;
  current: string;
  onSelect: (id: string) => void;
  overlayMarks: (p: SheetPart) => { stale: boolean; unreleased: boolean };
}) {
  const resId = resSectionId(resource);
  return (
    <>
      {resource.structured && (
        <button
          type='button'
          className={`pchip res${current === resId ? ' on' : ''}`}
          data-testid={`part-nav-res-${resource.id}`}
          aria-current={current === resId ? 'true' : undefined}
          title={[resource.kind, resource.name].filter(Boolean).join(' ')}
          onClick={() => onSelect(resId)}
        >
          <ResourceIcon kind={resource.kind} />
          <span className='pchip-text'>
            {resource.kind && <b>{resource.kind}</b>} {resource.name ?? <span className='lit'>no name</span>}
          </span>
        </button>
      )}
      {resource.parts.map((part) => {
        const id = partSectionId(part);
        return (
          <button
            key={part.id}
            type='button'
            className={`pchip${current === id ? ' on' : ''}`}
            data-testid={`part-nav-${part.testKey}`}
            aria-current={current === id ? 'true' : undefined}
            title={part.title}
            onClick={() => onSelect(id)}
          >
            <PartIcon kind={part.kind} />
            <span className='pchip-text'>{part.title}</span>
            <StateMarks {...overlayMarks(part)} />
          </button>
        );
      })}
    </>
  );
}
