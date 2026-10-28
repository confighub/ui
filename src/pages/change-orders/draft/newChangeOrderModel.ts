// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which Components a ChangeOrder can be drafted for, and what "New ChangeOrder" says about each.
 *
 * A DRAFT IS MADE IN A COMPONENT'S BASE: its root, the Space of the Component that came from no
 * other Space of it. A Space's upstream is the Space it was cloned from: the server's
 * `UpstreamSpaceID` when it has one, else the `UpstreamSpaceID` annotation `cub variant create`
 * stamps (what a promotion takes from). A Space whose upstream is outside its Component is a
 * root. A root is listed only when some Space of the Component descends from it: with no
 * lineage recorded there is nothing to promote to. Spaces whose upstreams go round in a circle
 * descend from no root. A release Target says nothing about any of this: a variant can have none.
 *
 * THE LAST CHANGEORDER is the one the draft re-aims by default, of any kind (`isReAimable`): what
 * the row names, and what the draft opens on.
 *
 * WAITING is about base changes: read off the Units, as the draft reads its start, for each variant
 * in the scope of the last ChangeOrder that carried base changes (`isDefaultTemplate`), or every
 * variant with none. When it says changes are waiting and the last ChangeOrder made another kind of
 * change, the row opens the draft on Base changes, where they are. A base Unit has changes waiting for
 * a variant that holds no clone of it (the draft would add it), or whose clone took an earlier
 * Revision of it than its head. What cannot be told is not guessed, and makes "nothing
 * waiting" unknown: a MergeUnits ChangeOrder, whose Links no clone records; no variant in
 * scope; a clone with no Revision recorded (the draft has no start for it); a variant holding
 * Units cloned from another variant, which the base's head says nothing about.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type { ChangeOrderRead } from '@confighub/rtk-query';

import { pastChangeOrderOf } from './draftContextModel';
import { draftCopy } from './draftCopy';
import { DRAFT_KIND_WORDS } from './draftKinds';
import { type DraftAddress, isDefaultTemplate, isReAimable } from './draftDecisions';
import type { DraftPastChangeOrder } from './draftTypes';

/** The column each of the picker's reads by Space id filters on. */
export const PICKER_READ_COLUMN = {
  changeOrders: 'SpaceID',
  baseUnits: 'SpaceID',
  variantUnits: 'SpaceID',
} as const;

/** A Space as the picker reads it. */
export interface PickerSpace {
  spaceId: string;
  slug: string;
  componentId: string;
  /** The Space it was cloned from, when the server or the variant breadcrumb says. */
  upstreamSpaceId: string | undefined;
}

export interface PickerComponent {
  componentId: string;
  slug: string;
  name: string;
}

/** The base's last ChangeOrder, as the draft would re-aim it. */
export interface PickerChangeOrder {
  slug: string;
  createdAt: string;
  inScopeSpaceIds: readonly string[];
  updateType: string;
}

export interface PickerBaseUnit {
  unitId: string;
  spaceId: string;
  headRevisionNum: number;
}

/** A Unit of a variant Space, with what it was cloned from. */
export interface PickerVariantUnit {
  spaceId: string;
  upstreamSpaceId: string | undefined;
  upstreamUnitId: string | undefined;
  /** The Revision of its upstream it took; 0 or absent when none is recorded. */
  upstreamRevisionNum: number | undefined;
}

/** A Component's base, which a draft is made in. */
export interface DraftBase {
  componentId: string;
  componentSlug: string;
  /** The Component's display name. */
  componentName: string;
  spaceId: string;
  spaceSlug: string;
  /** The Spaces that descend from it: what a ChangeOrder from this base promotes to. */
  variantSpaceIds: readonly string[];
}

/** The Space a Space was cloned from: the server's field, else the variant breadcrumb. */
export function upstreamOfSpace(space: {
  UpstreamSpaceID?: string;
  Annotations?: Record<string, string>;
}): string | undefined {
  const upstream = space.UpstreamSpaceID || space.Annotations?.UpstreamSpaceID;
  return upstream === undefined || upstream === '' ? undefined : upstream;
}

/**
 * The root a Space descends from inside its Component, following upstreams: itself for a root,
 * undefined for a Space on a circle of upstreams.
 */
function rootOf(
  space: PickerSpace,
  byId: ReadonlyMap<string, PickerSpace>,
): PickerSpace | undefined {
  const seen = new Set<string>();
  let current = space;
  for (;;) {
    const upstream =
      current.upstreamSpaceId === undefined ? undefined : byId.get(current.upstreamSpaceId);
    if (upstream === undefined) return current;
    if (seen.has(current.spaceId)) return undefined;
    seen.add(current.spaceId);
    current = upstream;
  }
}

