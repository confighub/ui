// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';

import { ExtendedUnitRead, useListAllRevisionsQuery } from '@confighub/rtk-query';

interface UseChangesetRevisionsParams {
  changesetId: string;
  startTagId: string;
  units: ExtendedUnitRead[];
}

interface UseChangesetRevisionsResult {
  changeSetUnits: ExtendedUnitRead[];
  isLoading: boolean;
  error: unknown;
  refetchRevisions: () => void;
}

/**
 * Custom hook to fetch revision data for changeset comparisons
 *
 * Fetches:
 * 1. The most recent revision with the changeset ID (for each unit)
 * 2. The revision before the start tag (for each unit)
 *
 * This allows comparing what changed in the changeset vs what was there before.
 */
export const useChangesetRevisions = ({
  changesetId,
  startTagId,
  units,
}: UseChangesetRevisionsParams): UseChangesetRevisionsResult => {
  // Get unit IDs to fetch revisions for
  const unitIds = useMemo(
    () => units.map((u) => u.Unit?.UnitID).filter((id): id is string => !!id),
    [units],
  );

  // Fetch all revisions for units in this changeset
  const {
    data: changesetRevisions = [],
    isLoading: isLoadingChangesetRevisions,
    error: changesetRevisionsError,
    refetch: refetchChangesetRevisions,
  } = useListAllRevisionsQuery(
    {
      where: `ChangeSetID = '${changesetId}' AND UnitID IN (${unitIds.map((id) => `'${id}'`).join(',')})`,
      include: 'UnitID',
    },
    {
      skip: !changesetId || unitIds.length === 0,
    },
  );

  // Fetch revisions before the start tag
  // Note: This query needs to be adjusted based on how your backend
  // identifies revisions "before" a tag. This is a placeholder.
  const {
    data: beforeTagRevisions = [],
    isLoading: isLoadingBeforeTagRevisions,
    error: beforeTagRevisionsError,
    refetch: refetchBeforeTagRevisions,
  } = useListAllRevisionsQuery(
    {
      // TODO: Adjust this query to fetch revisions before the start tag
      // This might require a different API endpoint or query parameter
      // For now, we're fetching all revisions for these units
      where: `UnitID IN (${unitIds.map((id) => `'${id}'`).join(',')}) AND ChangeSetID IS NULL`,
      include: 'UnitID',
    },
    {
      skip: !startTagId || unitIds.length === 0,
    },
  );

  // Function to refetch both revision queries
  const refetchRevisions = useCallback(async () => {
    await Promise.all([refetchChangesetRevisions(), refetchBeforeTagRevisions()]);
  }, [refetchChangesetRevisions, refetchBeforeTagRevisions]);

  // Process the revision data
  const changeSetUnits = useMemo((): ExtendedUnitRead[] => {
    // @ts-expect-error TODO:
    return units.map((unit) => {
      const unitId = unit.Unit?.UnitID || '';

      // Find the most recent revision with the changeset ID
      const changesetRev =
        changesetRevisions.find((rev) => rev.Revision?.UnitID === unitId)?.Revision || {};

      // This might require comparing revision timestamps with tag creation time
      // or using a specific API parameter
      const beforeTagRev =
        beforeTagRevisions.find((rev) => rev.Revision?.UnitID === unitId)?.Revision || {};

      return {
        ...unit,
        Unit: {
          ...unit.Unit,
          HeadRevision: changesetRev,
          LastReleasedRevision: beforeTagRev,
        },
        HeadRevision: changesetRev,
        LastReleasedRevision: beforeTagRev,
      };
    });
  }, [units, changesetRevisions, beforeTagRevisions, changesetId]);

  return {
    changeSetUnits,
    isLoading: isLoadingChangesetRevisions || isLoadingBeforeTagRevisions,
    error: changesetRevisionsError || beforeTagRevisionsError,
    refetchRevisions,
  };
};
