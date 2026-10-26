// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The types the stage card is built from: the state its status box shows, the
 * propagation problems, the change lines, the dry run, the review flow and a
 * failed promotion.
 *
 * Pure: no React and no MUI, here or in any `stage/*.ts`. The browser-free specs
 * import these modules directly, and an MUI directory import does not resolve in
 * that runner.
 */

import type { ChangeOrderOutcomeKind } from '../changeOrderOutcome';
import type {
  NotEvaluatedReason,
  ReviewDecision,
  ReviewPerson,
  ReviewRequestView,
} from '../reviews/changeOrderReviewTypes';
import type { ChangeOrderGate } from '../../x/apps/change-order/changeOrderTypes';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** What a promote button does: promote and release, promote only, release only. */
export type MergeMethod = 'pr' | 'p' | 'r';

/** One promote button: its method, and what it does. */
export interface MergeMethodOption {
  method: MergeMethod;
  label: string;
  description: string;
  /** Shown but not choosable, with `description` saying when it becomes available. */
  disabled: boolean;
}

/** The action a review holds: the promote into a stage, or its release. */
export type ReviewAction = 'promote' | 'release';

// ---------------------------------------------------------------------------
// Status box
// ---------------------------------------------------------------------------

/** The status box's colour family. */
export type StageTone = 'neutral' | 'success' | 'warning' | 'error';

/**
 * How the tile is drawn. `calm`: the semantic background with a semantic glyph.
 * `solid`: a solid warning or error tile with a white filled glyph, for problems.
 */
export type StageTileStyle = 'calm' | 'solid';

/** Which glyph the tile shows. The component maps each key to an MUI icon. */
export type StageIconKey = 'check' | 'person' | 'upload' | 'error' | 'warning' | 'block' | 'undo' | 'progress' | 'help';

export interface StageBoxLook {
  tone: StageTone;
  tile: StageTileStyle;
  icon: StageIconKey;
}

/**
 * What the selected stage's status box says, chosen by `deriveStageCardState`.
 * One state per card; the first that applies wins (see that function for the order).
 */
export type StageCardState =
  | { kind: 'source' }
  | { kind: 'invocationSource' }
  | { kind: 'aborted'; reason: string }
  /** The stage's Spaces are still being read: nothing can be said yet. */
  | { kind: 'loading' }
  | { kind: 'noSpaces' }
  | { kind: 'working' }
  /** `canRetry`: the dry run says a retry can run now (or it is a release, which needs none). */
  | { kind: 'failed'; failure: StageFailure; canRetry: boolean }
  /** `took`: the differences the written change carries, said after the fact. */
  | { kind: 'released'; took: readonly PropagationProblem[] }
  /** Offered only where the stage could otherwise be promoted; `problems` as for `problem`. */
  | { kind: 'restored'; verdict: 'restored' | 'restore-released'; problems: readonly PropagationProblem[] }
  | { kind: 'promotedNoTargets' }
  | { kind: 'promoted'; took: readonly PropagationProblem[] }
  | ({ kind: 'reviewRejected'; rejection: ReviewRejection | undefined; failedGates: readonly ChangeOrderGate[] } & StageReviewStateBase)
  | ({ kind: 'reviewNeeded' } & StageReviewStateBase)
  | ({ kind: 'reviewWaiting' } & StageReviewStateBase)
  /** A gate evaluated false on something that is there. `waiting`: gates that only wait, listed after. */
  | { kind: 'gateFailed'; gates: readonly ChangeOrderGate[]; waiting: readonly ChangeOrderGate[] }
  /** Gates that have not passed YET: the change has not reached the stage before, or its health has not reported. Neutral. */
  | ({ kind: 'gateWaiting' } & StageGateWait)
  /** `failure`: a promotion that also failed here, said as a second block. */
  | { kind: 'serverHeld'; text: string; failure?: StageFailure }
  | { kind: 'noPermission'; failure?: StageFailure }
  | { kind: 'dryRunRefused'; reason: string; failure?: StageFailure }
  | { kind: 'problem'; problems: readonly PropagationProblem[] }
  | { kind: 'inProgress' }
  | { kind: 'progressUnknown' }
  /** `approvedByYou`: the viewer's approval has just opened the gate. */
  | { kind: 'ready'; approvedByYou: boolean };

