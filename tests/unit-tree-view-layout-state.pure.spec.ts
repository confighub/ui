// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Canvas view on the Unit list rebuilds its graph each time the list is
// refetched (every 5s). Only a change of shape may reset the user's viewport and
// selection; a change of Unit status updates the nodes where they are.
import { expect, test } from '@playwright/test';
import { Position, type Edge, type Node } from 'reactflow';

import {
  flowLayoutKey,
  isNewLayout,
  withNodeData,
} from '../src/components/unit-tree-view/flowLayoutState';

const node = (id: string, x: number, y: number, status: string): Node => ({
  id,
  type: 'unitNode',
  position: { x, y },
  data: { label: id, status },
  sourcePosition: Position.Bottom,
  targetPosition: Position.Top,
});

const edge = (source: string, target: string): Edge => ({
  id: `edge-${source}-${target}`,
  source,
  target,
  type: 'smoothstep',
  animated: false,
  label: 'clones',
  style: { stroke: '#3b82f6' },
});

test.describe('Canvas layout key', () => {
  test('is the same when only node data changed', () => {
    const before = flowLayoutKey([node('unit-a', 0, 0, 'Ready'), node('unit-b', 0, 180, 'Ready')], [edge('unit-a', 'unit-b')]);
    const after = flowLayoutKey([node('unit-a', 0, 0, 'Degraded'), node('unit-b', 0, 180, 'Ready')], [edge('unit-a', 'unit-b')]);
    expect(after).toBe(before);
  });

  test('changes when a node is added, moved by the layout, or re-linked', () => {
    const base = flowLayoutKey([node('unit-a', 0, 0, 'Ready'), node('unit-b', 0, 180, 'Ready')], [edge('unit-a', 'unit-b')]);
    const added = flowLayoutKey(
      [node('unit-a', 0, 0, 'Ready'), node('unit-b', -150, 180, 'Ready'), node('unit-c', 150, 180, 'Ready')],
      [edge('unit-a', 'unit-b'), edge('unit-a', 'unit-c')],
    );
    const moved = flowLayoutKey([node('unit-a', 0, 0, 'Ready'), node('unit-b', 300, 0, 'Ready')], []);
    const relinked = flowLayoutKey([node('unit-a', 0, 0, 'Ready'), node('unit-b', 0, 180, 'Ready')], [edge('unit-b', 'unit-a')]);
    expect(added).not.toBe(base);
    expect(moved).not.toBe(base);
    expect(relinked).not.toBe(base);
  });

  test('changes when the edge kind changes', () => {
    const clone = edge('unit-a', 'unit-b');
    const link: Edge = { ...clone, animated: true, label: 'links to', style: { stroke: '#10b981' } };
    const nodes = [node('unit-a', 0, 0, 'Ready'), node('unit-b', 0, 180, 'Ready')];
    expect(flowLayoutKey(nodes, [link])).not.toBe(flowLayoutKey(nodes, [clone]));
  });
});

test.describe('Canvas node data update', () => {
  test('keeps position and selection, and takes the new data', () => {
    // The view's copy: the user selected unit-b, and the view has measured it.
    const current: Node[] = [
      node('unit-a', 0, 0, 'Ready'),
      { ...node('unit-b', 40, 220, 'Ready'), selected: true, width: 250, height: 80 },
    ];
    const next = [node('unit-a', 0, 0, 'Ready'), node('unit-b', 0, 180, 'Degraded')];

    const merged = withNodeData(current, next);

    expect(merged[1]).toMatchObject({
      id: 'unit-b',
      position: { x: 40, y: 220 },
      selected: true,
      width: 250,
      height: 80,
      data: { status: 'Degraded' },
    });
    expect(merged[0].data).toBe(next[0].data);
  });
});

test.describe('Canvas layout replacement', () => {
  const linked = { view: 'link/unit', key: 'with-edges' };
  const linkless = { view: 'link/unit', key: 'without-edges' };

  test('shows the first layout, even when a Link fetch failed', () => {
    expect(isNewLayout(null, linkless, false)).toBe(true);
  });

  test('replaces the layout when the shape changed', () => {
    expect(isNewLayout(linked, linkless, true)).toBe(true);
    expect(isNewLayout(linked, linked, true)).toBe(false);
  });

  test('keeps the layout on screen when a Link fetch failed on a refetch', () => {
    // The refetch lost its edges, so its key differs; the user's graph must stay.
    expect(isNewLayout(linked, linkless, false)).toBe(false);
    // The next good refetch has the same shape as before, so nothing resets either.
    expect(isNewLayout(linked, linked, true)).toBe(false);
  });

  test('replaces the layout when the view changed, even when a Link fetch failed', () => {
    const clone = { view: 'clone/unit', key: 'with-edges' };
    expect(isNewLayout(clone, linkless, false)).toBe(true);
  });
});
