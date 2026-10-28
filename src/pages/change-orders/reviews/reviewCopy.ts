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
  PromoteReadiness,
  ReviewGateRef,
  ReviewChoice,
  ReviewDecision,
  ReviewAuthorIn,
  ReviewGroup,
  RequirementRules,
} from './changeOrderReviewTypes';

/**
 * A sentence cut around the stage it names, so the name can be rendered as a link while
 * the sentence stays written once, in this file. `build` is any copy function of one
 * stage name; the pieces joined with the name give back exactly its string.
 */
export function splitAroundStage(build: (stage: string) => string): string[] {
  return build(STAGE_MARK).split(STAGE_MARK);
}
const STAGE_MARK = '\u0000';

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

/** "a", "a and b", "a, b and c". */
export function listText(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The text with its first letter in capitals, to start a sentence with "the gate to prod". */
export function sentenceStart(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What a review looks at: the change in the stage whose Spaces it reads, or in the
 * ChangeOrder's own Space for the first stage's entry gate (`base`).
 */
export function reviewSubject(summary: Pick<GateReviewSummary, 'gateStageName' | 'attestTarget'>): { name: string; base: boolean } {
  return { name: summary.gateStageName, base: summary.attestTarget.TargetStage === undefined };
}

/** What a gate holds: "the gate to prod", "the release in staging", "the sign-off". */
export function gateThing(gate: ReviewGateRef): string {
  if (gate.kind === 'release') return `the release in ${gate.stageName}`;
  if (gate.kind === 'final') return 'the sign-off';
  return `the gate to ${gate.stageName}`;
}

/** The gates a review counts toward. */
export function reviewFeeds(summary: Pick<GateReviewSummary, 'gate' | 'feeds'>): ReviewGateRef[] {
  return summary.feeds ?? [summary.gate];
}

/** The plain words for a skipped Unit's reason code from the attest dry run (#5788). */
const SKIPPED_CODE_TEXT: Record<string, string> = {
  NoTarget: 'No Target, so never released.',
  NoRevision: 'Not reached by the change.',
};

/** The words for a skip code, or `undefined` for a code the UI does not know. */
export function skippedCodeText(code: string | undefined): string | undefined {
  return code === undefined ? undefined : SKIPPED_CODE_TEXT[code];
}

/** "rrv-dev, rrv-staging": the Spaces where the viewer wrote part of the change. */
export function placesText(spaces: readonly string[]): string {
  return spaces.join(', ');
}

/** "rrv-dev (1 of 2 Units)", from the server's Caller per Space. */
export function authorInText(authorIn: readonly ReviewAuthorIn[]): string {
  return authorIn.map((a) => `${a.spaceSlug} (${a.authoredRevisions} of ${plural(a.revisions, 'Unit')})`).join(', ');
}

export const reviewCopy = {
  /** Why a gate has no counts for the viewer (#5788: the server rows are the only counts). */
  notEvaluated: {
    noPermission: 'You cannot promote or release here.',
    notReached: 'The change has not reached this stage.',
    finalNotOpen: 'Sign-off opens when every stage has the change.',
    unchanged: 'Nothing new to release.',
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
    Revoked: 'Withdrawn',
    Expired: 'Not counted: expired',
    TooOld: (maxAge: string | undefined) => (maxAge === undefined ? 'Not counted: too old' : `Not counted: older than ${maxAge}`),
    NotEligible: (from: string) => `Not counted: not in ${from}`,
    Author: 'Not counted: wrote part of the change',
    AuthorYou: 'Not counted: you wrote part of the change',
    FailIgnored: 'Rejection does not block here',
    countsOn: (n: number, of: number) => (of > 0 ? `Counts on ${n} of ${plural(of, 'Unit')}` : `Counts on ${plural(n, 'Unit')}`),
    unknown: (code: string) => `Not counted (${code})`,
  },
  /** The viewer's eligibility from the server's Caller (#5788). */
  caller: {
    author: (where: string) => `You wrote part of this change in ${where}, so your decision does not count there.`,
    authorIn: (space: string, authored: number, revisions: number) => `${space} (${authored} of ${plural(revisions, 'Unit')})`,
    notEligible: 'You are not a reviewer for this requirement.',
  },
  /** One Space of a requirement, from the server's row. */
  space: {
    counted: (counted: number, required: number) => `${counted} of ${required}`,
    revisions: (satisfied: number, total: number) => `${satisfied} of ${plural(total, 'Unit')} satisfied`,
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
    none: 'No requests.',
    requestedTag: 'requested',
    requested: (names: string) => `Review requested from ${names}.`,
    withdrawn: (name: string) => `Review request to ${name} withdrawn.`,
    failed: 'The review request could not be saved.',
    conflict: 'The requests changed meanwhile. Try again.',
    sinceRequest: (when: string) => `, since the request on ${when}`,
    sincePromotion: (when: string) => `, since the promotion on ${when}`,
  },
  /** What each review gate is called, by where it sits in time. */
  gate: {
    heading: { entry: 'Review', release: 'Release review', final: 'Sign-off' },
    /** The action the gate holds. */
    action: { entry: 'Promote', release: 'Release', final: 'Completion' },
    /** The review region, by what it reviews: the change in a stage, or the sign-off. */
    regionLabel: (subject: string) => `Review of the change in ${subject}`,
    signOffRegionLabel: 'Sign-off for this ChangeOrder',
  },
  /** The card of a stage whose entry gate reviews the stage before it: the gate's state, no form. */
  entryStatus: {
    waiting: (subject: string) => `Waiting for approval of the change in ${subject}.`,
    rejected: (subject: string) => `The change in ${subject} was rejected.`,
    open: (subject: string) => `The change in ${subject} is approved.`,
    notEvaluated: (subject: string) => `Reviewed on ${subject}.`,
    where: (subject: string) => `Review it on ${subject}.`,
    notLanded: (subject: string) => `Review opens once ${subject} is promoted.`,
    goTo: (subject: string) => `Go to ${subject}`,
  },
  band: {
    waitingKicker: 'Waiting on review',
    completeKicker: 'Reviews complete',
    heldTitle: (stage: string) => `${stage} is held on`,
    blockedKicker: 'Blocked by review',
    waitingTitle: (stage: string, subject: string, need: number) =>
      `${stage} needs ${need === 1 ? '1 more approval' : `${need} more approvals`} of the change in ${subject} on`,
    completeTitle: (stage: string) => `${stage} can be promoted`,
    /** A release review has its form once every Space of the stage has the change, as Release does. */
    releaseNotYet: (stage: string) => `Review opens once ${stage} is promoted.`,
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
      `Clears when ${name} or a Space manager withdraws it, it expires, or the change is reviewed again`,
    blockedTitle: (stage: string, subject: string) => `rejected the change in ${subject}, so ${stage} is blocked`,
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
    clearsWhen: (name: string) => `Clears when ${name} withdraws it, or the change is reviewed again`,
    validUntil: 'Approvals valid until',
    expiredAndRevoked: (expired: number, revoked: number) => {
      const parts: string[] = [];
      if (expired > 0) parts.push(`${plural(expired, 'approval')} expired`);
      if (revoked > 0) parts.push(`${plural(revoked, 'rejection')} withdrawn`);
      return parts.join(', ');
    },
    youEligible: 'You can review.',
    youPartial: 'You can review. Part will not count.',
    youApproved: 'You approved. Waiting on others.',
    youOutOfDate: 'Your decision is out of date. Review again.',
    youRejected: 'You rejected this change.',
    youAuthor: 'You wrote this change. You cannot approve it.',
    youNotListed: 'You are not a reviewer.',
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
    reviewedIn: 'Reviewed in',
    signOffEvaluatedOver: 'Sign-off evaluated over',
    refused: (stage: string) => `Promote to ${stage} is blocked until`,
    releaseRefused: (stage: string) => `Release in ${stage} is blocked until`,
    isSatisfied: 'is met.',
    isSatisfiedFor: (subject: string) => `is met for the change in ${subject}.`,
    moreNeeded: (need: number) => (need === 1 ? '1 more approval needed.' : `${need} more approvals needed.`),
    rejectionStands: 'A rejection stands.',
    serverHolds: 'Not satisfied yet.',
    reviewLink: 'Review',
    reviewIn: (subject: string) => `Review in ${subject}`,
    spaceTag: (passes: number, required: number) => `${passes} of ${required}`,
    spaceFail: 'fail',
    spaceHeld: 'held',
    spaceNotEvaluated: 'not evaluated',
  },
  panel: {
    heading: 'Review',
    /** What the review looks at, under the heading. */
    subject: (subject: string, base: boolean) => (base ? `The change in ${subject}` : `The change in stage ${subject}`),
    countsToward: (things: string) => `Counts toward ${things}.`,
    rejected: 'Rejected',
    rejectedMeta: (ago: string, name: string) => ({ ago, by: `by ${name}` }),
    satisfied: 'Satisfied',
    validUntil: (when: string) => `valid until ${when}`,
    waiting: 'Waiting',
    since: (when: string) => `since ${when}`,
    sinceRequest: (when: string) => `since the request, ${when}`,
    sincePromotion: (when: string) => `since the promotion, ${when}`,
    loading: 'Loading reviews…',
    loadError: 'Reviews could not be loaded.',
    truncated: 'Some reviews were not loaded.',
    yourReview: 'Your review',
    /** Named by what the requirements hold: "the gate to prod", "the release in staging", or both. */
    requirementsFor: (things: string) => `Requirements for ${things}`,
    decisions: 'Decisions',
    /** The collapsible sections below the decision, and what each sums up. */
    coverageSection: 'What your decision covers',
    coverageSummary: (units: number, spaces: number) => `${plural(units, 'Unit')} in ${plural(spaces, 'Space')}`,
    coverageChecking: 'Checking…',
    requestsSummary: (n: number) => (n === 0 ? 'None yet' : plural(n, 'request')),
    requirementsSummary: (met: number, total: number) => `${met} of ${total} met`,
    recorded: (n: number) => `${n} recorded`,
  },
  you: {
    eligibleLead: (requirements: string[]) =>
      `, you can review for ${requirements.join(', ')}.`,
    /** The viewer wrote gate Revisions, but the requirement allows authors (AllowAuthors). */
    eligibleAuthorLead: (requirements: string[]) =>
      `, you can review for ${requirements.join(', ')}. Authors may approve here.`,
    /** The viewer's own decision that the server does not count (Caller.Counts false). */
    ownNotCounted: (choice: ReviewChoice, at: string) => ({
      lead: choice === 'Pass' ? 'You approved' : 'You rejected',
      rest: ` at ${at}. It does not count.`,
    }),
    /** M3: the viewer wrote some gate Revisions, so the decision counts only on the others. */
    partialLead: (requirements: string[]) => `, you can review for ${requirements.join(', ')}.`,
    serverChecksOnSubmit: 'The server checks it on submit.',
    partialAuthor: (where: string) => `You wrote ${where}, so it does not count there.`,
    countsOn: (where: string) => `It counts on ${where}.`,
    approved: (at: string, revisions: string, until: string | undefined) =>
      until === undefined
        ? { lead: 'You approved', rest: ` at ${at}. Your approval covers ${revisions}.` }
        : { lead: 'You approved', rest: ` at ${at}. Your approval covers ${revisions} and is valid until ${until}.` },
    rejected: (at: string, revisions: string) => ({ lead: 'You rejected', rest: ` at ${at}. Your rejection covers ${revisions}.` }),
    /** The viewer's live decision does not cover every Revision a gate of this review reads now. */
    outOfDate: (choice: ReviewChoice, at: string, requirements: string[]) => ({
      lead: choice === 'Pass' ? 'Your approval' : 'Your rejection',
      rest: ` from ${at} does not cover what ${requirements.join(', ')} reads now. Review again.`,
    }),
    /** The coverage says the decision counts on no Unit the gates read: no form, and why. */
    wouldNotCount: `, your decision would not count: you wrote all of this change, and authors cannot approve.`,
    changeMyDecision: 'Change my decision',
    changeLead: 'Change your decision.',
    changeRest: (choice: ReviewChoice, at: string) =>
      ` It replaces your ${choice === 'Pass' ? 'approval' : 'rejection'} from ${at}.`,
    keepMine: (choice: ReviewChoice) => (choice === 'Pass' ? 'Keep my approval' : 'Keep my rejection'),
    rejectionStands: 'A rejection stands.',
    rejectionStandsRest: (held: string, name: string) =>
      ` ${sentenceStart(held)} stays blocked until ${name} withdraws it.`,
    notListedTitle: 'You are not a reviewer of this change',
    notListed: 'Only these people and groups can approve.',
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
      rest: ' does not accept approvals from who wrote or promoted the change.',
    }),
    needFrom: (need: number) => `${need === 1 ? '1 more approval' : `${need} more approvals`} needed from`,
    anyoneWithApprove: 'Anyone with Approve on these Spaces can approve.',
    groupOnly: 'Members of these groups can approve.',
    viaGroup: (group: string) => `in ${group}`,
    authorOn: (where: string) => `You wrote ${where}.`,
    authorRule: ' does not accept approvals from authors.',
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
    placeholderFail: (subject: string) => `What must change in ${subject}?`,
    hint: (noun: string) => `Visible to everyone on this ${noun}.`,
    reasonRequired: 'A reason is required.',
    choose: 'Choose approve or reject',
    /** `into`: the stage a promotion review gates, which is what the decision is on. */
    submit: (choice: ReviewChoice, subject: string, into?: string) =>
      into === undefined ? `${choice === 'Pass' ? 'Approve' : 'Reject'} the change in ${subject}` : `${choice === 'Pass' ? 'Approve' : 'Reject'} the promotion into ${into}`,
    promotionCovers: (subject: string) => `It covers the Revisions in ${subject}.`,
  },
  coverage: {
    label: 'What this decision covers',
    covers: (revisions: number, spaces: number, skips: number) => ({
      revisions: plural(revisions, 'Unit'),
      spaces: plural(spaces, 'Space'),
      skips: `, skips ${skips}`,
    }),
    authorHead: 'Your decision would be saved on',
    authorTail: ', but it would not count: you wrote or promoted this change.',
    skipped: 'Skipped.',
    notChanged: 'Not touched by the change.',
    authorHere: 'Does not count: you wrote the change here.',
    spaceError: 'Not recorded here:',
    nothingRecordable: 'A decision from you would record nothing.',
    typeHead: (type: string) => type,
    loading: 'Checking what a decision covers…',
    unavailable: 'Coverage unavailable.',
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
    groupTooltip: (id: string) => `Group ${id}`,
    forGate: (thing: string) => `For ${thing}`,
  },
  decision: {
    approved: 'Approved',
    rejected: 'Rejected',
    revoked: 'Withdrawn',
    expired: 'Expired',
    you: ' (you)',
    validUntil: (when: string) => `valid until ${when}`,
    revokedAt: (when: string) => `withdrawn ${when}`,
    revokedAtBy: (when: string, by: string) => `withdrawn ${when} by ${by}`,
    validUntilFor: (req: string, when: string) => `${req} until ${when}`,
    typeLabel: (type: string) => type,
    expiredAt: (created: string, when: string) => `approved ${created}, expired ${when}`,
    revisions: (spaces: number) => plural(spaces, 'Space'),
    replacedBy: (first: string, choice: ReviewChoice, at: string) =>
      `Replaced by ${first}’s ${choice === 'Pass' ? 'approval' : 'rejection'} at ${at}.`,
    replaces: (first: string, choice: ReviewChoice, at: string) =>
      `Replaces ${first}’s ${choice === 'Pass' ? 'approval' : 'rejection'} from ${at}.`,
    /** A decision not made on this ChangeOrder, which its gates count because the change is the same. */
    origin: (origin: 'other' | 'none', counts: boolean) =>
      `${origin === 'other' ? 'Made on another ChangeOrder.' : 'Made outside a ChangeOrder.'}${counts ? ' Counts here: same change.' : ''}`,
    noLongerCounts: (first: string) => `No longer counts. ${first} can approve again.`,
    none: 'No decisions yet.',
  },
  confirm: {
    titleApprove: 'Record your approval',
    titleReject: 'Record your rejection',
    titleReplace: 'Replace your decision',
    attestation: 'Decision',
    /** The Type only when it is not the default Approval. */
    attestationValue: (type: string) => (type === 'Approval' ? '' : `${type}: `),
    pass: 'Approve',
    fail: 'Reject',
    requirement: (n: number) => (n === 1 ? 'Requirement' : 'Requirements'),
    target: 'ChangeOrder',
    reviews: 'Change in',
    reviewsValue: (subject: string, spaces: string, base: boolean) => (base ? spaces : `${subject}: ${spaces}`),
    opens: 'Counts toward',
    covers: 'Covers',
    coversValue: (revisions: number | undefined, spaces: number) =>
      revisions === undefined ? plural(spaces, 'Space') : `${plural(revisions, 'Unit')} in ${plural(spaces, 'Space')}`,
    revokes: 'Replaces',
    revokesValue: (d: ReviewDecision) => `your ${d.result === 'Pass' ? 'approval' : 'rejection'}, ${reviewTime(d.createdAt)}`,
    validUntil: 'Valid',
    noLimit: 'no limit',
    validFor: (maxAge: string) => `for ${maxAge}`,
    reason: 'Your reason',
    effectCompletes: (req: string) => `This completes ${req}.`,
    effectMoves: (req: string, n: number, of: number) =>
      `${req}: ${n} of ${of}.`,
    effectStaysBlocked: (held: string, name: string) => `${sentenceStart(held)} stays blocked by ${name}’s rejection.`,
    effectBlocks: (held: string) =>
      `This blocks ${held} until you withdraw it or the change is reviewed again.`,
    /** S4: no requirement of this Type blocks on a rejection. */
    effectRecordedNotBlocking: (reqs: string[]) =>
      `Does not block: ${reqs.join(', ')} ${reqs.length === 1 ? 'ignores' : 'ignore'} rejections.`,
    /** What the decision does to each gate it counts toward, on a line of its own. */
    gateOpens: (thing: string) => `This opens ${thing}.`,
    gateSignOff: 'The ChangeOrder can then complete.',
    gateOthersHold: (thing: string, others: string[]) =>
      `${sentenceStart(thing)} stays closed: ${others.join(', ')} still ${others.length === 1 ? 'holds' : 'hold'} it.`,
    gateUnknown: (thing: string) => `${sentenceStart(thing)} depends on its other gates.`,
    gateStaysClosed: (thing: string) => `${sentenceStart(thing)} stays closed: other requirements remain.`,
    gateNotYet: (thing: string) => `${sentenceStart(thing)} stays closed until then.`,
    typeBlock: (type: string) => type,
    nothingRecorded: 'Nothing was saved: the change reached no Space you cover.',
    partlyRecorded: (types: string[]) => `Recorded for ${types.join(', ')} only.`,
    effectReplaces: 'Replaces your earlier decision.',
    effectSatisfied: 'Already satisfied.',
    /** The decision counts on only some of the Units the gates read: never "this completes". */
    effectPartlyCounts: (counts: number, total: number) =>
      `Counts on ${counts} of ${plural(total, 'Unit')}. You wrote the others.`,
    cancel: 'Cancel',
    approve: 'Approve',
    reject: 'Reject',
    revokeFailed: (spaces: string[]) =>
      spaces.length === 0
        ? 'Your earlier decision was not withdrawn. Nothing changed.'
        : `Only part of your earlier decision was withdrawn (${spaces.join(', ')}). Nothing new was saved.`,
    recordFailedAfterRevoke: 'Your earlier decision is withdrawn. The new one was not saved.',
    /** Why a record of the earlier decision is not revoked: nothing is sent, so it stays in force. */
    unrevocable: {
      otherReview: 'this record is a decision on another review, so it cannot be withdrawn here.',
      notListed: 'this record is no longer listed, so it cannot be withdrawn. Reload the page and try again.',
    },
    retry: 'Try again',
  },
  /** The result of a decision, worded from the server's gate verdicts read after it was recorded. */
  toast: {
    approved: (subject: string) => `Approval of the change in ${subject} recorded.`,
    rejected: (subject: string) => `Rejection of the change in ${subject} recorded.`,
    canPromote: (stage: string) => `${stage} can be promoted.`,
    reviewsComplete: (stage: string, others: string[]) =>
      `The reviews for ${stage} are complete. ${others.join(', ')} still ${others.length === 1 ? 'holds' : 'hold'} it.`,
    canRelease: (stage: string) => `${stage} can be released.`,
    signOffComplete: 'Sign-off is complete.',
    reviewsDone: (stage: string) => `The reviews for ${stage} are complete.`,
    progress: (req: string, passes: number, required: number, thing: string) => `${req}: ${passes} of ${required} for ${thing}.`,
    blocked: (thing: string) => `${sentenceStart(thing)} is blocked.`,
    notRead: 'Gates update on the next check.',
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

/**
 * The toast after a decision is recorded, from the gates as the server reports them once
 * it was recorded (`summaries`, one per gate the review counts toward), never from a
 * prediction. `refreshed` false: the verdicts were not read again in time, so it says so.
 */
export function recordedToastText(
  summaries: readonly GateReviewSummary[],
  subject: string,
  result: ReviewChoice,
  readinessOf: (stageId: string) => PromoteReadiness | undefined,
  refreshed: boolean,
): string {
  const t = reviewCopy.toast;
  const lead = result === 'Pass' ? t.approved(subject) : t.rejected(subject);
  if (!refreshed) return `${lead} ${t.notRead}`;
  const parts = summaries.flatMap((summary): string[] => {
    const { gate } = summary;
    if (summary.state === 'rejected') return [t.blocked(gateThing(gate))];
    if (summary.open) {
      if (gate.kind === 'final') return [t.signOffComplete];
      if (gate.kind === 'release') return [t.canRelease(gate.stageName)];
      const readiness = readinessOf(gate.stageId);
      if (readiness?.kind === 'ready') return [t.canPromote(gate.stageName)];
      if (readiness?.kind === 'reviewsComplete' && readiness.otherGatesHolding.length > 0) {
        return [t.reviewsComplete(gate.stageName, readiness.otherGatesHolding)];
      }
      return [t.reviewsDone(gate.stageName)];
    }
    const primary = summary.primary;
    if (primary === undefined || !primary.evaluated) return [];
    return [t.progress(primary.name, primary.passes, primary.required, gateThing(gate))];
  });
  return [lead, ...parts].join(' ');
}
