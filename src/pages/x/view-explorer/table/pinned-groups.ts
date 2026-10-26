// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { FlatItem, GroupNode } from '../model/grouping';

/**
 * Which group headers stay pinned under the column header while the table
 * scrolls, and where. The table is one virtual list of absolutely placed
 * items, so CSS `position: sticky` on a header has no group to stick within;
 * the pinned headers are drawn over the list instead, at the places worked
 * out here. Pure, so it is proven without a browser.
 *
 * Offsets are body offsets: 0 is the top of the first item, and the scroll
 * position is how far the body has scrolled under the column header.
 */

export interface GroupSpans {
  /** Where each item starts; one more entry than there are items, the last being the total height. */
  starts: readonly number[];
  /** For a group header, the index just past its last item; -1 for a row. */
  ends: readonly number[];
  /** The index of the closest group header that holds the item; -1 for none. */
  parents: readonly number[];
}

export function groupSpans<R>(items: readonly FlatItem<R>[], sizeOf: (item: FlatItem<R>) => number): GroupSpans {
  const starts = new Array<number>(items.length + 1);
  const ends = new Array<number>(items.length).fill(-1);
  const parents = new Array<number>(items.length).fill(-1);
  // The open group headers, outermost first.
  const open: number[] = [];
  let at = 0;
  items.forEach((item, i) => {
    starts[i] = at;
    at += sizeOf(item);
    if (item.type === 'group') {
      while (open.length && (items[open[open.length - 1]] as { node: GroupNode<R> }).node.depth >= item.node.depth) {
        ends[open.pop() as number] = i;
      }
      parents[i] = open.length ? open[open.length - 1] : -1;
      open.push(i);
    } else {
      parents[i] = open.length ? open[open.length - 1] : -1;
    }
  });
  starts[items.length] = at;
  for (const i of open) ends[i] = items.length;
  return { starts, ends, parents };
}

export interface PinnedGroup<R> {
  /** The header's index in the items. */
  index: number;
  node: GroupNode<R>;
  /** Its top, from the bottom of the column header. Below `depth * height` while the next group pushes it up. */
  top: number;
}

/** The last item that starts at or above `offset`. */
function itemAt(starts: readonly number[], count: number, offset: number): number {
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The group headers to pin at a scroll position, outermost first. Level `d`
 * has its slot `d` header heights below the column header; a group's header
 * is pinned once its own place has scrolled above its slot, and is pushed up
 * as the end of its group reaches the slot, as `position: sticky` would do.
 * Levels that end together move up together, so an outer header is never
 * covered by the inner one of its last subgroup.
 */
export function pinnedGroups<R>(
  items: readonly FlatItem<R>[],
  spans: GroupSpans,
  scrollTop: number,
  headerHeight: number,
): PinnedGroup<R>[] {
  const { starts, ends, parents } = spans;
  const chain: Array<{ index: number; node: GroupNode<R>; end: number }> = [];
  for (let depth = 0; ; depth++) {
    const line = scrollTop + depth * headerHeight;
    // A level's slot line passes its parent's end while the parent is still being
    // pushed out; up to that end, the parent's last subgroup is still the one to show.
    const at = depth > 0 ? Math.min(line, chain[depth - 1].end - 1) : line;
    if (items.length === 0 || at >= starts[items.length]) break;
    let h = itemAt(starts, items.length, at);
    if (items[h].type !== 'group') h = parents[h];
    while (h !== -1 && (items[h] as { node: GroupNode<R> }).node.depth > depth) h = parents[h];
    if (h === -1) break;
    const node = (items[h] as { node: GroupNode<R> }).node;
    if (node.depth !== depth) break;
    if (depth > 0 && parents[h] !== chain[depth - 1].index) break;
    if (starts[h] >= line) break;
    chain.push({ index: h, node, end: starts[ends[h]] });
  }
  const tops = chain.map((c, depth) => Math.min(depth * headerHeight, c.end - scrollTop - headerHeight));
  for (let d = chain.length - 2; d >= 0; d--) {
    if (chain[d].end === chain[d + 1].end) tops[d] = Math.min(tops[d], tops[d + 1] - headerHeight);
  }
  return chain.map((c, d) => ({ index: c.index, node: c.node, top: tops[d] }));
}
