// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Reviews for the ChangeOrder detail view, from the server's gate results (#5788).
 *
 * `useChangeOrderReviews(detail)` arranges every reviewed gate (entry, release,
 * Final); `useGateReviews(detail, gate)` adds the coverage, the submit and the
 * review requests for one gate. Both share one set of reads (RTK dedupes them).
 *
 * SERVER ROWS (counts, authors, discard reasons, validity, caller eligibility)
 * - entry: the promote dry run per stage (`detail.serverGatesByStage`; a refused
 *   stage is in `detail.serverGateRefusals`, 403 = no permission);
 * - release: a Release dry run per Space of each stage promoted into and not yet
 *   released there with release requirements (`releaseGates`);
 * - final: the promote dry run with no TargetStage (`detail.finalAnswer`).
 * A Space without a row is "not evaluated" and has no count.
 *
 * RECORDS (who, what, note, revoker): this ChangeOrder's Attestations, the ones
 * the server's entries name, and their revocations. Users and group members for
 * the who-can list. `ChangeOrder.ReviewRequests` for requests.
 *
 * WRITES, all with `authFetch` (`quietServerCalls.ts`), not the RTK base query, whose
 * 403 handler replaces the page with /access-denied; a refusal is reported here:
 * - `submit`: revocations (with the ChangeOrder and the revoked Type; records
 *   already revoked are skipped), then one `/attest` per Type. Not atomic; each
 *   failure says what was done. After any write the records are read again, THEN
 *   the server gates.
 * - `withdraw`: revocations of the viewer's own live rejections, with no new
 *   decision; the same reads afterwards as `submit`.
 * - `requestReview` / `withdrawReviewRequest` / `reRequestReview`: a merge PATCH
 *   of the ChangeOrder's ReviewRequests with its Version; on a 409 the
 *   ChangeOrder is read again and the PATCH sent once more; a 403 hides the
 *   action (`canRequestReview`).
 */

import { skipToken } from '@reduxjs/toolkit/query';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { useListUsersByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { inClause } from '@/hooks/inClauseChunks';
import { usePolling } from '@/hooks/usePolling';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  useListAllRevisionsQuery,
  useListGroupsQuery,
  useListSpacesQuery,
  type AttestationRead,
  type ChangeWorkflowAttestationPrerequisite,
  type PromoteGateResult,
  type UserRead,
} from '@confighub/rtk-query';

import { authFetch } from '@/auth/session';
import { SERVER_GATES_POLL_INTERVAL_MS } from '../../x/apps/change-order/useServerStageGates';
import type { ChangeOrderDetail } from '../useChangeOrderDetail';
import { DEFAULT_ATTESTATION_TYPE, combineGateReviews, deriveGateReviews, promoteReadiness } from './changeOrderReviews';
import type {
  GateReviewSummary,
  PromoteReadiness,
  ReviewCoverage,
  ReviewGateRef,
  ReviewGroup,
  ReviewRequestOutcome,
  ReviewRequestView,
  ReviewUser,
  StageReviewRail,
  SubmitReviewInput,
  SubmitReviewOutcome,
  UseChangeOrderReviewsResult,
  UseGateReviewsResult,
  UseStageReviewsResult,
  WithdrawReviewOutcome,
} from './changeOrderReviewTypes';
import { changeReviewRequests, recordAttestation, revokeAttestation, type ReviewRequestsChange } from './quietServerCalls';
import { useAttestDryRunsByTypeQuery, useListAttestationRecordsQuery, useListRevocationsQuery } from './reviewAttestationsApi';
import { useListGroupMembersQuery, useReleaseGatesQuery } from './reviewServerApi';
import {
  attestSpaceErrors,
  changedUnitIdsOf,
  gateKey,
  gateServerRowsOf,
  markUnchanged,
  ownLiveRejections,
  planRevocations,
  reviewRecordIds,
  refusalText,
  reviewAttestTarget,
  reviewCoverageOf,
  reviewLastPromotion,
  reviewRailOf,
  reviewUserOf,
  reviewedGates,
  revocationBody,
  runRevocations,
  WITHDRAWN_NOTE,
  type GateServerReads,
  type ReviewedGate,
  type RevocationTarget,
} from './stageReviewInputs';

