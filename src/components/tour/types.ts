// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';

import type { PopperPlacementType } from '@mui/material/Popper';

import type { RootState } from '@/state/store';

/**
 * How the engine finds the DOM element a step points at.
 *
 * `inModal` exists because MUI Dialog content is portalled outside the page
 * tree: a bare CSS selector would collide with same-named elements elsewhere,
 * so the caller supplies the dialog's own container and the selector is scoped
 * to it.
 */
export type Anchor =
  | { kind: 'selector'; css: string }
  /** Resolves to `.react-flow__node[data-id="<deploymentId>"]`. */
  | { kind: 'flowNode'; deploymentId: string }
  | { kind: 'inModal'; container: () => HTMLElement | null; css: string };

/**
 * What moves the tour to the next step.
 *
 * - `click`     — a real click landed inside the given anchor.
 * - `input`     — the given anchor's value equals `value` (trimmed), checked
 *                 on every native `input` event inside it. Waits for the
 *                 instructed text specifically, not just any keystroke, so a
 *                 step does not fire on the first character typed or on an
 *                 incomplete/wrong value. Use this for a "type X here" step
 *                 that a later step's own `click` advance does not already
 *                 cover — e.g. the last field in a sequence, where the very
 *                 next real action is a click elsewhere (Invoke, a search
 *                 result) that a `next`-gated step's listener is not yet
 *                 mounted to catch. A controlled MUI TextField's value is a
 *                 DOM property, not a mutating attribute, so `selector`
 *                 cannot see it; this exists because nothing else in this
 *                 list can watch one.
 * - `next`      — the user pressed the tooltip's Next button.
 * - `route`     — the location changed to something matching `match`
 *                 (a react-router path pattern, matched as a prefix). The
 *                 pathname at the moment the step opens never counts, so a step
 *                 whose target route is already active does not self-skip.
 * - `selector`  — an element matching `css` appeared (MutationObserver). Fires
 *                 immediately when the element is already present.
 * - `predicate` — a Redux selector became true.
 */
export type Advance =
  | { on: 'click'; anchor: Anchor }
  | { on: 'input'; anchor: Anchor; value: string }
  | { on: 'next' }
  | { on: 'route'; match: string }
  | { on: 'selector'; css: string }
  | { on: 'predicate'; select: (s: RootState) => boolean };

export interface TourStep {
  id: string;
  /**
   * What the step points at. Omit for a step that has nothing meaningful to
   * point at — a pure explanation. With no anchor the engine resolves to
   * `idle` (never `missing`, so the step cannot be skipped or stranded), draws
   * no spotlight, and `TourTooltip` falls back to a zero-size virtual anchor at
   * the viewport centre, rendering the card centred instead of tethered.
   * Prefer this over anchoring on a loosely-related element: a ring around
   * something the copy is not describing is worse than no ring.
   */
  anchor?: Anchor;
  /**
   * Resolves a SEPARATE element whose rect draws the spotlight ring, when the
   * genuinely click-safe element (`anchor`) is smaller than the thing a user
   * would think of as "the thing to click" — e.g. a dedicated safe strip on
   * a card whose other, larger areas are covered by a real link. Click
   * detection, `anchorMissing`/optional-skip, and Popper placement all still
   * key off `anchor`; this only changes what the ring visually covers. Unset
   * draws the ring around `anchor` itself, same as before this existed.
   */
  spotlightAnchor?: Anchor;
  title: string;
  body: ReactNode;
  advance: Advance;
  /**
   * Overrides the tooltip's side of its anchor. Unset preserves today's
   * default (`bottom` when anchored, `top` when not — TourTooltip's own
   * fallback). Use this only when the default genuinely covers the thing the
   * step is pointing at — e.g. a narrow sidebar field where a card below it
   * overlaps the next field down.
   */
  placement?: PopperPlacementType;
  /** Route to push before the step runs. Pushed once per step entry. */
  navigateTo?: string;
  /** Skip silently when the anchor never resolves. Otherwise the user is offered a skip. */
  optional?: boolean;
  /** Let clicks reach the real UI underneath the overlay. Defaults to true. */
  allowClickThrough?: boolean;
  /**
   * Dims the rest of the screen behind the spotlight ring. Off by default —
   * the ring alone is usually enough to point at something without hiding
   * whatever else is on screen — so only set this for a step where the
   * anchor genuinely gets lost without it.
   */
  dimBackground?: boolean;
}

export interface TourDefinition {
  id: string;
  /** Human-readable name, shown in the tooltip footer. */
  title?: string;
  steps: TourStep[];
  /**
   * The tour to offer next on the completion screen once this one finishes.
   * Omitted for the last tour in the sequence — its completion screen offers
   * only "Done", no "Continue".
   */
  nextTourId?: string;
}

/** Live position of a step's anchor, in viewport (client) coordinates. */
export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}