export type StageCardStateKind = StageCardState['kind'];

/** What a stage waits for, and on which gates. */
export interface StageGateWait {
  gates: readonly ChangeOrderGate[];
  /**
   * `promoted` / `released`: the stage before has not taken or released the
   * change. `healthy`: its health has not reported, or is still syncing.
   */
  waitFor: 'promoted' | 'released' | 'healthy';
  /** The stage before, for "Waiting for {prev}" and its link. */
  previousStage?: { stageId: string; name: string };
}

/** What every review state carries. */
export interface StageReviewStateBase {
  action: ReviewAction;
  /** The gate whose review the box hosts (`${kind}:${stageId}`). */
  gateKey: string;
  flow: ReviewViewerFlow;
  /** Propagation problems a reviewer must see before approving ("Before you approve"). */
  problems: readonly PropagationProblem[];
}

/** A byline under a done state: "By Charles Ewing, 17 Oct, 12:58". */
export interface StageByline {
  name: string;
  isYou: boolean;
  /** Epoch ms. */
  at: number;
}

// ---------------------------------------------------------------------------
// Failed promotion or release
// ---------------------------------------------------------------------------

/**
 * One failed item of an action as the actions hook reports it, per Space.
 * The same shape as `ChangeOrderActionResult.failedSpaces`. `spaceId` or
 * `spaceSlug` is empty when the response did not name it.
 */
export interface ActionFailedSpace {
  spaceId: string;
  spaceSlug: string;
  unitSlug?: string;
  message: string;
}

export interface StageFailureItem {
  unitSlug?: string;
  unitId?: string;
  message: string;
}

export interface StageFailedSpace {
  spaceId: string;
  slug: string;
  items: StageFailureItem[];
}

