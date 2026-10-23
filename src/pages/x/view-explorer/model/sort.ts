// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { compareGroupValues } from '@/components/group-nav/groupOrder';

import {
  type AttrValue,
  type EntityRow,
  type FieldDef,
  STATUS_ORDER,
  fieldById,
} from './fields';
import type { GroupLevel } from './grouping';
import type { EntityKind, SortState } from './types';

/**
 * The one row order every layout uses, and group orders that agree with it.
 *
 * - Numbers compare as numbers, times by instant, the Status column by
 *   urgency (STATUS_ORDER), and text with `localeCompare` (numeric, so
 *   `unit-2` comes before `unit-10`).
 * - A row with no value (null or empty text) goes last, ascending and
 *   descending alike.
 * - The sort is stable: rows that compare equal keep the order they came in.
 */

function isEmpty(v: AttrValue): boolean {
  return v === null || v === '';
}

function timeOf(v: string): number {
  const t = Date.parse(v);
  return Number.isNaN(t) ? NaN : t;
}

/** Compare two values of a field, neither of them empty. */
export function compareFieldValues(
  field: FieldDef,
  a: Exclude<AttrValue, null>,
  b: Exclude<AttrValue, null>,
): number {
  switch (field.type) {
    case 'number': {
      const x = Number(a);
      const y = Number(b);
      if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
      break;
    }
    case 'time': {
      const x = timeOf(String(a));
      const y = timeOf(String(b));
      if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
      break;
    }
    case 'status': {
      const x = STATUS_ORDER.indexOf(String(a));
      const y = STATUS_ORDER.indexOf(String(b));
      if (x !== -1 || y !== -1)
        return (x === -1 ? STATUS_ORDER.length : x) - (y === -1 ? STATUS_ORDER.length : y);
      break;
    }
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? -1 : 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Sort keys: the view's sort, or several in priority order. */
export type SortSpec = SortState | readonly SortState[] | null;

function keysOf(entity: EntityKind, sort: SortSpec): Array<{ field: FieldDef; dir: 1 | -1 }> {
  const list = sort === null ? [] : Array.isArray(sort) ? sort : [sort as SortState];
  return list
    .map((s) => ({
      field: fieldById(entity, s.column),
      dir: s.dir === 'DESC' ? (-1 as const) : (1 as const),
    }))
    .filter((k): k is { field: FieldDef; dir: 1 | -1 } => !!k.field);
}

/**
 * The rows in sort order, as a new array. A sort column the entity does not
 * know is ignored; with no keys the input order is kept.
 */
export function sortRows<R extends EntityRow>(
  entity: EntityKind,
  rows: readonly R[],
  sort: SortSpec,
): R[] {
  const keys = keysOf(entity, sort);
  if (keys.length === 0) return [...rows];
  const decorated = rows.map((row, index) => ({
    row,
    index,
    values: keys.map((k) => k.field.value(row)),
  }));
  decorated.sort((x, y) => {
    for (let i = 0; i < keys.length; i++) {
      const a = x.values[i];
      const b = y.values[i];
      const ea = isEmpty(a);
      const eb = isEmpty(b);
      if (ea || eb) {
        if (ea && eb) continue;
        return ea ? 1 : -1;
      }
      const c = compareFieldValues(
        keys[i].field,
        a as Exclude<AttrValue, null>,
        b as Exclude<AttrValue, null>,
      );
      if (c !== 0) return c * keys[i].dir;
    }
    return x.index - y.index;
  });
  return decorated.map((d) => d.row);
}

/**
 * A group level for a field, ordered the way `sortRows` orders the field
 * ascending: numbers numerically, times by instant, statuses by urgency, text
 * with numeric `localeCompare` (ties fall back to `compareGroupValues`). The
 * empty group is always last.
 */
export function groupLevelFor(
  entity: EntityKind,
  fieldId: string,
): GroupLevel<EntityRow> | null {
  const field = fieldById(entity, fieldId);
  if (!field) return null;
  return {
    field: field.id,
    value: field.value,
    compare: (a: string, b: string) =>
      compareFieldValues(field, a, b) || compareGroupValues(a, b),
  };
}
