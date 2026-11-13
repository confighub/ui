// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The labels and gates a bulk edit sets on, or removes from, every selected entity.
 *
 * The edit is shown as rows, as the form of one entity shows its map: a row for each key the
 * selected entities have, and a row for each key the user adds. A row the user removes removes
 * its key from every entity; a row whose key or value the user changes sets it on every entity;
 * a row of a key only some entities have, which the user marks for all, sets it on every entity;
 * a row left as it was leaves each entity's key as it is. A key is never put on the entities
 * without it unasked, since that would happen whenever the user changed some other key.
 *
 * A bulk patch is a JSON merge patch, so a key set in a map is added or changed on each entity,
 * a key set to null is removed from each, and a key the patch leaves out keeps whatever each
 * entity has.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */

/** The map-valued fields of an entity a bulk edit can change. */
export type BulkMapField = 'Labels' | 'DeleteGates' | 'DestroyGates';

/** How the selected entities use one key of a map field. */
export interface KeyUsage {
  key: string;
  /** How many of the entities have the key. */
  count: number;
  /** The distinct values the entities give it, sorted. */
  values: string[];
}

/** The keys the entities' maps have, sorted, with how many have each and with what values. */
export const keyUsage = (
  maps: ReadonlyArray<Record<string, unknown> | null | undefined>,
): KeyUsage[] => {
  const byKey = new Map<string, { count: number; values: Set<string> }>();
  for (const map of maps) {
    for (const [key, value] of Object.entries(map ?? {})) {
      const usage = byKey.get(key) ?? { count: 0, values: new Set<string>() };
      usage.count += 1;
      usage.values.add(String(value));
      byKey.set(key, usage);
    }
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { count, values }]) => ({ key, count, values: [...values].sort() }));
};

/** One row of a bulk edit of a map field. */
export interface BulkRow {
  id: string;
  key: string;
  /** A label's value. Empty on a row of a label the entities give different values. */
  value: string;
  /** The key the selected entities have, for a row that shows one; absent on an added row. */
  existing?: KeyUsage;
  /** For a row of a key only some entities have: set it on every entity, not only on those. */
  toAll?: boolean;
}

/** The value a row of an existing key starts with: the one value the entities share, if they do. */
export const sharedValue = (usage: KeyUsage): string =>
  usage.values.length === 1 ? usage.values[0] : '';

/** The rows of a field as the selected entities have it: one per key. */
export const usageToRows = (usage: ReadonlyArray<KeyUsage>, isLabel: boolean): BulkRow[] =>
  usage.map((u) => ({
    id: `existing-${u.key}`,
    key: u.key,
    value: isLabel ? sharedValue(u) : 'true',
    existing: u,
  }));

/**
 * Whether a row of a label may keep an empty value: a row of a label the entities give
 * different values, under its own key, leaves each entity's value as it is.
 */
export const keepsEachValue = (row: BulkRow): boolean =>
  !!row.existing &&
  !row.toAll &&
  row.existing.values.length > 1 &&
  row.key.trim() === row.existing.key;

/** What a bulk edit does to one map field of every selected entity. */
export interface MapFieldEdit {
  /** The keys to add or change, with the value each gets. A gate's value is always "true". */
  set: Record<string, string>;
  /** The keys to remove. */
  remove: string[];
}

/**
 * What the rows do to the field, given the keys the selected entities have. A row with no key
 * is blank and ignored. A key both removed and set, as when a row is renamed to a key another
 * row had, is set.
 */
export const rowsToFieldEdit = (
  usage: ReadonlyArray<KeyUsage>,
  rows: ReadonlyArray<BulkRow>,
  isLabel: boolean,
): MapFieldEdit => {
  const set: Record<string, string> = {};
  const kept = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (row.existing && key === row.existing.key) {
      kept.add(key);
      if (row.toAll) {
        set[key] = isLabel ? row.value : 'true';
      } else if (isLabel && row.value !== '' && row.value !== sharedValue(row.existing)) {
        // An existing key is otherwise set only when its value changed: a gate has none to change.
        set[key] = row.value;
      }
    } else {
      set[key] = isLabel ? row.value : 'true';
    }
  }
  const remove = usage.map((u) => u.key).filter((key) => !kept.has(key) && !(key in set));
  return { set, remove };
};

export const isMapFieldEditEmpty = (edit: MapFieldEdit): boolean =>
  Object.keys(edit.set).length === 0 && edit.remove.length === 0;

/** What a bulk edit does to each field it can change. */
export type BulkMetadataEdit = Partial<Record<BulkMapField, MapFieldEdit>>;

export const isBulkMetadataEditEmpty = (edit: BulkMetadataEdit): boolean =>
  Object.values(edit).every((fieldEdit) => !fieldEdit || isMapFieldEditEmpty(fieldEdit));

/** The fields of a bulk patch that a BulkMetadataEdit writes. */
export interface BulkMetadataPatch {
  Labels?: Record<string, string | null>;
  DeleteGates?: Record<string, boolean | null>;
  DestroyGates?: Record<string, boolean | null>;
}

const removals = (edit: MapFieldEdit): Record<string, null> =>
  Object.fromEntries(edit.remove.map((key) => [key, null]));

/**
 * The merge patch of the edit: each field it changes, with the keys it sets and null for the
 * keys it removes. Labels get their values; gates get true. Fields it leaves alone are absent.
 */
export const bulkMetadataPatch = (edit: BulkMetadataEdit): BulkMetadataPatch => {
  const patch: BulkMetadataPatch = {};
  if (edit.Labels && !isMapFieldEditEmpty(edit.Labels)) {
    patch.Labels = { ...edit.Labels.set, ...removals(edit.Labels) };
  }
  for (const field of ['DeleteGates', 'DestroyGates'] as const) {
    const fieldEdit = edit[field];
    if (!fieldEdit || isMapFieldEditEmpty(fieldEdit)) continue;
    patch[field] = {
      ...Object.fromEntries(Object.keys(fieldEdit.set).map((key) => [key, true])),
      ...removals(fieldEdit),
    };
  }
  return patch;
};
