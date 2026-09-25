// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The drag layer that lets a compare column be swapped with another one —
 * from the selector row, or from a grid's column head.
 *
 * ONE <style> ELEMENT DRIVES EVERYTHING: the skeleton on the column being
 * dragged, the highlight on the column under the pointer, and the swap's own
 * FLIP animation. A pane can hold a few thousand cells; re-rendering any of
 * them on every pointer move is the thing this file exists to avoid, so
 * nothing here ever touches React state that a cell reads. Every element that
 * takes part carries `data-compare-col={deploymentId}` (and
 * `data-compare-surface`, `'grid' | 'image' | 'selectors'`), and this file
 * only ever selects by those attributes.
 *
 * THERE IS NO LIVE SORTING. Dragging a column does not shift its neighbours
 * out of the way as the pointer crosses them — that collapses the gap under
 * the cursor and makes the drop target guesswork. The drop is a SWAP: the
 * dragged column and whatever is under the pointer at drop time trade places,
 * and the FLIP animation is what sells the trade.
 *
 * SCOPES KEEP UNRELATED DRAGS APART. The pane can render this wrapper once
 * around several document groups' grids, each with its own column heads. A
 * head drag must land only on a head from the SAME group (or the selector
 * row), never a sibling group's — `scope` is `'selectors'` for the selector
 * row and `grid:<unitSlug>:<docKey>` per grid, and collision detection is
 * filtered to it before anything else runs.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import Box from '@mui/material/Box';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';

import { componentTheme } from '../componentTheme';
import { letterFor } from './slotLetter';

/** The data every draggable/droppable column carries. */
interface ColumnDragData {
  deploymentId: string;
  scope: string;
}

function columnData(value: unknown): ColumnDragData | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<ColumnDragData>;
  if (typeof candidate.deploymentId !== 'string' || typeof candidate.scope !== 'string') return undefined;
  return { deploymentId: candidate.deploymentId, scope: candidate.scope };
}

/** How long a swap's FLIP transition runs. Matches the transition rule below. */
const FLIP_DURATION_MS = 200;
/** When the style element is cleared — a little past the transition's own end. */
const FLIP_CLEAR_MS = 260;
/**
 * How stale a pending FLIP may be before it is dropped rather than played.
 *
 * `onReorder` commits through the URL and back; if the router defers that
 * commit (a `startTransition`, a slow re-render) past this window, playing
 * the animation against whatever order eventually lands would show the wrong
 * motion. Dropping it silently is the safe failure: no animation, not a
 * wrong one.
 */
const FLIP_STALE_MS = 1000;

/** A pending swap's before-measurements, waiting for the reorder to land. */
interface PendingFlip {
  /** The `order` this FLIP is waiting to see committed, joined for comparison. */
  expected: string;
  /** `${surface}|${deploymentId}` → that element's rect before the swap. */
  first: Map<string, DOMRect>;
  t: number;
}

/** Read once per column-and-surface: the FIRST element carrying that pair. */
function measure(root: HTMLElement): Map<string, DOMRect> {
  const out = new Map<string, DOMRect>();
  const nodes = root.querySelectorAll<HTMLElement>('[data-compare-col]');
  nodes.forEach((node) => {
    const id = node.dataset.compareCol;
    if (!id) return;
    const surface = node.dataset.compareSurface ?? 'grid';
    const key = `${surface}|${id}`;
    if (out.has(key)) return;
    out.set(key, node.getBoundingClientRect());
  });
  return out;
}

function escapeAttr(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value;
}

export interface CompareColumnDndProps {
  /** Deployment IDs, slot order — slot A (the open deployment) first. */
  order: readonly string[];
  /** Deployment ID → its label, for the drag overlay chip and announcements. */
  labels: ReadonlyMap<string, string>;
  onReorder: (next: string[]) => void;
  children: ReactNode;
}

const CompareDndContext = createContext<{ scopeId: string } | null>(null);

/** True while inside a `CompareColumnDnd` — lets a head decide whether to offer drag at all. */
export function useCompareDndActive(): boolean {
  return useContext(CompareDndContext) !== null;
}

