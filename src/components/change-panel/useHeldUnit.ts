// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Unit the page shows, when someone else's open ChangeSet holds it (D14): its owner
 * and that ChangeSet, so the page can make the editor read only and the panel can say
 * the Unit cannot join the active change.
 */
import { useMemo } from 'react';
import { useGetChangeSetQuery, useGetSpaceQuery, useGetUnitQuery, useListAllChangeSetsQuery, useListUsersQuery } from '@confighub/rtk-query';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import type { UnitRead } from '@confighub/rtk-query';
import { useActiveChange } from './ActiveChangeProvider';
import { useActiveChangeRef } from './activeChange';
import { usePageSpace } from './usePageSpace';

export interface HeldUnit {
  space: string;
  unit: string;
  owner: string;
  changeSetSlug: string;
  changeSetSpace: string;
  /** The holder is a finished (Closed) change that still holds the Unit (D37). */
  finished: boolean;
}

/** The open ChangeSet, not the active one, that has the Unit; `yours` when it is the person's own (D28). */
function useOtherChangeOf(spaceId: string | undefined, unitId: string | undefined, activeSlug: string | undefined): (HeldUnit & { yours: boolean }) | null {
  const unitRead = useGetUnitQuery({ spaceId: spaceId ?? '', unitId: unitId ?? '' }, { skip: !spaceId || !unitId });
  const unit = unitRead.data?.Unit;
  // The Unit read names no Space slug: the Space read does.
  const unitSpace = useGetSpaceQuery({ spaceId: spaceId ?? '' }, { skip: !spaceId || !unit?.ChangeSetID });
  const changeSetId = unit?.ChangeSetID;
  // By ID across Spaces: a ChangeSet lives in one Space (its base) and holds Units in others.
  const byId = useListAllChangeSetsQuery({ where: `ChangeSetID = '${changeSetId ?? ''}'` }, { skip: !changeSetId });
  // The read in the Unit's own Space answers for a ChangeSet that lives there.
  const held = useGetChangeSetQuery({ spaceId: spaceId ?? '', changeSetId: changeSetId ?? '' }, { skip: !spaceId || !changeSetId });
  const changeSet = byId.data?.[0]?.ChangeSet ?? held.data?.ChangeSet;
  const users = useListUsersQuery({}, { skip: !changeSet?.UserID });
  const { userInfo } = useUserInfo();
  const me = userInfo?.UserID;
  return useMemo(() => {
    // Only the change the Unit is in now: a skipped read keeps its last answer.
    if (!unit || !changeSet || !unit.ChangeSetID || changeSet.ChangeSetID !== unit.ChangeSetID) return null;
    if (changeSet.Slug === activeSlug) return null;
    const user = (users.data ?? []).find((entry) => entry.User?.UserID === changeSet.UserID)?.User;
    return {
      space: unitSpace.data?.Space?.Slug ?? unitRead.data?.Space?.Slug ?? '',
      unit: unit.Slug,
      owner: user?.DisplayName || user?.Username || 'another person',
      changeSetSlug: changeSet.Slug,
      changeSetSpace: changeSet.SpaceSlug ?? byId.data?.[0]?.Space?.Slug ?? held.data?.Space?.Slug ?? '',
      yours: me !== undefined && changeSet.UserID === me,
      finished: changeSet.State === 'Closed',
    };
  }, [unit, changeSet, activeSlug, me, users.data, unitRead.data?.Space?.Slug, unitSpace.data?.Space?.Slug, held.data?.Space?.Slug, byId.data]);
}

/**
 * Held: by another person's open change (D14), or by a finished change of anyone's that still
 * holds the Unit (D37), which refuses every write until the Unit is freed.
 */
export function useHeldUnitOf(spaceId: string | undefined, unitId: string | undefined, activeSlug: string | undefined): HeldUnit | null {
  const other = useOtherChangeOf(spaceId, unitId, activeSlug);
  return other && (!other.yours || other.finished) ? other : null;
}

/** Another open change of the person's own that has the Unit: theirs to switch to (D28). */
export function useOwnOtherChangeOf(spaceId: string | undefined, unitId: string | undefined, activeSlug: string | undefined): HeldUnit | null {
  const other = useOtherChangeOf(spaceId, unitId, activeSlug);
  return other && other.yours && !other.finished ? other : null;
}

/** The page's Unit, when another person's change holds it. */
export function useHeldUnit(): HeldUnit | null {
  const { spaceId, unitId } = usePageSpace();
  const { active } = useActiveChangeRef();
  return useHeldUnitOf(spaceId, unitId, active?.slug);
}

/** The Unit page's Unit, when another person's change holds it. */
export function useHeld(unit: UnitRead) {
  const ac = useActiveChange();
  return useHeldUnitOf(unit.SpaceID, unit.UnitID, ac?.ref?.slug);
}

/** True while another person's open change holds the Unit: its editor is read only. */
export function useChangeEditLock(unit: UnitRead): boolean {
  const held = useHeld(unit);
  return held !== null && !held.finished;
}

/** A finished change still holds the Unit (D37): Save waits for "Free this Unit". */
export function useFinishedHold(unit: UnitRead): HeldUnit | null {
  const held = useHeld(unit);
  return held !== null && held.finished ? held : null;
}

/** The Unit is in another open change of the person's own (D28): Save waits for Switch to it. */
export function useOwnOtherChange(unit: UnitRead) {
  const ac = useActiveChange();
  return useOwnOtherChangeOf(unit.SpaceID, unit.UnitID, ac?.ref?.slug);
}
