// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedUnitRead } from '@confighub/rtk-query';

import { type EntityRow, isUpgradable, unitStatusKind } from '../model/fields';
import type { StatusKind } from '../model/types';

/**
 * What a Unit row says about the Unit's state, from the list's own fields
 * only, so it is cheap for every row of a group. The row panel's verdict, its
 * group counts and "next Unit that needs attention" all start here.
 */

/**
 * The pseudo-gate the server sets while the Triggers that check a Unit have
 * not run yet. It means "being checked", never "fails".
 */
export const CHECKING_GATE = 'awaiting/triggers';

/**
 * One class per Unit; the first that matches wins. The order is the
 * verdict's: a failing gate, then unreleased revisions, then an upstream that
 * is ahead. A Unit with none of those and no Target is "untargeted", which
 * does not need attention: it cannot be released, so nothing waits for it.
 * A clone with no Target whose upstream is ahead does need attention.
 */
export type Attention = 'gated' | 'unreleased' | 'upgradable' | 'untargeted' | 'released';

export const NEEDS_ATTENTION: ReadonlySet<Attention> = new Set<Attention>(['gated', 'unreleased', 'upgradable']);

type GateMap = Readonly<Record<string, boolean>> | null | undefined;

/** The gates that fail, by name, in name order; the pseudo-gate is left out. */
export function failingGates(errors: GateMap): string[] {
  if (!errors) return [];
  return Object.keys(errors)
    .filter((name) => name !== CHECKING_GATE && errors[name])
    .sort((a, b) => a.localeCompare(b));
}

/**
 * A gate as the panel names it. Its full name is "<space>/<trigger>/<function>";
 * a Trigger of the Unit's own Space is named without the Space, which the
 * header already shows.
 */
export function gateLabel(gate: string, spaceSlug: string): string {
  return spaceSlug && gate.startsWith(`${spaceSlug}/`) ? gate.slice(spaceSlug.length + 1) : gate;
}

/** The Triggers that check the Unit have not run on its latest data yet. */
export function isChecking(errors: GateMap): boolean {
  return errors?.[CHECKING_GATE] === true;
}

/** Revisions after the released one; 0 for a Unit with no Target, which no Release includes. */
export function unreleasedCount(eu: ExtendedUnitRead): number {
  const u = eu.Unit;
  if (!u?.TargetID) return 0;
  return Math.max(0, (u.HeadRevisionNum ?? 0) - (u.LastReleasedRevisionNum ?? 0));
}

export function attentionOf(eu: ExtendedUnitRead): Attention {
  if (failingGates(eu.Unit?.ValidationErrors).length > 0) return 'gated';
  if (unreleasedCount(eu) > 0) return 'unreleased';
  if (isUpgradable(eu)) return 'upgradable';
  if (!eu.Unit?.TargetID) return 'untargeted';
  return 'released';
}

export function needsAttention(eu: ExtendedUnitRead): boolean {
  return NEEDS_ATTENTION.has(attentionOf(eu));
}

/** `needsAttention` for a row of a Units view, which the table order holds as an entity row. */
export const rowNeedsAttention = (row: EntityRow): boolean => needsAttention(row as ExtendedUnitRead);

/**
 * How a group counts a Unit: under the status the table's Status column
 * shows for it, so the panel and the table agree, and whether a gate blocks
 * it, which the table has no status for.
 */
export interface RowClass {
  status: StatusKind;
  gated: boolean;
  needs: boolean;
}

export function rowClass(eu: ExtendedUnitRead): RowClass {
  return { status: unitStatusKind(eu), gated: failingGates(eu.Unit?.ValidationErrors).length > 0, needs: needsAttention(eu) };
}

