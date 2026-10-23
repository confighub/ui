// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';

import type { DerivedRows } from '../queries/useDerivedRows';
import type { UniverseResult } from '../queries/useUniverseRows';
import type { SavedView } from '../queries/useViews';
import type { Lens, ViewDef } from '../model/types';

export interface ResultsValue {
  /** The active view as shown: its work with the preview lenses added. */
  def: ViewDef;
  saved: SavedView | undefined;
  universe: UniverseResult;
  derived: DerivedRows;
  /** Lenses shown as if added (a suggestion under the pointer); never part of the tab, never a draft. */
  preview: readonly Lens[];
  setPreview: (lenses: readonly Lens[]) => void;
}

export const ResultsContext = createContext<ResultsValue | null>(null);

/** The active view's shown rows (sorted), counts and match sets, preview lenses included. */
export function useDerived(): DerivedRows {
  return useResults().derived;
}

export function useResults(): ResultsValue {
  const ctx = useContext(ResultsContext);
  if (!ctx) throw new Error('useResults must be used inside ResultsProvider');
  return ctx;
}
