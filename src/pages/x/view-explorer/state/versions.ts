// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { SavedView } from '../queries/useViews';

/**
 * The versions a saved tab's work started from: the View's UpdatedAt under the
 * View's id, and its Filter's under `filter:<id>`. A save compares both with
 * the server, so a change someone else made to either is never overwritten
 * without asking.
 */
export type Versions = Map<string, string>;

export const filterVersionKey = (viewId: string) => `filter:${viewId}`;

/** Start a tab's versions from this copy of the view. */
export function rememberVersions(versions: Versions, saved: SavedView): void {
  versions.set(saved.viewId, saved.updatedAt);
  if (saved.filter?.UpdatedAt) versions.set(filterVersionKey(saved.viewId), saved.filter.UpdatedAt);
  else versions.delete(filterVersionKey(saved.viewId));
}

/** Record the versions a write left. */
export function setVersions(versions: Versions, viewId: string, view: string, filter: string | undefined): void {
  versions.set(viewId, view);
  if (filter) versions.set(filterVersionKey(viewId), filter);
  else versions.delete(filterVersionKey(viewId));
}
