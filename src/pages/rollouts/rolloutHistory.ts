// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Rollout History card's data: the ChangeOrder's Promotions,
 * PromotionOverrides and PromotionFailures, and the Releases published for it,
 * as one list, newest first.
 *
 * Pure, so every rule here is tested without a page
 * (`tests/rollout-history.pure.spec.ts`).
 *
 * ⚠️ THE JOIN IS A MATCH, NOT A FACT. One promote action can write three
 * records: an override (before any write), a promotion (the Spaces written)
 * and a failure (the Spaces not completed). The records carry no shared action
 * ID, so they are joined by person, Stage and time, by two rules:
 *  - a promotion and a failure join when written within
 *    `HISTORY_SAME_WRITE_MS` (2 s) of each other, as the server writes both
 *    in one transaction;
 *  - either joins an override written at most `HISTORY_JOIN_WINDOW_MS`
 *    (60 s) before it, as the override is written before the writes.
 * The card says so ("N entries from M records", and on each joined entry the
 * rule that matched it), and nothing a user acts on is counted from the join
 * alone.
 */

import type {
  ChangeOrderPromotion,
  ChangeOrderPromotionFailure,
  ChangeOrderPromotionFailureLink,
  ChangeOrderPromotionFailureSpace,
  ChangeOrderPromotionFailureUnit,
  ChangeOrderPromotionOverride,
} from '@confighub/rtk-query';

import { AUTOMATED_USER_ID } from '../x/apps/appTypes';

/** An override is written before its action's writes, so its promotion or failure can come this much later. */
export const HISTORY_JOIN_WINDOW_MS = 60_000;

/**
 * The server writes the promotion and the failure records of one action in
 * one transaction, with one time. Two such records further apart than this
 * belong to two actions.
 */
export const HISTORY_SAME_WRITE_MS = 2_000;

/** The server keeps this many of each record for one Rollout, dropping the oldest. */
export const HISTORY_RETENTION = { promotions: 1024, overrides: 256, failures: 64 } as const;

/** The server keeps this many Unit, and Link, errors for each failed Space. */
export const FAILURE_RECORDED_ITEMS = 32;

/** The server cuts each recorded error at this many characters, and adds "...". */
export const FAILURE_ERROR_LENGTH = 2048;

/** The newest days are drawn in full; older ones fold their routine entries. */
export const HISTORY_FULL_DAYS = 2;

/** A Rollout with fewer entries than this draws every day in full: folding helps only a long history. */
export const HISTORY_FOLD_MIN_ENTRIES = 40;

/** How many days the card shows before "Show earlier days", and how many each press adds. */
export const HISTORY_INITIAL_DAYS = 6;
export const HISTORY_MORE_DAYS = 7;

/** A run of this many Releases by one publisher, each within `RELEASE_RUN_GAP_MS` of the next, folds to one row. */
export const RELEASE_RUN_MIN = 3;
export const RELEASE_RUN_GAP_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** The fields of a User the card reads. */
export interface HistoryUser {
  UserID?: string;
  DisplayName?: string;
  Username?: string;
  ProfilePictureURL?: string;
}

/**
 * - `person`: a User that ListUsers returned.
 * - `automation`: the zero UUID, which the server writes for automated work.
 * - `unknown`: a UserID that ListUsers did not return. It cannot tell a
 *   removed account from one the viewer cannot see, so neither is said.
 * - `none`: no UserID at all — a Release published before publishers were recorded.
 * - `loading`: a UserID the user read has not answered for YET. Not "unknown":
 *   a name that is still on its way is not a missing one.
 */
export type HistoryPersonKind = 'person' | 'automation' | 'unknown' | 'none' | 'loading';

export interface HistoryPerson {
  /** The person filter's key. Every unknown user shares one key, as they share one name. */
  key: string;
  kind: HistoryPersonKind;
  name: string;
  isYou: boolean;
  pictureUrl?: string;
  /** For the avatar colour only. Never rendered. */
  colorSeed: string;
}

