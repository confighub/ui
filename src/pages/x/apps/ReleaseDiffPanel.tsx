// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * ReleaseDiffPanel — the diff surface of the Releases pane (v7
 * "height-encoded").
 *
 * Purely presentational: it receives already-resolved per-unit diffs and draws
 * them. It fetches nothing, owns no app state, and never mutates anything —
 * the Releases tab is a read-only surface.
 *
 * === The reuse seam ===
 * The rows themselves are NOT drawn here. Every unit renders exactly one
 * `TreeDiffSection` — the same shared three-column path | before | after tree
 * the revision-compare drawer, the activity feed and the invoker result card
 * use. This module owns only the chrome around it: the loading / unavailable /
 * empty three-way split, and the per-unit header (kind, unit-details link, the
 * never-released badge and the `{n}F` changed-field count).
 *
 * The drawer's own chrome — the `Drawer` itself, the revision-picker rail, the
 * change-count pill, the Fields/Source toggle — is deliberately NOT brought
 * across. In this pane the lane above IS the picker; a second one would
 * contradict it.
 *
 * === How the tree is built ===
 * This pane always renders `showAllContext: false` — the mode the activity feed
 * and the invoker card already use. `TreeDiffSection` then builds its tree from the
 * CHANGED paths alone (`buildDiffTree`), collapses the single-child folder
 * chains above them, and injects only the identifying sibling of an array
 * element (`injectKeyContext`). A unit with one changed field under
 * `rules.1.verbs.0` is therefore TWO rows — the collapsed folder
 * `rules.1.verbs` and the leaf `0` — not the whole document. `allPaths` is
 * still handed over, so each dotted segment of a folder row keeps its
 * "show N more" click target: per-branch disclosure survives, wholesale
 * context does not.
 *
 * The shared component's opt-in mode — every path rendered, unchanged ones
 * dimmed — is reachable from the revision-compare drawer, which passes
 * `showAllContext` unconditionally. This pane no longer offers it.
 *
 * === The old ∪ changed union, and why it is load-bearing ===
 * `buildContextTree` walks `allPaths` and nothing else: a changed path missing
 * from that list is silently dropped. This pane's `result.allPaths` is the OLD
 * side of the comparison (see `useUnreleasedChanges`), whereas the three
 * pre-existing `TreeDiffSection` callers all pass the AFTER side. Handing the
 * old side straight to the shared component's all-context mode would erase
 * every ADDED field, and for
 * a `neverReleased` unit (whose old side is empty) would render nothing at all.
 *
 * `toTreeDiffInput` fixes that with a union rather than a fetch: a path in the
 * new side but not the old side is BY DEFINITION a changed path — the diff
 * builder emits `oldValue: '-'` for it — so `old ∪ changed ≡ old ∪ new`. The
 * union is complete. Its one cosmetic cost: an appended new-only path sorts to
 * the end of its folder rather than into document order. No duplicate folder
 * appears (`buildContextTree` dedupes folder names by key), only the ordering
 * inside a folder shifts.
 *
 * === Width ===
 * The shared tree is three percentage-width columns, so it degrades rather than
 * breaks as the side pane narrows. At the 650px default the columns are
 * comfortable; dragged down to ~380px the rows auto-wrap and stay legible but
 * cramped, and long dotted folder labels can spill past the first divider
 * (`PropertyCell` is right-aligned and `overflow: visible`). That artefact is
 * accepted: fixing it means editing `PropertyCell`, which has seven importers.
 * Two escape hatches already exist — the draggable dividers, and
 * `stableColumnStyle` below, which this panel fully controls.
 */
import { memo, useMemo, type CSSProperties } from 'react';
import type { ReactElement } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

