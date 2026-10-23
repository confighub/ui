// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type ReactNode, useMemo, useState } from 'react';

import { useDerivedRows } from '../queries/useDerivedRows';
import { useServerMatchSets } from '../queries/useServerMatchSets';
import { useUniverseRows } from '../queries/useUniverseRows';
import type { Lens, ViewDef } from '../model/types';
import { useExplorerContext } from './context';
import { ResultsContext, type ResultsValue } from './results-context';
import { useActiveTab } from './useExplorer';

/**
 * The active tab's rows and counts, computed once for the whole page: the
 * lens column, the results and the toolbar all read the same numbers.
 *
 * Preview lenses (a suggestion under the pointer or the arrow keys) are shown
 * as if added, but they live here, not in the tab: previewing never makes a
 * draft.
 */

export function ResultsProvider({ children }: { children: ReactNode }) {
  const tab = useActiveTab();
  const { viewsById } = useExplorerContext();
  const [preview, setPreview] = useState<readonly Lens[]>([]);
  const saved = tab.viewId ? viewsById.get(tab.viewId) : undefined;

  const shown = useMemo<ViewDef>(
    () => (preview.length ? { ...tab.work, lenses: [...tab.work.lenses, ...preview] } : tab.work),
    [tab.work, preview],
  );
  const universe = useUniverseRows(shown, saved);
  const serverMatches = useServerMatchSets(shown);
  // Clearing the preview whenever the tab changes keeps a suggestion from one view off another.
  const [previewTab, setPreviewTab] = useState(tab.id);
  if (previewTab !== tab.id) {
    setPreviewTab(tab.id);
    if (preview.length) setPreview([]);
  }
  const derived = useDerivedRows(universe, shown, serverMatches);

  const value = useMemo<ResultsValue>(
    () => ({ def: shown, saved, universe, derived, preview, setPreview }),
    [shown, saved, universe, derived, preview],
  );
  return <ResultsContext.Provider value={value}>{children}</ResultsContext.Provider>;
}
