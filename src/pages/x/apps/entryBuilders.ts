// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ExtendedUnitRead, MutationConflict } from '@confighub/rtk-query';

import { parseUnitData, parseUnitDataStructured, type FieldEntry } from './configParser';
import type { ApplyEntryWithGates, FieldDiff, MergedUnit, UpgradeEntry, VariationEntry } from './componentTypes';

// ============================================================================
// LOGICAL CHANGE COUNTING
// ============================================================================

/**
 * Collapse a flattened leaf path to its "logical change" group key.
 *
 * Paths use DOT-INDEX notation from `flattenObject` (e.g. `env.0.name`,
 * `spec.containers.2.image`) — array elements are a numeric segment between dots
 * (or at the end). A wholly-added/removed/modified array ELEMENT (an env var, a
 * container, a port, a volume) spans several leaf paths but is ONE logical
 * change, so we group all leaves by their nearest array-element ancestor: the
 * prefix up to and INCLUDING the first numeric index segment.
 *
 * Examples:
 *   env.0.name                  → env.0
 *   env.0.value                 → env.0          (same group as above)
 *   spec.containers.2.image     → spec.containers.2
 *   spec.containers.2.ports.0.containerPort → spec.containers.2  (first index wins)
 *   replicas                    → replicas       (no index → its own group)
 *   resources.limits.cpu        → resources.limits.cpu  (no index → its own group)
 */
export function logicalChangeKey(path: string): string {
  const segments = path.split('.');
  for (let i = 0; i < segments.length; i++) {
    // A numeric segment denotes an array index. Group at the first one so an
    // entire array element (and any nested arrays beneath it) counts once.
    if (/^\d+$/.test(segments[i])) {
      return segments.slice(0, i + 1).join('.');
    }
  }
  return path;
}

/**
 * Count LOGICAL changes across a set of flattened leaf paths: leaves that belong
 * to the same array element collapse to one (see {@link logicalChangeKey}), while
 * scalar paths with no array-index ancestor each count individually.
 *
 * Worked examples:
 *   ['env.0.name', 'env.0.value']                         → 1 (one added env var)
 *   ['replicas']                                          → 1
 *   ['resources.limits.cpu', 'resources.limits.memory']   → 2 (two distinct scalars)
 *   five leaves under containers.0.* (a new container)    → 1
 */
export function countLogicalChanges(paths: Iterable<string>): number {
  const groups = new Set<string>();
  for (const p of paths) groups.add(logicalChangeKey(p));
  return groups.size;
}

/**
 * Count the upstream changes a unit contributes to the "Upgradable · N" badge.
 * Excludes paths the unit overrides with a local value (variation). Brand-new
 * upstream-only paths (present upstream, absent downstream) ARE counted, since
 * promoting would add them — matching `hasRealUpgrade` and the "upgradable"
 * filter view so the badge count and the rows shown stay consistent.
 *
 * Counts LOGICAL changes (via `countLogicalChanges`), not raw leaf paths: a
 * wholly-added array element (e.g. one env var = name+value, a new container =
 * many leaves) counts as ONE. This keeps the badge, the footer "Upgrade [N]"
 * chip, and "Select all (N)" all showing the same logical number.
 *
 * Shared between `ComponentSidePane` (auto mode) and rollout mode's toolbar —
 * the two must never carry independent copies of this predicate (rule 4).
 */
export function countUpgradableBadgeFields(unit: MergedUnit): number {
  if (!unit.upgradeEntry) return 0;
  const overriddenPaths = new Set(unit.variationEntry?.fieldDiffs.map((d) => d.path) ?? []);
  // Includes upstream removals (newValue '-' or ''): a removed path is a real
  // upgrade change and is shown (struck-through) in the upgradable view.
  // Also counts blocked upstream deletions (swallowed by SubtractMutations) so
  // the badge reflects those opt-in upgrades too. This is the SAME path set
  // "Select all" stages, so the count matches what gets staged.
  const paths = [
    ...unit.upgradeEntry.fieldDiffs.filter((d) => !overriddenPaths.has(d.path)).map((d) => d.path),
    ...(unit.upgradeEntry.blockedDeletePaths ?? []),
  ];
  return countLogicalChanges(paths);
}

