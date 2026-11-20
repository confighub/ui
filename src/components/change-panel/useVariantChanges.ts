// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The changes that hold Units of the page's Space (D35), other than the active one: read by the
 * Units' ChangeSetID, then each ChangeSet by ID across Spaces (a ChangeSet lives in one Space and
 * holds Units in others), with its owner and how many of this Space's Units it holds.
 */
import { useMemo } from 'react';
import { useGetSpaceQuery, useListAllChangeSetsQuery, useListAllUnitsQuery, useListUsersQuery } from '@confighub/rtk-query';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { usePageSpace } from './usePageSpace';

export interface VariantChange {
  id: string;
  slug: string;
  space: string;
  /** Units of the page's Space it holds. */
  units: number;
  owner: string;
  yours: boolean;
  /** Finished (Closed), yet still holding Units here (D37). */
  closed: boolean;
  /** It holds the page's own Unit (a Unit page). */
  hasPageUnit: boolean;
}

export function useVariantChanges(activeChangeSetId: string | undefined): { changes: VariantChange[]; isVariant: boolean } {
  const { spaceId, unitId } = usePageSpace();
  const space = useGetSpaceQuery({ spaceId: spaceId ?? '' }, { skip: !spaceId });
  const held = useListAllUnitsQuery({ where: `SpaceID = '${spaceId ?? ''}' AND ChangeSetID IS NOT NULL`, select: 'UnitID,ChangeSetID' }, { skip: !spaceId });
  const countOf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of held.data ?? []) {
      const id = e.Unit?.ChangeSetID;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [held.data]);
  const ids = [...countOf.keys()].sort();
  const pageUnitChange = unitId ? (held.data ?? []).find((e) => e.Unit?.UnitID === unitId)?.Unit?.ChangeSetID : undefined;
  const changeSets = useListAllChangeSetsQuery({ where: `ChangeSetID IN (${ids.map((id) => `'${id}'`).join(', ')})` }, { skip: ids.length === 0 });
  const users = useListUsersQuery({}, { skip: ids.length === 0 });
  const { userInfo } = useUserInfo();
  const me = userInfo?.UserID;
  const changes = useMemo(
    () =>
      (changeSets.data ?? []).flatMap((e): VariantChange[] => {
        const cs = e.ChangeSet;
        // A finished change is kept while it still holds Units here: they refuse writes (D37).
        if (!cs?.ChangeSetID || cs.ChangeSetID === activeChangeSetId) return [];
        const user = (users.data ?? []).find((u) => u.User?.UserID === cs.UserID)?.User;
        return [
          {
            id: cs.ChangeSetID,
            slug: cs.Slug,
            space: cs.SpaceSlug ?? e.Space?.Slug ?? '',
            units: countOf.get(cs.ChangeSetID) ?? 0,
            owner: user?.DisplayName || user?.Username || 'another person',
            yours: me !== undefined && cs.UserID === me,
            hasPageUnit: cs.ChangeSetID === pageUnitChange,
            closed: cs.State === 'Closed',
          },
        ];
      }),
    [changeSets.data, users.data, countOf, activeChangeSetId, me, pageUnitChange],
  );
  return { changes, isVariant: Boolean(space.data?.Space?.ComponentID) };
}
