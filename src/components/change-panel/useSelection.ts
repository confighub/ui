// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Units selected anywhere in the app, as the function invoker reads them (the
 * `selectedUnits` slice; a Unit page puts its own Unit there, H12), and the state of each
 * for the change panel (H11): free, in the active change, or held by another ChangeSet.
 *
 * The slice holds the Units as the selecting page read them, without their ChangeSet, so the
 * state comes from a fresh read of those Units (D33's preflight), in chunks for the
 * server's `where` length. The holders are read by ID, so a ChangeSet that lives in another
 * Space than its Units (its base) is found too.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  useBulkPatchUnitsMutation,
  useListAllChangeSetsQuery,
  useListComponentsQuery,
  useListSpacesQuery,
  useListUsersQuery,
} from '@confighub/rtk-query';
import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import { chunkInClause, inClause, uniqueIds } from '@/hooks/inClauseChunks';
import { useListUnitsByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { selectSelectedUnits, setSelectedUnits } from '@/state/slices/selectedUnits';
import { getApiErrorMessage } from '@/utility/error-functions';
import { usePageSpace } from './usePageSpace';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';

/**
 * free: in no change; mine: in your active change; own: in another open change of yours (D28,
 * "Switch to it"); held: in another person's change.
 */
export type SelectedState = 'free' | 'mine' | 'own' | 'held';

export interface SelectedUnit {
  unitId: string;
  spaceId: string;
  space: string;
  unit: string;
  componentId?: string;
  component: string;
  /** Undefined until the fresh read answers. */
  state?: SelectedState;
  owner?: string;
  /** The change that has the Unit, when it is another one of yours (D28). */
  ownChange?: { space: string; slug: string };
  /** The change that holds the Unit, when it is another person's (D29): its page is one click away. */
  heldBy?: { space: string; slug: string };
  /** The change holding it is finished (D37): writes are refused until the Unit is freed. */
  heldFinished?: boolean;
}

export interface Selection {
  units: SelectedUnit[];
  /** True while the fresh read of the selected Units has not answered. */
  reading: boolean;
  counts: Record<SelectedState, number>;
  remove: (unitId: string) => void;
}

const quote = (id: string) => `'${id}'`;

export function useSelection(activeChangeSetId: string | undefined): Selection {
  const dispatch = useAppDispatch();
  const { userInfo } = useUserInfo();
  const me = userInfo?.UserID;
  const slice = useAppSelector(selectSelectedUnits);
  const picked = useMemo(
    () => (slice ?? []).filter((u) => u.Unit?.UnitID && u.Unit?.SpaceID),
    [slice],
  );
  const unitIds = useMemo(() => uniqueIds(picked.map((u) => u.Unit?.UnitID)), [picked]);
  const fresh = useListUnitsByIdChunkedQuery({ unitIds, select: 'UnitID,SpaceID,ChangeSetID,Slug' }, { skip: unitIds.length === 0 });
  const spaceIds = useMemo(() => uniqueIds(picked.map((u) => u.Unit?.SpaceID)), [picked]);
  const spaces = useListSpacesQuery({ where: inClause('SpaceID', spaceIds), select: 'SpaceID,Slug,ComponentID' }, { skip: spaceIds.length === 0 });
  const components = useListComponentsQuery({}, { skip: spaceIds.length === 0 });
  const holderIds = useMemo(
    () => uniqueIds((fresh.data ?? []).map((e) => e.Unit?.ChangeSetID).filter((id) => id && id !== activeChangeSetId)),
    [fresh.data, activeChangeSetId],
  );
  const holders = useListAllChangeSetsQuery({ where: `ChangeSetID IN (${holderIds.map(quote).join(', ')})` }, { skip: holderIds.length === 0 });
  const users = useListUsersQuery({}, { skip: holderIds.length === 0 });

  const units = useMemo(() => {
    const changeSetOf = new Map((fresh.data ?? []).map((e) => [e.Unit?.UnitID ?? '', e.Unit?.ChangeSetID ?? '']));
    const space = new Map((spaces.data ?? []).map((e) => [e.Space?.SpaceID ?? '', e.Space]));
    const componentName = new Map((components.data ?? []).map((e) => [e.Component?.ComponentID ?? '', e.Component?.Slug ?? '']));
    const holderOf = new Map((holders.data ?? []).map((e) => [e.ChangeSet?.ChangeSetID ?? '', e.ChangeSet]));
    const ownerOf = new Map(
      (holders.data ?? []).map((e) => {
        const user = (users.data ?? []).find((u) => u.User?.UserID === e.ChangeSet?.UserID)?.User;
        return [e.ChangeSet?.ChangeSetID ?? '', user?.DisplayName || user?.Username || 'another person'];
      }),
    );
    return picked.map((u): SelectedUnit => {
      const unitId = u.Unit!.UnitID!;
      const spaceId = u.Unit!.SpaceID!;
      const s = space.get(spaceId);
      const cs = fresh.data === undefined ? undefined : changeSetOf.get(unitId);
      const holder = cs ? holderOf.get(cs) : undefined;
      // A closed ChangeSet that still holds the Unit is no change to switch to: the Unit is held.
      const yours = holder !== undefined && me !== undefined && holder.UserID === me && holder.State !== 'Closed';
      const state: SelectedState | undefined =
        cs === undefined ? undefined : cs === '' ? 'free' : cs === activeChangeSetId ? 'mine' : yours ? 'own' : 'held';
      const componentId = s?.ComponentID;
      return {
        unitId,
        spaceId,
        space: u.Space?.Slug ?? s?.Slug ?? '',
        unit: u.Unit!.Slug,
        componentId,
        component: (componentId && componentName.get(componentId)) || 'No Component',
        state,
        owner: state === 'held' ? (ownerOf.get(cs ?? '') ?? 'another person') : undefined,
        ownChange: state === 'own' && holder ? { space: holder.SpaceSlug ?? '', slug: holder.Slug } : undefined,
        heldBy: state === 'held' && holder ? { space: holder.SpaceSlug ?? '', slug: holder.Slug } : undefined,
        heldFinished: state === 'held' && holder?.State === 'Closed',
      };
    });
  }, [picked, fresh.data, spaces.data, components.data, holders.data, users.data, activeChangeSetId, me]);

  const counts = useMemo(() => {
    const c: Record<SelectedState, number> = { free: 0, mine: 0, own: 0, held: 0 };
    for (const u of units) if (u.state) c[u.state] += 1;
    return c;
  }, [units]);

  const remove = useCallback(
    (unitId: string) => dispatch(setSelectedUnits({ units: (slice ?? []).filter((u) => u.Unit?.UnitID !== unitId) })),
    [dispatch, slice],
  );

  return { units, reading: unitIds.length > 0 && fresh.data === undefined, counts, remove };
}

/**
 * Joins the free Units of `unitIds` to a ChangeSet (D33): the bulk Unit PATCH {ChangeSetID}
 * where each Unit is free, in chunks; a 207 names each Unit it could not change.
 */
export function useJoinUnits() {
  const [bulkPatchUnits] = useBulkPatchUnitsMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const join = useCallback(
    async (unitIds: string[], changeSetId: string): Promise<string[]> => {
      setBusy(true);
      setError(undefined);
      const joined: string[] = [];
      try {
        for (const where of chunkInClause('UnitID', unitIds)) {
          const responses = await bulkPatchUnits({
            where: `${where} AND ChangeSetID IS NULL`,
            // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
            body: JSON.stringify({ ChangeSetID: changeSetId }),
          }).unwrap();
          for (const r of responses) {
            if (r.Error) setError(`${r.Unit?.Slug ?? 'A Unit'} could not join: ${r.Error.Message ?? ''}`);
            else if (r.Unit?.UnitID) joined.push(r.Unit.UnitID);
          }
        }
      } catch (failure) {
        setError(getApiErrorMessage(failure));
      } finally {
        setBusy(false);
      }
      return joined;
    },
    [bulkPatchUnits],
  );
  return { join, busy, error };
}

export interface PanelSelection {
  selection: Selection;
  /** 'page': the Unit page's own Unit (D27); 'list': Units ticked on a list (D9). */
  mode: 'none' | 'page' | 'list';
  pageUnit?: SelectedUnit;
}

export function usePanelSelection(activeChangeSetId: string | undefined): PanelSelection {
  const selection = useSelection(activeChangeSetId);
  const { unitId } = usePageSpace();
  if (selection.units.length === 0) return { selection, mode: 'none' };
  const pageUnit = unitId !== undefined && selection.units.length === 1 && selection.units[0]?.unitId === unitId ? selection.units[0] : undefined;
  return { selection, mode: pageUnit ? 'page' : 'list', pageUnit };
}

