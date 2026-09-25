// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** What a click on a deployment node should do. */
export type NodeClickAction =
  /** Add this deployment to, or take it out of, the side pane's comparison. */
  | 'toggle-compare'
  /** Open this deployment's side pane. */
  | 'select'
  /** Close this deployment's side pane, because it is already open. */
  | 'deselect';

/** The modifier keys of a click, as a React or DOM mouse event carries them. */
export interface NodeClickModifiers {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/**
 * Resolve a click on a deployment node.
 *
 * Shift, Cmd/Meta and Ctrl all mean "compare", so the gesture works whichever
 * multi-select habit the user brings from their platform. A modifier click never
 * opens or closes the pane: the pane's own deployment is slot A, and picking a
 * second one to read beside it is a different intent from changing which one is
 * open. Alt is not a compare modifier.
 */
export function resolveNodeClick(
  modifiers: NodeClickModifiers,
  alreadySelected: boolean,
): NodeClickAction {
  if (modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey) return 'toggle-compare';
  return alreadySelected ? 'deselect' : 'select';
}
