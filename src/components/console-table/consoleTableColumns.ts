// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The column model of `ConsoleTable`, and its translation to TanStack Table.
 *
 * Kept free of React and MUI at runtime, so the sorting rules can be checked
 * without a browser. `ConsoleTable.tsx` and this file are where the list
 * consoles import `@tanstack/react-table`.
 */

import type { ReactNode } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type SortFn,
  type SortingState,
} from '@tanstack/react-table';

/** Sorting only. Filtering stays with each console, which passes the rows it matched. */
export const consoleTableFeatures = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
type Features = typeof consoleTableFeatures;

export type { SortingState as ConsoleSorting };

/** What a column sorts by. `undefined`, `null`, `NaN` and an invalid Date mean "no value", which sorts last in both directions. */
export type ConsoleSortValue = string | number | boolean | Date | null | undefined;

export interface ConsoleTableColumn<T> {
  /** Stable key: the sort state and React keys use it. */
  id: string;
  /** Sentence case. `''` for a column with no label, such as the row's action. */
  header: string;
  /** The value the column sorts by. Dates sort as dates and numbers as numbers, not as the text a cell prints. */
  sortValue?: (row: T) => ConsoleSortValue;
  /** An ascending comparison, for an order one value cannot express. Takes precedence over `sortValue`. */
  compare?: (a: T, b: T) => number;
  /** `false` keeps a column that has a `sortValue` or `compare` from sorting. */
  enableSorting?: boolean;
  /** The first click sorts descending, as for "most recent first". */
  sortDescFirst?: boolean;
  /** The cell's content. Rows a console draws itself (`renderRow`) do not read it. */
  cell?: (row: T) => ReactNode;
  /** On the head and the cell, so a column hides at the same width in both: alignment, `@media` hiding. */
  sx?: SxProps<Theme>;
  /** On the cell only, after `sx`. */
  cellSx?: SxProps<Theme>;
}

export function isSortableColumn<T>(column: ConsoleTableColumn<T>): boolean {
  return column.enableSorting !== false && (column.compare !== undefined || column.sortValue !== undefined);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function rank(value: Exclude<ConsoleSortValue, null | undefined>): number | string {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

/** `undefined` for no value, including `null`, `NaN` and an invalid Date, which is the one form TanStack's `sortUndefined` recognises. */
function presentOrUndefined(value: ConsoleSortValue): ConsoleSortValue {
  if (value === null) return undefined;
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  if (value instanceof Date && Number.isNaN(value.getTime())) return undefined;
  return value;
}

/**
 * Ascending order of two sort values. Text compares case-blind, with runs of
 * digits as numbers, so `web-2` comes before `web-10`. `NaN` and an invalid
 * Date compare as no value.
 */
export function compareSortValues(a: ConsoleSortValue, b: ConsoleSortValue): number {
  const ra = a === null || a === undefined ? undefined : rank(a);
  const rb = b === null || b === undefined ? undefined : rank(b);
  const aMissing = ra === undefined || (typeof ra === 'number' && Number.isNaN(ra));
  const bMissing = rb === undefined || (typeof rb === 'number' && Number.isNaN(rb));
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  if (typeof ra === 'number' && typeof rb === 'number') return ra - rb;
  return collator.compare(String(ra), String(rb));
}

/**
 * TanStack column definitions for `columns`.
 *
 * A column that does not sort gets no accessor, which is what TanStack reads
 * as "cannot sort". Ties keep the order of `data`, because TanStack breaks
 * them by the row's index, so a console's own default order survives within
 * a sort.
 */
export function toColumnDefs<T extends object>(columns: readonly ConsoleTableColumn<T>[]): ColumnDef<Features, T, unknown>[] {
  const helper = createColumnHelper<Features, T>();
  return columns.map((column): ColumnDef<Features, T, unknown> => {
    if (!isSortableColumn(column)) return helper.display({ id: column.id, header: column.header, enableSorting: false });
    const { compare, sortValue } = column;
    // TanStack hands a row's accessor value to the comparator, so the value must be the row itself when `compare` decides.
    const sortFn: SortFn<Features, T> =
      compare !== undefined
        ? (rowA, rowB) => compare(rowA.original, rowB.original)
        : (rowA, rowB, columnId) => compareSortValues(rowA.getValue<ConsoleSortValue>(columnId), rowB.getValue<ConsoleSortValue>(columnId));
    return helper.accessor((row: T): ConsoleSortValue => (compare !== undefined ? 0 : presentOrUndefined(sortValue?.(row))), {
      id: column.id,
      header: column.header,
      sortFn,
      sortDescFirst: column.sortDescFirst ?? false,
      // TanStack places `undefined` before it applies the direction, so no value stays last when descending too.
      sortUndefined: compare !== undefined ? false : 'last',
    }) as ColumnDef<Features, T, unknown>;
  });
}

