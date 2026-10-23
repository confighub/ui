// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';

import type { ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';

import type { ResourceViewRow } from '../adapters/resource-row';
import { lensPredicate } from '../model/client-eval';
import {
  type CountsResult,
  computeCounts,
  liveCountsEnabled,
  resultWithout,
  valueCounts,
} from '../model/counts';
import { type EntityRow, fieldById } from '../model/fields';
import type { TokenContext } from '../model/tokens';
import type { EntityKind, Lens, LensSpec } from '../model/types';
import { useResults } from '../state/results-context';
import { useWork } from '../state/useExplorer';

/**
 * Everything the lens column counts, from the page's match sets (so nothing
 * is fetched or evaluated twice):
 * - `counts`: the result and each lens's "−N" / "alone N" without the preview
 *   lenses, so a suggestion under the pointer never changes the numbers of the
 *   lenses already there;
 * - `shown`: the number of rows on screen now, preview included;
 * - the token context (label keys and known values) for the add box;
 * - value counts for the lens popover, counted against the other lenses.
 */

export interface LensData {
  entity: EntityKind;
  lenses: readonly Lens[];
  total: number;
  /** Rows shown by the lenses (no preview). */
  result: number;
  /** Rows on screen (with any preview lens). */
  shown: number;
  counts: CountsResult;
  tokenCtx: TokenContext;
  /**
   * False for a view over LIVE_COUNT_ROW_LIMIT rows: then no lens, value or
   * suggestion is counted (each would be a pass over every row, on every key),
   * and `counts.perLens`, `valuesWithCounts` counts and `countExcept` are not
   * to be shown. The result itself is still counted (one pass).
   */
  liveCounts: boolean;
  /** The result count with these lenses added to the current result. */
  countWith: (specs: readonly LensSpec[]) => number;
  /** Each value of a field and how many rows have it, counted against every lens but `exceptLensId`. */
  valuesWithCounts: (
    fieldId: string,
    exceptLensId: string | null,
  ) => Array<{ value: string; count: number | null }>;
  /** How many rows a lens keeps, counted against every lens but `exceptLensId`; null when the server must answer. */
  countExcept: (spec: LensSpec, exceptLensId: string | null) => number | null;
  loading: boolean;
}

function labelKeysOf(entity: EntityKind, rows: readonly EntityRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    const labels =
      entity === 'Unit'
        ? (row as ExtendedUnitRead).Unit?.Labels
        : entity === 'Space'
          ? (row as ExtendedSpaceRead).Space?.Labels
          : (row as ResourceViewRow).UnitLabels;
    if (labels) for (const k of Object.keys(labels)) keys.add(k);
  }
  return [...keys].sort();
}

const asText = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

export function useLensData(): LensData {
  const { universe, derived, preview } = useResults();
  const work = useWork();
  const entity = work.entity;
  const rows = universe.rows;

  const liveCounts = liveCountsEnabled(derived.total);

  const counts = useMemo(() => {
    // Without live counts only the result is read from these, and the page's
    // own pass already has it (the preview's lenses are left out just below).
    if (!preview.length || !liveCounts) return derived.counts;
    const previewIds = new Set(preview.map((l) => l.id));
    return computeCounts(
      derived.universeIds,
      derived.matches.filter((m) => !previewIds.has(m.lensId)),
    );
  }, [derived.counts, derived.matches, derived.universeIds, preview, liveCounts]);

  // The result without the preview lenses: one pass, at any size.
  const result = useMemo(() => {
    if (liveCounts || !preview.length) return counts.result.length;
    const previewIds = new Set(preview.map((l) => l.id));
    const sets = derived.matches
      .filter((m) => m.enabled && m.set !== null && !previewIds.has(m.lensId))
      .map((m) => m.set!);
    let n = 0;
    for (const id of derived.universeIds) if (sets.every((set) => set.has(id))) n++;
    return n;
  }, [liveCounts, preview, counts, derived.matches, derived.universeIds]);

  const labelKeys = useMemo(() => labelKeysOf(entity, rows), [entity, rows]);

  // Known values by field, built on first use: most fields are never asked for.
  const valueCache = useMemo(() => new Map<string, string[]>(), [rows, entity]); // eslint-disable-line react-hooks/exhaustive-deps
  const values = useCallback(
    (fieldId: string): readonly string[] => {
      const hit = valueCache.get(fieldId);
      if (hit) return hit;
      const field = fieldById(entity, fieldId);
      const out = new Set<string>();
      if (field) {
        for (const r of rows) {
          const v = asText(field.value(r));
          if (v !== null) out.add(v);
        }
      }
      const list = [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      valueCache.set(fieldId, list);
      return list;
    },
    [valueCache, entity, rows],
  );

  const tokenCtx = useMemo<TokenContext>(
    () => ({ entity, labelKeys, values }),
    [entity, labelKeys, values],
  );

  // Only countWith reads these, and it is not used without live counts: no pass then.
  const resultRows = useMemo(
    () => (liveCounts ? rows.filter((r) => counts.resultSet.has(derived.rowId(r))) : []),
    [liveCounts, rows, counts, derived],
  );

  const countWith = useCallback(
    (specs: readonly LensSpec[]) => {
      const predicates = specs.map((s, i) =>
        lensPredicate(entity, { ...s, id: `count:${i}`, enabled: true } as Lens),
      );
      if (predicates.some((p) => p === null)) return resultRows.length;
      return resultRows.filter((r) => predicates.every((p) => p!(r))).length;
    },
    [entity, resultRows],
  );

  const valuesWithCounts = useCallback(
    (fieldId: string, exceptLensId: string | null) => {
      const field = fieldById(entity, fieldId);
      if (!field) return [];
      if (!liveCounts) return values(fieldId).map((value) => ({ value, count: null }));
      const previewIds = new Set(preview.map((l) => l.id));
      const matches = derived.matches.filter((m) => !previewIds.has(m.lensId));
      const base = new Set(resultWithout(derived.universeIds, matches, exceptLensId));
      const byValue = valueCounts(rows, derived.rowId, base, (r) => asText(field.value(r)));
      return values(fieldId).map((value) => ({ value, count: byValue.get(value) ?? 0 }));
    },
    [entity, preview, derived, rows, values, liveCounts],
  );

  const countExcept = useCallback(
    (spec: LensSpec, exceptLensId: string | null) => {
      if (!liveCounts) return null;
      const predicate = lensPredicate(entity, { ...spec, id: 'count', enabled: true } as Lens);
      if (!predicate) return null;
      const previewIds = new Set(preview.map((l) => l.id));
      const matches = derived.matches.filter((m) => !previewIds.has(m.lensId));
      const base = new Set(resultWithout(derived.universeIds, matches, exceptLensId));
      let n = 0;
      for (const r of rows) if (base.has(derived.rowId(r)) && predicate(r)) n++;
      return n;
    },
    [entity, preview, derived, rows, liveCounts],
  );

  // One object while nothing it holds changes, so memos that take it keep their result.
  return useMemo(
    () => ({
      entity,
      countExcept,
      lenses: work.lenses,
      total: derived.total,
      result,
      liveCounts,
      shown: derived.rows.length,
      counts,
      tokenCtx,
      countWith,
      valuesWithCounts,
      loading: universe.isLoading,
    }),
    [
      entity,
      countExcept,
      work.lenses,
      derived.total,
      counts,
      result,
      liveCounts,
      derived.rows.length,
      tokenCtx,
      countWith,
      valuesWithCounts,
      universe.isLoading,
    ],
  );
}
