// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the ChangeSet page needs to validate and release a ChangeSet
 * (`changeSetRelease.ts` says what a Release of one is).
 *
 * - **Validation**: the ValidationErrors of what a Release would bundle. While the
 *   ChangeSet is open that is the head of each Unit it is open on; once closed, the
 *   Revision of each Unit its end Tag marks.
 * - **Release**: the Spaces of those Units that have a release Target, whether each
 *   has published a Release at the end Tag, and for those that have not, a dry run
 *   of the publish, asked again when what it reads changes and on a slow poll, since
 *   a validating Trigger finishes on its own schedule.
 *
 * The Units are read with their Space (`include`), which names them and says which
 * Spaces have a release Target, so nothing is looked up by a list of ids afterwards.
 *
 * The dry runs are sent with `authFetch`, not the RTK base query, for the reason the
 * close gates' are: a viewer who may not publish is refused with a 403, which RTK
 * would turn into /access-denied.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { authFetch } from '@/auth/session';
import { usePolling } from '@/hooks/usePolling';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type ChangeSetRead,
  useListAllReleasesQuery,
  useListAllUnitsQuery,
  usePublishReleaseMutation,
} from '@confighub/rtk-query';

import { type BundledUnit, gatesOf, validationOf } from '../change-orders/releaseValidation';
import { useGetTaggedRevisionsQuery } from '../x/apps/change-order/taggedRevisionsApi';
import {
  type ChangeSetRelease,
  type ChangeSetValidation,
  type ReleaseSpace,
  type ReleaseSpaceStatus,
  releasableSpaces,
  releaseStatusOfAnswer,
} from './changeSetRelease';
import { releaseChangeSetDryRun } from './changeSetServerCalls';

/** How often the validation and the dry runs are read again with nothing else changed. */
export const RELEASE_POLL_INTERVAL_MS = 30_000;

const byName = (a: string, b: string) => a.localeCompare(b);

/** A Unit a Release would bundle, and whether its Space has a release Target. */
interface ReleasedUnit extends BundledUnit {
  releasable: boolean;
}

/** The Units a Release of the ChangeSet would bundle, with the gates on what it would bundle of each. */
function useBundledUnits(
  changeSet: ChangeSetRead | undefined,
  open: boolean,
  refreshKey: string,
) {
  const changeSetId = changeSet?.ChangeSetID;
  const endTagId = changeSet?.EndTagID;
  const heads = useListAllUnitsQuery(
    {
      where: `ChangeSetID = '${changeSetId ?? ''}'`,
      select: 'UnitID,Slug,SpaceID,ValidationErrors,ValidationTriggerIDs',
      include: 'SpaceID',
    },
    {
      skip: changeSetId === undefined || !open,
      pollingInterval: RELEASE_POLL_INTERVAL_MS,
      skipPollingIfUnfocused: true,
    },
  );
  const marked = useGetTaggedRevisionsQuery(
    {
      wheres: [`Tags ? '${endTagId ?? ''}'`],
      select: 'RevisionID,UnitID,SpaceID,RevisionNum,ValidationErrors,ValidationTriggerIDs',
      include: 'UnitID,SpaceID',
      live: true,
    },
    {
      skip: endTagId === undefined || open,
      pollingInterval: RELEASE_POLL_INTERVAL_MS,
      skipPollingIfUnfocused: true,
    },
  );
  const { refetch: refetchHeads } = heads;
  const { refetch: refetchMarked } = marked;
  useEffect(() => {
    if (refreshKey === '') return;
    if (open) void refetchHeads();
    else if (endTagId !== undefined) void refetchMarked();
  }, [refreshKey, open, endTagId, refetchHeads, refetchMarked]);

  return useMemo((): { units?: ReleasedUnit[]; failed: boolean } => {
    if (open) {
      if (heads.isError) return { failed: true };
      if (heads.currentData === undefined) return { failed: false };
      return {
        failed: false,
        units: heads.currentData.flatMap((entry) =>
          entry.Unit?.UnitID === undefined
            ? []
            : [
                {
                  unitId: entry.Unit.UnitID,
                  slug: entry.Unit.Slug,
                  spaceId: entry.Unit.SpaceID ?? '',
                  spaceSlug: entry.Space?.Slug ?? '',
                  releasable: !!entry.Space?.ReleaseTargetID,
                  gates: gatesOf(entry.Unit.ValidationErrors),
                  triggerIdByGate: entry.Unit.ValidationTriggerIDs ?? {},
                },
              ],
        ),
      };
    }
    if (marked.isError) return { failed: true };
    if (marked.currentData === undefined) return { failed: false };
    // A Tag can mark more than one Revision of a Unit; a Release bundles the highest.
    const highest = new Map<string, { num: number; unit: ReleasedUnit }>();
    for (const entry of marked.currentData) {
      const revision = entry.Revision;
      if (revision?.UnitID === undefined) continue;
      const num = revision.RevisionNum ?? 0;
      if ((highest.get(revision.UnitID)?.num ?? -1) >= num) continue;
      highest.set(revision.UnitID, {
        num,
        unit: {
          unitId: revision.UnitID,
          slug: entry.Unit?.Slug ?? '',
          spaceId: revision.SpaceID ?? '',
          spaceSlug: entry.Space?.Slug ?? '',
          releasable: !!entry.Space?.ReleaseTargetID,
          gates: gatesOf(revision.ValidationErrors),
          triggerIdByGate: revision.ValidationTriggerIDs ?? {},
        },
      });
    }
    return { failed: false, units: [...highest.values()].map((entry) => entry.unit) };
  }, [open, heads.isError, heads.currentData, marked.isError, marked.currentData]);
}

