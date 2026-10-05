// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * useReleaseActions Hook
 *
 * Composite hook bundling everything the
 * component-view side pane needs to trigger a Release for the currently
 * selected Space:
 * - The release history query for the Space (skip-gated on release-enabled selection)
 * - The publish/withdraw mutations
 * - Handlers with the same error/success/loading PLUMBING shape as
 *   AppComponentView's other actions — publish/withdraw are single
 *   spaceId-keyed mutations, so there is no multi-unit collector here.
 *
 * Callers supply `onError`/`onSuccess` so this hook can report into the same
 * per-deployment error/success maps `AppComponentView` already uses for
 * Upgrade (`setErrorsForDeployments` / `flashSuccess`), rather than
 * inventing a parallel error-surface.
 *
 * Named releases. `onRelease` optionally takes a `{ name, notes }` pair. When
 * both are omitted/blank, the flow is the plain unnamed one — a single
 * `publishRelease({})` call, one click, head revisions. When either is
 * provided, a 3-call SEQUENTIAL composite runs first (publish needs the
 * TagID from step 1, so this can't be parallelized):
 *   1. createTag — a fresh, uniquely-slugged Tag carrying the name as
 *      DisplayName and the notes as an annotation.
 *   2. bulkTagUnits — tags every Unit release_core.go would bundle (TargetID
 *      == the Space's ReleaseTargetID) at its head revision with that Tag.
 *   3. publishRelease({ TagID }) — bundles the tagged revisions instead of
 *      head.
 * Steps are un-atomic by design. The decision on "orphan Tag on partial
 * failure" was to accept it — Tags are cheap, inert, space-scoped metadata, so
 * no rollback was built. Recorded here because the plan that held it is gone. Each step's failure is reported with a distinct error
 * title so the user knows how far the operation got.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ExtendedReleaseRead,
  useBulkTagUnitsMutation,
  useCreateTagMutation,
  usePublishReleaseMutation,
  useListExtendedReleasesQuery,
  useWithdrawReleaseMutation,
} from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { isEmptyReleaseBundle } from './releaseBundle';
import { useLazyReleaseBundle } from '@/hooks/useUnitData';

// ============================================================================
// TYPES
// ============================================================================

interface UseReleaseActionsProps {
  /** The selected deployment's Space ID (== ComponentDeployment.deploymentId). */
  spaceId?: string;
  /** ComponentDeployment.releaseTargetId — presence gates the history query and publish/withdraw availability. Also scopes the named-release bulk-tag `where` clause. */
  releaseTargetId?: string;
  /** Reports a failure using the same shape AppComponentView's setErrorsForDeployments expects. */
  onError: (entry: { title: string; detail: string; timestamp: Date }) => void;
  /** Reports a success message using the same channel AppComponentView's flashSuccess expects. */
  onSuccess: (message: string) => void;
}

/** Optional name/notes for a publish — both blank/omitted means the classic one-click, unnamed publish. */
export interface ReleaseNameInput {
  name?: string;
  notes?: string;
}

/**
 * One entry per Release THIS hook has published (this session) that
 * succeeded but bundled zero Units (see releaseBundle.ts) — the
 * "embarrassing" failure mode this exists to catch.
 */
export interface EmptyBundleWarning {
  releaseId: string;
  releaseNum: number;
}

export interface ReleaseActions {
  /** Releases for the selected Space, sorted by ReleaseNum descending (latest first). */
  releases: ExtendedReleaseRead[];
  /** The highest-ReleaseNum entry, i.e. the currently published state. Undefined when there are no releases yet. */
  latestRelease: ExtendedReleaseRead | undefined;
  isReleasesLoading: boolean;
  /**
   * True for the FULL duration of a publish — including the
   * createTag/bulkTagUnits steps for a named release, the final
   * publishRelease call, AND the settle window afterwards. publishRelease's
   * own mutation promise resolves before the Release/Revision/Unit-tag
   * invalidation it triggers actually refetches, so without the settle
   * window `releases`/`latestRelease` (and everything derived from them —
   * history rows, Unreleased Changes diffs) could still read stale for a
   * moment after the spinner already stopped. Stays true until
   * `latestRelease` shows a higher ReleaseNum than it had right before this
   * publish, or a safety-net timeout elapses.
   */
  isReleasing: boolean;
  isWithdrawing: boolean;
  /**
   * ReleaseIDs whose Withdraw call has resolved but whose removal from
   * `releases` hasn't been observed yet — same settle-window rationale as
   * `isReleasing` above, keyed per release since more than one row could in
   * principle be settling at once. Drives the per-row inflight indicator;
   * prefer this over `isWithdrawing` (a single flag not keyed by row, and
   * unaware of the settle window).
   */
  withdrawingReleaseIds: ReadonlySet<string>;
  onRelease: (input?: ReleaseNameInput) => Promise<void>;
  /** Resolves once the withdraw mutation call itself settles (success or handled failure) — for the row inflight indicator, prefer `withdrawingReleaseIds`, which also covers the post-mutation settle window. */
  onWithdraw: (releaseId: string) => Promise<void>;
  /**
   * Every Release published THIS session that succeeded but bundled zero
   * Units, keyed by ReleaseID. ACCUMULATES across publishes — publishing
   * again (empty or not) never wipes an earlier flagged release's entry, so
   * a "0 units" badge stays a persistent, honest record of that specific
   * release rather than a transient "just happened" flash (task #58 fix for
   * the bug where a single overwritten value silently dropped older
   * warnings). A release's entry is removed only by withdrawing that
   * specific release. Session-local and NOT retroactive: only Releases this
   * hook has itself published are ever checked — pre-existing history rows
   * from before this session/mount are never decoded (checking every
   * historical row would mean fetching each one's full `Data`, the exact
   * large-payload cost plan 001's `select` narrowing was written to avoid).
   */
  emptyBundleWarnings: ReadonlyMap<string, EmptyBundleWarning>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Narrow the release-list payload to only the fields the pane renders
 * (status line + history rows). Mirrors the select-narrowing pattern used
 * for the units query (see AppComponentView.tsx ~263-279).
 *
 * `Published` is selected (not just filtered on, see `RELEASE_LIST_WHERE`
 * below) so it round-trips onto `ExtendedReleaseRead.Release.Published` —
 * cheap, and keeps the field available to any future caller without a
 * second round trip.
 *
 * `select` is a real column projection server-side, so a field left out of
 * this list arrives as its Go zero value. `UnitCount` is a scalar the Releases
 * pane compares against the units it can actually show ("Showing 3 of 5 units
 * …"); without it here that comparison silently reads 0 and never fires.
 */
const RELEASE_LIST_SELECT_FIELDS =
  'ReleaseID,ReleaseNum,SpaceID,TagID,CreatedAt,Published,UnitCount';

/**
 * Only currently-published Releases are ever shown here. `Withdraw`
 * (`internal/views/release_core.go:629-638`) does NOT delete the row — it
 * clears `Published` and keeps it (a separate `Delete` operation, which
 * nothing in this UI calls, is what actually removes it; see that file's own
 * doc: "the Release itself is retained; delete it to remove it entirely").
 * Filtering here is what makes "Withdraw" read as "gone" to the user without
 * either fabricating a delete the backend deliberately doesn't perform (the
 * retained row looks like an audit/rollback trail) or exposing a second
 * "withdrawn" UI state nobody asked for. `Published` is in Release's
 * documented where-filterable attribute list (confirmed in the OpenAPI spec
 * alongside CreatedAt/Digest/UnitCount/etc.), so this is a plain server-side
 * boolean filter, not a workaround.
 */
const RELEASE_LIST_WHERE = 'Published = true';

/**
 * `include` is REQUIRED to get the linked Tag object populated — the
 * ExtendedRelease.Tag field doc says "Expanded when requested via the
 * include parameter" (internal/models/release.go PrepareJSONSchema); the
 * bare TagID scalar is always present via `select` above, but the nested
 * Tag (DisplayName/Annotations, needed for the release name + notes) is
 * NOT populated without this.
 */
const RELEASE_LIST_INCLUDE_FIELDS = 'TagID';

/**
 * UI-owned annotation key for a named release's freeform notes, matching
 * the `ui.confighub.io/*` reverse-DNS precedent (e.g. the query-builder's
 * group-by annotation) rather than the server-side `com.confighub.*` prefix.
 */
export const RELEASE_NOTES_ANNOTATION_KEY = 'ui.confighub.io/notes';

/**
 * Safety-net timeout for the publish/withdraw settle windows below — mirrors
 * AppComponentView.tsx's upgrade settle-window timeout (same rationale:
 * these should always resolve via the settle-detector, this just guards
 * against the invalidated refetch itself never landing).
 */
const RELEASE_SETTLE_TIMEOUT_MS = 30_000;

/**
 * A release's human name comes from its linked Tag's DisplayName — but a
 * Tag created WITHOUT an explicit name still has a DisplayName (it defaults
 * to the Tag's Slug server-side, per `base_model.go:212`). Treat a
 * DisplayName equal to its own Slug as "no name given," matching plan 002's
 * display rule exactly.
 *
 * Lives in this hook module rather than beside its caller: ReleasesPane —
 * which renders the name in the lane readout — is a component module, and
 * exporting a plain helper from one would trip
 * react-refresh/only-export-components.
 */
export function getReleaseName(release: ExtendedReleaseRead): string | undefined {
  const tag = release.Tag;
  if (!tag?.DisplayName) return undefined;
  if (tag.DisplayName === tag.Slug) return undefined;
  return tag.DisplayName;
}

/** Plain text only — never dangerouslySetInnerHTML (carries forward plan 001's security amendment for untrusted display text). */
export function getReleaseNotes(release: ExtendedReleaseRead): string | undefined {
  return release.Tag?.Annotations?.[RELEASE_NOTES_ANNOTATION_KEY] || undefined;
}

// ============================================================================
// HOOK
// ============================================================================

export function useReleaseActions({
  spaceId,
  releaseTargetId,
  onError,
  onSuccess,
}: UseReleaseActionsProps): ReleaseActions {
  // The bundle is not on the Release; the emptiness check reads its data endpoint.
  const fetchReleaseBundle = useLazyReleaseBundle();
  const canRelease = !!spaceId && !!releaseTargetId;

  // Stable identity across renders so the query doesn't refire on every parent render.
  const releaseListArg = useMemo(
    () => ({
      spaceId: spaceId ?? '',
      where: RELEASE_LIST_WHERE,
      select: RELEASE_LIST_SELECT_FIELDS,
      include: RELEASE_LIST_INCLUDE_FIELDS,
    }),
    [spaceId],
  );

  // NOTE: the generated 'Release' cache tag is flat/coarse — publishing or
  // withdrawing in ANY Space invalidates every ListExtendedReleases query,
  // not just this Space's. Acceptable today (release actions are infrequent
  // and this pane only queries the selected Space); a known limitation.
  const { data: releasesData, isFetching: isReleasesLoading } = useListExtendedReleasesQuery(
    releaseListArg,
    { skip: !canRelease },
  );

  const releases = useMemo(
    () =>
      [...(releasesData ?? [])].sort(
        (a, b) => (b.Release?.ReleaseNum ?? 0) - (a.Release?.ReleaseNum ?? 0),
      ),
    [releasesData],
  );

  const latestRelease = useMemo(() => releases[0], [releases]);

  const [createTagMutation] = useCreateTagMutation();
  const [bulkTagUnitsMutation] = useBulkTagUnitsMutation();
  const [publishReleaseMutation, { isLoading: isPublishMutationLoading }] = usePublishReleaseMutation();
  const [withdrawReleaseMutation, { isLoading: isWithdrawing }] = useWithdrawReleaseMutation();

  // Spans the WHOLE composite (createTag + bulkTagUnits + publish) for a
  // named release, not just the final publishRelease call — combined with
  // the mutation's own isLoading so a plain unnamed publish (which skips
  // straight to publishReleaseMutation) still shows the spinner correctly.
  const [isComposing, setIsComposing] = useState(false);

  // Settle-detectors for isReleasing/withdrawingReleaseIds: the publish and
  // withdraw mutation promises resolve before the Release/Revision/Unit-tag
  // invalidation they trigger actually refetches, which would otherwise let
  // the spinner clear ahead of `releases`/`latestRelease` catching up.
  // Mirrors AppComponentView.tsx's upgradeSettleTargetsRef /
  // upgradingDeploymentIds pattern, applied to this hook's own release-list
  // state instead of units.
  const publishSettleTargetRef = useRef<{ preLatestReleaseNum: number } | null>(null);
  const [isSettlingPublish, setIsSettlingPublish] = useState(false);
  const withdrawSettleTargetsRef = useRef<Set<string>>(new Set());
  const [withdrawingReleaseIds, setWithdrawingReleaseIds] = useState<ReadonlySet<string>>(() => new Set());

  const isReleasing = isComposing || isPublishMutationLoading || isSettlingPublish;

  const [emptyBundleWarnings, setEmptyBundleWarnings] = useState<ReadonlyMap<string, EmptyBundleWarning>>(
    () => new Map(),
  );

  const onRelease = useCallback(
    async (input?: ReleaseNameInput) => {
      if (!spaceId) return;
      const name = input?.name?.trim();
      const notes = input?.notes?.trim();
      const isNamed = !!name || !!notes;
      const preLatestReleaseNum = latestRelease?.Release?.ReleaseNum ?? 0;

      setIsComposing(true);
      try {
        let tagId: string | undefined;

        if (isNamed) {
          try {
            const tag = await createTagMutation({
              spaceId,
              tag: {
                // Generated, URL-safe, unique — the human-facing string is DisplayName.
                Slug: `release-${Date.now()}`,
                DisplayName: name ?? '',
                ...(notes ? { Annotations: { [RELEASE_NOTES_ANNOTATION_KEY]: notes } } : {}),
              },
            }).unwrap();
            tagId = tag.TagID;
          } catch (err: unknown) {
            onError({
              title: 'Failed to name release',
              detail: getApiErrorMessage(err),
              timestamp: new Date(),
            });
            return;
          }

          if (tagId && releaseTargetId) {
            try {
              // MUST match exactly the unit set release_core.go bundles
              // (TargetID == the Space's ReleaseTargetID) — a narrower where
              // would leave some units untagged, and they'd silently
              // publish at head instead of the named revision.
              await bulkTagUnitsMutation({
                where: `SpaceID = '${spaceId}' AND TargetID = '${releaseTargetId}'`,
                unitTagRequest: { TagID: tagId, Revision: 'HeadRevisionNum' },
              }).unwrap();
            } catch (err: unknown) {
              // Tag now exists, orphaned — cheap/inert, no rollback for v1
              // (plan's answer to partial-failure atomicity).
              onError({
                title: 'Failed to tag units for release',
                detail: getApiErrorMessage(err),
                timestamp: new Date(),
              });
              return;
            }
          }
        }

        try {
          const published = await publishReleaseMutation({
            spaceId,
            releasePublishRequest: tagId ? { TagID: tagId } : {},
          }).unwrap();
          // Nothing changed since the latest Release, so none was created and
          // there is nothing to settle on.
          const release = published.Release;
          if (published.Message || !release) {
            onSuccess('No change: no Release was created');
            return;
          }

          // Start the settle window now — publish always creates a new
          // Release row (ReleaseNum higher than preLatestReleaseNum), empty
          // bundle or not, so the settle-detector effect below will pick this
          // up once `releases` reflects it.
          publishSettleTargetRef.current = { preLatestReleaseNum };
          setIsSettlingPublish(true);

          // Embarrassment-prevention safeguard: the publish above returns
          // 200 even when the bundle is empty (release_core.go only bundles
          // Units whose TargetID equals the Space's ReleaseTargetID — most
          // real Spaces won't have that until retargeted). Data is present
          // on this response by default (verified against a live backend —
          // see releaseBundle.ts), so no extra fetch is needed to check.
          let isEmpty = false;
          const bundle = release.ReleaseID
            ? await fetchReleaseBundle(spaceId, release.ReleaseID)
            : undefined;
          if (bundle) {
            try {
              isEmpty = await isEmptyReleaseBundle(bundle);
            } catch {
              // Decode failure must never block the success path — treat as
              // "unknown," not "empty" (a false negative here is much safer
              // than crashing or falsely warning on a real publish).
              isEmpty = false;
            }
          }

          if (isEmpty && release.ReleaseID && release.ReleaseNum != null) {
            // Deliberately NOT calling onSuccess — this is not the normal
            // green success treatment (task requirement). The warning
            // itself, surfaced by the caller via emptyBundleWarnings, IS the
            // feedback for this publish.
            //
            // ACCUMULATE, never overwrite (task #58): a later publish — empty
            // or not — must not silently wipe an earlier flagged release's
            // entry out of the map.
            const releaseId = release.ReleaseID;
            const releaseNum = release.ReleaseNum;
            setEmptyBundleWarnings((prev) => {
              const next = new Map(prev);
              next.set(releaseId, { releaseId, releaseNum });
              return next;
            });
          } else {
            // A non-empty publish says nothing about any OTHER release's
            // warning — earlier flagged entries are left untouched.
            onSuccess(`Released rel-${release.ReleaseNum ?? '?'}`);
          }
        } catch (err: unknown) {
          // Detect the apply-gate case off the RAW RTK error's HTTP status
          // BEFORE formatting with getApiErrorMessage (which strips status
          // and treats Message as opaque display text — never substring-matched).
          const status = (err as FetchBaseQueryError | undefined)?.status;
          const detail =
            status === 422
              ? 'Release blocked: outstanding release gates must be resolved first.'
              : getApiErrorMessage(err);
          onError({ title: 'Release failed', detail, timestamp: new Date() });
        }
      } finally {
        setIsComposing(false);
      }
    },
    [
      spaceId,
      releaseTargetId,
      latestRelease,
      createTagMutation,
      bulkTagUnitsMutation,
      publishReleaseMutation,
      onSuccess,
      onError,
    ],
  );

  const onWithdraw = useCallback(
    async (releaseId: string) => {
      if (!spaceId) return;
      try {
        await withdrawReleaseMutation({ spaceId, releaseId }).unwrap();
        withdrawSettleTargetsRef.current.add(releaseId);
        setWithdrawingReleaseIds((prev) => new Set([...prev, releaseId]));
        onSuccess('Release withdrawn');
        // The warning no longer applies once its Release is gone — remove
        // only THIS release's entry, leaving every other flagged release
        // untouched.
        setEmptyBundleWarnings((prev) => {
          if (!prev.has(releaseId)) return prev;
          const next = new Map(prev);
          next.delete(releaseId);
          return next;
        });
      } catch (err: unknown) {
        onError({ title: 'Withdraw failed', detail: getApiErrorMessage(err), timestamp: new Date() });
      }
    },
    [spaceId, withdrawReleaseMutation, onSuccess, onError],
  );

  // Settle-detector: clear the publish settle window once `latestRelease`
  // shows a ReleaseNum higher than it had right before this publish — proof
  // the Release-tag-invalidated refetch has landed.
  useEffect(() => {
    if (!publishSettleTargetRef.current) return;
    const currentNum = latestRelease?.Release?.ReleaseNum ?? 0;
    if (currentNum > publishSettleTargetRef.current.preLatestReleaseNum) {
      publishSettleTargetRef.current = null;
      setIsSettlingPublish(false);
    }
  }, [latestRelease]);

  // Timeout safety net: publish always raises ReleaseNum on success, so this
  // only guards against the invalidated refetch itself never landing.
  useEffect(() => {
    if (!isSettlingPublish) return;
    const timeout = setTimeout(() => {
      publishSettleTargetRef.current = null;
      setIsSettlingPublish(false);
    }, RELEASE_SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isSettlingPublish]);

  // Settle-detector: drop a releaseId from withdrawingReleaseIds once it's no
  // longer present in `releases` — proof the withdrawal actually landed.
  useEffect(() => {
    if (withdrawSettleTargetsRef.current.size === 0) return;
    const stillPresentIds = new Set(
      releases.map((r) => r.Release?.ReleaseID).filter((id): id is string => id != null),
    );
    const settledIds: string[] = [];
    for (const id of withdrawSettleTargetsRef.current) {
      if (!stillPresentIds.has(id)) settledIds.push(id);
    }
    if (settledIds.length === 0) return;
    for (const id of settledIds) withdrawSettleTargetsRef.current.delete(id);
    setWithdrawingReleaseIds((prev) => {
      const next = new Set(prev);
      for (const id of settledIds) next.delete(id);
      return next;
    });
  }, [releases]);

  // Timeout safety net, same rationale as publish's above.
  useEffect(() => {
    if (withdrawingReleaseIds.size === 0) return;
    const timedOutIds = new Set(withdrawingReleaseIds);
    const timeout = setTimeout(() => {
      for (const id of timedOutIds) withdrawSettleTargetsRef.current.delete(id);
      setWithdrawingReleaseIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const id of timedOutIds) next.delete(id);
        return next.size === prev.size ? prev : next;
      });
    }, RELEASE_SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [withdrawingReleaseIds]);

  return useMemo(
    () => ({
      releases,
      latestRelease,
      isReleasesLoading,
      isReleasing,
      isWithdrawing,
      withdrawingReleaseIds,
      onRelease,
      onWithdraw,
      emptyBundleWarnings,
    }),
    [
      releases,
      latestRelease,
      isReleasesLoading,
      isReleasing,
      isWithdrawing,
      withdrawingReleaseIds,
      onRelease,
      onWithdraw,
      emptyBundleWarnings,
    ],
  );
}
