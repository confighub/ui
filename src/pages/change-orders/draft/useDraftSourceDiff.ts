// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useSearchRevisionDataChunkedQuery } from '@/hooks/chunkedQueriesApi';
import type { UnitDiff } from '@confighub/rtk-query';

import {
  resourceIdentityJoinKeysOf,
  resourceIdentityKeyOf,
  serverDiffGroupParts,
} from '../../x/apps/change-order/changeOrderChanges';
import type { ChangeOrderChangeGroup } from '../../x/apps/change-order/changeOrderTypes';
import { useGetDraftSourceDiffQuery } from '../changeOrderImageDiffApi';
import { carriedResourceKeysOf } from '../changeOrderOutcome';
import {
  IMAGE_CHANGES_UNAVAILABLE,
  type ImageChanges,
  imageChangesOfRead,
} from '../imageChange';
import { type DraftUnitRange, FIRST_REVISION_NUM } from './draftChangeCards';
import { draftCopy } from './draftCopy';
import type { DraftDerivedStatus, DraftUpstream } from './draftTypes';
import { useRetry } from './useRetry';

export interface DraftSourceDiff {
  /**
   * `undetermined`: the change cannot be bounded — no start to diff from, a MergeUnits change,
   * an end that names nothing (`reason`). The hero and "At the source" read "Could not
   * establish", never "No image change" and never a diff from the base's beginning.
   */
  status: DraftDerivedStatus;
  /** Why `undetermined`, in the page's words. */
  reason: string | undefined;
  /** Asks again every read that failed. Does nothing while none has. */
  retry: () => void;
  /** Per carrying base Unit, from its start to its end, as `GET .../unit/<id>/diff` returns it. */
  unitDiffs: UnitDiff[] | undefined;
  /** The hero: the image tags the change moves, and its other field changes. */
  imageChanges: ImageChanges;
  /**
   * "At the source", one group per carrying base Unit, in the shape the detail view's source
   * tree and outcome filter read. Empty until `resolved`.
   */
  sourceGroups: ChangeOrderChangeGroup[];
  /** Resources the change creates at the source: a Unit no variant in scope holds yet. */
  createdResourceKeys: ReadonlySet<string>;
  /** `carriedResourceKeysOf` the source groups: what the outcome filter may let speak. `null` until read. */
  carriedResourceKeys: ReadonlySet<string> | null;
}

const NO_KEYS: ReadonlySet<string> = new Set();

/**
 * The change at the source: each base Unit that carries anything, from the Revision its
 * variants have taken to the one the change ends at. The hero and "At the source" read it, and
 * the preview's outcome filter reads what it carries.
 *
 * `GET .../unit/<id>/diff` per Unit (`getDraftSourceDiff`, untagged): the bulk `unit_diff` takes
 * no per-Unit numbers, and the detail view's `Before:ChangeOrder:` → `ChangeOrder:` selectors need
 * a ChangeOrder.
 */