/**
 * ArrowLeft/ArrowRight move the active column to the previous/next droppable
 * IN ITS OWN SCOPE, by centre-x. ArrowUp/ArrowDown are not handled — the
 * image surface's columns are lines, not drag sources, so there is no
 * vertical drag to give them to.
 */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { active, currentCoordinates, context }) => {
  if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return undefined;

  // `active` is the DRAGGABLE's id, not a droppable one — the two differ by
  // the `|drop|` infix `useCompareColumnDrag` gives the droppable half of the
  // pair — so the active column's own scope has to come from the draggable
  // registry, and matching a target has to go by `deploymentId`, never by
  // comparing `active` against a droppable's id directly.
  const activeData = columnData(context.draggableNodes.get(active)?.data.current);
  if (!activeData) return undefined;

  const entries: { deploymentId: string; rect: ClientRect }[] = [];
  context.droppableContainers.forEach((container) => {
    const data = columnData(container.data.current);
    if (!data || data.scope !== activeData.scope) return;
    const rect = context.droppableRects.get(container.id);
    if (rect) entries.push({ deploymentId: data.deploymentId, rect });
  });
  entries.sort((a, b) => a.rect.left - b.rect.left);

  const activeIndex = entries.findIndex((entry) => entry.deploymentId === activeData.deploymentId);
  if (activeIndex === -1) return undefined;
  const targetIndex = activeIndex + (event.code === 'ArrowRight' ? 1 : -1);
  const target = entries[targetIndex];
  if (!target) return undefined;

  event.preventDefault();
  const current = entries[activeIndex]?.rect;
  if (!current) return undefined;
  const dx = target.rect.left + target.rect.width / 2 - (current.left + current.width / 2);
  return { x: currentCoordinates.x + dx, y: currentCoordinates.y };
};

/** Only ever consider droppables in the active drag's own scope. */
const collisionDetection: CollisionDetection = (args) => {
  const scope = columnData(args.active.data.current)?.scope;
  const sameScope = args.droppableContainers.filter((c) => columnData(c.data.current)?.scope === scope);
  const filtered = { ...args, droppableContainers: sameScope };
  const pointerHits = pointerWithin(filtered);
  return pointerHits.length > 0 ? pointerHits : closestCenter(filtered);
};

const CHIP_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px 4px 6px',
  borderRadius: `${componentTheme.radiusMd}px`,
  border: `1px solid ${componentTheme.borderEdge}`,
  background: componentTheme.bgDefault,
  boxShadow: componentTheme.shadowMd,
  fontFamily: componentTheme.fontMono,
  fontSize: 12,
  fontWeight: 700,
  color: componentTheme.fgDefault,
  cursor: 'grabbing',
} as const;

const CHIP_LETTER_SX = {
  flex: 'none',
  width: 16,
  height: 16,
  borderRadius: '4px',
  display: 'grid',
  placeItems: 'center',
  fontFamily: componentTheme.fontMono,
  fontSize: 9.5,
  fontWeight: 700,
  color: componentTheme.fgOnEmphasis,
  background: componentTheme.fgDefault,
} as const;

