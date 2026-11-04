// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { AppDispatch } from '@/state/store';
import { getApiErrorMessage } from '@/utility/error-functions';
import { confighubApi } from '@confighub/rtk-query';

/** The entity types a form can give a backing Unit after they exist. */
export type BackableEntityType = 'Space' | 'Target' | 'Trigger' | 'ChangeWorkflow' | 'Channel';

type BulkItem = { Error?: { Message?: string } };

/**
 * Gives an existing entity a backing Unit. No update takes with_backing_units, so this is an
 * empty bulk patch of the one entity, which adds a backing Unit to an entity that has none.
 * A Space's backing Unit goes in `backingUnitSpace`. Throws with the server's message when
 * the Unit was not created.
 */
export async function enableBackingUnit(
  dispatch: AppDispatch,
  entityType: BackableEntityType,
  entityId: string,
  backingUnitSpace?: string,
): Promise<void> {
  const where = `${entityType}ID = '${entityId}'`;
  const common = { where, withBackingUnits: true, body: {} };
  const send = (): Promise<BulkItem[]> => {
    switch (entityType) {
      case 'Space':
        return dispatch(
          confighubApi.endpoints.bulkPatchSpaces.initiate({ ...common, backingUnitSpace }),
        ).unwrap();
      case 'Target':
        return dispatch(confighubApi.endpoints.bulkPatchTargets.initiate(common)).unwrap();
      case 'Trigger':
        return dispatch(confighubApi.endpoints.bulkPatchTriggers.initiate(common)).unwrap();
      case 'ChangeWorkflow':
        return dispatch(
          confighubApi.endpoints.bulkPatchChangeWorkflows.initiate(common),
        ).unwrap();
      case 'Channel':
        return dispatch(confighubApi.endpoints.bulkPatchChannels.initiate(common)).unwrap();
    }
  };
  let items: BulkItem[];
  try {
    items = await send();
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'the server did not say why'));
  }
  // A bulk patch answers 207 with an Error on the item it could not write.
  const failed = items.find((item) => item.Error);
  if (failed) throw new Error(failed.Error?.Message || 'The backing Unit was not created.');
  if (items.length === 0)
    throw new Error(`The ${entityType} was not found, so no backing Unit was created.`);
}

/** What a form says when the entity was written but enableBackingUnit then failed. */
export function backingUnitFailureMessage(
  entityType: BackableEntityType,
  error: unknown,
): string {
  const reason = error instanceof Error ? error.message : 'the server did not say why';
  return `The ${entityType} was saved, but its backing Unit was not created: ${reason}`;
}