/**
 * Whether "Upgrade" would ACTUALLY change this unit. A unit is changed if it has
 * any upstream field change that is NOT blocked by a local value override
 * (`variationEntry.fieldDiffs`). This INCLUDES brand-new upstream paths that
 * don't yet exist downstream — they are real upgrades. The only thing that makes
 * an upstream field "not changing" is a local value set on that path. Derived
 * from `countUpgradableBadgeFields` so the dim/badge logic can never diverge.
 */
export function hasRealUpgrade(unit: MergedUnit): boolean {
  return countUpgradableBadgeFields(unit) > 0;
}

// ============================================================================
// DIFF COMPUTATION
// ============================================================================

/**
 * Compute field-level diffs between two units' configurations.
 * Handles format detection internally via parseUnitData.
 */
export function computeFieldDiffs(oldData: string | undefined, newData: string | undefined): FieldDiff[] {
  const oldMap = parseUnitData(oldData);
  const newMap = parseUnitData(newData);
  const diffs: FieldDiff[] = [];

  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);

  for (const path of allKeys) {
    const oldVal = oldMap.get(path);
    const newVal = newMap.get(path);

    if (oldVal !== newVal) {
      diffs.push({
        path,
        oldValue: oldVal ?? '-',
        newValue: newVal ?? '-',
      });
    }
  }

  return diffs;
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

/**
 * Content-addressed LRU over raw Data strings.
 *
 * Deliberately a LOCAL copy of the same shape as `makeParseCache` in
 * configParser.ts rather than a shared helper: that cache belongs to the parser
 * and is sized for parse results, this one memoizes a derived projection. Keeping
 * them independent means neither can evict the other's entries.
 */
const DATA_CACHE_MAX = 50;

