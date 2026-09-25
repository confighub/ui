// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * useReleaseMagnitudes — "how many fields did each release change?", resolved
 * progressively and entirely client-side.
 *
 * The height-encoded release lane needs ONE number per release: the logical
 * changed-field count that release introduced relative to its predecessor.
 * There is no server endpoint for that number and none is being added, so this
 * hook derives it from data the existing `/revision` endpoint already returns,
 * in a bounded number of requests, without ever blocking a frame.
 *
 * === Two phases ============================================================
 *
 * PHASE A — one metadata request per 100 units, carrying NO `Data`.
 *   `select: 'RevisionID,RevisionNum,UnitID,Releases,DataHash'` over every
 *   revision of the release-target's units. `Revision.Releases` is a
 *   `map[ReleaseID]string` naming every Release that bundled that revision, so
 *   walking the returned rows once builds
 *   `ReleaseID -> Map<UnitID, {revisionId, revisionNum, dataHash}>` — the exact
 *   composition of every release, with no `Data` transferred at all.
 *
 *   `distinctOn: 'Off'` is MANDATORY. The parameter defaults to `'Unit'`, which
 *   returns one row per unit; that would silently produce a lane of zeroes with
 *   no error anywhere. `'Off'` in turn REQUIRES an explicit `limit` (the server
 *   answers 400 without one), so every query in this module passes both, and a
 *   dev-mode assertion fires if the response still looks DISTINCT-collapsed.
 *
 *   Deliberately NOT narrowed with `AND Releases IS NOT NULL`: the filter
 *   grammar documents `IS NULL` / `IS NOT NULL` on map attributes only in DOT
 *   form (`Labels.tier IS NOT NULL`). A bare map `IS NOT NULL` is unverified
 *   against a running server and a 400 would blank the whole lane, which is
 *   strictly worse than transferring a few hundred extra id-sized rows. If it
 *   is ever verified, adding it to `phaseAArg` is a one-line change.
 *
 * PHASE B — chunked `Data` fetches, only where something actually changed.
 *   For each consecutive release pair, a unit whose revision id (or DataHash)
 *   is identical on both sides contributed nothing and needs no `Data` at all.
 *   Most units do not change in most releases, so the surviving set is small.
 *   Those revisions are de-duplicated across every pair and fetched 50 ids at a
 *   time (a `RevisionID IN (...)` list of 50 UUIDs is ~1.9 KB, comfortably
 *   inside the 8192-char filter cap), newest releases first — that is the end
 *   of the lane the user is looking at. Each revision is fetched exactly once
 *   even though it is the "after" of one pair and the "before" of the next.
 *
 * === Why `getPairDiff` never fetches =======================================
 *
 * Fetching the endpoints of every CONSECUTIVE pair is sufficient to answer any
 * span `A → B`. For a unit that changed somewhere inside `[A, B)`, its revision
 * at `A` is the "before" side of the first change point in the span (already
 * fetched for that pair) and its revision at `B` is the "after" side of the
 * last change point (also already fetched). A unit that did not change inside
 * the span has an identical revision id at both ends and contributes zero
 * without any `Data`. So an arbitrary span is answerable from the same cache,
 * and `getPairDiff` is a pure read.
 *
 * === Progressive rendering =================================================
 *
 * Nothing here blocks. The lane renders immediately with `'pending'` stubs;
 * each landing chunk unblocks a handful of pairs, which are counted at most
 * four at a time between `requestIdleCallback` yields and committed inside
 * `startTransition`. Bars therefore grow in waves rather than appearing at
 * once, and a 30-release history never costs a dropped frame.
 *
 * `maxChangedFields` — the h(f) normaliser — is held in a ref and only ever
 * RAISED within a scope. Bars must not shrink as later data arrives, and the
 * coarse `'Release'` cache tag (publishing in ANY space refetches every release
 * list) must not visually reset the lane.
 *
 * === Deviations from the parcel brief, recorded ============================
 *
 * 1. The brief specified `useRef` + a version counter for the resolved-`Data`
 *    map. This uses ordinary React state holding immutable maps instead: the
 *    values are string REFERENCES (a copy is a few hundred pointer writes, not
 *    a payload copy) and it keeps `react-hooks/exhaustive-deps` honest with no
 *    "unnecessary dependency" escape hatches. A ref MIRROR of that state is
 *    still kept so the async pump reads what it just wrote without waiting for
 *    a render.
 * 2. Every cached artefact is tagged with a SCOPE key (`spaceId` + the unit-id
 *    set). A scope change reads as an empty cache rather than as a render-phase
 *    state reset, so switching component nodes cannot inherit the previous
 *    node's normaliser, counts or per-unit pair cache.
 */
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useLazyListAllRevisionsQuery,
  useListAllRevisionsQuery,
  type ExtendedReleaseRead,
  type ListAllRevisionsApiArg,
  type ListAllRevisionsApiResponse,
} from '@confighub/rtk-query';

import { buildPaths, computeFieldDiffs, countLogicalChanges } from './entryBuilders';
import { isHeavyUnitData } from './unitSizeGuard';
import type { UnreleasedUnitDiffResult } from './useUnreleasedChanges';
import { useLazyRevisionDataMap } from '@/hooks/useUnitData';

// ============================================================================
// PUBLIC TYPES
// ============================================================================