const NOW_TICK_MS = 60_000;
/** How long a recorded decision waits for the server's fresh gate verdicts before saying it could not. */
const VERDICT_WAIT_MS = 20_000;
/** Two Revisions per Unit (start and end Tags) of the Spaces reviewed, at the server's largest page. */
const CHANGED_REVISION_LIMIT = 1000;
const EMPTY_RECORDS: AttestationRead[] = [];
const EMPTY_DEFINITIONS: ChangeWorkflowAttestationPrerequisite[] = [];
const NO_GATES: readonly ReviewGateRef[] = [];

/** The message of an RTK error: the server's own when it sent one. */
function errorText(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const message = refusalText((error as { data?: unknown }).data);
    if (message) return message.trim();
  }
  return getApiErrorMessage(error, fallback);
}

const promotedSomewhere = (spaceIds: readonly string[], resolved: ReadonlySet<string>) => spaceIds.some((id) => resolved.has(id));

const entryIdsOf = (rows: readonly PromoteGateResult[]) =>
  rows.flatMap((row) => (row.Attestation?.Attestations ?? []).map((entry) => entry.AttestationID ?? '')).filter(Boolean);

// ---------------------------------------------------------------------------
// Shared reads
// ---------------------------------------------------------------------------

interface ReviewData {
  gates: ReviewedGate[];
  byGateKey: Record<string, GateReviewSummary>;
  summaries: GateReviewSummary[];
  records: AttestationRead[];
  isLoading: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

function useReviewData(detail: ChangeOrderDetail, options: { poll?: boolean } = {}): ReviewData {
  const { userInfo } = useUserInfo();
  const viewerUserId = userInfo?.UserID;

  const [now, setNow] = useState(() => Date.now());
  const tick = useCallback(() => setNow(Date.now()), []);
  usePolling(tick, NOW_TICK_MS);

  // The org-wide Space list `useChangeOrderDetail` reads, under the same cache key: no request.
  const spaces = useListSpacesQuery({});
  const spaceSlugById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of spaces.data ?? []) if (entry.Space?.SpaceID && entry.Space.Slug) map.set(entry.Space.SpaceID, entry.Space.Slug);
    return map;
  }, [spaces.data]);

  const { workflow, sequence, baseSpaceId, baseSpaceSlug, ownSpaceReached, changeOrderId, workflowCompleted } = detail;
  const gates = useMemo(
    () => reviewedGates(workflow, sequence, { spaceSlugById, ownSpaceReached, baseSpaceId, baseSpaceSlug }),
    [workflow, sequence, spaceSlugById, ownSpaceReached, baseSpaceId, baseSpaceSlug],
  );

  // Release dry runs: each Space of a release-gated stage promoted into and not yet released.
  const resolved = detail.progress.resolvedSpaceIds;
  const released = detail.progress.releasedSpaceIds;
  const releaseSpaceIds = useMemo(
    () =>
      gates
        .filter((gate) => gate.gate.kind === 'release')
        .flatMap((gate) => gate.gateSpaces.map((space) => space.spaceId))
        .filter((id) => resolved.has(id) && !released.has(id)),
    [gates, resolved, released],
  );
  const releaseRuns = useReleaseGatesQuery(
    changeOrderId === undefined || releaseSpaceIds.length === 0 ? skipToken : { changeOrderId, spaceIds: releaseSpaceIds },
  );

  // The server rows of every gate, and why a Space has none.
  const { serverGatesByStage, serverGateRefusals, finalAnswer } = detail;
  const rowsByGateKey = useMemo(() => {
    const reads: GateServerReads = {
      workflowCompleted,
      serverGatesByStage,
      serverGateRefusals,
      ...(finalAnswer ? { finalAnswer } : {}),
      resolvedSpaceIds: resolved,
      releasedSpaceIds: released,
      ...(releaseRuns.data ? { releaseAnswers: releaseRuns.data } : {}),
      releaseReadFailed: releaseRuns.isError,
    };
    return Object.fromEntries(gates.map((gate) => [gate.gate.key, gateServerRowsOf(gate, reads)]));
  }, [gates, workflowCompleted, serverGatesByStage, serverGateRefusals, finalAnswer, resolved, released, releaseRuns.data, releaseRuns.isError]);

  // Records: this ChangeOrder's, and those the server entries name; then their revocations.
  const namedIds = useMemo(
    () => [...new Set(Object.values(rowsByGateKey).flatMap((entry) => entryIdsOf(entry.rows)))].sort(),
    [rowsByGateKey],
  );
  const recordsRead = useListAttestationRecordsQuery(
    changeOrderId === undefined || gates.length === 0 ? skipToken : { changeOrderId, attestationIds: namedIds },
  );
  const records = recordsRead.data ?? EMPTY_RECORDS;
  const recordIds = useMemo(() => records.map((r) => r.AttestationID ?? '').filter(Boolean).sort(), [records]);
  const revocationsRead = useListRevocationsQuery(recordIds.length === 0 ? skipToken : { attestationIds: recordIds });
  const revocations = revocationsRead.data ?? EMPTY_RECORDS;

  // People and Groups.
  const definitions = workflow?.AttestationPrerequisites ?? EMPTY_DEFINITIONS;
  const groupIds = useMemo(() => [...new Set(definitions.flatMap((d) => d.FromGroupIDs ?? []))].sort(), [definitions]);
  const members = useListGroupMembersQuery(groupIds.length === 0 || gates.length === 0 ? skipToken : { groupIds });
  // Names only for the Groups the viewer can read (their own); others show an ID (#5737).
  const groupNames = useListGroupsQuery({ where: inClause('GroupID', groupIds) }, { skip: groupIds.length === 0 || gates.length === 0 });
  const reviewRequests = detail.reviewRequests;
  const userIds = useMemo(() => {
    if (gates.length === 0) return [];
    const ids = new Set<string>();
    for (const record of [...records, ...revocations]) if (record.UserID) ids.add(record.UserID);
    for (const definition of definitions) for (const id of definition.FromUserIDs ?? []) ids.add(id);
    for (const entry of Object.values(rowsByGateKey)) {
      for (const row of entry.rows) {
        for (const id of row.Attestation?.AuthorUserIDs ?? []) ids.add(id);
        for (const revision of row.Attestation?.Unsatisfied ?? []) for (const id of revision.AuthorUserIDs ?? []) ids.add(id);
        for (const e of row.Attestation?.Attestations ?? []) if (e.UserID) ids.add(e.UserID);
      }
    }
    for (const request of reviewRequests) {
      ids.add(request.UserID);
      if (request.RequestedByUserID) ids.add(request.RequestedByUserID);
    }
    if (viewerUserId) ids.add(viewerUserId);
    return [...ids].filter(Boolean).sort();
  }, [gates.length, records, revocations, definitions, rowsByGateKey, reviewRequests, viewerUserId]);
  const users = useListUsersByIdChunkedQuery({ userIds }, { skip: userIds.length === 0 });

  const { reviewUsers, reviewGroups } = useMemo(() => {
    const read = new Map<string, UserRead>();
    for (const entry of users.data ?? []) if (entry.User?.UserID) read.set(entry.User.UserID, entry.User);
    for (const list of Object.values(members.data ?? {})) for (const user of list) if (user.UserID && !read.has(user.UserID)) read.set(user.UserID, user);
    const byId: Record<string, ReviewUser> = {};
    for (const [userId, user] of read) byId[userId] = reviewUserOf(userId, user);
    const names = new Map<string, string>();
    for (const entry of groupNames.data ?? []) {
      const group = entry.Group;
      if (group?.GroupID) names.set(group.GroupID, group.DisplayName?.trim() || group.Slug);
    }
    const groupsById: Record<string, ReviewGroup> = {};
    for (const groupId of groupIds) {
      groupsById[groupId] = {
        groupId,
        ...(names.has(groupId) ? { name: names.get(groupId) } : {}),
        memberUserIds: (members.data?.[groupId] ?? []).map((user) => user.UserID ?? '').filter(Boolean),
      };
    }
    return { reviewUsers: byId, reviewGroups: groupsById };
  }, [users.data, members.data, groupNames.data, groupIds]);

  const { promotions, createdAt } = detail;
  const summaries = useMemo(() => {
    if (changeOrderId === undefined) return [];
    return gates.flatMap((gate) => {
      const server = rowsByGateKey[gate.gate.key];
      const lastPromotionAt = reviewLastPromotion(gate, promotions, createdAt);
      const summary = deriveGateReviews({
        gate: gate.gate,
        gateStageName: gate.gateStageName,
        gateSpaces: gate.gateSpaces,
        requirementNames: gate.requirementNames,
        definitions,
        serverRows: server?.rows ?? [],
        notEvaluatedBySpaceId: server?.notEvaluatedBySpaceId ?? {},
        attestations: records,
        revocations,
        users: reviewUsers,
        groups: reviewGroups,
        reviewRequests,
        requestStage: gate.requestStage,
        ...(lastPromotionAt ? { lastPromotionAt } : {}),
        ...(viewerUserId ? { viewerUserId } : {}),
        attestTarget: reviewAttestTarget(changeOrderId, gate),
        ...(server?.completed ? { completed: true } : {}),
        now,
      });
      return summary === undefined ? [] : [summary];
    });
  }, [changeOrderId, gates, rowsByGateKey, promotions, createdAt, definitions, records, revocations, reviewUsers, reviewGroups, reviewRequests, viewerUserId, now]);
  const byGateKey = useMemo(() => Object.fromEntries(summaries.map((s) => [s.gate.key, s])), [summaries]);

  // A skipped query has nothing to refetch (RTK throws if asked), so only started ones are.
  const started = [recordsRead, revocationsRead, releaseRuns].map((query) => (query.isUninitialized ? undefined : query.refetch));
  const [refetchRecords, refetchRevocations, refetchRelease] = started;
  const refetch = useCallback(async () => {
    await Promise.all(
      [refetchRecords, refetchRevocations, refetchRelease].map(async (run) => {
        if (run !== undefined) await run();
      }),
    );
  }, [refetchRecords, refetchRevocations, refetchRelease]);
  const pollReads = useCallback(() => {
    if (options.poll === true) void refetch();
  }, [options.poll, refetch]);
  usePolling(pollReads, SERVER_GATES_POLL_INTERVAL_MS);

  const firstError = [recordsRead, revocationsRead, members].find((query) => query.error !== undefined)?.error;

  return {
    gates,
    byGateKey,
    summaries,
    records: useMemo(() => [...records, ...revocations], [records, revocations]),
    isLoading: recordsRead.isLoading || revocationsRead.isLoading || users.isLoading,
    ...(firstError !== undefined ? { error: errorText(firstError, 'Reviews could not be loaded.') } : {}),
    refetch,
  };
}

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

