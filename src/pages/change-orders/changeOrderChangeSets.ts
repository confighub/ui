// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeSets a ChangeOrder's change was made in, at its source.
 *
 * A ChangeOrder stamps every Revision inside its interval, (start, end], with its id, and a
 * Revision made while its Unit was in a ChangeSet carries that ChangeSet's id. So the Revisions
 * at the source carrying both name the ChangeSets the change was grouped into, and each one's
 * Description is the change in its author's words. There may be several: nothing stops one
 * ChangeOrder from bracketing more than one ChangeSet, or none.
 *
 * The source is the base Space for a ChangeOrder made there, and the Spaces outside its scope
 * for a fan-out one -- the same split `fanOutRevisionWhere` makes. Promotions stamp the Revisions
 * they write in the Spaces in scope too, so the Space has to be constrained either way. An Invoke
 * ChangeOrder has made no change anywhere yet, so there is nothing to look for.
 */

import type { ExtendedRevisionRead } from '@confighub/rtk-query';

export interface ChangeOrderChangeSet {
  changeSetId: string;
  slug: string;
  spaceId?: string;
  spaceSlug?: string;
  description: string;
  /** `ChangeSet.State`: Open while Units are still in it, Closed once they have all left. */
  state?: string;
  /** The Units at the source the ChangeSet changed within the ChangeOrder's interval. */
  unitIds: string[];
  /** When the first of those Revisions was made: the order the ChangeSets are listed in. */
  firstAt?: string;
  /** The ChangeOrder's end boundary was taken from this ChangeSet's end Tag. */
  adopted: boolean;
}

/** The where clause, or `undefined` when there is no source to look in. */
export function changeOrderChangeSetWhere(args: {
  changeOrderId?: string;
  baseSpaceId?: string;
  updateType?: string;
  ownSpaceReached: boolean;
  inScopeSpaceIds?: readonly string[];
}): string | undefined {
  const { changeOrderId, baseSpaceId, updateType, ownSpaceReached, inScopeSpaceIds } = args;
  if (changeOrderId === undefined || updateType === 'Invoke') return undefined;
  const changeSetRevisions = `ChangeOrders ? '${changeOrderId}' AND ChangeSetID IS NOT NULL`;
  if (ownSpaceReached) {
    return baseSpaceId === undefined ? undefined : `${changeSetRevisions} AND SpaceID = '${baseSpaceId}'`;
  }
  const inScope = [...(inScopeSpaceIds ?? [])].sort();
  return inScope.length === 0
    ? changeSetRevisions
    : `${changeSetRevisions} AND SpaceID NOT IN (${inScope.map((id) => `'${id}'`).join(', ')})`;
}

/** One entry per ChangeSet, earliest first. */
export function groupChangeSetRevisions(
  revisions: readonly ExtendedRevisionRead[],
  adoptedEndTagId: string | undefined,
): ChangeOrderChangeSet[] {
  const byId = new Map<string, ChangeOrderChangeSet & { unitIdSet: Set<string> }>();
  for (const entry of revisions) {
    const revision = entry.Revision;
    const changeSet = entry.ChangeSet;
    const changeSetId = revision?.ChangeSetID ?? changeSet?.ChangeSetID;
    // Without the expansion there is no name or description to show, and nothing is invented.
    if (changeSetId === undefined || changeSet === undefined) continue;
    let group = byId.get(changeSetId);
    if (group === undefined) {
      group = {
        changeSetId,
        slug: changeSet.Slug,
        spaceId: changeSet.SpaceID,
        spaceSlug: changeSet.SpaceSlug,
        description: changeSet.Description ?? '',
        state: changeSet.State,
        unitIds: [],
        unitIdSet: new Set<string>(),
        firstAt: revision?.CreatedAt,
        adopted: adoptedEndTagId !== undefined && adoptedEndTagId !== '' && changeSet.EndTagID === adoptedEndTagId,
      };
      byId.set(changeSetId, group);
    }
    if (revision?.UnitID !== undefined) group.unitIdSet.add(revision.UnitID);
    if (revision?.CreatedAt !== undefined && (group.firstAt === undefined || revision.CreatedAt < group.firstAt)) {
      group.firstAt = revision.CreatedAt;
    }
  }
  return [...byId.values()]
    .map(({ unitIdSet, ...group }) => ({ ...group, unitIds: [...unitIdSet] }))
    .sort((a, b) => (a.firstAt ?? '').localeCompare(b.firstAt ?? '') || a.slug.localeCompare(b.slug));
}
