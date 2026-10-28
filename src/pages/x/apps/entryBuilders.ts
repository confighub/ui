// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConfigDiff, ExtendedUnitRead, MutationConflict, UnitCreateOrUpdateResponseRead, UnitDiff } from '@confighub/rtk-query';

import { changeEntriesOf } from './change-order/changeOrderChanges';
import { parseUnitData, parseUnitDataStructured, type FieldEntry } from './configParser';
import { addedResourceLeafRows, fieldDiffsFromConfigDiff, isWholeResourceChange, resolveConflictPath, type TreeSideOptions } from './configDiffFieldDiffs';
import type { ApplyEntryWithGates, FieldDiff, KeyedFieldDiff, MergedUnit, UpgradeEntry, VariationEntry, WholeResourceChange } from './componentTypes';
import { treeReadsDocuments } from './componentValues';

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
 * The key a field diff is counted, staged and looked up by: its stage key, which names
 * its document, or its bare path for a diff that does not know its document.
 */
export function fieldDiffKey(d: FieldDiff): string {
  return d.key ?? d.path;
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
 * chip, and "Select all (N)" all showing the same logical number. The diffs are
 * counted by stage key, so a path two documents share counts once per document that
 * changes it; a resource added or deleted as a whole counts as one change.
 *
 * Shared between `ComponentSidePane` (auto mode) and ChangeOrder mode's toolbar —
 * the two must never carry independent copies of this predicate (rule 4).
 */
export function countUpgradableBadgeFields(unit: MergedUnit): number {
  if (!unit.upgradeEntry) return 0;
  const overriddenKeys = new Set(unit.variationEntry?.fieldDiffs.map(fieldDiffKey) ?? []);
  // Includes upstream removals (newValue '-' or ''): a removed path is a real
  // upgrade change and is shown (struck-through) in the upgradable view.
  // Also counts blocked upstream deletions (swallowed by SubtractMutations) so
  // the badge reflects those opt-in upgrades too. This is the SAME key set
  // "Select all" stages, so the count matches what gets staged.
  const keys = [
    ...unit.upgradeEntry.fieldDiffs.map(fieldDiffKey).filter((key) => !overriddenKeys.has(key)),
    ...(unit.upgradeEntry.blockedDeleteKeys ?? []),
  ];
  return countLogicalChanges(keys) + availableWholeResourceChanges(unit.upgradeEntry).length;
}

const NO_WHOLE_RESOURCE_CHANGES: WholeResourceChange[] = [];

/**
 * The whole-resource changes the user can take. One goes in only with the wholesale
 * upgrade (`upgrade: true`), which takes the merge's output as it is, and that output
 * keeps every key the upstream deleted but the Unit changed (`blockedDeleteKeys`). So
 * while the Unit has such a deletion to accept, "upgrade all" cannot be the whole batch,
 * and no whole-resource change can be taken. The badge, "Select all" and the row's
 * checkbox all read this, so none of them offers a change the commit would drop (rule 4).
 */
export function availableWholeResourceChanges(entry: UpgradeEntry | undefined): WholeResourceChange[] {
  if (!entry?.wholeResourceChanges || (entry.blockedDeleteKeys?.length ?? 0) > 0) return NO_WHOLE_RESOURCE_CHANGES;
  return entry.wholeResourceChanges;
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
 * The rows of the last few text comparisons, by the old data and then the new, so a
 * rebuild with the same data returns the same array. One old configuration is compared
 * with several: the upstream with the Unit as it is and as its upgrade would make it.
 */
const textRowsCache = new Map<string, Map<string, KeyedFieldDiff[]>>();
const TEXT_ROWS_CACHE_MAX = 50;
const TEXT_ROWS_PER_OLD_DATA_MAX = 4;

/**
 * The rows of a unit whose configuration the tree reads as text (`treeReadsDocuments`
 * is false): the tree's own leaves of `currentData` compared with those of `newData`,
 * read the same way. Properties and Env text is one leaf, at '', so a change is one row
 * that holds the whole text; INI is read as the first section's name, at '0'. Each row is
 * keyed on its bare path, as the tree keys a single-document unit's rows.
 */
export function textFieldDiffs(currentData: string, newData: string): KeyedFieldDiff[] {
  const byNewData = textRowsCache.get(currentData);
  const hit = byNewData?.get(newData);
  if (hit) return hit;
  const oldMap = parseUnitData(currentData);
  const newMap = parseUnitData(newData);
  const rows: KeyedFieldDiff[] = [];
  for (const path of new Set([...oldMap.keys(), ...newMap.keys()])) {
    const oldValue = oldMap.get(path);
    const newValue = newMap.get(path);
    if (oldValue === newValue) continue;
    rows.push({
      key: path,
      path,
      oldValue: oldValue ?? '-',
      newValue: newValue ?? '-',
      kind: oldValue === undefined ? 'Add' : newValue === undefined ? 'Delete' : 'Update',
    });
  }
  const entry = byNewData ?? new Map<string, KeyedFieldDiff[]>();
  entry.set(newData, rows);
  if (entry.size > TEXT_ROWS_PER_OLD_DATA_MAX) {
    const oldest = entry.keys().next().value;
    if (oldest !== undefined) entry.delete(oldest);
  }
  textRowsCache.delete(currentData);
  textRowsCache.set(currentData, entry);
  if (textRowsCache.size > TEXT_ROWS_CACHE_MAX) {
    const oldest = textRowsCache.keys().next().value;
    if (oldest !== undefined) textRowsCache.delete(oldest);
  }
  return rows;
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
 * and ChangeOrder mode: matches a unit's slug, or any upgrade/apply field diff's
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
 * (auto mode) and ChangeOrder mode. `isMaterialized` is the one thing that differs
 * between callers: auto mode gates it on its collapse/heavy-unit state, while
 * ChangeOrder mode — which never collapses a unit and has no heavy-unit gate of its
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
 * How these builders reach configuration. It is not on the Unit or the Revision any more, so
 * the caller fetches it -- in one request for everything on screen -- and hands the builders
 * accessors rather than each builder fetching for itself.
 */
export interface DataAccessors {
  /** A Unit's current configuration, by UnitID. */
  unitData: (unitId?: string) => string;
}

// ============================================================================
// UPGRADE ENTRIES
// ============================================================================

/** The rows of one dry-run Diff, cached on the Diff so a rebuild with the same Diff and data
 * returns the same arrays, and a poll that changes nothing re-renders no row. */
const upgradeRowsCache = new WeakMap<ConfigDiff, {
  treeData: string;
  fieldDiffs: KeyedFieldDiff[];
  wholeResourceChanges: WholeResourceChange[] | undefined;
}>();

/**
 * The upgrade's changes as the tree draws them. The tree draws the downstream's current
 * data, which is the From side of the dry run's Diff (from the Unit as it is to what the
 * merge would produce).
 */
function upgradeRowsOf(diff: ConfigDiff, currentData: string): {
  fieldDiffs: KeyedFieldDiff[];
  wholeResourceChanges: WholeResourceChange[] | undefined;
} {
  const hit = upgradeRowsCache.get(diff);
  if (hit && hit.treeData === currentData) return hit;
  const fieldDiffs: KeyedFieldDiff[] = [];
  const whole: WholeResourceChange[] = [];
  for (const row of fieldDiffsFromConfigDiff(diff, currentData, { treeSide: 'from' })) {
    if (isWholeResourceChange(row)) whole.push(row);
    else fieldDiffs.push(row);
  }
  const rows = { treeData: currentData, fieldDiffs, wholeResourceChanges: whole.length > 0 ? whole : undefined };
  upgradeRowsCache.set(diff, rows);
  return rows;
}

/**
 * The items of one upgrade dry-run batch, split into the Units' results and their
 * errors. A batch that succeeds can still fail some of its Units: such an item carries
 * an `Error` and no configuration or Diff, so it can build no entry, and its error is
 * what the Unit shows instead. An error that names no Unit belongs to each Unit of the
 * batch that got no result.
 */
export function splitDryRunItems(
  batchUnitIds: readonly string[],
  items: readonly UnitCreateOrUpdateResponseRead[],
): { results: UnitCreateOrUpdateResponseRead[]; errors: { unitId: string; message: string }[] } {
  const results: UnitCreateOrUpdateResponseRead[] = [];
  const errors: { unitId: string; message: string }[] = [];
  const answered = new Set<string>();
  const unattributed: string[] = [];
  for (const item of items) {
    const unitId = item.Unit?.UnitID;
    if (!item.Error) {
      results.push(item);
      if (unitId) answered.add(unitId);
      continue;
    }
    const message = item.Error.Message || 'The upgrade preview failed';
    if (unitId) {
      errors.push({ unitId, message });
      answered.add(unitId);
    } else {
      unattributed.push(message);
    }
  }
  if (unattributed.length > 0) {
    for (const unitId of batchUnitIds) {
      if (!answered.has(unitId)) errors.push({ unitId, message: unattributed.join('; ') });
    }
  }
  return { results, errors };
}

/**
 * The first character of the key of a blocked deletion whose path names no row of the
 * tree. U+0003 occurs in no path, document id or stage key, so the key matches no row.
 */
const UNRESOLVED_CONFLICT_KEY_PREFIX = '\u0003';

/**
 * The stage key of the row a swallowed upstream deletion keeps (`resolveConflictPath`).
 * A conflict whose path names no row of the tree, such as one inside a list with no merge
 * key, still gets a key of its own, so it is counted and staged as one opt-in upgrade
 * the user can see is there; it has no row to draw, and the commit writes nothing for it.
 */
export function blockedDeleteKey(conflict: Pick<MutationConflict, 'Resource' | 'Path'>, treeData: string): string {
  return resolveConflictPath(conflict, treeData) ?? [
    UNRESOLVED_CONFLICT_KEY_PREFIX,
    conflict.Resource?.ResourceType ?? '',
    '\u0000',
    conflict.Resource?.ResourceName ?? '',
    '\u0000',
    conflict.Path ?? '',
  ].join('');
}

/**
 * Build the list of upgrade entries for deployments that have active upgrades.
 * Uses revision numbers to determine upgradeability (matches backend behavior).
 *
 * `dryRunDiffs` is the Diff each Unit's upgrade dry run returned. The server computed
 * it, matching array elements by merge key and resources by identity, so a change to a
 * path two documents share is a change in the one document it is in. `dryRunData` is
 * the configuration the dry run produced, which a Unit the tree reads as text is
 * compared with instead (`textFieldDiffs`).
 */
export function buildUpgradeEntries(
  activeUpgrades: Set<string>,
  allUnits: ExtendedUnitRead[],
  unitById: Map<string, ExtendedUnitRead>,
  deploymentNameById: Map<string, string>,
  dryRunDiffs: Map<string, ConfigDiff> | undefined,
  dryRunData: Map<string, string> | undefined,
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
      const currentData = data.unitData(u.Unit?.UnitID);
      let fieldDiffs: KeyedFieldDiff[];
      let wholeResourceChanges: WholeResourceChange[] | undefined;
      // Skip until the dry run's result is available. An entry without it would offer
      // nothing to upgrade, and one built from something else could flag every field as
      // removed: a transient "everything removed" preview.
      if (treeReadsDocuments(u.Unit?.ToolchainType)) {
        const diff = dryRunDiffs?.get(unitId);
        if (diff === undefined) continue;
        ({ fieldDiffs, wholeResourceChanges } = upgradeRowsOf(diff, currentData));
      } else {
        const newData = dryRunData?.get(unitId);
        if (newData === undefined) continue;
        fieldDiffs = textFieldDiffs(currentData, newData);
      }

      // Detect upstream deletions that were swallowed by SubtractMutations because
      // the child had a local modification for that path. The backend reports these
      // as conflicts with Reason='Subtracted' and Source.MutationType='Delete'. They
      // won't appear in fieldDiffs (dry-run == current), so surface them separately
      // so the user can opt in to accepting the deletion.
      const unitConflicts = dryRunConflicts?.get(unitId);
      let blockedDeleteKeys: string[] | undefined;
      if (unitConflicts && unitConflicts.length > 0) {
        const blocked = new Set(unitConflicts
          .filter((c) => c.Reason === 'Subtracted' && c.Source?.MutationType === 'Delete' && c.Path)
          .map((c) => blockedDeleteKey(c, currentData)));
        if (blocked.size > 0) blockedDeleteKeys = [...blocked];
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
        wholeResourceChanges,
        allPaths: buildPaths(currentData),
        upstreamCreatedAt: upstream.HeadRevision?.CreatedAt,
        upstreamDescription: upstream.HeadRevision?.Description ?? undefined,
        blockedDeleteKeys,
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
 *
 * `unreleasedDiffs` is the server's diff of each Unit from its last released Revision to
 * its head. Only the toolbar search reads the entries' `fieldDiffs`, to find a Unit by a
 * value its unreleased change replaces or removes; the head's own paths and values are in
 * `allPaths`. Each entry's path names its resource, so a path that two documents of one
 * Unit share is two entries.
 */
export function buildAllApplyEntries(
  allUnits: ExtendedUnitRead[],
  selectedDeploymentIds: string[],
  deploymentNameById: Map<string, string>,
  data: DataAccessors,
  unreleasedDiffs: Record<string, UnitDiff> | undefined,
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
    const unitId = u.Unit?.UnitID ?? '';
    // A diff read before the latest write or release would match values the Unit no longer
    // has, so `fieldDiffs` stays empty until the read of these two Revisions lands. A Unit
    // never released is not read: from nothing, every resource is one whole Add, and
    // `allPaths` holds all of its values.
    const unreleased = unreleasedDiffs?.[unitId];
    const current = unreleased?.ToRevisionNum === headRev && (unreleased.FromRevisionNum ?? 0) === appliedRev;
    const fieldDiffs = current && unreleased.Diff ? changeEntriesOf(unreleased.Diff) : [];

    entries.push({
      unitId,
      slug: u.Unit?.Slug ?? '',
      deploymentId: sid,
      deploymentName: deploymentNameById.get(sid) ?? sid,
      headRevision: headRev,
      appliedRevision: appliedRev,
      fieldDiffs,
      allPaths: buildPaths(data.unitData(unitId)),
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

/** What the server reports a Unit differs from its upstream in, by UnitID. */
export interface VariationDiffs {
  /** From the upstream's head to the Unit's head. */
  live: ReadonlyMap<string, ConfigDiff>;
  /** From the upstream's head to the configuration the Unit's upgrade dry run produced. */
  postUpgrade: ReadonlyMap<string, ConfigDiff>;
}

const LIVE_VARIATION: TreeSideOptions = { treeSide: 'to' };
/**
 * The diff runs to what the upgrade would make the Unit, and the tree draws the Unit as it
 * is: the two differ where the upgrade adds or removes list elements, so the elements are
 * found by merge key.
 */
const POST_UPGRADE_VARIATION: TreeSideOptions = { treeSide: 'to', findElementsByMergeKey: true };

/** A variation Diff's rows, and those of them the tree holds a row for. */
interface VariationRows {
  rows: KeyedFieldDiff[];
  held: KeyedFieldDiff[];
}

/** The rows of one variation Diff, cached on the Diff as `upgradeRowsCache` is. */
const variationRowsCache = new WeakMap<ConfigDiff, { treeData: string; options: TreeSideOptions; rows: VariationRows }>();

/**
 * A variation Diff as the tree's rows: oldValue is the upstream's value, newValue the
 * Unit's. A resource only the Unit has is a row per leaf, each local-only; a resource
 * only the upstream has has no document in the tree, so no row.
 *
 * `held` leaves out the rows of a list element only the upstream has, such as one the
 * Unit deleted. The tree has no row for one, and its key carries an index made up after
 * the list's last element, the index the upgrade's Diff gives an element the upstream
 * adds to the list: as an override, it would keep that new element out of the upgrade.
 */
function variationRowsOf(diff: ConfigDiff, currentData: string, options: TreeSideOptions): VariationRows {
  const hit = variationRowsCache.get(diff);
  if (hit && hit.treeData === currentData && hit.options === options) return hit.rows;
  const rows: KeyedFieldDiff[] = [];
  for (const row of fieldDiffsFromConfigDiff(diff, currentData, options)) {
    if (isWholeResourceChange(row)) rows.push(...addedResourceLeafRows(row, currentData));
    else rows.push(row);
  }
  const held = rows.filter((row) => row.insertion === undefined);
  const result = { rows, held: held.length === rows.length ? rows : held };
  variationRowsCache.set(diff, { treeData: currentData, options, rows: result });
  return result;
}

/**
 * Build variation entries: fields that differ between upstream HEAD and the downstream
 * after its upgrade. These represent intentional environment differences (e.g.
 * namespace, hostname) that won't change during promotion.
 *
 * The rows come from the server (`variationDiffs`), keyed as the tree keys the Unit's own
 * rows, so an override of a path two documents share is a row in the one document that
 * overrides it. A Unit gets no entry until its diffs land: the live one, and, for a Unit
 * with an upgrade dry run, the post-upgrade one too, since an entry from the live diff
 * alone would read every path the upgrade brings as overridden. A Unit the tree reads
 * as text is compared as the tree reads it (`textFieldDiffs`), as its upgrade is.
 */
export function buildVariationEntries(
  selectedDeploymentIds: string[],
  allUnits: ExtendedUnitRead[],
  unitById: Map<string, ExtendedUnitRead>,
  deploymentNameById: Map<string, string>,
  dryRunResults: Map<string, string> | undefined,
  variationDiffs: VariationDiffs,
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

    const unitId = u.Unit?.UnitID ?? '';
    const currentData = data.unitData(unitId);
    const dryRunData = dryRunResults?.get(unitId);
    // Built from CURRENT committed data only — never the dry run. Unlike fieldDiffs
    // below, this cannot change meaning when a dry run lands: a path the pending
    // upgrade is about to overwrite equals upstream post-merge (leaving fieldDiffs),
    // but still differs from upstream RIGHT NOW, which is what the value border reads.
    let liveFieldDiffs: KeyedFieldDiff[];
    let fieldDiffs: KeyedFieldDiff[];
    if (treeReadsDocuments(u.Unit?.ToolchainType)) {
      const live = variationDiffs.live.get(unitId);
      if (live === undefined) continue;
      const liveRows = variationRowsOf(live, currentData, LIVE_VARIATION);
      liveFieldDiffs = liveRows.rows;
      if (dryRunData === undefined) {
        fieldDiffs = liveRows.held;
      } else {
        const postUpgrade = variationDiffs.postUpgrade.get(unitId);
        if (postUpgrade === undefined) continue;
        fieldDiffs = variationRowsOf(postUpgrade, currentData, POST_UPGRADE_VARIATION).held;
      }
    } else {
      const upstreamData = data.unitData(upstreamUnitId);
      liveFieldDiffs = textFieldDiffs(upstreamData, currentData);
      fieldDiffs = dryRunData === undefined ? liveFieldDiffs : textFieldDiffs(upstreamData, dryRunData);
    }
    const localOnlyKeys = fieldDiffs.filter((d) => d.kind === 'Add').map((d) => d.key);

    // A landed dry run can empty fieldDiffs/localOnlyKeys for the exact unit the
    // border exists to flag (everything locally changed is about to be
    // overwritten), so liveFieldDiffs must also be checked here or no
    // VariationEntry is created and the border never reaches the UI.
    if (fieldDiffs.length === 0 && localOnlyKeys.length === 0 && liveFieldDiffs.length === 0) continue;

    entries.push({
      unitId,
      slug: u.Unit?.Slug ?? '',
      deploymentId: sid,
      deploymentName: deploymentNameById.get(sid) ?? sid,
      fieldDiffs,
      localOnlyKeys,
      allPaths: buildPaths(dryRunData ?? currentData),
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
