// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The canvas toolbar shares the top row with the Auto / Custom toggle. When
// the side pane narrows the canvas, the toolbar gives up space in steps and
// never reaches the toggle.
import { expect, test } from '@playwright/test';

import { groupByButtonLabel } from '../src/pages/x/apps/flow-graph/fold/groupBy';
import {
  GROUP_COMPACT_WIDTH,
  PANEL_MARGIN,
  SEARCH_FULL_WIDTH,
  SEARCH_ICON_WIDTH,
  SEARCH_MIN_WIDTH,
  TOGGLE_RESERVE,
  TOOLBAR_GAP,
  fitToolbar,
  groupButtonWidth,
  toolbarRoom,
} from '../src/pages/x/apps/flow-graph/toolbarFit';

const roomBesideToggle = toolbarRoom;

const widthOf = (fit: ReturnType<typeof fitToolbar>, label: string) =>
  (fit.search === 'icon' ? SEARCH_ICON_WIDTH : fit.search) +
  TOOLBAR_GAP +
  (fit.groupCompact ? GROUP_COMPACT_WIDTH : groupButtonWidth(label));

test('a wide canvas shows the full search field and the Group by label', () => {
  expect(fitToolbar(roomBesideToggle(1224), 'Department')).toEqual({
    groupCompact: false,
    search: SEARCH_FULL_WIDTH,
  });
});

test('before it is measured, the toolbar shows at full size', () => {
  expect(fitToolbar(null, 'Department')).toEqual({
    groupCompact: false,
    search: SEARCH_FULL_WIDTH,
  });
});

test('1440 with the pane open (460 px canvas): the label goes, search narrows', () => {
  const fit = fitToolbar(roomBesideToggle(460), 'Department');
  expect(fit.groupCompact).toBe(true);
  expect(fit.search).toBeGreaterThanOrEqual(SEARCH_MIN_WIDTH);
  expect(fit.search).toBeLessThan(SEARCH_FULL_WIDTH);
});

test('1280 with the pane open (332 px canvas): search folds to its icon', () => {
  expect(fitToolbar(roomBesideToggle(332), 'Department')).toEqual({
    groupCompact: true,
    search: 'icon',
  });
});

test('at every width the toolbar fits its room, down to the two icons', () => {
  const smallest = SEARCH_ICON_WIDTH + TOOLBAR_GAP + GROUP_COMPACT_WIDTH;
  for (const label of ['Region', 'Department', 'Kubernetes version', 'Off']) {
    for (let room = smallest; room <= 900; room += 7) {
      expect(
        widthOf(fitToolbar(room, label), label),
        `${label} at ${room}`,
      ).toBeLessThanOrEqual(room);
    }
  }
});

test.describe('the Group by button always works in Auto mode', () => {
  test('an unfolded graph shows Off, never "Not needed"', () => {
    expect(groupByButtonLabel(false, null)).toBe('Off');
    expect(groupByButtonLabel(false, 'Department')).toBe('Off');
  });

  test('a folded graph shows its key, or None when no label splits', () => {
    expect(groupByButtonLabel(true, 'Stage')).toBe('Stage');
    expect(groupByButtonLabel(true, null)).toBe('None');
  });
});

test.describe('the toolbar never reaches the Graph / Dashboard toggle', () => {
  /** The toggle's real width and inset; the reserve adds a gap to them. */
  const TOGGLE_LEFT_EDGE_FROM_RIGHT = 185 + 12;

  test('the reserve leaves a gap between the toolbar row and the toggle', () => {
    expect(TOGGLE_RESERVE).toBeGreaterThanOrEqual(TOGGLE_LEFT_EDGE_FROM_RIGHT + 8);
  });

  test('from a 320 px canvas up, the fitted toolbar ends before the toggle starts', () => {
    for (const label of ['Region', 'Department', 'Kubernetes version', 'Off']) {
      for (let canvas = 320; canvas <= 1400; canvas += 11) {
        const right = PANEL_MARGIN + widthOf(fitToolbar(toolbarRoom(canvas), label), label);
        expect(right, `${label} in ${canvas}`).toBeLessThanOrEqual(
          canvas - TOGGLE_LEFT_EDGE_FROM_RIGHT,
        );
      }
    }
  });

  test('1440 and 1280 with the pane open keep Group by, as an icon, left of the toggle', () => {
    // The canvas is 460 px wide at 1440 and 332 px at 1280 with the pane open.
    for (const canvas of [460, 332]) {
      const fit = fitToolbar(toolbarRoom(canvas), 'Department');
      expect(fit.groupCompact).toBe(true);
      const groupRight = PANEL_MARGIN + widthOf(fit, 'Department');
      expect(groupRight).toBeLessThanOrEqual(canvas - TOGGLE_LEFT_EDGE_FROM_RIGHT);
    }
  });
});
