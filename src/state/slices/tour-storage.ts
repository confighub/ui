// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * localStorage persistence for the guided-tour position.
 *
 * Only the identity of the tour, the step index and the run status are stored.
 * Step content (titles, bodies, anchors) lives in code, never here, so a stale
 * payload written by an older build can never resurrect a step that no longer
 * exists — {@link readTourState} returns the raw position and the host clamps
 * it against the live tour definition.
 *
 * Deliberately NOT a URL param: a shared link must not drag a colleague into
 * step 7 of someone else's tour.
 */

/**
 * 'finished' is distinct from 'done': it is the transient moment right after
 * the last step advances, while the completion screen (recap + "Continue to
 * the next tour?") is still on screen and not yet acknowledged. 'done' is the
 * permanent, silent, no-more-popups state a tour settles into once the user
 * dismisses that screen (or continues into the next tour). Collapsing these
 * into one status would mean every later page load re-shows the completion
 * screen for a tour finished days ago, since status alone would be
 * indistinguishable from "just now".
 */
export type TourStatus = 'idle' | 'running' | 'paused' | 'finished' | 'done';

export interface TourState {
  /** Id of the registered tour, or null when no tour has ever been started. */
  tourId: string | null;
  /** Zero-based index into the tour's `steps` array. */
  stepIndex: number;
  status: TourStatus;
  /** Tour ids the user has fully finished at least once, across all tours ever taken. */
  completedTourIds: string[];
}

interface PersistedTourState extends TourState {
  version: 1;
}

const TOUR_STORAGE_KEY = 'confighub.tour.v1';

const VALID_STATUSES: readonly TourStatus[] = ['idle', 'running', 'paused', 'finished', 'done'];

export const initialTourState: TourState = {
  tourId: null,
  stepIndex: 0,
  status: 'idle',
  completedTourIds: [],
};

/**
 * Read the persisted tour position.
 * Returns `null` when the key is absent, the JSON is corrupt, the version
 * number is not 1 (forward-compat guard), or the payload fails validation.
 */
export function readTourState(): TourState | null {
  try {
    const raw = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedTourState>;
    if (parsed.version !== 1) return null;
    if (!VALID_STATUSES.includes(parsed.status as TourStatus)) return null;
    if (typeof parsed.stepIndex !== 'number' || !Number.isFinite(parsed.stepIndex)) return null;
    if (parsed.tourId !== null && typeof parsed.tourId !== 'string') return null;
    const completedTourIds = Array.isArray(parsed.completedTourIds)
      ? parsed.completedTourIds.filter((id): id is string => typeof id === 'string')
      : [];
    return {
      tourId: parsed.tourId ?? null,
      stepIndex: Math.max(0, Math.floor(parsed.stepIndex)),
      status: parsed.status as TourStatus,
      completedTourIds,
    };
  } catch {
    return null;
  }
}

/** Write the tour position. Silently swallows QuotaExceededError. */
export function writeTourState(state: TourState): void {
  try {
    const payload: PersistedTourState = { version: 1, ...state };
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage quota exceeded or blocked — the user loses tour resume, nothing else breaks.
  }
}

/** Forget the persisted tour position entirely. */
export function clearTourState(): void {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // Blocked storage — nothing to clean up.
  }
}