/** A unit in the release-target set. Same shape `ComponentSidePane` already builds. */
export interface ReleaseUnitRef {
  unitId: string;
  slug: string;
  spaceId: string;
  data?: string;
}

export type ReleaseMagnitudeState =
  /** Not resolved yet (bootstrapping, or its Data chunk is in flight). */
  | 'pending'
  /** `changedFields`/`changedUnits` are final. */
  | 'resolved'
  /** Outside the window, or truncated out of phase A — never resolvable this mount. */
  | 'unavailable';

export interface ReleaseMagnitude {
  releaseId: string;
  releaseNum: number;
  /** Logical changed-field count this release introduced vs. its predecessor. undefined unless state === 'resolved'. */
  changedFields: number | undefined;
  /** Units with >=1 changed field. undefined unless state === 'resolved'. */
  changedUnits: number | undefined;
  state: ReleaseMagnitudeState;
  /** True when >=1 unit was skipped (oversized data) so the counts understate reality. */
  partial: boolean;
  /** True when >=1 unit's revision blob could not be fetched — a different reason from `partial`, and a different thing to tell the user. */
  failed: boolean;
}

export interface ReleasePairDiff {
  /** Keyed by unitId. Same shape the existing diff plumbing consumes. Empty while isLoading. */
  resultsByUnit: Map<string, UnreleasedUnitDiffResult>;
  totalChangedFields: number;
  changedUnits: number;
  /** Units present in the release pair that could not be resolved (oversized / truncated). */
  skippedUnitCount: number;
  isLoading: boolean;
  /** True when the pair can never resolve this mount (outside the window / truncated). */
  unavailable: boolean;
}

export interface UseReleaseMagnitudesResult {
  /** Index-aligned with the `releases` input (newest-first). Always the same length. */
  magnitudes: ReleaseMagnitude[];
  byReleaseId: ReadonlyMap<string, ReleaseMagnitude>;
  /** The h(f) normaliser: max resolved changedFields so far. MONOTONIC NON-DECREASING within a mount. 0 before anything resolves. */
  maxChangedFields: number;
  /** How many magnitudes have state === 'resolved'. */
  resolvedCount: number;
  /** How many magnitudes are inside the window (i.e. can ever resolve). */
  totalCount: number;
  /** Phase A (the metadata query) is in flight. */
  isBootstrapping: boolean;
  /** Phase A hit the row limit; some older releases are permanently 'unavailable' this mount. */
  truncated: boolean;
  /**
   * Diff for an arbitrary release pair, served from the SAME cache — never triggers a fetch.
   * `beforeReleaseId === undefined` means "no predecessor" (the oldest release): every field reads as new.
   * Stable identity across renders where the underlying data has not changed.
   */
  getPairDiff: (beforeReleaseId: string | undefined, afterReleaseId: string) => ReleasePairDiff;
}

export interface UseReleaseMagnitudesOptions {
  /** Newest-first, exactly as `ReleaseActions.releases` provides. */
  releases: ExtendedReleaseRead[];
  units: ReleaseUnitRef[];
  spaceId: string;
  /** False => zero queries, everything 'pending', isBootstrapping false. */
  enabled: boolean;
  /** How many newest releases participate. Default 30. */
  maxReleases?: number;
}

// ============================================================================
// TUNING
// ============================================================================

/** How many newest releases participate by default. Older ones read 'unavailable'. */
const DEFAULT_MAX_RELEASES = 30;
/** Server-side cap for a single `/revision` page. Reaching it exactly means truncation. */
const PHASE_A_ROW_LIMIT = 1000;
/** UUIDs per `UnitID IN (...)` clause. 100 x ~40 chars is ~4 KB, half the 8192 filter cap. */
const UNIT_IDS_PER_QUERY = 100;
/** UUIDs per `RevisionID IN (...)` clause. 50 x ~40 chars is ~1.9 KB. */
const REVISION_IDS_PER_QUERY = 50;
/** Pairs counted per idle slice. Four keeps the longest slice well inside a frame. */
const PAIRS_PER_IDLE_SLICE = 4;

const PHASE_A_SELECT = 'RevisionID,RevisionNum,UnitID,Releases,DataHash';
// Phase B needs the Revisions only for their identity: the configuration is fetched
// alongside them from the revision-data endpoint. Naming Data here is not merely
// wasteful, it is rejected -- Data is not a field of a Revision -- and a 400 takes the
// whole chunk down, so no bar ever resolves a field count.
const PHASE_B_SELECT = 'RevisionID,UnitID,RevisionNum';

/** Placeholder arg for the skipped phase-A subscription; never reaches the network. */
const NO_QUERY_ARG: ListAllRevisionsApiArg = {};

const EMPTY_UNIT_INDEX: ReadonlyMap<string, RevisionMeta> = new Map();

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/** One unit's position in one release. */
interface RevisionMeta {
  revisionId: string;
  revisionNum: number;
  dataHash: string | undefined;
}

/** ReleaseID -> (UnitID -> the revision that release bundled for that unit). */
type ReleaseIndex = ReadonlyMap<string, ReadonlyMap<string, RevisionMeta>>;

/** A phase-A row, already filtered down to revisions that at least one release bundled. */
interface PhaseARow {
  unitId: string;
  revisionId: string;
  revisionNum: number;
  dataHash: string | undefined;
  releaseIds: string[];
}

