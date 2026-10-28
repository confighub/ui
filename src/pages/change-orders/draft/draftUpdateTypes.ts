// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which update types a draft can propagate by, from the Links that exist.
 *
 * A ChangeOrder's Units are the ones followed by Links of its own UpdateType from the base Space
 * into the Spaces in scope (`Link.ToSpaceID` is the base, `Link.SpaceID` the variant), and, for
 * UpgradeUnit, the base's Units nothing follows yet, which it clones into the variants. So
 * MergeUnits is offered when one of its Links reaches a variant in scope, and UpgradeUnit when
 * one of its Links does, or a variant in scope has no Link of either type from the base.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type { DraftUpdateType } from './draftTypes';

/** The update types a "Base changes" draft can propagate by, in the order the sub bar offers them. */
export const DRAFT_UPDATE_TYPES: readonly DraftUpdateType[] = ['UpgradeUnit', 'MergeUnits'];

/** The variant Spaces each update type's Links reach from the base: `Link.SpaceID`, by `Link.UpdateType`. */
export type DraftLinkedSpaces = Readonly<Record<DraftUpdateType, ReadonlySet<string>>>;

/** `unknown`: the Links have not been read, or could not be. Nothing is claimed of the type. */
export type DraftUpdateTypeAvailability = 'available' | 'unavailable' | 'unknown';

export type DraftUpdateTypeAvailabilities = Readonly<Record<DraftUpdateType, DraftUpdateTypeAvailability>>;

/** A Link as the draft reads it: its downstream Space and its type. */
export interface DraftLinkRow {
  spaceId: string | undefined;
  updateType: string | undefined;
}

/** The Links read, gathered by type. A Link of any other type is not one a draft propagates by. */
export function linkedSpacesOf(links: readonly DraftLinkRow[]): DraftLinkedSpaces {
  const linked: Record<DraftUpdateType, Set<string>> = { UpgradeUnit: new Set(), MergeUnits: new Set() };
  for (const link of links) {
    if (link.spaceId === undefined || link.updateType === undefined) continue;
    if (link.updateType === 'UpgradeUnit' || link.updateType === 'MergeUnits') linked[link.updateType].add(link.spaceId);
  }
  return linked;
}

/**
 * Each update type's availability for a scope, as the server derives a ChangeOrder's Units:
 * MergeUnits when one of its Links reaches a variant in scope; UpgradeUnit when one of its Links
 * does, or when a variant in scope has no Link of either type from the base, since the base's
 * Units are then cloned into it. `unknown` while the Links are not known.
 */
export function updateTypeAvailability(
  linked: DraftLinkedSpaces | undefined,
  scopeIds: readonly string[],
): DraftUpdateTypeAvailabilities {
  if (linked === undefined) return { UpgradeUnit: 'unknown', MergeUnits: 'unknown' };
  const reaches = (type: DraftUpdateType, spaceId: string) => linked[type].has(spaceId);
  const upgrade = scopeIds.some((spaceId) => reaches('UpgradeUnit', spaceId) || !reaches('MergeUnits', spaceId));
  const merge = scopeIds.some((spaceId) => reaches('MergeUnits', spaceId));
  return { UpgradeUnit: upgrade ? 'available' : 'unavailable', MergeUnits: merge ? 'available' : 'unavailable' };
}

/**
 * The update type of a draft whose URL names none: last time's while it is available (or nobody
 * knows yet), otherwise the available one. With neither (no variant in scope), last time's, or
 * UpgradeUnit: nothing is promoted either way, and the scope says so.
 */
export function defaultUpdateType(
  last: DraftUpdateType | undefined,
  availability: DraftUpdateTypeAvailabilities,
): DraftUpdateType {
  if (last !== undefined && availability[last] !== 'unavailable') return last;
  return DRAFT_UPDATE_TYPES.find((type) => availability[type] === 'available') ?? last ?? 'UpgradeUnit';
}
