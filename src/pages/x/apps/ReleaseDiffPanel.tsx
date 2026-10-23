// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * ReleaseDiffPanel — the diff surface of the Releases pane.
 *
 * Purely presentational: it receives each unit's server diff (`useReleaseDiff`) and draws
 * it. It fetches nothing, owns no app state, and never mutates anything — the Releases tab
 * is a read-only surface.
 *
 * === The reuse seam ===
 * The rows themselves are NOT drawn here. Every unit renders one `ConfigDiffView`, the
 * resource-by-resource diff the revision-compare drawer, the ChangeOrder pages and the
 * invoker result card use, so a path two resources of a unit share is drawn in each of them.
 * This module owns only the chrome around it: the loading / unavailable / empty three-way
 * split, the per-unit header (kind, unit-details link, the "added in" badge and the `{n}F`
 * change count), and the container images, hoisted out of each resource's tree to the top
 * of it as `ImageChangeRows`.
 *
 * The diff is read with `include=Context`, which is what names an image's container and
 * finds the containers beside it that did not move. The tree leaves the context out.
 */
import { memo, useMemo, type CSSProperties } from 'react';
import type { ReactElement } from 'react';

import type { ConfigDiff, ResourceDiff } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

import { ConfigDiffView } from '@/components/config-diff/ConfigDiffView';

import { ImageChangeRows } from './ImageChangeRows';
import { imageRowsOfResource, type ImageRowModel } from './imageRef';
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
import type { TreeDiffDomHooks } from './TreeDiffSection';
import { useColumnResize } from './useColumnResize';
import type { ReleaseUnitDiff } from './useReleaseDiff';

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
  result: ReleaseUnitDiff;
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
  /** Already filtered to units with >= 1 change, in stable order. */
  units: ReleaseDiffUnitView[];
  isLoading: boolean;
  /**
   * The comparison can never resolve (a diff read failed). Distinct from
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

/** One unit's diff split for drawing: each resource's image rows, and its tree without them. */
interface ReleaseUnitTree {
  unit: ReleaseDiffUnitView;
  /** The unit's diff, each resource holding only the changes its tree draws. */
  diff: ConfigDiff;
  /** Index-aligned with `diff.Resources`. */
  imageRows: ImageRowModel[][];
  /** The kind of the unit's one changed resource, for the header. Absent for several. */
  kind: string | undefined;
}

function kindOf(resources: readonly ResourceDiff[]): string | undefined {
  if (resources.length !== 1) return undefined;
  const type = resources[0].Resource?.ResourceType;
  return type ? type.slice(type.lastIndexOf('/') + 1) || undefined : undefined;
}

function buildUnitTree(unit: ReleaseDiffUnitView): ReleaseUnitTree {
  const resources = unit.result.diff.Resources ?? [];
  const imageRows: ImageRowModel[][] = [];
  const split = resources.map((resource) => {
    const { rows, others } = imageRowsOfResource(resource);
    imageRows.push(rows);
    return { ...resource, Changes: others };
  });
  return { unit, diff: { Resources: split }, imageRows, kind: kindOf(resources) };
}

/**
 * Module-level and frozen: the diff view is memoised, and a fresh object literal per render
 * would defeat that for every unit on the panel.
 */
const RELEASE_DIFF_DOM_HOOKS: TreeDiffDomHooks = Object.freeze({
  testIdPrefix: 'release-diff',
  // Colour alone must not carry old-vs-new. The rows paint red/green; these words make
  // the same distinction available to a screen reader.
  srValuePrefix: Object.freeze({ old: 'removed: ', new: 'added: ' }),
});

// ============================================================================
// UNIT BLOCK
// ============================================================================

interface UnitDiffProps {
  tree: ReleaseUnitTree;
  toLabel: string;
  columnStyle: CSSProperties;
  onDividerMouseDown: (columnIndex: 0 | 1, e: React.MouseEvent) => void;
  isDragging: boolean;
}

function UnitDiff({ tree, toLabel, columnStyle, onDividerMouseDown, isDragging }: UnitDiffProps): ReactElement {
  const { unit, diff, imageRows, kind } = tree;

  // Both halves of `/units/:spaceID/:id` must be present for the route to
  // resolve; a unit deleted since the release it appears in has no page left to
  // open, and a link to one would 404. Plain text is the honest rendering.
  const detailsHref =
    unit.unitId && unit.spaceId ? `/units/${unit.spaceId}/${unit.unitId}` : undefined;

  const columns = useMemo(
    () => ({ columnStyle, onDividerMouseDown, isDragging }),
    [columnStyle, onDividerMouseDown, isDragging],
  );

  return (
    <UnitBlock data-testid={`release-diff-unit-${unit.unitId}`}>
      <UnitHead>
        <UnitKind>{kind ?? 'Unit'}</UnitKind>
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
        {unit.result.added && (
          <UnitBadge data-testid='unreleased-unit-badge'>{`added in ${toLabel}`}</UnitBadge>
        )}
        <UnitCount>{`${unit.result.changes}F`}</UnitCount>
      </UnitHead>
      <ConfigDiffView
        diff={diff}
        columns={columns}
        hideContext
        domHooks={RELEASE_DIFF_DOM_HOOKS}
        resourcePrelude={(_resource, i) => (
          <ImageChangeRows
            rows={imageRows[i] ?? []}
            testIdPrefix={RELEASE_DIFF_DOM_HOOKS.testIdPrefix}
            srValuePrefix={RELEASE_DIFF_DOM_HOOKS.srValuePrefix}
          />
        )}
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
  // ONE column model for the whole panel: the columns stay aligned down the page, and
  // dragging any one divider rebalances every unit at once.
  const { columnStyle, onDividerMouseDown, isDragging } = useColumnResize();
  const col1 = (columnStyle as Record<string, string>)['--col1-width'];
  const col2 = (columnStyle as Record<string, string>)['--col2-width'];
  // `useColumnResize` rebuilds `columnStyle` as a fresh object literal on every
  // render, which would defeat the diff view's memo for every unit.
  const stableColumnStyle = useMemo(
    () => ({ '--col1-width': col1, '--col2-width': col2 }) as CSSProperties,
    [col1, col2],
  );

  const trees = useMemo(() => units.map(buildUnitTree), [units]);

  // `fromLabel`/`toLabel` arrive ALREADY NORMALISED by ReleasesPane (older → newer), so this
  // string is the comparison's IDENTITY and not a record of how the user got there: moving
  // to another comparison remounts the rows, and the same one clicked in the other order
  // does not.
  const keyPrefix = `release-${fromLabel}-${toLabel}`;

  return (
    <Box>
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
            key={`${keyPrefix}-${tree.unit.unitId}`}
            tree={tree}
            toLabel={toLabel}
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
