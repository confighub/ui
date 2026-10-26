// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { type ExtendedUnitRead, useDownloadUnitDataQuery } from '@confighub/rtk-query';

import type { CompareUnit } from '@/pages/x/apps/compare/ComponentCompareSection';
import type { CompareColumnInput } from '@/pages/x/apps/compare/deploymentCompareModel';
import { letterFor } from '@/pages/x/apps/compare/slotLetter';

import { useResults } from '../state/results-context';
import { columnLabels, slugsDiffer } from './columns';
import { idOf } from './unit-row';

/**
 * The compared Units as the grid reads them. A UnitID is looked up in every
 * Unit the page has loaded (the universe), not only the rows the filters
 * show, so a filter never takes a Unit out of a slot.
 *
 * Each Unit's configuration is its own cached read, one per slot (there are
 * at most five), so adding a Unit reads only that Unit, and a swap or a drag
 * reads nothing: the reads are cached by Unit, not by the set.
 *
 * A UnitID the universe does not hold (deleted, or not visible to the
 * viewer) is `unresolved` once the Units have loaded; while they load, or
 * when they could not be loaded, nothing is unresolved, so nothing is
 * dropped from the slots on a guess. A Unit whose configuration could not be
 * read is left out of the grid (`unread`) rather than shown as empty; the
 * columns left keep the letters of their slots, so B is still B when A is
 * left out.
 */

export interface CompareUnitsResult {
  /** The Units found, in slot order. */
  rows: readonly ExtendedUnitRead[];
  /** Their UnitIDs, in slot order. */
  resolvedIds: readonly string[];
  /** The grid's input: one unit whose columns are the compared Units whose configuration could be read. */
  units: readonly CompareUnit[];
  /** What each compared Unit is called, by UnitID, read or not: the grid's columns and the drag layer's words. */
  labels: ReadonlyMap<string, string>;
  /** The Units do not share a slug, so only the documents they have in common line up. */
  mismatch: boolean;
  /** UnitIDs no longer in the universe, once it has loaded. */
  unresolved: readonly string[];
  /** The Units have not loaded yet. */
  loading: boolean;
  /** The Units could not be loaded. */
  failed: boolean;
  /** Units whose configuration could not be read, in slot order. */
  unread: readonly ExtendedUnitRead[];
  /** Read the configuration of the `unread` Units again. */
  retryUnread: () => void;
}


interface UnitRead {
  /** The configuration, once read: '' for a Unit that holds none. */
  data: string | undefined;
  failed: boolean;
  refetch: () => void;
}

/** One Unit's configuration, cached by Unit; nothing is read without a Unit. */
function useUnitRead(row: ExtendedUnitRead | undefined): UnitRead {
  const spaceId = row?.Unit?.SpaceID ?? '';
  const unitId = row?.Unit?.UnitID ?? '';
  const { currentData, isError, refetch } = useDownloadUnitDataQuery({ spaceId, unitId }, { skip: !spaceId || !unitId });
  return { data: currentData as string | undefined, failed: isError, refetch };
}

export function useCompareUnits(ids: readonly string[]): CompareUnitsResult {
  const { universe } = useResults();
  const isUnits = universe.entity === 'Unit';
  const byId = useMemo(() => {
    const map = new Map<string, ExtendedUnitRead>();
    if (isUnits) for (const row of universe.rows as ExtendedUnitRead[]) map.set(idOf(row), row);
    return map;
  }, [isUnits, universe.rows]);

  const rows = useMemo(() => ids.flatMap((id) => byId.get(id) ?? []), [ids, byId]);
  const resolvedIds = useMemo(() => rows.map(idOf), [rows]);
  // A Retry after a failed load has no rows while it reads again: still loading, so no slot is dropped as gone.
  const loading = !isUnits || universe.isLoading || (universe.rows.length === 0 && universe.isFetching);
  const failed = isUnits && universe.isError;
  const unresolved = useMemo(() => (loading || failed ? [] : ids.filter((id) => !byId.has(id))), [loading, failed, ids, byId]);

  // One read per slot, called the same five times on every render (MAX_COMPARE_SLOTS).
  const r0 = useUnitRead(rows[0]);
  const r1 = useUnitRead(rows[1]);
  const r2 = useUnitRead(rows[2]);
  const r3 = useUnitRead(rows[3]);
  const r4 = useUnitRead(rows[4]);

  const mismatch = slugsDiffer(rows);
  const { units, unread, labels } = useMemo(() => {
    const reads = [
      { data: r0.data, failed: r0.failed },
      { data: r1.data, failed: r1.failed },
      { data: r2.data, failed: r2.failed },
      { data: r3.data, failed: r3.failed },
      { data: r4.data, failed: r4.failed },
    ];
    // Named among every compared Unit, read or not, so a column keeps its name when another cannot be read.
    const names = columnLabels(rows);
    const read = rows.map((row, i) => ({ row, name: names[i], ...reads[i] }));
    const shown = read.filter((r) => r.data !== undefined || !r.failed);
    const columns = shown.map(({ row, name, data }): CompareColumnInput => {
      const id = idOf(row);
      const space = row.Space?.Slug;
      return {
        deploymentId: id,
        label: name,
        displayName: space && space !== name ? space : undefined,
        letter: letterFor(ids.indexOf(id)),
        heading: { primary: row.Unit?.Slug ?? '', secondary: space ?? '' },
        data: data || undefined,
        unitId: id,
        unavailable: data ? undefined : data === '' ? 'empty-unit' : 'loading',
      };
    });
    // The slug names a document that has no name of its own (an AppConfig file); slot A's when the slugs differ.
    const grid: CompareUnit[] = columns.length ? [{ slug: shown[0].row.Unit?.Slug ?? '', columns }] : [];
    return {
      units: grid,
      unread: read.filter((r) => r.data === undefined && r.failed).map((r) => r.row),
      labels: new Map(read.map((r) => [idOf(r.row), r.name])),
    };
  }, [ids, rows, r0.data, r0.failed, r1.data, r1.failed, r2.data, r2.failed, r3.data, r3.failed, r4.data, r4.failed]);

  const retryUnread = () => {
    for (const r of [r0, r1, r2, r3, r4]) if (r.failed) r.refetch();
  };

  return { rows, resolvedIds, units, labels, mismatch, unresolved, loading, failed, unread, retryUnread };
}
