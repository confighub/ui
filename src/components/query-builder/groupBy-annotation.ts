// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedViewRead } from '@confighub/rtk-query';

/**
 * Annotation key used to persist the left-pane multi-level grouping on a View.
 *
 * Value is a comma-separated list of column names (e.g. `"Space,Target"`),
 * mirroring the URL `groupBy` param. This annotation is the sole source of
 * truth on save; `View.GroupBy` is read-only fallback for legacy views.
 */
export const GROUP_BY_ANNOTATION_KEY = 'ui.confighub.io/group-by';

/**
 * Annotation key that flags a View as belonging to a non-default "kind" of
 * saved view — e.g. the Components page's grouping+filter views, which share
 * the same backend entity (`Filter.From = 'Space'`) as any other Space view
 * but must never appear in a generic Space view picker. See
 * `useQueryBuilder`'s `viewKind` option. Lives alongside `GROUP_BY_ANNOTATION_KEY`
 * (both are UI-owned View annotations) so `useQueryBuilder.tsx` and
 * `ViewTabs.tsx` share one definition without a circular import between them.
 */
export const VIEW_KIND_ANNOTATION_KEY = 'ui.confighub.io/view-kind';

/**
 * Serialise the live `localGroupByColumns` array into the annotation value.
 *
 * Returns `null` when there are no non-empty levels so the PATCH body keeps
 * the key with a null value, which our backend treats as "clear this
 * annotation" (vs `undefined`, which JSON.stringify would silently drop).
 */
export function buildGroupByAnnotationValue(
  localGroupByColumns: string[],
): string | null {
  const cleaned = localGroupByColumns
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (cleaned.length === 0) return null;
  return cleaned.join(',');
}

/**
 * Default grouping applied to a view that has neither an annotation nor a
 * legacy `View.GroupBy` value. Keeps the UI consistent: clicking a view tab
 * always lands on a sensible grouping rather than "no grouping".
 */
export const DEFAULT_VIEW_GROUP_BY = 'Space';

/**
 * Resolve the persisted multi-level grouping from a View.
 *
 * Order of resolution:
 *   1. `Annotations[GROUP_BY_ANNOTATION_KEY]` (the new source of truth).
 *   2. `View.GroupBy` (legacy single-level fallback for views saved before
 *      this annotation existed).
 *   3. `[DEFAULT_VIEW_GROUP_BY]` when the View exists but has neither set —
 *      so legacy views without grouping data still land on Space.
 *   4. `[]` when no View was supplied (sentinel / no-view callers).
 */
export function hydrateGroupByFromView(
  view: ExtendedViewRead | undefined,
): string[] {
  if (!view) return [];
  const annotation = view.View?.Annotations?.[GROUP_BY_ANNOTATION_KEY];
  if (annotation && annotation.trim().length > 0) {
    const parts = annotation
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length > 0) return parts;
  }
  // View.GroupBy is legacy. New saves write groupBy only into
  // Annotations["ui.confighub.io/group-by"]. View.GroupBy may be stale
  // after the first annotation-based PATCH and should be treated as
  // read-only legacy fallback.
  const legacy = view.View?.GroupBy;
  if (legacy && legacy.trim().length > 0) return [legacy.trim()];
  return [DEFAULT_VIEW_GROUP_BY];
}

/**
 * Build the `Annotations` map for a View create/patch payload, preserving
 * any pre-existing keys on the view (e.g. `description`).
 *
 * `value === null` writes `{ [key]: null }` so the backend clears just that
 * single annotation; other keys are passed through unchanged. The input map
 * is never mutated.
 */
export function mergeGroupByAnnotation(
  existing: Record<string, string> | undefined,
  value: string | null,
): Record<string, string | null> {
  const next: Record<string, string | null> = { ...(existing ?? {}) };
  next[GROUP_BY_ANNOTATION_KEY] = value;
  return next;
}