/** A promotion or release of this stage that did not finish (`stageFailure`). */
export interface StageFailure {
  action: 'promote' | 'release';
  /** `session`: this browser's last action. `record`: the ChangeOrder's `PromotionFailures`. */
  source: 'session' | 'record';
  failedSpaces: StageFailedSpace[];
  /** Spaces of the stage's targets that hold the change. */
  landedCount: number;
  /** The stage's targets. */
  spaceCount: number;
  /** A Space was passed over because the ChangeOrder is not headed for it: retrying cannot help. */
  outOfScope: boolean;
  /** The whole message, for the "Server message" disclosure. */
  message: string;
  /** Epoch ms, when known. */
  at?: number;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Propagation
// ---------------------------------------------------------------------------

export type UnknownCause = 'mergeDeclined' | 'unreadable' | 'noResources' | 'unplanned';

/**
 * One way the change reaches a Space differently from the reference Space.
 * `spaceId` and `unitId` are what links are built from; the slugs are what is read.
 */
export type PropagationProblem =
  | {
      kind: 'differs';
      spaceId: string;
      unitId: string;
      resourceName: string;
      /** The server's `DisplayPath`: what the field link highlights, and the title. */
      path: string;
      /** The short field label the change lines use ("image tag", `env.LOG_LEVEL`). */
      label: string;
      /** The value is a container image reference: the values are image tags. */
      isImage: boolean;
      from: string;
      to: string;
      refFrom: string;
      refTo: string;
      /** The reference Space the difference is measured against. */
      refSpaceId: string;
    }
  | {
      kind: 'kept';
      spaceId: string;
      unitId: string;
      resourceName: string;
      path: string;
      /** The short field label, as for `differs`. */
      label: string;
      value: string;
      /** What the box shows of `value`: the image tag for an image reference. */
      valueText: string;
      incoming?: string;
      /** `ProtectedPath` (kept on merge) or `Subtracted` (a local override). */
      reason: string;
    }
  | { kind: 'refused'; spaceId: string; unitId: string; resourceName: string; reason: string; path?: string; details?: string }
  | { kind: 'adds'; spaceId: string; resourceName: string; unitId?: string }
  | { kind: 'unknown'; spaceIds: string[]; cause: UnknownCause; resourceName?: string; unitId?: string };

export type PropagationProblemKind = PropagationProblem['kind'];

/** The chip a Space carries in the sidebar's Spaces list. */
export type SpaceMark =
  | { kind: 'differs' }
  /** `value` is what the chip shows (the image tag for an image); `title` the full value when it differs. */
  | { kind: 'keeps'; value: string; title?: string }
  | { kind: 'refuses' }
  | { kind: 'adds' }
  | { kind: 'unknown' }
  | { kind: 'hasIt' };

export interface StagePropagation {
  /** Worst first. Drives the problem state and the "took" lines after an action. */
  problems: PropagationProblem[];
  marks: ReadonlyMap<string, SpaceMark>;
  /**
   * Stated, never warned: chained previews, a partial floor, omitted and undecided
   * resources. They qualify every count on the card, so they show with the change
   * lines, not only in the Full diff.
   */
  quietNotes: string[];
  /** Spaces previewed against an earlier variant, so what they receive cannot be shown yet. */
  chainedSpaceIds: string[];
  /**
   * The Space the others are measured against: one of the majority that take the
   * same change. `null` when fewer than two Spaces could be compared.
   */
  referenceSpaceId: string | null;
  /** Set when the outcome groups do not account for every Space: a defect, said in red. */
  shortfallNote?: string;
}

// ---------------------------------------------------------------------------
// The change card's diff
// ---------------------------------------------------------------------------

/** Where a field link points in the change card's outcome boxes. */
export interface DiffAnchor {
  groupKind: ChangeOrderOutcomeKind;
  unitId: string;
  path?: string;
}

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------

/** What an unforced promote dry run says, counted for the dry-run line. */
export interface DryRunSummary {
  /** Units that would change: not Mark, Unchanged or Skip, and no error. */
  unitCount: number;
  /** Spaces whose Action is Promote with at least one such Unit. */
  spaceCount: number;
  /** Spaces the dry run planned (not Blocked or Failed). */
  reached: number;
  /** One sentence per failure, as `summarisePromote` words them. */
  failures: string[];
  /** Failure sentences per Space id. */
  failuresBySpace: ReadonlyMap<string, string[]>;
  /** Why the dry run did not plan a Space: its `Reason`, or `Failed`. */
  unplannedReasonBySpaceId: ReadonlyMap<string, string>;
  /** The plan digest to send back as `ExpectedPlan`. */
  plan?: string;
}

/** How a dry-run answer is read. `held`, `noPermission` and `refused` become states of their own. */
export type DryRunAnswer =
  | { kind: 'done'; summary: DryRunSummary }
  | { kind: 'fails'; summary: DryRunSummary }
  | { kind: 'held'; text: string }
  | { kind: 'noPermission' }
  | { kind: 'refused'; reason: string }
  | { kind: 'unavailable' };

/** The dry-run line's mode (`data-dry-run`). `idle`: not asked for this state. */
export type DryRunMode = 'idle' | 'running' | 'done' | 'fails' | 'unavailable' | 'held' | 'refused' | 'noPermission';

/** What the card knows of the quiet dry run right now. */
export interface StageDryRunView {
  mode: DryRunMode;
  summary?: DryRunSummary;
  /** The server's sentence for a 409. */
  gatesHolding?: string;
  /** The server's reason for another refusal. */
  refusal?: string;
}

/** The dry-run line as the card renders it. */
export interface DryRunLine {
  mode: DryRunMode;
  /** `null`: no line. */
  text: string | null;
  icon: 'none' | 'fail' | 'warn';
  /** `coverage-incomplete` when the dry run reached fewer Spaces than it was asked about. */
  fidelity?: 'coverage-incomplete';
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/** What every review flow carries. */
export interface ReviewFlowBase {
  /** The Attestation Types a decision is recorded as (one `/attest` each). */
  types: string[];
  /** The viewer's live decisions, one per Type. */
  own: ReviewDecision[];
  /** Someone else's rejection that keeps the gate shut whatever the viewer decides. */
  otherRejecter?: ReviewPerson;
  /** A decision would record nothing in any Space. */
  nothingRecordable: boolean;
  /**
   * One sentence per own decision the server does not count ("You approved at
   * … It is recorded, but it does not count."), for a viewer who is not
   * eligible or wrote the change. Empty otherwise.
   */
  ownNotCounted: string[];
  /**
   * Where the viewer wrote part of the change, and whether that matters: "does
   * not count there", or, where the requirements accept authors, that they can
   * review it. Absent when the viewer wrote none of it.
   */
  authorNote?: string;
}

/**
 * Where the viewer stands on a review, and so which actions the status box offers.
 * `form`, `partial`, `outOfDate` and `notEvaluated` with `mayDecide` show the form.
 */
export type ReviewViewerFlow =
  | ({ kind: 'form'; requirementNames: string[]; authorsMayApprove: boolean } & ReviewFlowBase)
  | ({ kind: 'partial'; requirementNames: string[]; authorIn: string[] } & ReviewFlowBase)
  | ({ kind: 'notEvaluated'; why: NotEvaluatedReason; mayDecide: boolean; requirementNames: string[] } & ReviewFlowBase)
  | ({ kind: 'outOfDate'; decision: ReviewDecision; requirementNames: string[] } & ReviewFlowBase)
  | ({ kind: 'author'; authorIn: string[] } & ReviewFlowBase)
  | ({ kind: 'notEligible' } & ReviewFlowBase)
  | ({ kind: 'signedOut' } & ReviewFlowBase)
  | ({ kind: 'countsNowhere' } & ReviewFlowBase)
  | ({ kind: 'ownApproved'; decision: ReviewDecision } & ReviewFlowBase)
  | ({ kind: 'ownRejected'; decision: ReviewDecision } & ReviewFlowBase);

export type ReviewViewerFlowKind = ReviewViewerFlow['kind'];

/** Who rejected the change, with what they said. */
export interface ReviewRejection {
  rejecter: ReviewPerson;
  decision?: ReviewDecision;
  note: string;
  createdAt?: string;
  requirementName: string;
}

export type ReviewerStatus = 'approved' | 'rejected' | 'requested' | 'notReviewed';

/** One reviewer under a review row. */
export interface ReviewerRow {
  person: ReviewPerson;
  status: ReviewerStatus;
  decision?: ReviewDecision;
  request?: ReviewRequestView;
}

export interface ReviewerRows {
  rows: ReviewerRow[];
  /** "and {k} more". */
  more: number;
}

/** The review row's icon and the short text at its right edge. */
export interface ReviewAside {
  icon: 'ok' | 'open' | 'rejected' | 'notEvaluated';
  text: string;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export interface StageLink {
  href: string;
  label: string;
}

/** What a link inside a sentence points at. The component turns it into an href. */
export type CopyLinkRef =
  | { to: 'stage'; stageId: string }
  | { to: 'space'; spaceId: string }
  | { to: 'unit'; spaceId: string; unitId: string; tab: 'config' | 'links' | 'resources' }
  | { to: 'field'; spaceId: string; unitId: string; path: string }
  | { to: 'diff' };

/**
 * One piece of a sentence. A sentence with links or code is written once, in
 * `stageCardCopy.ts`, as segments; joined, their texts give the plain sentence.
 */
export type CopySegment =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; ref: CopyLinkRef; code?: boolean; title?: string };
