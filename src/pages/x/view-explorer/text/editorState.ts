// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import type { TextForm } from './analyze';
import {
  type CompletionContext,
  type CompletionEnv,
  type CompletionResult,
  completionContext,
  suggest,
} from './completion';

/**
 * The text box's caret, focus and suggestion state, kept by text mode so it
 * can tell (without asking the box) whether the suggestion list is open.
 */

export interface EditorUi {
  caret: number;
  focused: boolean;
  /** Esc, or a pick, closed the list until the next edit or click. */
  dismissed: boolean;
  /** The highlighted suggestion. */
  active: number;
}

export const INITIAL_EDITOR_UI: EditorUi = { caret: 0, focused: false, dismissed: false, active: 0 };

export interface EditorSuggestions {
  ctx: CompletionContext;
  result: CompletionResult;
  open: boolean;
  /** The highlighted item, kept within the list. */
  index: number;
}

/** What autocomplete offers for the text and caret now, and whether its list is open. */
export function useEditorSuggestions(
  value: string,
  form: TextForm,
  env: CompletionEnv,
  ui: EditorUi,
): EditorSuggestions {
  const ctx: CompletionContext = useMemo(
    () => (form === 'where' ? completionContext(value, ui.caret) : { kind: 'none' }),
    [form, value, ui.caret],
  );
  const result = useMemo(() => suggest(ctx, env), [ctx, env]);
  const open =
    ui.focused && !ui.dismissed && ctx.kind !== 'none' && (result.items.length > 0 || !!result.error);
  const index = Math.min(ui.active, Math.max(0, result.items.length - 1));
  return { ctx, result, open, index };
}

