// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * CONTRACT v3 between the reviews data layer (`changeOrderReviews.ts`,
 * `stageReviewInputs.ts`, `useStageReviews.ts`, `reviewHistory.ts`) and the
 * reviews UI.
 *
 * A "review" is an Attestation requirement (`AttestationPrerequisites`) that a
 * ChangeWorkflow names on one of three gates:
 * - `entry`: a stage's `Prerequisites`, evaluated over the PREVIOUS stage's
 *   Spaces (the ChangeOrder's own Space for the first stage);
 * - `release`: a stage's `ReleasePrerequisites`, over the stage's own Spaces;
 * - `final`: `Final.Prerequisites`, over the last stage's Spaces.
 *
 * THE SERVER IS THE ONLY SOURCE of counts, authors, discard reasons, validity
 * and the caller's eligibility (#5788 `AttestationGateResult`): promote dry-run
 * rows (entry), `PromoteResult.Final` (final), `ReleasePublishResponse.Gates`
 * (release). Where the server gave the viewer no row (no permission, not
 * reached, Final not open), a requirement is NOT EVALUATED and has no count;
 * the recorded decisions (Attestation records) still show, and the viewer may
 * still decide. The client keeps: who can approve (named users and group
 * members), the decisions list and history from Attestation records, revoke
 * planning, the attest targets, and review requests.
 *
 * Fields here are frozen. Add optional fields only; tell the UI work package
 * before a rename or a removal.
 */

import type {
  AttestationRead,
  ChangeOrderReviewRequestRead,
  ChangeWorkflowAttestationPrerequisite,
  PromoteGateResult,
} from '@confighub/rtk-query';

import type { HistoryPerson } from '../changeOrderHistory';

// ---------------------------------------------------------------------------
// Gates, people, codes
// ---------------------------------------------------------------------------

export type ReviewGateKind = 'entry' | 'release' | 'final';

/** One gate that names attestation requirements. `key` is `${kind}:${stageId}`. */
export interface ReviewGateRef {
  kind: ReviewGateKind;
  /** The stage entered (entry), released (release), or the last stage (final). */
  stageId: string;
  stageName: string;
  key: string;
}

export interface ReviewPerson {
  userId: string;
  name: string;
  initials: string;
  isYou: boolean;
}

/** A user as read: `groupIds` is CURRENT membership (for the who-can list only). */
export interface ReviewUser {
  userId: string;
  name: string;
  initials: string;
  groupIds: string[];
}

/** A Group a requirement names. `name` only for Groups the viewer can read (their own). */
export interface ReviewGroup {
  groupId: string;
  name?: string;
  memberUserIds: string[];
}

export interface ReviewGateSpace {
  spaceId: string;
  spaceSlug: string;
}

export type ReviewChoice = 'Pass' | 'Fail';

/** Why the server does not count an Attestation for a requirement (`AttestationGateEntry.Reason`). */
export type AttestationDiscardReason = 'Revoked' | 'Expired' | 'TooOld' | 'NotEligible' | 'Author' | 'FailIgnored';

/** Why the server does not count the CALLER (`AttestationGateCaller.Reason`). */
export type CallerReason = 'NotEligible' | 'Author';

/** A server gate code (`PromoteGateResult.Reason`). Unknown codes are kept; show the server Message. */
export type GateReasonCode = 'AttestationsMissing' | 'AttestationRejected' | (string & {});

/** Why a requirement has no server row for the viewer, so no count. */
export type NotEvaluatedReason =
  /** The promote or publish dry run was refused for the viewer (403). */
  | 'noPermission'
  /** Release: the stage is not promoted into the Space yet. */
  | 'notReached'
  /** Final: not every stage has the change. */
  | 'finalNotOpen'
  /** Release: nothing new to release in the Space (200 with no Gates). */
  | 'unchanged'
  | 'error';

// ---------------------------------------------------------------------------
// Requirements (from server rows)
// ---------------------------------------------------------------------------

export interface RequirementRules {
  /** The Attestation Type that counts. `Approval` when the workflow leaves it empty. */
  type: string;
  /** `Count` (1 when zero), or the number of groups with DistinctGroups. The server's Required wins where it answered. */
  required: number;
  count: number;
  fromUsers: ReviewPerson[];
  fromGroups: ReviewGroup[];
  distinctGroups: boolean;
  allowAuthors: boolean;
  /** The workflow's duration string, for example `72h`. */
  maxAge?: string;
  ignoreFail: boolean;
}

/** A gate Revision the server reports unsatisfied (`AttestationGateRevision`). */
export interface UnsatisfiedRevision {
  unitSlug: string;
  revisionNum: number;
  counted: number;
  reason: GateReasonCode;
  authors: ReviewPerson[];
}

export interface RequirementSpaceProgress {
  spaceId: string;
  spaceSlug: string;
  evaluated: boolean;
  notEvaluated?: NotEvaluatedReason;
  satisfied: boolean;
  reason?: GateReasonCode;
  message?: string;
  required: number;
  /** The fewest attesters on any Revision of the Space. 0 when not evaluated. */
  counted: number;
  revisions: number;
  satisfiedRevisions: number;
  unsatisfied: UnsatisfiedRevision[];
  /** The server listed at most 100 Revisions. */
  truncated: boolean;
  /** `AuthorUserIDs`: authors of UNSATISFIED Revisions only (empty in a satisfied Space). */
  authors: ReviewPerson[];
  caller?: { counts: boolean; reason?: CallerReason; authoredRevisions: number };
}

export interface ReviewAuthorIn {
  spaceSlug: string;
  authoredRevisions: number;
  revisions: number;
}

export type RequirementViewer =
  | { kind: 'counts' }
  | { kind: 'partial'; countsIn: string[]; authorIn: ReviewAuthorIn[] }
  | { kind: 'author'; authorIn: ReviewAuthorIn[] }
  | { kind: 'notEligible' }
  /**
   * No server row for the viewer. `mayDecide`: the requirement names the viewer
   * (or a group of theirs) or nobody, so the form shows; the server decides on submit.
   */
  | { kind: 'notEvaluated'; why: NotEvaluatedReason; mayDecide: boolean }
  | { kind: 'signedOut' };

export interface RequirementProgress {
  name: string;
  description?: string;
  rules: RequirementRules;
  gate: ReviewGateRef;
  /** At least one Space has a server row. */
  evaluated: boolean;
  /** Set when no Space was evaluated. */
  notEvaluated?: NotEvaluatedReason;
  /** The minimum `Counted` over evaluated Spaces. 0 when not evaluated (do not show it then). */
  passes: number;
  required: number;
  /** 0 when satisfied or not evaluated, else max(0, required - passes). */
  need: number;
  /** A server row says AttestationRejected. */
  rejected: boolean;
  /** Every evaluated Space satisfied, and at least one evaluated. */
  satisfied: boolean;
  perSpace: RequirementSpaceProgress[];
  /** From server entries with CountedOn > 0. */
  passers: ReviewPerson[];
  rejecters: ReviewPerson[];
  /** The earliest ValidUntil of a counted Pass. */
  validUntil?: string;
  viewer: RequirementViewer;
  /** The viewer's live decision of this requirement's Type. */
  ownDecisionId?: string;
}

// ---------------------------------------------------------------------------
// Decisions and requests
// ---------------------------------------------------------------------------

/** What the server said about one decision for one requirement (merged over its records and Spaces). */
export interface DecisionGateEntry {
  /** The most Revisions any of its records counts on. 0: not counted. */
  countedOn: number;
  /** Why not counted, when the server says. */
  reason?: AttestationDiscardReason;
  /** This requirement's validity end (MaxAge, ExpiresAt), from the server. */
  validUntil?: string;
}

/** One decision = the records one person made in one /attest call (one per Space), of one Type. */
export interface ReviewDecision {
  id: string;
  attestationIds: string[];
  type: string;
  person: ReviewPerson;
  result: ReviewChoice;
  note: string;
  createdAt: string;
  /** Not revoked, and not expired. */
  live: boolean;
  /** Every requirement the server reported it for discards it as Expired or TooOld. */
  expired: boolean;
  revokedAt?: string;
  /** The revocation record's author: the attester, or a manager of the Space. */
  revokedBy?: ReviewPerson;
  replacedByDecisionId?: string;
  replacesDecisionId?: string;
  spaceSlugs: string[];
  /** Only for requirements whose server rows name one of its records. */
  byRequirement: Record<string, DecisionGateEntry>;
  /** Requirements where `countedOn > 0`. */
  countsToward: string[];
  /** A Fail the server counts (not FailIgnored) for a requirement. */
  blocksPromotion?: boolean;
  /**
   * Where the decision was made, when not on this ChangeOrder: `other`, another
   * ChangeOrder (`otherChangeOrderId`); `none`, outside any ChangeOrder (for example
   * `cub attestation create`). The server carries an Attestation forward to a later
   * Revision with the same data, so its gates can count such a decision here.
   */
  origin?: 'other' | 'none';
  otherChangeOrderId?: string;
  /**
   * Requirements of its Type whose server rows do not count it on every Revision the
   * gate reads: it was recorded on other Revisions, or in Spaces another gate reads.
   * The viewer must decide again for these. Absent or empty: it covers every row.
   */
  notCovering?: string[];
}

/** A review request on the ChangeOrder (`ChangeOrder.ReviewRequests`), placed on the gates it is for. */
export interface ReviewRequestView {
  /** The stage whose Spaces are to be reviewed. '' is the ChangeOrder's own Space. */
  stage: string;
  /** The gates attested in that stage's Spaces: the entry gate of the next stage, its release and Final gates. */
  gateKeys: string[];
  user: ReviewPerson;
  requestedAt: string;
  requestedBy?: ReviewPerson;
  /** The user has a live decision in those Spaces. */
  reviewed: boolean;
}

export type ViewerEligibility =
  | { kind: 'counts'; types: string[]; requirementNames: string[] }
  | { kind: 'partial'; types: string[]; requirementNames: string[]; authorIn: string[] }
  | { kind: 'author'; authorIn: string[] }
  | { kind: 'notEligible'; requirementNames: string[] }
  /**
   * No server row for the viewer. With `mayDecide`, the form shows for `types`
   * (the requirements name the viewer, a group of theirs, or nobody).
   */
  | { kind: 'notEvaluated'; why: NotEvaluatedReason; mayDecide: boolean; types: string[]; requirementNames: string[] }
  | { kind: 'signedOut' };

export type StageReviewState = 'none' | 'pending' | 'partial' | 'satisfied' | 'rejected';

/** Whether the stage can be promoted into: reviews AND every other server gate row. */
export type PromoteReadiness =
  | { kind: 'ready' }
  | { kind: 'reviewsComplete'; otherGatesHolding: string[] }
  | { kind: 'held'; need: number }
  | { kind: 'rejected' }
  | { kind: 'unknown' };

export interface GateReviewSummary {
  gate: ReviewGateRef;
  /** The stage whose Spaces the gate reads (previous stage, own Space slug, or the stage itself). */
  gateStageName: string;
  gateSpaces: ReviewGateSpace[];
  requirements: RequirementProgress[];
  /** The first rejected requirement, else the first unsatisfied, else the first. */
  primary?: RequirementProgress;
  /** From evaluated requirements; 'none' when no requirement was evaluated. */
  state: StageReviewState;
  /** Every requirement evaluated and satisfied. */
  open: boolean;
  /** At least one requirement has a server row. */
  evaluated: boolean;
  /** The earliest review request of the gate, else the last promotion into its Spaces. */
  waitingSince?: string;
  waitingSinceSource?: 'reviewRequest' | 'promotion';
  requests: ReviewRequestView[];
  requestedOfViewer?: ReviewRequestView;
  /** Newest first, live and void. */
  decisions: ReviewDecision[];
  viewer: { eligibility: ViewerEligibility; ownByType: Record<string, ReviewDecision> };
  whoCanStillApprove: { person: ReviewPerson; decision?: ReviewDecision; viaGroupId?: string; requested?: ReviewRequestView }[];
  attestTarget: { ChangeOrderID: string; TargetStage?: string; WhereSpace?: string };
  /**
   * The gates a decision here counts toward, when one review serves several:
   * a stage's release gate and the next stage's entry gate read the same
   * Spaces and record the same Attestations. Absent: `gate` alone.
   */
  feeds?: ReviewGateRef[];
}

/** Kept as an alias so the UI's v1 imports keep compiling. */
export type StageReviewSummary = GateReviewSummary;

// ---------------------------------------------------------------------------
// Coverage and submit
// ---------------------------------------------------------------------------

export interface ReviewCoverageRow {
  revisionId: string;
  unitSlug: string;
  spaceSlug: string;
  revisionNum: number;
  /** The server's `Subject.Authored`: the viewer wrote a Revision of the change on this Unit here. */
  authored: boolean;
  unitId?: string;
  /**
   * The change did not change this Unit, and every gate of the review reads
   * only the Units it changed, so the record is kept but no gate needs it.
   */
  unchanged?: boolean;
}

/** What one /attest call of one Type would cover (dry run). */
export interface ReviewCoverage {
  type: string;
  covered: ReviewCoverageRow[];
  /** `reason` is the server's code (NoTarget | NoRevision); `message` its sentence. */
  skipped: { unitSlug: string; spaceSlug: string; reason: 'NoTarget' | 'NoRevision' | (string & {}); message?: string }[];
  /** Spaces the dry run refused (for example no Approve permission). Left out of `covered`. */
  spaceErrors: { spaceSlug: string; message: string }[];
  spaceCount: number;
  recordable: boolean;
}

export interface SubmitReviewInput {
  result: ReviewChoice;
  note: string;
  /** The viewer's live decisions the new one replaces (one per Type). */
  replaces?: ReviewDecision[];
}

export type SubmitReviewOutcome =
  | {
      ok: true;
      recorded: { type: string; revisionCount: number; spaceCount: number }[];
      /** False when the server's gate verdicts were not read again in time: the page then says so. */
      refreshed?: boolean;
    }
  | {
      ok: false;
      stage: 'revoke' | 'record' | 'nothingRecorded';
      message: string;
      revokedSpaceSlugs: string[];
      recordedTypes: string[];
      spaceErrors: { spaceSlug: string; message: string }[];
    };

/**
 * What withdrawing the viewer's rejection did. Not atomic: one revocation per
 * Space, in order, stopping at the first refusal, so a failure says which
 * Spaces were already withdrawn.
 */
export type WithdrawReviewOutcome =
  | {
      ok: true;
      revokedSpaceSlugs: string[];
      /** False when the server's gate verdicts were not read again in time: the page then says so. */
      refreshed?: boolean;
    }
  | { ok: false; message: string; revokedSpaceSlugs: string[] };

export interface ReviewRequestOutcome {
  ok: boolean;
  message?: string;
  /** The list changed under us twice (409 after one retry). */
  conflict?: boolean;
}

// ---------------------------------------------------------------------------
// Hook results
// ---------------------------------------------------------------------------

export interface StageReviewRail {
  state: StageReviewState;
  passes: number;
  required: number;
  primaryName?: string;
  requirementCount: number;
  rejecterFirstName?: string;
  gateKind: ReviewGateKind;
  /** False: show no count. */
  evaluated: boolean;
}

export interface UseGateReviewsResult {
  summary?: GateReviewSummary;
  isLoading: boolean;
  error?: string;
  coverageByType: Record<string, ReviewCoverage>;
  coverageLoading: boolean;
  coverageError?: string;
  submit(input: SubmitReviewInput): Promise<SubmitReviewOutcome>;
  isSubmitting: boolean;
  /** False after the server refused a review-request change (403). */
  canRequestReview: boolean;
  requestReview(userIds: string[]): Promise<ReviewRequestOutcome>;
  withdrawReviewRequest(userId: string): Promise<ReviewRequestOutcome>;
  /**
   * Takes back the viewer's own live rejections of this review, one per Type,
   * with no new decision in their place. Sets `isSubmitting` while it runs.
   */
  withdraw(): Promise<WithdrawReviewOutcome>;
  /** Asks one person to review again: their request gets a new time (they are requested if they were not). */
  reRequestReview(userId: string): Promise<ReviewRequestOutcome>;
}

export interface UseChangeOrderReviewsResult {
  byGateKey: Record<string, GateReviewSummary>;
  railByStageId: Record<string, StageReviewRail>;
  completeRail?: StageReviewRail;
  bandGate?: ReviewGateRef;
  readinessByStageId: Record<string, PromoteReadiness>;
  requestedOfViewer: { gate: ReviewGateRef; request: ReviewRequestView }[];
  isLoading: boolean;
  error?: string;
}

/**
 * The v1 hook's result, kept while the UI moves over.
 * @deprecated Use UseChangeOrderReviewsResult and UseGateReviewsResult.
 */
export interface UseStageReviewsResult extends UseGateReviewsResult {
  coverage?: ReviewCoverage;
  railByStageId: Record<string, StageReviewRail>;
  summaryByStageId?: Record<string, GateReviewSummary>;
}

// ---------------------------------------------------------------------------
// Derivation input
// ---------------------------------------------------------------------------

export interface DeriveGateReviewsInput {
  gate: ReviewGateRef;
  gateStageName: string;
  gateSpaces: ReviewGateSpace[];
  requirementNames: string[];
  definitions: ChangeWorkflowAttestationPrerequisite[];
  /** Entry: promote `Stages[].Gates`; release: `ReleasePublishResponse.Gates` of every Space; final: `PromoteResult.Final`. */
  serverRows: readonly PromoteGateResult[];
  /** Spaces with no server row, and why. A Space in neither has an error. */
  notEvaluatedBySpaceId: Record<string, NotEvaluatedReason>;
  /** Attestation records: those the server entries name, and this ChangeOrder's. */
  attestations: AttestationRead[];
  /** Records with RevokedAttestationID, any Type. */
  revocations: AttestationRead[];
  users: Record<string, ReviewUser>;
  groups: Record<string, ReviewGroup>;
  reviewRequests: readonly ChangeOrderReviewRequestRead[];
  /** The stage of the ChangeOrder whose Spaces the gate attests in ('' = own Space), to place requests. */
  requestStage: string;
  /** The last promotion into the gate's Spaces. */
  lastPromotionAt?: string;
  viewerUserId?: string;
  attestTarget: { ChangeOrderID: string; TargetStage?: string; WhereSpace?: string };
  /** The workflow is complete (the server refuses a promote with the completed 400): every requirement held, and no rows are asked for. */
  completed?: boolean;
  /** Epoch ms. */
  now: number;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type ReviewEventKind = 'approved' | 'rejected' | 'revoked' | 'expired' | 'requested';

export interface HistoryReviewEntry {
  kind: 'review';
  id: string;
  /** Epoch ms. */
  at: number;
  reviewKind: ReviewEventKind;
  gateKind: ReviewGateKind;
  userId?: string;
  /** The attester; the revoker for `revoked`; the requester for `requested`. */
  person: HistoryPerson;
  /** For `revoked`: whose decision was revoked. */
  originalPerson?: HistoryPerson;
  /** For `requested`: who was asked. */
  requestedOf?: HistoryPerson;
  /** The stage the gate holds: the stage entered, released, or the last one. The history's stage filter reads it, except where `reviewedStage` is a stage. */
  stage: string;
  /** The stage whose change was reviewed (whose Spaces the decision is recorded in), or the ChangeOrder's own Space with `reviewedBase`. */
  reviewedStage?: string;
  reviewedBase?: boolean;
  /** Every gate the decision counts toward, when one review serves several. */
  gates?: { kind: ReviewGateKind; stage: string }[];
  /** Made on another ChangeOrder, or outside any (see `ReviewDecision.origin`). */
  origin?: 'other' | 'none';
  requirementNames: string[];
  type: string;
  note?: string;
  revisionCount?: number;
  satisfiedRequirementNames?: string[];
  blocksPromotion?: boolean;
  /** For `revoked`: the time (epoch ms) of the decision it withdrew. */
  replacesAt?: number;
}