export function CompareColumnDnd({ order, labels, onReorder, children }: CompareColumnDndProps): ReactElement {
  const scopeId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const pendingRef = useRef<PendingFlip | null>(null);
  /**
   * Backstop for a pending swap that never gets consumed by the `orderKey`
   * effect below — the host ignored or rejected the reorder, or two quick
   * drags landed on the same committed order and cancelled each other out.
   * Without this the skeleton (`writeStyle({source: a})` in `handleDragEnd`)
   * stays on the column forever, since nothing else would ever clear it.
   */
  const fallbackTimerRef = useRef<number | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const scopeSelector = `[data-compare-dnd="${escapeAttr(scopeId)}"]`;

  const writeStyle = useCallback(
    (state: { source?: string; over?: string }) => {
      const el = styleRef.current;
      if (!el) return;
      const rules: string[] = [];
      if (state.source) {
        const src = escapeAttr(state.source);
        rules.push(
          `${scopeSelector} [data-compare-col="${src}"] > * { visibility: hidden; }`,
          `${scopeSelector} [data-compare-col="${src}"] { position: relative; }`,
          `${scopeSelector} [data-compare-col="${src}"]::after { content: ''; position: absolute; inset: 4px 6px; border-radius: 4px; background: ${componentTheme.bgInset}; animation: compare-skel 1.2s ease-in-out infinite; }`,
          `@keyframes compare-skel { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }`,
          `@media (prefers-reduced-motion: reduce) { ${scopeSelector} [data-compare-col="${src}"]::after { animation: none; } }`,
        );
      }
      if (state.over && state.over !== state.source) {
        const over = escapeAttr(state.over);
        rules.push(
          `${scopeSelector} [data-compare-col="${over}"] { background-color: ${componentTheme.accentMuted} !important; box-shadow: inset 0 0 0 1px ${componentTheme.accent}; }`,
        );
      }
      el.textContent = rules.join('\n');
    },
    [scopeSelector],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id);
      const source = columnData(event.active.data.current)?.deploymentId;
      writeStyle({ source });
    },
    [writeStyle],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const source = columnData(event.active.data.current)?.deploymentId;
      const over = columnData(event.over?.data.current)?.deploymentId;
      writeStyle({ source, over: over && over !== source ? over : undefined });
    },
    [writeStyle],
  );

  const handleDragCancel = useCallback(
    () => {
      setActiveId(null);
      writeStyle({});
    },
    [writeStyle],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const a = columnData(event.active.data.current)?.deploymentId;
      const b = columnData(event.over?.data.current)?.deploymentId;
      if (!a || !b || a === b) {
        writeStyle({});
        return;
      }
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 || bi === -1) {
        writeStyle({});
        return;
      }
      const next = [...order];
      next[ai] = order[bi] as string;
      next[bi] = order[ai] as string;

      const root = rootRef.current;
      pendingRef.current = { expected: next.join(','), first: root ? measure(root) : new Map(), t: performance.now() };
      // The skeleton stays on the dragged column until the swap actually
      // commits, so nothing visibly jumps between the drop and the reorder
      // landing.
      writeStyle({ source: a });

      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = window.setTimeout(() => {
        fallbackTimerRef.current = null;
        // Still here past the same staleness window the orderKey effect
        // itself honours — that effect never ran (or ran for an unrelated
        // order change) and consumed this pending swap, so nothing else is
        // going to clear the skeleton. Clear it directly.
        if (pendingRef.current) {
          pendingRef.current = null;
          writeStyle({});
        }
      }, FLIP_STALE_MS);

      onReorder(next);
    },
    [order, onReorder, writeStyle],
  );

  const orderKey = order.join(',');
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    // This effect is the normal path for consuming a pending swap — cancel
    // the `handleDragEnd` backstop so it does not also fire and find nothing
    // left to clear.
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const stale = performance.now() - pending.t > FLIP_STALE_MS;
    if (stale || pending.expected !== orderKey) {
      writeStyle({});
      return;
    }
    const root = rootRef.current;
    const el = styleRef.current;
    if (!root || !el) return;

    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      el.textContent = '';
      return;
    }

    const last = measure(root);
    const rules: string[] = [];
    pending.first.forEach((firstRect, key) => {
      const lastRect = last.get(key);
      if (!lastRect) return;
      const parts = key.split('|');
      const surface = parts[0] ?? 'grid';
      const id = parts.slice(1).join('|');
      if (!id) return;
      const axis = surface === 'image' ? 'y' : 'x';
      const dx = firstRect.left - lastRect.left;
      const dy = firstRect.top - lastRect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      const transform = axis === 'y' ? `translateY(${dy}px)` : `translateX(${dx}px)`;
      rules.push(
        `${scopeSelector} [data-compare-surface="${surface}"][data-compare-col="${escapeAttr(id)}"] { transform: ${transform}; transition: none; }`,
      );
    });

    if (rules.length === 0) return;
    el.textContent = rules.join('\n');
    // Force a reflow so the transform above is committed before the next
    // frame flips it into a transition — otherwise the browser can coalesce
    // both style writes and there is nothing to animate FROM.
    root.getBoundingClientRect();

    const raf = requestAnimationFrame(() => {
      el.textContent = `${scopeSelector} [data-compare-col] { transition: transform ${FLIP_DURATION_MS}ms cubic-bezier(.2,0,0,1); } @media (prefers-reduced-motion: reduce) { ${scopeSelector} [data-compare-col] { transition: none; } }`;
    });
    const timer = window.setTimeout(() => {
      el.textContent = '';
    }, FLIP_CLEAR_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, scopeSelector, writeStyle]);

  useEffect(
    () => () => {
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
    },
    [],
  );

  const getLabel = useCallback((id: string) => labels.get(id) ?? id, [labels]);

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart({ active }) {
        const id = columnData(active.data.current)?.deploymentId;
        return id ? `Picked up column ${getLabel(id)}.` : undefined;
      },
      onDragOver({ active, over }) {
        const a = columnData(active.data.current)?.deploymentId;
        const b = columnData(over?.data.current)?.deploymentId;
        if (!a || !b || a === b) return undefined;
        return `Over column ${getLabel(b)}: drop to swap with ${getLabel(a)}.`;
      },
      onDragEnd({ active, over }) {
        const a = columnData(active.data.current)?.deploymentId;
        const b = columnData(over?.data.current)?.deploymentId;
        if (!a || !b || a === b) return `Column ${a ? getLabel(a) : ''} dropped without a swap.`;
        return `Swapped ${getLabel(a)} and ${getLabel(b)}.`;
      },
      onDragCancel({ active }) {
        const id = columnData(active.data.current)?.deploymentId;
        return `Cancelled${id ? ` — ${getLabel(id)} stays where it was` : ''}.`;
      },
    }),
    [getLabel],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  // `activeId` is the compound `${scope}|${deploymentId}` string; recover the
  // deployment id from `order` matching, since dnd-kit only hands the id back.
  const activeLabel = useMemo(() => {
    if (!activeId) return undefined;
    const id = order.find((candidate) => String(activeId).endsWith(`|${candidate}`));
    return id ? { id, index: order.indexOf(id) } : undefined;
  }, [activeId, order]);

  return (
    <CompareDndContext.Provider value={{ scopeId }}>
      <Box
        ref={rootRef}
        data-compare-dnd={scopeId}
        sx={{ display: 'contents' }}
      >
        <style ref={styleRef} />
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          accessibility={{ announcements }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          {children}
          <DragOverlay dropAnimation={null}>
            {activeLabel ? (
              <Box sx={CHIP_SX}>
                <Box component="span" sx={CHIP_LETTER_SX}>{letterFor(activeLabel.index)}</Box>
                {getLabel(activeLabel.id)}
              </Box>
            ) : null}
          </DragOverlay>
        </DndContext>
      </Box>
    </CompareDndContext.Provider>
  );
}

