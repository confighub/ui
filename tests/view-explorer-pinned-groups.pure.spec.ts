// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Pinned group headers: which headers stay under the column header at a
 * scroll position, stacked one level per slot, and how the end of a group
 * pushes its header (and the headers of groups that end with it) up.
 */
import { expect, test } from '@playwright/test';

import { buildGroupTree, flattenGroups, type FlatItem, type GroupLevel } from '../src/pages/x/view-explorer/model/grouping';
import { groupSpans, pinnedGroups } from '../src/pages/x/view-explorer/table/pinned-groups';

interface Row {
  id: number;
  target: string;
  space: string;
}

const G = 10; // a group header
const R = 4; // a row
const size = (item: FlatItem<Row>) => (item.type === 'group' ? G : R);

const byTarget: GroupLevel<Row> = { field: 'Target', value: (r) => r.target };
const bySpace: GroupLevel<Row> = { field: 'Space', value: (r) => r.space };

/** Target a: Space x (10 rows), Space y (5 rows); Target b: Space z (3 rows). */
const ROWS: Row[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: i, target: 'a', space: 'x' })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: 10 + i, target: 'a', space: 'y' })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: 15 + i, target: 'b', space: 'z' })),
];

function layout(levels: GroupLevel<Row>[], collapsed: ReadonlySet<string> = new Set()) {
  const items = flattenGroups(ROWS, buildGroupTree(ROWS, levels), collapsed);
  return { items, spans: groupSpans(items, size) };
}

const pins = (l: ReturnType<typeof layout>, scrollTop: number) =>
  pinnedGroups(l.items, l.spans, scrollTop, G).map((p) => ({ key: p.node.key, top: p.top }));

test.describe('group spans', () => {
  test('starts, ends and parents follow the flattened items', () => {
    const { items, spans } = layout([byTarget, bySpace]);
    // a, x, 10 rows, y, 5 rows, b, z, 3 rows
    expect(items).toHaveLength(23);
    expect(spans.starts[0]).toBe(0);
    expect(spans.starts[1]).toBe(G);
    expect(spans.starts[2]).toBe(2 * G);
    expect(spans.starts[23]).toBe(5 * G + 18 * R);
    expect(spans.ends[0]).toBe(18); // Target a ends before Target b
    expect(spans.ends[1]).toBe(12); // Space x ends before Space y
    expect(spans.ends[12]).toBe(18);
    expect(spans.ends[18]).toBe(23);
    expect(spans.ends[2]).toBe(-1);
    expect(spans.parents[0]).toBe(-1);
    expect(spans.parents[1]).toBe(0);
    expect(spans.parents[2]).toBe(1);
    expect(spans.parents[12]).toBe(0);
  });
});