import type { FieldDiff } from './componentTypes';
import { countLogicalChanges } from './entryBuilders';
import { ImageChangeRows } from './ImageChangeRows';
import { buildImageRows, parseImagePath, type ImageRowModel } from './imageRef';
import {
  EmptyBlock,
  EmptyValue,
  PANE_PX,
  Sub,
  UnitBadge,
  UnitBlock,
  UnitCount,
  UnitHead,
  UnitKind,
  UnitName,
  UnitNameLink,
  VisuallyHidden,
} from './releasePaneStyles';
import { TreeDiffSection, type TreeDiffDomHooks } from './TreeDiffSection';
import { useColumnResize } from './useColumnResize';
import type { UnreleasedUnitDiffResult } from './useUnreleasedChanges';

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export interface ReleaseDiffUnitView {
  unitId: string;
  slug: string;
  /**
   * Space the unit lives in — the other half of the unit-details route. Omitted
   * (or empty) when the unit cannot be located: a unit named by a historical
   * release's bundle that has since been deleted still has a slug to print, but
   * no page to open. Such a header renders as plain text, never a dead link.
   */
  spaceId?: string;
  /**
   * Resource kind for the `Kind | name` header line, when the unit resolves to
   * exactly one identifiable document. Falls back to the literal `Unit`.
   */
  kind?: string;
  result: UnreleasedUnitDiffResult;
}

export interface ReleaseDiffPanelProps {
  /**
   * The comparison's two endpoint labels, already normalised older -> newer by
   * `ReleasesPane`: `fromLabel` is the OLD side and `toLabel` the NEW one.
   *
   * `fromLabel` keys the rendered rows, so moving to a different comparison
   * remounts them rather than letting one comparison's rows reconcile into
   * another's. `toLabel` also names the release in a unit's "added in" badge.
   */
  fromLabel: string;
  toLabel: string;
  /** Already filtered to units with >= 1 changed field, in stable order. */
  units: ReleaseDiffUnitView[];
  isLoading: boolean;
  /**
   * The comparison can never resolve (a revision fetch failed). Distinct from
   * empty: "nothing changed" is a claim about the data, and it must not be made
   * on behalf of data that never arrived.
   */
  unavailable?: boolean;
  /** Sub-line for the empty state; the wording differs per selection mode. */
  emptySubtitle: string;
}

// ============================================================================
// ADAPTER
// ============================================================================


/** One unit's resolved inputs for `TreeDiffSection`, plus the panel's verdict on them. */
interface ReleaseUnitTree {
  unit: ReleaseDiffUnitView;
  entry: { unitId: string; fieldDiffs: FieldDiff[] };
  allPaths: { path: string; value: string }[];
  /** Container images, hoisted out of the tree to the head of the unit. */
  imageRows: ImageRowModel[];
  /** Logical (array-collapsed) changed-field count for the `{n}F` header. */
  changedFields: number;
}

/**
 * Union this unit's OLD-side paths with its changed paths.
 *
 * `buildContextTree` walks `allPaths` and nothing else, so a changed path
 * missing from that list is silently dropped — and this pane's
 * `result.allPaths` is the OLD side (see the module header), meaning the side
 * with the LOWER ReleaseNum: `ReleasesPane` orients the pair before it ever
 * reaches `getPairDiff`, so "old" here is the older release even when the user
 * clicked the newer one first. A path in the new
 * side but not the old side is BY DEFINITION a changed path (the diff builder
 * emits `oldValue: '-'` for it), so `old ∪ changed ≡ old ∪ new`: the union is
 * complete. It is built unconditionally, not just for the opt-in mode, because
 * the default mode also reads `allPaths` — for `injectKeyContext` and for the
 * per-segment "show N more" counts, both of which want the new side too.
 *
 * Module-private on purpose: this file's only exports are the component and its
 * types, which is what keeps Fast Refresh working for the pane.
 */
function unionPaths(unit: ReleaseDiffUnitView): { path: string; value: string }[] {
  const { fieldDiffs, allPaths: oldPaths } = unit.result;
  const seen = new Set(oldPaths.map((e) => e.path));
  const extras = fieldDiffs
    .filter((d) => !seen.has(d.path))
    .map((d) => ({ path: d.path, value: d.newValue }));
  // Preserve the array REFERENCE when nothing is appended: `buildPaths` is
  // content-addressed and memoised, and `TreeDiffSection` memoises its tree on
  // `allPaths` identity.
  return extras.length === 0 ? oldPaths : [...oldPaths, ...extras];
}


/**
 * Drop the container-image paths a caller renders itself.
 *
 * Preserves the array REFERENCE when nothing matches, for the same reason
 * {@link unionPaths} does: `TreeDiffSection` memoises its tree on `allPaths`
 * identity, and most units have no images at all.
 */
function withoutImagePaths<T extends { path: string }>(entries: T[]): T[] {
  const kept = entries.filter((e) => parseImagePath(e.path) === null);
  return kept.length === entries.length ? entries : kept;
}

