// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef } from 'react';

import type { ExtendedUnitRead } from '@confighub/rtk-query';

import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import { selectSelectedUnits, selectSelectedUnitsRemovedAll, setSelectedUnits } from '@/state/slices/selectedUnits';

import type { EntityRow } from '../model/fields';
import { type RowSelection, applyPanelChange, panelChange, sameIds } from '../model/selection';

/**
 * Keeps the Functions panel's Units (the app's `selectedUnits` slice) and the
 * Table's selection as one list, in table order.
 *
 * The explorer writes its selection to the slice whenever it changes. It
 * writes an empty list while nothing is picked, and in a view with no
 * selection (Spaces, Resources, Board, Matrix). With an empty slice, the
 * layout gives the panel no Units, and the panel shows its own list: empty
 * ("0 units") until its user adds a Unit there. The panel changes the slice
 * when its user takes Units out; that comes back here as a change to the
 * active tab's selection. Its "deselect all" (`removedAll`) clears the
 * selection; taking out the last Unit unpicks only that row.
 *
 * `inSlice` is the list the slice holds as far as this page knows: what it
 * last wrote, or the list the panel changed it to. A slice equal to it is this
 * page's own write and is not applied back. A change from the panel is
 * applied once; the selection then equals the panel's list, or it differs
 * (a Unit the table does not show) and is written once more. So one change
 * on either side makes at most two writes, and never a loop.
 */

const NONE: readonly string[] = [];

interface Props {
  /** True when the selection applies: a Units view drawn as a Table. */
  enabled: boolean;
  /** The picked rows of the active tab, in table order. */
  ordered: readonly string[];
  /** The shown rows. */
  rows: readonly EntityRow[];
  rowId: (row: EntityRow) => string;
  /** Change the active tab's stored selection. */
  update: (change: (s: RowSelection) => RowSelection) => void;
}

const idsOf = (units: readonly ExtendedUnitRead[] | undefined): string[] => (units ?? []).map((u) => u.Unit?.UnitID ?? '');

export function InvokerSelectionSync({ enabled, ordered, rows, rowId, update }: Props) {
  const dispatch = useAppDispatch();
  const slice = useAppSelector(selectSelectedUnits);
  const removedAll = useAppSelector(selectSelectedUnitsRemovedAll);
  const ids = enabled ? ordered : NONE;

  const inSlice = useRef<readonly string[] | null>(null);
  if (inSlice.current === null) inSlice.current = idsOf(slice);
  const seenSlice = useRef(slice);

  // Only what the panel reads: the slice freezes what it holds, and the rows belong to the explorer.
  const write = useCallback(
    (next: readonly string[]) => {
      inSlice.current = next;
      const byId = new Map<string, ExtendedUnitRead>();
      if (next.length > 0) for (const row of rows as readonly ExtendedUnitRead[]) byId.set(rowId(row), row);
      const units = next.flatMap((id) => {
        const row = byId.get(id);
        return row ? [{ Unit: row.Unit, Space: row.Space }] : [];
      });
      dispatch(setSelectedUnits({ units }));
    },
    [dispatch, rows, rowId],
  );

  // The slice is outside React's state for this page, so a write to it is an effect.
  useEffect(() => {
    if (!sameIds(ids, inSlice.current ?? NONE)) write(ids);
  }, [ids, write]);

  useEffect(() => {
    if (slice === seenSlice.current) return;
    seenSlice.current = slice;
    const list = idsOf(slice);
    const known = inSlice.current ?? NONE;
    if (sameIds(list, known)) return;
    const change = enabled ? panelChange(known, list, new Set(rows.map(rowId)), removedAll) : null;
    if (!change) {
      write(ids);
      return;
    }
    inSlice.current = list;
    update((s) => applyPanelChange(s, change));
  }, [slice, removedAll, enabled, ids, rows, rowId, write, update]);

  // Leaving the page: the next page's Units, or the panel's own list, take over.
  useEffect(
    () => () => {
      inSlice.current = NONE;
      dispatch(setSelectedUnits({ units: [] }));
    },
    [dispatch],
  );

  return null;
}
