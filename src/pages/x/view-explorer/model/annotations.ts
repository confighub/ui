// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ColumnState } from './types';

/**
 * The View annotations the explorer owns. What a View has no field for (the
 * layout, the matrix axes, column widths, hidden lenses) is kept here, under
 * `ui.confighub.io/`, one value of at most 1024 bytes per key.
 */

export const ANNOTATION_VALUE_MAX = 1024;

export const LAYOUT_ANNOTATION = 'ui.confighub.io/layout';
export const MATRIX_AXES_ANNOTATION = 'ui.confighub.io/matrix-axes';
export const COLUMN_WIDTHS_ANNOTATION = 'ui.confighub.io/column-widths';
export const HIDDEN_LENS_ANNOTATION_PREFIX = 'ui.confighub.io/hidden-lens-';
export const MAX_HIDDEN_LENSES = 8;

/** The Units page's grouping annotation: read first, and written too, so both pages agree. */
export {
  GROUP_BY_ANNOTATION_KEY,
  VIEW_KIND_ANNOTATION_KEY,
} from '@/components/query-builder/groupBy-annotation';

/** Before View.Of existed, a Resource view was marked with this annotation. Cleared on save. */
export const LEGACY_VIEW_TARGET_ANNOTATION = 'confighub.com/view-target';

/** `ui.confighub.io/hidden-lens-1` … `-8`. */
export function hiddenLensKey(n: number): string {
  return `${HIDDEN_LENS_ANNOTATION_PREFIX}${n}`;
}

/** The server limits an annotation value to 1024 bytes of UTF-8, not 1024 characters. */
export function fitsAnnotation(value: string): boolean {
  return new TextEncoder().encode(value).length <= ANNOTATION_VALUE_MAX;
}

/**
 * The visible columns in order, each with its width when the viewer set one:
 * `Slug:220,Space,Target:140`. It also says which columns are visible, which
 * `View.Columns` cannot, because group and sort columns must be listed there too.
 */
export function encodeColumns(columns: readonly ColumnState[], withWidths = true): string {
  return columns
    .map((c) =>
      withWidths && c.width !== undefined ? `${c.name}:${Math.round(c.width)}` : c.name,
    )
    .join(',');
}

/**
 * The column annotation that fits: with widths, else names only (the widths
 * are dropped), else null (the visible columns fall back to `View.Columns`).
 */
export function fitColumnsAnnotation(columns: readonly ColumnState[]): string | null {
  if (columns.length === 0) return null;
  const full = encodeColumns(columns);
  if (fitsAnnotation(full)) return full;
  const names = encodeColumns(columns, false);
  return fitsAnnotation(names) ? names : null;
}

export function decodeColumns(value: string | undefined): ColumnState[] | null {
  if (!value || !value.trim()) return null;
  const out: ColumnState[] = [];
  for (const part of value.split(',')) {
    const m = /^(.+?)(?::(\d{1,4}))?$/.exec(part.trim());
    if (!m || !m[1]) return null;
    out.push(m[2] ? { name: m[1], width: Number(m[2]) } : { name: m[1] });
  }
  return out;
}

/**
 * A hidden lens is saved with its position in the lens list, so it comes back
 * where it was: `2:Space.Slug = 'payments-prod'`. A WHERE term never starts
 * with a digit, so the prefix cannot be mistaken for part of it.
 */
export function encodeHiddenLens(position: number, where: string): string {
  return `${position}:${where}`;
}

export function decodeHiddenLens(value: string): { position: number; where: string } | null {
  const m = /^(\d{1,3}):([\s\S]+)$/.exec(value);
  if (!m) return null;
  return { position: Number(m[1]), where: m[2] };
}
