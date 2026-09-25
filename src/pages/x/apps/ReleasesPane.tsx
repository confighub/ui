// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * ReleasesPane — the whole body of the component side pane's Releases tab.
 *
 * Replaces BOTH of the sections this tab used to be made of
 * (`ReleaseHistorySection` + `UnreleasedChangesSection`). In this design
 * "unreleased" is not a separate surface: it is the EMPTY-SELECTION state of
 * one pane, and the working configuration is a pickable endpoint sitting in
 * the same list as every published release.
 *
 * Region order, top to bottom:
 *   1. sticky "RELEASES · <target>" strip
 *   2. the two release selectors (`ReleaseSelectors`), or the preserved
 *      "No releases yet." empty state
 *   3. the notes region — conditions the selectors cannot show: a release that
 *      bundled nothing, units drifted out of the target, history not fully
 *      loaded, release notes
 *   4. the diff panel (`ReleaseDiffPanel`)
 * The mockup's action row is NOT a second sticky footer: it maps onto the
 * shared `BottomBar` that `ComponentSidePane` already renders.
 *
 * The comparison names itself in the selectors, so there is no sentence
 * restating it. What a reader loses with the lane is magnitude at a glance
 * across the whole history; the counts survive per release inside the picker.
 *
 * === The three diff sources, and only three ===
 *   nothing selected / declared bar → the HEAD-scoped `useUnreleasedChanges`
 *       instance owned by `ComponentSidePane` and passed in (already fetched;
 *       it is the same instance that feeds the footer's count chip, which is
 *       what keeps "cannot publish while reading history" trustworthy).
 *   one release, or a release-to-release span → `magnitudes.getPairDiff`,
 *       served from the lane's own cache. NO fetch.
 *   a span whose upper end is the declared bar → one local
 *       `useUnreleasedChanges` in its DEFAULT mode, given the lower endpoint's
 *       ReleaseID: "diff head against an arbitrary release" is exactly what
 *       that mode already does. One request, no change to that hook.
 *
 * === Orientation: one normalisation, three consumers ===
 * A comparison ALWAYS runs older → newer. The lane hands back its two bar ids
 * in CLICK ORDER, and the user may well click the newer release first, so the
 * `comparison` memo below sorts the pair by ReleaseNum (the declared bar is
 * +Infinity — it is newer than everything published) and publishes the result
 * as old/new indices. The readout subject, the lane's span-start/span-end markers
 * and the diff panel's from/to labels + endpoint ids ALL read that one value.
 * They must never re-derive it: three independent min/max derivations is
 * exactly how a readout ends up disagreeing with the markers above it.
 *
 * === Deliberate deviations from the design file, recorded ===
 *  1. The mockup hard-codes `rel-18` as "current" in the readout; that is
 *     parameterised here.
 *  2. Selecting the OLDEST release compares it against NOTHING (every field
 *     is an addition). The mockup clamps `prev = max(0, i-1)`, which diffs the
 *     oldest release against itself and shows "0 differences".
 *  3. Ages are formatted by the local `formatReleaseAge` rather than the shared
 *     `formatTimeAgo`, which stops at hours — fine for the minute-scale
 *     activity feed it was written for, unreadable for a months-old release.
 *  4. Withdrawing a release is not offered here at all. The endpoint and the
 *     CLI (`cub release withdraw`) still support it; this pane reads history
 *     and publishes, and does not undo.
 *  5. A release has no author and no single revision: it bundles many units,
 *     each with a revision of its own. The picker shows the stored bundle's
 *     digest, labelled as a bundle digest, and shows no author at all rather
 *     than deriving one.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from './componentTheme';
