// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { useGetChangeOrderSourceDiffQuery } from './changeOrderImageDiffApi';
import {
  EMPTY_FIELD_CHANGES,
  imageChangesFromUnitDiffs,
  type ChangeOrderImageChanges,
} from './imageChange';

export interface UseChangeOrderImageChangesArgs {
  changeOrderId: string | undefined;
  /** The ChangeOrder's own Space, whose Units hold the change at the source. */
  baseSpaceId: string | undefined;
  /** True to make no request: the row is off screen, or the ChangeOrder has no change of its own to read. */
  skip?: boolean;
}

const LOADING: ChangeOrderImageChanges = Object.freeze({
  status: 'loading',
  images: [],
  fieldChanges: EMPTY_FIELD_CHANGES,
  unitCount: 0,
}) as ChangeOrderImageChanges;

const UNAVAILABLE: ChangeOrderImageChanges = Object.freeze({
  status: 'unavailable',
  images: [],
  fieldChanges: EMPTY_FIELD_CHANGES,
  unitCount: 0,
}) as ChangeOrderImageChanges;

/**
 * The image moves and field summary of one ChangeOrder, at its source.
 *
 * One `GET /api/unit_diff` over the base Space, from the Revision before the
 * ChangeOrder to the ChangeOrder's own (`Before:ChangeOrder:<id>` →
 * `ChangeOrder:<id>`). A Unit the ChangeOrder never touched has no Revision on
 * either side and comes back with an empty diff, so it adds nothing.
 * `include=Context` brings the unchanged siblings of each changed container,
 * which is where `restartPolicy: Always` (a native sidecar) is read.
 *
 * Shared by the list and the detail page: RTK Query keys the request by its
 * arguments, so both views read one cache entry. Never polls, and carries no
 * `Unit` tag (`changeOrderImageDiffApi`): the change a ChangeOrder makes at its
 * source does not move once made, so a Unit write elsewhere must not refetch it.
 *
 * Only for ChangeOrders whose own Space holds the change (`changeOrderOwnSpaceReached`).
 * For an Invoke or fan-out ChangeOrder the base Space diff is empty by
 * construction, and callers must pass `skip` rather than read that as
 * "No image change".
 */
export function useChangeOrderImageChanges({
  changeOrderId,
  baseSpaceId,
  skip = false,
}: UseChangeOrderImageChangesArgs): ChangeOrderImageChanges {
  const ready = changeOrderId !== undefined && baseSpaceId !== undefined && changeOrderId !== '' && baseSpaceId !== '';
  const { currentData, isError } = useGetChangeOrderSourceDiffQuery(
    { baseSpaceId: baseSpaceId ?? '', changeOrderId: changeOrderId ?? '' },
    { skip: skip || !ready },
  );

  return useMemo(() => {
    if (isError) return UNAVAILABLE;
    if (currentData === undefined) return LOADING;
    return imageChangesFromUnitDiffs(currentData);
  }, [currentData, isError]);
}