/** The gate the stage's rail line follows: release once the stage is promoted into, else entry. */
function currentGateKey(stageId: string, spaceIds: readonly string[], detail: ChangeOrderDetail, byGateKey: Record<string, GateReviewSummary>) {
  const release = byGateKey[gateKey('release', stageId)];
  if (release !== undefined && promotedSomewhere(spaceIds, detail.progress.resolvedSpaceIds)) return release.gate.key;
  if (byGateKey[gateKey('entry', stageId)] !== undefined) return gateKey('entry', stageId);
  return release?.gate.key;
}

/** The summaries of every reviewed gate, for the History card. Shares the page's reads. */
export function useChangeOrderReviewSummaries(detail: ChangeOrderDetail): { summaries: GateReviewSummary[] } {
  const data = useReviewData(detail);
  return { summaries: data.summaries };
}

export function useChangeOrderReviews(detail: ChangeOrderDetail, options: { poll?: boolean } = {}): UseChangeOrderReviewsResult {
  const data = useReviewData(detail, options);
  const { byGateKey, summaries } = data;

  const railByStageId = useMemo(() => {
    const rails: Record<string, StageReviewRail> = {};
    for (const stage of detail.sequence.stages) {
      if (stage.isSource) continue;
      const key = currentGateKey(stage.id, stage.spaceIds, detail, byGateKey);
      if (key !== undefined) rails[stage.id] = reviewRailOf(byGateKey[key]);
    }
    return rails;
  }, [detail, byGateKey]);

  const finalSummary = summaries.find((summary) => summary.gate.kind === 'final');
  const completeRail = useMemo(() => (finalSummary === undefined ? undefined : reviewRailOf(finalSummary)), [finalSummary]);

  // The first held gate in time order: the entry into the next stage, else a release held on
  // review in a promoted stage, else Final.
  const bandGate = useMemo<ReviewGateRef | undefined>(() => {
    const entry = detail.nextStageId === null ? undefined : byGateKey[gateKey('entry', detail.nextStageId)];
    if (entry !== undefined && !entry.open) return entry.gate;
    const release = summaries.find(
      (summary) =>
        summary.gate.kind === 'release' &&
        !summary.open &&
        promotedSomewhere(summary.gateSpaces.map((space) => space.spaceId), detail.progress.resolvedSpaceIds),
    );
    if (release !== undefined) return release.gate;
    if (finalSummary !== undefined && !finalSummary.open && detail.nextStageId === null) return finalSummary.gate;
    return undefined;
  }, [byGateKey, summaries, detail.nextStageId, detail.progress.resolvedSpaceIds, finalSummary]);

  const readinessByStageId = useMemo(() => {
    const readiness: Record<string, PromoteReadiness> = {};
    for (const stage of detail.sequence.stages) {
      if (stage.isSource) continue;
      const rows = detail.serverGatesByStage[stage.id];
      const summary = byGateKey[gateKey('entry', stage.id)];
      if (rows === undefined && summary === undefined) continue;
      readiness[stage.id] = promoteReadiness(summary, rows);
    }
    return readiness;
  }, [detail.sequence.stages, detail.serverGatesByStage, byGateKey]);

  const requestedOfViewer = useMemo(
    () =>
      summaries.flatMap((summary): { gate: ReviewGateRef; request: ReviewRequestView }[] =>
        summary.requestedOfViewer ? [{ gate: summary.gate, request: summary.requestedOfViewer }] : [],
      ),
    [summaries],
  );

  return {
    byGateKey,
    railByStageId,
    ...(completeRail ? { completeRail } : {}),
    ...(bandGate ? { bandGate } : {}),
    readinessByStageId,
    requestedOfViewer,
    isLoading: data.isLoading,
    ...(data.error ? { error: data.error } : {}),
  };
}

