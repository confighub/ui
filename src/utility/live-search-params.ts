// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The query string as it is RIGHT NOW in the address bar, for event handlers
 * that decide something from the URL.
 *
 * Do not use render-time `useSearchParams()` values for such decisions. The
 * app's `RouterProvider` runs with `future.v7_startTransition`: the router
 * writes `window.history` first, then hands React the new location inside
 * `React.startTransition`. Until that transition commits (hundreds of ms on a
 * heavy page), every render — and every handler created by one — still sees
 * the previous location. React can also render a transition that never
 * commits (a later navigation supersedes it), and some libraries (MUI's tree
 * view) keep handlers from that uncommitted render. React Router's own
 * functional `setSearchParams(prev => …)` passes that same render-time value
 * as `prev`, not the live URL.
 *
 * The router never writes the URL anywhere but `window.history`, so this is
 * always the location the next navigation starts from.
 */
export function readLiveSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}
