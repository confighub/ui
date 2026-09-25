// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback } from 'react';

import {
  type UnitCreateOrUpdateResponseRead,
  useBulkPatchUnitsMutation,
  useCreateChangeSetMutation,
} from '@confighub/rtk-query';

import {
  INITIATIVE_LABEL_KEY,
  INVOCATION_ANNOTATION_KEY,
  initiativeToLabel,
  mintChangeSetSlug,
} from '../utils/changeset-run';

export interface OpenChangeSetArgs {
  spaceId: string;
  initiativeId: string;
  unitIds: string[];
  /** User-visible CS name — typically the function name. */
  displayName: string;
  /** Raw annotation map. The hook JSON-encodes the invocation descriptor
   *  at INVOCATION_ANNOTATION_KEY if you include it in `annotations`. */
  annotations: Record<string, string>;
  extraLabels: Record<string, string>;
}

export interface CloseChangeSetArgs {
  spaceId: string;
  unitIds: string[];
}

export class LockedUnitsError extends Error {
  override name = 'LockedUnitsError';
  constructor(public readonly lockedUnitIds: string[]) {
    super(`Units locked by another ChangeSet: ${lockedUnitIds.join(', ')}`);
  }
}

const OPEN_CHANGESET_ERROR_TYPE = 'https://docs.confighub.com/errors/open-changeset';

const extractLockedUnitIds = (
  responses: UnitCreateOrUpdateResponseRead[],
): string[] =>
  responses
    .filter((r) => r.Error?.Type === OPEN_CHANGESET_ERROR_TYPE)
    .map((r) => r.Unit?.UnitID)
    .filter((id): id is string => Boolean(id));

const unitIdsWhere = (unitIds: string[]): string =>
  `UnitID IN (${unitIds.map((id) => `'${id}'`).join(',')})`;

export const useInitiativeChangeSetLifecycle = () => {
  const [createChangeSet] = useCreateChangeSetMutation();
  const [bulkPatchUnits] = useBulkPatchUnitsMutation();

  const openChangeSet = useCallback(
    async ({
      spaceId,
      initiativeId,
      unitIds,
      displayName,
      annotations,
      extraLabels,
    }: OpenChangeSetArgs): Promise<{ changeSetId: string; slug: string }> => {
      const slug = mintChangeSetSlug(initiativeId);
      const created = await createChangeSet({
        spaceId,
        changeSet: {
          Slug: slug,
          DisplayName: displayName,
          Labels: {
            [INITIATIVE_LABEL_KEY]: initiativeToLabel(initiativeId),
            ...extraLabels,
          },
          Annotations: annotations,
        },
      }).unwrap();

      const changeSetId = created.ChangeSetID;
      if (!changeSetId) throw new Error('CreateChangeSet did not return a ChangeSetID');

      const assignResponses = await bulkPatchUnits({
        where: unitIdsWhere(unitIds),
        body: { ChangeSetID: changeSetId },
      }).unwrap();

      const locked = extractLockedUnitIds(assignResponses);
      if (locked.length > 0) throw new LockedUnitsError(locked);

      return { changeSetId, slug };
    },
    [createChangeSet, bulkPatchUnits],
  );

  const closeChangeSet = useCallback(
    async ({ unitIds }: CloseChangeSetArgs): Promise<void> => {
      if (unitIds.length === 0) return;
      await bulkPatchUnits({
        where: unitIdsWhere(unitIds),
        body: { ChangeSetID: null },
      }).unwrap();
    },
    [bulkPatchUnits],
  );

  return { openChangeSet, closeChangeSet };
};

// Re-export key constants so callers don't need to reach into utils.
export { INVOCATION_ANNOTATION_KEY };
