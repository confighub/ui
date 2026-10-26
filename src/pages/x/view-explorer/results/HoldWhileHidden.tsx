// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type ReactNode, useMemo, useRef } from 'react';

import { ExplorerContext, type ExplorerContextValue, useExplorerContext } from '../state/context';
import { ResultsContext, useResults } from '../state/results-context';

/**
 * Children held as they were drawn while `hold` is true.
 *
 * WHY: the toolbar, the table and the drawer stay mounted behind compare mode
 * so Back finds them as they were, but they are hidden. Every change to the
 * comparison is a reducer step, and without the hold each one (a click in the
 * rail) would draw the whole table again for nobody to see. While held, the
 * children are the same element and read the explorer and results values of
 * the moment the hold began, so React skips them; when the hold ends they get
 * the values of now and catch up in one render.
 *
 * THE RULES for what goes inside:
 * - Only the explorer and results values are held. A child that also reads
 *   another context (the row selection, compare mode, the Redux store) still
 *   re-renders when that one changes, and sees the held explorer and results
 *   values beside it. Such a child may show what it reads; it must not act on
 *   the mix.
 * - Nothing held may change the view: it is hidden, so the change would be
 *   unseen and would make a draft. In development a dispatch from inside while
 *   held is reported as an error (the guard costs one extra draw as the hold
 *   begins, in development only).
 * - Nothing held may own a shortcut, a slot or an Esc layer: a held one would
 *   keep stale values. Those live in the providers above.
 */

const reportHeldDispatch = (dispatch: ExplorerContextValue['dispatch']): ExplorerContextValue['dispatch'] => (action) => {
  console.error(`HoldWhileHidden: "${action.type}" was dispatched from the hidden layout while compare mode held it.`);
  dispatch(action);
};

export function HoldWhileHidden({ hold, children }: { hold: boolean; children: ReactNode }) {
  const explorer = useExplorerContext();
  const results = useResults();
  const kept = useRef({ explorer, results, children });
  // A render thrown away would only leave values that were current when it ran.
  if (!hold) kept.current = { explorer, results, children };
  const shown = kept.current;
  const heldExplorer = useMemo(
    () => (hold && import.meta.env.DEV ? { ...shown.explorer, dispatch: reportHeldDispatch(shown.explorer.dispatch) } : shown.explorer),
    [hold, shown.explorer],
  );
  return (
    <ExplorerContext.Provider value={heldExplorer}>
      <ResultsContext.Provider value={shown.results}>{shown.children}</ResultsContext.Provider>
    </ExplorerContext.Provider>
  );
}