import { groupFieldEntriesByDocument } from './diffTree';
import { buildGroupedPaths, countLogicalChanges } from './entryBuilders';
import { ReleaseDiffPanel, type ReleaseDiffUnitView } from './ReleaseDiffPanel';
import { ReleaseSelectors, type ReleaseOption } from './ReleaseSelectors';
import { LaneEmpty, Notes, Read, Sub, Top } from './releasePaneStyles';
import { getReleaseName, getReleaseNotes, type ReleaseActions } from './useReleaseActions';
import { useReleaseMagnitudes, type ReleaseUnitRef } from './useReleaseMagnitudes';
import { isHeavyUnitData } from './unitSizeGuard';
import { useUnreleasedChanges, type UnreleasedUnitDiffResult } from './useUnreleasedChanges';
import type { ExtendedReleaseRead } from '@confighub/rtk-query';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Sentinel bar id for the trailing, un-released "declared" state. */
export const DECLARED_BAR_ID = '__declared__';
/** The declared bar's short label — used in the lane, the readout and the diff header. */
const DECLARED_LABEL = 'decl';

/** Stable empty array: feeding `useUnreleasedChanges` a fresh `[]` would re-run its memos, and a non-empty list is what makes it fetch. */
const EMPTY_RELEASE_UNITS: ReleaseUnitRef[] = [];
const EMPTY_RESULTS: Map<string, UnreleasedUnitDiffResult> = new Map();

type SelectionMode = 'none' | 'single' | 'declared' | 'span';

/**
 * The oriented comparison the whole pane renders — the ONE value that decides
 * which end of the user's selection is old and which is new. Every index in it
 * is a position in `bars` (which is oldest-first).
 *
 * Nothing downstream is allowed to re-derive orientation from the raw
 * `selection`: the readout, the lane's endpoint markers and the diff panel all
 * read this. See `comparison` below for the normalisation itself.
 */
interface ReleaseComparison {
  mode: SelectionMode;
  /** OLDER end of the user's SELECTION — the lane's span-start ('A') marker. -1 when nothing is selected. */
  selectionFromIndex: number;
  /** NEWER end of the user's SELECTION — the lane's span-end ('B') marker. Equals `selectionFromIndex` for one bar. */
  selectionToIndex: number;
  /**
   * OLD (from / left / red / removed) side of the DIFF. For a span that is the
   * older endpoint; for a single release it is that release's PREDECESSOR, and
   * -1 means "nothing" — the oldest release has none, so every field it
   * bundled reads as an addition.
   */
  oldIndex: number;
  /** NEW (to / right / green / added) side of the DIFF. */
  newIndex: number;
}

const NO_COMPARISON: ReleaseComparison = {
  mode: 'none',
  selectionFromIndex: -1,
  selectionToIndex: -1,
  oldIndex: -1,
  newIndex: -1,
};

// ============================================================================
// PROPS
// ============================================================================

