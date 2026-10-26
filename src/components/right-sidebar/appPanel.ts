// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The marker on the root of the app's Functions panel (the invoker sidebar). A page whose own
 * keyboard listener is on the window uses `FUNCTIONS_PANEL_SELECTOR` to leave the panel's keys
 * alone.
 */
export const FUNCTIONS_PANEL_MARKER = { 'data-app-panel': 'functions' } as const;

export const FUNCTIONS_PANEL_SELECTOR = '[data-app-panel="functions"]';
