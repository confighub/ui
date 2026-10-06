// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Pure logic backing the Components page's left-nav grouping. The tree's
 * leaves are Component entities (`ComponentNavItem`, `componentIndex.ts`),
 * and every grouping level is a property of the Component: one of its own
 * labels (`Labels.Owner` reads the owner rule of `componentOwner.ts`), or a
 * roll-up of its Spaces' status. See `ui/docs/dev/components.md`
 * ("Navigation tree") for the leaf rule, the `?app=` vs `?group=` rule, and
 * how saved levels that name Space fields are read (`normalizeComponentLevels`).
 */

import type { FieldIconKey } from '@/components/query-builder/field-icons';
import type { GroupableCategory, GroupableFieldCatalog } from '@/components/group-nav';
import { EMPTY_GROUP_VALUE } from '@/components/group-nav/groupOrder';
import type { ExtendedSpaceRead } from '@confighub/rtk-query';

import { LABEL_DEPARTMENT, LABEL_OWNER, LABEL_REGION, LABEL_STAGE, LABEL_VARIANT } from './componentData';
import type { ComponentNavItem } from './componentIndex';

// ============================================================================
// CONSTANTS
// ============================================================================

/** The icon key of a Component leaf in the tree. It is not a grouping
 * level: `normalizeComponentLevels` drops it from saved levels, because a
 * Component is always the leaf. */
export const COMPONENT_FIELD = 'Component';

/** The level key of the Component's owner, read with `componentOwner`. */
const OWNER_FIELD = `Labels.${LABEL_OWNER}`;

/** Default grouping for a fresh Components nav, or a Components view with no
 * GroupBy configured: Components grouped by owner. */
export const COMPONENT_DEFAULT_LEVELS = [OWNER_FIELD];

/** `ui.confighub.io/view-kind` annotation value for Components' saved views —
 * see `useQueryBuilder`'s `viewKind` option. */
export const COMPONENTS_VIEW_KIND = 'components';

const LABEL_PREFIX = 'Labels.';
const UPGRADE_NEEDED_FIELD = 'UpgradeNeeded';
const UNRELEASED_CHANGES_FIELD = 'UnreleasedChanges';
const GATED_FIELD = 'Gated';

/** Status roll-up levels: "Yes" when any of the Component's Spaces has a
 * Unit in that state. */
const STATUS_FIELDS: ReadonlySet<string> = new Set([UPGRADE_NEEDED_FIELD, UNRELEASED_CHANGES_FIELD, GATED_FIELD]);

/** `Labels.<key>` levels that are dropped although they look like labels:
 * Variant names one Space of a Component, never the Component. */
const DROPPED_LABEL_KEYS: ReadonlySet<string> = new Set([LABEL_VARIANT]);

const COMPONENT_FIELD_LABELS: Record<string, string> = {
  [UPGRADE_NEEDED_FIELD]: 'Upgrade needed',
  [UNRELEASED_CHANGES_FIELD]: 'Unreleased changes',
  [GATED_FIELD]: 'Gated',
};

const COMPONENT_STATIC_CATEGORIES: GroupableCategory[] = [
  {
    header: 'Status & health',
    fields: [
      { field: UPGRADE_NEEDED_FIELD, label: COMPONENT_FIELD_LABELS[UPGRADE_NEEDED_FIELD] },
      { field: UNRELEASED_CHANGES_FIELD, label: COMPONENT_FIELD_LABELS[UNRELEASED_CHANGES_FIELD] },
      { field: GATED_FIELD, label: COMPONENT_FIELD_LABELS[GATED_FIELD] },
    ],
  },
];

/**
 * The Components page's field catalog, passed to `GroupNavPanel`'s `catalog`
 * prop. The Component's label keys are the dynamic "Labels" section
 * (`getComponentLabelKeys`). Only properties of the Component are offered:
 * a Space property (its Release target, its Variant, any Space label) can
 * differ between the Spaces of one Component, and would put one Component
 * in several places in the tree.
 */
export const COMPONENT_CATALOG: GroupableFieldCatalog = {
  staticCategories: COMPONENT_STATIC_CATEGORIES,
  fieldLabels: COMPONENT_FIELD_LABELS,
};

/**
 * Icon overrides for label keys the user has singled out as special
 * enough to deserve their own icon, keyed by the plain label name (not the
 * `Labels.<key>` field key) — a small, self-contained map so a later
 * icon-selector UI can replace individual entries without touching anything
 * else here. Every other label key keeps the generic `labels` icon
 * (`getChipIcon`'s fallback).
 */
const SPECIAL_LABEL_ICONS: Partial<Record<string, FieldIconKey>> = {
  [LABEL_OWNER]: 'owner',
  [LABEL_STAGE]: 'stage',
  [LABEL_REGION]: 'region',
  [LABEL_DEPARTMENT]: 'department',
};