test.describe('pinned group headers', () => {
  test('nothing is pinned at the top, or without groups', () => {
    expect(pins(layout([byTarget, bySpace]), 0)).toEqual([]);
    expect(pins(layout([]), 50)).toEqual([]);
  });

  test('inside a group, its header and its parent are stacked one slot each', () => {
    const l = layout([byTarget, bySpace]);
    expect(pins(l, 25)).toEqual([
      { key: 'Target=a', top: 0 },
      { key: 'Target=a/Space=x', top: G },
    ]);
  });

  test('the end of a subgroup pushes only its own header up, under the outer one', () => {
    const l = layout([byTarget, bySpace]);
    // Space x ends at 2G + 10R = 60; its header leaves the slot at G as the end passes 2G.
    expect(pins(l, 40)).toEqual([
      { key: 'Target=a', top: 0 },
      { key: 'Target=a/Space=x', top: G },
    ]);
    expect(pins(l, 45)).toEqual([
      { key: 'Target=a', top: 0 },
      { key: 'Target=a/Space=x', top: 60 - 45 - G },
    ]);
    // Past it, Space y is pinned in its place.
    expect(pins(l, 61)).toEqual([
      { key: 'Target=a', top: 0 },
      { key: 'Target=a/Space=y', top: G },
    ]);
  });

  test('levels that end together move up together', () => {
    const l = layout([byTarget, bySpace]);
    // Target a and Space y both end at 3G + 15R = 90.
    expect(pins(l, 75)).toEqual([
      { key: 'Target=a', top: 0 - 5 },
      { key: 'Target=a/Space=y', top: G - 5 },
    ]);
    // Exactly at Target b's header, it is in its own place: nothing to pin.
    expect(pins(l, 90)).toEqual([]);
    // Past it, Target b and its first Space are pinned.
    expect(pins(l, 91)).toEqual([
      { key: 'Target=b', top: 0 },
      { key: 'Target=b/Space=z', top: G },
    ]);
  });

  test('the last subgroup stays pinned, under its parent, until both have slid out', () => {
    const l = layout([byTarget, bySpace]);
    // Target a and Space y both end at 90: from 80 on, Space y's header goes above the slot line.
    expect(pins(l, 80)).toEqual([
      { key: 'Target=a', top: -G },
      { key: 'Target=a/Space=y', top: 0 },
    ]);
    expect(pins(l, 89)).toEqual([
      { key: 'Target=a', top: -G - 9 },
      { key: 'Target=a/Space=y', top: -9 },
    ]);
  });

  for (const [name, levels, collapsed] of [
    ['one level', [byTarget], new Set<string>()],
    ['two levels', [byTarget, bySpace], new Set<string>()],
    ['two levels, one folded', [byTarget, bySpace], new Set(['Target=a/Space=x'])],
  ] as const) {
    test(`${name}: scrolling a pixel at a time, a header moves at most a pixel, and leaves or arrives only at the edge`, () => {
      const l = layout([...levels], collapsed);
      const total = l.spans.starts[l.items.length];
      let before = new Map<number, number>();
      for (let s = 0; s <= total; s++) {
        const now = new Map(pinnedGroups(l.items, l.spans, s, G).map((p) => [p.index, p.top]));
        for (const [index, top] of now) {
          const was = before.get(index);
          // Natural place of the header before and after this pixel.
          const natural = l.spans.starts[index] - s;
          if (was === undefined) {
            expect(top, `header ${index} arrives at ${s} where it was`).toBeGreaterThanOrEqual(natural);
            expect(top, `header ${index} arrives at ${s} where it was`).toBeLessThanOrEqual(natural + 1);
          } else {
            expect(was - top, `header ${index} at ${s}`).toBeGreaterThanOrEqual(0);
            expect(was - top, `header ${index} at ${s}`).toBeLessThanOrEqual(1);
          }
        }
        for (const [index, top] of before) {
          if (now.has(index)) continue;
          // Out of sight: above the column header, or wholly under its parent's pinned header.
          const parentTop = now.get(l.spans.parents[index]);
          const edge = parentTop === undefined ? 0 : parentTop + G;
          expect(top - 1 + G, `header ${index} leaves at ${s} out of sight`).toBeLessThanOrEqual(edge);
        }
        before = now;
      }
    });
  }

  test('one level: the next group pushes the header out', () => {
    const l = layout([byTarget]);
    // Target a: header at 0, 15 rows to 70.
    expect(pins(l, 30)).toEqual([{ key: 'Target=a', top: 0 }]);
    expect(pins(l, 65)).toEqual([{ key: 'Target=a', top: 70 - 65 - G }]);
    expect(pins(l, 71)).toEqual([{ key: 'Target=b', top: 0 }]);
  });

  test('a folded group pins nothing under it', () => {
    const l = layout([byTarget, bySpace], new Set(['Target=a/Space=x']));
    // a, x (folded), y, 5 rows, ...: inside Space y.
    expect(pins(l, 25)).toEqual([
      { key: 'Target=a', top: 0 },
      { key: 'Target=a/Space=y', top: G },
    ]);
  });
});