export const AUTOMATION_KEY = 'automation';
export const UNKNOWN_KEY = 'unknown';
export const NO_PERSON_KEY = 'none';
export const LOADING_KEY = 'loading';

/** `pending`: the user read is fetching, so a UserID it has not answered for may still come. */
export function resolvePerson(
  userId: string | undefined,
  users: ReadonlyMap<string, HistoryUser>,
  currentUserId: string | undefined,
  pending = false,
): HistoryPerson {
  if (userId === undefined || userId === '') {
    return { key: NO_PERSON_KEY, kind: 'none', name: 'Not recorded', isYou: false, colorSeed: NO_PERSON_KEY };
  }
  if (userId === AUTOMATED_USER_ID) {
    return { key: AUTOMATION_KEY, kind: 'automation', name: 'Automation', isYou: false, colorSeed: AUTOMATION_KEY };
  }
  const user = users.get(userId);
  if (user === undefined && pending) {
    return { key: LOADING_KEY, kind: 'loading', name: 'Loading name…', isYou: false, colorSeed: LOADING_KEY };
  }
  if (user === undefined) {
    return { key: UNKNOWN_KEY, kind: 'unknown', name: 'Unknown user', isYou: false, colorSeed: UNKNOWN_KEY };
  }
  const name = user.DisplayName?.trim() || user.Username?.trim() || 'Unnamed user';
  return {
    key: userId,
    kind: 'person',
    name,
    isYou: currentUserId !== undefined && currentUserId === userId,
    pictureUrl: user.ProfilePictureURL || undefined,
    colorSeed: userId,
  };
}

