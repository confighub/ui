// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The review state of one gate (entry, release or Final), from the server's
 * own gate results (#5788 `PromoteGateResult.Attestation`): counts, authors,
 * discard reasons, validity and the caller's eligibility are the server's. This
 * file only arranges them:
 *
 * - requirements and Spaces from the rows (a Space without a row is NOT
 *   EVALUATED, with no count);
 * - decisions from the Attestation records (who, what, note, revoker), each
 *   annotated with what the server's entries say about its records;
 * - who can still approve: named users and group members, less the server's
 *   authors of unsatisfied Revisions and those already counted;
 * - review requests placed on the gate.
 *
 * Pure: no React, no requests.
 */

import type {
  AttestationGateEntry,
  AttestationRead,
  ChangeWorkflowAttestationPrerequisite,
  PromoteGateResult,
} from '@confighub/rtk-query';

import type { ChangeOrderApprover, ChangeOrderGate } from '../../x/apps/change-order/changeOrderTypes';
import type {
  AttestationDiscardReason,
  CallerReason,
  DecisionGateEntry,
  DeriveGateReviewsInput,
  GateReviewSummary,
  NotEvaluatedReason,
  PromoteReadiness,
  RequirementProgress,
  RequirementRules,
  RequirementSpaceProgress,
  RequirementViewer,
  ReviewAuthorIn,
  ReviewChoice,
  ReviewDecision,
  ReviewGroup,
  ReviewPerson,
  ReviewRequestView,
  ReviewUser,
  StageReviewState,
  ViewerEligibility,
} from './changeOrderReviewTypes';

/** The Attestation Type a requirement selects when it names none. */
export const DEFAULT_ATTESTATION_TYPE = 'Approval';

/**
 * Records of one person within this window of the first form one decision (one /attest call).
 * One call writes its records (one per Space) in one transaction, so they are seconds apart at
 * most; two calls a minute apart are two decisions.
 */
export const DECISION_WINDOW_MS = 2_000;

/** Up to two letters or digits for a monogram. A parenthesised suffix such as "(Service Account)" is ignored. */
export function reviewInitials(name: string): string {
  const parts = name
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** The Type an Attestation or a requirement names, with the server's default. */
export function attestationType(type: string | undefined): string {
  return type?.trim() || DEFAULT_ATTESTATION_TYPE;
}

/** The requirement rules, with the server's defaults applied. */
export function requirementRules(
  definition: ChangeWorkflowAttestationPrerequisite,
  person: (userId: string) => ReviewPerson,
  groups: Record<string, ReviewGroup>,
): RequirementRules {
  const fromGroupIds = definition.FromGroupIDs ?? [];
  const distinctGroups = definition.DistinctGroups === true;
  const count = definition.Count !== undefined && definition.Count > 0 ? definition.Count : 1;
  return {
    type: attestationType(definition.Type),
    required: distinctGroups ? fromGroupIds.length : count,
    count,
    fromUsers: (definition.FromUserIDs ?? []).map(person),
    fromGroups: fromGroupIds.map((groupId) => groups[groupId] ?? { groupId, memberUserIds: [] }),
    distinctGroups,
    allowAuthors: definition.AllowAuthors === true,
    maxAge: definition.MaxAge?.trim() || undefined,
    ignoreFail: definition.IgnoreFail === true,
  };
}

/**
 * Whether a requirement names the user: anyone when it names no Users or Groups, else a
 * named User or a CURRENT member of a named Group. For the who-can list, and for a viewer
 * the server did not evaluate; never for a count.
 */
export function attesterIsEligible(rules: RequirementRules, userId: string, users: Record<string, ReviewUser>): boolean {
  if (rules.fromUsers.length === 0 && rules.fromGroups.length === 0) return true;
  if (rules.fromUsers.some((person) => person.userId === userId)) return true;
  const groupIds = users[userId]?.groupIds ?? [];
  return rules.fromGroups.some((group) => groupIds.includes(group.groupId));
}

// ---------------------------------------------------------------------------
// Records and decisions
// ---------------------------------------------------------------------------

interface Requirement {
  definition: ChangeWorkflowAttestationPrerequisite;
  name: string;
  rules: RequirementRules;
  rows: PromoteGateResult[];
}

interface ReviewRecord {
  attestation: AttestationRead;
  id: string;
  userId: string;
  spaceId: string;
  type: string;
  result: ReviewChoice;
  createdMs: number;
  revokedAt?: string;
  revokedBy?: string;
}

function timeMs(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function personOf(userId: string, input: DeriveGateReviewsInput): ReviewPerson {
  const user = input.users[userId];
  const name = user?.name ?? (userId === '' ? 'Not recorded' : userId.slice(0, 8));
  return { userId, name, initials: user?.initials ?? reviewInitials(name), isYou: userId !== '' && userId === input.viewerUserId };
}

function uniquePeople(people: ReviewPerson[]): ReviewPerson[] {
  const seen = new Set<string>();
  return people.filter((person) => (seen.has(person.userId) ? false : (seen.add(person.userId), true)));
}

const entriesOf = (rows: readonly PromoteGateResult[]): AttestationGateEntry[] =>
  rows.flatMap((row) => row.Attestation?.Attestations ?? []);

/** The records that are this gate's decisions: in its Spaces, or named by its server rows. */
function toRecords(input: DeriveGateReviewsInput): ReviewRecord[] {
  const revoked = new Map<string, { at: string; by?: string }>();
  for (const revocation of input.revocations) {
    const target = revocation.RevokedAttestationID;
    if (!target) continue;
    const at = revocation.CreatedAt ?? '';
    const known = revoked.get(target);
    if (known === undefined || at < known.at) revoked.set(target, { at, by: revocation.UserID });
  }
  const named = new Set(entriesOf(input.serverRows).map((entry) => entry.AttestationID ?? ''));
  const gateSpaceIds = new Set(input.gateSpaces.map((space) => space.spaceId));
  const seen = new Set<string>();
  const records: ReviewRecord[] = [];
  for (const attestation of input.attestations) {
    if (attestation.RevokedAttestationID) continue;
    const id = attestation.AttestationID;
    const createdMs = timeMs(attestation.CreatedAt);
    if (!id || seen.has(id) || createdMs === undefined) continue;
    // A call for another stage records in that stage's Spaces, and is that gate's decision.
    if (!gateSpaceIds.has(attestation.SpaceID ?? '') && !named.has(id)) continue;
    seen.add(id);
    const revocation = revoked.get(id);
    records.push({
      attestation,
      id,
      userId: attestation.UserID ?? '',
      spaceId: attestation.SpaceID ?? '',
      type: attestationType(attestation.Type),
      result: attestation.Result === 'Fail' ? 'Fail' : 'Pass',
      createdMs,
      revokedAt: revocation?.at,
      revokedBy: revocation?.by,
    });
  }
  return records.sort((a, b) => a.createdMs - b.createdMs || a.id.localeCompare(b.id));
}

/** Records of one /attest call: same person, Type, result, note and ChangeOrder, close in time, one per Space. */
function groupRecords(records: ReviewRecord[]): ReviewRecord[][] {
  const groups: ReviewRecord[][] = [];
  for (const record of records) {
    const group = groups.find((candidate) => {
      const first = candidate[0];
      return (
        first.userId === record.userId &&
        first.type === record.type &&
        first.result === record.result &&
        (first.attestation.Note ?? '') === (record.attestation.Note ?? '') &&
        (first.attestation.ChangeOrderID ?? '') === (record.attestation.ChangeOrderID ?? '') &&
        record.createdMs - first.createdMs <= DECISION_WINDOW_MS &&
        !candidate.some((member) => member.spaceId === record.spaceId)
      );
    });
    if (group === undefined) groups.push([record]);
    else group.push(record);
  }
  return groups;
}

/** What the server says about a decision's records for one requirement, merged over Spaces. */
function gateEntryOf(ids: ReadonlySet<string>, requirement: Requirement): DecisionGateEntry | undefined {
  const entries = entriesOf(requirement.rows).filter((entry) => ids.has(entry.AttestationID ?? ''));
  if (entries.length === 0) return undefined;
  const countedOn = Math.max(...entries.map((entry) => entry.CountedOn ?? 0));
  const reason = countedOn > 0 ? undefined : (entries.find((entry) => entry.Reason)?.Reason as AttestationDiscardReason | undefined);
  const untils = entries.map((entry) => entry.ValidUntil).filter((until): until is string => !!until).sort();
  return { countedOn, ...(reason ? { reason } : {}), ...(untils.length > 0 ? { validUntil: untils[0] } : {}) };
}

interface DecisionWork {
  decision: ReviewDecision;
  records: ReviewRecord[];
}

function buildDecisions(records: ReviewRecord[], requirements: Requirement[], input: DeriveGateReviewsInput): DecisionWork[] {
  const spaceSlug = (record: ReviewRecord) =>
    input.gateSpaces.find((space) => space.spaceId === record.spaceId)?.spaceSlug ?? record.attestation.SpaceSlug ?? record.spaceId;
  const person = (userId: string) => personOf(userId, input);

  const works = groupRecords(records).map((group): DecisionWork => {
    const first = group[0];
    const ids = new Set(group.map((record) => record.id));
    const byRequirement: Record<string, DecisionGateEntry> = {};
    for (const requirement of requirements) {
      const entry = gateEntryOf(ids, requirement);
      if (entry !== undefined) byRequirement[requirement.name] = entry;
    }
    const entries = Object.values(byRequirement);
    const revokedByRecord = group.every((record) => record.revokedAt !== undefined);
    const revoked = revokedByRecord || (entries.length > 0 && entries.every((entry) => entry.reason === 'Revoked'));
    const expired = entries.length > 0 && entries.every((entry) => entry.reason === 'Expired' || entry.reason === 'TooOld');
    const lastRevocation = revokedByRecord
      ? group.reduce((latest, record) => ((record.revokedAt ?? '') > (latest.revokedAt ?? '') ? record : latest))
      : undefined;
    const countsToward = requirements.map((r) => r.name).filter((name) => (byRequirement[name]?.countedOn ?? 0) > 0);
    const decision: ReviewDecision = {
      id: first.id,
      attestationIds: group.map((record) => record.id),
      type: first.type,
      person: person(first.userId),
      result: first.result,
      note: first.attestation.Note ?? '',
      createdAt: first.attestation.CreatedAt ?? new Date(first.createdMs).toISOString(),
      live: !revoked && !expired,
      expired,
      ...(lastRevocation?.revokedAt ? { revokedAt: lastRevocation.revokedAt } : {}),
      ...(lastRevocation?.revokedBy ? { revokedBy: person(lastRevocation.revokedBy) } : {}),
      spaceSlugs: group.map(spaceSlug),
      byRequirement,
      countsToward,
      // A Fail the server counts blocks; one it ignores (FailIgnored, CountedOn 0) does not.
      blocksPromotion: first.result === 'Fail' && countsToward.length > 0,
    };
    return { decision, records: group };
  });

  // A revoked decision is replaced by the same person's next decision of the same Type.
  works.forEach((work, index) => {
    if (work.decision.live) return;
    if (work.decision.revokedAt === undefined) return;
    const next = works
      .slice(index + 1)
      .find((later) => later.decision.person.userId === work.decision.person.userId && later.decision.type === work.decision.type);
    if (next === undefined) return;
    work.decision.replacedByDecisionId = next.decision.id;
    next.decision.replacesDecisionId = work.decision.id;
  });
  return works;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

/** Why a Space has no row for the requirement: the hook says, else a held `Promoted` row means not reached. */
function notEvaluatedFor(spaceId: string, input: DeriveGateReviewsInput): NotEvaluatedReason {
  const said = input.notEvaluatedBySpaceId[spaceId];
  if (said !== undefined) return said;
  const notPromoted = input.serverRows.some((row) => row.SpaceID === spaceId && row.Prerequisite === 'Promoted' && row.Satisfied !== true);
  return notPromoted ? 'notReached' : 'error';
}

function spaceProgress(requirement: Requirement, spaceId: string, spaceSlug: string, input: DeriveGateReviewsInput): RequirementSpaceProgress {
  const person = (userId: string) => personOf(userId, input);
  const row = requirement.rows.find((candidate) => candidate.SpaceID === spaceId);
  const empty = { unsatisfied: [], truncated: false, authors: [], revisions: 0, satisfiedRevisions: 0 };
  if (row === undefined) {
    // A complete workflow: the server held every Final row (it refuses a promote saying so),
    // and every stage was entered; it asks for no rows any more.
    if (input.completed === true) {
      return {
        spaceId,
        spaceSlug,
        evaluated: true,
        satisfied: true,
        required: requirement.rules.required,
        counted: requirement.rules.required,
        ...empty,
      };
    }
    return {
      spaceId,
      spaceSlug,
      evaluated: false,
      notEvaluated: notEvaluatedFor(spaceId, input),
      satisfied: false,
      required: requirement.rules.required,
      counted: 0,
      ...empty,
    };
  }
  const result = row.Attestation;
  const caller = result?.Caller;
  return {
    spaceId,
    spaceSlug: row.SpaceSlug || spaceSlug,
    evaluated: true,
    satisfied: row.Satisfied === true,
    ...(row.Reason ? { reason: row.Reason } : {}),
    ...(row.Message ? { message: row.Message } : {}),
    required: result?.Required ?? requirement.rules.required,
    counted: result?.Counted ?? 0,
    revisions: result?.Revisions ?? 0,
    satisfiedRevisions: result?.SatisfiedRevisions ?? 0,
    unsatisfied: (result?.Unsatisfied ?? []).map((revision) => ({
      unitSlug: revision.UnitSlug ?? revision.UnitID ?? '',
      revisionNum: revision.RevisionNum ?? 0,
      counted: revision.Counted ?? 0,
      reason: revision.Reason ?? '',
      authors: (revision.AuthorUserIDs ?? []).map(person),
    })),
    truncated: result?.Truncated === true,
    authors: (result?.AuthorUserIDs ?? []).map(person),
    ...(caller
      ? {
          caller: {
            counts: caller.Counts === true,
            ...(caller.Reason ? { reason: caller.Reason as CallerReason } : {}),
            authoredRevisions: caller.AuthoredRevisions ?? 0,
          },
        }
      : {}),
  };
}

function requirementViewer(
  requirement: Requirement,
  perSpace: RequirementSpaceProgress[],
  notEvaluated: NotEvaluatedReason | undefined,
  input: DeriveGateReviewsInput,
): RequirementViewer {
  const viewer = input.viewerUserId;
  if (!viewer) return { kind: 'signedOut' };
  const eligible = attesterIsEligible(requirement.rules, viewer, input.users);
  const evaluated = perSpace.filter((space) => space.evaluated);
  if (evaluated.length === 0) return { kind: 'notEvaluated', why: notEvaluated ?? 'error', mayDecide: eligible };
  const withCaller = evaluated.filter((space) => space.caller !== undefined);
  // Rows without a Caller (a completed workflow): the requirement's own list is all there is.
  if (withCaller.length === 0) return eligible ? { kind: 'counts' } : { kind: 'notEligible' };
  if (withCaller.some((space) => space.caller?.reason === 'NotEligible')) return { kind: 'notEligible' };
  const countsIn = withCaller.filter((space) => space.caller?.counts).map((space) => space.spaceSlug);
  const authorIn: ReviewAuthorIn[] = withCaller
    .filter((space) => space.caller?.reason === 'Author')
    .map((space) => ({ spaceSlug: space.spaceSlug, authoredRevisions: space.caller?.authoredRevisions ?? 0, revisions: space.revisions }));
  if (authorIn.length === 0) return { kind: 'counts' };
  if (countsIn.length === 0) return { kind: 'author', authorIn };
  return { kind: 'partial', countsIn, authorIn };
}

function requirementProgress(requirement: Requirement, works: DecisionWork[], input: DeriveGateReviewsInput): RequirementProgress {
  const { rules, name } = requirement;
  const perSpace = input.gateSpaces.map((space) => spaceProgress(requirement, space.spaceId, space.spaceSlug, input));
  const evaluatedSpaces = perSpace.filter((space) => space.evaluated);
  const evaluated = evaluatedSpaces.length > 0;
  const notEvaluated = evaluated ? undefined : (perSpace[0]?.notEvaluated ?? 'error');
  const passes = evaluated ? Math.min(...evaluatedSpaces.map((space) => space.counted)) : 0;
  const required = evaluated ? Math.max(...evaluatedSpaces.map((space) => space.required)) : rules.required;
  const satisfied = evaluated && evaluatedSpaces.every((space) => space.satisfied);
  const rejected = evaluatedSpaces.some((space) => space.reason === 'AttestationRejected');

  const entries = entriesOf(requirement.rows);
  const person = (userId: string) => personOf(userId, input);
  const countedOf = (result: ReviewChoice) =>
    entries.filter((entry) => (entry.CountedOn ?? 0) > 0 && (entry.Result === 'Fail' ? 'Fail' : 'Pass') === result);
  const validUntil = countedOf('Pass')
    .map((entry) => entry.ValidUntil)
    .filter((until): until is string => !!until)
    .sort()[0];
  const viewer = input.viewerUserId;
  const own = viewer
    ? [...works].reverse().find((work) => work.decision.live && work.decision.person.userId === viewer && work.decision.type === rules.type)
    : undefined;

  return {
    name,
    ...(requirement.definition.Description ? { description: requirement.definition.Description } : {}),
    rules,
    gate: input.gate,
    evaluated,
    ...(notEvaluated ? { notEvaluated } : {}),
    passes,
    required,
    need: satisfied || !evaluated ? 0 : Math.max(0, required - passes),
    rejected,
    satisfied,
    perSpace,
    passers: uniquePeople(countedOf('Pass').map((entry) => person(entry.UserID ?? ''))),
    rejecters: uniquePeople(countedOf('Fail').map((entry) => person(entry.UserID ?? ''))),
    ...(validUntil ? { validUntil } : {}),
    viewer: requirementViewer(requirement, perSpace, notEvaluated, input),
    ...(own ? { ownDecisionId: own.decision.id } : {}),
  };
}

function stageState(requirements: RequirementProgress[]): StageReviewState {
  const evaluated = requirements.filter((requirement) => requirement.evaluated);
  if (evaluated.length === 0) return 'none';
  if (evaluated.some((requirement) => requirement.rejected && !requirement.satisfied)) return 'rejected';
  if (evaluated.every((requirement) => requirement.satisfied)) return 'satisfied';
  if (evaluated.every((requirement) => requirement.passes === 0)) return 'pending';
  return 'partial';
}

function viewerEligibility(requirements: RequirementProgress[], viewerUserId: string | undefined): ViewerEligibility {
  if (!viewerUserId) return { kind: 'signedOut' };
  const deciding = requirements.filter((r) => r.viewer.kind === 'counts' || r.viewer.kind === 'partial');
  const authorIn = [
    ...new Set(
      requirements.flatMap((r) => (r.viewer.kind === 'author' || r.viewer.kind === 'partial' ? r.viewer.authorIn.map((a) => a.spaceSlug) : [])),
    ),
  ];
  if (deciding.length > 0) {
    const types = [...new Set(deciding.map((r) => r.rules.type))];
    const requirementNames = deciding.map((r) => r.name);
    return authorIn.length > 0 ? { kind: 'partial', types, requirementNames, authorIn } : { kind: 'counts', types, requirementNames };
  }
  if (authorIn.length > 0) return { kind: 'author', authorIn };
  const unevaluated = requirements.filter((r) => r.viewer.kind === 'notEvaluated');
  if (unevaluated.length > 0) {
    const may = unevaluated.filter((r) => r.viewer.kind === 'notEvaluated' && r.viewer.mayDecide);
    const first = unevaluated[0].viewer;
    return {
      kind: 'notEvaluated',
      why: first.kind === 'notEvaluated' ? first.why : 'error',
      mayDecide: may.length > 0,
      types: [...new Set(may.map((r) => r.rules.type))],
      requirementNames: (may.length > 0 ? may : unevaluated).map((r) => r.name),
    };
  }
  return { kind: 'notEligible', requirementNames: requirements.map((r) => r.name) };
}

function primaryRequirement(requirements: RequirementProgress[]): RequirementProgress | undefined {
  return requirements.find((r) => r.rejected && !r.satisfied) ?? requirements.find((r) => !r.satisfied) ?? requirements[0];
}

/** The review state of one gate, or undefined when it names no attestation requirement. */
export function deriveGateReviews(input: DeriveGateReviewsInput): GateReviewSummary | undefined {
  const person = (userId: string) => personOf(userId, input);
  const requirements: Requirement[] = input.requirementNames.flatMap((name) => {
    const definition = input.definitions.find((candidate) => candidate.Name === name);
    if (definition === undefined) return [];
    return [
      {
        definition,
        name,
        rules: requirementRules(definition, person, input.groups),
        rows: input.serverRows.filter((row) => row.Prerequisite === name),
      },
    ];
  });
  if (requirements.length === 0) return undefined;

  const works = buildDecisions(toRecords(input), requirements, input);
  const progress = requirements.map((requirement) => requirementProgress(requirement, works, input));
  const decisions = works.map((work) => work.decision).reverse();
  const primary = primaryRequirement(progress);

  const ownByType: Record<string, ReviewDecision> = {};
  if (input.viewerUserId) {
    for (const decision of decisions) {
      if (decision.live && decision.person.userId === input.viewerUserId && ownByType[decision.type] === undefined) {
        ownByType[decision.type] = decision;
      }
    }
  }

  const requests: ReviewRequestView[] = input.reviewRequests
    .filter((request) => (request.Stage ?? '') === input.requestStage)
    .map((request) => ({
      stage: request.Stage ?? '',
      gateKeys: [input.gate.key],
      user: person(request.UserID),
      requestedAt: request.RequestedAt ?? '',
      ...(request.RequestedByUserID ? { requestedBy: person(request.RequestedByUserID) } : {}),
      reviewed: decisions.some((decision) => decision.live && decision.person.userId === request.UserID),
    }));
  const requestedOfViewer = requests.find((request) => request.user.isYou);
  const earliestRequest = requests
    .map((request) => request.requestedAt)
    .filter(Boolean)
    .sort()[0];

  // Who can still approve the primary requirement: named Users, then members of named Groups,
  // less the server's authors of unsatisfied Revisions and those it already counts.
  const whoCanStillApprove: GateReviewSummary['whoCanStillApprove'] = [];
  if (primary !== undefined) {
    const authors = new Set(primary.rules.allowAuthors ? [] : primary.perSpace.flatMap((space) => space.authors.map((a) => a.userId)));
    const counted = new Set([...primary.passers, ...primary.rejecters].map((p) => p.userId));
    const add = (userId: string, viaGroupId?: string) => {
      if (authors.has(userId) || counted.has(userId) || whoCanStillApprove.some((entry) => entry.person.userId === userId)) return;
      const requested = requests.find((request) => request.user.userId === userId);
      whoCanStillApprove.push({ person: person(userId), ...(viaGroupId ? { viaGroupId } : {}), ...(requested ? { requested } : {}) });
    };
    for (const user of primary.rules.fromUsers) add(user.userId);
    for (const group of primary.rules.fromGroups) for (const member of group.memberUserIds) add(member, group.groupId);
  }

  let waiting: Pick<GateReviewSummary, 'waitingSince' | 'waitingSinceSource'> = {};
  if (earliestRequest) waiting = { waitingSince: earliestRequest, waitingSinceSource: 'reviewRequest' };
  else if (input.lastPromotionAt) waiting = { waitingSince: input.lastPromotionAt, waitingSinceSource: 'promotion' };

  return {
    gate: input.gate,
    gateStageName: input.gateStageName,
    gateSpaces: input.gateSpaces,
    requirements: progress,
    primary,
    state: stageState(progress),
    open: progress.every((r) => r.evaluated && r.satisfied),
    evaluated: progress.some((r) => r.evaluated),
    ...waiting,
    requests,
    ...(requestedOfViewer ? { requestedOfViewer } : {}),
    decisions,
    viewer: { eligibility: viewerEligibility(progress, input.viewerUserId), ownByType },
    whoCanStillApprove,
    attestTarget: input.attestTarget,
  };
}

/**
 * Whether the stage can be promoted into: `ready` only when EVERY server gate
 * row for it is satisfied; `reviewsComplete` when the reviews are and other
 * gates hold it; `unknown` when the server has not answered.
 */
export function promoteReadiness(
  summary: GateReviewSummary | undefined,
  rows: readonly PromoteGateResult[] | undefined,
): PromoteReadiness {
  if (rows === undefined || rows.length === 0) return { kind: 'unknown' };
  if (summary !== undefined && !summary.open) {
    if (!summary.evaluated) return { kind: 'unknown' };
    if (summary.state === 'rejected') return { kind: 'rejected' };
    return { kind: 'held', need: summary.primary?.need ?? 0 };
  }
  const reviewNames = new Set(summary?.requirements.map((r) => r.name) ?? []);
  const holding = [
    ...new Set(rows.filter((row) => row.Satisfied !== true && !reviewNames.has(row.Prerequisite ?? '')).map((row) => row.Prerequisite ?? '')),
  ];
  return holding.length === 0 ? { kind: 'ready' } : { kind: 'reviewsComplete', otherGatesHolding: holding };
}

function toApprover(person: ReviewPerson): ChangeOrderApprover {
  return { userId: person.userId, name: person.name, initials: person.initials };
}

/** The gates with `approvers` filled for each requirement row (passers, then rejecters). Other gates keep their identity. */
export function withReviewApprovers(gates: ChangeOrderGate[], summary: GateReviewSummary | undefined): ChangeOrderGate[] {
  if (summary === undefined) return gates;
  return gates.map((gate) => {
    const requirement = summary.requirements.find(
      (candidate) => gate.prerequisite === candidate.name || gate.id === `attestation-prerequisite:${candidate.name}`,
    );
    if (requirement === undefined) return gate;
    return { ...gate, approvers: uniquePeople([...requirement.passers, ...requirement.rejecters]).map(toApprover) };
  });
}