/** Resolve every unit's tree inputs in one pass. */
function buildUnitTrees(units: ReleaseDiffUnitView[]): ReleaseUnitTree[] {
  return units.map((unit) => {
    const allPaths = unionPaths(unit);
    return {
      unit,
      // Images render as their own rows, so the tree is handed everything else.
      // That also removes the folder chains which existed only to reach an
      // image — a path segment spent on nothing the user asked to see.
      entry: { unitId: unit.unitId, fieldDiffs: withoutImagePaths(unit.result.fieldDiffs) },
      allPaths,
      imageRows: buildImageRows(unit.result.fieldDiffs, allPaths),
      // Counted from the UNMODIFIED change list, upstream of the split above, so
      // neither half can move the number. An image bump is a change and counts;
      // an unchanged container comes from `allPaths` and never enters this list.
      changedFields: countLogicalChanges(unit.result.fieldDiffs.map((d) => d.path)),
    };
  });
}

/**
 * Module-level and frozen: `TreeDiffSection` is memoised, and a fresh object
 * literal per render would defeat that for every unit on the panel.
 */
const RELEASE_DIFF_DOM_HOOKS: TreeDiffDomHooks = Object.freeze({
  testIdPrefix: 'release-diff',
  // Colour alone must not carry old-vs-new. The shared tree paints red/green;
  // these words make the same distinction available to a screen reader.
  srValuePrefix: Object.freeze({ old: 'removed: ', new: 'added: ' }),
});

// ============================================================================
// UNIT BLOCK
// ============================================================================

interface UnitDiffProps {
  tree: ReleaseUnitTree;
  toLabel: string;
  /**
   * Carries the identity of the CURRENT comparison AND of the current
   * rendering mode. `TreeDiffSection` seeds each folder's expansion once per
   * mount and never lifts it, and its root React key is built from `keyPrefix`
   * + unitId + the root node key. Without the comparison in the prefix,
   * re-pointing the pane at another release would reuse the same instances and
   * carry the previous comparison's expansion into the new one.
   */
  keyPrefix: string;
  columnStyle: CSSProperties;
  onDividerMouseDown: (columnIndex: 0 | 1, e: React.MouseEvent) => void;
  isDragging: boolean;
}

function UnitDiff({
  tree,
  toLabel,
  keyPrefix,
  columnStyle,
  onDividerMouseDown,
  isDragging,
}: UnitDiffProps): ReactElement {
  const { unit, changedFields } = tree;

  // Both halves of `/units/:spaceID/:id` must be present for the route to
  // resolve; a unit deleted since the release it appears in has no page left to
  // open, and a link to one would 404. Plain text is the honest rendering.
  const detailsHref =
    unit.unitId && unit.spaceId ? `/units/${unit.spaceId}/${unit.unitId}` : undefined;

  return (
    <UnitBlock data-testid={`release-diff-unit-${unit.unitId}`}>
      {/* `UnitHead` is a plain Box and no ancestor of it carries a click
          handler — the only clickable rows in this panel are the folder rows
          INSIDE the tree below. So the link needs no propagation guard: there
          is nothing above it for a click to reach. */}
      <UnitHead>
        <UnitKind>{unit.kind ?? 'Unit'}</UnitKind>
        {detailsHref ? (
          <UnitNameLink
            href={detailsHref}
            // New tab, as every other unit-details link in this side pane does
            // (ComponentSidePane's `UnitSlug`, UnitDetailsPane, InspectPanel):
            // the pane is an overlay on the component graph and navigating in
            // place would discard the whole selection the user built to get
            // here.
            target='_blank'
            rel='noopener noreferrer'
            data-testid={`release-diff-unit-link-${unit.unitId}`}
          >
            {unit.slug}
            <VisuallyHidden> (opens unit details in a new tab)</VisuallyHidden>
          </UnitNameLink>
        ) : (
          <UnitName>{unit.slug}</UnitName>
        )}
        {unit.result.neverReleased && (
          <UnitBadge data-testid='unreleased-unit-badge'>{`added in ${toLabel}`}</UnitBadge>
        )}
        <UnitCount>{`${changedFields}F`}</UnitCount>
      </UnitHead>
      <ImageChangeRows
        rows={tree.imageRows}
        testIdPrefix={RELEASE_DIFF_DOM_HOOKS.testIdPrefix}
        srValuePrefix={RELEASE_DIFF_DOM_HOOKS.srValuePrefix}
      />
      <TreeDiffSection
        entry={tree.entry}
        allPaths={tree.allPaths}
        keyPrefix={keyPrefix}
        label=''
        hideLabel
        variant='data'
        domHooks={RELEASE_DIFF_DOM_HOOKS}
        columnStyle={columnStyle}
        onDividerMouseDown={onDividerMouseDown}
        isDragging={isDragging}
      />
    </UnitBlock>
  );
}

