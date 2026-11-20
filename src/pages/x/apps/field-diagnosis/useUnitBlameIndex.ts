// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The whole-unit blame of the Unit whose tree is open, placed on its tree rows (ARCHITECTURE.md
// §7.6, §13 Q4: only the open Unit loads blame). A heavy Unit loads none: its rows draw without
// a set-by line and its details read the path report alone (PLAN.md decision 13).
//
// Follow-up (PLAN.md D7): refetch on a new validation result. The pane's polled Unit carries no
// HeadRevisionNum, so there is no simple freshness stamp yet; the RTK `Unit` invalidation of
// every write already refetches this entry.
import { useMemo } from 'react';
import { useGetUnitBlameQuery } from '@confighub/rtk-query';

import { blameArg } from '@/components/field-diagnosis/fieldArgs';

import { isHeavyUnitData } from '../unitSizeGuard';
import { type BlameIndex, buildBlameIndex } from './blameIndex';

export interface UnitBlameIndexArgs {
  spaceId: string | undefined;
  unitId: string | undefined;
  /** The Unit's configuration, as the tree draws it. */
  data: string | undefined;
  /** The Unit's card is open in the pane. */
  open: boolean;
}

export interface UnitBlameIndex {
  /** Stage key -> blame field; empty until the blame is in, and for a heavy Unit. */
  index: BlameIndex;
  loading: boolean;
  error: unknown;
  /** The Unit is too big for whole-unit blame. */
  heavy: boolean;
  /** Read the blame again (after an error). */
  refetch: () => void;
}

const EMPTY: BlameIndex = new Map();
const NO_REFETCH = () => undefined;

export function useUnitBlameIndex({ spaceId, unitId, data, open }: UnitBlameIndexArgs): UnitBlameIndex {
  const heavy = isHeavyUnitData(data);
  const skip = !open || heavy || !spaceId || !unitId;
  const { currentData, isFetching, error, refetch } = useGetUnitBlameQuery(
    blameArg(spaceId ?? '', unitId ?? ''),
    { skip },
  );
  const index = useMemo(
    () => (currentData?.Fields && data ? buildBlameIndex(currentData.Fields, data) : EMPTY),
    [currentData, data],
  );
  // One object per change, so the pane's context does not change on every render (every row
  // reads it).
  const loading = !skip && isFetching && !currentData;
  return useMemo(
    () => ({
      index: skip ? EMPTY : index,
      loading,
      error: skip ? undefined : error,
      heavy,
      refetch: skip ? NO_REFETCH : refetch,
    }),
    [skip, index, loading, error, heavy, refetch],
  );
}
