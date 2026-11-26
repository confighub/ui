// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The include_hidden that names every reason, Archived among them. */
export const EVERY_HIDDEN_REASON = '*,Archived';

/**
 * The include_hidden of a bulk delete of the entities selected in a list.
 *
 * A bulk operation reaches an archived entity only when include_hidden names Archived: naming it
 * by ID is not enough, so that a delete of a selection made before an archive does not purge what
 * was archived since. So Archived is named when the list showed a selected entity as archived,
 * and the delete reaches it. Entities hidden for any other reason are reached by their IDs.
 */
export function bulkDeleteIncludeHidden(
  selected: readonly ({ HiddenReason?: string } | undefined)[],
): string | undefined {
  return selected.some((entity) => entity?.HiddenReason === 'Archived')
    ? EVERY_HIDDEN_REASON
    : undefined;
}

/**
 * The include_hidden of a bulk patch of the entities selected in a list. Every reason is named, so
 * that an archived entity in the selection is refused with the server's error, which the list
 * shows, rather than left out without a word.
 */
export const BULK_PATCH_INCLUDE_HIDDEN = EVERY_HIDDEN_REASON;

/** The URL parameter that says a list includes hidden entities. */
export const INCLUDE_HIDDEN_PARAM = 'hidden';

export interface IncludeHidden {
  /** Whether the list includes hidden entities. */
  includeHidden: boolean;
  setIncludeHidden: (include: boolean) => void;
  /**
   * The list request's include_hidden: every reason when on, nothing when off. The server's `*`
   * leaves archived entities out, so Archived is named as well.
   */
  includeHiddenParam: string | undefined;
}

/**
 * Whether a list page includes hidden entities, such as the Units that back ConfigHub entities.
 * It is kept in the URL so that a shared link lists the same entities.
 */
export function useIncludeHidden(): IncludeHidden {
  const [searchParams, setSearchParams] = useSearchParams();
  const includeHidden = searchParams.get(INCLUDE_HIDDEN_PARAM) === '1';
  const setIncludeHidden = useCallback(
    (include: boolean) =>
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          if (include) next.set(INCLUDE_HIDDEN_PARAM, '1');
          else next.delete(INCLUDE_HIDDEN_PARAM);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  return {
    includeHidden,
    setIncludeHidden,
    includeHiddenParam: includeHidden ? EVERY_HIDDEN_REASON : undefined,
  };
}
