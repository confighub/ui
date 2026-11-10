// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every string the stage card shows.
 *
 * Plain words, short sentences, the domain's own nouns. Sentences that carry a
 * link or a code span are built as `CopySegment[]`, so each is still written once,
 * here, and the component only decides how a segment looks. Where the review copy
 * or the ChangeOrder copy already says a thing, this file reuses it rather than
 * saying it a second way.
 */

import { clockTime, plural } from '../changeOrderHistory';
import { agoText, listText, reviewCopy, reviewTime } from '../reviews/reviewCopy';
import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import { approvals, differsTail, listSegments, seg, spaceLink, spaceListSegments, type NamedSpace } from './stageCopyParts';
import type { CopySegment, MergeMethod, ReviewAction } from './stageTypes';

export {
  APPROVAL_NOTE_REQUIRED,
  NOTE_COUNTER_FROM,
  PROBLEM_ITEM_LIMIT,
  REVIEWER_ROW_LIMIT,
  noteRequired,
  seg,
  segmentsText,
  type NamedSpace,
} from './stageCopyParts';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const stageCardCopy = {
  // ── The Stage log ────────────────────────────────────────────────────────
  log: {
    regionLabel: (stage: string) => `${stage} log`,
    arrivedFrom: 'Arrived from ',
    madeHere: 'Made here',
    definedHere: 'Defined here',
    passed: 'Passed',
    failedIn: 'Failed in ',
    failed: 'Failed',
    needs: (description: string) => `Needs ${description}`,
    notChecked: 'Not checked',
    notYet: 'Not passed yet',
    reviewDetails: 'Review details',
    approved: 'Approved',
    approvedRelease: 'Approved the release',
    ofCount: (i: number, n: number) => `${i} of ${n}`,
    rejected: 'Rejected',
    quoted: (note: string) => `“${note}”`,
    actionTo: (release: boolean, stage: string) => `${release ? 'Release' : 'Promote'} to ${stage}`,
    failedInOf: (failed: number, total: number) => `Failed in ${failed} of ${plural(total, 'Space')}`,
    promotedTo: (stage: string) => `Promoted to ${stage}`,
    spaces: (n: number) => plural(n, 'Space'),
    releasedTo: (stage: string) => `Released to ${stage}`,
    targetsRanIt: (n: number) => `${plural(n, 'Target')} ran it`,
    /** The released line's status: "54 of 55 Targets ran it" when some ran it, "55 Targets ran it" when all did. */
    releasedStatus: (ran: number, total: number) =>
      ran < total ? `${ran} of ${plural(total, 'Target')} ran it` : `${plural(total, 'Target')} ran it`,
    restored: 'Restored',
    takenBackOut: (stage: string) => `The change was taken back out of ${stage}`,
    restoreReleased: 'Released the restored Revisions',
    targetsRunThem: (n: number) => `${plural(n, 'Target')} run them`,
    aborted: 'Aborted',
    abortedText: 'This ChangeOrder was aborted',
    progressUnavailable: 'Progress unavailable',
    progressUnavailableWhy: 'The server did not report which Stages are promoted',
    held: (stage: string) => `${stage} is held`,
    cantCheck: (stage: string) => `Can't check ${stage}`,
    serverAnswered: (status: number | undefined) =>
      status === undefined ? 'The server did not answer. Nothing was promoted.' : `The server answered ${status}. Nothing was promoted.`,
    tryAgain: 'Try again',
    noSpaceHere: (stage: string) => `No Space of this ChangeOrder is in ${stage}`,
    nothingToPromote: 'Nothing to promote here.',
    hasTheChange: (n: number) => (n === 1 ? ' already has the change' : ' already have the change'),
    now: 'Now',
    nowStill: 'Now · still to happen',
    promoteTo: (stage: string) => `Promote to ${stage}`,
    promoteAnywayTo: (stage: string) => `Promote to ${stage} anyway?`,
    retryTo: (stage: string) => `Retry the promote to ${stage}`,
    releaseTo: (stage: string) => `Release to ${stage}`,
    releaseAgainTo: (stage: string) => `Release again to ${stage}`,
    yourTurn: 'Your turn',
    yourTurnSpaces: (n: number) => `Your turn · ${plural(n, 'Space')}`,
    after: 'After ',
    waitsFor: 'Waiting for ',
    review: 'the review',
    releaseReview: 'the release review',
    thePromote: 'the promote',
    /** A locked line names the gates that hold it; from this many on, it counts them. */
    gatesCountFrom: 3,
    gatesCount: (n: number) => (n === 1 ? '1 gate' : `${n} gates`),
    cantPromoteInto: (stage: string) => `You can't promote into ${stage}`,
    waitsForServer: (stage: string) => `Waiting for the server to stop holding ${stage}`,
    retryCannotHelp: 'A retry passes the same Space over again',
    targetsRunEarlier: (n: number) => `${plural(n, 'Target')} run the earlier revision.`,
    promoting: (stage: string) => `Promoting to ${stage}…`,
    releasing: (stage: string) => `Releasing to ${stage}…`,
    releaseInfoLabel: 'About this release',
    promote: 'Promote',
    promoteAnyway: 'Promote anyway…',
    confirmAnyway: 'Promote anyway',
    retry: 'Retry',
    release: 'Release',
    nothingLeft: (stage: string) => `Nothing left in ${stage}.`,
    noTargets: (stage: string) => `No Space of ${stage} has a Target, so there is nothing to release.`,
    startsHere: 'The change starts here.',
    goTo: (stage: string) => `Go to ${stage}`,
    /** "Next: Complete." — the step's name is a link to it. */
    next: 'Next: ',
    nextEnd: '.',
  },

  regionLabel: (stage: string) => `Stage ${stage}`,
  /** The card's heading, "Stage: Test": the word is quieter than the name. */
  stageHeadingLead: 'Stage:',
  stageHeading: (stage: string) => `Stage: ${stage}`,

  /** Done and source lines that lead to the next step. The arrow is an icon. */
  goTo: (next: string) => `Go to ${next}`,
  goToComplete: 'Go to Complete',
  byline: (name: string, isYou: boolean, at: number, now: number) => {
    const when = now - at < 60_000 ? 'just now' : reviewTime(new Date(at).toISOString());
    return `By ${isYou ? 'you' : name}, ${when}`;
  },

  // ── Headlines ────────────────────────────────────────────────────────────
  headline: {
    ready: 'Ready to promote',
    readyAfterApproval: 'Approved. Ready to promote',
    /** The headline of a stage whose review is satisfied while other gates still hold it. */
    afterApproval: (headline: readonly CopySegment[]): CopySegment[] => [seg.text('Approved. '), ...headline],
    reviewNeeded: 'Your review is needed',
    reviewWaiting: 'Waiting on review',
    rejectedBy: (name: string) => `${name} rejected the change`,
    rejectedByYou: 'You rejected the change',
    promoted: changeOrderCopy.stageVerdict.promoted,
    promotedNoTargets: (stage: string) => `Promoted to ${stage}`,
    released: (stage: string) => `Released to ${stage}`,
    promoteFailed: (failed: number, total: number) => `Promotion failed in ${failed} of ${plural(total, 'Space')}`,
    releaseFailed: (failed: number, total: number) => `Release failed in ${failed} of ${plural(total, 'Space')}`,
    gateFailed: (gate: string) => [seg.code(gate), seg.text(' failed')],
    gatesFailed: (count: number) => [seg.text(`${count} gates failed`)],
    /** The calm headline of a stage whose gates have not passed yet. */
    gateWaiting: (waitFor: 'promoted' | 'released' | 'healthy', previous: string | undefined, gate: string): CopySegment[] => {
      if (waitFor === 'healthy' || previous === undefined) return [seg.text('Waiting on '), seg.code(gate)];
      return [seg.text(`Waiting for ${previous} to be ${waitFor === 'released' ? 'released' : 'promoted'}`)];
    },
    loading: 'Reading the stage…',
    aborted: 'This ChangeOrder was aborted',
    noSpaces: changeOrderCopy.stageHasNoSpaces,
    inProgress: (promoted: number, total: number) => `Promoted in ${promoted} of ${plural(total, 'Space')}`,
    progressUnknown: changeOrderCopy.stageVerdict.unknown,
    restored: changeOrderCopy.stageVerdict.restored,
    restoreReleased: changeOrderCopy.stageVerdict['restore-released'],
    serverHeld: (stage: string) => `${stage} is held`,
    noPermission: (stage: string) => `You can't promote into ${stage}`,
    dryRunRefused: 'The dry run was refused',
    working: (stage: string) => `Promoting to ${stage}…`,
    differs: (n: number) => (n === 1 ? '1 Space takes a different change' : `${n} Spaces take a different change`),
    kept: (n: number) => (n === 1 ? '1 Space keeps its own value' : `${n} Spaces keep their own value`),
    refused: (n: number) => (n === 1 ? '1 Space refuses part of the change' : `${n} Spaces refuse part of the change`),
    adds: (n: number) => (n === 1 ? '1 Space gets a resource it does not hold yet' : `${n} Spaces get a resource they do not hold yet`),
    unknown: (n: number, total: number) => `Can't tell what changes in ${n} of ${plural(total, 'Space')}`,
    mixed: (n: number) => (n === 1 ? '1 Space takes the change differently' : `${n} Spaces take the change differently`),
  },

  // ── Bodies ───────────────────────────────────────────────────────────────
  body: {
    source: 'The change was made here.',
    invocationSource: 'Runs in each stage on promote.',
    noSpaces: 'Its selector matches no Space.',
    promotedNoTargets: (stage: string) => `No Space of ${stage} has a Target.`,
    inProgress: 'Promote again to finish.',
    progressUnknown: changeOrderCopy.progressUnavailableDetail,
    restored: (stage: string) => `The change was taken back out of ${stage}.`,
    noPermission: 'No permission to promote.',
    gateWait: (checkedAt: number) => `Checked ${clockTime(checkedAt)}.`,
    goToPrevious: (stage: string) => `Go to ${stage}`,
    gateIn: (spaces: readonly NamedSpace[]) => [seg.text('in '), ...spaceListSegments(spaces)],
    /**
     * A failing gate's reason with the Spaces it failed in, inside the sentence:
     * "…has no live status (in [dev] and [canary])." The reason is the server's or
     * the CLI's own words, so the Spaces go in brackets before its full stop rather
     * than being worked into its grammar.
     */
    gateReasonIn: (reason: string, spaces: readonly NamedSpace[]): CopySegment[] => {
      const trimmed = reason.trim();
      if (spaces.length === 0) return [seg.text(trimmed)];
      const stop = /[.!?]$/.test(trimmed) ? trimmed.slice(-1) : '.';
      const body = /[.!?]$/.test(trimmed) ? trimmed.slice(0, -1) : trimmed;
      return [seg.text(`${body} (in `), ...spaceListSegments(spaces), seg.text(`)${stop}`)];
    },
    /** After a failure: what the other Spaces hold. */
    failedRest: (landed: number, total?: number, failedNames?: string) => {
      if (landed > 0) return `The other ${landed} hold the change, not released.`;
      if (total === undefined || failedNames === undefined || total <= 1) return 'Nothing was written.';
      return `None of the ${total} Spaces were written, because ${failedNames} failed.`;
    },
    releaseFailedRest: (released: number) => (released === 0 ? 'Nothing was released.' : `The other ${released} are released.`),
    serverMessage: 'Server message',
    beforeYouApprove: 'Before you approve:',
    tookDifferent: (n: number) => (n === 1 ? '1 Space took a different change' : `${n} Spaces took a different change`),
  },

  // ── Problem items ───────────────────────────────────────────────────────
  problem: {
    differs: (space: NamedSpace, field: string, ref: { unitId: string; path: string }, from: string, to: string, refFrom: string, refTo: string): CopySegment[] => [
      spaceLink(space),
      seg.text(': '),
      seg.link(field, { to: 'field', spaceId: space.spaceId, unitId: ref.unitId, path: ref.path }, true, ref.path),
      seg.text(differsTail(from, to, refFrom, refTo)),
    ],
    kept: (space: NamedSpace, unit: { unitId: string; name: string }, path: string, value: string, override: boolean, label: string = path): CopySegment[] => [
      spaceLink(space),
      seg.text(override ? ': a local override in ' : ': a protected field in '),
      seg.link(unit.name, { to: 'unit', spaceId: space.spaceId, unitId: unit.unitId, tab: 'links' }),
      seg.text(' keeps '),
      seg.link(label, { to: 'field', spaceId: space.spaceId, unitId: unit.unitId, path }, true, path),
      seg.text(` at ${value}.`),
    ],
    refused: (space: NamedSpace, unit: { unitId: string; name: string }, why: string): CopySegment[] => [
      spaceLink(space),
      seg.text(': '),
      seg.link(unit.name, { to: 'unit', spaceId: space.spaceId, unitId: unit.unitId, tab: 'config' }),
      seg.text(` refuses part of the change: ${why}`),
    ],
    adds: (space: NamedSpace, resource: string, unitId: string | undefined): CopySegment[] => [
      spaceLink(space),
      seg.text(' does not hold '),
      unitId === undefined ? seg.code(resource) : seg.link(resource, { to: 'unit', spaceId: space.spaceId, unitId, tab: 'resources' }, true),
      seg.text(' yet. The promotion adds it.'),
    ],
    mergeDeclined: (resource: string, spaces: readonly NamedSpace[]): CopySegment[] => [
      seg.code(resource),
      seg.text(' is held under more than one namespace in '),
      ...spaceListSegments(spaces),
      seg.text('.'),
    ],
    unreadable: (spaces: readonly NamedSpace[]): CopySegment[] => [
      seg.text('A resource in '),
      ...spaceListSegments(spaces),
      seg.text(' could not be read.'),
    ],
    noResources: (spaces: readonly NamedSpace[]): CopySegment[] => [
      ...spaceListSegments(spaces),
      seg.text(spaces.length === 1 ? ' holds none of the resources this change touches yet.' : ' hold none of the resources this change touches yet.'),
    ],
    unplanned: (spaces: readonly NamedSpace[]): CopySegment[] => [
      seg.text('The dry run could not plan '),
      ...spaceListSegments(spaces),
      seg.text('.'),
    ],
    /** One failed item of a promotion: "[space]: [unit] message". */
    failedItem: (space: NamedSpace, unit: { unitId?: string; name?: string }, message: string): CopySegment[] => [
      spaceLink(space),
      seg.text(': '),
      ...(unit.name === undefined
        ? []
        : [
            unit.unitId === undefined
              ? seg.text(unit.name)
              : seg.link(unit.name, { to: 'unit', spaceId: space.spaceId, unitId: unit.unitId, tab: 'config' }),
            seg.text(' '),
          ]),
      seg.text(message),
    ],
    /**
     * The server's sentence when it names the Space itself ("api-gateway keeps … in {Space}."): said once,
     * with the Space a link and the Unit a link (or plain text when the record has no Unit id). A Unit
     * name is a name, so never code font. Else `failedItem`.
     */
    failedMessage: (space: NamedSpace, unit: { unitId?: string; name?: string }, message: string): CopySegment[] => {
      // Whole names only: `app` in "apply" or `web` in "webhook" stays text. A dot ends a name unless a word
      // character follows it, so a name at the end of a sentence still matches.
      const escape = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const whole = (alternatives: string) => new RegExp(`(?<![\\w.-])(${alternatives})(?![\\w-]|\\.\\w)`);
      const names = [space.name, ...(unit.name === undefined ? [] : [unit.name])]
        .filter((n) => n !== '' && whole(escape(n)).test(message))
        .sort((x, y) => y.length - x.length);
      if (!names.includes(space.name)) return stageCardCopy.problem.failedItem(space, unit, message);
      const pattern = whole(names.map(escape).join('|'));
      return message
        .split(pattern)
        .filter((part) => part !== '')
        .map((part): CopySegment => {
          if (part === space.name) return spaceLink(space);
          if (unit.name !== undefined && part === unit.name) {
            return unit.unitId === undefined
              ? seg.text(part)
              : seg.link(part, { to: 'unit', spaceId: space.spaceId, unitId: unit.unitId, tab: 'config' });
          }
          return seg.text(part);
        });
    },
    /**
     * A Unit whose release gates refused: "webhook in {Space} is gated: {gate} and {gate}." Each gate by its
     * Trigger's name. Without a Unit (the answer did not name one), the Space is the subject.
     */
    gated: (space: NamedSpace, unit: { unitId?: string; name?: string }, gates: readonly string[]): CopySegment[] => [
      ...(unit.name === undefined
        ? []
        : [
            unit.unitId === undefined
              ? seg.text(unit.name)
              : seg.link(unit.name, { to: 'unit', spaceId: space.spaceId, unitId: unit.unitId, tab: 'config' }),
            seg.text(' in '),
          ]),
      spaceLink(space),
      ...(gates.length === 0 ? [seg.text(' is gated.')] : [seg.text(' is gated: '), ...listSegments(gates.map((g) => [seg.text(g)])), seg.text('.')]),
    ],
    /** The gate set while a Unit's Triggers have not finished, as `gated` names it. */
    triggersStillRun: 'its Triggers still run',
    /** The link from a gated Space to its Variant's Gates tab, where its gates are listed and fixed. */
    openGates: 'Open its Gates tab',
    openGatesOf: (variant: string) => `Open the Gates tab of ${variant}`,
    /** A read for the gated line failed: the gates show their Trigger slugs, and the link may be missing. */
    gateReadFailed: 'The Trigger names or the Variant could not be read.',
    passesNow: (space: NamedSpace): CopySegment[] => [spaceLink(space), seg.text(': the dry run passes now.')],
    andMore: (k: number) => `and ${k} more in the diff`,
  },

  // ── The dry-run line ────────────────────────────────────────────────────
  dryRun: {
    counts: (units: number, spaces: number) => `${plural(units, 'Unit')} in ${plural(spaces, 'Space')} would change.`,
    /** "…, 1 of them differently", "…, 1 of them could not be compared", or both. */
    countsOdd: (units: number, spaces: number, differently: number, unknown: number) => {
      const parts = [
        ...(differently > 0 ? [`${differently} of them differently`] : []),
        ...(unknown > 0 ? [differently > 0 ? `${unknown} could not be compared` : `${unknown} of them could not be compared`] : []),
      ];
      return `Dry run: ${plural(units, 'Unit')} in ${plural(spaces, 'Space')} would change, ${parts.join(' and ')}.`;
    },
    countsPrefixed: (units: number, spaces: number) => `Dry run: ${plural(units, 'Unit')} in ${plural(spaces, 'Space')} would change.`,
    passed: 'Dry run passed.',
    running: 'Checking what would change…',
    unavailable: 'Dry run unavailable.',
    rerunning: 'Running the dry run…',
    fails: (spaces: string) => `Dry run fails for ${spaces}.`,
    didNotFinish: 'The dry run did not finish.',
    checking: (spaces: string) => `Checking ${spaces}…`,
    release: (spaces: number) => `Releases ${plural(spaces, 'Space')}.`,
    releaseDiffers: (space: NamedSpace, field: string, from: string, to: string): CopySegment[] => [
      spaceLink(space),
      seg.text(' got '),
      seg.link(field, { to: 'diff' }, true),
      seg.text(` ${from} → ${to}.`),
    ],
    reach: changeOrderCopy.previewReach,
  },

  // ── The promote buttons ────────────────────────────────────────────────────
  merge: {
    label: (method: MergeMethod, stage: string, anyway: boolean) => {
      const base = method === 'pr' ? `Promote and release to ${stage}` : method === 'p' ? `Promote to ${stage}` : `Release to ${stage}`;
      return anyway ? `${base} anyway…` : base;
    },
    /** Under 760px. */
    shortLabel: (method: MergeMethod, anyway: boolean) => {
      const base = method === 'pr' ? 'Promote and release' : method === 'p' ? 'Promote' : 'Release';
      return anyway ? `${base} anyway…` : base;
    },
    /** The button beside the main one: a second way to act on the same stage. */
    otherLabel: (method: MergeMethod, anyway: boolean) => {
      const base = method === 'pr' ? 'Promote and release' : method === 'p' ? 'Promote only' : 'Release only';
      return anyway ? `${base} anyway…` : base;
    },
    item: {
      pr: { label: 'Promote and release', description: (stage: string) => `Write and publish ${stage}` },
      p: { label: 'Promote only', description: (stage: string) => `Write ${stage}, release later` },
      r: {
        label: 'Release only',
        description: (stage: string) => `Publish ${stage}`,
      },
    },
    confirm: (method: MergeMethod, anyway: boolean) => {
      const base = method === 'pr' ? 'Confirm promote and release' : method === 'p' ? 'Confirm promote' : 'Confirm release';
      return anyway ? `${base} anyway` : base;
    },
    cancel: 'Cancel',
    working: 'Working…',
    tickFirst: 'Tick the box first.',
    ack: {
      /** Text at even places, a value (field, from, to) at odd places. */
      differsParts: (space: string, field: string, from: string, to: string) => [`${space} should get `, field, ' ', from, ' → ', to, '.'],
      keptParts: (space: string, path: string, value: string) => [`I understand that ${space} keeps `, path, ' at ', value, '.'],
      unknown: (n: number) => `Promote without knowing what changes in ${plural(n, 'Space')}.`,
      several: 'I checked the differences above.',
      noDryRun: 'Promote without a dry run.',
    },
    retry: (stage: string, release: boolean) => (release ? `Retry and release to ${stage}…` : `Retry to ${stage}…`),
    retryAnyway: (release: boolean) => (release ? 'Retry and release anyway…' : 'Retry anyway…'),
    retryConfirm: (release: boolean) => (release ? 'Confirm retry and release' : 'Confirm retry'),
    retryWrites: (spaces: string, total: number, release: boolean) =>
      release ? `Writes ${spaces}, then releases all ${plural(total, 'Space')}.` : `Writes ${spaces}.`,
    checkAgain: 'Check again',
    releaseAgain: 'Release again',
  },

  // ── Announcements (the page's live region) ──────────────────────────────
  announce: {
    promoting: (stage: string) => `Promoting to ${stage}.`,
    releasing: (stage: string) => `Releasing to ${stage}.`,
    released: (stage: string) => `Released to ${stage}.`,
    heldByGate: (stage: string) => `${stage} is held by a gate, so it was not promoted.`,
    planChanged: (stage: string) => `What the promotion to ${stage} writes changed, so nothing was promoted. Check it, then promote again.`,
    rejectionWithdrawn: 'Rejection withdrawn.',
    askedAgain: (name: string) => `Asked ${name} to review again.`,
  },

  // ── Reviews in the status box ───────────────────────────────────────────
  review: {
    /** "`req` needs 1 approval [of the change in [Subject]] before Stage can be promoted." */
    needs: (requirement: string, need: number, stage: string, action: ReviewAction, subject?: { stageId: string; name: string }): CopySegment[] => [
      seg.code(requirement),
      seg.text(` needs ${approvals(need)} `),
      ...(subject === undefined ? [] : [seg.text('of the change in '), seg.link(subject.name, { to: 'stage', stageId: subject.stageId }), seg.text(' ')]),
      seg.text(`before ${stage} can be ${action === 'release' ? 'released' : 'promoted'}.`),
    ],
    moreRequirements: (k: number) => ` and ${plural(k, 'more requirement')}`,
    /**
     * Several open requirements, each with what it needs: "`a` needs 1 approval
     * and `b` needs 2 approvals before Stage can be released."
     */
    needsEach: (
      requirements: readonly { name: string; need: number }[],
      stage: string,
      action: ReviewAction,
      subject?: { stageId: string; name: string },
    ): CopySegment[] => [
      ...listSegments(requirements.map((r) => [seg.code(r.name), seg.text(` needs ${approvals(r.need)}`)])),
      ...(subject === undefined ? [] : [seg.text(' of the change in '), seg.link(subject.name, { to: 'stage', stageId: subject.stageId })]),
      seg.text(` before ${stage} can be ${action === 'release' ? 'released' : 'promoted'}.`),
    ],
    rejectedRelease: (stage: string) => `the release in ${stage}`,
    /** Other gates that hold the promotion while it is reviewed. The review does not wait for them. */
    alsoHeldBy: (gates: readonly string[], canReview: boolean): CopySegment[] => [
      seg.text('The promotion also waits on '),
      ...listSegments(gates.map((gate) => [seg.code(gate)])),
      seg.text(canReview ? '. You can review it now.' : '.'),
    ],
    requestedOfYou: reviewCopy.requests.ofYouPanel,
    authorNeeds: (requirement: string, need: number, from: string): CopySegment[] => [
      seg.code(requirement),
      seg.text(` needs ${approvals(need)} from ${from}, since you wrote this change.`),
    ],
    authorGroupOnly: reviewCopy.author.groupOnly,
    ownApproved: (at: string, need: number) =>
      need > 0 ? `You approved at ${at}. ${need === 1 ? '1 more approval' : `${need} more approvals`} needed.` : `You approved at ${at}.`,
    /** Who satisfied the review, when the viewer's own approval is not among the decisions. */
    approvedBy: (names: readonly string[]) => `Approved by ${listText(names)}.`,
    moreNeeded: (need: number) => (need === 1 ? '1 more approval needed.' : `${need} more approvals needed.`),
    countsToward: reviewCopy.panel.countsToward,
    notEvaluated: reviewCopy.notEvaluated,
    serverChecksOnSubmit: reviewCopy.you.serverChecksOnSubmit,
    /** The viewer's own decision that the server does not count. */
    ownNotCounted: (choice: 'Pass' | 'Fail', at: string, type?: string, reasons: readonly string[] = []) => {
      const line = reviewCopy.you.ownNotCounted(choice, at);
      const why = reasons.length === 0 ? '' : ` ${reasons.join('. ')}.`;
      return `${line.lead}${type === undefined ? '' : ` (${type})`}${line.rest}${why}`;
    },
    /** The viewer wrote part of the change, and the requirements do not accept authors. */
    authorDoesNotCount: reviewCopy.caller.author,
    /** The viewer wrote part of the change, and the requirements accept authors. */
    authorMayApprove: reviewCopy.you.authorsMayApprove,
    reviewInfoLabel: 'About this review',
    signedOut: reviewCopy.you.signedOut,
    wouldNotCount: `Your decision would not count here. You wrote the change on every Unit it covers, and these requirements do not accept approvals from authors.`,
    outOfDate: reviewCopy.you.outOfDate,
    clearsWhen: (name: string) => `${reviewCopy.band.clearsWhen(name)}.`,
    clearsWhenAny: (name: string) => `${reviewCopy.band.clearsWhenAny(name)}.`,
    clearsWhenYou: 'Clears when you withdraw it, or the change is reviewed again.',
    quoteByline: (at: string, requirement: string): CopySegment[] => [seg.text(`${at}, on `), seg.code(requirement)],
    rejectionStands: reviewCopy.you.rejectionStands,
    rejectionStandsRest: reviewCopy.you.rejectionStandsRest,
    // Actions
    approve: 'Approve…',
    reject: 'Reject…',
    review: 'Review…',
    requestReview: 'Request review…',
    askAgain: (name: string) => `Ask ${name} to review again`,
    askedAgain: (name: string) => `Asked ${name} to review again, just now.`,
    withdraw: 'Withdraw rejection…',
    confirmWithdraw: 'Confirm withdraw',
    changeMyDecision: reviewCopy.you.changeMyDecision,
    cancel: 'Cancel',
    // The form
    reasonLabel: (required: boolean) => (required ? 'Reason (required)' : 'Note (optional)'),
    placeholderPass: reviewCopy.form.placeholderPass,
    placeholderFail: reviewCopy.form.placeholderFail,
    coverageHelp: (coverage: string) => `Covers ${coverage}.`,
    coverageSummary: reviewCopy.panel.coverageSummary,
    counter: reviewCopy.form.counter,
    reasonMissing: 'Add a reason first.',
    submitApproval: 'Submit approval',
    submitRejection: 'Submit rejection',
    submitting: 'Submitting…',
    nothingRecordable: reviewCopy.coverage.nothingRecordable,
    // The request picker
    requestFrom: 'Request from',
    requestSubmit: 'Request review',
    requestedFrom: (names: string) => `Requested from ${names}, just now.`,
    requested: reviewCopy.requests.requested,
    // The review as a line of the Stage log
    yourReview: 'Your review',
    yourReleaseReview: 'Your release review',
    needed: 'Needed',
    canApproveToo: (names: string) => `${names} can approve too.`,
    anyoneCanApproveToo: 'Anyone with Approve can approve too.',
    needsMore: (n: number) => (n === 1 ? 'Needs 1 more approval.' : `Needs ${n} more approvals.`),
    reviewName: 'Review',
    waitingFor: (names: string) => `Waiting for ${names}`,
    youWroteIt: 'You wrote this change.',
    reviewAgain: 'Review again',
    canWithdraw: (name: string) => `${name} can withdraw, or someone approves`,
    youCanWithdraw: 'You can withdraw, or someone approves',
    compactLabel: (approve: boolean, required: boolean) => `${approve ? 'Approve' : 'Reject'}: ${required ? 'reason (required)' : 'note (optional)'}`,
    compactHint: 'Everyone on this ChangeOrder sees the reason.',
    compactSubmit: (approve: boolean) => (approve ? 'Approve' : 'Reject'),
    compactRequest: 'Request review',
    compactAskAgain: 'Ask again',
  },

  // ── Reviews in the sidebar ──────────────────────────────────────────────
  reviewRow: {
    needs: (need: number) => `needs ${approvals(need)}`,
    approvedBy: (names: readonly string[]) => `approved by ${listText(names)}`,
    approvedByYou: 'approved by you',
    rejectedBy: (name: string) => `rejected by ${name}`,
    rejectedByYou: 'rejected by you',
    notEvaluated: reviewCopy.notEvaluated.short,
    notEvaluatedWhy: reviewCopy.notEvaluatedShort,
    notLanded: (subject: string) => `Opens once ${subject} is promoted`,
    countsTowardGateInto: (stage: { stageId: string; name: string }): CopySegment[] => [
      seg.text('counts toward the gate into '),
      seg.link(stage.name, { to: 'stage', stageId: stage.stageId }),
    ],
    quotedAbove: 'quoted above',
    askedAgainJustNow: 'Asked again just now',
    details: 'Review details',
    reviewedIn: reviewCopy.stage.reviewedIn,
    copyLink: reviewCopy.author.copyLink,
    statusNotReviewed: 'Not reviewed yet',
    statusRequested: 'Requested',
    statusApproved: (at: string | undefined, now: number) => (at === undefined ? 'Approved' : `Approved ${agoText(at, now)}`),
    statusRejected: (at: string | undefined, now: number) => (at === undefined ? 'Rejected' : `Rejected ${agoText(at, now)}`),
    andMore: (k: number) => `and ${k} more`,
  },

  // ── Sidebar ─────────────────────────────────────────────────────────────
  sidebar: {
    gates: 'Gates',
    gatesNone: 'None',
    checkingGates: 'Checking gates…',
    definedIn: 'Defined in',
    noWorkflow: 'No workflow',
    reviewsOfChange: 'Reviews of this change',
    entryGate: 'Entry gate',
    releaseGate: 'Release gate',
    notEvaluated: 'Not evaluated',
    evaluatedOver: (spaces: string) => `Evaluated over ${spaces}.`,
    spaces: 'Spaces',
    showAll: (n: number) => `Show all ${n}`,
    targets: 'Targets',
    targetCount: (n: number) => plural(n, 'Target'),
    targetsEarlier: (n: number) => `${plural(n, 'Target')} still ${n === 1 ? 'runs' : 'run'} the earlier revision.`,
    targetsRun: (n: number) => `${plural(n, 'Target')} ${n === 1 ? 'runs' : 'run'} this change.`,
    targetsNone: 'None',
  },

  /** The chip a Space carries in the sidebar. */
  mark: {
    differs: 'Differs',
    keeps: (value: string) => `Keeps ${value}`,
    refuses: 'Refuses',
    adds: 'Adds',
    unknown: 'Unknown',
    hasIt: 'Has it',
    failed: 'Failed',
    promoted: 'Promoted',
  },

  // ── The change card ─────────────────────────────────────────────────────
  change: {
    titleBefore: 'What this promotion writes',
    titleAfter: 'What the change wrote',
    scopeIn: (base: NamedSpace): CopySegment[] => [seg.text('In '), spaceLink(base)],
    scopeMadeIn: (sources: readonly NamedSpace[]): CopySegment[] => [seg.text('Made in '), ...spaceListSegments(sources)],
    scopeSpaces: (n: number) => plural(n, 'Space'),
    scopeSameEverywhere: (n: number) => `Same in all ${plural(n, 'Space')}`,
    scopeWritten: (written: number, total: number) => `Written to ${written} of ${plural(total, 'Space')}`,
    nothing: 'No field changes here.',
    reading: 'Reading the change…',
    unreadable: 'Could not read the change.',
    /** A stage the change has not reached: what it will take is shown once the stage before has it. */
    notReached: (previous: { stageId: string; name: string }, sourceFieldCount?: number): CopySegment[] => [
      seg.text('Shown once '),
      seg.link(previous.name, { to: 'stage', stageId: previous.stageId }),
      seg.text(' has the change.'),
      ...(sourceFieldCount === undefined || sourceFieldCount === 0
        ? []
        : [seg.text(` ${plural(sourceFieldCount, 'field')} at the source.`)]),
    ],
  },

  // ── The diff card ───────────────────────────────────────────────────────
  diff: {
    partial: (stage: string) => `Some Spaces in ${stage} hold no resources yet.`,
    omitted: (n: number) =>
      n === 1
        ? '1 resource not compared.'
        : `${n} resources not compared.`,
    undecided: (n: number) =>
      n === 1
        ? '1 resource is in more than one namespace; not compared.'
        : `${n} resources are in more than one namespace; not compared.`,
    shortfall: (n: number) =>
      `${n} unaccounted for in the groups (UI defect).`,
  },
} as const;
