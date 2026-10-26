// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { plainKey } from '../keys/usePageShortcuts';
import {
  EMPTY_SELECTION,
  type RowSelection,
  applyRange,
  effective,
  orderedPicked,
  pick as pickRow,
  prune,
  selectAll,
  slotLetters,
  toggle as toggleRow,
  unselect,
} from '../model/selection';
import { compareIdsFor } from '../model/compare';
import { editTargetTabId } from '../model/reducer';
import { orderedRowIds } from '../model/table-order';
import { type Shortcut, useEscLayer, useExplorerContext, useRegisterShortcut } from './context';
import { InvokerSelectionSync } from './InvokerSelectionSync';
import { useResults } from './results-context';
import { RowSelectionContext, type RowSelectionValue } from './selection-context';
import { useActiveTab } from './useExplorer';

/**
 * The Table's row selection, kept per tab for this visit, like the folded
 * groups. It changes on every click, is never a draft and is not undone, so
 * it lives here rather than in the explorer reducer, where each click would
 * re-render everything that reads the explorer state.
 *
 * Esc clears it, after any layer opened later; `x` picks the row that has
 * focus, or the row open in the panel.
 *
 * The first change to "All units" moves the view into a new temporary tab
 * (the reducer's fork). That is still the view the rows were picked in, so
 * the fork starts with the selection "All units" had.
 *
 * The Functions panel lists the same Units (`InvokerSelectionSync`).
 */

const NO_IDS: ReadonlySet<string> = new Set();
const NO_ORDER: readonly string[] = [];

interface Props {
  /** The row open in the panel, which `x` picks when no row has focus. */
  panelRowId: string | null;
  children: ReactNode;
}

function SelectionKeys({ panelRowId, toggle }: { panelRowId: string | null; toggle: (id: string) => void }) {
  const shortcut = useMemo<Shortcut>(
    () => ({
      id: 'select-row',
      keys: 'X',
      label: 'Select the focused row',
      matches: plainKey('x'),
      run: () => {
        const active = document.activeElement;
        const row = active instanceof HTMLElement ? active.closest<HTMLElement>('[data-testid="vx-table"] [data-testid="vx-row"]') : null;
        const id = row?.dataset.rowId ?? panelRowId;
        if (id) toggle(id);
      },
    }),
    [panelRowId, toggle],
  );
  useRegisterShortcut(shortcut);
  return null;
}

export function RowSelectionProvider({ panelRowId, children }: Props) {
  const { def, universe, derived } = useResults();
  const { state } = useExplorerContext();
  const tab = useActiveTab();
  const tabId = tab.id;
  const enabled = def.entity === 'Unit' && def.layout === 'table';
  const [byTab, setByTab] = useState<ReadonlyMap<string, RowSelection>>(() => new Map());

  // While "All units" is active, the reducer already knows the id its next edit
  // forks to (`editTargetTabId`), and no other tab can take that id: it is above
  // every open tab's. So a move from "All units" straight to that id is the fork,
  // never a tab opened some other way, and the selection follows it. Adjusted
  // during render, as ResultsProvider does for its preview, so no frame shows
  // the fork with nothing picked.
  const forkTarget = tab.kind === 'builtin' ? editTargetTabId(state) : null;
  const [seen, setSeen] = useState({ tabId, forkTarget });
  if (seen.tabId !== tabId || seen.forkTarget !== forkTarget) {
    setSeen({ tabId, forkTarget });
    const from = byTab.get(seen.tabId);
    if (seen.tabId !== tabId && seen.forkTarget === tabId && from && !byTab.has(tabId)) setByTab(new Map(byTab).set(tabId, from));
  }
  const stored = byTab.get(tabId) ?? EMPTY_SELECTION;
  const { rows, rowId } = derived;

  // Each set is built only while something is picked: most visits pick nothing.
  const anyStored = stored.ids.size > 0;
  const hasStored = enabled && anyStored;
  const universeIds = useMemo(() => (anyStored ? new Set(derived.universeIds) : NO_IDS), [anyStored, derived.universeIds]);
  const shownIds = useMemo(() => (hasStored ? new Set(rows.map(rowId)) : NO_IDS), [hasStored, rows, rowId]);
  const picked = useMemo(() => (hasStored ? effective(stored, shownIds) : NO_IDS), [hasStored, stored, shownIds]);
  const hasPicked = picked.size > 0;
  const groupKey = def.groupBy.join('|');
  const tableOrder = useMemo(
    () => (hasPicked ? orderedRowIds(rows, def.groupBy, def.entity, rowId) : NO_ORDER),
    // groupKey stands for def.groupBy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPicked, rows, groupKey, def.entity, rowId],
  );
  const ordered = useMemo(() => orderedPicked(tableOrder, picked), [tableOrder, picked]);
  const letters = useMemo(() => slotLetters(tableOrder, picked), [tableOrder, picked]);

  // A row deleted since it was picked is dropped on the next change; while the
  // rows are loading there is nothing to check against, so nothing is dropped.
  // `update` reads the tab and the rows through a ref, so it and every action
  // built on it keep one identity: the Esc layer keeps its place in the stack
  // when the rows reload, and the memoized table rows are not drawn again.
  // The ref holds committed values only, and is read when the action runs, not
  // in the updater: React can replay an updater during a render that has not
  // committed, and a render from before the first pick has no rows to check
  // against, so the replay would drop the row it was toggling.
  const latest = useRef({ tabId, universeIds, canPrune: false });
  useLayoutEffect(() => {
    latest.current = { tabId, universeIds, canPrune: !universe.isLoading && !universe.isError };
  });
  const update = useCallback((change: (s: RowSelection) => RowSelection) => {
    const { tabId: id, universeIds: known, canPrune } = latest.current;
    setByTab((prev) => {
      const current = prev.get(id) ?? EMPTY_SELECTION;
      const next = change(canPrune ? prune(current, known) : current);
      return next === current ? prev : new Map(prev).set(id, next);
    });
  }, []);

  const toggle = useCallback((id: string) => update((s) => toggleRow(s, id)), [update]);
  const pick = useCallback((id: string) => update((s) => pickRow(s, id)), [update]);
  const range = useCallback((visibleIds: readonly string[], id: string) => update((s) => applyRange(s, visibleIds, id)), [update]);
  const selectShown = useCallback(() => update((s) => selectAll(s, rows.map(rowId))), [update, rows, rowId]);
  const unselectShown = useCallback(() => update((s) => unselect(s, rows.map(rowId))), [update, rows, rowId]);
  const clear = useCallback(() => update(() => EMPTY_SELECTION), [update]);

  // While the tab compares, Esc belongs to compare mode, whichever layer registered first: a
  // tab switch or an undo can bring picked rows back in the same commit compare mode opens in.
  const comparing = def.entity === 'Unit' && compareIdsFor(state, tabId).length > 0;
  useEscLayer(hasPicked && !comparing, clear);

  const value = useMemo<RowSelectionValue>(
    () => ({ enabled, picked, count: picked.size, letters, orderedPicked: ordered, toggle, pick, range, selectShown, unselectShown, clear }),
    [enabled, picked, letters, ordered, toggle, pick, range, selectShown, unselectShown, clear],
  );
  return (
    <RowSelectionContext.Provider value={value}>
      {enabled && <SelectionKeys panelRowId={panelRowId} toggle={toggle} />}
      <InvokerSelectionSync enabled={enabled} ordered={ordered} rows={rows} rowId={rowId} update={update} />
      {children}
    </RowSelectionContext.Provider>
  );
}
