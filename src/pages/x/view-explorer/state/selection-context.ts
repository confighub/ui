// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';

/**
 * The rows picked in the Table of the active tab. Only a Units view drawn as
 * a Table has a selection; elsewhere `enabled` is false and nothing is picked.
 * `RowSelectionProvider` owns it.
 */
export interface RowSelectionValue {
  enabled: boolean;
  /** The picked rows that are shown: a row a filter hides does not count while it is hidden. */
  picked: ReadonlySet<string>;
  count: number;
  /** The slot letter (A–E) of each of the first five picked rows, in table order. */
  letters: ReadonlyMap<string, string>;
  /** The picked rows in table order, folded groups included. */
  orderedPicked: readonly string[];
  toggle: (id: string) => void;
  /** Pick one row; a row already picked stays picked. */
  pick: (id: string) => void;
  /** A ⇧-click on `id`, over the rows on screen in their order. */
  range: (visibleIds: readonly string[], id: string) => void;
  selectShown: () => void;
  unselectShown: () => void;
  clear: () => void;
}

export const RowSelectionContext = createContext<RowSelectionValue | null>(null);

export function useRowSelection(): RowSelectionValue {
  const ctx = useContext(RowSelectionContext);
  if (!ctx) throw new Error('useRowSelection must be used inside RowSelectionProvider');
  return ctx;
}
