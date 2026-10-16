// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useListAllTriggersQuery } from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';

/**
 * How a Trigger stands with a Space or Target that selects Triggers.
 *
 * The Space or Target lists the Triggers it selects (TriggerIDs) when its selector is set or it is
 * refreshed, not when Triggers change, so a Trigger created or relabeled since then can match the
 * selector without being applied, and an applied one can have stopped matching.
 */
export type TriggerSelectionStatus = 'applied' | 'notApplied' | 'noLongerSelected';

export const TRIGGER_SELECTION_STATUS_DISPLAY: Record<
  TriggerSelectionStatus,
  { label: string; description: string; color: 'success' | 'warning' | 'default' }
> = {
  applied: {
    label: 'Applied',
    description: 'Selected, and invoked on the Units',
    color: 'success',
  },
  notApplied: {
    label: 'Not yet applied',
    description: 'Selected, but not invoked on the Units until the selector is saved or the Triggers are refreshed',
    color: 'warning',
  },
  noLongerSelected: {
    label: 'No longer selected',
    description:
      'Still invoked on the Units, but no longer selected (or not visible to you), until the selector is saved or the Triggers are refreshed',
    color: 'default',
  },
};

export interface TriggerSelector {
  WhereTrigger?: string;
  TriggerFilterID?: string;
  TriggerIDs?: string[];
}

export interface UseTriggerSelectionArgs {
  selector: TriggerSelector | undefined;
  /**
   * For a Space: with neither WhereTrigger nor TriggerFilterID, a Space applies the Triggers in it.
   * A Target with neither applies none.
   */
  ownSpaceId?: string;
  skip?: boolean;
}

export const useTriggerSelection = ({ selector, ownSpaceId, skip = false }: UseTriggerSelectionArgs) => {
  const whereTrigger = selector?.WhereTrigger || '';
  const triggerFilterId = selector?.TriggerFilterID || '';
  const hasSelector = !!whereTrigger || !!triggerFilterId;
  const selectsOwnSpace = !hasSelector && !!ownSpaceId;

  // The same where and Filter the server lists the selected Triggers with.
  const skipMatching = skip || !selector || (!hasSelector && !selectsOwnSpace);
  const {
    data: matching,
    isFetching,
    error,
    refetch,
  } = useListAllTriggersQuery(
    {
      where: selectsOwnSpace ? `SpaceID = '${ownSpaceId}'` : whereTrigger || undefined,
      filter: triggerFilterId || undefined,
      select: 'TriggerID',
    },
    // Triggers in other Spaces change without this page knowing, so the matches are reread.
    { skip: skipMatching, refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );

  const appliedKey = (selector?.TriggerIDs || []).join(',');
  const matchingKey = (skipMatching ? [] : matching || [])
    .map((t) => t.Trigger?.TriggerID)
    .filter(Boolean)
    .join(',');

  const { statusById, allIds, notAppliedCount, noLongerSelectedCount } = useMemo(() => {
    const applied = new Set(appliedKey ? appliedKey.split(',') : []);
    const matched = new Set(matchingKey ? matchingKey.split(',') : []);
    const status: Record<string, TriggerSelectionStatus> = {};
    applied.forEach((id) => {
      status[id] = matched.has(id) ? 'applied' : 'noLongerSelected';
    });
    matched.forEach((id) => {
      if (!applied.has(id)) status[id] = 'notApplied';
    });
    const values = Object.values(status);
    return {
      statusById: status,
      allIds: Object.keys(status),
      notAppliedCount: values.filter((v) => v === 'notApplied').length,
      noLongerSelectedCount: values.filter((v) => v === 'noLongerSelected').length,
    };
  }, [appliedKey, matchingKey]);

  return {
    hasSelector,
    selectsOwnSpace,
    appliedCount: selector?.TriggerIDs?.length || 0,
    statusById,
    allIds,
    notAppliedCount,
    noLongerSelectedCount,
    isStale: !isFetching && !error && (notAppliedCount > 0 || noLongerSelectedCount > 0),
    isFetching,
    errorMessage: error ? getApiErrorMessage(error, 'The Trigger selector could not be evaluated.') : undefined,
    // A query that has not started cannot be refetched.
    refetch: () => {
      if (!skipMatching) void refetch();
    },
  };
};
