// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Per-tab draft persistence for the entity-list view.
 *
 * A "draft" captures the full display state of a view tab at a point in time
 * so it can be serialised when the user switches away and rehydrated when they
 * return. Drafts live in localStorage under individual keys:
 *
 *   confighub:<entityType>:viewDraft:<viewId>
 *
 * where <viewId> is the view's ViewID, or SENTINEL_TAB_ID for the sentinel tab.
 * The entityType namespace prevents key collisions when the component is used
 * for different entity types (Unit, Space, etc.).
 */

const draftPrefix = (entityType: string) =>
  `confighub:${entityType.toLowerCase()}:viewDraft:`;

/**
 * Serialisable snapshot of a view tab's display state.
 *
 * Excluded by design: `columnWidths` — those are unmanaged for v1.
 */
export interface ViewDraft {
  version: 1;
  /** ISO-8601 timestamp of when the draft was last written. */
  savedAt: string;
  /** Filter WHERE clause fields. */
  filter: {
    Where: string;
    WhereData: string;
    ResourceType: string;
  };
  /** Visible column names, in display order. */
  columns: string[];
  /** Comma-joined group-by levels (e.g. "Space,target"). Empty string = no grouping. */
  groupBy: string;
  /** Sort order derived from URL params. */
  sortOrder: {
    orderBy: string;
    orderByDirection: string;
  };
}

/**
 * Read a draft from localStorage.
 * Returns `null` when the key is absent, the JSON is corrupt, or the version
 * number is not 1 (forward-compat guard).
 */
export function readViewDraft(viewId: string, entityType: string): ViewDraft | null {
  try {
    const raw = localStorage.getItem(draftPrefix(entityType) + viewId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ViewDraft>;
    if (parsed.version !== 1) return null;
    return parsed as ViewDraft;
  } catch {
    return null;
  }
}

/**
 * Write a draft to localStorage. Silently swallows QuotaExceededError.
 *
 * ⚠ When called from `useQueryBuilder`, this MUST be paired with a
 * `setDraftedTabIds` update — see the INVARIANT comment block above
 * `serializeLeavingDraft` in `useQueryBuilder.tsx`. The inactive-tab
 * modified dot is memoised on `draftedTabIds` and will lag the actual
 * draft state if you bypass that pairing.
 */
export function writeViewDraft(viewId: string, draft: ViewDraft, entityType: string): void {
  try {
    localStorage.setItem(draftPrefix(entityType) + viewId, JSON.stringify(draft));
  } catch {
    // Storage quota exceeded — ignore; the user loses draft persistence but
    // nothing else breaks.
  }
}

/** Delete a draft from localStorage. */
export function deleteViewDraft(viewId: string, entityType: string): void {
  localStorage.removeItem(draftPrefix(entityType) + viewId);
}

/**
 * Returns the subset of `openTabIds` that have a draft stored.
 * Used on startup to initialise the `draftedTabIds` set.
 */
export function scanDraftedTabIds(openTabIds: string[], entityType: string): Set<string> {
  const result = new Set<string>();
  const prefix = draftPrefix(entityType);
  for (const id of openTabIds) {
    if (localStorage.getItem(prefix + id) !== null) {
      result.add(id);
    }
  }
  return result;
}