/** The facts of one Unit row that the verdict reads, as plain values. */
export interface RowFacts {
  slug: string;
  unitId: string;
  spaceId: string;
  spaceSlug: string;
  targetId?: string;
  targetSlug?: string;
  head: number;
  released: number;
  /** The gates that fail, by name. */
  gateNames: string[];
  /** The gates are being checked. */
  checking: boolean;
  /** The upstream revision this Unit last merged; 0 without an upstream. */
  upstreamRev: number;
  /** The upstream Unit, which an upgrade preview names. */
  upstreamUnitId?: string;
  /** The upstream Unit's head revision, when known. */
  upstreamHead?: number;
  upstreamSlug?: string;
  upstreamSpaceSlug?: string;
  /**
   * The last change, as the row has it: its description, or, when the change
   * was described only by the kind of operation that made it, that kind.
   */
  lastChange?: { description?: string; source?: string; at?: string };
}

/**
 * The kinds of operation that change a Unit (the API's SourceType). A change
 * made without a description of its own is described by its kind alone, which
 * is not someone's words, so the panel does not quote it.
 */
const SOURCE_TYPES: ReadonlySet<string> = new Set([
  'CreateUnit',
  'CloneUnit',
  'UpdateUnit',
  'PatchUnit',
  'UpgradeUnit',
  'MergeUnits',
  'RestoreRevision',
  'Invoke',
  'Resolve',
  'Trigger',
  'NeedsProvides',
  'Insert',
  'Upsert',
  'TransformPaths',
  'Refresh',
  'Import',
  'MergeExternal',
  'SetProtection',
  'SetGuard',
  'ApplyConflicts',
  'DismissConflicts',
]);

/**
 * The descriptions the server writes itself when a change comes without one:
 * "No Data", "Cloned from <space>/<unit>", "Self-Resolve", "MergeExternal; from
 * <source>", and the like. Like a SourceType, they say what made the change,
 * not why, so they are not quoted either.
 */
const SERVER_DESCRIPTIONS: readonly RegExp[] = [
  /^No Data$/,
  /^Self-Resolve( and invoked triggers:|$)/,
  /^Set path (protection|guards)$/,
  /^(Cloned|Refreshed|Removed|Rendered) from /,
  /^Transformed from revision \d+ of unit /,
  /^Backing Unit of /,
  /^Applied \d+ withheld merge changes?$/,
  /^Dismissed \d+ merge conflicts?$/,
];

/** The description says only what made the change: a SourceType, or what the server writes in its place. */
export function isServerDescription(description: string): boolean {
  // "<SourceType>; from <source>": a change merged from outside, named by its kind and where it came from.
  const kind = description.split('; from ')[0];
  return SOURCE_TYPES.has(kind) || SERVER_DESCRIPTIONS.some((re) => re.test(description));
}

function lastChangeOf(description: string | undefined, at: string | undefined): RowFacts['lastChange'] {
  if (!description && !at) return undefined;
  if (description && isServerDescription(description)) return { source: description, at };
  return { description: description || undefined, at };
}

export function rowFacts(eu: ExtendedUnitRead): RowFacts {
  const u = eu.Unit;
  return {
    slug: u?.Slug ?? '',
    unitId: u?.UnitID ?? '',
    spaceId: u?.SpaceID ?? '',
    spaceSlug: eu.Space?.Slug ?? '',
    targetId: u?.TargetID || undefined,
    targetSlug: eu.Target?.Slug || undefined,
    head: u?.HeadRevisionNum ?? 0,
    released: u?.LastReleasedRevisionNum ?? 0,
    gateNames: failingGates(u?.ValidationErrors),
    checking: isChecking(u?.ValidationErrors),
    upstreamRev: u?.UpstreamRevisionNum ?? 0,
    upstreamUnitId: u?.UpstreamUnitID || undefined,
    upstreamHead: eu.UpstreamUnit?.HeadRevisionNum,
    upstreamSlug: eu.UpstreamUnit?.Slug || undefined,
    upstreamSpaceSlug: eu.UpstreamSpace?.Slug || undefined,
    lastChange: lastChangeOf(u?.LastChangeDescription || undefined, u?.UpdatedAt),
  };
}
