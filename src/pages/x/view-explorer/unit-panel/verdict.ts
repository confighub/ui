// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { gateLabel, type RowFacts } from './attention';
import { type ConflictLike, splitConflicts } from './conflicts';
import { ACTION, CAUSE, DETAIL, FACT, FIX, HEADLINE, PRIMARY, VERDICT_SECTION, relativeTime } from './copy';
import { type GateCheck, type GateCheckState, gateCheckText } from './gate-check';
import type { Tone } from './tones';

/**
 * The row panel's answer to "what is the state of this Unit, and what do I do
 * next", as a pure function of the row, what was read for the open Unit, and
 * where the Unit sits in the view. The views only draw the result.
 *
 * Causes, in order: withheld conflicts, a failed last action, gates that
 * fail, gates being checked, needs that are not met, unreleased revisions, an
 * upstream that is ahead. Conflicts kept by a local override, an older
 * failure and gate warnings are facts, never causes.
 */

export type ActionId =
  | 'review-conflicts'
  | 'see-events'
  | 'check-gate'
  | 'edit-config'
  | 'see-diff'
  | 'preview-upgrade'
  | 'open-links'
  | 'restore'
  | 'restore-history'
  | 'release-space'
  | 'run-function'
  | 'upgrade'
  | 'next-problem';

export type CauseKind = 'conflicts' | 'failed' | 'gate' | 'checking' | 'needs' | 'unreleased' | 'upstream';
export type FactKind = 'kept' | 'failed-earlier' | 'warnings' | 'release';

/** The live status of the Release the Unit's Space runs, as its deploying tool reports it. */
export interface ReleaseLive {
  num: number;
  /** In the normalized words: "Synced · Healthy". */
  status: string;
  tone: Tone;
  reporter?: string;
  observedAt?: string;
}

/** What was read for the open Unit itself; the row has none of it. */
export interface FetchedDetails {
  status: 'loading' | 'error' | 'ready';
  conflicts?: readonly ConflictLike[];
  /** The Unit's latest event. */
  event?: { status?: string; action?: string; revisionNum?: number; message?: string; at?: string };
  linkFindings?: readonly { Reason?: string; Path?: string }[];
  /** Per failing gate: the first failing path and message. */
  gateDetails?: Readonly<Record<string, { path?: string; message?: string }>>;
  /** Per gate: the Trigger that checks it, so it can be checked again. */
  triggerIds?: Readonly<Record<string, string>>;
  /**
   * The Space's release Target and Component, from the row; the Component's
   * slug, which the link to it needs, is read only while there is something to
   * release. `componentError`: that read failed.
   */
  space?: { releaseTargetId?: string; componentId?: string; componentSlug?: string; componentError?: boolean };
  headRevision?: { author?: string };
  /** Gate warnings, by name. */
  warnings?: readonly string[];
  /** Absent when the Space runs no Release, or its deploying tool has not reported on it. */
  release?: ReleaseLive;
  /** The Unit no longer exists: nothing runs on it. */
  gone?: boolean;
}

export interface NextProblem {
  id: string;
  slug: string;
  /** The group it is in, when that is not the open Unit's group. */
  groupLabel?: string;
}

export interface VerdictContext {
  nextProblem: NextProblem | null;
  /** The layout has a row selection (a Units Table). */
  selectionEnabled: boolean;
  pickedCount: number;
  isPicked: boolean;
  /** A filter hides the open Unit from the table, so it cannot be picked there. */
  hidden?: boolean;
  /** The Units of the Space with revisions to release, which its Release would include. */
  releaseReach?: number;
  now: number;
}

export interface VerdictInput {
  row: RowFacts;
  fetched: FetchedDetails;
  context: VerdictContext;
  /** The gates checked again from the panel, by name; a gate not checked is absent. */
  checks?: Readonly<Record<string, GateCheck>>;
}

export interface Fix {
  action: ActionId;
  label: string;
  /** The accessible name, which says which cause it fixes. */
  name: string;
  /** What the action runs on, when the cause is one of several of its kind: the gate. */
  arg?: string;
}

