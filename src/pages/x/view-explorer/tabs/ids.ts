// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The id of a tab's element, for aria-labelledby on the panel and for focus moves. */
export const tabElementId = (tabId: string) => `vx-tab-${tabId}`;

/** The id of the panel every tab controls: the card under the strip. */
export const TAB_PANEL_ID = 'vx-tabpanel';
