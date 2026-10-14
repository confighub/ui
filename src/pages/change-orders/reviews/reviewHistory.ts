// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Review events for the ChangeOrder History card, from the gate summaries.
 *
 * - `approved` / `rejected`: one per decision, at its time. `blocksPromotion`
 *   only for a Fail the server counts (not FailIgnored).
 * - `revoked`: one per revoked decision, at the revocation, naming the REVOKER
 *   (the attester or a manager of the Space) and whose decision it was.
 * - `expired`: derived from the server's `ValidUntil` per requirement and the
 *   client clock: one per distinct instant at which the decision stopped
 *   counting toward requirements, naming them, when that came before any
 *   revocation.
 * - `requested`: one per real review request (`ChangeOrder.ReviewRequests`), by
 *   the requester, of the requested user. Nothing is invented.
 *
 * A decision or request read by more than one gate is one event.
 *
 * Pure: no React, no requests.
 */

import type { HistoryPerson } from '../changeOrderHistory';
import type { GateReviewSummary, HistoryReviewEntry, ReviewDecision } from './changeOrderReviewTypes';

export type { HistoryReviewEntry, ReviewEventKind } from './changeOrderReviewTypes';

export interface BuildReviewHistoryInput {
  summaries: readonly GateReviewSummary[];
  /** Epoch ms. */
  now: number;
  person: (userId: string | undefined) => HistoryPerson;
}

function epoch(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

/** The requirements a decision is about: those it counts toward, else those the server reported it for. */
function decisionRequirementNames(decision: ReviewDecision): string[] {
  if (decision.countsToward.length > 0) return decision.countsToward;
  return Object.keys(decision.byRequirement);
}

/** For each satisfied requirement, the decision that completed it: the `required`-th distinct counted passer, oldest first. */
function completingDecisions(summary: GateReviewSummary): Map<string, string[]> {
  const byDecisionId = new Map<string, string[]>();
  const oldestFirst = [...summary.decisions].reverse();
  for (const requirement of summary.requirements) {
    if (!requirement.satisfied || requirement.rejected || !requirement.evaluated) continue;
    const people = new Set<string>();
    for (const decision of oldestFirst) {
      if (decision.result !== 'Pass' || !decision.countsToward.includes(requirement.name)) continue;
      people.add(decision.person.userId);
      if (people.size === requirement.required) {
        byDecisionId.set(decision.id, [...(byDecisionId.get(decision.id) ?? []), requirement.name]);
        break;
      }
    }
  }
  return byDecisionId;
}

const mergeNames = (a: string[] | undefined, b: string[] | undefined) => {
  const merged = [...new Set([...(a ?? []), ...(b ?? [])])];
  return merged.length === 0 ? undefined : merged;
};

/** Every review event of every gate, newest first. */
export function buildReviewHistory(input: BuildReviewHistoryInput): HistoryReviewEntry[] {
  const byId = new Map<string, HistoryReviewEntry>();
  const add = (entry: HistoryReviewEntry) => {
    const known = byId.get(entry.id);
    if (known === undefined) {
      byId.set(entry.id, entry);
      return;
    }
    known.requirementNames = mergeNames(known.requirementNames, entry.requirementNames) ?? [];
    known.satisfiedRequirementNames = mergeNames(known.satisfiedRequirementNames, entry.satisfiedRequirementNames);
    if (entry.blocksPromotion === true) known.blocksPromotion = true;
  };

  for (const summary of input.summaries) {
    const completing = completingDecisions(summary);
    const stage = summary.gate.stageName;
    const gateKind = summary.gate.kind;
    for (const decision of summary.decisions) {
      const createdAt = epoch(decision.createdAt);
      if (createdAt === undefined) continue;
      const attester = input.person(decision.person.userId);
      const common = {
        kind: 'review' as const,
        gateKind,
        stage,
        type: decision.type,
        ...(decision.note === '' ? {} : { note: decision.note }),
      };
      const satisfied = completing.get(decision.id);
      add({
        ...common,
        id: `review-${decision.id}`,
        at: createdAt,
        reviewKind: decision.result === 'Pass' ? 'approved' : 'rejected',
        userId: decision.person.userId,
        person: attester,
        requirementNames: decisionRequirementNames(decision),
        ...(satisfied ? { satisfiedRequirementNames: satisfied } : {}),
        ...(decision.result === 'Fail' ? { blocksPromotion: decision.blocksPromotion === true } : {}),
      });

      const revokedAt = epoch(decision.revokedAt);
      if (revokedAt !== undefined) {
        const revoker = decision.revokedBy ?? decision.person;
        add({
          ...common,
          id: `review-revoked-${decision.id}`,
          at: revokedAt,
          reviewKind: 'revoked',
          userId: revoker.userId,
          person: input.person(revoker.userId),
          originalPerson: attester,
          requirementNames: decisionRequirementNames(decision),
          replacesAt: createdAt,
        });
      }

      // One "expired" event per instant, naming the requirements whose server ValidUntil passed then.
      const byInstant = new Map<number, string[]>();
      for (const [name, entry] of Object.entries(decision.byRequirement)) {
        const at = epoch(entry.validUntil);
        if (at === undefined || at > input.now || (revokedAt !== undefined && at >= revokedAt)) continue;
        byInstant.set(at, [...(byInstant.get(at) ?? []), name]);
      }
      for (const [at, names] of byInstant) {
        add({
          ...common,
          id: `review-expired-${decision.id}-${at}`,
          at,
          reviewKind: 'expired',
          userId: decision.person.userId,
          person: attester,
          requirementNames: names,
        });
      }
    }

    for (const request of summary.requests) {
      const at = epoch(request.requestedAt);
      if (at === undefined) continue;
      add({
        kind: 'review',
        id: `review-requested-${request.stage}-${request.user.userId}-${at}`,
        at,
        reviewKind: 'requested',
        gateKind,
        ...(request.requestedBy ? { userId: request.requestedBy.userId } : {}),
        person: input.person(request.requestedBy?.userId),
        requestedOf: input.person(request.user.userId),
        stage: request.stage === '' ? summary.gateStageName : request.stage,
        type: summary.primary?.rules.type ?? 'Approval',
        requirementNames: summary.requirements.map((requirement) => requirement.name),
      });
    }
  }
  return [...byId.values()].sort((a, b) => b.at - a.at);
}

/** The UserIDs the review entries name (attesters, revokers, requesters, requested), for the users read. */
export function reviewHistoryUserIds(summaries: readonly GateReviewSummary[]): string[] {
  const ids = new Set<string>();
  for (const summary of summaries) {
    for (const decision of summary.decisions) {
      if (decision.person.userId !== '') ids.add(decision.person.userId);
      if (decision.revokedBy?.userId) ids.add(decision.revokedBy.userId);
    }
    for (const request of summary.requests) {
      ids.add(request.user.userId);
      if (request.requestedBy?.userId) ids.add(request.requestedBy.userId);
    }
  }
  return [...ids];
}
