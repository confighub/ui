// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import { useListAllChangeSetsQuery } from '@confighub/rtk-query';
import { skipToken } from '@reduxjs/toolkit/query';

/** A Unit a screen writes to, with the ChangeSet open on it, if any. */
export interface LockableUnit {
  unitId: string;
  changeSetId?: string | null;
}

/** A ChangeSet holding some of the Units, named with its Space. */
export interface LockingChangeSet {
  id: string;
  label: string;
}

/** What useChangeSetLock knows: the ChangeSets holding the Units, and which were acknowledged. */
export interface ChangeSetLock {
  /** The ChangeSets holding the Units. Empty when none of them is in one. */
  changeSets: LockingChangeSet[];
  /** The IDs of the ChangeSets the person confirmed the changes will be part of. */
  acknowledged: ReadonlySet<string>;
  onToggle: (changeSetId: string, checked: boolean) => void;
  /** Whether some Unit is in a ChangeSet that is not acknowledged. */
  unacknowledged: boolean;
  /** The ChangeSet a write to the Unit names: the one holding it, once it is acknowledged. */
  changeSetFor: (unitId: string) => string | undefined;
  /** How many of the Units are in a ChangeSet. */
  lockedUnits: number;
}

/**
 * The ChangeSets that hold the given Units. A ChangeSet locks the Units it is open on: a write that
 * creates a Revision of one has to name it, or the server refuses it, and the Revision becomes part
 * of it. A write names the ChangeSet only once the person has acknowledged that, as they acknowledge
 * a guard before a write is cleared for it.
 */
export const useChangeSetLock = (units: readonly LockableUnit[]): ChangeSetLock => {
  const byUnit = useMemo(() => {
    const map = new Map<string, string>();
    for (const unit of units) {
      if (unit.changeSetId) map.set(unit.unitId, unit.changeSetId);
    }
    return map;
  }, [units]);
  const ids = useMemo(() => [...new Set(byUnit.values())].sort(), [byUnit]);

  const query = useListAllChangeSetsQuery(
    ids.length > 0
      ? {
          where: `ChangeSetID IN (${ids.map((id) => `'${id}'`).join(', ')})`,
          include: 'SpaceID',
          select: 'ChangeSetID,Slug,DisplayName,SpaceID',
        }
      : skipToken,
  );
  const changeSets = useMemo<LockingChangeSet[]>(() => {
    const labels = new Map<string, string>();
    for (const item of query.data ?? []) {
      const changeSet = item.ChangeSet;
      if (!changeSet?.ChangeSetID) continue;
      labels.set(
        changeSet.ChangeSetID,
        item.Space?.Slug ? `${item.Space.Slug}/${changeSet.Slug}` : changeSet.Slug,
      );
    }
    // A ChangeSet the read did not return is still named, by ID: the lock does not depend on
    // being able to read its name.
    return ids.map((id) => ({ id, label: labels.get(id) ?? id }));
  }, [ids, query.data]);

  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  // An acknowledgement is of a ChangeSet that holds the Units now: one that no longer does is
  // dropped, so it is not carried over to a ChangeSet opened on them later under the same name.
  useEffect(() => {
    setAcknowledged((prev) => {
      const kept = [...prev].filter((id) => ids.includes(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [ids]);

  return {
    changeSets,
    acknowledged,
    onToggle: (changeSetId, checked) =>
      setAcknowledged((prev) => {
        const next = new Set(prev);
        if (checked) next.add(changeSetId);
        else next.delete(changeSetId);
        return next;
      }),
    unacknowledged: ids.some((id) => !acknowledged.has(id)),
    changeSetFor: (unitId) => {
      const changeSetId = byUnit.get(unitId);
      return changeSetId && acknowledged.has(changeSetId) ? changeSetId : undefined;
    },
    lockedUnits: byUnit.size,
  };
};
