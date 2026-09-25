// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Shared recursive subtree-centering Y-layout algorithm. Extracted (byte-
 * identical math) from `flowLayout.ts`'s `computeLayout` (auto mode's
 * inline `calcHeight`/`positionNode`) so the fan-out centering logic has a
 * single implementation. See `flowLayout.ts` for the (sole) call site — that
 * refactor was required to produce pixel-identical output to the original
 * inline version.
 *
 * For each root (and recursively each node), children are laid out first;
 * a parent is then centered at the midpoint of its first and last child's Y
 * — this is what produces the clean fan-out layouts auto mode is known for.
 * Handles a FOREST (multiple roots), not just a single tree — auto mode
 * already has multiple roots today (one per base/root deployment).
 *
 * Cycle safety: a cycle is broken deterministically by refusing to recurse
 * into a child that is already an ancestor on the CURRENT recursion path —
 * that child is excluded from its would-be parent's children for this
 * computation, effectively orphaning it (like a root with no incoming edge)
 * rather than infinite-looping or crashing. An orphaned-by-cycle-break node
 * still gets a Y via the defensive fallback pass below. (Unreachable for
 * auto mode's DAG-derived `childrenOf` in practice — auto mode's promotion
 * graph can't cycle — but kept as a general-purpose guarantee of this
 * shared function.)
 */
export function computeSubtreeCenteredY(
  ids: string[],
  childrenOf: Map<string, string[]>,
  roots: string[],
  nodeHeight: number,
  nodeGap: number,
  topMargin: number,
): Map<string, number> {
  // ── Pass 1: subtree heights (in "number of leaf rows") ──
  const subtreeHeight = new Map<string, number>();

  function calcHeight(id: string, ancestors: Set<string>): number {
    if (subtreeHeight.has(id)) return subtreeHeight.get(id)!;
    // Cycle guard: a child that's already an ancestor on this recursion
    // path is excluded here (not recursed into) rather than looping.
    const children = (childrenOf.get(id) ?? []).filter((cid) => !ancestors.has(cid));
    if (children.length === 0) {
      subtreeHeight.set(id, 1);
      return 1;
    }
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    const h = children.reduce((sum, cid) => sum + calcHeight(cid, nextAncestors), 0);
    subtreeHeight.set(id, h);
    return h;
  }

  ids.forEach((id) => calcHeight(id, new Set()));

  // ── Pass 2: positions, children-first, parent centered on first/last child ──
  const yById = new Map<string, number>();

  function positionNode(id: string, minY: number, ancestors: Set<string>): number {
    const children = (childrenOf.get(id) ?? []).filter((cid) => !ancestors.has(cid));
    const height = subtreeHeight.get(id) ?? 1;

    let y: number;
    if (children.length === 0) {
      y = minY;
    } else {
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(id);
      let childY = minY;
      children.forEach((cid) => {
        childY = positionNode(cid, childY, nextAncestors);
      });

      const firstChildY = yById.get(children[0]);
      const lastChildY = yById.get(children[children.length - 1]);
      if (firstChildY !== undefined && lastChildY !== undefined) {
        y = (firstChildY + lastChildY) / 2;
      } else {
        y = minY + ((height - 1) * (nodeHeight + nodeGap)) / 2;
      }
    }

    yById.set(id, y);
    return minY + height * (nodeHeight + nodeGap);
  }

  let nextY = topMargin;
  roots.forEach((rootId) => {
    nextY = positionNode(rootId, nextY, new Set());
  });

  // Defensive: every id in the input list gets SOME Y, even one never
  // reached via roots/childrenOf (shouldn't happen given every id is either
  // a root or has a parent, but a cycle-break can orphan a node that isn't
  // itself in the `roots` list either).
  ids.forEach((id) => {
    if (!yById.has(id)) {
      yById.set(id, nextY);
      nextY += nodeHeight + nodeGap;
    }
  });

  return yById;
}
