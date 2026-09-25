// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useLazyUnitData } from '@/hooks/useUnitData';
import { useCallback, useMemo, useState } from 'react';
import { type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { detectGroupComparison } from '@/utility/tree-selection-utils';
import {
  ExtendedUnitRead,
  useLazyGetUnitQuery,
  useLazyListAllUnitsQuery,
} from '@confighub/rtk-query';

// ============================================================================
// TYPES
// ============================================================================

export interface DiffViewState {
  isOpen: boolean;
  fromData: string;
  toData: string;
  fromLabel: string;
  toLabel: string;
}

interface ReviewDrawerState {
  isOpen: boolean;
  units: ExtendedUnitRead[];
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const INITIAL_DIFF_STATE: DiffViewState = {
  isOpen: false,
  fromData: '',
  toData: '',
  fromLabel: '',
  toLabel: '',
};

const INITIAL_REVIEW_STATE: ReviewDrawerState = {
  isOpen: false,
  units: [],
};

// ============================================================================
// HOOK
// ============================================================================

export const useUnitSelectionActions = (
  selectedUnits: ExtendedUnitRead[],
  groupBy: GroupByOption = 'none',
) => {
  const [diffView, setDiffView] = useState<DiffViewState>(INITIAL_DIFF_STATE);
  const [reviewDrawer, setReviewDrawer] = useState<ReviewDrawerState>(INITIAL_REVIEW_STATE);

  const [fetchUpstreamUnit, { isFetching: isFetchingUpstream }] = useLazyGetUnitQuery();
  // Configuration is not on the Unit; each side of a diff is fetched when the diff opens.
  const fetchUnitData = useLazyUnitData();
  const [fetchUnitsWithRevisions, { isFetching: isFetchingRevisions }] =
    useLazyListAllUnitsQuery();

  const canDiff = selectedUnits.length === 2;

  const canCompareUpstream = useMemo(
    () => selectedUnits.length === 1 && !!selectedUnits[0]?.Unit?.UpstreamUnitID,
    [selectedUnits],
  );

  const unitsWithPendingChanges = useMemo(
    () =>
      selectedUnits.filter((u) => {
        const head = u.Unit?.HeadRevisionNum;
        const lastReleased = u.Unit?.LastReleasedRevisionNum;
        return head !== undefined && lastReleased !== undefined && head !== lastReleased;
      }),
    [selectedUnits],
  );

  const canReviewChanges = unitsWithPendingChanges.length > 0;

  // Open the diff view comparing two selected units side-by-side
  const handleDiffUnits = useCallback(async () => {
    if (!canDiff) return;

    const [unitA, unitB] = selectedUnits;

    // The configuration is not on the Unit, so each side is fetched when the diff opens.
    const [fromData, toData] = await Promise.all([
      fetchUnitData(unitA.Unit?.SpaceID, unitA.Unit?.UnitID),
      fetchUnitData(unitB.Unit?.SpaceID, unitB.Unit?.UnitID),
    ]);

    setDiffView({
      isOpen: true,
      fromData,
      toData,
      fromLabel: unitA.Unit?.Slug || 'Unit A',
      toLabel: unitB.Unit?.Slug || 'Unit B',
    });
  }, [canDiff, selectedUnits, fetchUnitData]);

  // Open the diff view comparing a unit against its upstream source
  const handleCompareUpstream = useCallback(async () => {
    if (!canCompareUpstream) return;

    const unit = selectedUnits[0];
    const upstreamUnitId = unit.Unit?.UpstreamUnitID;
    const upstreamSpaceId = unit.Unit?.UpstreamSpaceID;

    if (!upstreamUnitId || !upstreamSpaceId) return;

    const result = await fetchUpstreamUnit({
      spaceId: upstreamSpaceId,
      unitId: upstreamUnitId,
    });

    if (result.data) {
      const [fromData, toData] = await Promise.all([
        fetchUnitData(upstreamSpaceId, upstreamUnitId),
        fetchUnitData(unit.Unit?.SpaceID, unit.Unit?.UnitID),
      ]);
      setDiffView({
        isOpen: true,
        fromData,
        toData,
        fromLabel: `upstream: ${result.data.Unit?.Slug || 'Upstream'}`,
        toLabel: unit.Unit?.Slug || 'Current',
      });
    }
  }, [canCompareUpstream, selectedUnits, fetchUpstreamUnit]);

  const handleReviewChanges = useCallback(async () => {
    if (!canReviewChanges) return;

    const unitIds = unitsWithPendingChanges
      .map((u) => u.Unit?.UnitID)
      .filter((id): id is string => !!id);

    const where = unitIds.map((id) => `UnitID=${id}`).join(' OR ');

    const result = await fetchUnitsWithRevisions({
      where,
      include: 'SpaceID,HeadRevisionNum,LastReleasedRevisionNum',
    });

    if (result.data) {
      setReviewDrawer({
        isOpen: true,
        units: result.data,
      });
    }
  }, [canReviewChanges, unitsWithPendingChanges, fetchUnitsWithRevisions]);

  const closeDiffView = useCallback(() => {
    setDiffView(INITIAL_DIFF_STATE);
  }, []);

  const closeReviewDrawer = useCallback(() => {
    setReviewDrawer(INITIAL_REVIEW_STATE);
  }, []);

  // Group comparison
  const groupComparison = useMemo(
    () => detectGroupComparison(selectedUnits, groupBy),
    [selectedUnits, groupBy],
  );

  const canCompareGroups = groupComparison.canCompare;

  const handleCompareGroups = useCallback(() => {
    if (!canCompareGroups) return;
    // TODO:
    // dispatch(setIsGroupCompareMode({ isGroupCompareMode: true }));
    // dispatch(setCompareGroupsDrawer({
    //   comparisonType: groupComparison.comparisonType,
    //   groups: groupComparison.groups,
    // }));
  }, [canCompareGroups, groupComparison]);

  return {
    canDiff,
    canCompareUpstream,
    canReviewChanges,
    canCompareGroups,
    isFetchingUpstream,
    isFetchingRevisions,
    diffView,
    reviewDrawer,
    groupComparison,
    handleDiffUnits,
    handleCompareUpstream,
    handleReviewChanges,
    handleCompareGroups,
    closeDiffView,
    closeReviewDrawer,
  };
};