// ============================================================================
// PANEL
// ============================================================================


function ReleaseDiffPanelImpl({
  fromLabel,
  toLabel,
  units,
  isLoading,
  unavailable = false,
  emptySubtitle,
}: ReleaseDiffPanelProps): ReactElement {
  // ONE column model for the whole panel, exactly as ComponentActivityFeed and
  // FunctionDetailScreen do it: the columns stay aligned down the page, and
  // dragging any one divider rebalances every unit at once.
  const { columnStyle, onDividerMouseDown, isDragging } = useColumnResize();
  const col1 = (columnStyle as Record<string, string>)['--col1-width'];
  const col2 = (columnStyle as Record<string, string>)['--col2-width'];
  // `useColumnResize` rebuilds `columnStyle` as a fresh object literal on every
  // render, which would defeat `TreeDiffSection`'s memo for every unit.
  const stableColumnStyle = useMemo(
    () => ({ '--col1-width': col1, '--col2-width': col2 }) as CSSProperties,
    [col1, col2],
  );

  // Panel-level, because it is one question about the whole comparison. Seeded
  // from (and mirrored back into) the module's session memory so clicking a
  // different bar — which changes this panel's PROPS, never its identity —
  // cannot reset it, and neither can a trip through the Configuration tab.
  const trees = useMemo(() => buildUnitTrees(units), [units]);

  // See `UnitDiffProps.keyPrefix`: this remounts the forest whenever the
  // selection or the rendering mode changes, which is what re-seeds folder
  // expansion correctly.
  //
  // `fromLabel`/`toLabel` arrive ALREADY NORMALISED by ReleasesPane (older →
  // newer), so this string is the comparison's IDENTITY and not a record of
  // how the user got there: clicking rel-5 then rel-15 and clicking rel-15
  // then rel-5 both produce `release-changed-Net diff-rel-5-rel-15`. Same
  // comparison, same key, no pointless remount and no second seeding of the
  // same folders.
  const keyPrefix = `release-${fromLabel}-${toLabel}`;

  // The switch governs unit trees, so it appears only when there are unit
  // trees. Offering it over a skeleton, an "Unavailable" or a "0 differences"
  // would be offering a control with nothing to act on.

  return (
    <Box>
      {/* The header renders in every state, including empty and loading — it
          is the answer to "what am I looking at", which is exactly the
          question an empty panel raises. */}
      {isLoading ? (
        // Never a "0 differences" while the answer is still unknown.
        <Box
          data-testid='release-diff-loading'
          sx={{ padding: `14px ${PANE_PX}px 18px`, display: 'flex', flexDirection: 'column', gap: 0.75 }}
        >
          {[68, 92, 55, 80].map((widthPct, i) => (
            <Skeleton key={i} variant='rounded' height={14} width={`${widthPct}%`} />
          ))}
        </Box>
      ) : unavailable ? (
        // Never a "0 differences" for data that could not be fetched.
        <EmptyBlock data-testid='release-diff-unavailable'>
          <EmptyValue>Unavailable</EmptyValue>
          <Sub>Could not load this comparison</Sub>
        </EmptyBlock>
      ) : units.length === 0 ? (
        <EmptyBlock data-testid='release-diff-empty'>
          <EmptyValue>0 differences</EmptyValue>
          <Sub>{emptySubtitle}</Sub>
        </EmptyBlock>
      ) : (
        trees.map((tree) => (
          <UnitDiff
            key={tree.unit.unitId}
            tree={tree}
            toLabel={toLabel}
            keyPrefix={keyPrefix}
            columnStyle={stableColumnStyle}
            onDividerMouseDown={onDividerMouseDown}
            isDragging={isDragging}
          />
        ))
      )}
    </Box>
  );
}

export const ReleaseDiffPanel = memo(ReleaseDiffPanelImpl);