/** One consecutive release pair that is inside the window and can be resolved. */
interface PairPlan {
  releaseId: string;
  /** undefined for the globally oldest release — it has no predecessor. */
  beforeReleaseId: string | undefined;
  /** Revision ids whose `Data` must land before this pair can be counted. */
  requiredRevisionIds: string[];
}

interface MagnitudePlan {
  scope: string;
  /** Phase A has landed and there is work worth doing. */
  active: boolean;
  spaceId: string;
  unitIds: readonly string[];
  releaseIndex: ReleaseIndex;
  /** Newest-first. */
  pairs: readonly PairPlan[];
  /** Newest-first, de-duplicated. */
  plannedRevisionIds: readonly string[];
  plannedRevisionIdSet: ReadonlySet<string>;
  /** Releases usable as the NEWER endpoint of a diff (inside the resolvable window). */
  windowReleaseIds: ReadonlySet<string>;
  /** Releases usable as the OLDER endpoint — the window plus its structural predecessor. */
  endpointReleaseIds: ReadonlySet<string>;
}

const EMPTY_PLAN: MagnitudePlan = {
  scope: '',
  active: false,
  spaceId: '',
  unitIds: [],
  releaseIndex: new Map(),
  pairs: [],
  plannedRevisionIds: [],
  plannedRevisionIdSet: new Set(),
  windowReleaseIds: new Set(),
  endpointReleaseIds: new Set(),
};

interface ReleaseCount {
  fields: number;
  units: number;
  partial: boolean;
  /** >=1 unit's blob could not be fetched, as opposed to being skipped for size. */
  failed: boolean;
}

/**
 * Counts are a function of the PAIR, not of the after-endpoint alone: withdraw
 * a release from the middle of history and its successor's predecessor changes,
 * which changes the successor's count. Keying on the after id alone would keep
 * the old number for the rest of the mount.
 */
function pairCountKey(beforeReleaseId: string | undefined, releaseId: string): string {
  return `${beforeReleaseId ?? '-'}→${releaseId}`;
}

/** Everything resolved so far for one scope. Replaced wholesale when the scope changes. */
interface ResolveState {
  scope: string;
  /** RevisionID -> configuration ('' when the revision carries none). Presence means resolved. */
  data: ReadonlyMap<string, string>;
  /** RevisionIDs the server never returned, or whose chunk errored. Never resolvable this mount. */
  failed: ReadonlySet<string>;
  /** `pairCountKey(before, after)` -> final counts. */
  counts: ReadonlyMap<string, ReleaseCount>;
  /** Phase-A rows from the 2nd..Nth unit chunk (the 1st chunk is the subscribed query). */
  extraRows: readonly PhaseARow[];
  /** Unit-chunk keys already fetched (or failed) in phase A. */
  extraDone: ReadonlySet<string>;
  /** Any extra phase-A chunk came back at the row limit. */
  extraTruncated: boolean;
}

function emptyResolveState(scope: string): ResolveState {
  return {
    scope,
    data: new Map(),
    failed: new Set(),
    counts: new Map(),
    extraRows: [],
    extraDone: new Set(),
    extraTruncated: false,
  };
}

// ============================================================================
// PURE HELPERS
// ============================================================================

function quoteList(ids: readonly string[]): string {
  return ids.map((id) => `'${id}'`).join(', ');
}

function chunkList<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function phaseAArg(spaceId: string, unitIds: readonly string[]): ListAllRevisionsApiArg {
  return {
    where: `SpaceID = '${spaceId}' AND UnitID IN (${quoteList(unitIds)})`,
    select: PHASE_A_SELECT,
    distinctOn: 'Off',
    limit: PHASE_A_ROW_LIMIT,
    orderBy: 'DESC:RevisionNum',
  };
}

function phaseBArg(spaceId: string, revisionIds: readonly string[]): ListAllRevisionsApiArg {
  return {
    where: `SpaceID = '${spaceId}' AND RevisionID IN (${quoteList(revisionIds)})`,
    select: PHASE_B_SELECT,
    distinctOn: 'Off',
    limit: revisionIds.length,
  };
}

/** Keep only revisions some release bundled; everything else is noise for this hook. */
function normalizePhaseA(rows: ListAllRevisionsApiResponse | undefined): PhaseARow[] {
  const out: PhaseARow[] = [];
  for (const row of rows ?? []) {
    const rev = row.Revision;
    const unitId = rev?.UnitID;
    const revisionId = rev?.RevisionID;
    if (!unitId || !revisionId) continue;
    const releases = rev?.Releases;
    if (!releases) continue;
    const releaseIds = Object.keys(releases);
    if (releaseIds.length === 0) continue;
    out.push({
      unitId,
      revisionId,
      revisionNum: rev?.RevisionNum ?? 0,
      dataHash: rev?.DataHash || undefined,
      releaseIds,
    });
  }
  return out;
}

function buildReleaseIndex(rows: readonly PhaseARow[]): ReleaseIndex {
  const index = new Map<string, Map<string, RevisionMeta>>();
  for (const row of rows) {
    for (const releaseId of row.releaseIds) {
      let byUnit = index.get(releaseId);
      if (!byUnit) {
        byUnit = new Map();
        index.set(releaseId, byUnit);
      }
      const existing = byUnit.get(row.unitId);
      // A unit appears at most once per release; keep the highest RevisionNum defensively.
      if (!existing || existing.revisionNum < row.revisionNum) {
        byUnit.set(row.unitId, {
          revisionId: row.revisionId,
          revisionNum: row.revisionNum,
          dataHash: row.dataHash,
        });
      }
    }
  }
  return index;
}

