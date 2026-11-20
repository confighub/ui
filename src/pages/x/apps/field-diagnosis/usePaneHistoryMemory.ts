// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Keeps the side pane's open Unit cards and its scroll with each history entry, and restores
// them on Back and Forward (PLAN.md decision 6). A card the person opened is in the entry, so it
// stays open; a card a jump opened is not in the entry before the jump, so Back closes it.
//
// ORDER: the pane calls this AFTER its node-switch reset effect. On Back to another Space the
// reset clears the cards, then this restores them, in the same commit (the later setState wins).
import { type Dispatch, type RefObject, type SetStateAction, useEffect, useRef } from 'react';

import { readPaneEntry, savePaneEntry, sessionStore } from './paneHistoryMemory';

export interface PaneHistoryMemoryArgs {
  locationKey: string;
  /** Changes when the pane switches to another Space (the node-switch reset runs then). */
  selectionKey: string | undefined;
  forced: Set<string>;
  collapsed: Set<string>;
  setForced: Dispatch<SetStateAction<Set<string>>>;
  setCollapsed: Dispatch<SetStateAction<Set<string>>>;
  scrollerRef: RefObject<HTMLElement | null>;
  /** A field is open: its reveal decides the scroll, not the saved one. */
  fieldOpen: boolean;
  /** Off where the pane has no URL focus (outside the Components view). */
  enabled: boolean;
}

/**
 * Retry while the tree draws: after Back to a page load the Units are still being read, so the
 * list cannot scroll that far yet. Given up after this long, so a list that never grows that tall
 * stops trying.
 */
const RESTORE_WINDOW_MS = 5_000;

/*
 * The rule does not depend on the navigation type. An entry with saved state is restored the
 * first time the pane shows it, for its Space: on Back and Forward, and on a page load that
 * comes back to it, which the view may follow with a replace of its own. A new entry (a jump, a
 * field opened in place) has nothing saved: it starts from what the pane shows.
 */
export function usePaneHistoryMemory({
  locationKey,
  selectionKey,
  forced,
  collapsed,
  setForced,
  setCollapsed,
  scrollerRef,
  fieldOpen,
  enabled,
}: PaneHistoryMemoryArgs): void {
  const selectionRef = useRef(selectionKey);
  const restoredMark = useRef<string | null>(null);
  // Read when the entry is restored, not a reason to restore it again.
  const fieldOpenRef = useRef(fieldOpen);
  fieldOpenRef.current = fieldOpen;
  const mark = `${locationKey}\u0000${selectionKey ?? ''}`;

  // Save the cards on every change; not in the commit of a node switch (the state is the old
  // Space's), and not before the entry is restored for this Space.
  useEffect(() => {
    if (!enabled || selectionKey === undefined) return;
    if (selectionRef.current !== selectionKey) {
      selectionRef.current = selectionKey;
      return;
    }
    if (restoredMark.current !== mark) return;
    savePaneEntry(sessionStore(), locationKey, { forced: [...forced], collapsed: [...collapsed] });
  }, [enabled, forced, collapsed, locationKey, selectionKey, mark]);

  // Restore the cards, once per entry and Space. Declared after the save, so the save of this
  // commit still sees the entry as not restored. An entry with no cards saved (a new one, or a
  // field opened in place, which saves only its scroll) keeps the cards on screen, and saves them.
  const cardsRef = useRef({ forced, collapsed });
  cardsRef.current = { forced, collapsed };
  useEffect(() => {
    if (!enabled || selectionKey === undefined || restoredMark.current === mark) return;
    restoredMark.current = mark;
    const saved = readPaneEntry(sessionStore(), locationKey);
    if (saved?.forced && saved.collapsed) {
      setForced(new Set(saved.forced));
      setCollapsed(new Set(saved.collapsed));
      return;
    }
    const now = cardsRef.current;
    savePaneEntry(sessionStore(), locationKey, { forced: [...now.forced], collapsed: [...now.collapsed] });
  }, [enabled, locationKey, selectionKey, mark, setForced, setCollapsed]);

  // The scroll: recorded on every scroll of the pane for the entry on screen.
  useEffect(() => {
    const box = scrollerRef.current;
    if (!enabled || !box) return undefined;
    const onScroll = () => savePaneEntry(sessionStore(), locationKey, { scrollTop: box.scrollTop });
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => box.removeEventListener('scroll', onScroll);
  }, [enabled, locationKey, scrollerRef]);

  // An entry with a saved scroll goes back to it; a new entry starts where the pane is.
  useEffect(() => {
    if (!enabled) return undefined;
    const top = readPaneEntry(sessionStore(), locationKey)?.scrollTop;
    if (top === undefined) {
      const box = scrollerRef.current;
      if (box) savePaneEntry(sessionStore(), locationKey, { scrollTop: box.scrollTop });
      return undefined;
    }
    if (fieldOpenRef.current) return undefined;
    const deadline = performance.now() + RESTORE_WINDOW_MS;
    let handle = 0;
    const restore = () => {
      const b = scrollerRef.current;
      if (b) b.scrollTop = top;
      if ((!b || Math.abs(b.scrollTop - top) > 2) && performance.now() < deadline) handle = requestAnimationFrame(restore);
    };
    handle = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(handle);
  }, [enabled, locationKey, scrollerRef]);
}
