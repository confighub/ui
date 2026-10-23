// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { STATUS_LABEL } from './fields';
import {
  type MatrixAxes,
  type MatrixSort,
  type MatrixSortKey,
  STATUS_KINDS,
  type StatusKind,
} from './types';

/**
 * The matrix axes and how each axis is sorted, as stored in the
 * `ui.confighub.io/matrix-axes` annotation: `rows,cols`, then optionally
 * `;rowKey:DIR` and `;colKey:DIR` (`Space,Target;total:DESC`). Name ascending
 * is the default and is never written, so annotations saved before sorting
 * existed read the same, and a view without sorts writes what it always did.
 */

export type { MatrixSort, MatrixSortKey } from './types';

export const MATRIX_SORT_KEYS: readonly MatrixSortKey[] = ['name', 'total', ...STATUS_KINDS];

/** No sort, or by name ascending: the group order. */
export const isDefaultSort = (s: MatrixSort | undefined) =>
  !s || (s.key === 'name' && s.dir === 'ASC');

/** A sort that is valid and not the default, or undefined. */
export function cleanMatrixSort(value: unknown): MatrixSort | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { key, dir } = value as { key?: unknown; dir?: unknown };
  if (
    !(MATRIX_SORT_KEYS as readonly unknown[]).includes(key) ||
    (dir !== 'ASC' && dir !== 'DESC')
  )
    return undefined;
  const sort: MatrixSort = { key: key as MatrixSortKey, dir };
  return isDefaultSort(sort) ? undefined : sort;
}

/** Axes with only valid, non-default sorts: two equal orderings are always equal objects. */
export function normalizeMatrixAxes(axes: MatrixAxes): MatrixAxes {
  const out: MatrixAxes = { rows: axes.rows, cols: axes.cols };
  const rowSort = cleanMatrixSort(axes.rowSort);
  const colSort = cleanMatrixSort(axes.colSort);
  if (rowSort) out.rowSort = rowSort;
  if (colSort) out.colSort = colSort;
  return out;
}

const sortText = (s: MatrixSort | undefined) => (s ? `${s.key}:${s.dir}` : 'name:ASC');

/** The annotation value, or null when the axes are the entity's defaults with no sort. */
export function encodeMatrixAxes(axes: MatrixAxes, defaults: MatrixAxes): string | null {
  const a = normalizeMatrixAxes(axes);
  if (a.rows === defaults.rows && a.cols === defaults.cols && !a.rowSort && !a.colSort)
    return null;
  const parts = [`${a.rows},${a.cols}`];
  if (a.colSort) parts.push(sortText(a.rowSort), sortText(a.colSort));
  else if (a.rowSort) parts.push(sortText(a.rowSort));
  return parts.join(';');
}

function decodeSort(part: string | undefined): MatrixSort | undefined {
  const m = /^([a-z]+):(ASC|DESC)$/.exec(part?.trim() ?? '');
  return m ? cleanMatrixSort({ key: m[1], dir: m[2] }) : undefined;
}

/** The axes in an annotation value, or null when it names no two axes. Unknown sort parts mean by name. */
export function decodeMatrixAxes(value: string | undefined): MatrixAxes | null {
  if (!value) return null;
  const [axesPart, rowPart, colPart] = value.split(';');
  const axes = axesPart.split(',');
  if (axes.length !== 2 || !axes[0] || !axes[1]) return null;
  return normalizeMatrixAxes({
    rows: axes[0],
    cols: axes[1],
    rowSort: decodeSort(rowPart),
    colSort: decodeSort(colPart),
  });
}

/** "total, descending", "Unreleased, ascending", or "name" for the default. */
export function describeMatrixSort(sort: MatrixSort | undefined): string {
  if (isDefaultSort(sort) || !sort) return 'name';
  const key =
    sort.key === 'name' || sort.key === 'total'
      ? sort.key
      : STATUS_LABEL[sort.key as StatusKind];
  return `${key}, ${sort.dir === 'ASC' ? 'ascending' : 'descending'}`;
}

/** Two sorts the same, with absent and name ascending equal. */
export function sameMatrixSort(a: MatrixSort | undefined, b: MatrixSort | undefined): boolean {
  const x = cleanMatrixSort(a);
  const y = cleanMatrixSort(b);
  return x?.key === y?.key && x?.dir === y?.dir;
}
