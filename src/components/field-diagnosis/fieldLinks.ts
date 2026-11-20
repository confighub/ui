// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// How the field details turn a reference into a link, and what their buttons do. The views know
// neither the route nor the store: the host (the Component side pane, later the Blame tab) gives a
// link resolver through context and the actions as a prop (ARCHITECTURE.md §4: no pages/* import
// in this folder).
import { type MouseEvent, createContext } from 'react';

import type { FieldGuard, FieldHistoryEntry, FieldNeed, FieldRef } from './fieldDiagnosis.types';

/** Where a reference goes. Without an href the reference is plain text. */
export interface ResolvedRef {
  href?: string;
  /** In-place navigation for a plain left click; other clicks are the browser's (new tab). */
  jump?: () => void;
  /** Open the href in a new tab, as a link that leaves the page does while edits are staged. */
  newTab?: boolean;
  /** Why the link does what it does, shown in its peek ("Opens in a new tab: 2 staged changes"). */
  note?: string;
}

export type FieldLinkResolver = (ref: FieldRef) => ResolvedRef;

/** The fallback: every reference is plain text. */
export const plainTextResolver: FieldLinkResolver = () => ({});

export const FieldLinkResolverContext = createContext<FieldLinkResolver>(plainTextResolver);

/** The open field: a Unit's peek shows the same field's value there. */
export interface FieldPathValue {
  /** The server path. */
  path?: string;
  /** The field's resource name, which names the document in a Unit of several. */
  resourceName?: string;
}

export const FieldPathContext = createContext<FieldPathValue>({});

/**
 * What a button does: a handler, a link (a real <a href>), or both: a link whose plain click runs
 * the handler in place (a jump), while a modified click is the browser's (a new tab).
 */
export interface ActionTarget {
  onClick?: () => void;
  href?: string;
  newTab?: boolean;
  /** Shown but not available here; the text says why, in its tooltip. */
  disabled?: string;
}

const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** The props of a MUI Button for an action target. */
export function actionButtonProps(target: ActionTarget) {
  const { onClick, href, newTab } = target;
  if (!href) return { onClick };
  return {
    href,
    ...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
    onClick: onClick
      ? (e: MouseEvent) => {
          if (!isPlainClick(e)) return;
          e.preventDefault();
          onClick();
        }
      : undefined,
  };
}

/** What the details' buttons do. An action the host does not give is not shown. */
export interface FieldActions {
  /** Open the row's inline editor (a staged edit). */
  edit?: () => void;
  /** Drop the pane's unsaved edit of this field. */
  discard?: () => void;
  /** The action of a need line (Apply, Upgrade, Open gate), or undefined when it has none. */
  needAction?: (need: FieldNeed) => ActionTarget | undefined;
  /** The text action after it (Dismiss), or undefined when it has none. */
  needSecondary?: (need: FieldNeed) => ActionTarget | undefined;
  /** Remove a guard from the field, or undefined when this guard cannot be removed here. */
  removeGuard?: (guard: FieldGuard) => ActionTarget | undefined;
  /** Stage an older value as an edit. */
  restore?: (entry: FieldHistoryEntry) => void;
}
