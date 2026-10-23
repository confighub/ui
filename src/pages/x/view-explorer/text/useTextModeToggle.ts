// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { isMod } from '../keys/usePageShortcuts';
import { BUILTIN_TAB_ID } from '../model/reducer';
import { type Shortcut, useExplorerContext, useRegisterShortcut, useRegisterSlot } from '../state/context';
import type { ExplorerSlots } from '../state/slots';
import { requestLensSelection } from './selection';

/**
 * Text mode's always-mounted part: ⌘E switches between lenses and text, and
 * the `openTextMode` slot opens text mode, optionally with one lens's text
 * selected (a click on a Custom WHERE lens). The lens column calls this once;
 * the editor itself is only mounted while text mode is on.
 *
 * The mode belongs to a tab, for this page load only: a view always opens on
 * Lenses, and a tab the viewer comes back to shows the mode they left it in.
 * Nothing is stored, so a reload starts on Lenses everywhere.
 */
export function useTextModeToggle(): void {
  const { state, dispatch } = useExplorerContext();
  const mode = state.mode;
  const activeId = state.activeId;

  const modeByTab = useRef(new Map<string, 'lenses' | 'text'>());
  const shownTab = useRef(activeId);
  // The reducer has one mode for the page; moving to another tab puts back that tab's own.
  // It reacts to a tab change the reducer has already made, so it has to be an effect.
  useEffect(() => {
    const left = shownTab.current;
    if (left === activeId) {
      modeByTab.current.set(activeId, mode);
      return;
    }
    // `mode` is still the mode of the tab being left: this render is the one that moved.
    modeByTab.current.set(left, mode);
    shownTab.current = activeId;
    const seen = modeByTab.current.get(activeId);
    // A change on "All units" forks a temporary tab in the same step: it is the same view, so
    // the mode carries over (otherwise typing in text mode would end in lenses mode).
    const fork = left === BUILTIN_TAB_ID && !seen && state.tabs.some((t) => t.id === activeId && t.kind === 'temp' && t.history.length === 1);
    const wanted = seen ?? (fork ? mode : 'lenses');
    modeByTab.current.set(activeId, wanted);
    if (wanted !== mode) dispatch({ type: 'setMode', mode: wanted });
  }, [activeId, mode, dispatch, state.tabs]);

  const shortcut = useMemo<Shortcut>(
    () => ({
      id: 'text-mode',
      keys: '⌘E',
      label: mode === 'text' ? 'Back to lenses' : 'Edit the filter as text',
      matches: (e) => isMod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e',
      run: () => dispatch({ type: 'setMode', mode: mode === 'text' ? 'lenses' : 'text' }),
      inText: true,
    }),
    [mode, dispatch],
  );
  useRegisterShortcut(shortcut);

  const openTextMode = useCallback<ExplorerSlots['openTextMode']>(
    (request) => {
      requestLensSelection(request?.selectLensId ?? null);
      dispatch({ type: 'setMode', mode: 'text' });
    },
    [dispatch],
  );
  useRegisterSlot('openTextMode', openTextMode);
}