export interface CompareColumnDragHandle {
  setNodeRef: (element: HTMLElement | null) => void;
  listeners: DraggableSyntheticListeners;
  attributes: DraggableAttributes;
  isDragging: boolean;
}

/**
 * Make one column a drag source AND a drop target, in `scope`.
 *
 * `scope` absent means "no `CompareColumnDnd` wrapper for this column" — the
 * caller still gets a stable (inert) handle back, so it can spread the same
 * props whether or not dragging is wired up here.
 */
export function useCompareColumnDrag(deploymentId: string, scope: string | undefined): CompareColumnDragHandle {
  const dragId = `${scope ?? 'inert'}|${deploymentId}`;
  const dropId = `${scope ?? 'inert'}|drop|${deploymentId}`;
  const data = useMemo<ColumnDragData | undefined>(
    () => (scope ? { deploymentId, scope } : undefined),
    [deploymentId, scope],
  );

  const draggable = useDraggable({
    id: dragId,
    data,
    disabled: !scope,
    attributes: { roleDescription: 'draggable column' },
  });
  const droppable = useDroppable({ id: dropId, data, disabled: !scope });

  const setNodeRef = useCallback(
    (element: HTMLElement | null) => {
      draggable.setNodeRef(element);
      droppable.setNodeRef(element);
    },
    [draggable, droppable],
  );

  return {
    setNodeRef,
    listeners: scope ? draggable.listeners : undefined,
    attributes: draggable.attributes,
    isDragging: draggable.isDragging,
  };
}
