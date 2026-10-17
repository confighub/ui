// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The gates closing an open ChangeSet is judged against, when a ChangeWorkflow
 * governs it: a dry run of the close, asked again when what the gates read changes
 * (a Revision made, an approval recorded, a Unit opened or taken out) and on a slow
 * poll, since a validating Trigger finishes on its own schedule.
 *
 * Sent with `authFetch`, not the RTK base query, for the reason the ChangeOrder
 * page's dry runs are (`useServerStageGates`): a viewer who may not close the
 * ChangeSet is refused with a 403, which RTK would turn into /access-denied.
 */

import { useCallback, useEffect, useState } from 'react';

import type { ChangeSetRead } from '@confighub/rtk-query';

import { authFetch } from '@/auth/session';
import { usePolling } from '@/hooks/usePolling';

import { closeGatesOfAnswer, closePrerequisites, type ChangeSetCloseGates } from './changeSetCloseGates';
import { closeChangeSetDryRun } from './changeSetServerCalls';

/** How often the gates are asked for again with nothing else changed. */
export const CLOSE_GATES_POLL_INTERVAL_MS = 30_000;

const UNGOVERNED: ChangeSetCloseGates = { status: 'ungoverned' };
const LOADING: ChangeSetCloseGates = { status: 'loading' };

export interface ChangeSetCloseGateReads {
  gates: ChangeSetCloseGates;
  /** Asks again now. */
  refresh: () => void;
}

export function useChangeSetCloseGates({
  changeSet,
  open,
  refreshKey,
}: {
  changeSet: ChangeSetRead | undefined;
  open: boolean;
  /** Changes whenever what the gates read does. */
  refreshKey: string;
}): ChangeSetCloseGateReads {
  const changeSetId = changeSet?.ChangeSetID;
  const governed = open && changeSet?.ChangeWorkflow !== undefined && changeSetId !== undefined;
  const prerequisitesKey = closePrerequisites(changeSet).join('\u0000');
  const spaceCount = changeSet?.InScopeSpaceIDs?.length ?? 0;

  const [read, setRead] = useState<{ key: string; gates: ChangeSetCloseGates }>({ key: '', gates: LOADING });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  usePolling(refresh, CLOSE_GATES_POLL_INTERVAL_MS);

  // A dry run is a request to the server that has to be re-sent when its inputs change.
  useEffect(() => {
    if (!governed || changeSetId === undefined) return;
    let cancelled = false;
    const key = changeSetId;
    void closeChangeSetDryRun(authFetch, changeSetId).then((answer) => {
      if (cancelled) return;
      const prerequisites = prerequisitesKey === '' ? [] : prerequisitesKey.split('\u0000');
      setRead({ key, gates: closeGatesOfAnswer(answer, prerequisites, spaceCount) });
    });
    return () => {
      cancelled = true;
    };
  }, [governed, changeSetId, prerequisitesKey, spaceCount, refreshKey, tick]);

  if (!governed) return { gates: UNGOVERNED, refresh };
  // Another ChangeSet's answer, or none yet, is not this one's.
  return { gates: read.key === changeSetId ? read.gates : LOADING, refresh };
}
