// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * MUI's z-index scale is modal 1300, snackbar 1400, tooltip 1500. The tour sits
 * at 1400 so it clears any open Dialog without hiding a toast permanently.
 */
export const TOUR_Z_INDEX = 1400;

/** How long an anchor may stay unresolved before the step is treated as missing. */
export const ANCHOR_RESOLVE_TIMEOUT_MS = 5000;

/** Breathing room painted around the spotlit element. */
export const SPOTLIGHT_PADDING_PX = 6;

export const SPOTLIGHT_RADIUS_PX = 8;

/** Query param that starts a tour, e.g. `/components?tour=getting-started`. Stripped on start. */
export const TOUR_QUERY_PARAM = 'tour';

/**
 * Marks the tour's own modal root so it can be told apart from the app's
 * modals when counting the modal stack.
 */
export const TOUR_MODAL_CLASS = 'cub-tour-modal';
