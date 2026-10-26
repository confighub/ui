// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';

/**
 * What the Unit picker is opened for. `start` builds a new comparison with
 * `base` in slot A (from the drawer, or one picked row), and commits it on
 * ↵; `add` fills the next empty slot and `replace` a filled one, in compare
 * mode, where each pick changes the slots at once. `anchor` is the control
 * it opens under; an `add` is opened from the empty slot unless `source`
 * says it came from the one-Unit state's button.
 */
export type PickerRequest =
  | { kind: 'start'; base: string; source: 'drawer' | 'selection'; anchor: HTMLElement | null }
  | { kind: 'add'; anchor: HTMLElement | null; source?: 'one-unit' }
  | { kind: 'replace'; index: number; anchor: HTMLElement | null };

/** Which control the open picker belongs to, for that control's `aria-expanded`. */
export type PickerSource = 'drawer' | 'selection' | 'slots' | 'one-unit';

/**
 * Compare mode of the active tab: the Units it compares and the means of
 * changing them. The ids live in the explorer reducer (`state.compare`), so
 * they follow the tab and the URL; `CompareController` owns this value and
 * what the reducer cannot do itself: focus and toasts.
 */
export interface CompareValue {
  /** UnitIDs in slot order, slot A first. */
  ids: readonly string[];
  /** The active tab is a Units view with at least one Unit to compare. */
  comparing: boolean;
  /**
   * Open compare mode on these Units. Focus goes back to where it was when
   * compare mode ends, or to `returnTo` (the control that opened the picker).
   */
  start: (ids: readonly string[], returnTo?: HTMLElement | null) => void;
  /** Change the slots (a clear, a swap, a drag). An empty list ends compare mode. */
  setIds: (ids: readonly string[]) => void;
  /** Put a Unit in the next empty slot, or say why it cannot go there. */
  add: (id: string, slug: string) => void;
  /** Back to the table, with focus where it was before. */
  exit: () => void;
  /** Open the Unit picker. */
  openPicker: (request: PickerRequest) => void;
  /** The control the open picker belongs to; null while it is closed. */
  pickerSource: PickerSource | null;
  /** The slot whose picker is open: its index, or `'add'` for the empty slot; null otherwise. */
  pickerSlot: number | 'add' | null;
}

export const CompareContext = createContext<CompareValue | null>(null);

export function useCompare(): CompareValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used inside CompareController');
  return ctx;
}