/** Icon overrides for the Components catalog's non-label fields and the
 * Component leaf, plus the special label keys (`SPECIAL_LABEL_ICONS`)
 * re-keyed to their full `Labels.<key>` field form — the shape
 * `getChipIcon` actually looks up. */
export const COMPONENT_ICON_MAP: Partial<Record<string, FieldIconKey>> = {
  [COMPONENT_FIELD]: 'component',
  [UPGRADE_NEEDED_FIELD]: 'upgradeNeeded',
  [UNRELEASED_CHANGES_FIELD]: 'unreleasedChanges',
  // "Gated" is a locked term in this feature (node status); reuse the
  // check-style icon already in the Unit catalog's icon set.
  [GATED_FIELD]: 'checkResult',
  ...Object.fromEntries(
    Object.entries(SPECIAL_LABEL_ICONS).map(([label, icon]) => [`${LABEL_PREFIX}${label}`, icon]),
  ),
};

// ============================================================================
// SAVED LEVELS
// ============================================================================

function isComponentLevel(level: string): boolean {
  if (STATUS_FIELDS.has(level)) return true;
  if (!level.startsWith(LABEL_PREFIX)) return false;
  const key = level.slice(LABEL_PREFIX.length);
  return key !== '' && !DROPPED_LABEL_KEYS.has(key);
}

/**
 * Reads saved grouping levels (a saved view's annotation, a `?viewGroupBy=`
 * link) as Component levels. They can name Space fields, which would put one
 * Component in several places in the tree:
 *
 * - `Labels.Owner` stays, and reads the Component's owner.
 * - Every other `Labels.<key>` stays, and reads the Component's own label.
 * - The status levels stay, as roll-ups of the Component's Spaces.
 * - `Component` (the leaf), `ReleaseTarget` and `Labels.Variant` (Space
 *   properties), and any other key (for example `Space`) are dropped.
 * - A repeated level is kept once, at its first position.
 *
 * The result can be empty (a view grouped only by `Component`): the tree
 * then lists the Components with no group above them.
 */
export function normalizeComponentLevels(levels: readonly string[]): string[] {
  const out: string[] = [];
  for (const level of levels) {
    if (isComponentLevel(level) && !out.includes(level)) out.push(level);
  }
  return out;
}

// ============================================================================
// VALUE GETTER
// ============================================================================

export interface ComponentGroupValueContext {
  /**
   * True once the summary (`summary=true`) Spaces query has resolved at least
   * once. The status levels are roll-ups of summary-only counts — reading
   * them before this is true would show a false "No" rather than "not loaded
   * yet", so callers get `''` (renders `(empty)`) instead.
   */
  isSummaryLoaded: boolean;
}

function rollUp(item: ComponentNavItem, count: (space: ExtendedSpaceRead) => number | undefined): string {
  const total = item.spaces.reduce((sum, space) => sum + (count(space) ?? 0), 0);
  return total > 0 ? 'Yes' : 'No';
}

/**
 * The value of a grouping level for one Component. `Labels.Owner` is the
 * owner rule's result; any other `Labels.<key>` is the Component's own label;
 * a status level is "Yes" when the sum of that count over the Component's
 * Spaces is above zero (the same sums as `buildOverviewData`). `''` means no
 * value, shown as `(empty)`.
 */
export function getComponentGroupValue(
  item: ComponentNavItem,
  column: string,
  ctx: ComponentGroupValueContext,
): string {
  switch (column) {
    case OWNER_FIELD:
      return item.owner;
    case UPGRADE_NEEDED_FIELD:
      return ctx.isSummaryLoaded ? rollUp(item, (s) => s.UpgradableUnitCount) : '';
    case UNRELEASED_CHANGES_FIELD:
      return ctx.isSummaryLoaded ? rollUp(item, (s) => s.UnreleasedUnitCount) : '';
    case GATED_FIELD:
      return ctx.isSummaryLoaded ? rollUp(item, (s) => s.GatedUnitCount) : '';
    default:
      if (column.startsWith(LABEL_PREFIX)) {
        return item.labels[column.slice(LABEL_PREFIX.length)] ?? '';
      }
      return '';
  }
}

// ============================================================================
// LABEL KEY DISCOVERY
// ============================================================================

/** Label keys the picker offers: every Component label key, plus `Owner`
 * always (its value can come from the Spaces when the Component has no label
 * of its own), less the dropped keys. Sorted. */
export function getComponentLabelKeys(items: readonly ComponentNavItem[]): string[] {
  const set = new Set<string>([LABEL_OWNER]);
  for (const item of items) {
    for (const key of Object.keys(item.labels)) {
      if (!DROPPED_LABEL_KEYS.has(key)) set.add(key);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Per-label-key Component counts, for the picker's count badges: the
 * Components with a value for that level. */
export function getComponentLabelKeyCounts(items: readonly ComponentNavItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item.labels)) {
      if (key !== LABEL_OWNER && value && !DROPPED_LABEL_KEYS.has(key)) counts[key] = (counts[key] ?? 0) + 1;
    }
    if (item.owner) counts[LABEL_OWNER] = (counts[LABEL_OWNER] ?? 0) + 1;
  }
  return counts;
}