/** One cause or fact: a mark in its tone, a title (with a code-font subject), a detail line, a fix. */
export interface PanelLine {
  key: string;
  kind: CauseKind | FactKind;
  tone: Tone;
  title: string;
  subject?: string;
  /**
   * Under the subject, quieter: where it comes from (a gate's Trigger, and its
   * Space when that is not the Unit's), cut short if long; `subjectTitle` is
   * the whole name.
   */
  subjectContext?: string;
  subjectTitle?: string;
  detail?: string;
  fix?: Fix;
  /** A short note at the end of the line, such as when it was reported. */
  meta?: string;
  /** The detail is not someone's words (a change described only by its kind): drawn quieter. */
  detailMuted?: boolean;
  /** A gate checked again from the panel: how the check went. */
  check?: { state: GateCheckState; text: string };
}

export interface PrimaryAction {
  /** Null while the details load: the button shows, disabled, so it does not move when they arrive. */
  id: ActionId | null;
  label: string;
  why: string;
  enabled: boolean;
}

export interface ActionState {
  id: ActionId;
  label: string;
  hint: string;
  key?: string;
  enabled: boolean;
  /** Why it is disabled. */
  reason?: string;
}

export interface Verdict {
  tone: Tone;
  headline: string;
  detail: string;
  /** The heading of the section that holds the verdict. */
  section: string;
  /** `targeted`: a Release can include the Unit, so "never released" means something. */
  revs: { head: number; released: number; targeted: boolean };
  causes: PanelLine[];
  facts: PanelLine[];
  primary: PrimaryAction | null;
  secondary: ActionState[];
  /** The details are not read yet, or could not be: the verdict rests on the row alone. */
  provisional: boolean;
}

const sentence = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');

// The rules of `isUpgradable` (model/fields.ts) and `unreleasedCount` (attention.ts), on the plain facts the verdict
// reads rather than on the API's row, so the verdict can be built and tested from facts alone.
function isUpgradable(row: RowFacts): boolean {
  return row.upstreamRev > 0 && row.upstreamHead !== undefined && row.upstreamRev < row.upstreamHead;
}

function unreleasedOf(row: RowFacts): number {
  return row.targetId ? Math.max(0, row.head - row.released) : 0;
}

/** A failed event counts as a cause only while it is about the head revision (or names none). */
function failedEvent(fetched: FetchedDetails, head: number): { current: boolean } | null {
  const e = fetched.event;
  if (e?.status !== 'Failed') return null;
  return { current: e.revisionNum === undefined || e.revisionNum >= head };
}

/** Whether "Release <Space>" can run, and why not; null when the Space is not known yet. */
export function releaseState(row: RowFacts, fetched: FetchedDetails): { enabled: boolean; reason?: string } | null {
  const space = fetched.space;
  if (!space) return null;
  if (!space.releaseTargetId) return { enabled: false, reason: ACTION.releaseOff.noReleaseTarget };
  if (!space.componentId) return { enabled: false, reason: ACTION.releaseOff.notComponent };
  if (row.targetId !== space.releaseTargetId) return { enabled: false, reason: ACTION.releaseOff.otherTarget };
  if (row.gateNames.length > 0) return { enabled: false, reason: ACTION.releaseOff.gate };
  if (space.componentError) return { enabled: false, reason: ACTION.releaseOff.componentUnread };
  // The link needs the Component's slug: until it is read, Release cannot open.
  if (!space.componentSlug) return null;
  return { enabled: true };
}

/** The failing gates that have a Trigger to check them again. */
function checkableGates(row: RowFacts, fetched: FetchedDetails): string[] {
  return row.gateNames.filter((g) => !!fetched.triggerIds?.[g]);
}