export interface ChangeSetReleaseReads {
  validation: ChangeSetValidation;
  release: ChangeSetRelease;
  releasing: boolean;
  /** Publishes in every Space a dry run said would be. Resolves to what to tell the reader. */
  publish: () => Promise<{ ok: boolean; message: string }>;
}

export function useChangeSetRelease({
  changeSet,
  open,
  refreshKey,
}: {
  changeSet: ChangeSetRead | undefined;
  open: boolean;
  /** Changes whenever what the validation reads does. */
  refreshKey: string;
}): ChangeSetReleaseReads {
  const endTagId = changeSet?.EndTagID;
  const bundled = useBundledUnits(changeSet, open, refreshKey);

  const validation = useMemo((): ChangeSetValidation => {
    if (bundled.failed) return { status: 'failed' };
    if (bundled.units === undefined) return { status: 'loading' };
    return validationOf(bundled.units);
  }, [bundled.failed, bundled.units]);

  // The Spaces a Release would be published in: those of the Units it bundles that have a release Target.
  const releaseSpaces = useMemo(() => {
    const bySpace = new Map<string, string>();
    for (const unit of bundled.units ?? [])
      if (unit.releasable && unit.spaceId !== '') bySpace.set(unit.spaceId, unit.spaceSlug);
    return [...bySpace.entries()]
      .map(([spaceId, spaceSlug]) => ({ spaceId, spaceSlug }))
      .sort((a, b) => byName(a.spaceSlug, b.spaceSlug));
  }, [bundled.units]);

  // Releases already published at the end Tag. The Tag is the ChangeSet's own, so it names no other Space's.
  const published = useListAllReleasesQuery(
    { where: `TagID = '${endTagId ?? ''}'`, select: 'ReleaseID,SpaceID,ReleaseNum' },
    { skip: open || endTagId === undefined || releaseSpaces.length === 0 },
  );
  const releasedNum = useMemo(() => {
    const bySpace = new Map<string, number>();
    for (const entry of published.data ?? []) {
      const release = entry.Release;
      if (release?.SpaceID === undefined) continue;
      bySpace.set(
        release.SpaceID,
        Math.max(bySpace.get(release.SpaceID) ?? 0, release.ReleaseNum ?? 0),
      );
    }
    return bySpace;
  }, [published.data]);

  // The dry runs, of the Spaces not yet released at the end Tag.
  const toCheckKey = useMemo(
    () =>
      open || published.data === undefined
        ? ''
        : releaseSpaces
            .map((space) => space.spaceId)
            .filter((id) => !releasedNum.has(id))
            .join(','),
    [open, published.data, releaseSpaces, releasedNum],
  );
  const [answers, setAnswers] = useState<{
    key: string;
    bySpace: Record<string, ReleaseSpaceStatus>;
  }>({ key: '', bySpace: {} });
  const [tick, setTick] = useState(0);
  const recheck = useCallback(() => setTick((t) => t + 1), []);
  usePolling(recheck, RELEASE_POLL_INTERVAL_MS);

  // A dry run is a request to the server that has to be re-sent when its inputs change.
  useEffect(() => {
    if (endTagId === undefined || toCheckKey === '') return;
    let cancelled = false;
    const key = `${endTagId}|${toCheckKey}`;
    void Promise.all(
      toCheckKey
        .split(',')
        .map(
          async (spaceId) =>
            [
              spaceId,
              releaseStatusOfAnswer(
                await releaseChangeSetDryRun(authFetch, spaceId, endTagId),
              ),
            ] as const,
        ),
    ).then((entries) => {
      if (!cancelled) setAnswers({ key, bySpace: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [endTagId, toCheckKey, refreshKey, tick]);

  const release = useMemo((): ChangeSetRelease => {
    if (bundled.failed) return { status: 'failed' };
    if (bundled.units === undefined) return { status: 'loading' };
    if (releaseSpaces.length === 0) return { status: 'none' };
    if (open)
      return {
        status: 'open',
        spaces: releaseSpaces.map((space) => ({ ...space, status: { kind: 'checking' } })),
      };
    if (published.isError) return { status: 'failed' };
    if (published.data === undefined) return { status: 'loading' };
    const answered = answers.key === `${endTagId ?? ''}|${toCheckKey}` ? answers.bySpace : {};
    return {
      status: 'closed',
      spaces: releaseSpaces.map((space) => {
        const releaseNum = releasedNum.get(space.spaceId);
        const status: ReleaseSpaceStatus =
          releaseNum !== undefined
            ? { kind: 'released', releaseNum }
            : (answered[space.spaceId] ?? { kind: 'checking' });
        return { ...space, status };
      }),
    };
  }, [
    bundled.failed,
    bundled.units,
    releaseSpaces,
    open,
    published.isError,
    published.data,
    answers,
    endTagId,
    toCheckKey,
    releasedNum,
  ]);

  const [publishRelease] = usePublishReleaseMutation();
  const [releasing, setReleasing] = useState(false);
  const { refetch: refetchPublished } = published;
  const publish = useCallback(async () => {
    const ready: ReleaseSpace[] = releasableSpaces(release);
    if (endTagId === undefined || ready.length === 0)
      return { ok: false, message: 'There is nothing to release.' };
    setReleasing(true);
    try {
      // One Space failing must not stop the others.
      const settled = await Promise.allSettled(
        ready.map((space) =>
          publishRelease({
            spaceId: space.spaceId,
            releasePublishRequest: { TagID: endTagId },
          }).unwrap(),
        ),
      );
      const failures = settled.flatMap((outcome, index) =>
        outcome.status === 'rejected'
          ? [`${ready[index]?.spaceSlug}: ${getApiErrorMessage(outcome.reason)}`]
          : [],
      );
      const released = settled.filter((outcome) => outcome.status === 'fulfilled').length;
      const spaces = (n: number) => (n === 1 ? '1 Space' : `${n} Spaces`);
      if (failures.length > 0) {
        return {
          ok: false,
          message: `${released > 0 ? `Released in ${spaces(released)}. ` : ''}Not released in ${spaces(failures.length)}: ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? `; and ${failures.length - 3} more` : ''}`,
        };
      }
      return { ok: true, message: `Released in ${spaces(released)}.` };
    } finally {
      setReleasing(false);
      void refetchPublished();
      recheck();
    }
  }, [release, endTagId, publishRelease, refetchPublished, recheck]);

  return { validation, release, releasing, publish };
}