// ============================================================================
// SELECTION / DEEP-LINK RULES
// ============================================================================

/**
 * Narrows `items` to the Components under a group node's value path — the
 * same bucketing `GroupNavPanel`'s own tree build uses. An empty `path`
 * (Overview) returns `items` unchanged. A path longer than `levels` matches
 * nothing.
 */
export function filterComponentsByGroupPath(
  items: ComponentNavItem[],
  levels: readonly string[],
  path: readonly string[],
  ctx: ComponentGroupValueContext,
): ComponentNavItem[] {
  if (path.length === 0) return items;
  return items.filter((item) =>
    path.every(
      (value, i) => i < levels.length && (getComponentGroupValue(item, levels[i], ctx) || EMPTY_GROUP_VALUE) === value,
    ),
  );
}

/** Every Space of `items`, in item order. */
export function spacesOfComponents(items: readonly ComponentNavItem[]): ExtendedSpaceRead[] {
  return items.flatMap((item) => item.spaces);
}

/**
 * A node click opens a graph. This resolves which URL form it writes:
 *
 * - A leaf (one level below the last grouping level) is one Component:
 *   `?app=<slug>`, the whole Component.
 * - A group node that holds exactly one Component also writes `?app=`: it
 *   holds all of that Component, so the click cannot be told apart from a
 *   click on the Component itself.
 * - Any other group node writes `?group=<path>`: a graph of every Space of
 *   every Component under it.
 */
export function resolveNodeGraphTarget(
  items: ComponentNavItem[],
  levels: readonly string[],
  path: string[],
  ctx: ComponentGroupValueContext,
): { app: string } | { group: string[] } {
  if (path.length === levels.length + 1) return { app: path[path.length - 1] };
  const bucket = filterComponentsByGroupPath(items, levels, path, ctx);
  if (bucket.length === 1) return { app: bucket[0].slug };
  return { group: path };
}

/**
 * The Slug of the Component the URL opens: `?app=`, else the last value of a
 * `?group=` path one longer than `levels`. That path names a leaf, which is
 * one Component (`resolveNodeGraphTarget`), so it opens the Component as
 * `?app=` does. `null` when the URL opens no Component.
 */
export function resolveOpenComponentSlug(
  levels: readonly string[],
  appParam: string | null,
  groupParam: readonly string[],
): string | null {
  if (appParam) return appParam;
  if (groupParam.length === levels.length + 1) return groupParam[groupParam.length - 1];
  return null;
}

/**
 * The tree path to highlight. With a Component open (`appSlug`, from
 * `resolveOpenComponentSlug`), the path of its leaf: its value at each
 * level, then its Slug. A Component is in exactly one place in the tree, so
 * this path is the only one. `null` (nothing highlighted) when that
 * Component is not in `items`. With no Component open, `groupParam` when a
 * Component is under it (`[]` selects Overview), else `null`: a path that
 * holds no Component has no node to highlight.
 */
export function deriveComponentTreePath(
  levels: readonly string[],
  appSlug: string | null,
  groupParam: string[],
  items: ComponentNavItem[],
  ctx: ComponentGroupValueContext,
): string[] | null {
  if (!appSlug) {
    if (groupParam.length === 0) return groupParam;
    return filterComponentsByGroupPath(items, levels, groupParam, ctx).length > 0 ? groupParam : null;
  }
  const item = items.find((i) => i.slug === appSlug);
  if (!item) return null;
  return [...levels.map((level) => getComponentGroupValue(item, level, ctx) || EMPTY_GROUP_VALUE), item.slug];
}

// ============================================================================
// ID BATCHING (avoid a `where=X IN (...)` GET query string past URL limits)
// ============================================================================

/** Max IDs per `IN (...)` batch. The backend rejects a GET query string over
 * 8192 bytes; at ~39 bytes per UUID (quoted + comma), 50 IDs is comfortably
 * under that even alongside the rest of a `where` clause. */
export const ID_BATCH_SIZE = 50;

/**
 * Splits `ids` into `ID_BATCH_SIZE`-sized chunks for a batched `X IN (...)`
 * query, deduplicating first so a Space referenced by several Deployments
 * (or a Unit with several downstream consumers) isn't fetched twice. Callers
 * run one request per chunk and merge the results — this only decides the
 * chunking, it makes no request itself (kept pure for `component-nav-fields.pure.spec.ts`).
 */
export function batchIds(ids: Iterable<string>, batchSize: number = ID_BATCH_SIZE): string[][] {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return [];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += batchSize) {
    batches.push(unique.slice(i, i + batchSize));
  }
  return batches;
}
