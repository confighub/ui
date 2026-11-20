// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useListUnitsByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { uniqueIds } from '@/hooks/inClauseChunks';

export interface UnitNamesById {
  /** Each Unit read, as `space/unit`, by UnitID. A Unit the caller cannot see is absent. */
  names: Map<string, string>;
  isLoading: boolean;
  isError: boolean;
}

/** Names the Units with these IDs `space/unit`, in one read however many there are. */
export const useUnitNamesById = (
  unitIds: readonly (string | undefined)[],
  skip = false,
): UnitNamesById => {
  const ids = useMemo(() => uniqueIds(unitIds).sort(), [unitIds]);
  const { currentData, isFetching, isError } = useListUnitsByIdChunkedQuery(
    { unitIds: ids, select: 'UnitID,Slug,SpaceID', include: 'SpaceID' },
    { skip: skip || ids.length === 0 },
  );
  const names = useMemo(
    () =>
      new Map(
        (currentData ?? []).flatMap((unit) =>
          unit.Unit?.UnitID
            ? [
                [
                  unit.Unit.UnitID,
                  unit.Space?.Slug
                    ? `${unit.Space.Slug}/${unit.Unit.Slug}`
                    : (unit.Unit.Slug ?? ''),
                ],
              ]
            : [],
        ),
      ),
    [currentData],
  );
  const isLoading = ids.length > 0 && !skip && currentData === undefined && isFetching;
  // One object while nothing changes, so a memo depending on it holds.
  return useMemo(() => ({ names, isLoading, isError }), [names, isLoading, isError]);
};
