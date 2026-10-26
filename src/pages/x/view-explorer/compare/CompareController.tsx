// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { plainKey } from '../keys/usePageShortcuts';
import { compareIdsFor, fillNextSlot, MAX_COMPARE_SLOTS } from '../model/compare';
import { compareSet } from '../model/selection';
import { type Shortcut, useExplorerContext, useRegisterShortcut } from '../state/context';
import { useResults } from '../state/results-context';
import { useRowSelection } from '../state/selection-context';
import { useActiveTab } from '../state/useExplorer';
import { CompareContext, type CompareValue, type PickerRequest, type PickerSource } from './compare-context';
import { UnitPicker } from './UnitPicker';

/**
 * Starts, changes and ends compare mode for the active tab. The Units go to
 * the reducer (`setCompare`), which mirrors them to `?compare=`; this part
 * adds the focus and the words the reducer has no place for.
 *
 * Focus: compare mode remembers what had focus when it opened (a row, the
 * Compare button) and gives focus back to it when it ends. A comparison
 * opened from a link has nothing to go back to, so focus goes to the row of
 * the Unit that was in slot A, or the first row.
 *
 * It also owns the Unit picker, which every way in opens through
 * `openPicker`: the drawer's "Compare with…", "Compare with…" for one picked
 * row, and the slots in compare mode.
 *
 * `c`, on a Units view:
 * - in compare mode, opens the picker for the next empty slot (nothing when
 *   all five are full);
 * - with focus in the drawer, opens the picker with the drawer's Unit in A;
 * - else with two picked rows or more, compares them; with one, opens the
 *   picker with it in A;
 * - else with a row open in the drawer, opens the picker with it in A.
 */

function CompareKey({ run }: { run: () => void }) {
  const shortcut = useMemo<Shortcut>(
    () => ({ id: 'compare', keys: 'C', label: 'Compare the selected Units, or the open one', matches: plainKey('c'), run }),
    [run],
  );
  useRegisterShortcut(shortcut);
  return null;
}

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const sourceOf = (request: PickerRequest): PickerSource =>
  request.kind === 'start' ? request.source : request.kind === 'add' ? (request.source ?? 'slots') : 'slots';

const slotOf = (request: PickerRequest): number | 'add' | null =>
  request.kind === 'replace' ? request.index : request.kind === 'add' && !request.source ? 'add' : null;

/** What had focus when the picker opened, which takes it back when the picker closes with nothing taken. */
function focusedNow(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}

interface Props {
  /** The Unit open in the drawer, which `c` and the drawer's button compare with. */
  panelUnitId: string | null;
  children: ReactNode;
}

/** The row to give focus to after compare mode, when nothing else is there to take it. */
function rowToFocus(slotA: string | undefined): HTMLElement | null {
  const rows = '[data-testid="vx-results"] [data-testid="vx-row"]';
  const byId = slotA ? document.querySelector<HTMLElement>(`${rows}[data-row-id="${CSS.escape(slotA)}"]`) : null;
  return byId ?? document.querySelector<HTMLElement>(rows);
}

