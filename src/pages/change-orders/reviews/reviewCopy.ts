// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every string the review UI shows, in one place.
 *
 * Kept apart from `changeOrderCopy.ts` so the review work does not edit a file the
 * rest of the ChangeOrder views share. Plain words, short sentences, one idea per
 * sentence, as in `changeOrderCopy.ts`.
 *
 * Some sentences state a limit of what the UI can see (group membership, who
 * wrote each Revision). Those limits go away with a server-side review summary,
 * tracked in confighubai/confighub#5737.
 */

import { clockTime, plural, shortDate } from '../changeOrderHistory';
import type {
  DecisionGateEntry,
  GateReviewSummary,
  ReviewChoice,
  ReviewDecision,
  ReviewAuthorIn,
  ReviewGroup,
  RequirementRules,
} from './changeOrderReviewTypes';

/** The longest Note the server accepts on an Attestation. */
export const REVIEW_NOTE_MAX = 4096;

/** An ISO time as epoch ms, or `undefined` when it does not parse. */
export function epochOf(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

/** `17 Oct, 13:12`, in the viewer's zone. */
export function reviewTime(iso: string | undefined): string {
  const at = epochOf(iso);
  if (at === undefined) return 'an unknown time';
  return `${shortDate(at).replace(/ \d{4}$/, '')}, ${clockTime(at)}`;
}

/** `19 h`, `39 min`, `3 d 5 h`: a length of time, rounded down. */
export function durationText(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours - days * 24;
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}

/** `2h ago`, `39m ago`, `just now`: short, for the decision rows. */
export function agoText(iso: string | undefined, now: number): string {
  const at = epochOf(iso);
  if (at === undefined) return '';
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours - days * 24}h ago`;
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

/** A group's name, or a short form of its ID when the viewer cannot read the group (M4). */
export function groupLabel(group: ReviewGroup): string {
  return group.name !== undefined && group.name !== '' ? group.name : `group ${group.groupId.slice(0, 8)}`;
}

/** "security-reviewers" or "Ana Lee, Tom Ito", for "from …". */
export function fromText(rules: RequirementRules): string {
  const names = [...rules.fromUsers.map((p) => p.name), ...rules.fromGroups.map(groupLabel)];
  if (names.length === 0) return 'anyone with Approve on these Spaces';
  return names.join(', ');
}

/** The IDs of the groups the viewer cannot name, for a tooltip. */
export function fromTitle(rules: RequirementRules): string | undefined {
  const unnamed = rules.fromGroups.filter((g) => g.name === undefined || g.name === '');
  return unnamed.length === 0 ? undefined : unnamed.map((g) => `Group ${g.groupId}`).join(', ');
}

/**
 * The Attestation Types a decision from the viewer is recorded as: one `/attest` per Type (S1).
 * A viewer the server gave no rows (`notEvaluated`) may still decide when `mayDecide`.
 */
export function decisionTypes(summary: GateReviewSummary): string[] {
  const e = summary.viewer.eligibility;
  if ((e.kind === 'counts' || e.kind === 'partial' || e.kind === 'notEvaluated') && e.types.length > 0) return e.types;
  return summary.primary === undefined ? [] : [summary.primary.rules.type];
}

/** The plain words for a skipped Unit's reason code from the attest dry run (#5788). */
const SKIPPED_CODE_TEXT: Record<string, string> = {
  NoTarget: 'It has no Target, so it is never released.',
  NoRevision: 'The change did not reach it.',
};

/** The words for a skip code, or `undefined` for a code the UI does not know. */
export function skippedCodeText(code: string | undefined): string | undefined {
  return code === undefined ? undefined : SKIPPED_CODE_TEXT[code];
}

/** "rrv-dev, rrv-staging": the Spaces where the viewer wrote part of the change. */
export function placesText(spaces: readonly string[]): string {
  return spaces.join(', ');
}

/** "rrv-dev (1 of 2 Revisions)", from the server's Caller per Space. */
export function authorInText(authorIn: readonly ReviewAuthorIn[]): string {
  return authorIn.map((a) => `${a.spaceSlug} (${a.authoredRevisions} of ${plural(a.revisions, 'Revision')})`).join(', ');
}

export const reviewCopy = {
  /** Why a gate has no counts for the viewer (#5788: the server rows are the only counts). */
  notEvaluated: {
    noPermission: 'Not evaluated for you: you cannot promote or publish here, so the server gives you no counts.',
    notReached: 'Not evaluated yet: the change has not reached this stage.',
    finalNotOpen: 'Sign-off opens when every stage has the change.',
    unchanged: 'There is nothing new to release here, so this stage has no release review now.',
    error: 'Not evaluated: the server did not answer.',
    short: 'Not evaluated for you',
  },
  /** The short tag for a gate with no counts, by why: a permission problem only when it is one. */
  notEvaluatedShort: {
    noPermission: 'Not evaluated for you',
    notReached: 'Not reached yet',
    finalNotOpen: 'Not open yet',
    unchanged: 'Nothing new to release',
    error: 'Not evaluated',
  } as Record<string, string>,
  /** Why the server did not count one Attestation for one requirement (AttestationGateEntry.Reason). */
  discard: {
    Revoked: 'Revoked',
    Expired: 'Not counted: expired',
    TooOld: (maxAge: string | undefined) => (maxAge === undefined ? 'Not counted: too old' : `Not counted: older than ${maxAge}`),
    NotEligible: (from: string) => `Not counted: not in ${from}`,
    Author: 'Not counted: wrote part of the change',
    AuthorYou: 'Not counted: you wrote part of the change',
    FailIgnored: 'Rejection ignored (IgnoreFail)',
    countsOn: (n: number, of: number) => (of > 0 ? `Counts on ${n} of ${of} Revisions` : `Counts on ${plural(n, 'Revision')}`),
    unknown: (code: string) => `Not counted (${code})`,
  },
  /** The viewer's eligibility from the server's Caller (#5788). */
  caller: {
    author: (where: string) => `You wrote part of this change in ${where}. Your decision is recorded but does not count there.`,
    authorIn: (space: string, authored: number, revisions: number) => `${space} (${authored} of ${plural(revisions, 'Revision')})`,
    notEligible: 'This requirement does not name you or a group of yours.',
  },
  /** One Space of a requirement, from the server's row. */
  space: {
    counted: (counted: number, required: number) => `${counted} of ${required}`,
    revisions: (satisfied: number, total: number) => `${satisfied} of ${plural(total, 'Revision')} satisfied`,
    unsatisfied: (unit: string, rev: number, counted: number) => `${unit}@r${rev}: ${counted} counted`,
    authors: (names: string) => `, written by ${names}`,
    andMore: 'and more',
  },
  /** ChangeOrder.ReviewRequests. */
  requests: {
    label: 'Requested reviewers',
    ofYouBand: (by: string, ago: string) => `Review requested of you by ${by}, ${ago}`,
    ofYouPanel: (by: string, ago: string) => `${by} asked you to review this, ${ago}.`,
    reviewed: 'Reviewed',
    waiting: 'Waiting',
    requestedBy: (by: string, ago: string) => `Requested by ${by}, ${ago}`,
    requestedAt: (ago: string) => `Requested ${ago}`,
    requestFrom: 'Request review from…',
    someone: 'someone',
    requestPlaceholder: 'Choose who can approve',
    request: 'Request',
    withdraw: 'Withdraw',
    none: 'No review is requested yet.',
    requestedTag: 'requested',
    requested: (names: string) => `Review requested from ${names}.`,
    withdrawn: (name: string) => `Review request to ${name} withdrawn.`,
    failed: 'The review request could not be saved.',
    conflict: 'Someone changed the requests at the same time. Try again.',
    sinceRequest: (when: string) => `, since the request on ${when}`,
    sincePromotion: (when: string) => `, since the promotion on ${when}`,
  },
  /** What each review gate is called, by where it sits in time. */
  gate: {
    heading: { entry: 'Review', release: 'Release review', final: 'Sign-off' },
    /** The action the gate holds. */
    action: { entry: 'Promote', release: 'Release', final: 'Completion' },
    regionLabel: {
      entry: (stage: string) => `Review for ${stage}`,
      release: (stage: string) => `Release review for ${stage}`,
      final: () => 'Sign-off for this ChangeOrder',
    },
  },
  band: {
    waitingKicker: 'Waiting on review',
    completeKicker: 'Reviews complete',
    heldTitle: (stage: string) => `${stage} is held on`,
    blockedKicker: 'Blocked by review',
    waitingTitle: (stage: string, need: number) =>
      `${stage} needs ${need === 1 ? '1 more approval' : `${need} more approvals`} on`,
    completeTitle: (stage: string) => `${stage} can be promoted`,
    /** Reviews are satisfied, but other gates still hold the stage (M5): never "can be promoted". */
    reviewsCompleteTitle: (stage: string, others: string[]) =>
      others.length === 0
        ? `The reviews for ${stage} are complete`
        : `The reviews for ${stage} are complete. ${others.join(', ')} still ${others.length === 1 ? 'holds' : 'hold'} it`,
    releaseWaitingTitle: (stage: string, need: number) =>
      `The release in ${stage} needs ${need === 1 ? '1 more approval' : `${need} more approvals`} on`,
    releaseCompleteTitle: (stage: string) => `${stage} can be released`,
    finalWaitingTitle: (need: number) =>
      `Sign-off needs ${need === 1 ? '1 more approval' : `${need} more approvals`} on`,
    finalCompleteTitle: 'Sign-off is complete',
    goToRelease: 'Go to release',
    blockedReleaseTitle: (stage: string) => `rejected the release in ${stage}`,
    blockedFinalTitle: 'rejected the sign-off',
    clearsWhenAny: (name: string) =>
      `Clears when ${name} or a manager of the Space revokes it, when it expires, or when a new Revision is reviewed`,
    blockedTitle: (stage: string) => `rejected the change for ${stage}`,
    recorded: 'recorded',
    // The server's verdict and the UI's count disagree (a poll in between, or
    // Attestations the UI cannot read): the count is then not shown as a reason.
    satisfiedNoCount: 'satisfied',
    waiting: 'Waiting',
    since: (when: string) => `, since ${when}`,
    from: 'From',
    notAuthor: ', not the author',
    anyRejectionBlocks: 'Any rejection blocks',
    whateverCount: ', whatever the number of approvals',
    clearsWhen: (name: string) => `Clears when ${name} revokes it, or a new Revision is reviewed`,
    validUntil: 'Approvals valid until',
    expiredAndRevoked: (expired: number, revoked: number) => {
      const parts: string[] = [];
      if (expired > 0) parts.push(`${plural(expired, 'approval')} expired`);
      if (revoked > 0) parts.push(`${plural(revoked, 'rejection')} revoked`);
      return parts.join(', ');
    },
    youEligible: 'You are eligible to review.',
    youPartial: 'You can review. Some of your decision will not count.',
    youApproved: 'You approved. Waiting on others.',
    youRejected: 'You rejected this change.',
    youAuthor: 'You wrote this change, so you cannot approve it.',
    youNotListed: 'You are not on the list of reviewers.',
    youSignedOut: 'Sign in to review.',
    reviewNow: 'Review now',
    openReview: 'Open review',
    seeWhoCan: 'See who can',
    readRejection: 'Read the rejection',
    goToPromote: 'Go to promote',
  },
  summaryChip: {
    waiting: 'Waiting on review',
    ready: 'Ready to promote',
    reviewsComplete: 'Reviews complete',
    rejected: 'Rejected on review',
    releaseWaiting: 'Held on release review',
    signOffWaiting: 'Waiting on sign-off',
  },
  progressHint: {
    held: (stage: string) => `Next: ${stage}, held on review`,
    ready: (stage: string) => `Next: ${stage}, ready`,
    reviewsComplete: (stage: string) => `Next: ${stage}, reviews complete`,
    rejected: (stage: string) => `Next: ${stage}, blocked by a rejection`,
  },
  rail: {
    held: 'Held on review',
    releaseHeld: 'Held on release review',
    rejected: 'Rejected',
    ready: 'Ready to promote',
    reviewsComplete: 'Reviews complete',
    signOff: 'Sign-off',
    reviewProgress: (passes: number, required: number) => ({ figure: `${passes}/${required}` }),
    reviewOn: (name: string) => ` on ${name}`,
    reviewed: 'Reviewed',
    review: 'Review',
    releaseReview: 'Release review',
    notEvaluated: 'not evaluated for you',
    finalNotOpen: 'not open yet',
    rejectedBy: (first: string) => `Rejected by ${first}`,
    required: (count: number) => `Review required, ${plural(count, 'requirement')}`,
    fail: 'fail',
  },
  stage: {
    held: 'Held on review',
    rejected: 'Rejected',
    ready: 'Ready to promote',
    evaluatedOver: 'Entry gate evaluated over',
    releaseEvaluatedOver: 'Release gate evaluated over',
    signOffEvaluatedOver: 'Sign-off evaluated over',
    refused: 'Promote is refused (409) until',
    releaseRefused: 'Release is refused (422) until',
    isSatisfied: 'is satisfied.',
    moreNeeded: (need: number) => (need === 1 ? '1 more approval needed.' : `${need} more approvals needed.`),
    rejectionStands: 'A rejection stands.',
    serverHolds: 'The server does not count it as satisfied yet.',
    reviewLink: 'Review',
    spaceTag: (passes: number, required: number) => `${passes} of ${required}`,
    spaceFail: 'fail',
    spaceHeld: 'held',
    spaceNotEvaluated: 'not evaluated',
  },
  panel: {
    regionLabel: (stage: string) => `Review for ${stage}`,
    heading: 'Review',
    rejected: 'Rejected',
    rejectedMeta: (ago: string, name: string) => ({ ago, by: `by ${name}` }),
    satisfied: 'Satisfied',
    validUntil: (when: string) => `valid until ${when}`,
    waiting: 'Waiting',
    since: (when: string) => `since ${when}`,
    sinceRequest: (when: string) => `since the request, ${when}`,
    sincePromotion: (when: string) => `since the promotion, ${when}`,
    loading: 'Loading reviews…',
    loadError: 'Reviews could not be loaded. The gate above still shows the server verdict.',
    truncated: 'Some reviews were not loaded. The gate above shows the server verdict.',
    yourReview: 'Your review',
    /** By gate kind: an entry review is for the stage, a release review for its release, Final for the sign-off. */
    requirementsFor: {
      entry: (stage: string) => `Requirements for ${stage}`,
      release: (stage: string) => `Requirements for release of ${stage}`,
      final: () => 'Requirements for sign-off',
    },
    decisions: 'Decisions',
    recorded: (n: number) => `${n} recorded`,
  },
  you: {
    eligibleLead: (requirements: string[]) =>
      `, you can review. You are a reviewer for ${requirements.join(', ')} and you did not write a Revision this gate reads.`,
    /** The viewer wrote gate Revisions, but the requirement allows authors (AllowAuthors). */
    eligibleAuthorLead: (requirements: string[]) =>
      `, you can review. You are a reviewer for ${requirements.join(', ')}. You wrote part of this change, and authors may approve here.`,
    /** The viewer's own decision that the server does not count (Caller.Counts false). */
    ownNotCounted: (choice: ReviewChoice, at: string) => ({
      lead: choice === 'Pass' ? 'You approved' : 'You rejected',
      rest: ` at ${at}. It is recorded, but the server does not count it.`,
    }),
    /** M3: the viewer wrote some gate Revisions, so the decision counts only on the others. */
    partialLead: (requirements: string[]) => `, you can review for ${requirements.join(', ')}.`,
    serverChecksOnSubmit: 'The server checks whether your decision counts when you submit.',
    partialAuthor: (where: string) => `You wrote ${where}. Your decision is recorded there too, but it does not count there.`,
    countsOn: (where: string) => `It counts on ${where}.`,
    approved: (at: string, revisions: string, until: string | undefined) =>
      until === undefined
        ? { lead: 'You approved', rest: ` at ${at}. Your approval covers ${revisions}.` }
        : { lead: 'You approved', rest: ` at ${at}. Your approval covers ${revisions} and is valid until ${until}.` },
    rejected: (at: string, revisions: string) => ({ lead: 'You rejected', rest: ` at ${at}. Your rejection covers ${revisions}.` }),
    changeMyDecision: 'Change my decision',
    changeLead: 'Change your decision.',
    changeRest: (choice: ReviewChoice, at: string) =>
      ` Attestations cannot be edited. Your ${choice === 'Pass' ? 'approval' : 'rejection'} from ${at} is revoked and a new decision is recorded.`,
    keepMine: (choice: ReviewChoice) => (choice === 'Pass' ? 'Keep my approval' : 'Keep my rejection'),
    rejectionStands: 'A rejection stands.',
    rejectionStandsRest: (stage: string, name: string) =>
      ` Your approval is recorded, but ${stage} stays blocked until ${name} revokes the rejection.`,
    notListedTitle: 'You are not a reviewer for this stage',
    notListed: 'These requirements accept approvals only from the people and groups below.',
    signedOut: 'Sign in to review this change.',
  },
  author: {
    title: 'You cannot approve this change',
    promoted: (order: string, where: string, at: string | undefined) => ({
      lead: 'You promoted ',
      order,
      rest: at === undefined ? ` into ${where}.` : ` into ${where} on ${at}.`,
    }),
    created: (order: string) => ({ lead: 'You opened ', order, rest: '.' }),
    rule: (requirement: string) => ({
      requirement,
      rest: ' does not accept approvals from the person who wrote or promoted the change. This is separation of duties.',
    }),
    needFrom: (need: number) => `${need === 1 ? '1 more approval' : `${need} more approvals`} needed from`,
    anyoneWithApprove: 'Anyone with Approve on these Spaces can approve.',
    groupOnly: 'People in these groups can approve. The UI cannot list group members.',
    viaGroup: (group: string) => `in ${group}`,
    authorOn: (where: string) => `You wrote ${where}.`,
    authorRule: ' This requirement does not accept an approval from the person who wrote a Revision it reads. This is separation of duties.',
    notReviewed: 'Not reviewed',
    approvedAgo: (ago: string) => `Approved ${ago}`,
    rejectedAgo: (ago: string) => `Rejected ${ago}`,
    copyLink: 'Copy link to this review',
    copied: 'Link to this review copied.',
    copyFailed: 'The link could not be copied.',
  },
  form: {
    groupLabel: 'Your decision',
    approve: 'Approve',
    reject: 'Reject',
    reasonLabel: 'Reason, required',
    counter: (n: number) => `${n} / ${REVIEW_NOTE_MAX}`,
    placeholderPass: 'What did you check?',
    placeholderFail: (stage: string) => `What must change before ${stage}?`,
    hint: (choice: ReviewChoice | null) =>
      choice === 'Fail'
        ? 'Stored with your rejection. Everyone on this ChangeOrder can read it.'
        : 'Stored with your Approval attestation. Everyone on this ChangeOrder can read it.',
    reasonRequired: 'A reason is required.',
    choose: 'Choose approve or reject',
    submit: (choice: ReviewChoice, revisions: number | undefined) => {
      const verb = choice === 'Pass' ? 'Approve' : 'Reject';
      return revisions === undefined ? verb : `${verb} ${plural(revisions, 'Revision')}`;
    },
    confirmNext: 'You confirm in the next step.',
  },
  coverage: {
    label: 'What this decision covers',
    covers: (revisions: number, spaces: number, skips: number) => ({
      revisions: plural(revisions, 'Revision'),
      spaces: plural(spaces, 'Space'),
      skips: `, skips ${skips}`,
    }),
    authorHead: 'A decision from you would be recorded on',
    authorTail: ', but it would not count: you wrote or promoted this change.',
    dryRun: 'dry run',
    skipped: 'Skipped.',
    notChanged: 'Recorded, not needed: this change did not change it.',
    authorHere: 'Recorded, does not count: you wrote this Revision.',
    spaceError: 'Not recorded here:',
    nothingRecordable: 'A decision from you would record nothing.',
    typeHead: (type: string) => `${type} attestation`,
    loading: 'Checking what a decision covers…',
    unavailable: 'Coverage is not available. You can still submit.',
  },
  requirements: {
    needed: (n: number) => `${n} needed`,
    held: 'held',
    satisfied: 'satisfied',
    rejected: 'rejected',
    from: 'from',
    notAuthor: 'not the author',
    authorsAllowed: 'the author can approve',
    valid: (maxAge: string) => `valid ${maxAge}`,
    oneRejectionBlocks: 'one rejection blocks',
    oneFromEachGroup: 'one from each group',
    rejectionsIgnored: 'rejections do not block',
    groupTooltip: (id: string) => `Group ${id}. You are not in it, so its name cannot be read.`,
  },
  decision: {
    approved: 'Approved',
    rejected: 'Rejected',
    revoked: 'Revoked',
    expired: 'Expired',
    you: ' (you)',
    validUntil: (when: string) => `valid until ${when}`,
    revokedAt: (when: string) => `revoked ${when}`,
    revokedAtBy: (when: string, by: string) => `revoked ${when} by ${by}`,
    validUntilFor: (req: string, when: string) => `${req} until ${when}`,
    typeLabel: (type: string) => type,
    expiredAt: (created: string, when: string) => `approved ${created}, expired ${when}`,
    revisions: (spaces: number) => plural(spaces, 'Space'),
    replacedBy: (first: string, choice: ReviewChoice, at: string) =>
      `Replaced by ${first}’s ${choice === 'Pass' ? 'approval' : 'rejection'} at ${at}.`,
    replaces: (first: string, choice: ReviewChoice, at: string) =>
      `Replaces ${first}’s ${choice === 'Pass' ? 'approval' : 'rejection'} from ${at}.`,
    noLongerCounts: (first: string) => `No longer counts. ${first} can approve again; the content has not changed.`,
    none: 'No decisions yet.',
  },
  confirm: {
    titleApprove: 'Record your approval',
    titleReject: 'Record your rejection',
    titleReplace: 'Replace your decision',
    attestation: 'Attestation',
    attestationValue: (type: string) => `${type}, `,
    pass: 'Pass',
    fail: 'Fail',
    requirement: (n: number) => (n === 1 ? 'Requirement' : 'Requirements'),
    target: 'ChangeOrder, target',
    covers: 'Covers',
    coversValue: (revisions: number | undefined, spaces: number) =>
      revisions === undefined ? plural(spaces, 'Space') : `${plural(revisions, 'Revision')} in ${plural(spaces, 'Space')}`,
    revokes: 'Revokes',
    revokesValue: (d: ReviewDecision) => `your ${d.result === 'Pass' ? 'approval' : 'rejection'}, ${reviewTime(d.createdAt)}`,
    validUntil: 'Valid until',
    noLimit: 'no limit',
    validFor: (maxAge: string) => `for ${maxAge} from when it is recorded`,
    reason: 'Your reason',
    effectCompletes: (req: string, stage: string) =>
      `This completes ${req}. The ${stage} gate opens and Promote becomes available.`,
    effectCompletesUnknown: (req: string) => `This completes ${req}. Promote then depends on the stage's other gates.`,
    effectCompletesOnly: (req: string) => `This completes ${req}. Other requirements still hold the gate.`,
    effectMoves: (req: string, n: number, of: number) =>
      `${req} moves to ${n} of ${of}. ${of - n === 1 ? 'One more approval is' : `${of - n} more approvals are`} needed.`,
    effectStaysBlocked: (stage: string, name: string) => `${stage} stays blocked. A rejection from ${name} still stands.`,
    effectBlocks: (stage: string) =>
      `This blocks ${stage} for everyone, whatever the number of approvals, until you revoke it or a new Revision is reviewed.`,
    /** S4: no requirement of this Type blocks on a rejection. */
    effectRecordedNotBlocking: (reqs: string[]) =>
      `Your rejection is recorded. It does not block, because ${reqs.join(', ')} ${reqs.length === 1 ? 'ignores' : 'ignore'} rejections.`,
    effectReviewsCompleteOthers: (req: string, others: string[]) =>
      `This completes ${req}. ${others.join(', ')} still ${others.length === 1 ? 'holds' : 'hold'} the stage.`,
    effectReleaseOpens: (req: string, stage: string) => `This completes ${req}. The release in ${stage} can then be published.`,
    effectSignOff: (req: string) => `This completes ${req}. The ChangeOrder can then complete.`,
    typeBlock: (type: string) => `${type} attestation`,
    nothingRecorded: 'Nothing was recorded. No Space has a Revision that a decision from you would cover.',
    partlyRecorded: (types: string[]) => `Recorded for ${types.join(', ')} only.`,
    effectReplaces: 'Your earlier decision is revoked and this one replaces it. The count does not change.',
    effectSatisfied: 'The requirement is already satisfied. Your approval adds to it.',
    cannotEdit: ' Attestations cannot be edited. To change it later, you revoke it and record a new one.',
    cancel: 'Cancel',
    approve: 'Approve',
    reject: 'Reject',
    revokeFailed: (spaces: string[]) =>
      spaces.length === 0
        ? 'Your earlier decision was not revoked. Nothing changed.'
        : `Only part of your earlier decision was revoked (${spaces.join(', ')}). Nothing new was recorded.`,
    recordFailedAfterRevoke: 'Your earlier decision is revoked. The new one was not recorded.',
    retry: 'Try again',
  },
  toast: {
    approvedSatisfied: (req: string, stage: string) => `Approval recorded. ${req} is satisfied and ${stage} can be promoted.`,
    approved: (passes: number, required: number, req: string) => `Approval recorded. ${passes} of ${required} on ${req}.`,
    approvedPlain: 'Approval recorded.',
    reviewsComplete: (req: string, stage: string) => `Approval recorded. ${req} is satisfied. Other gates still hold ${stage}.`,
    releaseSatisfied: (req: string, stage: string) => `Approval recorded. ${req} is satisfied and ${stage} can be released.`,
    rejected: (stage: string) => `Rejection recorded. ${stage} is blocked.`,
  },
} as const;

/** The words and tone of what the server said about one decision for one requirement. */
export function entryText(
  entry: DecisionGateEntry,
  decision: ReviewDecision,
  rules: RequirementRules | undefined,
): { tone: 'ok' | 'idle' | 'warn'; text: string } {
  const d = reviewCopy.discard;
  if (entry.reason === undefined && entry.countedOn > 0) return { tone: 'ok', text: d.countsOn(entry.countedOn, 0) };
  const tone = entry.reason === 'Author' || entry.reason === 'NotEligible' ? 'warn' : 'idle';
  switch (entry.reason) {
    case 'Revoked':
      return { tone, text: d.Revoked };
    case 'Expired':
      return { tone, text: d.Expired };
    case 'TooOld':
      return { tone, text: d.TooOld(rules?.maxAge) };
    case 'NotEligible':
      return { tone, text: d.NotEligible(rules === undefined ? 'the reviewers named' : fromText(rules)) };
    case 'Author':
      return { tone, text: decision.person.isYou ? d.AuthorYou : d.Author };
    case 'FailIgnored':
      return { tone, text: d.FailIgnored };
    default:
      return { tone, text: entry.reason === undefined ? d.countsOn(0, 0) : d.unknown(entry.reason) };
  }
}