/** '' is how an absent `Data` is stored; the diff plumbing wants `undefined`. */
function rawData(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

/** Same revision, same revision number, or byte-identical content — contributed nothing. */
function isUnchangedPair(oldMeta: RevisionMeta | undefined, newMeta: RevisionMeta): boolean {
  if (!oldMeta) return false;
  if (oldMeta.revisionId === newMeta.revisionId) return true;
  if (oldMeta.revisionNum === newMeta.revisionNum) return true;
  return !!oldMeta.dataHash && !!newMeta.dataHash && oldMeta.dataHash === newMeta.dataHash;
}

type UnitPairResolution =
  /** Not bundled into the "after" release — contributed nothing and must not render. */
  | { kind: 'omit' }
  /** Some required `Data` has not landed yet. */
  | { kind: 'loading'; missing: string[] }
  /** Required `Data` will never land (chunk errored / row absent). */
  | { kind: 'failed' }
  /** Oversized payload; deliberately not parsed. Counts as zero and flags `partial`. */
  | { kind: 'skipped' }
  | { kind: 'done'; result: UnreleasedUnitDiffResult; fields: number };

/**
 * Resolve one unit across one release pair.
 *
 * Mirrors `useUnreleasedChanges`' historical branch exactly, including its two
 * load-bearing rules: `allPaths` is built from the OLD side, and a unit absent
 * from the "after" side is omitted rather than rendered as a wholesale removal.
 * The extra rule here is the DataHash short-circuit — identical hashes mean
 * identical bytes, so the pair contributes zero without transferring `Data`.
 */
function resolveUnitPair(
  oldMeta: RevisionMeta | undefined,
  newMeta: RevisionMeta | undefined,
  data: ReadonlyMap<string, string>,
  failed: ReadonlySet<string>,
): UnitPairResolution {
  if (!newMeta) return { kind: 'omit' };

  if (oldMeta && isUnchangedPair(oldMeta, newMeta)) {
    return {
      kind: 'done',
      fields: 0,
      result: {
        isLoading: false,
        neverReleased: false,
        fieldDiffs: [],
        allPaths: [],
        // Only populated when this blob happened to be fetched for a
        // neighbouring pair; nothing renders from it when fieldDiffs is empty.
        oldData: rawData(data.get(oldMeta.revisionId)),
        matchedRevisionNum: newMeta.revisionNum,
      },
    };
  }

  const required = oldMeta ? [oldMeta.revisionId, newMeta.revisionId] : [newMeta.revisionId];
  if (required.some((id) => failed.has(id))) return { kind: 'failed' };
  const missing = required.filter((id) => !data.has(id));
  if (missing.length > 0) return { kind: 'loading', missing };

  const oldData = oldMeta ? rawData(data.get(oldMeta.revisionId)) : undefined;
  const newData = rawData(data.get(newMeta.revisionId));

  // Never parse a multi-MB blob: it is skipped outright and flagged `partial`.
  if (isHeavyUnitData(oldData) || isHeavyUnitData(newData)) return { kind: 'skipped' };

  const fieldDiffs = computeFieldDiffs(oldData, newData);
  return {
    kind: 'done',
    fields: countLogicalChanges(fieldDiffs.map((d) => d.path)),
    result: {
      isLoading: false,
      neverReleased: !oldMeta,
      fieldDiffs,
      allPaths: buildPaths(oldData),
      oldData,
      matchedRevisionNum: newMeta.revisionNum,
    },
  };
}

function unitPairCacheKey(oldMeta: RevisionMeta | undefined, newMeta: RevisionMeta): string {
  return `${oldMeta?.revisionId ?? '-'}→${newMeta.revisionId}`;
}

// ============================================================================
// IDLE SCHEDULING
// ============================================================================

type IdleScheduler = (callback: () => void, options?: { timeout?: number }) => number;

const idleScheduler: IdleScheduler | undefined =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (window as unknown as { requestIdleCallback: IdleScheduler }).requestIdleCallback.bind(window)
    : undefined;

/** Yield to the browser between count slices. Falls back to a macrotask. */
function nextIdle(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (idleScheduler) idleScheduler(() => resolve(), { timeout: 200 });
    else setTimeout(resolve, 0);
  });
}

// ============================================================================
// HOOK
// ============================================================================

