// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedSpaceRead } from '@confighub/rtk-query';

import { fieldById, fieldCatalog, STATUS_LABEL, STATUS_ORDER, statusesFor, type EntityRow, type FieldDef } from '../../model/fields';
import { buildGroupTree, EMPTY_GROUP_VALUE, type GroupNode } from '../../model/grouping';
import { groupLevelFor } from '../../model/sort';
import { isDefaultSort } from '../../model/matrix-axes';
import type { EntityKind, Lens, LensSpec, MatrixSort, StatusKind } from '../../model/types';

/**
 * The Matrix layout's arithmetic: rows of one field by columns of another,
 * each cell the rows that have both values, tinted by the most urgent status
 * in it. Group order is the same as the table's (`groupLevelFor`), so a cell's
 * count equals the count of the matching nested group in the table.
 */

export type Tone = 'warning' | 'secondary' | 'success' | 'grey';

export const STATUS_TONE: Record<string, Tone> = {
  [STATUS_LABEL.unreleased]: 'warning',
  [STATUS_LABEL.upgradable]: 'secondary',
  [STATUS_LABEL.released]: 'success',
  [STATUS_LABEL.untargeted]: 'grey',
};

/** Spaces have no status of their own; they are read by the Units in them. */
export const SPACE_STATUS = {
  unreleased: 'Has unreleased units',
  upgradable: 'Has upgradable units',
  clean: 'All released',
} as const;

const SPACE_TONE: Record<string, Tone> = {
  [SPACE_STATUS.unreleased]: 'warning',
  [SPACE_STATUS.upgradable]: 'secondary',
  [SPACE_STATUS.clean]: 'success',
};

const SPACE_ORDER: readonly string[] = [SPACE_STATUS.unreleased, SPACE_STATUS.upgradable, SPACE_STATUS.clean];

export function statusOrder(entity: EntityKind): readonly string[] {
  return entity === 'Space' ? SPACE_ORDER : STATUS_ORDER;
}

export function toneOf(entity: EntityKind, status: string): Tone {
  return (entity === 'Space' ? SPACE_TONE[status] : STATUS_TONE[status]) ?? 'grey';
}

/** One status per row, the way the Status column shows it. */
export function rowStatus(entity: EntityKind): (row: EntityRow) => string {
  if (entity === 'Space') {
    return (row) => {
      const s = row as ExtendedSpaceRead;
      if ((s.UnreleasedUnitCount ?? 0) > 0) return SPACE_STATUS.unreleased;
      if ((s.UpgradableUnitCount ?? 0) > 0) return SPACE_STATUS.upgradable;
      return SPACE_STATUS.clean;
    };
  }
  const status = fieldById(entity, 'Status');
  return (row) => String(status?.value(row) ?? STATUS_LABEL.released);
}

export interface StatusCount {
  status: string;
  count: number;
}

/** Statuses of some rows, most urgent first, without zeros. */
export function mixOf(entity: EntityKind, rows: readonly EntityRow[], statusOf: (row: EntityRow) => string): StatusCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const s = statusOf(r);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return statusOrder(entity)
    .filter((s) => counts.has(s))
    .map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

/** A short line for a cell: "3 unreleased", "all released". */
export function cellSummary(entity: EntityKind, mix: readonly StatusCount[], focus?: StatusKind): string {
  // Under a status sort the cell says that status's count, so the order reads.
  const focusLabel = focus ? statusLabelFor(entity, focus) : undefined;
  if (focus && focusLabel) return `${mix.find((m) => m.status === focusLabel)?.count ?? 0} ${statusWords(entity, focus)}`;
  const worst = mix[0];
  if (!worst) return '';
  if (entity === 'Space') {
    if (worst.status === SPACE_STATUS.clean) return 'all released';
    return `${worst.count} ${worst.status === SPACE_STATUS.unreleased ? 'unreleased' : 'upgradable'}`;
  }
  if (worst.status === STATUS_LABEL.released) return 'all released';
  if (worst.status === STATUS_LABEL.untargeted) return `${worst.count} not targeted`;
  return `${worst.count} ${worst.status === STATUS_LABEL.unreleased ? 'unreleased' : 'to upgrade'}`;
}

export interface MatrixAxis {
  field: FieldDef;
  groups: GroupNode<EntityRow>[];
}

export interface MatrixData {
  rows: MatrixAxis;
  cols: MatrixAxis;
  /** Cell rows by row group value, then column group value. */
  cells: Map<string, Map<string, EntityRow[]>>;
}

/** The matrix of `rows`, or null when an axis is not a field this entity has. */
export function buildMatrix(entity: EntityKind, rows: readonly EntityRow[], rowField: string, colField: string): MatrixData | null {
  const rf = fieldById(entity, rowField);
  const cf = fieldById(entity, colField);
  const rl = groupLevelFor(entity, rowField);
  const cl = groupLevelFor(entity, colField);
  if (!rf || !cf || !rl || !cl) return null;
  const rowGroups = buildGroupTree(rows, [rl]);
  const colGroups = buildGroupTree(rows, [cl]);
  const cells = new Map<string, Map<string, EntityRow[]>>();
  for (const g of rowGroups) {
    cells.set(g.value, new Map(buildGroupTree(g.rows, [cl]).map((c) => [c.value, c.rows])));
  }
  return { rows: { field: rf, groups: rowGroups }, cols: { field: cf, groups: colGroups }, cells };
}

/** A row's own name has one value per row: never an axis. */
const NAME_FIELDS = new Set(['Slug', 'DisplayName', 'ResourceName', 'LastChangeDescription']);

