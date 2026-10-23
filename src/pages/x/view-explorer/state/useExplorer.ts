// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type Dispatch, useCallback, useMemo } from 'react';

import { autoName } from '../model/auto-name';
import { activeTab, type ExplorerAction, isBlankTemp, isDirty } from '../model/reducer';
import { diffViewDefs } from '../model/view-codec';
import type { TabState, ViewDef } from '../model/types';
import { useExplorerContext } from './context';
import { focusWithTypeahead } from '../keys/typeahead';
import { newId, savedTab } from './initial';
import { rememberVersions } from './versions';

/** How long a toast with an action stays (ExplorerProvider), and so how long Discard's Undo is on offer. */
const DISCARD_UNDO_MS = 6500;

/** The tab on screen. There is always one: the built-in tab cannot be closed. */
export function useActiveTab(): TabState {
  const { state } = useExplorerContext();
  const tab = activeTab(state);
  if (!tab) throw new Error('the explorer has no active tab');
  return tab;
}

/** The view the active tab shows now (without preview lenses). */
export function useWork(): ViewDef {
  return useActiveTab().work;
}

/** The reducer's dispatch: every change to a view goes through it. */
export function useDispatch(): Dispatch<ExplorerAction> {
  return useExplorerContext().dispatch;
}

/** The name a tab shows: its saved name, or for a temporary view a name made from its filters. */
export function tabLabel(tab: TabState): string {
  if (tab.kind !== 'temp' || tab.name) return tab.name;
  return autoName(tab.work.entity, tab.work.lenses) || 'Untitled view';
}

/** What changed in a tab since it was saved, one plain sentence per change. */
export function tabChanges(tab: TabState): string[] {
  if (tab.kind !== 'saved' || !tab.baseline) return [];
  return diffViewDefs(tab.baseline, tab.work);
}

/**
 * Tab actions shared by the strip, the toolbar and the keyboard. Each one is
 * one or two reducer actions plus what the reducer cannot do itself: focus,
 * toasts with Undo, and closing a tab the viewer only visited.
 */
export function useTabActions() {
  const { state, dispatch, slots, toast, viewsById, versions, holdOpen } = useExplorerContext();

  /**
   * Go to a tab. A saved view opened from "more" (not pinned) and left
   * unchanged closes when the viewer moves on, so the strip holds only what
   * they pinned or are working on.
   */
  /** A clean, unpinned saved tab closes when left, unless its Discard can still be undone. */
  const closesWhenLeft = useCallback(
    (tab: TabState | undefined): tab is TabState =>
      !!tab && tab.kind === 'saved' && !tab.pinned && !isDirty(tab) && (holdOpen.current.get(tab.id) ?? 0) <= Date.now(),
    [holdOpen],
  );

  const goTo = useCallback(
    (tabId: string) => {
      const leaving = activeTab(state);
      if (!leaving || leaving.id === tabId) return;
      dispatch({ type: 'activate', tabId });
      if (closesWhenLeft(leaving)) dispatch({ type: 'closeTab', tabId: leaving.id });
    },
    [state, dispatch, closesWhenLeft],
  );

  /** Open a saved view in a tab (or go to its tab) without pinning it. */
  const openSaved = useCallback(
    (viewId: string) => {
      const existing = state.tabs.find((t) => t.viewId === viewId);
      if (existing) return goTo(existing.id);
      const saved = viewsById.get(viewId);
      if (!saved) return;
      const leaving = activeTab(state);
      // The tab starts from this copy of the view, so a save compares with its version.
      rememberVersions(versions.current, saved);
      dispatch({ type: 'openTab', tab: savedTab(saved, false) });
      if (closesWhenLeft(leaving)) dispatch({ type: 'closeTab', tabId: leaving.id });
    },
    [state, dispatch, viewsById, goTo, versions, closesWhenLeft],
  );

  /**
   * A new temporary tab, with the add-lens input focused in the same event,
   * so keys typed straight after `n` or "+" land in it and none are lost.
   */
  const newTemp = useCallback(
    (def?: ViewDef) => {
      dispatch({ type: 'newTemp', tabId: newId('temp'), def });
      if (!def) focusWithTypeahead(() => slots.current.focusAddLens());
    },
    [dispatch, slots],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || tab.kind === 'builtin') return;
      dispatch({ type: 'closeTab', tabId });
      if (tab.kind === 'temp' && !isBlankTemp(tab)) {
        toast({
          message: 'Closed the temporary view.',
          severity: 'info',
          actionLabel: 'Undo',
          onAction: () => dispatch({ type: 'openTab', tab }),
        });
      }
    },
    [state, dispatch, toast],
  );

  const discard = useCallback(() => {
    const tab = activeTab(state);
    if (!tab) return;
    if (tab.kind === 'temp') return closeTab(tab.id);
    if (!isDirty(tab)) return;
    dispatch({ type: 'discard' });
    // While Undo is on offer the tab stays, even if left: closing it would take its history, and the changes, with it.
    holdOpen.current.set(tab.id, Date.now() + DISCARD_UNDO_MS);
    // Undo acts on this tab, even when another one is open by the time it is pressed.
    toast({
      message: 'Changes discarded.',
      severity: 'info',
      actionLabel: 'Undo',
      onAction: () => {
        holdOpen.current.delete(tab.id);
        dispatch({ type: 'undo', tabId: tab.id });
      },
    });
  }, [state, dispatch, toast, closeTab, holdOpen]);

  const setPinned = useCallback(
    (tabId: string, pinned: boolean) => dispatch({ type: pinned ? 'pin' : 'unpin', tabId }),
    [dispatch],
  );

  /** Neighbouring tab for `[` and `]`. */
  const step = useCallback(
    (delta: number) => {
      const idx = state.tabs.findIndex((t) => t.id === state.activeId);
      if (idx === -1 || state.tabs.length < 2) return;
      const next = state.tabs[(idx + delta + state.tabs.length) % state.tabs.length];
      goTo(next.id);
    },
    [state, goTo],
  );

  return useMemo(
    () => ({ goTo, openSaved, newTemp, closeTab, discard, setPinned, step }),
    [goTo, openSaved, newTemp, closeTab, discard, setPinned, step],
  );
}
