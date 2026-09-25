// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ResourceRow } from './hooks/useResourceRows';
import { ResourceColumn } from './types';

/**
 * Extract a cell value from a ResourceRow given a column definition. Always
 * returns a string for DataGrid sorting/filter consistency.
 */
export function getCellValue(row: ResourceRow, col: ResourceColumn): string {
  switch (col.source) {
    case 'resource-info':
      return readScalar(row, col.key);
    case 'unit-field':
      return readScalar(row, col.key);
    case 'space-field':
      return readScalar(row, col.key);
    case 'unit-label':
      return row.UnitLabels?.[col.key] ?? '';
    case 'space-label':
      return row.SpaceLabels?.[col.key] ?? '';
    case 'resource-path':
      return walkPath(row.resourceData, col.key);
  }
}

function readScalar(row: ResourceRow, key: string): string {
  const value = (row as unknown as Record<string, unknown>)[key];
  if (value === undefined || value === null) return '';
  return String(value);
}

/**
 * Walk a dot-separated path against a parsed resource document. Supports
 * `name[N]` array-index segments (e.g. `spec.containers[0].image`).
 *
 * Limitations: keys that contain a literal `.` (e.g. annotation keys like
 * `kubernetes.io/foo`) are not addressable. We accept that for v1 — most
 * useful resource fields don't have dots in their key names. If we ever need
 * those, the next step is bracketed-string segments (`metadata.annotations["kubernetes.io/foo"]`).
 *
 * Returns `''` for missing/undefined paths and JSON-stringifies non-scalar
 * leaf values so a column showing a map or array still renders something
 * reasonable in the grid.
 */
function walkPath(root: unknown, path: string): string {
  if (root === null || root === undefined) return '';
  let current: unknown = root;
  for (const rawSegment of path.split('.')) {
    if (current === null || current === undefined) return '';
    const segment = rawSegment.trim();
    if (!segment) continue;
    const arrayMatch = segment.match(/^(.*?)((?:\[\d+\])+)$/);
    if (arrayMatch) {
      const [, name, indices] = arrayMatch;
      if (name) {
        if (typeof current !== 'object' || current === null) return '';
        current = (current as Record<string, unknown>)[name];
      }
      for (const idxStr of indices.matchAll(/\[(\d+)\]/g)) {
        if (!Array.isArray(current)) return '';
        current = current[Number(idxStr[1])];
        if (current === null || current === undefined) return '';
      }
    } else {
      if (typeof current !== 'object' || current === null) return '';
      current = (current as Record<string, unknown>)[segment];
    }
  }
  if (current === null || current === undefined) return '';
  if (typeof current === 'object') return JSON.stringify(current);
  return String(current);
}
