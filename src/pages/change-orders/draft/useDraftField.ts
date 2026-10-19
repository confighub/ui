// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** How long typing pauses before the URL takes the field's text. */
export const DRAFT_FIELD_SETTLE_MS = 400;

/** The draft's free-text fields, by their URL keys. */
export type DraftTextField = 'name' | 'desc';

/**
 * What a field tells the page about the text it holds, so Create never sends what the URL has
 * not caught up with. Each is called from the handler that changes it.
 */
export interface DraftFieldSignals {
  /** The reader is typing: the field holds text the URL does not have yet. */
  typing: () => void;
  /** The field handed its text to the URL: it is the URL's once the router draws it. */
  sent: () => void;
  /** The field holds nothing the URL lacks. */
  idle: () => void;
}

export interface DraftField {
  text: string;
  onChange: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  /** The field holds text the URL does not have yet. */
  pending: boolean;
}

/** What the address bar holds for a field now: it takes every write at once, before the router draws it. */
function textInAddressBar(field: DraftTextField): string | null {
  return new URLSearchParams(window.location.search).get(field);
}

/**
 * A text field over a value the URL holds. The field keeps its own text while it is edited, so no
 * keystroke waits on a navigation and the caret never jumps; the URL takes the text once typing
 * pauses, at once on blur, and when the page is left. A change to the URL from elsewhere reaches
 * the field only while it is not being edited.
 *
 * Whether there is anything to hand over is judged against the address bar, which every write
 * reaches at once, not against the last render, which may not have drawn the last write yet.
 */
export function useDraftField(
  field: DraftTextField,
  value: string,
  commit: (text: string) => void,
  signals: DraftFieldSignals,
): DraftField {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  // The text being edited, kept by the handlers (focus, typing) for the timer and the page leaving.
  const editing = useRef(value);

  // The URL moved: take its value, unless the field is being edited (then the field's text wins).
  if (value !== seen) {
    setSeen(value);
    if (!focused) setText(value);
  }

  /** Hand `sending` to the URL now, or say there is nothing to hand over. */
  const flush = useCallback(
    (sending: string) => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      // An absent parameter is the default the draft shows: the value as drawn.
      if (sending === (textInAddressBar(field) ?? value)) {
        signals.idle();
        return;
      }
      commit(sending);
      signals.sent();
    },
    [field, value, commit, signals],
  );

  // The settle timer belongs to this field: it never fires after the field has gone. Leaving
  // the page (closing the tab) hands the text over first, so it is in the URL that comes back.
  useEffect(() => {
    const onPageHide = () => {
      if (timer.current !== undefined) flush(editing.current);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [flush]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onChange = useCallback(
    (next: string) => {
      setText(next);
      editing.current = next;
      signals.typing();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(next), DRAFT_FIELD_SETTLE_MS);
    },
    [flush, signals],
  );
  const onFocus = useCallback(() => {
    editing.current = text;
    setFocused(true);
  }, [text]);
  const onBlur = useCallback(() => {
    setFocused(false);
    flush(editing.current);
  }, [flush]);

  return { text, onChange, onFocus, onBlur, pending: text !== value };
}

/**
 * Whether any draft field holds text the URL has not drawn yet, and the signals the fields
 * report it through: a field still typing waits for its settle, and any write waits until the
 * router has drawn what the address bar already holds.
 */
export function useDraftFieldWaits(search: string): {
  pending: boolean;
  signals: Readonly<Record<DraftTextField, DraftFieldSignals>>;
} {
  const [typing, setTyping] = useState<ReadonlySet<DraftTextField>>(new Set());

  const signals = useMemo(() => {
    const set = (field: DraftTextField, on: boolean) =>
      setTyping((current) => {
        if (current.has(field) === on) return current;
        const next = new Set(current);
        if (on) next.add(field);
        else next.delete(field);
        return next;
      });
    const of = (field: DraftTextField): DraftFieldSignals => ({
      typing: () => set(field, true),
      sent: () => set(field, false),
      idle: () => set(field, false),
    });
    return { name: of('name'), desc: of('desc') };
  }, []);

  // Every write reaches the address bar before the router draws it: until the two agree, what
  // Create would send is behind what the reader sees.
  const behind = window.location.search !== search;
  return { pending: typing.size > 0 || behind, signals };
}