export interface ReleasesPaneProps {
  /** Bundled release state + handlers for the selected Space, from useReleaseActions. */
  release: ReleaseActions;
  /** The selected deployment's Space ID. */
  spaceId: string;
  /** Display name of the release Target, when resolvable. */
  targetName: string | undefined;
  /** Units in the Space's release-target set, at HEAD. */
  releaseUnits: ReleaseUnitRef[];
  /** Head-scoped unreleased diff — the SAME instance that feeds the footer chip. */
  unreleasedResultsByUnit: Map<string, UnreleasedUnitDiffResult>;
  unreleasedAllResolved: boolean;
  /** Deep link from a release stamp in the DAG, identified by ReleaseNum. */
  highlightRelease: { num: number; nonce: number } | null;
  /**
   * Called once the deep link above has been applied. The owner MUST clear it:
   * this pane is unmounted whenever the Configuration tab is showing, so a
   * consumption guard held here would be destroyed on every tab switch and the
   * same stale link would re-select its release on the next visit.
   */
  onHighlightConsumed: () => void;
  /** Lifted to ComponentSidePane so the shared BottomBar can swap its verb. 0–2 bar ids, in click order. */
  selection: readonly string[];
  /**
   * True while the pane's own default has not been decided yet.
   *
   * An empty `selection` reaches this component from two situations that mean
   * opposite things: the reader cleared both slots, where "nothing is selected"
   * is TRUE, and the default not yet being known, where it is a LIE. They are
   * indistinguishable here without being told, so they are told — the pane was
   * not missing a loading treatment, it was missing the distinction.
   */
  selectionPending?: boolean;
  onSelectionChange: (next: readonly string[]) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function labelOf(release: ExtendedReleaseRead | undefined): string {
  const num = release?.Release?.ReleaseNum;
  return num == null ? '—' : `rel-${num}`;
}


/** One release's resolved facts, oldest-first, as the comparison reads them. */
interface ReleaseBar {
  id: string;
  releaseNum: number;
  label: string;
  changedFields: number | undefined;
  state: 'pending' | 'resolved' | 'unavailable';
  variant: 'release' | 'declared';
  isCurrent: boolean;
  tooltipSuffix?: string;
}

/**
 * The sort key that DEFINES "newer" for this pane: ReleaseNum, never click
 * order and never lane position. The declared (un-released) state is newer
 * than every published release, so it sorts above all of them.
 */
function orderKeyOf(bar: ReleaseBar): number {
  return bar.id === DECLARED_BAR_ID ? Number.POSITIVE_INFINITY : bar.releaseNum;
}

/**
 * Age of a release, in the design file's own short vocabulary (`9h` / `6d` /
 * `5w` / `8mo`). The shared `formatTimeAgo` has no tier above hours, which is
 * fine for the activity feed's minute-scale events and useless here: release
 * history routinely spans months, and `6480h ago` is not a readable age.
 * Local rather than a change to `formatTimeAgo`, which other callers depend on.
 */
function formatReleaseAge(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 28) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 2) return `${Math.floor(days / 7)}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Short absolute time, for the question a relative age cannot answer. */
function formatReleaseStamp(date: Date): string {
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Resource kind for the diff panel's `Kind | name` header, when the unit
 * resolves to exactly one identifiable document. Oversized units are never
 * parsed just to label them — they fall back to the literal "Unit".
 */
function resourceKindOf(data: string | undefined): string | undefined {
  if (!data || isHeavyUnitData(data)) return undefined;
  const entries = buildGroupedPaths(data);
  if (entries.length === 0) return undefined;
  const groups = groupFieldEntriesByDocument(entries);
  if (groups.length !== 1) return undefined;
  const type = groups[0].resource?.ResourceType;
  if (!type) return undefined;
  const kind = type.slice(type.lastIndexOf('/') + 1);
  return kind || undefined;
}

/** Total logical changes + how many units carry at least one, over a resolved diff map. */
function summarise(
  units: ReleaseUnitRef[],
  resultsByUnit: Map<string, UnreleasedUnitDiffResult>,
): { fields: number; units: number } {
  let fields = 0;
  let changedUnits = 0;
  for (const u of units) {
    const r = resultsByUnit.get(u.unitId);
    if (!r) continue;
    const n = countLogicalChanges(r.fieldDiffs.map((d) => d.path));
    if (n > 0) changedUnits += 1;
    fields += n;
  }
  return { fields, units: changedUnits };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ReleasesPane({
  release,
  spaceId,
  targetName,
  releaseUnits,
  unreleasedResultsByUnit,
  unreleasedAllResolved,
  highlightRelease,
  onHighlightConsumed,
  selection,
  selectionPending = false,
  onSelectionChange,
}: ReleasesPaneProps): ReactElement {
  const { releases, latestRelease, isReleasesLoading, emptyBundleWarnings } = release;

  const currentReleaseId = latestRelease?.Release?.ReleaseID;
  const currentReleaseLabel = labelOf(latestRelease);

  // A release target can exist before any Unit is pointed at it. Every diff
  // source reports `allResolved: false` for an empty unit list (there is
  // nothing to resolve), so without this guard the pane would sit on a
  // skeleton for ever. "Nothing is in scope yet" is a real answer, and the
  // section this pane replaced said so explicitly — keep saying it.
  const hasUnits = releaseUnits.length > 0;

  // ── Lane magnitudes (progressive, client-side) ──
  const magnitudes = useReleaseMagnitudes({
    releases,
    units: releaseUnits,
    spaceId,
    enabled: hasUnits,
  });

  // ── The declared (un-released) bar's own count ──
  // With nothing in scope no diff source ever reports `allResolved`, so the
  // count has to be answered here: an empty unit set has zero changed fields,
  // and leaving it undefined would strand the bar on "counting…" for ever.
  const declaredTotals = useMemo(
    () =>
      !hasUnits
        ? { fields: 0, units: 0 }
        : unreleasedAllResolved
          ? summarise(releaseUnits, unreleasedResultsByUnit)
          : undefined,
    [hasUnits, unreleasedAllResolved, releaseUnits, unreleasedResultsByUnit],
  );

  // ── Bars, OLDEST FIRST (the lane's own order); `releases` is newest-first ──
  const bars = useMemo((): ReleaseBar[] => {
    if (releases.length === 0) return [];
    const out: ReleaseBar[] = [];
    for (let i = releases.length - 1; i >= 0; i--) {
      const id = releases[i].Release?.ReleaseID;
      if (!id) continue;
      const m = magnitudes.byReleaseId.get(id);
      out.push({
        id,
        // `releases` is sorted by ReleaseNum descending, so the loop above
        // already walks oldest-first; carrying the number itself is what lets
        // the comparison below orient by ReleaseNum rather than by trusting
        // that ordering to hold.
        releaseNum: releases[i].Release?.ReleaseNum ?? 0,
        label: labelOf(releases[i]),
        changedFields: m?.changedFields,
        state: m?.state ?? 'pending',
        variant: 'release',
        isCurrent: id === currentReleaseId,
        // A fetch that failed and a unit too big to parse both understate the
        // bar, but blaming size for a network error is simply untrue.
        tooltipSuffix: m?.failed
          ? 'some units could not be loaded'
          : m?.partial
            ? 'excludes oversized units'
            : undefined,
      });
    }
    out.push({
      id: DECLARED_BAR_ID,
      // Newer than every published release, by definition: it IS the state
      // that has not been released yet.
      releaseNum: Number.POSITIVE_INFINITY,
      label: DECLARED_LABEL,
      changedFields: declaredTotals?.fields,
      state: declaredTotals ? 'resolved' : 'pending',
      variant: 'declared',
      isCurrent: false,
    });
    return out;
  }, [releases, magnitudes.byReleaseId, currentReleaseId, declaredTotals]);

  // ── Selector options: the same per-release facts the bars carried, newest
  // first, plus the fields only the release itself holds. Anything the data
  // does not have is absent rather than filled in. ──
  const options = useMemo((): ReleaseOption[] => {
    const byId = new Map(releases.map((r) => [r.Release?.ReleaseID ?? '', r]));
    const out: ReleaseOption[] = [];
    for (let i = bars.length - 1; i >= 0; i--) {
      const bar = bars[i];
      const release = byId.get(bar.id);
      const created = release?.Release?.CreatedAt ? new Date(release.Release.CreatedAt) : undefined;
      const digest = release?.Release?.Digest;
      out.push({
        id: bar.id,
        label: bar.variant === 'declared' ? 'Working config' : bar.label,
        displayName: release ? getReleaseName(release) : undefined,
        isCurrent: bar.isCurrent,
        isDeclared: bar.variant === 'declared',
        stamp: created ? formatReleaseStamp(created) : undefined,
        age: created ? formatReleaseAge(created) : undefined,
        // Identifies the stored bundle. Not a revision of anything.
        bundleDigest: digest ? digest.replace(/^sha256:/, '').slice(0, 7) : undefined,
        changedFields: bar.changedFields,
        state: bar.state === 'resolved' ? 'resolved' : bar.state === 'unavailable' ? 'unavailable' : 'pending',
        note: bar.tooltipSuffix,
      });
    }
    return out;
  }, [bars, releases]);

  // ══════════════════════════════════════════════════════════════════════
  // THE SINGLE POINT OF NORMALISATION
  // ══════════════════════════════════════════════════════════════════════
  //
  // `selection` arrives in CLICK ORDER, and the user is free to click the
  // newer release first. That order is never rendered: the pair is sorted by
  // `orderKeyOf` (ReleaseNum, declared = +Infinity) so the LOWER ReleaseNum is
  // always the from/old/left/red side and the HIGHER one always the
  // to/new/right/green side.
  //
  // Every direction-bearing surface derives from THIS value and nothing else:
  //   * the readout subject (`rel-5 → rel-15`, never reversed),
  //   * the lane's `spanStartId` / `spanEndId` marker props,
  //   * the diff panel's `fromLabel`/`toLabel` and the `getPairDiff` /
  //     `useUnreleasedChanges` endpoint ids beneath them.
  // Three independent min/max derivations is exactly how a readout and a set
  // of markers drift apart, so there is one, here.
  //
  // Ids whose release has left `releases` simply drop out. This pane no longer
  // withdraws anything, so that can only come from elsewhere — the CLI, or
  // another session — and only after something else invalidates this query.
  const comparison = useMemo((): ReleaseComparison => {
    const indices: number[] = [];
    for (const id of selection) {
      const i = bars.findIndex((b) => b.id === id);
      if (i >= 0 && !indices.includes(i)) indices.push(i);
    }
    if (indices.length === 0) return NO_COMPARISON;

    indices.sort((a, b) => orderKeyOf(bars[a]) - orderKeyOf(bars[b]));
    const from = indices[0];
    const to = indices[indices.length - 1];

    if (indices.length === 1) {
      return {
        mode: bars[from].id === DECLARED_BAR_ID ? 'declared' : 'single',
        selectionFromIndex: from,
        selectionToIndex: from,
        // A single release is compared against its PREDECESSOR, which is the
        // next bar down the same ReleaseNum ordering. -1 for the oldest
        // release, which has none.
        oldIndex: from - 1,
        newIndex: from,
      };
    }

    // A PAIR WHOSE BASE IS THE TARGET'S IMMEDIATE PREDECESSOR IS THE SAME
    // COMPARISON AS THE TARGET ALONE, so it is that comparison — named at both
    // ends rather than at one.
    //
    // ONE PREDICATE, TWO ARMS. Between two releases it means "what the newer
    // one changed"; between the current release and the declared state it means
    // "what has not been released". Both say the same thing: the pane must not
    // name a comparison by how the reader assembled it. A reader who lands on
    // the default and one who builds the same pair by hand are looking at the
    // same two things.
    //
    // The BASE must be a real release. A span from an OLDER release to the
    // declared state is not this case — its base is not the target's
    // predecessor, and the head-scoped unreleased query would be the wrong
    // source for it — so it stays a span.
    if (indices.length === 2 && to === from + 1 && bars[from].id !== DECLARED_BAR_ID) {
      const targetIsDeclared = bars[to].id === DECLARED_BAR_ID;
      return {
        mode: targetIsDeclared ? 'declared' : 'single',
        // The TARGET is what is being read, exactly as if it had been selected
        // on its own.
        selectionFromIndex: to,
        selectionToIndex: to,
        oldIndex: from,
        newIndex: to,
      };
    }
    return {
      mode: 'span',
      selectionFromIndex: from,
      selectionToIndex: to,
      oldIndex: from,
      newIndex: to,
    };
  }, [selection, bars]);

  const { mode, selectionFromIndex, oldIndex, newIndex } = comparison;

  const liveSelection = useMemo(
    () => selection.filter((id) => bars.some((b) => b.id === id)),
    [selection, bars],
  );

  const handleSelectionChange = useCallback(
    (next: readonly string[]) => {
      onSelectionChange(next);
    },
    [onSelectionChange],
  );

  // ── Deep link from a release stamp in the DAG ──
  // Selects the release in the first slot. The nonce is
  // consumed only once the release list has actually loaded, so a deep link
  // that arrives first still lands. Consumption is reported to the owner, which
  // clears the link — the local ref alone cannot be the guard, because this
  // component unmounts every time the Configuration tab is shown.
  const consumedHighlightNonce = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!highlightRelease || highlightRelease.nonce === consumedHighlightNonce.current) return;
    if (releases.length === 0) return;
    consumedHighlightNonce.current = highlightRelease.nonce;
    onHighlightConsumed();
    const match = releases.find((r) => r.Release?.ReleaseNum === highlightRelease.num);
    const id = match?.Release?.ReleaseID;
    if (!id) return;
    onSelectionChange([id]);
  }, [highlightRelease, releases, onSelectionChange, onHighlightConsumed]);

  // ── Diff source 3: a span whose NEWER endpoint is the declared bar ──
  // `useUnreleasedChanges`' DEFAULT mode is "old = the revisions bundled into
  // <release>, new = head", which is exactly an older-release→declared span.
  // Both endpoints come from the normalised comparison, so selecting the
  // declared bar FIRST and the release second still puts the release on the
  // old side and the declared state on the new side. Fed the stable empty list
  // in every other mode, so it fetches nothing.
  const spanToDeclared = mode === 'span' && bars[newIndex]?.id === DECLARED_BAR_ID;
  const spanLowerReleaseId = spanToDeclared ? bars[oldIndex]?.id : undefined;
  const spanDiff = useUnreleasedChanges(
    spanToDeclared ? releaseUnits : EMPTY_RELEASE_UNITS,
    spanLowerReleaseId,
    spaceId,
  );

  // ── Resolve the ACTIVE comparison ──
  const releaseAt = useCallback(
    (index: number): ExtendedReleaseRead | undefined => {
      const bar = bars[index];
      if (!bar || bar.id === DECLARED_BAR_ID) return undefined;
      return releases.find((r) => r.Release?.ReleaseID === bar.id);
    },
    [bars, releases],
  );

  const pairDiff = magnitudes.getPairDiff;
  const active = useMemo(() => {
    // Nothing in scope ⇒ nothing to wait for. Every branch below resolves
    // immediately to "0 differences", and the readout carries the reason.
    const noUnitsSubtitle = 'No units are targeted at this release yet';
    if (mode === 'none' || mode === 'declared') {
      return {
        resultsByUnit: unreleasedResultsByUnit,
        isLoading: hasUnits && !unreleasedAllResolved,
        unavailable: false,
        fromLabel: currentReleaseLabel,
        toLabel: DECLARED_LABEL,
        emptySubtitle: hasUnits ? 'Identical declared values' : noUnitsSubtitle,
      };
    }
    if (mode === 'single') {
      // `newIndex`/`oldIndex` — not the raw click — so "selected release" and
      // "its predecessor" land on the right sides of the diff.
      const after = releaseAt(newIndex);
      const before = releaseAt(oldIndex);
      const afterId = after?.Release?.ReleaseID;
      const diff = afterId && hasUnits
        ? pairDiff(before?.Release?.ReleaseID, afterId)
        : undefined;
      return {
        resultsByUnit: diff?.resultsByUnit ?? EMPTY_RESULTS,
        isLoading: hasUnits && (diff?.isLoading ?? true),
        // A pair whose revision blobs could not be fetched reports nothing —
        // which must not be rendered as the claim "nothing changed".
        unavailable: diff?.unavailable ?? false,
        // Fix vs the mockup: the OLDEST release has no predecessor, so every
        // field it bundled reads as an addition rather than as "0 differences".
        fromLabel: before ? labelOf(before) : 'nothing',
        toLabel: labelOf(after),
        emptySubtitle: hasUnits ? 'No fields changed in this release' : noUnitsSubtitle,
      };
    }
    if (spanToDeclared) {
      return {
        resultsByUnit: spanDiff.resultsByUnit,
        isLoading: hasUnits && !spanDiff.allResolved,
        unavailable: false,
          fromLabel: bars[oldIndex]?.label ?? '—',
        toLabel: DECLARED_LABEL,
        emptySubtitle: hasUnits ? 'Endpoints are identical' : noUnitsSubtitle,
      };
    }
    // Older endpoint on the old side, newer endpoint on the new side — always,
    // because both come from the normalised comparison rather than from the
    // order the two bars were clicked in.
    const oldRelease = releaseAt(oldIndex);
    const newRelease = releaseAt(newIndex);
    const newId = newRelease?.Release?.ReleaseID;
    const diff = newId && hasUnits ? pairDiff(oldRelease?.Release?.ReleaseID, newId) : undefined;
    return {
      resultsByUnit: diff?.resultsByUnit ?? EMPTY_RESULTS,
      isLoading: hasUnits && (diff?.isLoading ?? true),
      unavailable: diff?.unavailable ?? false,
      fromLabel: labelOf(oldRelease),
      toLabel: labelOf(newRelease),
      emptySubtitle: hasUnits ? 'Endpoints are identical' : noUnitsSubtitle,
    };
  }, [
    mode,
    oldIndex,
    newIndex,
    bars,
    hasUnits,
    spanToDeclared,
    spanDiff.resultsByUnit,
    spanDiff.allResolved,
    unreleasedResultsByUnit,
    unreleasedAllResolved,
    currentReleaseLabel,
    releaseAt,
    pairDiff,
  ]);

  const diffUnits = useMemo((): ReleaseDiffUnitView[] => {
    const out: ReleaseDiffUnitView[] = [];
    for (const u of releaseUnits) {
      const result = active.resultsByUnit.get(u.unitId);
      if (!result || result.fieldDiffs.length === 0) continue;
      out.push({
        unitId: u.unitId,
        slug: u.slug,
        // Carries the unit-details link in the diff header. Read off the unit
        // ref rather than the pane's `spaceId` prop: the two agree today (the
        // target set is scoped to the selected deployment) but the ref is the
        // unit's own Space, which is what the route actually needs.
        spaceId: u.spaceId,
        kind: resourceKindOf(result.oldData ?? u.data),
        result,
      });
    }
    return out;
  }, [releaseUnits, active.resultsByUnit]);

  // ── Readout ──
  // ONLY a single-release selection is describing a published release. In every
  // other mode the readout is describing unreleased or spanning work, so a
  // release's name, notes and empty-bundle badge would be attached to something
  // that does not have them.
  const readoutRelease = mode === 'single' ? releaseAt(selectionFromIndex) : undefined;
  const readoutReleaseId = readoutRelease?.Release?.ReleaseID;
  const readoutNotes = readoutRelease ? getReleaseNotes(readoutRelease) : undefined;
  const emptyBundleWarning = readoutReleaseId ? emptyBundleWarnings.get(readoutReleaseId) : undefined;

  // The current release's empty-bundle warning still has to reach the reader in
  // the default state — that is where the pane lands right after the publish
  // that raised it — but on its own line, naming the release it is about.
  const currentEmptyBundleWarning =
    (mode === 'none' || mode === 'declared') && currentReleaseId
      ? emptyBundleWarnings.get(currentReleaseId)
      : undefined;

  // Only say something about unit-set drift when the numbers actually
  // disagree, and name the release it is true for — never a standing
  // disclaimer every reader learns to stop seeing.
  const drift = useMemo(() => {
    if (mode !== 'single' || active.isLoading || active.unavailable) return undefined;
    // `0`/absent both mean "not known": UnitCount is a plain int64, so an old
    // response that never carried it is indistinguishable from a real zero —
    // and a zero-unit release has no drift to report either way.
    const total = readoutRelease?.Release?.UnitCount;
    if (!total) return undefined;
    const shown = releaseUnits.filter((u) => active.resultsByUnit.has(u.unitId)).length;
    return shown < total ? { shown, total } : undefined;
  }, [mode, active.isLoading, active.unavailable, active.resultsByUnit, readoutRelease, releaseUnits]);

  const hasUnavailableBar = bars.some((b) => b.state === 'unavailable');
  const showTruncationNote = magnitudes.truncated || hasUnavailableBar;

  return (
    <Box data-testid='releases-pane'>
      <Top>
        <b>Releases</b>
        <span>{targetName ?? 'Declared'}</span>
      </Top>

      {bars.length === 0 ? (
        isReleasesLoading ? (
          <LaneEmpty data-testid='release-loading'>Loading…</LaneEmpty>
        ) : (
          <LaneEmpty data-testid='release-empty'>No releases yet.</LaneEmpty>
        )
      ) : selectionPending ? (
        // The releases are known and the default is not. Two blank selectors
        // would say "nothing is selected", which is a different claim and a
        // false one. The diff region below already holds for the same reason —
        // its `isLoading` is the same unresolved count — so this is the one
        // element that was asserting a state it could not know.
        <LaneEmpty data-testid='release-loading'>Loading…</LaneEmpty>
      ) : (
        <ReleaseSelectors
          options={options}
          selection={liveSelection}
          onSelectionChange={handleSelectionChange}
        />
      )}

          {/* The comparison names itself in the two selectors above, so the
              sentence that used to restate it is gone. What is left here are
              the conditions a reader cannot see from the selectors: a release
              that bundled nothing, units that have drifted out of the target,
              history that did not all load. `data-mode` stays because it is the
              pane's one normalised comparison mode, and the region below is
              read against it. */}
          <Read data-testid='release-notes' data-mode={mode}>
            {readoutNotes && (
              <Notes title={readoutNotes} data-testid='component-release-notes'>
                {readoutNotes}
              </Notes>
            )}
            {emptyBundleWarning && (
              <Sub $tone='attention' data-testid='component-release-empty-warning'>
                Bundled 0 units.
              </Sub>
            )}
            {currentEmptyBundleWarning && (
              <Sub $tone='attention' data-testid='component-release-empty-warning'>
                {currentReleaseLabel} bundled 0 units.
              </Sub>
            )}
            {drift && (
              <Sub $tone='attention' data-testid='unreleased-changes-drift-note'>
                Showing {drift.shown} of {drift.total} units — the rest are no longer in this target.
              </Sub>
            )}
            {showTruncationNote && (
              <Sub data-testid='release-truncated-note'>Older releases not loaded.</Sub>
            )}
            {/* Carried over from the section this pane replaced: a configured
                release target with nothing pointed at it reads as "the feature
                is broken" unless the pane says otherwise. Informational, not a
                warning. */}
            {!hasUnits && (
              <Sub data-testid='unreleased-changes-no-units'>
                No units are targeted at this release yet — their config won&rsquo;t appear here until
                they&rsquo;re pointed at this space&rsquo;s release target.
              </Sub>
            )}
          </Read>


      <ReleaseDiffPanel
        fromLabel={active.fromLabel}
        toLabel={active.toLabel}
        units={diffUnits}
        isLoading={active.isLoading}
        unavailable={active.unavailable}
        emptySubtitle={active.emptySubtitle}
      />

      {/* Bottom breathing room so the last diff row is not flush against the
          shared footer the pane renders below this. */}
      <Box sx={{ height: 8, background: componentTheme.bgDefault }} />
    </Box>
  );
}