function causesOf(row: RowFacts, fetched: FetchedDetails, checks: VerdictInput['checks'], now: number): PanelLine[] {
  const causes: PanelLine[] = [];
  const unreleased = unreleasedOf(row);

  const { withheld } = splitConflicts(fetched.conflicts);
  if (withheld.length) {
    causes.push({
      key: 'conflicts',
      kind: 'conflicts',
      tone: 'blocked',
      title: CAUSE.conflicts(withheld.length),
      detail: CAUSE.conflictsDetail(withheld.map((c) => c.Path).filter((p): p is string => !!p)) || undefined,
      fix: { action: 'review-conflicts', ...FIX.reviewConflicts },
    });
  }

  if (failedEvent(fetched, row.head)?.current) {
    causes.push({
      key: 'failed',
      kind: 'failed',
      tone: 'blocked',
      title: CAUSE.failed(fetched.event?.action, fetched.event?.revisionNum, relativeTime(fetched.event?.at, now)),
      // The message is the verdict's own detail when the failure is the headline; under conflicts it stays here.
      detail: withheld.length ? fetched.event?.message || undefined : undefined,
      fix: { action: 'see-events', ...FIX.seeEvents },
    });
  }

  for (const gate of row.gateNames) {
    const recheck = !!fetched.triggerIds?.[gate];
    const label = gateLabel(gate, row.spaceSlug);
    const detail = fetched.gateDetails?.[gate]?.message || (unreleased > 0 ? CAUSE.gateBlocksRelease : undefined);
    // A check that fails for the reason the line already gives does not repeat it.
    const checked = checks?.[gate];
    const check = checked?.state === 'failed' && checked.message === detail ? { state: checked.state } : checked;
    causes.push({
      key: `gate:${gate}`,
      kind: 'gate',
      tone: 'gated',
      title: CAUSE.gate,
      // The gate's own name first, so it never breaks inside a word; where it comes from under it.
      subject: label.split('/').pop(),
      subjectContext: label.includes('/') ? label.slice(0, label.lastIndexOf('/')) : undefined,
      subjectTitle: gate,
      detail,
      // While its check runs, the line shows that in place of the link that started it.
      fix:
        check?.state === 'running'
          ? undefined
          : recheck
            ? { action: 'check-gate', ...FIX.checkGate(label), arg: gate }
            : { action: 'edit-config', ...FIX.editAt(label) },
      check: check ? { state: check.state, text: gateCheckText(check) } : undefined,
    });
  }

  if (row.checking) {
    causes.push({ key: 'checking', kind: 'checking', tone: 'info', title: CAUSE.checking, detail: CAUSE.checkingDetail });
  }

  const findings = fetched.linkFindings ?? [];
  if (findings.length) {
    causes.push({
      key: 'needs',
      kind: 'needs',
      tone: 'attention',
      title: CAUSE.needs(findings.length),
      detail: CAUSE.conflictsDetail(findings.map((f) => f.Path).filter((p): p is string => !!p)) || undefined,
      fix: { action: 'open-links', ...FIX.openLinks },
    });
  }

  if (unreleased > 0) {
    const last = row.lastChange;
    causes.push({
      key: 'unreleased',
      kind: 'unreleased',
      tone: 'attention',
      title: CAUSE.unreleased(row.released + 1, row.head),
      detail: last ? CAUSE.lastChange(last.description, relativeTime(last.at, now), fetched.headRevision?.author, last.source) : undefined,
      detailMuted: !!last && !last.description,
      // The diff is from the released revision; a Unit never released has none to compare with.
      fix: row.released > 0 ? { action: 'see-diff', ...FIX.seeDiff } : undefined,
    });
  }

  if (isUpgradable(row)) {
    causes.push({
      key: 'upstream',
      kind: 'upstream',
      tone: 'upgrade',
      title: CAUSE.upstream(row.upstreamHead ?? 0, row.upstreamRev),
      detail: [row.upstreamSpaceSlug, row.upstreamSlug].filter(Boolean).join('/') || undefined,
      fix: { action: 'preview-upgrade', ...FIX.previewUpgrade },
    });
  }
  return causes;
}

function factsOf(row: RowFacts, fetched: FetchedDetails, now: number): PanelLine[] {
  const facts: PanelLine[] = [];
  const { kept } = splitConflicts(fetched.conflicts);
  if (kept.length) {
    facts.push({
      key: 'kept',
      kind: 'kept',
      tone: 'muted',
      title: FACT.kept(kept.length),
      detail: CAUSE.conflictsDetail(kept.map((c) => c.Path).filter((p): p is string => !!p)) || undefined,
    });
  }
  const failed = failedEvent(fetched, row.head);
  if (failed && !failed.current) {
    facts.push({
      key: 'failed-earlier',
      kind: 'failed-earlier',
      tone: 'muted',
      title: FACT.failedEarlier(fetched.event?.revisionNum),
      detail: fetched.event?.message || undefined,
    });
  }
  if (fetched.warnings?.length) {
    facts.push({ key: 'warnings', kind: 'warnings', tone: 'info', title: FACT.warnings(fetched.warnings.length), detail: fetched.warnings.join(', ') });
  }
  const release = fetched.release;
  if (release) {
    facts.push({
      key: 'release',
      kind: 'release',
      tone: release.tone,
      title: FACT.release(release.num, row.spaceSlug, release.status),
      detail: FACT.releaseBy(release.reporter),
      meta: relativeTime(release.observedAt, now) || undefined,
    });
  }
  return facts;
}

