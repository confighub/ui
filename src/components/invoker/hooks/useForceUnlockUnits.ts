// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo } from 'react';

import {
  type ChangeSetRead,
  useBulkPatchUnitsMutation,
  useListAllChangeSetsQuery,
  useListAllUnitsQuery,
} from '@confighub/rtk-query';

import { INITIATIVE_LABEL_KEY } from '../utils/changeset-run';

export interface LockHolder {
  unitId: string;
  changeSetId: string;
  changeSetSlug: string;
  isInitiativeOwned: boolean;
  createdAt: string | undefined;
}

interface UseForceUnlockUnitsArgs {
  /** Reserved for future space-scoped checks. `bulkPatchUnits` is org-wide so
   *  we don't need it on the current API calls, but callers pass it so we can
   *  scope queries later if needed. */
  spaceId: string;
  lockedUnitIds: string[];
}

export const useForceUnlockUnits = ({ lockedUnitIds }: UseForceUnlockUnitsArgs) => {
  const { data: unitRows } = useListAllUnitsQuery(
    {
      where:
        lockedUnitIds.length > 0
          ? `UnitID IN (${lockedUnitIds.map((id) => `'${id}'`).join(',')})`
          : undefined,
      select: 'UnitID,ChangeSetID',
    },
    { skip: lockedUnitIds.length === 0 },
  );

  const changeSetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of unitRows ?? []) {
      if (row.Unit?.ChangeSetID) ids.add(row.Unit.ChangeSetID);
    }
    return Array.from(ids);
  }, [unitRows]);

  const { data: csRows } = useListAllChangeSetsQuery(
    {
      where:
        changeSetIds.length > 0
          ? `ChangeSetID IN (${changeSetIds.map((id) => `'${id}'`).join(',')})`
          : undefined,
    },
    { skip: changeSetIds.length === 0 },
  );

  const csById = useMemo(() => {
    const map = new Map<string, ChangeSetRead>();
    for (const row of csRows ?? []) {
      if (row.ChangeSet?.ChangeSetID) map.set(row.ChangeSet.ChangeSetID, row.ChangeSet);
    }
    return map;
  }, [csRows]);

  const holders = useMemo<LockHolder[]>(() => {
    return (unitRows ?? [])
      .filter((r) => r.Unit?.UnitID && r.Unit?.ChangeSetID)
      .map((r) => {
        const cs = csById.get(r.Unit!.ChangeSetID!);
        return {
          unitId: r.Unit!.UnitID!,
          changeSetId: r.Unit!.ChangeSetID!,
          changeSetSlug: cs?.Slug ?? '',
          isInitiativeOwned: Boolean(cs?.Labels?.[INITIATIVE_LABEL_KEY]),
          createdAt: cs?.CreatedAt,
        };
      });
  }, [unitRows, csById]);

  const [bulkPatchUnits] = useBulkPatchUnitsMutation();

  const forceUnlock = useCallback(async () => {
    const unlockable = holders.filter((h) => h.isInitiativeOwned).map((h) => h.unitId);
    if (unlockable.length === 0) return;
    await bulkPatchUnits({
      where: `UnitID IN (${unlockable.map((id) => `'${id}'`).join(',')})`,
      body: { ChangeSetID: null },
    }).unwrap();
  }, [bulkPatchUnits, holders]);

  return { holders, forceUnlock };
};
