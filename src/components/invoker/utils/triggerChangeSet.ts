// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeSet a function run from the Validation page is made in: the one open for the
 * Trigger in the Space, annotated `Trigger=<space slug>/<trigger slug>` as a rollout of a change
 * a Trigger asks for annotates its ChangeSets and ChangeOrders. It is named after the Trigger,
 * numbered from the second on, and left open after the run, so the change can be reviewed in it.
 */

import type { ChangeSetRead } from '@confighub/rtk-query';

/** Names the Trigger a ChangeSet or ChangeOrder was made for, as `<space slug>/<trigger slug>`. */
export const TRIGGER_ANNOTATION_KEY = 'Trigger';

/** The longest slug the server takes. */
export const SLUG_MAX_LENGTH = 128;

/** The where expression naming what was made for the Trigger `<space slug>/<trigger slug>`. */
export const triggerChangesWhere = (triggerRef: string): string =>
  `Annotations.${TRIGGER_ANNOTATION_KEY} = '${triggerRef.replace(/'/g, "''")}'`;

/** The Trigger's own slug, from `<space slug>/<trigger slug>`. */
export const triggerSlugOf = (triggerRef: string): string => triggerRef.slice(triggerRef.lastIndexOf('/') + 1);

/** The Trigger's ChangeSet still open for changes, of those made for it in a Space: the newest. */
export function openTriggerChangeSet(changeSets: readonly ChangeSetRead[]): ChangeSetRead | undefined {
  return changeSets
    .filter((cs) => cs.State !== 'Closed')
    .sort((a, b) => (b.CreatedAt ?? '').localeCompare(a.CreatedAt ?? ''))[0];
}

/**
 * The slug of a new ChangeSet for the Trigger: the Trigger's slug for its first in the Space, and
 * `<trigger slug>-<n>` for the nth, the first number no ChangeSet in the Space has, its slug cut
 * short enough for the number to fit.
 */
export function nextTriggerChangeSetSlug(triggerSlug: string, madeForTrigger: number, taken: ReadonlySet<string>): string {
  if (madeForTrigger === 0 && !taken.has(triggerSlug)) return triggerSlug;
  for (let n = Math.max(madeForTrigger + 1, 2); ; n++) {
    const suffix = `-${n}`;
    const slug = `${triggerSlug.slice(0, SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(slug)) return slug;
  }
}

/** A Unit a run would write that is in a ChangeSet other than the Trigger's. */
export interface HeldUnit {
  unitSlug: string;
  /** `<space slug>/<slug>` of the ChangeSet it is in, or its id when it could not be read */
  changeSetName: string;
}

/** Why a run refuses Units that are in another ChangeSet. */
export function heldUnitsRefusal(held: readonly HeldUnit[]): string {
  const listed = held.map((h) => `${h.unitSlug} is in ${h.changeSetName}`).join('; ');
  return (
    `Nothing was run: ${held.length === 1 ? 'a Unit is' : `${held.length} Units are`} in a ChangeSet other than this ` +
    `Trigger's (${listed}). Close that ChangeSet, or take ${held.length === 1 ? 'the Unit' : 'them'} out of it, and run again.`
  );
}

/**
 * Why a run refuses Units that are in more than one of the Trigger's own open ChangeSets: a run
 * is made in one, and the Units of each are run on apart.
 */
export function splitAcrossTriggerChangeSetsRefusal(changeSetNames: readonly string[]): string {
  return (
    `Nothing was run: the Units are in ${changeSetNames.length} of this Trigger's open ChangeSets (${changeSetNames.join(', ')}), ` +
    'and a run is made in one. Run on the Units of each ChangeSet separately.'
  );
}

/** A run the person stopped before it wrote anything, such as by choosing no Space for its ChangeSet. */
export class RunCancelled extends Error {}

/** A Space a run's ChangeSet could be in, with what places it in its Component's tree. */
export interface ChangeSetSpace {
  spaceId: string;
  slug: string;
  componentId?: string;
  upstreamSpaceId?: string;
}

/** Where a run's ChangeSet goes: a Space decided, or the Spaces to ask the person to choose from. */
export type ChangeSetSpaceChoice = { spaceId: string } | { ask: ChangeSetSpace[] };

/**
 * Where the ChangeSet of a run on Units in `unitSpaces` goes: their Space when they share one;
 * when their Spaces are all in one Component, the root of its Spaces, the one whose upstream is
 * none of them, given `componentSpaces`, every Space of the Component; otherwise, or when that
 * Component has no one root, the person chooses among the Units' Spaces.
 */
export function triggerChangeSetSpace(unitSpaces: readonly ChangeSetSpace[], componentSpaces?: readonly ChangeSetSpace[]): ChangeSetSpaceChoice {
  const ask = { ask: [...unitSpaces].sort((a, b) => a.slug.localeCompare(b.slug)) };
  if (unitSpaces.length === 1) return { spaceId: unitSpaces[0].spaceId };
  const componentId = unitSpaces[0]?.componentId;
  if (!componentId || unitSpaces.some((space) => space.componentId !== componentId) || componentSpaces === undefined) return ask;
  const members = componentSpaces.filter((space) => space.componentId === componentId);
  const memberIds = new Set(members.map((space) => space.spaceId));
  const roots = members.filter((space) => !space.upstreamSpaceId || !memberIds.has(space.upstreamSpaceId));
  return roots.length === 1 ? { spaceId: roots[0].spaceId } : ask;
}
