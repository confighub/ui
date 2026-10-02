// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The zoom step for Cmd or Ctrl + wheel on the Auto canvas. With React Flow's
// own math, Ctrl + one mouse-wheel notch on macOS scaled the zoom by 2^±2, so
// it jumped from the readable floor straight to the max or min zoom.
import { expect, test } from '@playwright/test';

import {
  MAX_ZOOM,
  MIN_ZOOM_FOLDED,
  READABLE_ZOOM_FLOOR,
} from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  WHEEL_NOTCH_LOG2,
  nextWheelZoom,
  wheelZoomScale,
} from '../src/pages/x/apps/flow-graph/fold/wheelZoom';

/** React Flow's step for one plain wheel notch: 2^(100 * 0.002). */
const NOTCH = 2 ** WHEEL_NOTCH_LOG2;

const notch = (deltaY: number, ctrlKey = true) => ({ deltaY, deltaMode: 0, ctrlKey });

test('the notch is React Flow’s plain wheel step', () => {
  expect(NOTCH).toBeCloseTo(1.1487, 4);
  expect(wheelZoomScale(notch(-100, false), true)).toBeCloseTo(NOTCH, 6);
});

for (const isMac of [true, false]) {
  test(`${isMac ? 'macOS' : 'Windows and Linux'}: Ctrl + one notch zooms one step`, () => {
    expect(wheelZoomScale(notch(-100), isMac)).toBeCloseTo(NOTCH, 6);
    expect(wheelZoomScale(notch(100), isMac)).toBeCloseTo(1 / NOTCH, 6);
  });
}

test('Cmd + one notch (no ctrlKey) zooms the same step', () => {
  expect(wheelZoomScale(notch(-100, false), true)).toBeCloseTo(NOTCH, 6);
  expect(wheelZoomScale(notch(100, false), true)).toBeCloseTo(1 / NOTCH, 6);
});

test('from the readable floor, one notch does not reach the max or min zoom', () => {
  const zoomIn = nextWheelZoom(
    READABLE_ZOOM_FLOOR,
    notch(-100),
    true,
    MIN_ZOOM_FOLDED,
    MAX_ZOOM,
  );
  const zoomOut = nextWheelZoom(
    READABLE_ZOOM_FLOOR,
    notch(100),
    true,
    MIN_ZOOM_FOLDED,
    MAX_ZOOM,
  );
  expect(zoomIn).toBeCloseTo(READABLE_ZOOM_FLOOR * NOTCH, 6);
  expect(zoomOut).toBeCloseTo(READABLE_ZOOM_FLOOR / NOTCH, 6);
  expect(zoomIn).toBeLessThan(MAX_ZOOM);
  expect(zoomOut).toBeGreaterThan(MIN_ZOOM_FOLDED);
});

test('a macOS pinch (small ctrlKey deltas) keeps React Flow’s pinch speed', () => {
  // React Flow: 2^(-deltaY * 0.002 * 10).
  expect(wheelZoomScale(notch(-3), true)).toBeCloseTo(2 ** 0.06, 6);
  expect(wheelZoomScale(notch(5), true)).toBeCloseTo(2 ** -0.1, 6);
});

test('trackpad-like small deltas zoom smoothly, never more than one step an event', () => {
  let zoom = READABLE_ZOOM_FLOOR;
  const seen: number[] = [];
  for (let i = 0; i < 10; i++) {
    const next = nextWheelZoom(zoom, notch(-4), true, MIN_ZOOM_FOLDED, MAX_ZOOM);
    seen.push(next / zoom);
    zoom = next;
  }
  for (const ratio of seen.slice(0, 5)) {
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThanOrEqual(NOTCH);
  }
  expect(zoom).toBeLessThanOrEqual(MAX_ZOOM);
});

test('line and page wheel modes are capped at one step too', () => {
  // Firefox reports lines: 3 lines is React Flow's 0.15, under the cap.
  expect(wheelZoomScale({ deltaY: -3, deltaMode: 1, ctrlKey: false }, false)).toBeCloseTo(
    2 ** 0.15,
    6,
  );
  expect(wheelZoomScale({ deltaY: -1, deltaMode: 2, ctrlKey: true }, true)).toBeCloseTo(
    NOTCH,
    6,
  );
});

test('the zoom stays inside the canvas range', () => {
  expect(nextWheelZoom(MAX_ZOOM, notch(-100), true, MIN_ZOOM_FOLDED, MAX_ZOOM)).toBe(MAX_ZOOM);
  expect(nextWheelZoom(MIN_ZOOM_FOLDED, notch(100), true, MIN_ZOOM_FOLDED, MAX_ZOOM)).toBe(
    MIN_ZOOM_FOLDED,
  );
});
