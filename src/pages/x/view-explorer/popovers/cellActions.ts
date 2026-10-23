// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { STATUS_LABEL, fieldById, statusesFor } from '../model/fields';
import { lensProblem } from '../model/lens-compile';
import type {
  EntityKind,
  FieldLens,
  Lens,
  LensSpec,
  StatusKind,
  ViewDef,
} from '../model/types';

/**
 * What "Only this" and "Exclude" do with the values picked in cells: which
 * lens they add, or which lens they change. Pure, so the rules are proven
 * without a browser.
 *
 * - Only this: the values are the only ones shown. The field's "is" lens,
 *   shown or hidden, is narrowed to them and shown (one lens per field stays
 *   readable); otherwise a new lens is added.
 * - Exclude: the values are hidden. They join the field's "is not" lens when
 *   it is shown. A hidden one is left as it is (turning it on would bring back
 *   values the person hid), and a new lens is added.
 * - A value with `*` is refused for both: in a lens `*` means any text, so
 *   the value would become a pattern and match other values too.
 * - An empty cell (null) means "is empty" / "is set". A Unit with no Target is
 *   the Not targeted status, which is how the model writes it.
 * - A Status value (Only this on "Unreleased") is a status lens. A status
 *   cannot be excluded: ConfigHub filters have no NOT.
 */

export type CellAction = 'only' | 'exclude';

export type CellLensPlan =
  | { kind: 'add'; lens: Lens; label: string }
  | { kind: 'update'; lens: Lens; label: string }
  | { kind: 'refused'; reason: string };

const STATUS_BY_LABEL = new Map<string, StatusKind>(
  (Object.entries(STATUS_LABEL) as Array<[StatusKind, string]>).map(([k, v]) => [v, k]),
);

function chipLabel(
  fieldLabel: string,
  values: readonly (string | null)[],
  action: CellAction,
): string {
  const shown = values.map((v) => v ?? 'none').join(', ');
  return `${action === 'exclude' ? '−' : ''}${fieldLabel}: ${shown}`;
}

function spec(
  entity: EntityKind,
  field: string,
  values: readonly (string | null)[],
  action: CellAction,
): LensSpec | string {
  const def = fieldById(entity, field);
  if (!def) return 'This column cannot be a filter.';
  if (def.type === 'status') {
    if (action === 'exclude')
      return 'A status cannot be excluded. Pick the statuses to show instead.';
    if (values.length !== 1 || values[0] === null) return 'Pick one status.';
    const status = STATUS_BY_LABEL.get(values[0]);
    if (!status || !statusesFor(entity).includes(status))
      return `${values[0]} is not a status ${entity}s can be filtered on.`;
    return { kind: 'status', status };
  }
  if (!def.where) return `${def.label} cannot be a filter.`;
  const empties = values.filter((v) => v === null).length;
  if (empties > 0 && empties < values.length)
    return 'Pick empty cells, or cells with values, not both.';
  if (empties > 0) {
    const op = action === 'only' ? 'empty' : 'notEmpty';
    if (def.ops.includes(op)) return { kind: 'field', field, op, values: [] };
    // A Unit with no Target is a status in the model, not an empty Target.
    if (
      action === 'only' &&
      def.nullWhere === 'TargetID' &&
      statusesFor(entity).includes('untargeted')
    ) {
      return { kind: 'status', status: 'untargeted' };
    }
    return `${def.label} cannot be filtered on being ${action === 'only' ? 'empty' : 'set'}.`;
  }
  if (values.some((v) => v !== null && v.includes('*'))) {
    return 'This value holds *, which a filter reads as any text. Use Text mode to match it exactly.';
  }
  const op = action === 'only' ? 'is' : 'isNot';
  if (!def.ops.includes(op)) return `${def.label} cannot be filtered that way.`;
  return { kind: 'field', field, op, values: values as string[] };
}

const unique = (xs: readonly string[]) => [...new Set(xs)];

/**
 * The lens change for an action on picked values. `newId` names a lens that
 * is added. Returns why not, in plain words, when the values cannot be a lens.
 */
export function planCellLens(
  work: ViewDef,
  field: string,
  values: readonly (string | null)[],
  action: CellAction,
  newId: () => string,
): CellLensPlan {
  const entity = work.entity;
  const s = spec(entity, field, values, action);
  if (typeof s === 'string') return { kind: 'refused', reason: s };
  const label = chipLabel(fieldById(entity, field)?.label ?? field, values, action);

  if (s.kind === 'status') {
    const same = work.lenses.find((l) => l.kind === 'status' && l.status === s.status);
    if (same) return { kind: 'update', lens: { ...same, enabled: true }, label };
    return { kind: 'add', lens: { ...s, id: newId(), enabled: true }, label };
  }
  if (s.kind !== 'field') return { kind: 'refused', reason: 'This value cannot be a filter.' };

  const candidate: FieldLens = { ...s, id: newId(), enabled: true };
  if (s.op === 'is' || s.op === 'isNot') {
    const same = work.lenses.find(
      (l): l is FieldLens =>
        l.kind === 'field' &&
        l.field === field &&
        l.op === s.op &&
        (s.op === 'is' || l.enabled) &&
        !l.values.some((v) => v.includes('*')),
    );
    if (same) {
      const merged: FieldLens = {
        ...same,
        enabled: true,
        values: s.op === 'is' ? unique(s.values) : unique([...same.values, ...s.values]),
      };
      const problem = lensProblem(entity, merged);
      if (problem) return { kind: 'refused', reason: problem.message };
      return { kind: 'update', lens: merged, label };
    }
  }
  const problem = lensProblem(entity, candidate);
  if (problem) return { kind: 'refused', reason: problem.message };
  return { kind: 'add', lens: candidate, label };
}

/** Whether a column can be a group level: every catalog field can. */
export function canGroupBy(entity: EntityKind, field: string): boolean {
  return !!fieldById(entity, field);
}

/**
 * The group levels after a column header is dropped on Group, or null when the
 * drop changes nothing: a field the model does not know (a data-path column,
 * which could not be grouped) or one that is already a level.
 */
export function groupByAfterDrop(
  entity: EntityKind,
  groupBy: readonly string[],
  field: string,
): string[] | null {
  if (!canGroupBy(entity, field) || groupBy.includes(field)) return null;
  return [...groupBy, field];
}
