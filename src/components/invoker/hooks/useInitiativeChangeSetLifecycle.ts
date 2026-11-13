// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback } from 'react';

import {
  type ChangeSetRead,
  useBulkPatchUnitsMutation,
  useCreateChangeSetMutation,
  useLazyListAllChangeSetsQuery,
  useLazyListAllUnitsQuery,
  useLazyListChangeSetsQuery,
  useLazyListSpacesQuery,
} from '@confighub/rtk-query';

import {
  type ChangeSetSpace,
  type ChangeSetSpaceChoice,
  RunCancelled,
  TRIGGER_ANNOTATION_KEY,
  heldUnitsRefusal,
  splitAcrossTriggerChangeSetsRefusal,
  nextTriggerChangeSetSlug,
  openTriggerChangeSet,
  triggerChangesWhere,
  triggerChangeSetSpace,
  triggerSlugOf,
} from '../utils/triggerChangeSet';

export interface PrepareTriggerChangeSetArgs {
  /** The Trigger, as `<space slug>/<trigger slug>` */
  triggerRef: string;
  /** The Units the run writes */
  unitIds: string[];
  /**
   * The Space a ChangeSet is found or made in, asked only when none of the Trigger's open
   * ChangeSets holds any of the Units. Undefined stops the run: `RunCancelled` is thrown.
   */
  chooseSpace: () => Promise<string | undefined>;
}

const unitIdsWhere = (unitIds: string[]): string =>
  `UnitID IN (${unitIds.map((id) => `'${id}'`).join(',')})`;

