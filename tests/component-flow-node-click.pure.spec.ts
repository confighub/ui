// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What a click on a deployment node in the component graph does, exercised
// directly — no page, no browser, no fixtures.
//
// WHY THIS IS WORTH ASSERTING. The two outcomes look alike on screen (both
// change what the side pane shows), so a regression that routes a modifier
// click to open/close — or drops one of the three modifiers — reads as "compare
// is flaky" rather than as a routing bug. Each modifier is asserted on its own
// because users bring different habits: Shift on any platform, Cmd on macOS,
// Ctrl on Windows and Linux.

import { expect, test } from '@playwright/test';

import {
  resolveNodeClick,
  type NodeClickModifiers,
} from '../src/pages/x/apps/flow-graph/nodeClick';

const PLAIN: NodeClickModifiers = { shiftKey: false, metaKey: false, ctrlKey: false };

test.describe('a plain click opens or closes the side pane', () => {
  test('on a node that is not open, it selects', () => {
    expect(resolveNodeClick(PLAIN, false)).toBe('select');
  });

  test('on the node that is already open, it deselects', () => {
    expect(resolveNodeClick(PLAIN, true)).toBe('deselect');
  });

  test('Alt is not a compare modifier', () => {
    // A DOM event carries altKey too; the router must not treat it as compare.
    const altClick = { ...PLAIN, altKey: true };
    expect(resolveNodeClick(altClick, false)).toBe('select');
    expect(resolveNodeClick(altClick, true)).toBe('deselect');
  });
});

test.describe('a modifier click toggles the comparison', () => {
  const modifiers: Array<[string, NodeClickModifiers]> = [
    ['Shift', { ...PLAIN, shiftKey: true }],
    ['Cmd/Meta', { ...PLAIN, metaKey: true }],
    ['Ctrl', { ...PLAIN, ctrlKey: true }],
  ];

  for (const [name, held] of modifiers) {
    test(`${name}-click toggles compare and never opens or closes the pane`, () => {
      expect(resolveNodeClick(held, false)).toBe('toggle-compare');
      // On the open node too: the pane's own deployment stays open.
      expect(resolveNodeClick(held, true)).toBe('toggle-compare');
    });
  }

  test('any combination of modifiers still means compare', () => {
    for (const shiftKey of [true, false]) {
      for (const metaKey of [true, false]) {
        for (const ctrlKey of [true, false]) {
          const anyHeld = shiftKey || metaKey || ctrlKey;
          for (const alreadySelected of [true, false]) {
            const action = resolveNodeClick({ shiftKey, metaKey, ctrlKey }, alreadySelected);
            expect(action === 'toggle-compare').toBe(anyHeld);
          }
        }
      }
    }
  });
});
