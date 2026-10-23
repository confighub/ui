// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The query parameter a detail page reads to offer a way back to the explorer tab it was opened from. */
export const EXPLORER_RETURN_PARAM = 'explorer';

/**
 * A row's page link that remembers the explorer tab it came from (its `view`,
 * `t` and `d` parameters). It is a URL parameter, not navigation state,
 * because these links open in a new browser tab, where state does not go.
 */
export function withExplorerReturn(href: string, search: string = window.location.search): string {
  const back = search.replace(/^\?/, '');
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}${EXPLORER_RETURN_PARAM}=${encodeURIComponent(back)}`;
}
