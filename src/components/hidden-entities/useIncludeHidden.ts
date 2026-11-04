// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The URL parameter that says a list includes hidden entities. */
export const INCLUDE_HIDDEN_PARAM = 'hidden';

export interface IncludeHidden {
  /** Whether the list includes hidden entities. */
  includeHidden: boolean;
  setIncludeHidden: (include: boolean) => void;
  /** The list request's include_hidden: every reason when on, nothing when off. */
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
    includeHiddenParam: includeHidden ? '*' : undefined,
  };
}
