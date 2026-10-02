// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The zoom step for Cmd or Ctrl + wheel on the Auto canvas.
 *
 * React Flow multiplies a wheel event's delta by 10 when `ctrlKey` is set on
 * macOS, because a trackpad pinch arrives as a stream of small `ctrlKey` wheel
 * events. A mouse-wheel notch with Ctrl held is also `ctrlKey`, with a deltaY
 * of 100, so one notch scaled the zoom by 2^±2 and went from the readable
 * floor straight to the max or min zoom. Each event here is capped at one
 * plain notch: a notch zooms by React Flow's usual step, and a pinch, whose
 * events are far below the cap, keeps its speed.
 */

/** Only what the step reads, so a test can pass a plain object. */
export type WheelDelta = Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'ctrlKey'>;

/** log2 of the zoom change for one plain wheel notch (deltaY 100) in React Flow. */
export const WHEEL_NOTCH_LOG2 = 0.2;

/** React Flow's wheel delta, in log2 of the zoom change. */
function reactFlowWheelDelta(event: WheelDelta, isMac: boolean): number {
  const pinchBoost = event.ctrlKey && isMac ? 10 : 1;
  const perUnit = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002;
  return -event.deltaY * perUnit * pinchBoost;
}

/** The factor one wheel event multiplies the zoom by. */
export function wheelZoomScale(event: WheelDelta, isMac: boolean): number {
  const log2 = reactFlowWheelDelta(event, isMac);
  return 2 ** Math.min(WHEEL_NOTCH_LOG2, Math.max(-WHEEL_NOTCH_LOG2, log2));
}

/** The zoom after one wheel event, kept inside the canvas's zoom range. */
export function nextWheelZoom(
  zoom: number,
  event: WheelDelta,
  isMac: boolean,
  minZoom: number,
  maxZoom: number,
): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom * wheelZoomScale(event, isMac)));
}
