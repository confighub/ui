// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How many resources each of a set of Spaces holds, for the variant summary
 * beside its unit count.
 *
 * The server keeps the Resource entity in step with each Unit's configuration,
 * so one read of the Resources in these Spaces, narrowed to their SpaceID,
 * answers it for every variant at once without parsing any configuration.
 */

import { useMemo } from 'react';

import { useListAllResourcesQuery } from '@confighub/rtk-query';

/**
 * Resource counts keyed by SpaceID, or undefined until they have loaded. A
 * Space with no resources is absent, and counts as zero.
 */
export function useResourceCounts(
  spaceIds: readonly string[],
  { skip = false }: { skip?: boolean } = {},
): ReadonlyMap<string, number> | undefined {
  // Sorted, so the same Spaces in another order reuse the cached query.
  const where = useMemo(
    () => (spaceIds.length === 0 ? '' : `SpaceID IN (${[...spaceIds].sort().map((id) => `'${id}'`).join(', ')})`),
    [spaceIds],
  );
  const { currentData: data } = useListAllResourcesQuery({ where, select: 'SpaceID' }, { skip: skip || where === '' });

  return useMemo(() => {
    if (!data) return undefined;
    const counts = new Map<string, number>();
    for (const entry of data) {
      const spaceId = entry.Resource?.SpaceID;
      if (spaceId) counts.set(spaceId, (counts.get(spaceId) ?? 0) + 1);
    }
    return counts;
  }, [data]);
}
