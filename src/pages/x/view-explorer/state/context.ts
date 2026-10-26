// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { createContext, type Dispatch, type MutableRefObject, useContext, useEffect } from 'react';

import { COMPARE_PARAM, encodeCompareParam } from '../model/compare';
import type { ExplorerAction } from '../model/reducer';
import { encodeDraftParam, viewDefsEqual } from '../model/view-codec';
import type { ExplorerState, TabState } from '../model/types';
import type { SavedView } from '../queries/useViews';
import { BASE_PARAM, DRAFT_PARAM, FILTER_BASE_PARAM, NEW_VIEW_PARAM_VALUE, TEMP_PARAM, VIEW_PARAM } from './initial';
import { filterVersionKey } from './versions';
import { type ExplorerSlots, NOOP_SLOTS, type SlotName } from './slots';
import type { ExplorerStorage } from './storage';

/** A keyboard shortcut. A feature adds its own through `registerShortcut` while it is mounted. */
export interface Shortcut {
  id: string;
  /** How the keys are written in the `?` list: "⌘S", "[". */
  keys: string;
  label: string;
  matches: (e: KeyboardEvent) => boolean;
  run: (e: KeyboardEvent) => void;
  /** Also fires while typing in a text field (⌘S does; `n` does not). */
  inText?: boolean;
  /** Also fires while a modal layer is open (`isModalOpen`), such as the key that closes that layer. */
  inModal?: boolean;
}

export interface ToastInput {
  message: string;
  severity?: 'success' | 'info' | 'warning' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}


export interface ExplorerContextValue {
  state: ExplorerState;
  dispatch: Dispatch<ExplorerAction>;
  views: readonly SavedView[];
  viewsById: ReadonlyMap<string, SavedView>;
  storage: ExplorerStorage;
  slots: MutableRefObject<ExplorerSlots>;
  shortcuts: MutableRefObject<Map<string, Shortcut>>;
  /** The page's own bindings (usePageShortcuts), listed before the registry's in the `?` list. */
  pageShortcuts: MutableRefObject<readonly Shortcut[]>;
  toast: (input: ToastInput) => void;
  /** The temporary tab whose name is being asked for, to save it. */
  namingTabId: string | null;
  setNamingTabId: (tabId: string | null) => void;
  /** The saved tab being renamed. */
  renamingTabId: string | null;
  setRenamingTabId: (tabId: string | null) => void;
  /** Tabs with a write in flight. One write per tab at a time, whichever control started it. */
  saving: ReadonlySet<string>;
  /** Start a write for a tab; false (and nothing starts) when one is already in flight. */
  beginSave: (tabId: string) => boolean;
  endSave: (tabId: string) => void;
  /** The tab whose Save found the View changed by someone else, waiting for the person to choose. */
  conflictTabId: string | null;
  setConflictTabId: (tabId: string | null) => void;
  /** Each View's UpdatedAt as this page last read or wrote it, by View ID. */
  versions: MutableRefObject<Map<string, string>>;
  /** Tabs kept open until a time (ms) although leaving them would close them: a Discard whose Undo is still on offer. */
  holdOpen: MutableRefObject<Map<string, number>>;
  /** Add a shortcut; returns the function that removes it. `useRegisterShortcut` does this for a component. */
  registerShortcut: (shortcut: Shortcut) => () => void;
  /** Make Esc close this layer first (a popover, the composer); returns the function that removes it. */
  pushEscLayer: (close: () => void) => () => void;
}

export const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function useExplorerContext(): ExplorerContextValue {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error('useExplorerContext must be used inside ExplorerProvider');
  return ctx;
}

/**
 * Register the real function for a slot while the component that owns it is
 * mounted. The slot falls back to its no-op when the owner unmounts.
 */
export function useRegisterSlot<K extends SlotName>(name: K, fn: ExplorerSlots[K]): void {
  const { slots } = useExplorerContext();
  // A ref write during render would leak a stale function if the render is
  // thrown away; registering after commit (and clearing on unmount) does not.
  useEffect(() => {
    slots.current = { ...slots.current, [name]: fn };
    return () => {
      if (slots.current[name] === fn) slots.current = { ...slots.current, [name]: NOOP_SLOTS[name] };
    };
  }, [slots, name, fn]);
}

/** Add a shortcut while the component that owns it is mounted. */
export function useRegisterShortcut(shortcut: Shortcut): void {
  const { registerShortcut } = useExplorerContext();
  // Same reason as useRegisterSlot: the registry is shared and must follow mounts.
  useEffect(() => registerShortcut(shortcut), [registerShortcut, shortcut]);
}

/** Make Esc close this layer while `open` is true (and before older layers). */
export function useEscLayer(open: boolean, close: () => void): void {
  const { pushEscLayer } = useExplorerContext();
  // The layer stack lives outside React and must follow `open`.
  useEffect(() => (open ? pushEscLayer(close) : undefined), [open, close, pushEscLayer]);
}

/** The URL parameters for a tab: a clean saved view by id; a draft or a temporary view with its ViewDef. */
export function tabUrlParams(tab: TabState | undefined, versions?: ReadonlyMap<string, string>): Record<string, string> {
  if (!tab || tab.kind === 'builtin') return {};
  if (tab.kind === 'temp') return { [VIEW_PARAM]: NEW_VIEW_PARAM_VALUE, [TEMP_PARAM]: tab.id, [DRAFT_PARAM]: encodeDraftParam(tab.work) };
  const params: Record<string, string> = { [VIEW_PARAM]: tab.viewId ?? '' };
  if (tab.baseline && !viewDefsEqual(tab.baseline, tab.work)) {
    params[DRAFT_PARAM] = encodeDraftParam(tab.work);
    // The versions the draft started from, so whoever opens the link is asked before overwriting a later change.
    const base = tab.viewId ? versions?.get(tab.viewId) : undefined;
    const filterBase = tab.viewId ? versions?.get(filterVersionKey(tab.viewId)) : undefined;
    if (base) params[BASE_PARAM] = base;
    if (filterBase) params[FILTER_BASE_PARAM] = filterBase;
  }
  return params;
}

/** The URL parameters for what a tab shows: its view (`tabUrlParams`) and the Units it compares. */
export function tabLinkParams(
  tab: TabState | undefined,
  versions: ReadonlyMap<string, string> | undefined,
  compareIds: readonly string[],
): Record<string, string> {
  const params = tabUrlParams(tab, versions);
  return compareIds.length ? { ...params, [COMPARE_PARAM]: encodeCompareParam(compareIds) } : params;
}