/** Fields that make an axis: ones with few values (text, statuses), not names, times or numbers. */
export function axisFields(entity: EntityKind, labelKeys: readonly string[]): FieldDef[] {
  return fieldCatalog(entity, labelKeys).filter(
    (f) => (f.type === 'string' || f.type === 'status' || f.type === 'bool') && !NAME_FIELDS.has(f.id),
  );
}

/**
 * The lenses that make a view show one cell: for each axis, its value. A lens
 * already on the same field with `is` is changed rather than added, so
 * drilling in twice does not stack two conditions on one field.
 */
export function drillLenses(current: readonly Lens[], specs: readonly LensSpec[], newId: () => string): Lens[] {
  const next = [...current];
  for (const spec of specs) {
    if (spec.kind === 'field') {
      const i = next.findIndex((l) => l.kind === 'field' && l.field === spec.field && (l.op === 'is' || l.op === 'empty'));
      if (i !== -1) {
        next[i] = { ...next[i], ...spec, enabled: true } as Lens;
        continue;
      }
    }
    if (spec.kind === 'status') {
      const i = next.findIndex((l) => l.kind === 'status' && l.status === spec.status);
      if (i !== -1) {
        next[i] = { ...next[i], enabled: true };
        continue;
      }
    }
    next.push({ ...spec, id: newId(), enabled: true } as Lens);
  }
  return next;
}


/* ------------------------------------------------------------------------ */
/* Sorting an axis                                                           */
/* ------------------------------------------------------------------------ */

/** How one axis of the matrix is ordered. Absent: by name, A→Z (the table's group order). */
export type AxisSort = MatrixSort;

/**
 * The status label that a status sort key counts, for this entity, or
 * undefined when the entity has no such status (a hand-written `untargeted`
 * sort on Spaces): the axis then keeps its name order.
 */
export function statusLabelFor(entity: EntityKind, key: StatusKind): string | undefined {
  if (!statusSortKeys(entity).includes(key)) return undefined;
  if (entity === 'Space') {
    if (key === 'unreleased') return SPACE_STATUS.unreleased;
    if (key === 'upgradable') return SPACE_STATUS.upgradable;
    return SPACE_STATUS.clean;
  }
  return STATUS_LABEL[key];
}

/** The status sort keys an entity offers: the statuses its rows can have. */
export function statusSortKeys(entity: EntityKind): StatusKind[] {
  return entity === 'Space' ? ['unreleased', 'upgradable', 'released'] : statusesFor(entity);
}

/** The words for a sort, as the Sort menu and its button show them. */
export function sortLabel(entity: EntityKind, sort: AxisSort | undefined): string {
  const s = sort ?? { key: 'name', dir: 'ASC' };
  if (s.key === 'name') return s.dir === 'ASC' ? 'Name A→Z' : 'Name Z→A';
  if (s.key === 'total') return s.dir === 'DESC' ? 'Total, most first' : 'Total, fewest first';
  return `${s.dir === 'DESC' ? 'Most' : 'Fewest'} ${statusWords(entity, s.key)}`;
}

/** A status as a count reads it: "3 to upgrade". */
function statusWords(entity: EntityKind, key: StatusKind): string {
  const words: Record<StatusKind, string> = {
    unreleased: 'unreleased',
    upgradable: 'to upgrade',
    released: entity === 'Space' ? 'fully released' : 'released',
    untargeted: 'not targeted',
  };
  return words[key];
}

/**
 * The groups of one axis in the order a sort asks for. Ties keep the name
 * order; the empty group ("none") is always last, whatever the order.
 */
export function sortAxis<R>(
  entity: EntityKind,
  groups: readonly GroupNode<R>[],
  sort: AxisSort | undefined,
  statusOf: (row: R) => string,
): GroupNode<R>[] {
  const named = groups.filter((g) => g.value !== EMPTY_GROUP_VALUE);
  const empty = groups.filter((g) => g.value === EMPTY_GROUP_VALUE);
  const label = !sort || sort.key === 'name' || sort.key === 'total' ? null : statusLabelFor(entity, sort.key);
  if (!sort || isDefaultSort(sort) || label === undefined) return [...named, ...empty];
  if (sort.key === 'name') return [...named].reverse().concat(empty);
  const measure = (g: GroupNode<R>) => (label === null ? g.rows.length : g.rows.filter((r) => statusOf(r) === label).length);
  const sign = sort.dir === 'DESC' ? -1 : 1;
  const ranked = named.map((g, index) => ({ g, index, n: measure(g) }));
  ranked.sort((a, b) => (a.n - b.n) * sign || a.index - b.index);
  return [...ranked.map((x) => x.g), ...empty];
}

/** The status sort keys whose status some row has now, in the legend's order (most urgent first). */
export function presentStatusKeys(entity: EntityKind, present: readonly StatusCount[]): StatusKind[] {
  return present.map((p) => statusKeyOf(entity, p.status)).filter((k): k is StatusKind => k !== undefined);
}

/** The status sort key a legend label stands for, if any. */
export function statusKeyOf(entity: EntityKind, label: string): StatusKind | undefined {
  return statusSortKeys(entity).find((k) => statusLabelFor(entity, k) === label);
}


/** The Total header's three steps: most first, fewest first, back to names. */
export function nextTotalSort(sort: AxisSort | undefined): AxisSort | undefined {
  if (sort?.key !== 'total') return { key: 'total', dir: 'DESC' };
  return sort.dir === 'DESC' ? { key: 'total', dir: 'ASC' } : undefined;
}
