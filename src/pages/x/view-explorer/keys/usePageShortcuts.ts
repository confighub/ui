// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useRef } from 'react';

import { FUNCTIONS_PANEL_SELECTOR } from '@/components/right-sidebar/appPanel';

import { type Shortcut, useExplorerContext } from '../state/context';

/**
 * The page's keyboard: one keydown listener for every shortcut, so two
 * features never both act on one key. Single-letter keys do nothing while the
 * person is typing; modifier shortcuts such as ⌘S still work there.
 *
 * Plain keys and Esc pressed in the Functions panel are the panel's (`isFunctionsPanelKey`).
 *
 * Esc closes one layer at a time: the most recently opened layer that
 * registered with `pushEscLayer` closes first. MUI menus and dialogs handle
 * Esc themselves and stop it, so they close before anything here.
 */

/** True when a keypress goes into a text field rather than to the page. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
}

/**
 * True for a plain key or Esc pressed in the app's Functions panel, beside the
 * page. The panel lists the Units picked here, so Esc in one of its fields must
 * not clear the selection, and `x` or `c` there must not change the view. A ⌘
 * shortcut, such as ⌘S, is the page's there too, as everywhere.
 */
export function isFunctionsPanelKey(e: KeyboardEvent): boolean {
  return !isMod(e) && e.target instanceof Element && !!e.target.closest(FUNCTIONS_PANEL_SELECTOR);
}

/**
 * True while a modal layer is open: the view switcher, the shortcut map, any
 * MUI Dialog, and the MUI menus and popovers (all are MUI Modals). A key
 * pressed there belongs to that layer, so the page's shortcuts stand aside;
 * one that must work there sets `inModal`.
 */
export function isModalOpen(): boolean {
  return !!document.querySelector('[aria-modal="true"], .MuiModal-root:not(.MuiModal-hidden)');
}

/** ⌘ on macOS, Ctrl elsewhere. */
export const isMod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

/** A key with no modifier, as typed (`n`, `[`, `?`). */
export const plainKey = (key: string) => (e: KeyboardEvent) => !isMod(e) && !e.altKey && e.key === key;

const escLayers: Array<() => void> = [];

/** Register a layer Esc should close; returns the function that unregisters it. */
export function pushEscLayer(close: () => void): () => void {
  escLayers.push(close);
  return () => {
    const i = escLayers.lastIndexOf(close);
    if (i !== -1) escLayers.splice(i, 1);
  };
}

/** Every shortcut on the page now, for the `?` list. */
export function useShortcutList(): Shortcut[] {
  const { shortcuts, pageShortcuts } = useExplorerContext();
  return [...pageShortcuts.current, ...shortcuts.current.values()];
}

/**
 * Listen for the page's shortcuts. `bindings` are the page's own; other
 * features add theirs with `useRegisterShortcut`.
 */
export function usePageShortcuts(bindings: readonly Shortcut[]): void {
  const { shortcuts, pageShortcuts } = useExplorerContext();
  const latest = useRef(bindings);
  latest.current = bindings;
  pageShortcuts.current = bindings;

  // A keydown on the window is a subscription to something outside React:
  // there is no event prop to hang it on, so it needs an effect.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || isFunctionsPanelKey(e)) return;
      // A modal closes itself on Esc; the page's layers wait until it has.
      if (e.key === 'Escape' && escLayers.length > 0 && !isModalOpen()) {
        e.preventDefault();
        escLayers[escLayers.length - 1]();
        return;
      }
      const typing = isTextEntry(e.target);
      const modal = isModalOpen();
      for (const s of [...latest.current, ...shortcuts.current.values()]) {
        if (typing && !s.inText) continue;
        if (modal && !s.inModal) {
          // The browser's own action for a ⌘ combo the page uses (⌘S: save the web page) must not run in its place.
          if (isMod(e) && s.matches(e)) e.preventDefault();
          continue;
        }
        if (!s.matches(e)) continue;
        e.preventDefault();
        s.run(e);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