export function useDraftSourceDiff(args: {
  baseSpaceId: string | undefined;
  ranges: readonly DraftUnitRange[];
  /** True while the ranges have not resolved: nothing is said about a change not yet bounded. */
  pending: boolean;
  /** Why the change cannot be bounded, when the draft already knows it cannot (`undetermined`). */
  undetermined?: string;
  /** The ranges' own reads: when they failed, so does the source, with their retry. */
  upstream?: DraftUpstream;
}): DraftSourceDiff {
  const { baseSpaceId, ranges, pending, undetermined, upstream } = args;
  const upstreamFailed = upstream?.failed === true;
  // A Unit whose range is `unknown` carries something nobody here can bound: the change at the
  // source cannot be stated without it.
  const unboundedReason =
    undetermined ??
    (!pending && ranges.some((range) => range.carry === 'unknown')
      ? draftCopy.couldNotEstablish
      : undefined);
  const unbounded = unboundedReason !== undefined;
  // By slug, so the hero lists the same change the same way whatever order the Units were read in.
  const carrying = useMemo(
    () =>
      ranges
        .filter(
          (range) =>
            range.carry === 'carries' && range.start !== undefined && range.end !== undefined,
        )
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    [ranges],
  );
  const items = useMemo(
    () =>
      carrying.map((range) => ({
        unitId: range.unitId,
        from: String(range.start),
        to: String(range.end),
      })),
    [carrying],
  );
  const read = useGetDraftSourceDiffQuery(
    { spaceId: baseSpaceId ?? '', diffs: items },
    { skip: pending || unbounded || baseSpaceId === undefined || items.length === 0 },
  );
  const failedItem = (read.currentData ?? []).some((unitDiff) => unitDiff.Error !== undefined);
  // Both sides' data, for the resource identities the outcome filter joins on.
  const revisionIds = useMemo(
    () =>
      carrying
        .flatMap((range) => [range.startRevisionId, range.endRevisionId])
        .filter((id): id is string => id !== undefined),
    [carrying],
  );
  const dataRead = useSearchRevisionDataChunkedQuery(
    { revisionIds },
    { skip: pending || unbounded || revisionIds.length === 0 },
  );
  const dataById = useMemo(
    () =>
      new Map(
        (dataRead.currentData ?? []).map((row) => [row.RevisionID ?? '', row.Data ?? '']),
      ),
    [dataRead.currentData],
  );
  const dataPending =
    revisionIds.length > 0 && dataRead.currentData === undefined && !dataRead.isError;
  const retry = useRetry(
    [
      {
        isError: read.isError || failedItem,
        isUninitialized: read.isUninitialized,
        refetch: read.refetch,
      },
      dataRead,
    ],
    upstream?.retry,
  );

  return useMemo((): DraftSourceDiff => {
    const nothing = {
      reason: undefined,
      retry,
      sourceGroups: [],
      createdResourceKeys: NO_KEYS,
      carriedResourceKeys: null,
    };
    if (upstreamFailed)
      return {
        status: 'failed',
        unitDiffs: undefined,
        imageChanges: IMAGE_CHANGES_UNAVAILABLE,
        ...nothing,
      };
    if (unbounded)
      return {
        status: 'undetermined',
        unitDiffs: undefined,
        imageChanges: IMAGE_CHANGES_UNAVAILABLE,
        ...nothing,
        reason: unboundedReason,
      };
    if (pending)
      return {
        status: 'loading',
        unitDiffs: undefined,
        imageChanges: imageChangesOfRead(undefined, false),
        ...nothing,
      };
    if (items.length === 0) {
      return {
        status: 'resolved',
        reason: undefined,
        retry,
        unitDiffs: [],
        imageChanges: imageChangesOfRead([], false),
        sourceGroups: [],
        createdResourceKeys: NO_KEYS,
        carriedResourceKeys: new Set(),
      };
    }
    const unitDiffs = read.currentData;
    const failedRead = read.isError || dataRead.isError;
    const imageChanges = imageChangesOfRead(unitDiffs, failedRead);
    if (failedRead)
      return { status: 'failed', unitDiffs: undefined, imageChanges, ...nothing };
    if (unitDiffs === undefined || dataPending)
      return { status: 'loading', unitDiffs, imageChanges, ...nothing };
    const diffByUnitId = new Map(unitDiffs.map((unitDiff) => [unitDiff.UnitID, unitDiff]));
    const dataOf = (revisionId: string | undefined) =>
      revisionId === undefined ? undefined : dataById.get(revisionId) || undefined;
    const groups: ChangeOrderChangeGroup[] = [];
    const created = new Set<string>();
    let failed = false;
    for (const range of carrying) {
      const unitDiff = diffByUnitId.get(range.unitId);
      const before = dataOf(range.startRevisionId);
      const after = dataOf(range.endRevisionId);
      if (
        unitDiff?.Diff === undefined ||
        unitDiff.Error !== undefined ||
        after === undefined
      ) {
        failed = true;
        continue;
      }
      // A Unit no variant holds starts at its empty first Revision: the change creates its resources.
      if (range.start === FIRST_REVISION_NUM)
        for (const key of resourceIdentityJoinKeysOf(after)) created.add(key);
      groups.push({
        unitId: range.unitId,
        resourceName: range.slug,
        resourceIdentity: resourceIdentityKeyOf(before) ?? resourceIdentityKeyOf(after),
        resourceIdentityJoinKeys: resourceIdentityJoinKeysOf(before, after),
        ...serverDiffGroupParts(unitDiff.Diff, before, after),
        written: true,
        determinable: true,
      });
    }
    return {
      status: failed ? 'failed' : 'resolved',
      reason: undefined,
      retry,
      unitDiffs,
      imageChanges,
      sourceGroups: groups,
      createdResourceKeys: created,
      carriedResourceKeys: failed ? null : carriedResourceKeysOf(groups, created),
    };
  }, [
    upstreamFailed,
    pending,
    unbounded,
    unboundedReason,
    retry,
    items,
    read.currentData,
    read.isError,
    dataRead.isError,
    dataPending,
    carrying,
    dataById,
  ]);
}