/** Each Component's bases: its roots that some Space of it descends from. */
export function draftBases(
  spaces: readonly PickerSpace[],
  components: readonly PickerComponent[],
): DraftBase[] {
  const componentById = new Map(
    components.map((component) => [component.componentId, component]),
  );
  const spacesByComponent = new Map<string, PickerSpace[]>();
  for (const space of spaces)
    spacesByComponent.set(space.componentId, [
      ...(spacesByComponent.get(space.componentId) ?? []),
      space,
    ]);
  const bases: DraftBase[] = [];
  for (const [componentId, members] of spacesByComponent) {
    const byId = new Map(members.map((space) => [space.spaceId, space]));
    const descendants = new Map<string, string[]>();
    for (const space of members) {
      const root = rootOf(space, byId);
      if (root === undefined || root === space) continue;
      descendants.set(root.spaceId, [...(descendants.get(root.spaceId) ?? []), space.spaceId]);
    }
    const component = componentById.get(componentId);
    for (const root of members) {
      const variantSpaceIds = descendants.get(root.spaceId);
      if (variantSpaceIds === undefined) continue;
      bases.push({
        componentId,
        componentSlug: component?.slug ?? '',
        // A Component the reader cannot see is named by its base, never by an ID.
        componentName: component?.name || component?.slug || root.slug,
        spaceId: root.spaceId,
        spaceSlug: root.slug,
        variantSpaceIds,
      });
    }
  }
  return bases;
}

/** A person the picker never shows: the draft's rule reads no author. */
const NOBODY = { key: '', kind: 'none', name: '', isYou: false, colorSeed: '' } as const;

/** Each base Space's newest ChangeOrder that `keep` holds, newest first by creation. */
function newestBySpace(
  orders: readonly ChangeOrderRead[],
  keep: (past: DraftPastChangeOrder) => boolean,
): Map<string, PickerChangeOrder> {
  const newestFirst = orders
    .flatMap((order): { spaceId: string; past: DraftPastChangeOrder }[] => {
      const past =
        order.SpaceID === undefined ? undefined : pastChangeOrderOf(order, () => NOBODY);
      return past === undefined || order.SpaceID === undefined
        ? []
        : [{ spaceId: order.SpaceID, past }];
    })
    .sort((a, b) => Date.parse(b.past.createdAt ?? '') - Date.parse(a.past.createdAt ?? ''));
  const last = new Map<string, PickerChangeOrder>();
  for (const { spaceId, past } of newestFirst) {
    if (last.has(spaceId) || !keep(past) || past.createdAt === undefined) continue;
    last.set(spaceId, {
      slug: past.slug,
      createdAt: past.createdAt,
      inScopeSpaceIds: past.inScopeSpaceIds,
      updateType: past.updateType,
    });
  }
  return last;
}

/** Each base Space's last ChangeOrder, by the rule the draft picks its default template by: any kind. */
export function lastChangeOrderBySpace(orders: readonly ChangeOrderRead[]): Map<string, PickerChangeOrder> {
  return newestBySpace(orders, isReAimable);
}

/** Each base Space's last ChangeOrder that carried base changes: whose scope "waiting" is read for. */
export function lastBaseChangeOrderBySpace(orders: readonly ChangeOrderRead[]): Map<string, PickerChangeOrder> {
  return newestBySpace(orders, isDefaultTemplate);
}

/**
 * Where a row opens the draft: the base, and Base changes when changes wait there while the last
 * ChangeOrder made another kind of change (which the draft would otherwise open on).
 */
export function pickerDraftAddress(row: PickerRow): DraftAddress {
  const address: DraftAddress = { space: row.base.spaceSlug };
  if (row.waiting === 'waiting' && row.last !== undefined && row.last.updateType === 'Invoke') address.kind = DRAFT_KIND_WORDS.baseChanges;
  return address;
}

export type PickerWaiting = 'waiting' | 'level' | 'unknown';

