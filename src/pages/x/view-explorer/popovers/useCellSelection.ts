// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EntityKind, Layout } from '../model/types';
import type { CellPopoverRequest } from '../state/slots';

/**
 * The cells picked for the cell popover: one value, or several from one
 * column with ⇧-click ("Exclude these 3"). A ⇧-click on a picked value drops
 * it again; a plain click, or a ⇧-click in another column, starts over.
 *
 * The picked cells are marked with `data-vx-selected`, which the popover's
 * global style draws. The cells belong to the table, so marking them here
 * keeps the table free of popover state.
 */

export const SELECTED_ATTR = 'data-vx-selected';

export interface CellSelection {
  tabId: string;
  /** The layout it was made in; another layout draws other cells. */
  layout: Layout;
  /** Opened from the keyboard (Enter or Space on a value), so focus goes into the popover. */
  keyboard: boolean;
  /** The virtual-list index of the first cell's row, to give focus back near it. */
  rowIndex: number | null;
  entity: EntityKind;
  field: string;
  values: Array<string | null>;
  /** Every clicked cell, with its value, for marking. */
  cells: Array<{ value: string | null; el: HTMLElement }>;
  /** Where the popover opens: the first cell clicked. */
  anchor: HTMLElement;
  /** The anchor's last position, for when it scrolls out of the virtual list. */
  anchorRect: DOMRect;
}

function rowIndexOf(el: HTMLElement): number | null {
  const holder = el.closest<HTMLElement>('[data-index]');
  const n = holder ? Number(holder.dataset.index) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function useCellSelection(activeTabId: string, layout: Layout) {
  const [selection, setSelection] = useState<CellSelection | null>(null);
  // How the person last acted: a popover opened by a key gets the focus.
  const lastInput = useRef<'key' | 'pointer'>('pointer');

  // Read in capture, before the cell's own handlers, which stop the events.
  useEffect(() => {
    const onKey = () => {
      lastInput.current = 'key';
    };
    const onPointer = () => {
      lastInput.current = 'pointer';
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);

  const open = useCallback(
    (req: CellPopoverRequest) => {
      const rect = req.anchorEl.getBoundingClientRect();
      setSelection((prev) => {
        const sameColumn =
          prev &&
          prev.tabId === activeTabId &&
          prev.entity === req.entity &&
          prev.field === req.field;
        if (!req.additive || !sameColumn || !prev) {
          return {
            tabId: activeTabId,
            layout,
            keyboard: lastInput.current === 'key',
            rowIndex: rowIndexOf(req.anchorEl),
            entity: req.entity,
            field: req.field,
            values: [req.value],
            cells: [{ value: req.value, el: req.anchorEl }],
            anchor: req.anchorEl,
            anchorRect: rect,
          };
        }
        if (prev.values.includes(req.value)) {
          const values = prev.values.filter((v) => v !== req.value);
          if (values.length === 0) return null;
          return { ...prev, values, cells: prev.cells.filter((c) => c.value !== req.value) };
        }
        return {
          ...prev,
          values: [...prev.values, req.value],
          cells: [...prev.cells, { value: req.value, el: req.anchorEl }],
        };
      });
    },
    [activeTabId, layout],
  );

  const close = useCallback(() => setSelection(null), []);

  // A ⇧-click would also select the text between two cells. The cells belong
  // to the table, so the default is stopped here, on the document.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.shiftKey && e.target instanceof Element && e.target.closest('[data-vx-value]'))
        e.preventDefault();
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, []);

  // Another tab or another layout draws other cells: the selection is dropped,
  // not hidden, so it cannot come back later at a stale anchor. Setting state
  // during render is React's way to adjust state to a changed input.
  const stale =
    selection !== null && (selection.tabId !== activeTabId || selection.layout !== layout);
  if (stale) setSelection(null);
  const shown = stale ? null : selection;

  // The marks are attributes on DOM nodes the table owns, so they are set
  // after commit and removed when the selection changes or closes.
  useEffect(() => {
    if (!shown) return;
    const els = shown.cells.map((c) => c.el);
    for (const el of els) el.setAttribute(SELECTED_ATTR, 'true');
    return () => {
      for (const el of els) el.removeAttribute(SELECTED_ATTR);
    };
  }, [shown]);

  return { selection: shown, open, close } as const;
}