export const useInitiativeChangeSetLifecycle = () => {
  const [listChangeSets] = useLazyListChangeSetsQuery();
  const [listAllChangeSets] = useLazyListAllChangeSetsQuery();
  const [listAllUnits] = useLazyListAllUnitsQuery();
  const [createChangeSet] = useCreateChangeSetMutation();
  const [bulkPatchUnits] = useBulkPatchUnitsMutation();
  const [listSpaces] = useLazyListSpacesQuery();

  /** Where the ChangeSet of a run on Units in these Spaces goes, read from the Spaces (`triggerChangeSetSpace`). */
  const triggerChangeSetSpaceFor = useCallback(
    async (unitSpaceIds: string[]): Promise<ChangeSetSpaceChoice> => {
      const ids = [...new Set(unitSpaceIds)];
      if (ids.length === 1) return { spaceId: ids[0] };
      const read = async (where: string): Promise<ChangeSetSpace[]> =>
        (await listSpaces({ where, select: 'SpaceID,Slug,ComponentID,UpstreamSpaceID', includeHidden: '*' }).unwrap()).flatMap(
          (entry) =>
            entry.Space?.SpaceID
              ? [
                  {
                    spaceId: entry.Space.SpaceID,
                    slug: entry.Space.Slug ?? entry.Space.SpaceID,
                    componentId: entry.Space.ComponentID,
                    upstreamSpaceId: entry.Space.UpstreamSpaceID,
                  },
                ]
              : [],
        );
      const unitSpaces = await read(`SpaceID IN (${ids.map((id) => `'${id}'`).join(',')})`);
      const componentIds = new Set(unitSpaces.map((space) => space.componentId));
      const [componentId] = [...componentIds];
      const componentSpaces = componentIds.size === 1 && componentId ? await read(`ComponentID = '${componentId}'`) : undefined;
      return triggerChangeSetSpace(unitSpaces, componentSpaces);
    },
    [listSpaces],
  );

  // Puts the Units in no ChangeSet into one that is already open, for a write made in it; they
  // stay in it until it closes. A Unit already in it is left as it is, and one in another
  // ChangeSet is left too: the write in this one refuses it, saying which it is in.
  const joinChangeSet = useCallback(
    async ({ unitIds, changeSetId }: { unitIds: string[]; changeSetId: string }): Promise<void> => {
      if (unitIds.length === 0) return;
      const responses = await bulkPatchUnits({
        where: `${unitIdsWhere(unitIds)} AND ChangeSetID IS NULL`,
        body: { ChangeSetID: changeSetId },
      }).unwrap();
      // A bulk patch answers 207 with an error per Unit it could not change.
      const failed = responses.find((response) => response.Error);
      if (failed?.Error) {
        throw new Error(`Could not add ${failed.Unit?.Slug ?? 'a Unit'} to the ChangeSet: ${failed.Error.Message}`);
      }
    },
    [bulkPatchUnits],
  );

  /**
   * The ChangeSet a run for a Trigger is made in, with the Units in it. When some of the Units
   * are already in one of the Trigger's open ChangeSets, in whatever Space, it is that one;
   * otherwise the Trigger's open ChangeSet in the Space chosen, or a new one there named after
   * the Trigger. A Unit in any ChangeSet not the Trigger's, or Units in two of the Trigger's, are
   * refused before anything is written, with an Error saying which. The ChangeSet is left open
   * after the run, for the change to be reviewed in it.
   */
  const prepareTriggerChangeSet = useCallback(
    async ({ triggerRef, unitIds, chooseSpace }: PrepareTriggerChangeSetArgs): Promise<string> => {
      const where = triggerChangesWhere(triggerRef);
      const changeSetsOf = (rows: ReadonlyArray<{ ChangeSet?: ChangeSetRead }>) =>
        rows.flatMap((entry) => (entry.ChangeSet ? [entry.ChangeSet] : []));
      const nameOf = (cs: ChangeSetRead) => `${cs.SpaceSlug ?? ''}/${cs.Slug}`;

      // The Trigger's open ChangeSets wherever they are, since an earlier run may have put the
      // ChangeSet in another Space than this one would.
      const openForTrigger = changeSetsOf(
        await listAllChangeSets({ where: `${where} AND State != 'Closed'`, includeHidden: '*' }).unwrap(),
      );
      const openById = new Map(openForTrigger.flatMap((cs) => (cs.ChangeSetID ? [[cs.ChangeSetID, cs] as const] : [])));

      const inChangeSets = (
        await listAllUnits({ where: `${unitIdsWhere(unitIds)} AND ChangeSetID IS NOT NULL`, select: 'UnitID,Slug,SpaceID,ChangeSetID' }).unwrap()
      ).flatMap((entry) => (entry.Unit ? [entry.Unit] : []));
      const held = inChangeSets.filter((unit) => !openById.has(unit.ChangeSetID as string));
      if (held.length > 0) {
        const heldIds = [...new Set(held.map((unit) => unit.ChangeSetID as string))];
        const holders = new Map(
          changeSetsOf(
            await listAllChangeSets({
              where: `ChangeSetID IN (${heldIds.map((id) => `'${id}'`).join(',')})`,
              includeHidden: '*',
            }).unwrap(),
          ).flatMap((cs) => (cs.ChangeSetID ? [[cs.ChangeSetID, nameOf(cs)] as const] : [])),
        );
        throw new Error(
          heldUnitsRefusal(
            held.map((unit) => ({
              unitSlug: unit.Slug,
              changeSetName: holders.get(unit.ChangeSetID as string) ?? (unit.ChangeSetID as string),
            })),
          ),
        );
      }
      const holding = [...new Set(inChangeSets.map((unit) => unit.ChangeSetID as string))];
      if (holding.length > 1) {
        throw new Error(splitAcrossTriggerChangeSetsRefusal(holding.map((id) => nameOf(openById.get(id) as ChangeSetRead))));
      }

      let changeSetId: string | undefined = holding[0];
      if (changeSetId === undefined) {
        const spaceId = await chooseSpace();
        if (spaceId === undefined) throw new RunCancelled();
        changeSetId = openTriggerChangeSet(openForTrigger.filter((cs) => cs.SpaceID === spaceId))?.ChangeSetID;
        if (changeSetId === undefined) {
          const madeForTrigger = changeSetsOf(await listChangeSets({ spaceId, where, includeHidden: '*' }).unwrap()).length;
          const triggerSlug = triggerSlugOf(triggerRef);
          const taken = new Set(
            changeSetsOf(
              await listChangeSets({ spaceId, where: `Slug LIKE '${triggerSlug}%'`, select: 'Slug', includeHidden: '*' }).unwrap(),
            ).map((cs) => cs.Slug),
          );
          const created = await createChangeSet({
            spaceId,
            changeSet: {
              Slug: nextTriggerChangeSetSlug(triggerSlug, madeForTrigger, taken),
              Annotations: { [TRIGGER_ANNOTATION_KEY]: triggerRef },
            },
          }).unwrap();
          if (!created.ChangeSetID) throw new Error('The ChangeSet was created without a ChangeSetID.');
          changeSetId = created.ChangeSetID;
        }
      }

      await joinChangeSet({ unitIds, changeSetId });
      return changeSetId;
    },
    [listChangeSets, listAllUnits, listAllChangeSets, createChangeSet, joinChangeSet],
  );

  return { prepareTriggerChangeSet, triggerChangeSetSpaceFor, joinChangeSet };
};
