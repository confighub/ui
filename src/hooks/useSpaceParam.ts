// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The URL parameter a list page keeps its Space filter in, as the Space's slug */
export const SPACE_PARAM = 'space';

/** The path of a list page filtered to one Space */
export const spaceFilteredPath = (path: string, spaceSlug: string) =>
  `${path}?${new URLSearchParams({ [SPACE_PARAM]: spaceSlug }).toString()}`;

/**
 * A list page's Space filter, held in the URL so that a link can open the page filtered to a
 * Space. `null` is no filter.
 */
export function useSpaceParam(): [string | null, (spaceSlug: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const spaceSlug = searchParams.get(SPACE_PARAM) || null;
  const setSpaceSlug = useCallback(
    (next: string | null) =>
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next) params.set(SPACE_PARAM, next);
          else params.delete(SPACE_PARAM);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  return [spaceSlug, setSpaceSlug];
}

/**
 * `useSpaceParam` for a console list's Space select, whose "no filter" option has the value
 * `all`.
 */
export function useConsoleSpaceFilter(): [string, (value: string) => void] {
  const [spaceSlug, setSpaceSlug] = useSpaceParam();
  const setValue = useCallback((value: string) => setSpaceSlug(value === 'all' ? null : value), [setSpaceSlug]);
  return [spaceSlug ?? 'all', setValue];
}
