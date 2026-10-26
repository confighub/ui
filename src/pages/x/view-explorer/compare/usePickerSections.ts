// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useDeferredValue, useMemo } from 'react';

import type { ExtendedUnitRead } from '@confighub/rtk-query';

import { buildGroupTree } from '../model/grouping';
import { groupLevelsFor } from '../model/sort';
import { useResults } from '../state/results-context';
import {
  type PickerSection,
  buildPickerSections,
  innermostGroup,
  searchUnits,
} from './suggest';
import { idOf } from './unit-row';

/**
 * What the Unit picker lists, from the Units the page has already loaded (no
 * request of its own): with no query, the suggestions for the base Unit; with
 * one, the Units that match it across every Space, the first `SEARCH_LIMIT`.
 *
 * The query is deferred, so typing stays at the speed of the input and the
 * list follows when React has time; `stale` is true while it has not.
 */

export const SEARCH_LIMIT = 100;

export type PickerStatus = 'loading' | 'error' | 'ready';

export interface PickerData {
  status: PickerStatus;
  /** The suggestions, or one section of matches while there is a query. */
  sections: readonly PickerSection[];
  /** There is a query: `sections` holds the matches. */
  searching: boolean;
  /** Every match of the query, of which the first `SEARCH_LIMIT` are listed. */
  total: number;
  /** The Units there are to search. */
  universeCount: number;
  /** The query the list was made for has not caught up with the input yet. */
  stale: boolean;
  /** The query the list was made for, trimmed. */
  query: string;
  /** What the list holds for this text, worked out now: ↵ takes from it while `stale`. */
  sectionsFor: (text: string) => readonly PickerSection[];
  retry: () => void;
}


/** The one section of a search: the first `SEARCH_LIMIT` matches, and how many there are. */
function searchSections(
  universe: readonly ExtendedUnitRead[],
  query: string,
  base: ExtendedUnitRead | undefined,
  taken: readonly string[],
): { sections: PickerSection[]; total: number } {
  const { options, total } = searchUnits(universe, query, { base, taken, limit: SEARCH_LIMIT });
  const section: PickerSection = {
    id: 'search',
    title: 'Units that match',
    hint: total === 1 ? '1 match' : `${total} matches`,
    options,
  };
  return { sections: options.length ? [section] : [], total };
}

/**
 * The suggestions for a base Unit: the same slug in other Spaces, its
 * upstream, then its group in the table. The empty slot and the one-Unit
 * state suggest the first free one of these, so they and the picker agree.
 */
export function usePickerSuggestions(
  base: ExtendedUnitRead | undefined,
  taken: readonly string[],
): readonly PickerSection[] {
  const { def, universe, derived } = useResults();
  const isUnits = universe.entity === 'Unit';
  const universeRows = universe.rows as ExtendedUnitRead[];
  const groupKey = def.groupBy.join('|');
  const baseId = base ? idOf(base) : '';

  // The group the base is drawn under in the table, by its id: the table's row may be a copy with server columns joined on.
  const group = useMemo(() => {
    if (!baseId || !isUnits) return undefined;
    const levels = groupLevelsFor('Unit', def.groupBy);
    if (!levels.length) return undefined;
    const shown = derived.rows.find((r) => derived.rowId(r) === baseId);
    const node = shown
      ? innermostGroup(buildGroupTree(derived.rows, levels), shown)
      : undefined;
    return node ? { value: node.value, rows: node.rows as ExtendedUnitRead[] } : undefined;
    // groupKey stands for def.groupBy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId, isUnits, derived, groupKey]);

  return useMemo(
    () =>
      base && isUnits
        ? buildPickerSections({ base, universe: universeRows, group, taken })
        : [],
    [base, isUnits, universeRows, group, taken],
  );
}

export function usePickerSections(
  base: ExtendedUnitRead | undefined,
  taken: readonly string[],
  input: string,
): PickerData {
  const { universe } = useResults();
  const isUnits = universe.entity === 'Unit';
  const universeRows = universe.rows as ExtendedUnitRead[];
  const suggestions = usePickerSuggestions(base, taken);
  const deferred = useDeferredValue(input);
  const query = deferred.trim();

  const search = useMemo(
    () => (query && isUnits ? searchSections(universeRows, query, base, taken) : null),
    [query, isUnits, universeRows, base, taken],
  );
  const sectionsFor = useCallback(
    (text: string) => {
      const q = text.trim();
      return q && isUnits ? searchSections(universeRows, q, base, taken).sections : suggestions;
    },
    [isUnits, universeRows, base, taken, suggestions],
  );

  // A Retry after a failed load reads again with nothing to show yet: that is loading too, not an empty page.
  const empty = universeRows.length === 0;
  const status: PickerStatus =
    !isUnits || universe.isLoading || (empty && universe.isFetching)
      ? 'loading'
      : universe.isError && empty
        ? 'error'
        : 'ready';
  return {
    status,
    sections: search ? search.sections : suggestions,
    searching: !!search,
    total: search?.total ?? 0,
    universeCount: isUnits ? universeRows.length : 0,
    stale: deferred !== input,
    query,
    sectionsFor,
    retry: universe.refetch,
  };
}
