// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import { CONFIG_DIFF_HIGHLIGHT_ID } from '@/components/config-diff/ConfigDiffView';
import type { MergedUnit } from '../../x/apps/componentTypes';
import { resolveDiffTarget, type StageDiffModel, type StageDiffTarget } from './stageDiffSections';
import type { DiffAnchor } from './stageTypes';

/** Opening the boxes from elsewhere scrolls only when the first box would start this close to the fold. */
const REVEAL_MARGIN_PX = 48;

/** A jump's landing place and the tint it wears: amber, or red where the stage failed. */
export interface StageDiffHighlight {
  target: StageDiffTarget;
  tone: 'warning' | 'error';
  /** The field's row could not be found, so the Unit's header is tinted instead. */
  unitFallback?: boolean;
}

/** What a link names when it asks for a place in the diff. */
export type StageDiffAnchor = Pick<DiffAnchor, 'groupKind' | 'path'> & { unitId?: string };

export interface UseStageDiffResult {
  open: boolean;
  highlight: StageDiffHighlight | null;
  /** Give to the boxes' container (`StageOutcomeBoxes`' `boxesRef`). */
  cardRef: RefObject<HTMLElement>;
  /** A box's Open / Close: every box opens and closes together. */
  toggle: () => void;
  /** Open without a target, scrolling only when the boxes would start below the fold. */
  reveal: () => void;
  /** "Show in the diff" and field links: open, scroll the target into view if needed, and mark it. */
  openAt: (anchor: StageDiffAnchor, tone?: 'warning' | 'error') => void;
}

/**
 * The outcome boxes' open state and the jumps into them.
 *
 * One switch opens every box, as one does on the rest of the ChangeOrder page:
 * a reader comparing two outcomes wants both open.
 *
 * The scroll happens in the handler, after the card has rendered (`flushSync`),
 * rather than in an effect: a jump is an event, and the same jump twice must
 * scroll twice. `block: 'nearest'` moves the page only as far as the target needs,
 * so the status box the reader clicked from stays where it was when it can.
 * Focus goes to the section heading without scrolling, so a screen reader lands
 * on the group while the eye stays on the row.
 */
export function useStageDiff(model: StageDiffModel<MergedUnit>): UseStageDiffResult {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<StageDiffHighlight | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  const reveal = useCallback(() => {
    flushSync(() => {
      setOpen(true);
      setHighlight(null);
    });
    const first = cardRef.current;
    if (first !== null && first.getBoundingClientRect().top > window.innerHeight - REVEAL_MARGIN_PX) {
      first.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  // Clicked on a box itself, so nothing needs scrolling into view.
  const toggle = useCallback(() => {
    setOpen((was) => !was);
    setHighlight(null);
  }, []);

  const openAt = useCallback(
    (anchor: StageDiffAnchor, tone: 'warning' | 'error' = 'warning') => {
      const target = resolveDiffTarget(model, anchor);
      if (target === null) {
        reveal();
        return;
      }
      flushSync(() => {
        setOpen(true);
        setHighlight({ target, tone });
      });
      const card = cardRef.current;
      if (card === null) return;
      const byId = (id: string | undefined) => (id === undefined ? null : card.querySelector<HTMLElement>(`#${CSS.escape(id)}`));
      const row = target.path === undefined ? null : byId(CONFIG_DIFF_HIGHLIGHT_ID);
      if (target.path !== undefined && row === null && target.blockId !== undefined) {
        setHighlight({ target, tone, unitFallback: true });
      }
      (row ?? byId(target.blockId) ?? byId(target.headingId))?.scrollIntoView({ block: 'nearest' });
      byId(target.headingId)?.focus({ preventScroll: true });
    },
    [model, reveal],
  );

  // One object while nothing changes, so a caller's memo that depends on it holds.
  return useMemo(() => ({ open, highlight, cardRef, toggle, reveal, openAt }), [open, highlight, toggle, reveal, openAt]);
}
