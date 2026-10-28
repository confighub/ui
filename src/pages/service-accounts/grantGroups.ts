// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Similar grants, gathered so that a few kinds do not crowd out the rest. An
 * account that creates entities is granted Manage on each one, so one that
 * publishes has a Release, and a release Tag, for every ChangeOrder it
 * delivered. Grants are similar when they are on entities of one type, in one
 * Space, and give the same actions through the same subjects; one granted on
 * purpose among them gives something else, and so stays in sight.
 */
import type { Grant } from './serviceAccountGrants';

/** The grants of a group shown before the rest are counted instead. */
export const GRANTS_SHOWN_PER_GROUP = 3;

export interface GrantGroup {
  key: string;
  entityType: string;
  spaceSlug?: string;
  /** In the order the grants came. */
  grants: Grant[];
}

const groupKey = (grant: Grant) =>
  JSON.stringify([
    grant.entityType,
    grant.entity.SpaceID ?? '',
    grant.actions.map((a) => [a.action, a.direct, [...a.groupIds].sort()]),
  ]);

/** Gathers similar grants, each group where its first grant was. */
export function groupGrants(grants: Grant[]): GrantGroup[] {
  const groups = new Map<string, GrantGroup>();
  for (const grant of grants) {
    const key = groupKey(grant);
    const group = groups.get(key);
    if (group) group.grants.push(grant);
    else
      groups.set(key, {
        key,
        entityType: grant.entityType,
        spaceSlug: grant.spaceSlug,
        grants: [grant],
      });
  }
  return [...groups.values()];
}

/**
 * The grants of a group to show, and how many are left out. Those shown are the
 * newest, which are the ones still in use when the group is one made per
 * release, in the order the group has them. A single grant left out takes the
 * row its count would, so it is shown instead.
 */
export function visibleGrants(
  group: GrantGroup,
  expanded: boolean,
): { shown: Grant[]; hidden: number } {
  if (expanded || group.grants.length <= GRANTS_SHOWN_PER_GROUP + 1)
    return { shown: group.grants, hidden: 0 };
  const newest = new Set(
    [...group.grants]
      .sort((a, b) => (b.entity.CreatedAt ?? '').localeCompare(a.entity.CreatedAt ?? ''))
      .slice(0, GRANTS_SHOWN_PER_GROUP),
  );
  return {
    shown: group.grants.filter((grant) => newest.has(grant)),
    hidden: group.grants.length - GRANTS_SHOWN_PER_GROUP,
  };
}