function makeDataCache<T>(compute: (data: string) => T): (data: string | undefined) => T {
  const cache = new Map<string, T>();
  const empty = compute('');
  return (data: string | undefined): T => {
    if (!data) return empty;
    const hit = cache.get(data);
    if (hit !== undefined) {
      // Refresh recency: re-insert so it moves to the most-recent position.
      cache.delete(data);
      cache.set(data, hit);
      return hit;
    }
    const value = compute(data);
    cache.set(data, value);
    if (cache.size > DATA_CACHE_MAX) {
      // Evict the least-recently-used entry (first key in insertion order).
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return value;
  };
}

/**
 * Parse unit data and return path/value pairs in document order.
 *
 * Memoized on the raw Data string, so the same Data yields the SAME array
 * REFERENCE. That identity is load-bearing, not just a speed-up: an RTK poll
 * rebuilds every upgrade/apply/variation entry object even when nothing changed,
 * and a fresh `allPaths` array would invalidate the whole derived chain in
 * ComponentValuesSection (tree → prefixIndex → filteredPaths → changedDiffs →
 * downstreamValueByPath) on every poll.
 *
 * The returned array is READ-ONLY — callers must not mutate it (it is shared
 * across calls), same contract as `parseUnitData`'s map.
 */
export const buildPaths: (data: string | undefined) => { path: string; value: string }[] =
  makeDataCache((data) =>
    Array.from(parseUnitData(data).entries()).map(([path, value]) => ({ path, value })),
  );

/**
 * Parse unit data into per-document leaves, tagged with their source document's
 * resource identity — the TREE-SHAPE source for {@link buildResourceGroupedTree}.
 *
 * Deliberately distinct from {@link buildPaths}: `buildPaths` deduplicates via a
 * Map keyed on the bare dot-path (so a path present in several documents survives
 * only once, last-write-wins), which is exactly what makes multi-document units
 * render as one merged tree. This returns the RAW, non-deduplicated leaves, so a
 * path that appears in two documents appears twice — once per document.
 *
 * This changes tree SHAPE only. Every leaf keeps its BARE dot-path, so the
 * path namespace that diff/override/staging logic is keyed on is untouched.
 */
export function buildGroupedPaths(data: string | undefined): FieldEntry[] {
  const entries = parseUnitDataStructured(data);
  if (data) rememberGroupedLeafCount(data, entries.length);
  return entries;
}

/**
 * Per-Data leaf counts learned as a side effect of {@link buildGroupedPaths}.
 * Kept separate from the parse cache (and holding only a number) so a unit stays
 * countable long after its parsed leaves were evicted.
 */
const groupedLeafCounts = new Map<string, number>();

function rememberGroupedLeafCount(data: string, count: number): void {
  if (groupedLeafCounts.has(data)) groupedLeafCounts.delete(data);
  groupedLeafCounts.set(data, count);
  if (groupedLeafCounts.size > DATA_CACHE_MAX) {
    const oldest = groupedLeafCounts.keys().next().value;
    if (oldest !== undefined) groupedLeafCounts.delete(oldest);
  }
}

/**
 * Per-document leaf count for Data that has ALREADY been materialized — i.e. some
 * view actually rendered this unit and called {@link buildGroupedPaths} on it.
 *
 * Returns `undefined` when the count is unknown. Callers MUST treat that as "not
 * counted" rather than parsing to fill the gap: structurally parsing a unit the
 * user never opened is exactly the work this exists to avoid. A total built from
 * these counts is therefore a LOWER BOUND whenever any unit returns `undefined`,
 * and must be presented as such (see the "N+" field badge in ComponentSidePane).
 */
export function peekGroupedLeafCount(data: string | undefined): number | undefined {
  // Absent/empty Data has no leaves — free to answer exactly, no parse involved.
  if (!data) return 0;
  const hit = groupedLeafCounts.get(data);
  if (hit === undefined) return undefined;
  groupedLeafCounts.delete(data);
  groupedLeafCounts.set(data, hit);
  return hit;
}

/**
 * The toolbar search box's predicate, shared by `ComponentSidePane` (auto mode)
 * and rollout mode: matches a unit's slug, or any upgrade/apply field diff's
 * path/old/new value, or any path/value in its full path list (covers
 * variation-only paths too). Case-insensitive substring match throughout.
 */
export function filterUnitsByText(units: MergedUnit[], filterText: string): MergedUnit[] {
  if (!filterText) return units;
  const lower = filterText.toLowerCase();
  return units.filter((u) => {
    if (u.slug.toLowerCase().includes(lower)) return true;
    const allDiffs = [
      ...(u.upgradeEntry?.fieldDiffs ?? []),
      ...(u.applyEntry?.fieldDiffs ?? []),
    ];
    const allPathEntries = [
      ...(u.upgradeEntry?.allPaths ?? []),
      ...(u.applyEntry?.allPaths ?? []),
      ...(u.variationEntry?.allPaths ?? []),
    ];
    return (
      allDiffs.some(
        (d) =>
          d.path.toLowerCase().includes(lower) ||
          d.oldValue.toLowerCase().includes(lower) ||
          d.newValue.toLowerCase().includes(lower),
      ) ||
      allPathEntries.some(
        (p) => p.path.toLowerCase().includes(lower) || p.value.toLowerCase().includes(lower),
      )
    );
  });
}

/**
 * Total field count for the "All · N" toolbar badge, shared by `ComponentSidePane`
 * (auto mode) and rollout mode. `isMaterialized` is the one thing that differs
 * between callers: auto mode gates it on its collapse/heavy-unit state, while
 * rollout mode — which never collapses a unit and has no heavy-unit gate of its
 * own yet — passes `() => true`, so every unit counts exactly and `allFieldsPartial`
 * never fires there. See `peekGroupedLeafCount` for why an unmaterialized unit
 * must not be parsed just to count it.
 */
export function computeTotalAllFields(
  units: MergedUnit[],
  isMaterialized: (unit: MergedUnit) => boolean,
): { totalAllFields: number; allFieldsPartial: boolean } {
  let total = 0;
  let partial = false;
  for (const u of units) {
    const known = peekGroupedLeafCount(u.data);
    const perDocumentLeaves = known ?? (isMaterialized(u) ? buildGroupedPaths(u.data).length : undefined);
    if (perDocumentLeaves === undefined) {
      partial = true;
      continue;
    }
    total += perDocumentLeaves > 0
      ? perDocumentLeaves
      : (u.variationEntry?.allPaths.length ?? u.upgradeEntry?.allPaths.length ?? u.applyEntry?.allPaths.length ?? 0);
  }
  return { totalAllFields: total, allFieldsPartial: partial };
}

/**
 * Union the downstream config paths with any upstream-only paths (present in the
 * upgrade diff but absent from the downstream Data). Upstream-only paths are
 * appended with an empty value so they render as promotable rows with an absent
 * current value. Returns the combined path list plus the set of upstream-only
 * paths so the caller can mark those rows as absent ("—").
 */
/**
 * How these builders reach configuration. It is not on the Unit or the Revision any more, so
 * the caller fetches it -- in one request for everything on screen -- and hands the builders
 * accessors rather than each builder fetching for itself.
 */
export interface DataAccessors {
  /** A Unit's current configuration, by UnitID. */
  unitData: (unitId?: string) => string;
  /** A Revision's configuration, by RevisionID. */
  revisionData: (revisionId?: string) => string;
}

export function unionUpstreamOnlyPaths(
  downstreamPaths: { path: string; value: string }[],
  upgradeFieldDiffs: Map<string, string>,
): { allPaths: { path: string; value: string }[]; upstreamOnlyPaths: Set<string> } {
  const known = new Set(downstreamPaths.map((p) => p.path));
  const extra: { path: string; value: string }[] = [];
  const upstreamOnlyPaths = new Set<string>();
  for (const path of upgradeFieldDiffs.keys()) {
    if (!known.has(path)) {
      extra.push({ path, value: '' });
      upstreamOnlyPaths.add(path);
    }
  }
  return {
    allPaths: extra.length ? [...downstreamPaths, ...extra] : downstreamPaths,
    upstreamOnlyPaths,
  };
}

// ============================================================================
// UPGRADE ENTRIES
// ============================================================================

/**
 * Build the list of upgrade entries for deployments that have active upgrades.
 * Uses revision numbers to determine upgradeability (matches backend behavior).
 */
export function buildUpgradeEntries(
  activeUpgrades: Set<string>,
  allUnits: ExtendedUnitRead[],
  unitById: Map<string, ExtendedUnitRead>,
  deploymentNameById: Map<string, string>,
  dryRunResults: Map<string, string> | undefined,
  dryRunConflicts: Map<string, MutationConflict[]> | undefined,
  data: DataAccessors,
): UpgradeEntry[] {
  const entries: UpgradeEntry[] = [];

  for (const arrowKey of activeUpgrades) {
    const [parentDeploymentId, childDeploymentId] = arrowKey.split('→');
    if (!parentDeploymentId || !childDeploymentId) continue;

    for (const u of allUnits) {
      const sid = u.Unit?.SpaceID;
      if (sid !== childDeploymentId) continue;

      const upstreamUnitId = u.Unit?.UpstreamUnitID;
      if (!upstreamUnitId) continue;

      const upstreamRevNum = u.Unit?.UpstreamRevisionNum ?? 0;
      const upstream = unitById.get(upstreamUnitId);
      if (!upstream) continue;

      const upstreamHead = upstream.Unit?.HeadRevisionNum ?? 0;
      if (upstreamRevNum >= upstreamHead) continue;

      const unitId = u.Unit?.UnitID ?? '';
      const newData = dryRunResults?.get(unitId);
      // Skip until the dry-run result is available. Diffing current data against
      // an absent dry-run result would flag EVERY field as removed (the '-'
      // sentinel), so building an entry here would surface a transient
      // "everything removed" preview. Once the dry-run lands, a '-' newValue
      // genuinely means the upstream removed that path.
      if (newData === undefined) continue;
      const fieldDiffs = computeFieldDiffs(data.unitData(u.Unit?.UnitID), newData);

      // Detect upstream deletions that were swallowed by SubtractMutations because
      // the child had a local modification for that path. The backend reports these
      // as conflicts with Reason='Subtracted' and Source.MutationType='Delete'. They
      // won't appear in fieldDiffs (dry-run == current), so surface them separately
      // so the user can opt in to accepting the deletion.
      const unitConflicts = dryRunConflicts?.get(unitId);
      let blockedDeletePaths: string[] | undefined;
      if (unitConflicts && unitConflicts.length > 0) {
        const blocked = unitConflicts
          .filter((c) => c.Reason === 'Subtracted' && c.Source?.MutationType === 'Delete' && c.Path)
          .map((c) => c.Path as string);
        if (blocked.length > 0) blockedDeletePaths = blocked;
      }

      entries.push({
        unitId,
        slug: u.Unit?.Slug ?? '',
        deploymentId: childDeploymentId,
        deploymentName: deploymentNameById.get(childDeploymentId) ?? childDeploymentId,
        parentDeploymentName: deploymentNameById.get(parentDeploymentId) ?? parentDeploymentId,
        upstreamRevisionNum: upstreamRevNum,
        upstreamHeadRevisionNum: upstreamHead,
        parentSpaceId: upstream.Unit?.SpaceID,
        parentUnitId: upstream.Unit?.UnitID,
        fieldDiffs,
        allPaths: buildPaths(data.unitData(u.Unit?.UnitID)),
        upstreamCreatedAt: upstream.HeadRevision?.CreatedAt,
        upstreamDescription: upstream.HeadRevision?.Description ?? undefined,
        blockedDeletePaths,
      });
    }
  }

  return entries;
}

// ============================================================================
// APPLY ENTRIES
// ============================================================================

/**
 * Build apply entries for ALL units with unapplied changes, including gated units.
 * Each entry includes gate information for display in the side pane.
 */
export function buildAllApplyEntries(
  allUnits: ExtendedUnitRead[],
  selectedDeploymentIds: string[],
  deploymentNameById: Map<string, string>,
  data: DataAccessors,
): ApplyEntryWithGates[] {
  const entries: ApplyEntryWithGates[] = [];
  const selectedSet = new Set(selectedDeploymentIds);

  for (const u of allUnits) {
    const sid = u.Unit?.SpaceID;
    if (!sid || !selectedSet.has(sid)) continue;

    const headRev = u.Unit?.HeadRevisionNum ?? 0;
    const appliedRev = u.Unit?.LastReleasedRevisionNum ?? 0;
    if (headRev <= appliedRev) continue;

    const gates = u.Unit?.ValidationErrors;
    const isGated = !!gates && Object.keys(gates).length > 0;
    const gateKeys = gates ? Object.keys(gates) : [];
    const fieldDiffs = computeFieldDiffs(
      data.revisionData(u.LastReleasedRevision?.RevisionID),
      data.revisionData(u.HeadRevision?.RevisionID),
    );

    entries.push({
      unitId: u.Unit?.UnitID ?? '',
      slug: u.Unit?.Slug ?? '',
      deploymentId: sid,
      deploymentName: deploymentNameById.get(sid) ?? sid,
      headRevision: headRev,
      appliedRevision: appliedRev,
      fieldDiffs,
      allPaths: buildPaths(data.revisionData(u.HeadRevision?.RevisionID)),
      isGated,
      gateKeys,
      headRevisionCreatedAt: u.HeadRevision?.CreatedAt,
      headRevisionDescription: u.HeadRevision?.Description ?? undefined,
    });
  }

  return entries;
}

// ============================================================================
// VARIATION ENTRIES
// ============================================================================

/**
 * Build variation entries: fields that differ between upstream HEAD and downstream
 * post-upgrade data. These represent intentional environment differences (e.g.,
 * namespace, hostname) that won't change during promotion.
 */
export function buildVariationEntries(
  selectedDeploymentIds: string[],
  allUnits: ExtendedUnitRead[],
  unitById: Map<string, ExtendedUnitRead>,
  deploymentNameById: Map<string, string>,
  dryRunResults: Map<string, string> | undefined,
  data: DataAccessors,
): VariationEntry[] {
  const entries: VariationEntry[] = [];
  const selectedSet = new Set(selectedDeploymentIds);

  for (const u of allUnits) {
    const sid = u.Unit?.SpaceID;
    if (!sid || !selectedSet.has(sid)) continue;

    const upstreamUnitId = u.Unit?.UpstreamUnitID;
    if (!upstreamUnitId) continue;

    const upstream = unitById.get(upstreamUnitId);
    if (!upstream) continue;

    const upstreamData = data.unitData(upstream.Unit?.UnitID);
    // Use dry-run result if available (post-upgrade), otherwise current data
    const downstreamData = dryRunResults?.get(u.Unit?.UnitID ?? '') ?? data.unitData(u.Unit?.UnitID);
    const fieldDiffs = computeFieldDiffs(upstreamData, downstreamData);
    const upstreamKeys = parseUnitData(upstreamData);
    const downstreamKeys = parseUnitData(downstreamData);
    const localOnlyPaths = Array.from(downstreamKeys.keys()).filter(k => !upstreamKeys.has(k));
    // Built from CURRENT committed data only — never dryRunData. Unlike fieldDiffs
    // above, this cannot change meaning when a dry-run lands: a path the pending
    // upgrade is about to overwrite equals upstream post-merge (leaving fieldDiffs),
    // but still differs from upstream RIGHT NOW, which is what the value border reads.
    const liveFieldDiffs = computeFieldDiffs(upstreamData, data.unitData(u.Unit?.UnitID));

    // A landed dry-run can empty fieldDiffs/localOnlyPaths for the exact unit the
    // border exists to flag (everything locally changed is about to be
    // overwritten), so liveFieldDiffs must also be checked here or no
    // VariationEntry is created and the border never reaches the UI.
    if (fieldDiffs.length === 0 && localOnlyPaths.length === 0 && liveFieldDiffs.length === 0) continue;

    entries.push({
      unitId: u.Unit?.UnitID ?? '',
      slug: u.Unit?.Slug ?? '',
      deploymentId: sid,
      deploymentName: deploymentNameById.get(sid) ?? sid,
      fieldDiffs,
      localOnlyPaths,
      allPaths: buildPaths(downstreamData),
      liveFieldDiffs,
    });
  }

  return entries;
}

// ============================================================================
// VALUE OVERLAY
// ============================================================================

/**
 * Apply a per-path overlay (Map<path, value|null>) to a FieldEntry array.
 * - `null` overlay value: the entry is filtered out (field was deleted).
 * - `string` overlay value: the entry's value is replaced.
 * - Paths not in the overlay: entry is passed through unchanged.
 * Returns a new array; does not mutate the input.
 */
export function applyValueOverlay(
  entries: FieldEntry[],
  overlay: Map<string, string | null> | undefined,
): FieldEntry[] {
  if (!overlay || overlay.size === 0) return entries;
  const result: FieldEntry[] = [];
  for (const e of entries) {
    if (overlay.has(e.path)) {
      const ov = overlay.get(e.path);
      if (ov === null) continue; // deleted
      result.push({ ...e, value: ov });
    } else {
      result.push(e);
    }
  }
  return result;
}