/** The Types the viewer records for a gate: those of the requirements they may decide on, in workflow order. */
function decisionTypes(summary: GateReviewSummary | undefined): string[] {
  const eligibility = summary?.viewer.eligibility;
  if (eligibility?.kind === 'counts' || eligibility?.kind === 'partial') return eligibility.types;
  if (eligibility?.kind === 'notEvaluated' && eligibility.mayDecide) return eligibility.types;
  // An author is shown what a decision would cover (nothing that counts), by the primary's Type.
  if (eligibility?.kind === 'author' && summary?.primary !== undefined) return [summary.primary.rules.type];
  return [];
}

/**
 * The review of one or more gates that read the same Spaces (see `combineGateReviews`).
 * A gate that reads other Spaces is not part of it, and its actions revoke only the review's own records.
 */
export function useGateReviews(detail: ChangeOrderDetail, gates: readonly ReviewGateRef[]): UseGateReviewsResult {
  const data = useReviewData(detail, { poll: true });
  const { changeOrderId, refreshServerGates, baseSpaceId, startTagId, endTagId } = detail;
  const keys = gates.map((gate) => gate.key).join(',');
  const summary = useMemo(
    () => combineGateReviews(keys.split(',').flatMap((key) => (data.byGateKey[key] === undefined ? [] : [data.byGateKey[key]]))),
    [keys, data.byGateKey],
  );
  const reviewed = data.gates.find((candidate) => candidate.gate.key === summary?.gate.key);

  // Which Units the change changed in the Spaces reviewed: entry and Final gates read only those.
  const onlyChanged = summary !== undefined && (summary.feeds ?? [summary.gate]).every((gate) => gate.kind !== 'release');
  const tagWhere = useMemo(() => {
    if (!onlyChanged || summary === undefined || startTagId === undefined || endTagId === undefined) return undefined;
    const spaces = summary.gateSpaces.map((space) => `'${space.spaceId}'`).sort();
    if (spaces.length === 0) return undefined;
    return `SpaceID IN (${spaces.join(', ')}) AND Tags.*.TagID IN ('${startTagId}', '${endTagId}')`;
  }, [onlyChanged, summary, startTagId, endTagId]);
  const tagged = useListAllRevisionsQuery(
    tagWhere === undefined ? skipToken : { where: tagWhere, distinctOn: 'Off', limit: CHANGED_REVISION_LIMIT, select: 'UnitID,RevisionNum,Tags' },
  );
  const changedUnitIds = useMemo(() => {
    const rows = tagged.data;
    // A full page may have left some out: then nothing is called unchanged.
    if (rows === undefined || rows.length >= CHANGED_REVISION_LIMIT) return undefined;
    return changedUnitIdsOf(
      rows.flatMap((row) => (row.Revision === undefined ? [] : [row.Revision])),
      startTagId,
      endTagId,
    );
  }, [tagged.data, startTagId, endTagId]);

  const types = useMemo(() => decisionTypes(summary), [summary]);
  const dryRunArg = useMemo(() => {
    if (summary === undefined || types.length === 0) return undefined;
    return { request: { ...summary.attestTarget, Result: 'Pass' }, types };
  }, [summary, types]);
  const dryRuns = useAttestDryRunsByTypeQuery(dryRunArg ?? skipToken);
  const refetchDryRuns = dryRuns.isUninitialized ? undefined : dryRuns.refetch;
  const coverageByType = useMemo(() => {
    const out: Record<string, ReviewCoverage> = {};
    for (const [type, answer] of Object.entries(dryRuns.data ?? {})) {
      const coverage = reviewCoverageOf(type, answer.result);
      if (coverage !== undefined) out[type] = markUnchanged(coverage, changedUnitIds, onlyChanged);
    }
    return out;
  }, [dryRuns.data, changedUnitIds, onlyChanged]);
  const coverageErrors = Object.entries(dryRuns.data ?? {}).flatMap(([type, answer]) => (answer.error === undefined ? [] : [`${type}: ${answer.error}`]));
  let coverageError: string | undefined;
  if (dryRuns.error !== undefined) coverageError = errorText(dryRuns.error, 'Coverage is not available.');
  else if (coverageErrors.length > 0) coverageError = coverageErrors.join('; ');

  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Records revoked on this page, until the list is read again: a retry must not revoke them twice. */
  const revokedInSession = useRef(new Set<string>());
  const { records, refetch } = data;

  /**
   * The records again, THEN the server verdicts, so the count and the decisions move
   * together. These writes bypass RTK, so no tag invalidates the records or the
   * coverage. A failed read never fails the decision: it is recorded either way.
   */
  const rereadRecords = useCallback(async () => {
    try {
      await refetch();
      if (refetchDryRuns !== undefined) void refetchDryRuns();
    } catch {
      // The next poll reads them.
    }
  }, [refetch, refetchDryRuns]);
  /**
   * The server's fresh verdicts, for the page to word its result from. False when they
   * did not arrive in time or could not be read, and the page then says so.
   */
  const awaitVerdicts = useCallback(async (): Promise<boolean> => {
    let timer: number | undefined;
    try {
      return await Promise.race([
        refreshServerGates().then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((resolve) => {
          timer = window.setTimeout(() => resolve(false), VERDICT_WAIT_MS);
        }),
      ]);
    } finally {
      window.clearTimeout(timer);
    }
  }, [refreshServerGates]);

  const submit = useCallback(
    async (input: SubmitReviewInput): Promise<SubmitReviewOutcome> => {
      type Failure = Extract<SubmitReviewOutcome, { ok: false }>;
      const failure = (stage: Failure['stage'], message: string, extra: Partial<Failure> = {}): Failure => ({
        ok: false,
        stage,
        message,
        revokedSpaceSlugs: [],
        recordedTypes: [],
        spaceErrors: [],
        ...extra,
      });
      if (summary === undefined || changeOrderId === undefined || types.length === 0) {
        return failure('record', 'There is no review here that you can record.');
      }
      setIsSubmitting(true);
      let wrote = false;
      let reread = false;
      const rereadOnce = async () => {
        reread = true;
        await rereadRecords();
      };
      let revokedSpaceSlugs: string[] = [];
      const recordedTypes: string[] = [];
      const recorded: { type: string; revisionCount: number; spaceCount: number }[] = [];
      const spaceErrors: { spaceSlug: string; message: string }[] = [];
      try {
        if (input.replaces !== undefined && input.replaces.length > 0) {
          const revokeOne = async (target: RevocationTarget) => {
            await revokeAttestation(authFetch, target.spaceId, revocationBody(target, changeOrderId));
            wrote = true;
          };
          const run = await runRevocations(planRevocations(input.replaces, records, revokedInSession.current, reviewRecordIds(summary)), revokeOne, revokedInSession.current);
          revokedSpaceSlugs = run.revokedSpaceSlugs;
          if (!run.ok) {
            return failure('revoke', `${run.failedSpaceSlug}: ${errorText(run.error, 'The revocation was refused.')}`, { revokedSpaceSlugs });
          }
        }
        for (const type of types) {
          const recordedAnswer = await recordAttestation(authFetch, {
            ...summary.attestTarget,
            Result: input.result,
            Note: input.note,
            ...(type === DEFAULT_ATTESTATION_TYPE ? {} : { Type: type }),
          });
          if ('error' in recordedAnswer) {
            return failure('record', `${type}: ${recordedAnswer.error}`, { revokedSpaceSlugs, recordedTypes, spaceErrors });
          }
          const answer = recordedAnswer.result;
          wrote = true;
          spaceErrors.push(...attestSpaceErrors(answer));
          const spaces = answer.Spaces ?? [];
          const revisionCount = spaces.reduce((count, space) => count + (space.Subjects?.length ?? 0), 0);
          if (revisionCount > 0) {
            recordedTypes.push(type);
            recorded.push({ type, revisionCount, spaceCount: spaces.filter((space) => (space.Subjects?.length ?? 0) > 0).length });
          }
        }
        if (recorded.length === 0) {
          return failure('nothingRecorded', 'Nothing was recorded: no Space has a Revision this decision covers.', { revokedSpaceSlugs, spaceErrors });
        }
        if (spaceErrors.length > 0) {
          return failure('record', spaceErrors.map((e) => `${e.spaceSlug}: ${e.message}`).join('; '), { revokedSpaceSlugs, recordedTypes, spaceErrors });
        }
        await rereadOnce();
        const refreshed = await awaitVerdicts();
        return { ok: true, recorded, refreshed };
      } finally {
        if (wrote && !reread) {
          // A partial failure shows at once: the verdicts follow without being waited for.
          await rereadOnce();
          refreshServerGates().catch(() => undefined);
        }
        setIsSubmitting(false);
      }
    },
    [summary, changeOrderId, types, records, rereadRecords, awaitVerdicts, refreshServerGates],
  );

  /*
   * A rejection is taken back by revoking it, with no decision in its place: the
   * same revocations "Change my decision" sends, without the `/attest` after them.
   * Records revoked earlier on this page are skipped, so a retry after a part-way
   * failure does not write duplicate revocations.
   */
  const withdraw = useCallback(async (): Promise<WithdrawReviewOutcome> => {
    const rejections = ownLiveRejections(summary);
    if (changeOrderId === undefined || rejections.length === 0) {
      return { ok: false, message: 'You have no rejection here to withdraw.', revokedSpaceSlugs: [] };
    }
    setIsSubmitting(true);
    let wrote = false;
    let reread = false;
    try {
      const revokeOne = async (target: RevocationTarget) => {
        await revokeAttestation(authFetch, target.spaceId, revocationBody(target, changeOrderId, WITHDRAWN_NOTE));
        wrote = true;
      };
      const run = await runRevocations(planRevocations(rejections, records, revokedInSession.current, reviewRecordIds(summary)), revokeOne, revokedInSession.current);
      if (!run.ok) {
        return {
          ok: false,
          message: `${run.failedSpaceSlug}: ${errorText(run.error, 'The revocation was refused.')}`,
          revokedSpaceSlugs: run.revokedSpaceSlugs,
        };
      }
      reread = true;
      await rereadRecords();
      const refreshed = await awaitVerdicts();
      return { ok: true, revokedSpaceSlugs: run.revokedSpaceSlugs, refreshed };
    } finally {
      if (wrote && !reread) {
        // Part of it was withdrawn: show that at once, and let the verdicts follow.
        await rereadRecords();
        refreshServerGates().catch(() => undefined);
      }
      setIsSubmitting(false);
    }
  }, [summary, changeOrderId, records, rereadRecords, awaitVerdicts, refreshServerGates]);

  // Review requests: a merge PATCH of the whole list, with the Version; once more on a 409;
  // a 403 hides the action (and never sends the page to /access-denied).
  const [canRequestReview, setCanRequestReview] = useState(true);
  const { reviewRequests, version, refetch: refetchDetail } = detail;
  const changeRequests = useCallback(
    async (edit: ReviewRequestsChange['edit']): Promise<ReviewRequestOutcome> => {
      if (changeOrderId === undefined || baseSpaceId === undefined || reviewed === undefined) {
        return { ok: false, message: 'There is no change order to change.' };
      }
      const { forbidden, ...outcome } = await changeReviewRequests(authFetch, {
        spaceId: baseSpaceId,
        changeOrderId,
        current: reviewRequests,
        version,
        edit,
      });
      if (forbidden === true) setCanRequestReview(false);
      if (outcome.ok) refetchDetail();
      return outcome;
    },
    [changeOrderId, baseSpaceId, reviewed, reviewRequests, version, refetchDetail],
  );
  const requestStage = reviewed?.requestStage ?? '';
  const requestReview = useCallback(
    (userIds: string[]) => changeRequests({ add: { stage: requestStage, userIds } }),
    [changeRequests, requestStage],
  );
  const withdrawReviewRequest = useCallback(
    (userId: string) => changeRequests({ remove: { stage: requestStage, userId } }),
    [changeRequests, requestStage],
  );
  const reRequestReview = useCallback(
    (userId: string) => changeRequests({ rerequest: { stage: requestStage, userId } }),
    [changeRequests, requestStage],
  );

  return {
    ...(summary ? { summary } : {}),
    isLoading: data.isLoading,
    ...(data.error ? { error: data.error } : {}),
    coverageByType,
    coverageLoading: dryRuns.isFetching,
    ...(coverageError ? { coverageError } : {}),
    submit,
    isSubmitting,
    canRequestReview,
    requestReview,
    withdrawReviewRequest,
    withdraw,
    reRequestReview,
  };
}

/**
 * The v1 hook, kept while the UI moves over: the selected stage's CURRENT gate.
 * @deprecated Use useChangeOrderReviews and useGateReviews.
 */
export function useStageReviews(detail: ChangeOrderDetail, stageId: string | undefined): UseStageReviewsResult {
  const reviews = useChangeOrderReviews(detail, { poll: true });
  const stage = detail.sequence.stages.find((candidate) => candidate.id === stageId);
  const key = stage === undefined ? undefined : currentGateKey(stage.id, stage.spaceIds, detail, reviews.byGateKey);
  const gate = key === undefined ? undefined : reviews.byGateKey[key]?.gate;
  const one = useGateReviews(detail, gate === undefined ? NO_GATES : [gate]);
  const summaryByStageId = useMemo(() => {
    const out: Record<string, GateReviewSummary> = {};
    for (const summary of Object.values(reviews.byGateKey)) if (summary.gate.kind === 'entry') out[summary.gate.stageId] = summary;
    return out;
  }, [reviews.byGateKey]);
  const coverage = Object.values(one.coverageByType)[0];
  return { ...one, ...(coverage ? { coverage } : {}), railByStageId: reviews.railByStageId, summaryByStageId };
}