/** Every UserID the records and Releases name, for one batched ListUsers. The zero UUID is left out. */
export function historyUserIds(input: {
  promotions?: readonly ChangeOrderPromotion[];
  overrides?: readonly ChangeOrderPromotionOverride[];
  failures?: readonly ChangeOrderPromotionFailure[];
  releases?: readonly HistoryReleaseInput[];
}): string[] {
  const ids = new Set<string>();
  const add = (id: string | undefined) => {
    if (id && id !== AUTOMATED_USER_ID) ids.add(id);
  };
  input.promotions?.forEach((r) => add(r.UserID));
  input.overrides?.forEach((r) => add(r.UserID));
  input.failures?.forEach((r) => add(r.UserID));
  input.releases?.forEach((r) => add(r.UserID));
  return [...ids].sort();
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/** The fields of a Release the card reads. */
export interface HistoryReleaseInput {
  ReleaseID?: string;
  ReleaseNum?: number;
  SpaceID?: string;
  SpaceSlug?: string;
  CreatedAt?: string;
  UserID?: string;
}

/** One promote action: up to one record of each kind, matched by person, Stage and time. */
export interface HistoryActionEntry {
  kind: 'action';
  id: string;
  /** Epoch ms of the earliest of its records. */
  at: number;
  userId?: string;
  person: HistoryPerson;
  /** The workflow Stage name, verbatim. Empty when the Rollout has no workflow. */
  stage: string;
  promotion?: ChangeOrderPromotion;
  override?: ChangeOrderPromotionOverride;
  failure?: ChangeOrderPromotionFailure;
}

export interface HistoryReleaseEntry {
  kind: 'release';
  id: string;
  at: number;
  userId?: string;
  person: HistoryPerson;
  /** The Stage the Release's Space belongs to, or `undefined` when no Stage selects it. */
  stage?: string;
  release: HistoryReleaseInput;
}

export type HistoryEntry = HistoryActionEntry | HistoryReleaseEntry;

/** An override or a failure. These are never folded away. */
export function isException(entry: HistoryEntry): boolean {
  return entry.kind === 'action' && (entry.override !== undefined || entry.failure !== undefined);
}

function epoch(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

interface RawRecord {
  type: 'promotion' | 'override' | 'failure';
  at: number;
  userId?: string;
  stage: string;
  record: ChangeOrderPromotion | ChangeOrderPromotionOverride | ChangeOrderPromotionFailure;
}

export interface BuildHistoryInput {
  promotions?: readonly ChangeOrderPromotion[];
  overrides?: readonly ChangeOrderPromotionOverride[];
  failures?: readonly ChangeOrderPromotionFailure[];
  releases?: readonly HistoryReleaseInput[];
  /** The Stage each Space belongs to, for Releases, which name a Space but no Stage. */
  stageBySpaceId?: ReadonlyMap<string, string>;
  person: (userId: string | undefined) => HistoryPerson;
}

export interface BuiltHistory {
  /** Newest first. */
  entries: HistoryEntry[];
  /** The records the entries were built from. More than `entries.length` when records were joined. */
  recordCount: number;
}

/**
 * Every record as one list, newest first, with the records of one promote
 * action joined into one entry.
 *
 * An override always starts a new action, because the server writes it before
 * the writes of its own action. A promotion or a failure joins the NEWEST
 * action of the same person and Stage that has no record of its kind yet and
 * either holds the other write record within `HISTORY_SAME_WRITE_MS`, or holds
 * only an override at most `HISTORY_JOIN_WINDOW_MS` earlier. Otherwise it
 * starts a new action. Records with no readable time are left
 * out, as they cannot be placed on a timeline.
 */
export function buildHistory(input: BuildHistoryInput): BuiltHistory {
  const raw: RawRecord[] = [];
  for (const record of input.overrides ?? []) {
    const at = epoch(record.OverriddenAt);
    if (at !== undefined) raw.push({ type: 'override', at, userId: record.UserID, stage: record.Stage ?? '', record });
  }
  for (const record of input.promotions ?? []) {
    const at = epoch(record.PromotedAt);
    if (at !== undefined) raw.push({ type: 'promotion', at, userId: record.UserID, stage: record.Stage ?? '', record });
  }
  for (const record of input.failures ?? []) {
    const at = epoch(record.FailedAt);
    if (at !== undefined) raw.push({ type: 'failure', at, userId: record.UserID, stage: record.Stage ?? '', record });
  }
  // Stable for equal times: overrides, then promotions, then failures, which is the order they are written in.
  raw.sort((a, b) => a.at - b.at);

  const actions: HistoryActionEntry[] = [];
  /** When each action's records were written, for the join. */
  const times = new Map<HistoryActionEntry, Partial<Record<RawRecord['type'], number>>>();
  const joins = (action: HistoryActionEntry, record: RawRecord): boolean => {
    if (action.userId !== record.userId || action.stage !== record.stage || action[record.type] !== undefined) return false;
    const at = times.get(action) ?? {};
    const otherWrite = record.type === 'promotion' ? at.failure : at.promotion;
    if (otherWrite !== undefined) return Math.abs(record.at - otherWrite) <= HISTORY_SAME_WRITE_MS;
    return at.override !== undefined && record.at >= at.override && record.at - at.override <= HISTORY_JOIN_WINDOW_MS;
  };
  for (const record of raw) {
    let match: HistoryActionEntry | undefined;
    if (record.type !== 'override') {
      for (let i = actions.length - 1; i >= 0; i--) {
        if (joins(actions[i], record)) {
          match = actions[i];
          break;
        }
      }
    }
    const target =
      match ??
      (() => {
        const created: HistoryActionEntry = {
          kind: 'action',
          id: '',
          at: record.at,
          userId: record.userId,
          person: input.person(record.userId),
          stage: record.stage,
        };
        actions.push(created);
        return created;
      })();
    target.at = Math.min(target.at, record.at);
    times.set(target, { ...times.get(target), [record.type]: record.at });
    if (record.type === 'promotion') target.promotion = record.record as ChangeOrderPromotion;
    else if (record.type === 'override') target.override = record.record as ChangeOrderPromotionOverride;
    else target.failure = record.record as ChangeOrderPromotionFailure;
  }
  actions.forEach((action, index) => {
    action.id = `action-${index}`;
  });

  const releases: HistoryReleaseEntry[] = [];
  (input.releases ?? []).forEach((release, index) => {
    const at = epoch(release.CreatedAt);
    if (at === undefined) return;
    releases.push({
      kind: 'release',
      id: `release-${release.ReleaseID ?? index}`,
      at,
      userId: release.UserID,
      person: input.person(release.UserID),
      stage: release.SpaceID ? input.stageBySpaceId?.get(release.SpaceID) : undefined,
      release,
    });
  });

  const entries: HistoryEntry[] = [...actions, ...releases].sort((a, b) => b.at - a.at);
  const recordCount = raw.length + releases.length;
  return { entries, recordCount };
}

/** Releases from several reads, each once, by ReleaseID. */
export function mergeReleases(...lists: ReadonlyArray<readonly HistoryReleaseInput[] | undefined>): HistoryReleaseInput[] {
  const byId = new Map<string, HistoryReleaseInput>();
  const withoutId: HistoryReleaseInput[] = [];
  for (const list of lists) {
    for (const release of list ?? []) {
      if (release.ReleaseID === undefined) withoutId.push(release);
      else if (!byId.has(release.ReleaseID)) byId.set(release.ReleaseID, release);
    }
  }
  return [...byId.values(), ...withoutId];
}

/**
 * How an entry was matched from its records, naming the rule that applied, or
 * `null` for an entry of one record.
 */
export function matchedFromText(action: HistoryActionEntry): string | null {
  const writes = [action.promotion ? 'promotion' : null, action.failure ? 'failure' : null].filter(
    (k): k is string => k !== null,
  );
  const kinds = [...(action.override ? ['override'] : []), ...writes];
  if (kinds.length < 2) return null;
  const head = `Matched from ${kinds.length} records (${kinds.join(', ')}) by person and Stage`;
  const sameWrite = `${HISTORY_SAME_WRITE_MS / 1000} s`;
  const window = `${HISTORY_JOIN_WINDOW_MS / 1000} s`;
  let rule: string;
  if (!action.override) rule = `the promotion and the failure were written within ${sameWrite} of each other`;
  else if (writes.length === 2) {
    rule = `the promotion and the failure were written within ${sameWrite} of each other, at most ${window} after the override`;
  } else rule = `the ${writes[0]} was written at most ${window} after the override`;
  return `${head}: ${rule}. The records carry no shared ID.`;
}

// ---------------------------------------------------------------------------
// Override reach
// ---------------------------------------------------------------------------

export type OverrideReach = 'written' | 'failed' | 'no-record';

export interface OverrideReachRow {
  spaceId: string;
  reach: OverrideReach;
}

/**
 * What became of each Space an override lists.
 *
 * The override is recorded BEFORE anything is written, so it alone says
 * nothing about whether a Space received the change. The promotion and failure
 * records of the same action say that. A Space in neither has no record, which
 * is not the same as "not reached", and is never said as that.
 */
export function overrideReach(action: HistoryActionEntry): OverrideReachRow[] {
  const written = new Set(action.promotion?.SpaceIDs ?? []);
  const failed = new Set((action.failure?.Spaces ?? []).map((space) => space.SpaceID).filter(Boolean));
  return (action.override?.SpaceIDs ?? []).map((spaceId) => ({
    spaceId,
    reach: written.has(spaceId) ? 'written' : failed.has(spaceId) ? 'failed' : 'no-record',
  }));
}

export const REACH_TEXT: Record<OverrideReach, string> = {
  written: 'Written in this promotion',
  failed: 'Has a failure record, see below',
  'no-record': 'No record. It may not have been reached.',
};

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/**
 * One headline for each failure Action, and nothing more than the Action says.
 *
 * `Promote` means the Space WAS promoted and some of its Units failed — other
 * Units were written. Saying "nothing was written" for it would be false.
 */
export function failureSpaceHeadline(space: ChangeOrderPromotionFailureSpace): string {
  switch (space.Action) {
    case 'Failed':
      return 'Could not be planned. Nothing was written to this Space.';
    case 'Blocked':
      return space.Reason ? `Blocked: ${space.Reason}` : 'Blocked.';
    case 'Promote':
      return 'Some Units failed. Other Units were written.';
    default:
      return space.Action ? `Recorded as ${space.Action}.` : 'Not completed.';
  }
}

export const FAILURE_ACTION_LABEL: Record<string, string> = {
  Failed: 'Failed',
  Blocked: 'Blocked',
  Promote: 'Units failed',
};

/**
 * The placeholder the server appends after `FAILURE_RECORDED_ITEMS` errors: no
 * ID and no slug, only a message.
 */
export function isOverflowItem(item: ChangeOrderPromotionFailureUnit | ChangeOrderPromotionFailureLink): boolean {
  const id = (item as ChangeOrderPromotionFailureUnit).UnitID ?? (item as ChangeOrderPromotionFailureLink).LinkID;
  return !id && !item.Slug;
}

export interface FailureItems<T> {
  recorded: T[];
  /** True when more failed than the server recorded. */
  overflow: boolean;
}

export function splitFailureItems<T extends ChangeOrderPromotionFailureUnit | ChangeOrderPromotionFailureLink>(
  items: readonly T[] | undefined,
): FailureItems<T> {
  const recorded: T[] = [];
  let overflow = false;
  for (const item of items ?? []) {
    if (isOverflowItem(item)) overflow = true;
    else recorded.push(item);
  }
  return { recorded, overflow };
}

/** True when the server cut this error at `FAILURE_ERROR_LENGTH` characters. */
export function isCutError(error: string | undefined): boolean {
  return error !== undefined && [...error].length > FAILURE_ERROR_LENGTH && error.endsWith('...');
}

/** An error long enough to clamp to two lines until it is opened. */
export function isLongError(error: string | undefined): boolean {
  return error !== undefined && (error.length > 160 || error.includes('\n'));
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type HistoryKindFilter = 'all' | 'promotions' | 'exceptions' | 'overrides' | 'failures' | 'releases';

export interface HistoryFilters {
  kind: HistoryKindFilter;
  /** A Stage name, or `null` for every Stage. */
  stage: string | null;
  /** A `HistoryPerson.key`, or `null` for everyone. */
  person: string | null;
}

export const NO_FILTERS: HistoryFilters = { kind: 'all', stage: null, person: null };

export function hasFilters(filters: HistoryFilters): boolean {
  return filters.kind !== 'all' || filters.stage !== null || filters.person !== null;
}

export function matchesKind(entry: HistoryEntry, kind: HistoryKindFilter): boolean {
  switch (kind) {
    case 'all':
      return true;
    case 'promotions':
      return entry.kind === 'action';
    case 'exceptions':
      return isException(entry);
    case 'overrides':
      return entry.kind === 'action' && entry.override !== undefined;
    case 'failures':
      return entry.kind === 'action' && entry.failure !== undefined;
    case 'releases':
      return entry.kind === 'release';
  }
}

/** `ignore` leaves one filter out, so each filter's own counts reflect the other two. */
export function matchesFilters(
  entry: HistoryEntry,
  filters: HistoryFilters,
  ignore?: keyof HistoryFilters,
): boolean {
  if (ignore !== 'stage' && filters.stage !== null && entry.stage !== filters.stage) return false;
  if (ignore !== 'person' && filters.person !== null && entry.person.key !== filters.person) return false;
  if (ignore !== 'kind' && !matchesKind(entry, filters.kind)) return false;
  return true;
}

export const HISTORY_KINDS: readonly HistoryKindFilter[] = [
  'all',
  'promotions',
  'exceptions',
  'overrides',
  'failures',
  'releases',
];

export function kindTallies(entries: readonly HistoryEntry[], filters: HistoryFilters): Record<HistoryKindFilter, number> {
  const base = entries.filter((entry) => matchesFilters(entry, filters, 'kind'));
  const tallies = {} as Record<HistoryKindFilter, number>;
  for (const kind of HISTORY_KINDS) tallies[kind] = base.filter((entry) => matchesKind(entry, kind)).length;
  return tallies;
}

export interface StageCount {
  stage: string;
  count: number;
}

/**
 * One pill per Stage, in the workflow's order, then any Stage a record names
 * that the workflow no longer declares. Counts reflect the other two filters.
 */
export function stageCounts(
  entries: readonly HistoryEntry[],
  filters: HistoryFilters,
  workflowStages: readonly string[],
): StageCount[] {
  const base = entries.filter((entry) => matchesFilters(entry, filters, 'stage'));
  const order = [...workflowStages];
  for (const entry of entries) {
    if (entry.stage !== undefined && !order.includes(entry.stage)) order.push(entry.stage);
  }
  return order.map((stage) => ({ stage, count: base.filter((entry) => entry.stage === stage).length }));
}

export interface PersonCount {
  person: HistoryPerson;
  count: number;
}

/** You first, then people by count, then Automation and unknown users. "Not recorded" is not a person. */
export function personCounts(entries: readonly HistoryEntry[], filters: HistoryFilters): PersonCount[] {
  const base = entries.filter((entry) => matchesFilters(entry, filters, 'person'));
  const byKey = new Map<string, PersonCount>();
  for (const entry of base) {
    if (entry.person.kind === 'none' || entry.person.kind === 'loading') continue;
    const found = byKey.get(entry.person.key);
    if (found) found.count += 1;
    else byKey.set(entry.person.key, { person: entry.person, count: 1 });
  }
  const rank = (p: HistoryPerson) => (p.isYou ? 0 : p.kind === 'person' ? 1 : 2);
  return [...byKey.values()].sort(
    (a, b) => rank(a.person) - rank(b.person) || b.count - a.count || a.person.name.localeCompare(b.person.name),
  );
}

// ---------------------------------------------------------------------------
// Days, folding and Release runs
// ---------------------------------------------------------------------------

export interface HistoryDay {
  /** `YYYY-MM-DD`, UTC. */
  key: string;
  at: number;
  entries: HistoryEntry[];
}

export function dayKeyOf(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Entries are newest first, so days are too. */
export function groupByDay(entries: readonly HistoryEntry[]): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const entry of entries) {
    const key = dayKeyOf(entry.at);
    const last = days[days.length - 1];
    if (last !== undefined && last.key === key) last.entries.push(entry);
    else days.push({ key, at: entry.at, entries: [entry] });
  }
  return days;
}

export interface DaySummary {
  promotions: number;
  releases: number;
  overrides: number;
  failures: number;
}

export function summariseDay(day: HistoryDay): DaySummary {
  let promotions = 0;
  let releases = 0;
  let overrides = 0;
  let failures = 0;
  for (const entry of day.entries) {
    if (entry.kind === 'release') {
      releases += 1;
      continue;
    }
    promotions += 1;
    if (entry.override) overrides += 1;
    if (entry.failure) failures += 1;
  }
  return { promotions, releases, overrides, failures };
}

/**
 * A day older than the newest `HISTORY_FULL_DAYS` folds, when the Rollout has
 * at least `HISTORY_FOLD_MIN_ENTRIES` entries and the day has something routine
 * to fold. Overrides and failures are never folded.
 */
export function isFoldable(day: HistoryDay, index: number, totalEntries: number): boolean {
  return (
    totalEntries >= HISTORY_FOLD_MIN_ENTRIES &&
    index >= HISTORY_FULL_DAYS &&
    day.entries.some((entry) => !isException(entry))
  );
}

export interface ReleaseRun {
  kind: 'release-run';
  id: string;
  person: HistoryPerson;
  /** Newest first. */
  items: HistoryReleaseEntry[];
  at: number;
}

export type HistoryRow = HistoryEntry | ReleaseRun;

/**
 * Runs of `RELEASE_RUN_MIN` or more Releases in a row by one publisher, each
 * within `RELEASE_RUN_GAP_MS` of the one before, become one row. Anything else
 * between them breaks the run.
 */
export function foldReleaseRuns(entries: readonly HistoryEntry[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let run: HistoryReleaseEntry[] = [];
  const flush = () => {
    if (run.length >= RELEASE_RUN_MIN) {
      rows.push({ kind: 'release-run', id: `run-${run[0].id}`, person: run[0].person, items: run, at: run[0].at });
    } else {
      rows.push(...run);
    }
    run = [];
  };
  for (const entry of entries) {
    if (entry.kind !== 'release') {
      flush();
      rows.push(entry);
      continue;
    }
    const last = run[run.length - 1];
    if (last !== undefined && (last.person.key !== entry.person.key || last.at - entry.at > RELEASE_RUN_GAP_MS)) flush();
    run.push(entry);
  }
  flush();
  return rows;
}

/**
 * What the days not yet loaded hold that a reader must not miss, said from the
 * data: "2 overrides and 1 failure in earlier days." An action that is both an
 * override and a failure counts once in each.
 */
export function hiddenExceptionsText(days: readonly HistoryDay[]): string {
  let overrides = 0;
  let failures = 0;
  for (const day of days) {
    for (const entry of day.entries) {
      if (entry.kind !== 'action') continue;
      if (entry.override) overrides += 1;
      if (entry.failure) failures += 1;
    }
  }
  const parts = [
    overrides > 0 ? plural(overrides, 'override') : '',
    failures > 0 ? plural(failures, 'failure') : '',
  ].filter(Boolean);
  if (parts.length === 0) return 'No overrides or failures in earlier days.';
  return `${parts.join(' and ')} in earlier days.`;
}

/** The people behind a folded day's routine entries, by name, each once. A Release with no recorded publisher names nobody. */
export function foldedPeople(day: HistoryDay): string[] {
  const names: string[] = [];
  for (const entry of day.entries) {
    if (isException(entry) || entry.person.kind === 'none' || entry.person.kind === 'loading') continue;
    if (!names.includes(entry.person.name)) names.push(entry.person.name);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Last activity
// ---------------------------------------------------------------------------

/** The newest promote action, for the summary card's "Last activity" fact. Releases are not promote actions. */
export function lastActivity(entries: readonly HistoryEntry[]): HistoryActionEntry | undefined {
  return entries.find((entry): entry is HistoryActionEntry => entry.kind === 'action');
}

// ---------------------------------------------------------------------------
// Time. UTC throughout, and the card says so.
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function clockTime(at: number): string {
  const d = new Date(at);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function shortDate(at: number): string {
  const d = new Date(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fullTime(at: number): string {
  const d = new Date(at);
  return `${WEEKDAYS[d.getUTCDay()]} ${shortDate(at)}, ${clockTime(at)} UTC`;
}

export function dayLabel(at: number, now: number): string {
  const d = new Date(at);
  const n = new Date(now);
  const diff = Math.round(
    (Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) -
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) /
      86_400_000,
  );
  const base = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const withYear = d.getUTCFullYear() === n.getUTCFullYear() ? base : `${base} ${d.getUTCFullYear()}`;
  if (diff === 0) return `Today, ${base}`;
  if (diff === 1) return `Yesterday, ${base}`;
  return withYear;
}

export function relativeTime(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