/** Whether a base has changes a variant in scope has not taken. See the file header for what is not guessed. */
export function waitingOf(
  base: DraftBase,
  last: PickerChangeOrder | undefined,
  baseUnitsBySpace: ReadonlyMap<string, readonly PickerBaseUnit[]>,
  variantUnitsBySpace: ReadonlyMap<string, readonly PickerVariantUnit[]>,
): PickerWaiting {
  if (last !== undefined && last.updateType === 'MergeUnits') return 'unknown';
  const variants = new Set(base.variantSpaceIds);
  const scope =
    last === undefined
      ? [...variants]
      : last.inScopeSpaceIds.filter((spaceId) => variants.has(spaceId));
  if (scope.length === 0) return 'unknown';
  const units = (baseUnitsBySpace.get(base.spaceId) ?? []).filter(
    (unit) => unit.headRevisionNum > 0,
  );
  let unknown = false;
  for (const spaceId of scope) {
    const held = variantUnitsBySpace.get(spaceId) ?? [];
    // Cloned from another variant: the base's head says nothing about what it took, so the
    // variant cannot say waiting either way.
    if (
      held.some(
        (unit) => unit.upstreamSpaceId !== undefined && unit.upstreamSpaceId !== base.spaceId,
      )
    ) {
      unknown = true;
      continue;
    }
    const cloneByUnitId = new Map(
      held.flatMap((unit) =>
        unit.upstreamUnitId === undefined ? [] : [[unit.upstreamUnitId, unit] as const],
      ),
    );
    for (const unit of units) {
      const clone = cloneByUnitId.get(unit.unitId);
      if (clone === undefined) return 'waiting';
      if (clone.upstreamRevisionNum === undefined || clone.upstreamRevisionNum <= 0)
        unknown = true;
      else if (clone.upstreamRevisionNum < unit.headRevisionNum) return 'waiting';
    }
  }
  return unknown ? 'unknown' : 'level';
}

/** Units grouped by their Space, built once so each base's check reads only its own variants. */
export function groupBySpace<T extends { spaceId: string }>(
  units: readonly T[],
): ReadonlyMap<string, readonly T[]> {
  const bySpace = new Map<string, T[]>();
  for (const unit of units) {
    const list = bySpace.get(unit.spaceId);
    if (list === undefined) bySpace.set(unit.spaceId, [unit]);
    else list.push(unit);
  }
  return bySpace;
}

/** One row of the picker. */
export interface PickerRow {
  base: DraftBase;
  /** The last ChangeOrder of any kind: what the row names. */
  last: PickerChangeOrder | undefined;
  /** Undefined when the Units could not be read: the picker does not group then. */
  waiting: PickerWaiting | undefined;
}

export interface PickerGroup {
  /** `all` when the rows are not grouped. */
  key: PickerWaiting | 'all';
  rows: PickerRow[];
}

/** The rows a search keeps: by Component name, Component slug or base slug, ignoring case. */
export function matchesQuery(row: PickerRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [row.base.componentName, row.base.componentSlug, row.base.spaceSlug].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

/** Newest last ChangeOrder first, rows with none after them; then by name. */
function byRecency(a: PickerRow, b: PickerRow): number {
  const at = (row: PickerRow) =>
    row.last === undefined ? -Infinity : Date.parse(row.last.createdAt);
  return (
    at(b) - at(a) ||
    a.base.componentName.localeCompare(b.base.componentName) ||
    a.base.spaceSlug.localeCompare(b.base.spaceSlug)
  );
}

const GROUP_ORDER: readonly PickerWaiting[] = ['waiting', 'level', 'unknown'];

/**
 * The rows a search keeps, grouped: changes waiting first, then nothing waiting, then those it
 * could not establish; each group newest ChangeOrder first. One ungrouped list when any row's
 * waiting is unread.
 */
export function pickerGroups(rows: readonly PickerRow[], query: string): PickerGroup[] {
  const kept = rows.filter((row) => matchesQuery(row, query)).sort(byRecency);
  if (kept.some((row) => row.waiting === undefined))
    return kept.length === 0 ? [] : [{ key: 'all', rows: kept }];
  return GROUP_ORDER.map((key) => ({
    key,
    rows: kept.filter((row) => row.waiting === key),
  })).filter((group) => group.rows.length > 0);
}

/** `just now`, `12m ago`, `3h ago`, `5d ago`: how long since, rounded down. */
export function agoText(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const words = draftCopy.page.picker.ago;
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return words.justNow;
  if (minutes < 60) return words.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.hours(hours);
  return words.days(Math.floor(hours / 24));
}

/**
 * The base a "New ChangeOrder" opens directly, when the console is filtered to one: a base
 * Space by its slug, or a Component with exactly one base.
 */
export function baseForFilter(
  bases: readonly DraftBase[],
  filter: { spaceSlug?: string; componentSlug?: string },
): DraftBase | undefined {
  if (filter.spaceSlug !== undefined) {
    const base = bases.find((candidate) => candidate.spaceSlug === filter.spaceSlug);
    if (base !== undefined) return base;
  }
  if (filter.componentSlug !== undefined) {
    const ofComponent = bases.filter(
      (candidate) => candidate.componentSlug === filter.componentSlug,
    );
    if (ofComponent.length === 1) return ofComponent[0];
  }
  return undefined;
}
