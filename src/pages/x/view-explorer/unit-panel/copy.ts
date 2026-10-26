// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { STATUS_LABEL } from '../model/fields';
import type { StatusKind } from '../model/types';

/**
 * Every text the row panel of a Unit shows, in one place, so the wording can
 * change without touching the rules (`verdict.ts`) or the views.
 */

/** "1 gate", "2 gates". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "43", or "42–43" for more than one revision. */
export function revRange(from: number, to: number): string {
  return from >= to ? String(to) : `${from}–${to}`;
}

/** "now", "5 min ago", "3 h ago", "2 days ago"; '' for no time. */
export function relativeTime(at: string | undefined, now: number): string {
  if (!at) return '';
  const t = Date.parse(at);
  // Go writes an unset time as year 1.
  if (Number.isNaN(t) || t <= 0) return '';
  const minutes = Math.floor(Math.max(0, now - t) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return count(days, 'day') + ' ago';
  const months = Math.floor(days / 30);
  if (months < 24) return count(months, 'month') + ' ago';
  return count(Math.floor(days / 365), 'year') + ' ago';
}

export const HEADLINE = {
  checking: 'Checking…',
  conflicts: (n: number) => `Needs a decision: ${count(n, 'change was', 'changes were')} not applied`,
  failed: (head: number) => `Last action failed on rev ${head}`,
  gateBlocks: (head: number) => `Blocked: rev ${head} cannot release`,
  gateFails: (n: number, head: number) => `${n === 1 ? 'A gate fails' : `${n} gates fail`} on rev ${head}`,
  gatesChecking: (head: number) => `Checking gates on rev ${head}`,
  needs: 'Needs from upstream are not met',
  unreleased: (head: number) => `Ready to release: rev ${head} is not released`,
  upgrade: (upstreamHead: number) => `Upgrade available: upstream is at rev ${upstreamHead}`,
  untargeted: 'Not targeted: no Release includes this Unit',
  released: (head: number) => `Nothing to do: rev ${head} is released`,
  unconfirmed: 'Could not confirm: details did not load',
} as const;

export const DETAIL = {
  loading: "Reading the Unit's details.",
  gatesFail: (n: number) => (n === 1 ? '1 gate fails.' : `${n} gates fail.`),
  whenGatesPass: (gates: number, unreleased: number) =>
    `When ${gates === 1 ? 'it passes' : 'they pass'}, ${count(unreleased, 'revision is', 'revisions are')} ready to release.`,
  checking: 'The gates have not finished checking the latest revision.',
  noGateFails: 'No gate fails.',
  notReleased: (from: number, to: number) => (from >= to ? `Rev ${to} is not released yet.` : `Revisions ${revRange(from, to)} are not released yet.`),
  upstreamAhead: (merged: number, head: number) => `This Unit merged rev ${merged}; upstream is ${count(head - merged, 'revision')} ahead.`,
  matchesUpstream: (where: string, rev: number) => `It matches upstream ${where} rev ${rev}.`,
  lastChange: (when: string, description?: string, author?: string, source?: string) => {
    const by = author ? ` by ${author}` : '';
    const at = when ? ` ${when}` : '';
    if (description) return `Last change${at}${by}: "${description}".`;
    return source ? `Last change${at}${by} (${source}).` : `Last changed${at}${by}.`;
  },
  untargeted: 'Give it a Target to release it.',
  unconfirmed: 'The row shows no problem, but conflicts and events could not be checked.',
  conflicts: 'Each one waits for someone to apply or dismiss it.',
  /** The failure's own message is on its cause line, just below. */
  failed: 'It left no message.',
} as const;

/** The heading of the section that holds the verdict. */
export const VERDICT_SECTION = {
  notReleased: 'Why it is not released',
  needsFix: 'What needs a fix',
  attention: 'What needs attention',
  status: 'Status',
} as const;

export const ACTIONS_SECTION = { withPrimary: 'Other actions', alone: 'Actions' } as const;

export const CAUSE = {
  conflicts: (n: number) => `${count(n, 'change')} withheld`,
  conflictsDetail: (paths: string[]) => (paths.length ? paths.slice(0, 3).join(', ') + (paths.length > 3 ? `, and ${paths.length - 3} more` : '') : ''),
  failed: (action: string | undefined, rev?: number, when?: string) =>
    `${action || 'The last action'} failed${rev ? ` on rev ${rev}` : ''}${when ? ` · ${when}` : ''}`,
  gate: 'Gate',
  gateBlocksRelease: 'Blocks the release until it passes',
  checking: 'Gates are being checked',
  checkingDetail: 'The result shows when the check ends',
  needs: (n: number) => `${count(n, 'need')} not met`,
  unreleased: (from: number, to: number) =>
    from >= to ? `1 unreleased revision, ${to}` : `${count(to - from + 1, 'unreleased revision')}, ${revRange(from, to)}`,
  lastChange: (description: string | undefined, when: string, author?: string, source?: string) =>
    description
      ? [`last: "${description}"`, author, when].filter(Boolean).join(', ')
      : `last change${when ? ` ${when}` : ''}${author ? ` by ${author}` : ''}${source ? ` (${source})` : ''}`,
  upstream: (head: number, merged: number) => `Upstream is ahead: rev ${head}, this Unit merged ${merged}`,
} as const;

export const FACT = {
  kept: (n: number) => `${count(n, 'value')} kept by a local override`,
  failedEarlier: (rev?: number) => `An earlier action failed${rev ? ` on rev ${rev}` : ''}`,
  warnings: (n: number) => `${count(n, 'gate warning')}, which ${n === 1 ? 'does' : 'do'} not block`,
  release: (num: number, space: string, status: string) => `Release ${num} of ${space}: ${status}`,
  /** The live status is the Release's, which every Unit of the Space shares. */
  releaseBy: (reporter?: string) => `reported${reporter ? ` by ${reporter}` : ''} for the Release, not for this Unit`,
} as const;

/** The state of the read of the open Unit's own details. */
export const DETAILS = {
  loading: 'Reading details…',
  error: 'Details could not be read',
  /** The Unit was read, but not its Space's Component, which Release needs. */
  componentError: 'The Component of this Space could not be read',
  gone: 'This Unit no longer exists',
  retry: 'Retry',
  retryName: 'Read the details again',
} as const;

/**
 * The result of checking a gate again from the panel. The check shows what the
 * gate says of the current config; it does not change the stored result, so a
 * pass does not unblock a Release until the Unit's next change runs the gate.
 */
export const CHECK = {
  running: 'Checking…',
  passed: 'Passes now. The stored result stays until the Unit next changes.',
  failed: (message?: string) => (message ? `Still fails: ${message}` : 'Still fails'),
  error: (message?: string) => `Could not check: ${message || 'unknown error'}`,
  noResult: 'The gate returned no result',
} as const;

/** The diff of the unreleased revisions, in its dialog. */
export const DIFF = {
  title: (from: number, to: number) => `Unreleased changes: rev ${from} → ${to}`,
  sub: (slug: string) => `${slug}, from the released revision to the head`,
  loading: 'Reading the diff…',
  error: 'The diff could not be read',
  retry: 'Retry',
  none: 'No changes',
  noneDetail: 'The head has the same config as the released revision.',
  close: 'Close',
} as const;

/** The upgrade preview, in its dialog: a dry run, which writes nothing; "Upgrade…" goes on to the confirm. */
export const PREVIEW = {
  title: (from: number, to: number) => `Upgrade preview: upstream rev ${from} → ${to}`,
  sub: (slug: string, upstream?: string) => `${slug}${upstream ? `, from ${upstream}` : ''}. A dry run: nothing is written.`,
  loading: 'Running the dry run…',
  error: 'The preview could not be read',
  retry: 'Retry',
  missing: 'The dry run did not cover this Unit',
  refused: (message?: string) => `The upgrade would fail: ${message || 'unknown error'}`,
  none: 'No changes',
  noneDetail: "The upgrade changes nothing in this Unit's config.",
  withheld: (n: number) => `${count(n, 'change')} would not be applied`,
  kept: (n: number) => `${count(n, 'value')} kept by a local override`,
  close: 'Close',
  upgrade: 'Upgrade…',
  upgradeHint: 'Asks you to confirm',
  previewAgain: 'Preview again',
  /** Why "Upgrade…" is off, beside it. */
  blocked: {
    stale: 'The upstream changed; preview again',
    failed: 'The preview could not be read',
    loading: 'Waiting for the dry run',
    missing: 'The dry run did not cover this Unit',
    refused: 'The dry run says the upgrade would fail',
  },
} as const;

/** The fix link on a cause, and its accessible name, which says which cause it fixes. */
export const FIX = {
  reviewConflicts: { label: 'Review', name: 'Review the conflicts' },
  seeEvents: { label: 'See events', name: 'See the events' },
  checkGate: (gate: string) => ({ label: 'Check again', name: `Check again, gate ${gate}` }),
  editAt: (gate: string) => ({ label: 'Edit config', name: `Edit config, gate ${gate}` }),
  openLinks: { label: 'Open Links', name: 'Open the Links of this Unit' },
  seeDiff: { label: 'See diff', name: 'See the diff of the unreleased revisions' },
  previewUpgrade: { label: 'Preview', name: 'Preview the upgrade from upstream' },
} as const;

/** "Release payments-prod (3 Units)": the reach of a Release is the Space's Units with revisions to release. */
function releaseLabel(space: string, reach?: number): string {
  return reach ? `Release ${space} (${count(reach, 'Unit')})` : `Release ${space}`;
}

export const PRIMARY = {
  checking: { label: 'Checking…', why: "Reading the Unit's details." },
  unread: { label: 'Unavailable', why: "The Unit's details could not be read, so the next step is not known." },
  reviewConflicts: { label: 'Review conflicts', why: 'Conflicts come first: they need a decision.' },
  seeEvents: { label: 'See events', why: 'A failed action comes first.' },
  // The same words as the gate line's own link: one verb for one action.
  checkGate: (n: number) => ({ label: 'Check again', why: n === 1 ? 'The gate is the first blocker.' : 'The gates are the first blockers.' }),
  checkingGate: (n: number) => ({ label: n === 1 ? 'Checking the gate…' : 'Checking the gates…', why: 'The check runs on the current config.' }),
  editConfig: (path?: string) => ({
    label: path ? `Edit at ${path}` : 'Edit config',
    why: 'The gate cannot be checked from here, so fix the config.',
  }),
  release: (space: string, reach?: number) => ({ label: releaseLabel(space, reach), why: 'No gate fails, so the Space can release.' }),
  previewUpgrade: { label: 'Preview upgrade', why: 'See what changes before you upgrade.' },
  openLinks: { label: 'Open Links', why: 'A need is not met.' },
  nextProblem: (slug: string) => ({ label: `Go to ${slug}`, why: 'The next Unit that needs attention.' }),
} as const;

export const ACTION = {
  upgrade: (merged: number, head: number) => ({ label: 'Upgrade from upstream', hint: `${merged} → ${head} · preview first` }),
  runFunction: (picked: number, isPicked: boolean) => ({
    label: 'Run a Function',
    hint:
      picked > 0 && !isPicked
        ? `Adds this Unit to the ${picked} picked, then opens Functions`
        : picked > 1
          ? `Opens the Functions panel for the ${picked} picked Units`
          : 'Opens the Functions panel for this Unit',
  }),
  runFunctionOff: 'Use the Table layout',
  runFunctionHidden: 'Hidden by the filter',
  /** Only a row the table shows can be picked. */
  runFunctionHiddenHint: 'Only a Unit the table shows can be picked',
  editConfig: { label: 'Edit config', hint: 'Opens the Unit page on its config' },
  restore: (released: number, head: number) => ({
    label: `Restore rev ${released}`,
    hint: `The released revision; undoes ${revRange(released + 1, head)}`,
  }),
  restoreHistory: { label: 'Restore a revision…', hint: 'Opens the revisions on the Unit page' },
  release: (space: string, reach?: number) => ({ label: releaseLabel(space, reach), hint: 'Space-wide, on the Components view' }),
  releaseOff: {
    noReleaseTarget: 'this Space has no release Target',
    notComponent: 'this Space is not a Component',
    otherTarget: "this Unit's Target is not the release Target",
    gate: 'blocked by the gate',
    componentUnread: 'could not read the Component for this Space',
  },
} as const;

/** The panel's counts of a group, in the words of the table's Status column: "2 unreleased". */
export const STATUS_COUNT_LABEL = Object.fromEntries(
  Object.entries(STATUS_LABEL).map(([status, label]) => [status, label.toLowerCase()]),
) as Record<StatusKind, string>;

export const GROUP = {
  ungrouped: 'In this view',
  /** A Space or Target group is a place: "In payments-prod". */
  place: (value: string) => `In ${value}`,
  field: (label: string, value: string) => `${label}: ${value}`,
  notSet: 'Not set',
  units: (n: number) => count(n, 'Unit'),
  needing: (n: number, total: number) => `${n} of ${total} ${n === 1 ? 'needs' : 'need'} attention`,
  /** After a status's count, the ones of them a gate blocks. */
  gated: (n: number) => `(${n} blocked by a gate)`,
  self: '(this Unit)',
  next: 'Next Unit that needs attention:',
  nextIn: (group: string) => `in ${group}`,
  noneElse: 'Nothing else in this view needs attention',
  none: 'Nothing in this view needs attention',
} as const;

export const HEADER = {
  previous: 'Previous Unit',
  next: 'Next Unit',
  position: (k: number, n: number) => `${k} of ${n}`,
  revs: (head: number, released: number, targeted: boolean) => {
    if (!targeted) return `rev ${head}`;
    if (released === 0) return `head ${head}, never released`;
    return head === released ? `rev ${head}` : `head ${head}, released ${released}`;
  },
  noTarget: 'no Target',
  open: 'Open Unit page',
  close: 'Close panel',
} as const;

export const KEYS = {
  rows: 'next / previous',
  problems: 'problems',
  primary: 'primary',
  close: 'close',
} as const;

/** What the live region says when the panel moves to another row. */
export function announcement(slug: string, position: number | null, total: number, headline: string): string {
  return `${slug}${position ? `, ${position} of ${total}` : ''}. ${headline}`;
}
