// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { lensPredicate } from '../model/client-eval';
import {
  type CountsResult,
  type LensMatch,
  computeCounts,
  liveCountsEnabled,
  matchSet,
} from '../model/counts';
import type { EntityRow } from '../model/fields';
import { sortRows } from '../model/sort';
import type { EntityKind, Lens, ViewDef } from '../model/types';
import type { ServerMatchSets } from './useServerMatchSets';
import { type UniverseResult, rowIdOf } from './useUniverseRows';

/**
 * The rows a view shows, and everything the lens column counts from. Each
 * lens, enabled or not, becomes a match set (the ids it lets through, over
 * the whole universe); the shown rows are the rows in every enabled set,
 * sorted by the view's sort. The lenses passed in include any preview lenses,
 * so the rows follow a suggestion under the pointer.
 *
 * A lens the client cannot evaluate takes its set from the server sets; with
 * none yet, its set is null and the counts are partial.
 */

export interface DerivedRows {
  /** Every row id, in universe order. */
  universeIds: string[];
  /** The shown rows, sorted. */
  rows: EntityRow[];
  rowId: (row: EntityRow) => string;
  total: number;
  /** One per lens (preview lenses included), enabled or not; then the Filter's WhereData / ResourceType sets. */
  matches: LensMatch[];
  counts: CountsResult;
  loading: boolean;
  error?: unknown;
}

/**
 * Match sets for every lens: the client's where it can, else the server's (or
 * null). Server sets under a key that is not a lens id (the Filter's
 * WhereData and ResourceType: `filter:whereData`, `filter:resourceType`) are
 * appended as enabled matches, so they filter the rows too.
 */
export function lensMatches(
  entity: EntityKind,
  rows: readonly EntityRow[],
  lenses: readonly Lens[],
  server: ServerMatchSets,
): LensMatch[] {
  const id = (r: EntityRow) => rowIdOf(entity, r);
  const out: LensMatch[] = lenses.map((lens) => {
    const predicate = lensPredicate(entity, lens);
    const set = predicate ? matchSet(rows, id, predicate) : (server.get(lens.id) ?? null);
    return { lensId: lens.id, enabled: lens.enabled, set };
  });
  const lensIds = new Set(lenses.map((l) => l.id));
  for (const [key, set] of server)
    if (!lensIds.has(key)) out.push({ lensId: key, enabled: true, set });
  return out;
}

export function useDerivedRows(
  universe: UniverseResult,
  def: ViewDef,
  server: ServerMatchSets,
): DerivedRows {
  const { entity, rows: all } = universe;
  const lensesKey = JSON.stringify(def.lenses);
  const matches = useMemo(
    () => lensMatches(entity, all, def.lenses, server),
    // lensesKey stands for def.lenses, which is a new array whenever the tab's view changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, all, lensesKey, server],
  );
  const rowId = useMemo(() => (r: EntityRow) => rowIdOf(entity, r), [entity]);
  const universeIds = useMemo(() => all.map(rowId), [all, rowId]);
  // Above the live-count limit the per-lens numbers are hidden, so they are not worked out either; the result still is.
  const counts = useMemo(
    () =>
      computeCounts(universeIds, matches, { perLens: liveCountsEnabled(universeIds.length) }),
    [universeIds, matches],
  );
  const sortKey = JSON.stringify(def.sort);
  const rows = useMemo(
    () =>
      sortRows(
        entity,
        all.filter((r) => counts.resultSet.has(rowId(r))),
        def.sort,
      ),
    // sortKey stands for def.sort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, counts, rowId, entity, sortKey],
  );

  return useMemo(
    () => ({
      universeIds,
      rows,
      rowId,
      total: all.length,
      matches,
      counts,
      loading: universe.isLoading,
      error: universe.isError
        ? (universe.error ?? new Error('The rows could not be loaded.'))
        : undefined,
    }),
    [
      universeIds,
      rows,
      rowId,
      all.length,
      matches,
      counts,
      universe.isLoading,
      universe.isError,
      universe.error,
    ],
  );
}