export function useReleaseMagnitudes({
  releases,
  units,
  spaceId,
  enabled,
  maxReleases = DEFAULT_MAX_RELEASES,
}: UseReleaseMagnitudesOptions): UseReleaseMagnitudesResult {
  // --------------------------------------------------------------------------
  // Stable identities. Callers rebuild `units`/`releases` on every poll, so
  // everything downstream keys off a joined id string rather than array
  // identity — otherwise the phase-A query arg would churn and refetch forever.
  // --------------------------------------------------------------------------
  const unitIdKey = units
    .map((u) => u.unitId)
    .sort()
    .join(',');
  const unitIds = useMemo(() => (unitIdKey ? unitIdKey.split(',') : []), [unitIdKey]);

  const scope = `${spaceId}|${unitIdKey}`;
  const active = enabled && spaceId !== '' && unitIds.length > 0 && releases.length > 0;

  const unitChunks = useMemo(() => chunkList(unitIds, UNIT_IDS_PER_QUERY), [unitIds]);

  const [state, setState] = useState<ResolveState>(() => emptyResolveState(scope));
  const stateRef = useRef(state);

  /**
   * Commit that keeps `stateRef` synchronously current, so the async pump can
   * read what it just wrote without waiting for a render.
   */
  const commit = useCallback((updater: (prev: ResolveState) => ResolveState): void => {
    const next = updater(stateRef.current);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  // A scope change never mutates state during render; the stale scope simply
  // reads as an empty cache and is replaced by the first commit that lands.
  const emptyForScope = useMemo(() => emptyResolveState(scope), [scope]);
  const view = state.scope === scope ? state : emptyForScope;

  // --------------------------------------------------------------------------
  // PHASE A
  // --------------------------------------------------------------------------
  const primaryArg = useMemo(() => {
    const first = unitChunks[0];
    if (!active || !first) return undefined;
    return phaseAArg(spaceId, first);
  }, [active, spaceId, unitChunks]);

  const { data: primaryRows, isFetching: primaryFetching } = useListAllRevisionsQuery(
    primaryArg ?? NO_QUERY_ARG,
    { skip: !primaryArg },
  );

  const [triggerRevisions] = useLazyListAllRevisionsQuery();
  const fetchRevisionDataMap = useLazyRevisionDataMap();

  const primaryParsed = useMemo(
    () => ({
      rows: normalizePhaseA(primaryRows),
      rawCount: primaryRows?.length ?? 0,
    }),
    [primaryRows],
  );

  const extraChunkKeys = useMemo(
    () => unitChunks.slice(1).map((chunk, i) => `${scope}#${i + 1}:${chunk.length}`),
    [unitChunks, scope],
  );

  // Extra unit chunks — only when the release target holds more than
  // UNIT_IDS_PER_QUERY units, which is rare. Sequential, so a very wide target
  // cannot fan out into a burst of parallel requests.
  useEffect(() => {
    if (!active || extraChunkKeys.length === 0) return;
    let cancelled = false;

    const run = async (): Promise<void> => {
      for (let i = 0; i < extraChunkKeys.length; i++) {
        if (cancelled) return;
        const key = extraChunkKeys[i];
        const current = stateRef.current;
        if (current.scope === scope && current.extraDone.has(key)) continue;

        let rows: ListAllRevisionsApiResponse = [];
        try {
          rows = await triggerRevisions(phaseAArg(spaceId, unitChunks[i + 1]), false).unwrap();
        } catch {
          rows = [];
        }
        if (cancelled) return;

        const parsed = normalizePhaseA(rows);
        const chunkTruncated = rows.length >= PHASE_A_ROW_LIMIT;
        commit((prev) => {
          const base = prev.scope === scope ? prev : emptyResolveState(scope);
          if (base.extraDone.has(key)) return prev;
          const extraDone = new Set(base.extraDone);
          extraDone.add(key);
          return {
            ...base,
            extraRows: [...base.extraRows, ...parsed],
            extraDone,
            extraTruncated: base.extraTruncated || chunkTruncated,
          };
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [active, extraChunkKeys, scope, spaceId, unitChunks, triggerRevisions, commit]);

  const extraChunksResolved = extraChunkKeys.every((key) => view.extraDone.has(key));
  const phaseALanded = active && !primaryFetching && primaryRows !== undefined && extraChunksResolved;
  const isBootstrapping = active && !phaseALanded;

  const releaseIndex = useMemo(
    () => buildReleaseIndex([...primaryParsed.rows, ...view.extraRows]),
    [primaryParsed.rows, view.extraRows],
  );

  const truncated =
    phaseALanded && (primaryParsed.rawCount >= PHASE_A_ROW_LIMIT || view.extraTruncated);

  // Dev-only trap for the `distinctOn` default: one row per unit while several
  // releases exist means the DISTINCT ON silently collapsed the history.
  const warnedRef = useRef(false);
  if (
    import.meta.env.MODE === 'development' &&
    phaseALanded &&
    !warnedRef.current &&
    releases.length > 1 &&
    primaryParsed.rawCount > 0 &&
    primaryParsed.rawCount === unitChunks[0]?.length
  ) {
    warnedRef.current = true;
    console.warn(
      '[useReleaseMagnitudes] phase A returned exactly one revision per unit across',
      releases.length,
      'releases — distinctOn may have collapsed the history. Every revision query here must',
      "pass distinctOn: 'Off' together with an explicit limit.",
    );
  }

  // --------------------------------------------------------------------------
  // WINDOW + AVAILABILITY
  // --------------------------------------------------------------------------
  const availability = useMemo(() => {
    const windowSize = Math.min(maxReleases, releases.length);
    if (!phaseALanded || !truncated) return { windowSize, availableThroughIndex: windowSize - 1 };

    // Truncation drops the OLDEST revisions first (`orderBy: 'DESC:RevisionNum'`),
    // so the oldest release we saw at all may itself be missing units. Indices
    // 0..oldestObserved-1 are complete; a pair at index i reads indices i and
    // i+1, so the newest pair that is certainly safe is oldestObserved - 2.
    // Conservative on purpose: a wrong bar height is worse than a missing one.
    let oldestObservedIndex = -1;
    for (let i = releases.length - 1; i >= 0; i--) {
      const id = releases[i].Release?.ReleaseID;
      if (id && releaseIndex.has(id)) {
        oldestObservedIndex = i;
        break;
      }
    }
    return {
      windowSize,
      availableThroughIndex: Math.min(windowSize - 1, oldestObservedIndex - 2),
    };
  }, [maxReleases, releases, phaseALanded, truncated, releaseIndex]);

  const lastAvailableIndex = active
    ? Math.min(availability.availableThroughIndex, availability.windowSize - 1)
    : -1;

  // --------------------------------------------------------------------------
  // PLAN: which pairs exist, and which revision blobs they need
  // --------------------------------------------------------------------------
  const plan = useMemo((): MagnitudePlan => {
    if (!phaseALanded || lastAvailableIndex < 0) return EMPTY_PLAN;

    const pairs: PairPlan[] = [];
    const plannedRevisionIds: string[] = [];
    const plannedRevisionIdSet = new Set<string>();
    const windowReleaseIds = new Set<string>();
    const endpointReleaseIds = new Set<string>();

    for (let i = 0; i <= lastAvailableIndex; i++) {
      const releaseId = releases[i].Release?.ReleaseID;
      if (!releaseId) continue;
      const beforeReleaseId = releases[i + 1]?.Release?.ReleaseID;
      windowReleaseIds.add(releaseId);
      endpointReleaseIds.add(releaseId);
      if (beforeReleaseId) endpointReleaseIds.add(beforeReleaseId);

      const after = releaseIndex.get(releaseId);
      const before = beforeReleaseId ? releaseIndex.get(beforeReleaseId) : undefined;

      const requiredRevisionIds: string[] = [];
      for (const unitId of unitIds) {
        const newMeta = after?.get(unitId);
        if (!newMeta) continue;
        const oldMeta = before?.get(unitId);
        if (isUnchangedPair(oldMeta, newMeta)) continue;
        requiredRevisionIds.push(newMeta.revisionId);
        if (oldMeta) requiredRevisionIds.push(oldMeta.revisionId);
      }

      pairs.push({ releaseId, beforeReleaseId, requiredRevisionIds });
      for (const id of requiredRevisionIds) {
        if (plannedRevisionIdSet.has(id)) continue;
        plannedRevisionIdSet.add(id);
        plannedRevisionIds.push(id);
      }
    }

    return {
      scope,
      active: true,
      spaceId,
      unitIds,
      releaseIndex,
      pairs,
      plannedRevisionIds,
      plannedRevisionIdSet,
      windowReleaseIds,
      endpointReleaseIds,
    };
  }, [phaseALanded, lastAvailableIndex, releases, releaseIndex, unitIds, scope, spaceId]);

  // --------------------------------------------------------------------------
  // THE PUMP: count every pair whose Data has landed (four per idle slice),
  // otherwise pull the next Data chunk, newest releases first. Repeat until
  // there is nothing left to do.
  // --------------------------------------------------------------------------
  const planRef = useRef(plan);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Set<string>>(new Set());
  /** (beforeRevisionId → afterRevisionId) -> that unit's contribution. Survives refetches. */
  const unitPairCacheRef = useRef<{
    scope: string;
    entries: Map<string, { fields: number; partial: boolean; failed: boolean }>;
  }>({
    scope,
    entries: new Map(),
  });
  const pumpBusyRef = useRef(false);
  const pumpDirtyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const countRelease = useCallback(
    (currentPlan: MagnitudePlan, pair: PairPlan, resolved: ResolveState): ReleaseCount => {
      if (unitPairCacheRef.current.scope !== currentPlan.scope) {
        unitPairCacheRef.current = { scope: currentPlan.scope, entries: new Map() };
      }
      const cache = unitPairCacheRef.current.entries;
      const after = currentPlan.releaseIndex.get(pair.releaseId);
      const before = pair.beforeReleaseId ? currentPlan.releaseIndex.get(pair.beforeReleaseId) : undefined;

      let fields = 0;
      let changedUnits = 0;
      let partial = false;
      let failed = false;

      for (const unitId of currentPlan.unitIds) {
        const newMeta = after?.get(unitId);
        if (!newMeta) continue;
        const oldMeta = before?.get(unitId);

        const key = unitPairCacheKey(oldMeta, newMeta);
        const hit = cache.get(key);
        if (hit) {
          fields += hit.fields;
          if (hit.fields > 0) changedUnits++;
          if (hit.partial) partial = true;
          if (hit.failed) failed = true;
          continue;
        }

        const resolution = resolveUnitPair(oldMeta, newMeta, resolved.data, resolved.failed);
        if (resolution.kind === 'omit' || resolution.kind === 'loading') continue;
        if (resolution.kind === 'skipped' || resolution.kind === 'failed') {
          // Both understate the count, but for reasons that need different
          // words: one is a unit too big to parse, the other a fetch that failed.
          const didFail = resolution.kind === 'failed';
          cache.set(key, { fields: 0, partial: true, failed: didFail });
          partial = true;
          if (didFail) failed = true;
          continue;
        }
        cache.set(key, { fields: resolution.fields, partial: false, failed: false });
        fields += resolution.fields;
        if (resolution.fields > 0) changedUnits++;
      }

      return { fields, units: changedUnits, partial, failed };
    },
    [],
  );

  const runPump = useCallback(async (): Promise<void> => {
    if (pumpBusyRef.current) {
      // A plan landed mid-flight; the running pump re-reads planRef and loops again.
      pumpDirtyRef.current = true;
      return;
    }
    pumpBusyRef.current = true;
    try {
      do {
        pumpDirtyRef.current = false;

        for (;;) {
          if (!mountedRef.current) return;
          const currentPlan = planRef.current;
          if (!currentPlan.active) break;
          const raw = stateRef.current;
          const resolved = raw.scope === currentPlan.scope ? raw : emptyResolveState(currentPlan.scope);

          // 1. Count everything whose Data has landed, four pairs per slice.
          const ready = currentPlan.pairs.filter(
            (pair) =>
              !resolved.counts.has(pairCountKey(pair.beforeReleaseId, pair.releaseId)) &&
              pair.requiredRevisionIds.every((id) => resolved.data.has(id) || resolved.failed.has(id)),
          );
          if (ready.length > 0) {
            const slice = ready.slice(0, PAIRS_PER_IDLE_SLICE);
            const counts = new Map(resolved.counts);
            for (const pair of slice) {
              counts.set(
                pairCountKey(pair.beforeReleaseId, pair.releaseId),
                countRelease(currentPlan, pair, resolved),
              );
            }
            startTransition(() => {
              commit((prev) => {
                const base = prev.scope === currentPlan.scope ? prev : emptyResolveState(currentPlan.scope);
                return { ...base, counts };
              });
            });
            if (ready.length > slice.length) await nextIdle();
            continue;
          }

          // 2. Nothing countable — pull the next Data chunk.
          const pending = currentPlan.plannedRevisionIds.filter(
            (id) => !resolved.data.has(id) && !resolved.failed.has(id) && !inFlightRef.current.has(id),
          );
          if (pending.length === 0) break;
          const chunk = pending.slice(0, REVISION_IDS_PER_QUERY);
          for (const id of chunk) inFlightRef.current.add(id);
          try {
            // Revision Data is immutable per RevisionID, so a cache hit is always correct.
            const rows = await triggerRevisions(phaseBArg(currentPlan.spaceId, chunk), true).unwrap();
            // Configuration is not on the Revision; the whole chunk is fetched in one request.
            const chunkData = await fetchRevisionDataMap(
              rows.map((row) => row.Revision?.RevisionID),
            );
            const landed = new Map<string, string>();
            for (const row of rows) {
              const revisionId = row.Revision?.RevisionID;
              if (!revisionId) continue;
              landed.set(revisionId, chunkData.get(revisionId) ?? '');
            }
            const absent = chunk.filter((id) => !landed.has(id));
            startTransition(() => {
              commit((prev) => {
                const base = prev.scope === currentPlan.scope ? prev : emptyResolveState(currentPlan.scope);
                const data = new Map(base.data);
                for (const [id, value] of landed) data.set(id, value);
                if (absent.length === 0) return { ...base, data };
                const failed = new Set(base.failed);
                for (const id of absent) failed.add(id);
                return { ...base, data, failed };
              });
            });
          } catch {
            // A failed chunk must never read as "zero fields changed" — the
            // pairs that needed it go 'unavailable' instead.
            startTransition(() => {
              commit((prev) => {
                const base = prev.scope === currentPlan.scope ? prev : emptyResolveState(currentPlan.scope);
                const failed = new Set(base.failed);
                for (const id of chunk) failed.add(id);
                return { ...base, failed };
              });
            });
          } finally {
            for (const id of chunk) inFlightRef.current.delete(id);
          }
        }
      } while (pumpDirtyRef.current);
    } finally {
      pumpBusyRef.current = false;
    }
  }, [commit, countRelease, triggerRevisions]);

  useEffect(() => {
    planRef.current = plan;
    void runPump();
  }, [plan, runPump]);

  // --------------------------------------------------------------------------
  // OUTPUT
  // --------------------------------------------------------------------------
  const maxRef = useRef<{ scope: string; value: number }>({ scope, value: 0 });

  const derived = useMemo(() => {
    if (maxRef.current.scope !== scope) maxRef.current = { scope, value: 0 };

    const magnitudes: ReleaseMagnitude[] = [];
    const byReleaseId = new Map<string, ReleaseMagnitude>();
    let resolvedCount = 0;
    let totalCount = 0;

    // Nothing is in scope, so nothing can ever have changed: answer 0 now
    // rather than leaving every bar on a permanent "counting…" stub for a
    // request that will never be made.
    const nothingInScope = unitIds.length === 0;

    for (let i = 0; i < releases.length; i++) {
      const release = releases[i].Release;
      const releaseId = release?.ReleaseID ?? '';
      const releaseNum = release?.ReleaseNum ?? 0;
      const stub = {
        releaseId,
        releaseNum,
        changedFields: undefined,
        changedUnits: undefined,
        partial: false,
        failed: false,
      };

      let magnitude: ReleaseMagnitude;
      if (!active) {
        magnitude = nothingInScope
          ? { ...stub, changedFields: 0, changedUnits: 0, state: 'resolved' }
          : { ...stub, state: 'pending' };
      } else if (i > lastAvailableIndex) {
        magnitude = { ...stub, state: 'unavailable' };
      } else {
        totalCount++;
        // Keyed on the pair, so a release whose predecessor changed is
        // re-counted rather than reusing a number computed against a
        // predecessor that is no longer there.
        const count = view.counts.get(pairCountKey(releases[i + 1]?.Release?.ReleaseID, releaseId));
        if (!count) {
          magnitude = { ...stub, state: 'pending' };
        } else {
          resolvedCount++;
          // Monotonic: the normaliser only ever rises, so a bar never shrinks
          // when a later chunk (or a cache-invalidation refetch) lands.
          if (count.fields > maxRef.current.value) maxRef.current = { scope, value: count.fields };
          magnitude = {
            releaseId,
            releaseNum,
            changedFields: count.fields,
            changedUnits: count.units,
            state: 'resolved',
            partial: count.partial,
            failed: count.failed,
          };
        }
      }

      magnitudes.push(magnitude);
      if (releaseId) byReleaseId.set(releaseId, magnitude);
    }

    return {
      magnitudes,
      byReleaseId: byReleaseId as ReadonlyMap<string, ReleaseMagnitude>,
      maxChangedFields: maxRef.current.value,
      resolvedCount,
      totalCount,
    };
  }, [releases, active, lastAvailableIndex, view.counts, scope, unitIds]);

  // --------------------------------------------------------------------------
  // getPairDiff — a pure read over the same cache. Never fetches.
  // --------------------------------------------------------------------------
  const pairDiffCacheRef = useRef<{ token: readonly unknown[]; entries: Map<string, ReleasePairDiff> }>({
    token: [],
    entries: new Map(),
  });

  const getPairDiff = useCallback(
    (beforeReleaseId: string | undefined, afterReleaseId: string): ReleasePairDiff => {
      const token: readonly unknown[] = [plan, view.data, view.failed, active, phaseALanded];
      const cache = pairDiffCacheRef.current;
      const sameToken =
        cache.token.length === token.length && cache.token.every((value, i) => value === token[i]);
      if (!sameToken) pairDiffCacheRef.current = { token, entries: new Map() };
      const entries = pairDiffCacheRef.current.entries;
      const key = `${beforeReleaseId ?? '-'}→${afterReleaseId}`;
      const hit = entries.get(key);
      if (hit) return hit;

      const result = buildPairDiff(beforeReleaseId, afterReleaseId, plan, view, active, phaseALanded);
      entries.set(key, result);
      return result;
    },
    [plan, view, active, phaseALanded],
  );

  return {
    magnitudes: derived.magnitudes,
    byReleaseId: derived.byReleaseId,
    maxChangedFields: derived.maxChangedFields,
    resolvedCount: derived.resolvedCount,
    totalCount: derived.totalCount,
    isBootstrapping,
    truncated,
    getPairDiff,
  };
}

// ============================================================================
// PAIR DIFF
// ============================================================================

const NOTHING: ReleasePairDiff = {
  resultsByUnit: new Map(),
  totalChangedFields: 0,
  changedUnits: 0,
  skippedUnitCount: 0,
  isLoading: false,
  unavailable: false,
};

const STILL_LOADING: ReleasePairDiff = { ...NOTHING, resultsByUnit: new Map(), isLoading: true };

const NEVER: ReleasePairDiff = { ...NOTHING, resultsByUnit: new Map(), unavailable: true };

/**
 * Assemble the diff for an arbitrary release pair out of already-resolved data.
 *
 * `beforeReleaseId === undefined` is the "no predecessor" case (the globally
 * oldest release): every unit reads as `neverReleased` and every field as an
 * addition — never an empty diff.
 */
function buildPairDiff(
  beforeReleaseId: string | undefined,
  afterReleaseId: string,
  plan: MagnitudePlan,
  resolved: ResolveState,
  active: boolean,
  phaseALanded: boolean,
): ReleasePairDiff {
  if (!active) return NOTHING;
  if (!phaseALanded || !plan.active) return STILL_LOADING;
  if (!plan.windowReleaseIds.has(afterReleaseId)) return NEVER;
  if (beforeReleaseId != null && !plan.endpointReleaseIds.has(beforeReleaseId)) return NEVER;

  // A release that bundled nothing has no index entry at all; that is a real
  // "0 differences", not an unresolvable pair.
  const after = plan.releaseIndex.get(afterReleaseId) ?? EMPTY_UNIT_INDEX;
  const before = beforeReleaseId ? (plan.releaseIndex.get(beforeReleaseId) ?? EMPTY_UNIT_INDEX) : undefined;

  const resultsByUnit = new Map<string, UnreleasedUnitDiffResult>();
  let totalChangedFields = 0;
  let changedUnits = 0;
  let skippedUnitCount = 0;
  let unavailable = false;
  let isLoading = false;

  for (const unitId of plan.unitIds) {
    const resolution = resolveUnitPair(before?.get(unitId), after.get(unitId), resolved.data, resolved.failed);
    switch (resolution.kind) {
      case 'omit':
        break;
      case 'failed':
        skippedUnitCount++;
        unavailable = true;
        break;
      case 'skipped':
        skippedUnitCount++;
        break;
      case 'loading':
        // A blob nobody planned to fetch will never arrive — say so rather
        // than spinning forever.
        if (resolution.missing.some((id) => !plan.plannedRevisionIdSet.has(id))) unavailable = true;
        else isLoading = true;
        break;
      case 'done':
        resultsByUnit.set(unitId, resolution.result);
        totalChangedFields += resolution.fields;
        if (resolution.fields > 0) changedUnits++;
        break;
    }
  }

  if (unavailable) return NEVER;
  if (isLoading) return STILL_LOADING;
  return { resultsByUnit, totalChangedFields, changedUnits, skippedUnitCount, isLoading: false, unavailable: false };
}
