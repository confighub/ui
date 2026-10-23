// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { noun } from '../lenses/layer';
import { type RowPredicate, lensPredicate } from '../model/client-eval';
import type { EntityRow } from '../model/fields';
import { lensProblem } from '../model/lens-compile';
import type { EntityKind, Lens, LensSpec } from '../model/types';

/**
 * A peek's slice joined to the view's lenses, for "Pin as draft" and "Add as
 * filter". A slice's `is` value takes the place of the values of an `is`
 * lens on the same field (enabled again if it was hidden): peeking at "Space
 * payments-prod" inside a view with "Space = payments-prod, payments-staging"
 * ends with one Space lens. A slice status that is already a lens enables that
 * lens. Everything else is added as a new lens; existing lenses with other
 * comparisons (`matches`, `is not`) stay as they are.
 */
export function mergeSlice(
  lenses: readonly Lens[],
  slice: readonly LensSpec[],
  newId: () => string,
): { lenses: Lens[]; touched: string[] } {
  const out = lenses.map((l) => ({ ...l }) as Lens);
  const touched: string[] = [];
  for (const spec of slice) {
    if (spec.kind === 'field' && spec.op === 'is') {
      const same = out.findIndex(
        (l) => l.kind === 'field' && l.field === spec.field && l.op === 'is',
      );
      if (same !== -1) {
        out[same] = {
          ...(out[same] as Lens & { kind: 'field' }),
          values: [...spec.values],
          enabled: true,
        };
        touched.push(out[same].id);
        continue;
      }
    }
    if (spec.kind === 'status') {
      const same = out.findIndex((l) => l.kind === 'status' && l.status === spec.status);
      if (same !== -1) {
        out[same] = { ...out[same], enabled: true };
        touched.push(out[same].id);
        continue;
      }
    }
    const lens = { ...spec, id: newId(), enabled: true } as Lens;
    out.push(lens);
    touched.push(lens.id);
  }
  return { lenses: out, touched };
}

export interface PeekSlice {
  /** The rows the card shows. */
  rows: EntityRow[];
  /** Why Pin as draft and Add as filter cannot act (their filters would not give exactly these rows); null when they can. */
  blocked: string | null;
}

/**
 * The rows of a peek and whether its lenses can stand for them. With the
 * group's own row ids (`rowIds`), the card shows exactly those; the lenses
 * can stand for them only when they are all valid filters the client can
 * evaluate and keep exactly the same rows. Without row ids the card shows what
 * the valid lenses keep, and an invalid one blocks the actions.
 */
export function peekSlice(
  entity: EntityKind,
  shown: readonly EntityRow[],
  rowId: (row: EntityRow) => string,
  lenses: readonly LensSpec[],
  rowIds?: readonly string[],
): PeekSlice {
  let problem: string | null = null;
  const predicates: RowPredicate[] = [];
  for (const [i, spec] of lenses.entries()) {
    const invalid = lensProblem(entity, spec);
    const predicate = invalid
      ? null
      : lensPredicate(entity, { ...spec, id: `peek:${i}`, enabled: true } as Lens);
    if (invalid) problem ??= invalid.message;
    else if (!predicate) problem ??= 'this part needs the server to be read as a filter.';
    else predicates.push(predicate);
  }
  const byLenses = shown.filter((r) => predicates.every((p) => p(r)));
  const blockedBy = problem ? `No filter can say this part of the view: ${problem}` : null;
  if (!rowIds) return { rows: byLenses, blocked: blockedBy };

  const ids = new Set(rowIds);
  const rows = shown.filter((r) => ids.has(rowId(r)));
  if (blockedBy) return { rows, blocked: blockedBy };
  const same = byLenses.length === rows.length && byLenses.every((r) => ids.has(rowId(r)));
  if (same) return { rows, blocked: null };
  const statusHint = lenses.some((l) => l.kind === 'status')
    ? ' A status group counts a row once, by its most urgent state; a status filter counts every row that has that state.'
    : '';
  return {
    rows,
    blocked: `No filter shows exactly these ${rows.length} ${noun(entity, rows.length)}: the closest one shows ${byLenses.length}.${statusHint}`,
  };
}
