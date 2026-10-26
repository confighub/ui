// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The keys of the row panel. They act only while focus is in the panel, so
 * they never take a page key (`n` is "New temporary view", so the next
 * problem is ⇧J). Esc stays with the panel's own handler.
 */

export type PanelKeyAction =
  | 'next'
  | 'previous'
  | 'next-problem'
  | 'previous-problem'
  | 'primary'
  | 'upgrade'
  | 'edit-config'
  | 'restore'
  | 'run-function';

export interface PanelKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** The event's target is in the panel's own DOM, not in a dialog portalled out of it. */
  fromPanel: boolean;
  /** The target is the panel itself, not a control inside it. */
  onContainer: boolean;
  /** The target takes typed text (a field, an editor). */
  textEntry: boolean;
  /** A dialog or menu is open. */
  modalOpen: boolean;
}

/** By lower-case letter; Shift is read from the event, so Caps Lock does not turn j into ⇧J. */
const LETTERS: Readonly<Record<string, PanelKeyAction>> = {
  j: 'next',
  k: 'previous',
  u: 'upgrade',
  e: 'edit-config',
  r: 'restore',
  f: 'run-function',
};

const SHIFTED: Readonly<Record<string, PanelKeyAction>> = {
  j: 'next-problem',
  k: 'previous-problem',
};

export function panelKeyAction(e: PanelKeyEvent): PanelKeyAction | null {
  if (!e.fromPanel || e.textEntry || e.modalOpen || e.metaKey || e.ctrlKey || e.altKey) return null;
  // ⇧ with an arrow or Enter is left to the browser (it extends a text selection); only ⇧J and ⇧K are the panel's.
  if (e.shiftKey) return e.key.length === 1 ? (SHIFTED[e.key.toLowerCase()] ?? null) : null;
  if (e.key === 'ArrowDown') return 'next';
  if (e.key === 'ArrowUp') return 'previous';
  // Enter on a button or a link in the panel is that control's.
  if (e.key === 'Enter') return e.onContainer ? 'primary' : null;
  // f is the page's own Functions toggle, which takes a lower-case f only; the panel takes the same key, so the two agree.
  if (e.key === 'F') return null;
  return e.key.length === 1 ? (LETTERS[e.key.toLowerCase()] ?? null) : null;
}
