// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Node } from 'reactflow';

import type { Rect } from './fold/foldViewport';

/** How long a node takes to move to its new place, and a folding card to fade. */
export const FOLD_TRANSITION_MS = 450;
/** On every node that moves when the fold changes; the CSS lives on the flow container. */
export const FOLD_ANIMATE_CLASS = 'fold-animate';
/** A card that is folding into its stack: a copy that moves there and fades out. */
export const FOLD_GHOST_CLASS = 'fold-ghost';
/** Added to a ghost once it is on screen at its start, to start the fade and shrink. */
export const FOLD_GHOST_LEAVING_CLASS = 'fold-ghost-leaving';

const GHOST_ID_PREFIX = '__fold-ghost__:';
const ANIMATED_TYPES: ReadonlySet<string | undefined> = new Set([
  'deploymentNode',
  'stackNode',
  'foldFrameNode',
  'componentFrameNode',
  'expandFrameNode',
]);

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The user's reduced-motion setting, kept current when they change it. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

interface Snapshot {
  deploymentNodes: Map<string, Node>;
  stackRectById: ReadonlyMap<string, Rect>;
}

interface UseFoldTransitionsInput {
  nodes: Node[];
  /** Deployment id -> the rect of the closed stack it is in, in the layout of `nodes`. */
  stackRectById: ReadonlyMap<string, Rect>;
  reducedMotion: boolean;
  /**
   * False until the first Fit of a folded graph. On the first layout every
   * node would slide in from where reactflow first put it, which is motion
   * that means nothing.
   */
  enabled: boolean;
}

const NO_START: ReadonlyMap<string, { x: number; y: number }> = new Map();

const withClass = (className: string | undefined, add: string): string =>
  className ? `${className} ${add}` : add;

/** Double rAF: the start state must be painted before the end state is set. */
function afterPaint(run: () => void): () => void {
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(run);
  });
  return () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
}

/**
 * Motion for a folded graph, so the eye can follow a Deployment when a poll
 * moves it. Nodes that stay in the graph slide to their new place. A card
 * that folds into a closed stack stays for FOLD_TRANSITION_MS as a copy that
 * moves into the stack's cell, shrinks and fades. A Deployment that breaks
 * out of a closed stack starts at the stack and moves to its card slot.
 *
 * With reduced motion asked for, nothing animates and everything moves at
 * once.
 */
export function useFoldTransitions({
  nodes,
  stackRectById,
  reducedMotion,
  enabled,
}: UseFoldTransitionsInput): Node[] {
  const animate = enabled && !reducedMotion;
  const [ghosts, setGhosts] = useState<Node[]>([]);
  const [startById, setStartById] =
    useState<ReadonlyMap<string, { x: number; y: number }>>(NO_START);
  const previousRef = useRef<Snapshot | null>(null);
  // Frames and timers still to run; a new graph or an unmount cancels them.
  const pendingRef = useRef(new Set<() => void>());

  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      for (const cancel of pending) cancel();
      pending.clear();
    };
  }, []);

  // A layout effect, so the start positions are in place before the browser
  // paints the new layout at all.
  useLayoutEffect(() => {
    const current = new Map<string, Node>();
    for (const n of nodes) if (n.type === 'deploymentNode') current.set(n.id, n);
    const previous = previousRef.current;
    previousRef.current = { deploymentNodes: current, stackRectById };

    const pending = pendingRef.current;
    if (!animate || !previous) {
      for (const cancel of pending) cancel();
      pending.clear();
      setGhosts((g) => (g.length === 0 ? g : []));
      setStartById((s) => (s.size === 0 ? s : NO_START));
      return;
    }

    const leaving: { ghost: Node; to: { x: number; y: number } }[] = [];
    for (const [id, node] of previous.deploymentNodes) {
      if (current.has(id)) continue;
      // Only a card that folded has a place to go. A Deployment that left
      // the Component just goes.
      const stack = stackRectById.get(id);
      if (!stack) continue;
      const width = node.width ?? stack.width;
      const height = node.height ?? stack.height;
      leaving.push({
        ghost: {
          ...node,
          id: `${GHOST_ID_PREFIX}${id}`,
          className: withClass(
            withClass(node.className, FOLD_ANIMATE_CLASS),
            FOLD_GHOST_CLASS,
          ),
          width,
          height,
          selected: false,
          selectable: false,
          focusable: false,
          draggable: false,
          connectable: false,
          // Above the stack it folds into, so it is seen going in.
          zIndex: 5,
          ariaLabel: undefined,
          style: { ...node.style, pointerEvents: 'none' },
        },
        to: {
          x: stack.x + (stack.width - width) / 2,
          y: stack.y + (stack.height - height) / 2,
        },
      });
    }

    const starts = new Map<string, { x: number; y: number }>();
    for (const id of current.keys()) {
      if (previous.deploymentNodes.has(id)) continue;
      const stack = previous.stackRectById.get(id);
      if (stack) starts.set(id, { x: stack.x, y: stack.y });
    }

    if (leaving.length === 0 && starts.size === 0) return;

    const leavingIds = new Set(leaving.map((l) => l.ghost.id));
    if (leaving.length > 0) {
      setGhosts((g) => [
        ...g.filter((n) => !leavingIds.has(n.id)),
        ...leaving.map((l) => l.ghost),
      ]);
    }
    if (starts.size > 0) setStartById((s) => new Map([...s, ...starts]));

    const cancelMove = afterPaint(() => {
      pending.delete(cancelMove);
      if (leaving.length > 0) {
        const toById = new Map(leaving.map((l) => [l.ghost.id, l.to]));
        setGhosts((g) =>
          g.map((n) => {
            const to = toById.get(n.id);
            return to
              ? {
                  ...n,
                  position: to,
                  className: withClass(n.className, FOLD_GHOST_LEAVING_CLASS),
                }
              : n;
          }),
        );
      }
      if (starts.size > 0) {
        setStartById((s) => {
          const next = new Map(s);
          for (const id of starts.keys()) next.delete(id);
          return next.size === 0 ? NO_START : next;
        });
      }
    });
    pending.add(cancelMove);

    if (leaving.length > 0) {
      const cancelRemove = () => window.clearTimeout(timer);
      const timer = window.setTimeout(() => {
        pending.delete(cancelRemove);
        setGhosts((g) => g.filter((n) => !leavingIds.has(n.id)));
      }, FOLD_TRANSITION_MS);
      pending.add(cancelRemove);
    }
  }, [nodes, stackRectById, animate]);

  return useMemo(() => {
    if (!animate) return nodes;
    const out = nodes.map((n) => {
      if (!ANIMATED_TYPES.has(n.type)) return n;
      const start = startById.get(n.id);
      return {
        ...n,
        className: withClass(n.className, FOLD_ANIMATE_CLASS),
        ...(start && { position: start, style: { ...n.style, opacity: 0 } }),
      };
    });
    return ghosts.length > 0 ? [...out, ...ghosts] : out;
  }, [animate, nodes, startById, ghosts]);
}
