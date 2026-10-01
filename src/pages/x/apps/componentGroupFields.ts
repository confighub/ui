// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Pure logic backing the Components page's left-nav grouping — the Space
 * analogue of `@/components/group-nav/groupable-fields.ts`'s Unit catalog.
 * See `ui/docs/dev/components.md` ("Navigation tree: node click opens a
 * graph") for the terms this file implements: Component field, node graph
 * vs. Component graph, the `?app=` vs `?group=` rule, and the dropped-field
 * list with reasons.
 */

import type { FieldIconKey } from '@/components/query-builder/field-icons';
import type { GroupableCategory, GroupableFieldCatalog } from '@/components/group-nav';
import type { ExtendedSpaceRead, ExtendedTargetRead } from '@confighub/rtk-query';

import { LABEL_DEPARTMENT, LABEL_OWNER, LABEL_REGION, LABEL_STAGE } from './componentData';

// ============================================================================
// CONSTANTS
// ============================================================================

/** The group-by level key for a Space's Component — the Slug of the
 * Component its `ComponentID` names (`spaceComponentSlug`), not a label. It
 * is an ordinary, removable, movable field like any other —
 * `resolveNodeGraphTarget` decides whether a node's click resolves to a whole
 * Component (`?app=`) from its own bucketed Space set, never from this
 * field's position in `levels`. */
export const COMPONENT_FIELD = 'Component';

/** Default grouping for a fresh Components nav / a Components view with no
 * GroupBy configured — the same tree shape the page always showed. */
export const COMPONENT_DEFAULT_LEVELS = [`Labels.${LABEL_OWNER}`, COMPONENT_FIELD];

/** `ui.confighub.io/view-kind` annotation value for Components' saved views —
 * see `useQueryBuilder`'s `viewKind` option. */
export const COMPONENTS_VIEW_KIND = 'components';

/** Non-label static fields offered by the Components field picker. */
const RELEASE_TARGET_FIELD = 'ReleaseTarget';
const UPGRADE_NEEDED_FIELD = 'UpgradeNeeded';
const UNRELEASED_CHANGES_FIELD = 'UnreleasedChanges';
const GATED_FIELD = 'Gated';

const COMPONENT_FIELD_LABELS: Record<string, string> = {
  [COMPONENT_FIELD]: 'Component',
  // Internal key stays `ReleaseTarget` (Space.ReleaseTargetID) — a saved
  // view's GroupBy annotation or a `?group=` deep link stores this key, so
  // renaming it would break existing links/views. Only the user-facing label
  // changes, to "Target": what this page's users mean by "grouping by
  // Target" is a Space's Release target (its default Target for every Unit
  // in it), not any of its Units' individual TargetIDs.
  [RELEASE_TARGET_FIELD]: 'Target',
  [UPGRADE_NEEDED_FIELD]: 'Upgrade needed',
  [UNRELEASED_CHANGES_FIELD]: 'Unreleased changes',
  [GATED_FIELD]: 'Gated',
};

const COMPONENT_STATIC_CATEGORIES: GroupableCategory[] = [
  {
    header: 'Component',
    fields: [{ field: COMPONENT_FIELD, label: COMPONENT_FIELD_LABELS[COMPONENT_FIELD] }],
  },
  {
    header: 'Release',
    fields: [{ field: RELEASE_TARGET_FIELD, label: COMPONENT_FIELD_LABELS[RELEASE_TARGET_FIELD] }],
  },
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
 * prop. Dropped fields (with reasons, so nobody re-adds them without Units
 * loaded in the nav): `Slug`/`SpaceID`/`DisplayName` (unique per Space — one
 * bucket per Space), `CreatedAt`/`UpdatedAt` (near-unique timestamps),
 * `Base vs Deployment` (derived from Units' targets in `componentData.ts`,
 * not from the Space — the nav has no Units loaded), toolchain
 * (`TargetCountByToolchainType` is multi-valued per Space; group-nav is one
 * value per item), `Annotations` (machine metadata, e.g. live status JSON),
 * `OrganizationID`/`EntityType`/`Version`/`Permissions`/`DeleteGates`/
 * `Attribute*`/`Trigger*`/`Where*` (constant or internal config).
 */
export const COMPONENT_CATALOG: GroupableFieldCatalog = {
  staticCategories: COMPONENT_STATIC_CATEGORIES,
  fieldLabels: COMPONENT_FIELD_LABELS,
};

/**
 * Icon overrides for Space label keys the user has singled out as special
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

/** Icon overrides for the Components catalog's non-label fields, plus the
 * special label keys (`SPECIAL_LABEL_ICONS`) re-keyed to their full
 * `Labels.<key>` field form — the shape `getChipIcon` actually looks up. */
export const COMPONENT_ICON_MAP: Partial<Record<string, FieldIconKey>> = {
  [COMPONENT_FIELD]: 'component',
  [RELEASE_TARGET_FIELD]: 'target',
  [UPGRADE_NEEDED_FIELD]: 'upgradeNeeded',
  [UNRELEASED_CHANGES_FIELD]: 'unreleasedChanges',
  // "Gated" is a locked term in this feature (node status); reuse the
  // check-style icon already in the Unit catalog's icon set.
  [GATED_FIELD]: 'checkResult',
  ...Object.fromEntries(
    Object.entries(SPECIAL_LABEL_ICONS).map(([label, icon]) => [`Labels.${label}`, icon]),
  ),
};

// ============================================================================
// VALUE GETTER
// ============================================================================

/** The Slug of the Component a Space belongs to — the same lookup as
 * `spaceComponentSlug` (`@/hooks/useComponentSlugs`), repeated here so this
 * file stays importable from a `.pure.spec.ts` in Node without loading that
 * module's React/RTK Query hook. */
function componentSlugOf(space: ExtendedSpaceRead, slugById: ReadonlyMap<string, string>): string | undefined {
  const componentId = space.Space?.ComponentID;
  return componentId ? slugById.get(componentId) : undefined;
}

export interface SpaceGroupValueContext {
  /** Component Slug by ComponentID (`useComponentSlugs().slugById`), for the
   * `Component` field. */
  slugById: ReadonlyMap<string, string>;
  /** Target slug by TargetID, for the `ReleaseTarget` field when the Space's
   * own `ReleaseTarget` relation wasn't expanded by the query. */
  targetSlugById: Map<string, string>;
  /**
   * True once the summary (`summary=true`) Spaces query has resolved at least
   * once. `UpgradeNeeded` / `UnreleasedChanges` / `Gated` are summary-only
   * fields — reading them before this is true would show a false "No" rather
   * than "not loaded yet", so callers get `''` (renders `(empty)`) instead.
   */
  isSummaryLoaded: boolean;
}

/** Builds `{targetId: slug}` from the page's Targets list, for `getSpaceGroupValue`'s
 * `ReleaseTarget` fallback path. */
export function buildTargetSlugById(targets: ExtendedTargetRead[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of targets) {
    const id = t.Target?.TargetID;
    const slug = t.Target?.Slug;
    if (id && slug) map.set(id, slug);
  }
  return map;
}

/**
 * Extract a display value for a groupable column from an `ExtendedSpaceRead`
 * — the Space analogue of `@/components/group-nav/utils.ts`'s `getCellValue`.
 */
export function getSpaceGroupValue(
  space: ExtendedSpaceRead,
  column: string,
  ctx: SpaceGroupValueContext,
): string {
  switch (column) {
    case COMPONENT_FIELD:
      return componentSlugOf(space, ctx.slugById) ?? '';
    case RELEASE_TARGET_FIELD: {
      const slug = space.ReleaseTarget?.Slug;
      if (slug) return slug;
      const targetId = space.Space?.ReleaseTargetID;
      return targetId ? (ctx.targetSlugById.get(targetId) ?? '') : '';
    }
    case UPGRADE_NEEDED_FIELD:
      if (!ctx.isSummaryLoaded) return '';
      return (space.UpgradableUnitCount ?? 0) > 0 ? 'Yes' : 'No';
    case UNRELEASED_CHANGES_FIELD:
      if (!ctx.isSummaryLoaded) return '';
      return (space.UnreleasedUnitCount ?? 0) > 0 ? 'Yes' : 'No';
    case GATED_FIELD:
      if (!ctx.isSummaryLoaded) return '';
      return (space.GatedUnitCount ?? 0) > 0 ? 'Yes' : 'No';
    default:
      if (column.startsWith('Labels.')) {
        const key = column.slice('Labels.'.length);
        return space.Space?.Labels?.[key] ?? '';
      }
      return '';
  }
}

// ============================================================================
// LABEL KEY DISCOVERY
// ============================================================================

/** Distinct Space label keys present across `spaces`, sorted. Feeds the
 * dynamic "Labels" category (Owner/Variant/env/team/region…) —
 * Components has no separate "Space Labels" submenu since its own labels
 * ARE the Space labels. */
export function getSpaceLabelKeys(spaces: ExtendedSpaceRead[]): string[] {
  const set = new Set<string>();
  for (const s of spaces) {
    for (const key of Object.keys(s.Space?.Labels ?? {})) set.add(key);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Per-label-key Space counts, for the picker's right-aligned count badges. */
export function getSpaceLabelKeyCounts(spaces: ExtendedSpaceRead[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of spaces) {
    for (const [key, value] of Object.entries(s.Space?.Labels ?? {})) {
      if (value) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

// ============================================================================
// SELECTION / DEEP-LINK RULES
// ============================================================================

/** True when the Component field is the LAST configured level. Used only by
 * `deriveComponentTreePath` below, not exported further. */
function levelsEndInComponent(levels: string[]): boolean {
  const idx = levels.indexOf(COMPONENT_FIELD);
  return idx !== -1 && idx === levels.length - 1;
}

/**
 * Narrows `spaces` to those matching a group-node's value path — the same
 * bucketing `GroupNavPanel`'s own tree build uses, applied directly for the
 * overview matrix and for a node graph's Space set. An empty `path`
 * (Overview, unnarrowed) returns `spaces` unchanged.
 */
export function filterSpacesByGroupPath(
  spaces: ExtendedSpaceRead[],
  levels: string[],
  path: string[],
  ctx: SpaceGroupValueContext,
): ExtendedSpaceRead[] {
  if (path.length === 0) return spaces;
  return spaces.filter((space) =>
    path.every((value, i) => i < levels.length && (getSpaceGroupValue(space, levels[i], ctx) || '(empty)') === value),
  );
}

/**
 * A node click opens the graph of every Space under it. This resolves WHICH
 * kind of graph that is, for the URL (see `components.md`, "Node click opens
 * a graph"): when the node's own bucket — recomputed against `appSpaces` —
 * is exactly all Spaces of one Component, the click is indistinguishable
 * from opening that whole Component, so it writes `?app=<name>` (every
 * `?app=` deep link, tour, and overview-tile click reads this same way).
 * Anything else — a bucket spanning several
 * Components, or a strict subset of one — writes `?group=<path>` instead.
 *
 * This is a single, field-position-agnostic rule: a Component-field node
 * still resolves to `{app}` even in the middle of `levels` (e.g.
 * Owner → Component → Variant), as long as every Deployment of that
 * Component happens to share the bucket's other field values; a Variant
 * node one level below it resolves to `{group}` because its bucket is a
 * strict subset (one Deployment, not the whole Component).
 */
export function resolveNodeGraphTarget(
  appSpaces: ExtendedSpaceRead[],
  levels: string[],
  path: string[],
  ctx: SpaceGroupValueContext,
): { app: string } | { group: string[] } {
  const bucket = filterSpacesByGroupPath(appSpaces, levels, path, ctx);
  const componentOf = (s: ExtendedSpaceRead) => componentSlugOf(s, ctx.slugById);
  const firstComponent = bucket[0] ? componentOf(bucket[0]) : undefined;
  if (firstComponent && bucket.every((s) => componentOf(s) === firstComponent)) {
    const wholeComponentCount = appSpaces.filter((s) => componentOf(s) === firstComponent).length;
    if (wholeComponentCount === bucket.length) {
      return { app: firstComponent };
    }
  }
  return { group: path };
}

/**
 * Resolves the tree path that should be highlighted, reconciling an open
 * Component graph (`appName`, from `?app=`) with the `?group=` path — that
 * SAME param also selects and opens a non-Component node graph, so this
 * only has extra work to do while a `?app=` graph is open:
 *
 * - No Component open: the tree highlight is exactly `groupParam` (`[]`
 *   selects Overview; a non-empty path also IS the open group graph).
 * - Component open, levels end in Component: use `groupParam` when it is
 *   present and its last element is the open Component's name, so the exact
 *   path the user clicked through stays highlighted; otherwise derive the
 *   path from the FIRST Space in that Component, since there
 *   is no click to preserve (e.g. the Component was opened via `?app=`).
 * - Component open, levels do NOT end in Component: search for a node (at
 *   the Component field's depth, if `levels` has one) whose own bucket
 *   resolves to this exact Component (`resolveNodeGraphTarget`); highlight
 *   it if found. No Component field in `levels`, or no such node — select
 *   nothing (`null`): highlighting an unrelated node while the graph shows
 *   would claim something that isn't there.
 */
export function deriveComponentTreePath(
  levels: string[],
  appName: string | null,
  groupParam: string[],
  appSpaces: ExtendedSpaceRead[],
  ctx: SpaceGroupValueContext,
): string[] | null {
  if (!appName) return groupParam;
  if (levelsEndInComponent(levels)) {
    if (groupParam.length > 0 && groupParam[groupParam.length - 1] === appName) {
      return groupParam;
    }
    const firstSpace = appSpaces.find((s) => componentSlugOf(s, ctx.slugById) === appName);
    if (!firstSpace) return null;
    return levels.map((level) => getSpaceGroupValue(firstSpace, level, ctx) || '(empty)');
  }
  const componentIdx = levels.indexOf(COMPONENT_FIELD);
  if (componentIdx === -1) return null;
  const firstSpace = appSpaces.find((s) => componentSlugOf(s, ctx.slugById) === appName);
  if (!firstSpace) return null;
  const candidatePath = levels
    .slice(0, componentIdx + 1)
    .map((level) => getSpaceGroupValue(firstSpace, level, ctx) || '(empty)');
  const target = resolveNodeGraphTarget(appSpaces, levels, candidatePath, ctx);
  return 'app' in target && target.app === appName ? candidatePath : null;
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
