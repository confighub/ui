// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { EntityRow } from '../model/fields';
import type { EntityKind, LensSpec } from '../model/types';

/**
 * Calls one part of the page makes into a part that another part provides. Each
 * slot starts as a no-op; the component that provides the feature registers the
 * real function with `useRegisterSlot` while it is mounted. A cell can ask for its popover, or a group
 * count for a peek, before (or without) the popover existing.
 */

/** A click on a value in a cell or a card: the popover with Only this / Exclude / Group by / Sort. */
export interface CellPopoverRequest {
  entity: EntityKind;
  /** The field id of the column the value is in. */
  field: string;
  /** The value as text; null for an empty cell. */
  value: string | null;
  rowId: string;
  anchorEl: HTMLElement;
  /** ⇧-click: add the value to the current selection instead of starting a new one. */
  additive: boolean;
}

/** A click on a count: a peek at the part of the current view it stands for. */
export interface PeekRequest {
  anchorEl: HTMLElement;
  title: string;
  /** The group path as field lenses; a value of '' is the empty group. */
  lenses: LensSpec[];
  /** The group levels below that part, kept when it is pinned as a draft. */
  groupBy: string[];
  /** The ids of exactly the rows the peek is about, as the layout shows them; absent: the peek works them out from `lenses`. */
  rowIds?: readonly string[];
}

/** A chip flying from where a filter was made to the lens row that now holds it. */
export interface FlyInRequest {
  from: DOMRect;
  label: string;
  lensId: string;
}

export interface ExplorerSlots {
  /** Focus the add-lens input now. Returns false when it is not on screen. */
  focusAddLens: () => boolean;
  openCellPopover: (request: CellPopoverRequest) => void;
  openPeek: (request: PeekRequest) => void;
  flyIn: (request: FlyInRequest) => void;
  /** Open the view switcher (⌘P); while none is registered, the "N more" menu stands in. */
  openSwitcher: (anchor?: HTMLElement) => void;
  /** Open a row in the row drawer (from any layout); ⌘/Ctrl-click layouts open its detail page themselves. */
  openRow: (row: EntityRow) => void;
  /** Start a lens on a field with no values yet, its editor open: the header menu's "Filter on <column>…". */
  startLens: (request: { field: string; anchorEl?: HTMLElement }) => void;
  /** Switch the column to text mode, selecting one lens's conjunct when given. */
  openTextMode: (request?: { selectLensId?: string }) => void;
}

export type SlotName = keyof ExplorerSlots;

export const NOOP_SLOTS: ExplorerSlots = {
  focusAddLens: () => false,
  openCellPopover: () => undefined,
  openPeek: () => undefined,
  flyIn: () => undefined,
  openSwitcher: () => undefined,
  openTextMode: () => undefined,
  startLens: () => undefined,
  openRow: () => undefined,
};
