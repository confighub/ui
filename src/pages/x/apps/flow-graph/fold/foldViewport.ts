// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  FIT_BOTTOM,
  FIT_PAD_X,
  FIT_TOP,
  FIT_ZOOM_MAX,
  FIT_ZOOM_STEP,
  PAN_DOWN_FRACTION,
  READABLE_ZOOM_FLOOR,
} from './foldConstants';
import type { FoldLayout, FrozenFoldParams } from './foldLayout';

/** Same shape as reactflow's viewport: screen = model * zoom + (x, y). */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** A rectangle in model px. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FoldedFit {
  viewport: Viewport;
  /** The columns the fitted layout used; freeze them until the next Fit. */
  frozen: FrozenFoldParams;
  /** The graph does not fit at the readable floor; show its top and "More below". */
  tall: boolean;
}

/** The part of the container kept clear of the edges and the "More below" cue. */
function visibleBox(container: Size) {
  return {
    left: FIT_PAD_X,
    top: FIT_TOP,
    right: container.width - FIT_PAD_X,
    bottom: container.height - FIT_BOTTOM,
  };
}

/**
 * Fit a folded graph. The zoom and the columns are chosen together: at each
 * zoom from 100% down to the readable floor, the layout is recomputed for the
 * width that zoom leaves, and the first zoom where it fits wins. A wider
 * layout at a lower zoom has more stack columns and fewer rows, so this finds
 * the largest readable zoom rather than shrinking a fixed shape.
 *
 * @param layoutAt the unfrozen layout with no stacks open, for a model width
 */
export function solveFoldedFit(
  layoutAt: (availableWidth: number) => FoldLayout,
  container: Size,
): FoldedFit {
  const viewWidth = container.width - 2 * FIT_PAD_X;
  const viewHeight = container.height - FIT_TOP - FIT_BOTTOM;
  const steps = Math.round((FIT_ZOOM_MAX - READABLE_ZOOM_FLOOR) / FIT_ZOOM_STEP);

  const place = (zoom: number, layout: FoldLayout, tall: boolean): FoldedFit => ({
    viewport: {
      x: FIT_PAD_X + Math.max(0, (viewWidth - layout.width * zoom) / 2),
      y: tall ? FIT_TOP : FIT_TOP + Math.max(0, (viewHeight - layout.height * zoom) / 2),
      zoom,
    },
    frozen: layout.frozen,
    tall,
  });

  for (let i = 0; i <= steps; i++) {
    // Rounded so the zoom is 0.9, not 0.8999999999999999.
    const zoom = Math.round((FIT_ZOOM_MAX - i * FIT_ZOOM_STEP) * 1e6) / 1e6;
    const layout = layoutAt(viewWidth / zoom);
    if (layout.height * zoom <= viewHeight && layout.width * zoom <= viewWidth + 1) {
      return place(zoom, layout, false);
    }
  }
  return place(READABLE_ZOOM_FLOOR, layoutAt(viewWidth / READABLE_ZOOM_FLOOR), true);
}

/** Screen px of the graph hidden below the visible area; 0 when none. */
export function hiddenBelowPx(
  viewport: Viewport,
  layoutHeight: number,
  container: Size,
): number {
  const bottom = viewport.y + layoutHeight * viewport.zoom;
  return Math.max(0, bottom - visibleBox(container).bottom);
}

/**
 * The viewport after one "More below" click: it pans up by what is hidden
 * (plus a little room), but by at most most of a screen, so the user keeps a
 * strip of what they were reading. The zoom never changes.
 */
export function panDownViewport(
  viewport: Viewport,
  layoutHeight: number,
  container: Size,
): Viewport {
  const hidden = hiddenBelowPx(viewport, layoutHeight, container);
  if (hidden === 0) return viewport;
  const viewHeight = container.height - FIT_TOP - FIT_BOTTOM;
  const step = Math.min(hidden + 12, viewHeight * PAN_DOWN_FRACTION);
  return { ...viewport, y: viewport.y - step };
}

/**
 * The viewport that brings a rectangle into view by panning only: expanding
 * a stack, a search jump and the side pane must never change the zoom the
 * user chose. Returns null when the rectangle is already fully visible.
 *
 * - `center`: centre the rectangle (a search jump, where the eye has no
 *   anchor yet);
 * - otherwise pan as little as possible (an expand, where the user is
 *   looking right beside it).
 *
 * A rectangle larger than the visible area aligns its top (or left) edge
 * instead, so its header stays in view.
 */
export function ensureVisibleViewport(
  rect: Rect,
  viewport: Viewport,
  container: Size,
  opts: { center?: boolean } = {},
): Viewport | null {
  const box = visibleBox(container);
  const { zoom } = viewport;
  const left = viewport.x + rect.x * zoom;
  const top = viewport.y + rect.y * zoom;
  const right = left + rect.width * zoom;
  const bottom = top + rect.height * zoom;

  if (left >= box.left && right <= box.right && top >= box.top && bottom <= box.bottom) {
    return null;
  }

  const axis = (start: number, end: number, min: number, max: number, margin: number) => {
    if (end - start > max - min) return min + margin - start;
    if (opts.center) return (min + max) / 2 - (start + end) / 2;
    if (start < min) return min - start;
    if (end > max) return max - end;
    return 0;
  };
  const dx = axis(left, right, box.left, box.right, 0);
  const dy = axis(top, bottom, box.top, box.bottom, 8);

  if (dx === 0 && dy === 0) return null;
  return { x: viewport.x + dx, y: viewport.y + dy, zoom };
}