const has = (causes: readonly PanelLine[], kind: CauseKind) => causes.some((c) => c.kind === kind);

function headlineOf(row: RowFacts, fetched: FetchedDetails, causes: readonly PanelLine[], now: number): { tone: Tone; headline: string; detail: string } {
  const unreleased = unreleasedOf(row);
  const gates = row.gateNames.length;
  const upgradable = isUpgradable(row);
  const shownByRow = gates > 0 || row.checking || unreleased > 0 || upgradable;
  const upstreamLine = upgradable && DETAIL.upstreamAhead(row.upstreamRev, row.upstreamHead ?? 0);
  const notReleased = unreleased > 0 && DETAIL.notReleased(row.released + 1, row.head);

  // Never "Nothing to do" before the details are read.
  if (fetched.status === 'loading' && !shownByRow) return { tone: 'muted', headline: HEADLINE.checking, detail: DETAIL.loading };
  if (has(causes, 'conflicts'))
    return { tone: 'blocked', headline: HEADLINE.conflicts(splitConflicts(fetched.conflicts).withheld.length), detail: DETAIL.conflicts };
  if (has(causes, 'failed')) return { tone: 'blocked', headline: HEADLINE.failed(row.head), detail: fetched.event?.message || DETAIL.failed };
  if (gates > 0)
    return {
      tone: 'gated',
      headline: unreleased > 0 ? HEADLINE.gateBlocks(row.head) : HEADLINE.gateFails(gates, row.head),
      detail: sentence(DETAIL.gatesFail(gates), unreleased > 0 && DETAIL.whenGatesPass(gates, unreleased)),
    };
  if (row.checking) return { tone: 'info', headline: HEADLINE.gatesChecking(row.head), detail: sentence(DETAIL.checking, notReleased) };
  if (has(causes, 'needs')) return { tone: 'attention', headline: HEADLINE.needs, detail: sentence(notReleased, upstreamLine) };
  if (unreleased > 0)
    return { tone: 'attention', headline: HEADLINE.unreleased(row.head), detail: sentence(DETAIL.noGateFails, notReleased, upstreamLine) };
  if (upgradable) return { tone: 'upgrade', headline: HEADLINE.upgrade(row.upstreamHead ?? 0), detail: sentence(DETAIL.noGateFails, upstreamLine) };
  if (!row.targetId) return { tone: 'muted', headline: HEADLINE.untargeted, detail: DETAIL.untargeted };
  if (fetched.status === 'error') return { tone: 'muted', headline: HEADLINE.unconfirmed, detail: DETAIL.unconfirmed };
  const upstream = [row.upstreamSpaceSlug, row.upstreamSlug].filter(Boolean).join('/');
  const last = row.lastChange;
  return {
    tone: 'ok',
    headline: HEADLINE.released(row.head),
    detail: sentence(
      DETAIL.noGateFails,
      row.upstreamRev > 0 && !!upstream && DETAIL.matchesUpstream(upstream, row.upstreamRev),
      last && DETAIL.lastChange(relativeTime(last.at, now), last.description, fetched.headRevision?.author, last.source),
    ),
  };
}

/**
 * The primary is the action of the first cause, so it always answers the
 * headline: the other causes' actions stay among the other actions. A cause
 * whose action cannot run here (gates being checked; revisions the Space
 * cannot release from here) has no primary. A healthy Unit's primary is the
 * way to the next Unit that needs attention.
 */
