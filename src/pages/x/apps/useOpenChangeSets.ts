// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which ChangeSets are open, and on which Spaces' units, fleet-wide: for the
 * Components Overview dashboard's "Open ChangeSets" tile and column.
 *
 * A ChangeSet is open on a unit while the unit's ChangeSetID is set, so ONE
 * bulk, non-polling read of the units that have one answers it for every
 * component at once, the same shape `useOutstandingChangeOrdersBulk` has. The
 * ChangeSet is expanded on each unit, so its slug comes with it.
 */

import { useMemo } from 'react';

import { useListAllUnitsQuery } from '@confighub/rtk-query';

/** One open ChangeSet: its name, and the Spaces of the units it is open on. */
export interface OpenChangeSet {
  changeSetId: string;
  slug: string;
  spaceSlug?: string;
  spaceIds: ReadonlySet<string>;
}

/** Open ChangeSets keyed by ChangeSetID. */
export function useOpenChangeSets(): ReadonlyMap<string, OpenChangeSet> {
  const { data } = useListAllUnitsQuery({
    where: 'ChangeSetID IS NOT NULL',
    select: 'UnitID,SpaceID,ChangeSetID',
    include: 'ChangeSetID',
  });

  return useMemo(() => {
    const byId = new Map<string, { changeSetId: string; slug: string; spaceSlug?: string; spaceIds: Set<string> }>();
    for (const unit of data ?? []) {
      const changeSetId = unit.Unit?.ChangeSetID;
      const spaceId = unit.Unit?.SpaceID;
      if (!changeSetId || !spaceId) continue;
      let entry = byId.get(changeSetId);
      if (!entry) {
        entry = {
          changeSetId,
          slug: unit.ChangeSet?.Slug ?? changeSetId,
          spaceSlug: unit.ChangeSet?.SpaceSlug,
          spaceIds: new Set(),
        };
        byId.set(changeSetId, entry);
      }
      entry.spaceIds.add(spaceId);
    }
    return byId;
  }, [data]);
}