export function CompareController({ panelUnitId, children }: Props) {
  const { state, dispatch, toast, slots } = useExplorerContext();
  const { def } = useResults();
  const tab = useActiveTab();
  const selection = useRowSelection();
  const ids = compareIdsFor(state, tab.id);
  const comparing = def.entity === 'Unit' && ids.length > 0;

  const returnFocus = useRef<HTMLElement | null>(null);
  // Set when the comparison is emptied: only that moves focus. A move to a tab that compares nothing does not.
  const restore = useRef<{ slotA: string | undefined } | null>(null);
  const latest = useRef(ids);
  latest.current = ids;

  // Every way the last Unit leaves (Back, Esc, a slot's ✕, the rail, a Unit gone) ends compare
  // mode the same way, with focus given back.
  const setIds = useCallback(
    (next: readonly string[]) => {
      if (next.length === 0 && latest.current.length > 0) restore.current = { slotA: latest.current[0] };
      dispatch({ type: 'setCompare', ids: next });
    },
    [dispatch],
  );
  const start = useCallback(
    (next: readonly string[], returnTo?: HTMLElement | null) => {
      const active = returnTo ?? document.activeElement;
      returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
      // A cell popover or a peek floats over the page, and its keys (o, e, g) would change the hidden view.
      slots.current.closeCellPopover();
      slots.current.closePeek();
      setIds(next);
    },
    [setIds, slots],
  );
  const exit = useCallback(() => setIds([]), [setIds]);
  const add = useCallback(
    (id: string, slug: string) => {
      const { ids: next, result } = fillNextSlot(latest.current, id);
      if (result.kind === 'held') toast({ message: `${slug} is already in slot ${result.letter}.`, severity: 'info' });
      else if (result.kind === 'full') toast({ message: 'All five slots are in use. Clear one first.', severity: 'info' });
      else setIds(next);
    },
    [setIds, toast],
  );

  // After the commit that shows the table again, so the element can take focus.
  useLayoutEffect(() => {
    if (comparing || !restore.current) return;
    const { slotA } = restore.current;
    restore.current = null;
    const back = returnFocus.current;
    returnFocus.current = null;
    const target = back?.isConnected ? back : rowToFocus(slotA);
    if (target) target.focus();
    // A table first drawn while hidden (a link that opened comparing) may draw its rows a frame later.
    else requestAnimationFrame(() => rowToFocus(slotA)?.focus());
  }, [comparing]);

  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [pickerReturn, setPickerReturn] = useState<HTMLElement | null>(null);
  // The picker belongs to the tab it opened in; another tab, or the end of compare mode for a slot's picker, closes it.
  const [pickerTab, setPickerTab] = useState<string | null>(null);
  const openPicker = useCallback(
    (request: PickerRequest) => {
      // A cell popover or a peek would sit over the picker, and their keys over its field.
      slots.current.closeCellPopover();
      slots.current.closePeek();
      setPickerReturn(focusedNow());
      setPicker(request);
      setPickerTab(tab.id);
    },
    [slots, tab.id],
  );
  const closePicker = useCallback(() => setPicker(null), []);
  const pickerStale = !!picker && (pickerTab !== tab.id || def.entity !== 'Unit' || (picker.kind !== 'start' && !comparing));
  if (pickerStale) setPicker(null);
  const shownPicker = pickerStale ? null : picker;

  const { enabled, count, picked, orderedPicked } = selection;
  const onKey = useCallback(() => {
    if (comparing) {
      if (ids.length < MAX_COMPARE_SLOTS) openPicker({ kind: 'add', anchor: byTestId('unit-slot-add') });
      return;
    }
    const fromDrawer = () => {
      if (panelUnitId) openPicker({ kind: 'start', base: panelUnitId, source: 'drawer', anchor: byTestId('vx-drawer-compare') });
    };
    const active = document.activeElement;
    if (panelUnitId && active instanceof HTMLElement && active.closest('[data-testid="vx-row-panel"]')) return fromDrawer();
    if (enabled && count >= 2) return start(compareSet(picked, orderedPicked).ids);
    if (enabled && count === 1) {
      openPicker({ kind: 'start', base: orderedPicked[0], source: 'selection', anchor: byTestId('vx-selection-compare') });
      return;
    }
    fromDrawer();
  }, [comparing, ids.length, openPicker, panelUnitId, enabled, count, picked, orderedPicked, start]);

  const pickerSource = shownPicker ? sourceOf(shownPicker) : null;
  const pickerSlot = shownPicker ? slotOf(shownPicker) : null;
  const value = useMemo<CompareValue>(
    () => ({ ids, comparing, start, setIds, add, exit, openPicker, pickerSource, pickerSlot }),
    [ids, comparing, start, setIds, add, exit, openPicker, pickerSource, pickerSlot],
  );
  return (
    <CompareContext.Provider value={value}>
      {def.entity === 'Unit' && <CompareKey run={onKey} />}
      {children}
      {shownPicker && <UnitPicker request={shownPicker} returnTo={pickerReturn} onClose={closePicker} />}
    </CompareContext.Provider>
  );
}