function primaryOf(row: RowFacts, input: VerdictInput, causes: readonly PanelLine[]): PrimaryAction | null {
  const { fetched, context, checks } = input;
  if (fetched.gone) return null;
  // The details may add a cause that comes first, so nothing runs until they are read.
  if (fetched.status !== 'ready') return { id: null, ...(fetched.status === 'loading' ? PRIMARY.checking : PRIMARY.unread), enabled: false };
  const first = causes[0]?.kind;
  switch (first) {
    case undefined:
      return context.nextProblem ? { id: 'next-problem', ...PRIMARY.nextProblem(context.nextProblem.slug), enabled: true } : null;
    case 'conflicts':
      return { id: 'review-conflicts', ...PRIMARY.reviewConflicts, enabled: true };
    case 'failed':
      return { id: 'see-events', ...PRIMARY.seeEvents, enabled: true };
    case 'gate': {
      const checkable = checkableGates(row, fetched);
      if (checkable.length) {
        const running = checkable.some((g) => checks?.[g]?.state === 'running');
        return running
          ? { id: 'check-gate', ...PRIMARY.checkingGate(checkable.length), enabled: false }
          : { id: 'check-gate', ...PRIMARY.checkGate(checkable.length), enabled: true };
      }
      const path = row.gateNames.map((g) => fetched.gateDetails?.[g]?.path).find(Boolean);
      return { id: 'edit-config', ...PRIMARY.editConfig(path), enabled: true };
    }
    case 'checking':
      return null;
    case 'needs':
      return { id: 'open-links', ...PRIMARY.openLinks, enabled: true };
    case 'unreleased':
      return releaseState(row, fetched)?.enabled ? { id: 'release-space', ...PRIMARY.release(row.spaceSlug, context.releaseReach), enabled: true } : null;
    case 'upstream':
      return { id: 'preview-upgrade', ...PRIMARY.previewUpgrade, enabled: true };
    default:
      return null;
  }
}

function secondaryOf(row: RowFacts, input: VerdictInput, primary: PrimaryAction | null): ActionState[] {
  const { fetched, context } = input;
  const restoreDirect = row.head > row.released && row.released > 0;
  const restore: ActionState = restoreDirect
    ? { id: 'restore', ...ACTION.restore(row.released, row.head), key: 'r', enabled: true }
    : { id: 'restore-history', ...ACTION.restoreHistory, key: 'r', enabled: true };
  const list: ActionState[] = [];
  // The actions of the causes first, in cause order.
  if (failedEvent(fetched, row.head)?.current) list.push(restore);
  if (isUpgradable(row)) list.push({ id: 'upgrade', ...ACTION.upgrade(row.upstreamRev, row.upstreamHead ?? 0), key: 'u', enabled: true });
  list.push(
    !context.selectionEnabled
      ? { id: 'run-function', ...ACTION.runFunction(0, false), key: 'f', enabled: false, reason: ACTION.runFunctionOff }
      : context.hidden
        ? { id: 'run-function', label: ACTION.runFunction(0, false).label, hint: ACTION.runFunctionHiddenHint, key: 'f', enabled: false, reason: ACTION.runFunctionHidden }
        : { id: 'run-function', ...ACTION.runFunction(context.pickedCount, context.isPicked), key: 'f', enabled: true },
    { id: 'edit-config', ...ACTION.editConfig, key: 'e', enabled: true },
    restore,
  );
  const release = releaseState(row, fetched);
  if (release && unreleasedOf(row) > 0) list.push({ id: 'release-space', ...ACTION.release(row.spaceSlug, context.releaseReach), ...release });
  const seen = new Set<ActionId>();
  return list.filter((a) => {
    if (a.id === primary?.id || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

function sectionOf(row: RowFacts, tone: Tone, causes: readonly PanelLine[]): string {
  if (causes.length === 0) return VERDICT_SECTION.status;
  if (unreleasedOf(row) > 0) return VERDICT_SECTION.notReleased;
  return tone === 'blocked' || tone === 'gated' ? VERDICT_SECTION.needsFix : VERDICT_SECTION.attention;
}

export function buildVerdict(input: VerdictInput): Verdict {
  const { row, fetched, context } = input;
  const causes = causesOf(row, fetched, input.checks, context.now);
  const { tone, headline, detail } = headlineOf(row, fetched, causes, context.now);
  const primary = primaryOf(row, input, causes);
  // The primary says "See events" already: the line does not say it again.
  if (primary?.id === 'see-events') for (const c of causes) if (c.fix?.action === 'see-events') delete c.fix;
  return {
    tone,
    headline,
    detail,
    section: sectionOf(row, tone, causes),
    revs: { head: row.head, released: row.released, targeted: !!row.targetId },
    causes,
    facts: factsOf(row, fetched, context.now),
    primary,
    secondary: secondaryOf(row, input, primary),
    provisional: fetched.status !== 'ready',
  };
}
