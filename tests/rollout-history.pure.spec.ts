// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Rollout History card's rules (`rolloutHistory.ts`), exercised directly:
// the join of one promote action's records, people, the failure headlines, the
// override reach, filters, day folding and Release runs. No page, no browser.

import { expect, test } from '@playwright/test';

import {
  AUTOMATION_KEY,
  HISTORY_FOLD_MIN_ENTRIES,
  HISTORY_FULL_DAYS,
  NO_FILTERS,
  REACH_TEXT,
  UNKNOWN_KEY,
  buildHistory,
  dayLabel,
  failureSpaceHeadline,
  foldReleaseRuns,
  groupByDay,
  hiddenExceptionsText,
  historyUserIds,
  isCutError,
  isException,
  isFoldable,
  kindTallies,
  lastActivity,
  matchedFromText,
  matchesFilters,
  mergeReleases,
  overrideReach,
  personCounts,
  relativeTime,
  resolvePerson,
  splitFailureItems,
  stageCounts,
  type BuildHistoryInput,
  type HistoryActionEntry,
  type HistoryUser,
} from '../src/pages/rollouts/rolloutHistory';
import { AUTOMATED_USER_ID } from '../src/pages/x/apps/appTypes';

const PRIYA = '11111111-1111-4111-8111-111111111111';
const MARCO = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';

const USERS = new Map<string, HistoryUser>([
  [PRIYA, { UserID: PRIYA, DisplayName: 'Priya Raman' }],
  [MARCO, { UserID: MARCO, DisplayName: 'Marco Lindqvist' }],
]);

const person = (id: string | undefined) => resolvePerson(id, USERS, PRIYA);

function history(input: Omit<BuildHistoryInput, 'person'>) {
  return buildHistory({ ...input, person });
}

const at = (iso: string) => `2026-${iso}Z`;

test.describe('people', () => {
  test('a user ListUsers returned is named, and the viewer is marked as you', () => {
    expect(person(PRIYA)).toMatchObject({ kind: 'person', name: 'Priya Raman', isYou: true });
    expect(person(MARCO)).toMatchObject({ kind: 'person', name: 'Marco Lindqvist', isYou: false });
  });

  test('the zero UUID is Automation', () => {
    expect(person(AUTOMATED_USER_ID)).toMatchObject({ kind: 'automation', name: 'Automation', key: AUTOMATION_KEY });
  });

  test('a user ListUsers did not return is "Unknown user", never "Former user" and never the ID', () => {
    const p = person(GONE);
    expect(p).toMatchObject({ kind: 'unknown', name: 'Unknown user', key: UNKNOWN_KEY });
    expect(JSON.stringify({ ...p, colorSeed: '' })).not.toContain(GONE);
  });

  test('a UserID the user read has not answered yet is loading, not unknown, and is not a person to filter by', () => {
    const loading = resolvePerson(GONE, USERS, PRIYA, true);
    expect(loading).toMatchObject({ kind: 'loading', name: 'Loading name…' });
    expect(resolvePerson(MARCO, USERS, PRIYA, true)).toMatchObject({ kind: 'person', name: 'Marco Lindqvist' });
    const built = buildHistory({
      promotions: [{ UserID: GONE, PromotedAt: at('10-06T09:00:00'), Stage: 'dev' }],
      person: (id) => resolvePerson(id, USERS, PRIYA, true),
    });
    expect(personCounts(built.entries, NO_FILTERS)).toEqual([]);
  });

  test('no UserID at all is "Not recorded"', () => {
    expect(person(undefined)).toMatchObject({ kind: 'none', name: 'Not recorded' });
  });

  test('one batched lookup names every user once and leaves out Automation', () => {
    const ids = historyUserIds({
      promotions: [{ UserID: PRIYA }, { UserID: PRIYA }],
      overrides: [{ UserID: MARCO }],
      failures: [{ UserID: AUTOMATED_USER_ID }],
      releases: [{ UserID: GONE }, {}],
    });
    expect(ids).toEqual([PRIYA, MARCO, GONE].sort());
  });
});

test.describe('the join of one promote action', () => {
  const override = {
    UserID: MARCO,
    OverriddenAt: at('10-06T14:58:09'),
    Stage: 'prod',
    SpaceIDs: ['eu-west', 'ap-south'],
    Reason: 'EU checkout is down.',
    FailedGates: ['Healthy: staging-eu is Degraded'],
  };
  const promotion = { UserID: MARCO, PromotedAt: at('10-06T14:58:12'), Stage: 'prod', SpaceIDs: ['eu-west'] };

  test('override, promotion and failure by one person in one Stage within 60 s are one entry', () => {
    const failure = {
      UserID: MARCO,
      FailedAt: at('10-06T14:58:12'),
      Stage: 'prod',
      Spaces: [{ SpaceID: 'us-west', SpaceSlug: 'checkout-prod-us-west', Action: 'Promote' }],
    };
    const built = history({ overrides: [override], promotions: [promotion], failures: [failure] });
    expect(built.entries).toHaveLength(1);
    expect(built.recordCount).toBe(3);
    const action = built.entries[0] as HistoryActionEntry;
    expect(action.override).toBe(override);
    expect(action.promotion).toBe(promotion);
    expect(action.failure).toBe(failure);
    expect(action.at).toBe(Date.parse(override.OverriddenAt));
  });

  test('a different person, a different Stage, or more than 60 s apart are separate entries', () => {
    expect(history({ overrides: [override], promotions: [{ ...promotion, UserID: PRIYA }] }).entries).toHaveLength(2);
    expect(history({ overrides: [override], promotions: [{ ...promotion, Stage: 'staging' }] }).entries).toHaveLength(2);
    expect(
      history({ overrides: [override], promotions: [{ ...promotion, PromotedAt: at('10-06T15:00:00') }] }).entries,
    ).toHaveLength(2);
  });

  test('two promotions by one person close together do not merge into one entry', () => {
    const built = history({ promotions: [promotion, { ...promotion, PromotedAt: at('10-06T14:58:30') }] });
    expect(built.entries).toHaveLength(2);
  });

  test('a forced promote 5 s after a normal one keeps its override; the normal one stays normal', () => {
    const built = history({
      promotions: [
        { UserID: MARCO, PromotedAt: at('10-06T14:00:00'), Stage: 'prod', SpaceIDs: ['a'] },
        { UserID: MARCO, PromotedAt: at('10-06T14:00:06'), Stage: 'prod', SpaceIDs: ['b'] },
      ],
      overrides: [{ UserID: MARCO, OverriddenAt: at('10-06T14:00:05'), Stage: 'prod', SpaceIDs: ['b'], Reason: 'forced' }],
    });
    expect(built.entries).toHaveLength(2);
    const [forced, normal] = built.entries as HistoryActionEntry[];
    expect(forced.override?.Reason).toBe('forced');
    expect(forced.promotion?.SpaceIDs).toEqual(['b']);
    expect(normal.override).toBeUndefined();
    expect(normal.promotion?.SpaceIDs).toEqual(['a']);
    expect(lastActivity(built.entries)?.override).toBeDefined();
  });

  test('a failure joins the promote it belongs to, not an earlier one by the same person', () => {
    const built = history({
      promotions: [
        { UserID: MARCO, PromotedAt: at('10-06T14:00:00'), Stage: 'prod', SpaceIDs: ['a'] },
        { UserID: MARCO, PromotedAt: at('10-06T14:00:05'), Stage: 'prod', SpaceIDs: ['b'] },
      ],
      failures: [{ UserID: MARCO, FailedAt: '2026-10-06T14:00:05.500Z', Stage: 'prod', Spaces: [{ SpaceID: 'c', Action: 'Failed' }] }],
    });
    expect(built.entries).toHaveLength(2);
    const [failed, normal] = built.entries as HistoryActionEntry[];
    expect(failed.promotion?.SpaceIDs).toEqual(['b']);
    expect(failed.failure).toBeDefined();
    expect(normal.promotion?.SpaceIDs).toEqual(['a']);
    expect(normal.failure).toBeUndefined();
  });

  test('a failure-only promote 20 s after a normal promote stays separate', () => {
    const built = history({
      promotions: [{ UserID: MARCO, PromotedAt: at('10-06T14:00:00'), Stage: 'prod', SpaceIDs: ['a'] }],
      failures: [{ UserID: MARCO, FailedAt: at('10-06T14:00:20'), Stage: 'prod', Spaces: [{ SpaceID: 'b', Action: 'Failed' }] }],
    });
    expect(built.entries).toHaveLength(2);
    const [failed, normal] = built.entries as HistoryActionEntry[];
    expect(failed.failure).toBeDefined();
    expect(failed.promotion).toBeUndefined();
    expect(normal.failure).toBeUndefined();
  });

  test('a failure 30 s after an override, with no promotion, joins that override', () => {
    const built = history({
      overrides: [{ UserID: MARCO, OverriddenAt: at('10-06T14:00:00'), Stage: 'prod', SpaceIDs: ['b'] }],
      failures: [{ UserID: MARCO, FailedAt: at('10-06T14:00:30'), Stage: 'prod', Spaces: [{ SpaceID: 'b', Action: 'Failed' }] }],
    });
    expect(built.entries).toHaveLength(1);
    const [action] = built.entries as HistoryActionEntry[];
    expect(action.override).toBeDefined();
    expect(action.failure).toBeDefined();
  });

  test('two quick normal promotions by one person stay separate, each with its own Spaces', () => {
    const built = history({
      promotions: [
        { UserID: PRIYA, PromotedAt: at('10-06T09:00:00'), Stage: 'dev', SpaceIDs: ['a'] },
        { UserID: PRIYA, PromotedAt: at('10-06T09:00:03'), Stage: 'dev', SpaceIDs: ['b'] },
      ],
    });
    expect((built.entries as HistoryActionEntry[]).map((e) => e.promotion?.SpaceIDs)).toEqual([['b'], ['a']]);
    expect(built.entries.every((e) => !isException(e))).toBe(true);
  });

  test('entries are newest first, Releases among them', () => {
    const built = history({
      promotions: [promotion, { ...promotion, PromotedAt: at('10-05T10:00:00') }],
      releases: [{ ReleaseID: 'r1', ReleaseNum: 12, SpaceID: 'eu-west', CreatedAt: at('10-06T15:10:00'), UserID: PRIYA }],
      stageBySpaceId: new Map([['eu-west', 'prod']]),
    });
    expect(built.entries.map((e) => e.kind)).toEqual(['release', 'action', 'action']);
    expect(built.entries[0].stage).toBe('prod');
  });
});

test.describe('the matched-from text names the rule that applied', () => {
  const override = { UserID: MARCO, OverriddenAt: at('10-06T14:00:00'), Stage: 'prod', SpaceIDs: ['a'] };
  const promotion = { UserID: MARCO, PromotedAt: at('10-06T14:00:30'), Stage: 'prod', SpaceIDs: ['a'] };
  const failure = { UserID: MARCO, FailedAt: at('10-06T14:00:30'), Stage: 'prod', Spaces: [{ Action: 'Failed' }] };
  const text = (input: Omit<BuildHistoryInput, 'person'>) => matchedFromText(history(input).entries[0] as HistoryActionEntry);

  test('a promotion and a failure: the 2 s rule, with no word of 60 s', () => {
    const t = text({ promotions: [promotion], failures: [failure] });
    expect(t).toBe(
      'Matched from 2 records (promotion, failure) by person and Stage: the promotion and the failure were written within 2 s of each other. The records carry no shared ID.',
    );
    expect(t).not.toContain('60 s');
  });

  test('an override and a promotion: the 60 s rule', () => {
    expect(text({ overrides: [override], promotions: [promotion] })).toBe(
      'Matched from 2 records (override, promotion) by person and Stage: the promotion was written at most 60 s after the override. The records carry no shared ID.',
    );
  });

  test('all three: both rules', () => {
    expect(text({ overrides: [override], promotions: [promotion], failures: [failure] })).toBe(
      'Matched from 3 records (override, promotion, failure) by person and Stage: the promotion and the failure were written within 2 s of each other, at most 60 s after the override. The records carry no shared ID.',
    );
  });

  test('one record: no text', () => {
    expect(text({ promotions: [promotion] })).toBeNull();
  });
});

test.describe('override reach', () => {
  test('a listed Space is written, has a failure record, or has no record — never "not reached"', () => {
    const built = history({
      overrides: [{ UserID: MARCO, OverriddenAt: at('10-06T14:58:09'), Stage: 'prod', SpaceIDs: ['a', 'b', 'c'] }],
      promotions: [{ UserID: MARCO, PromotedAt: at('10-06T14:58:12'), Stage: 'prod', SpaceIDs: ['a'] }],
      failures: [{ UserID: MARCO, FailedAt: at('10-06T14:58:12'), Stage: 'prod', Spaces: [{ SpaceID: 'b', Action: 'Failed' }] }],
    });
    const reach = overrideReach(built.entries[0] as HistoryActionEntry);
    expect(reach).toEqual([
      { spaceId: 'a', reach: 'written' },
      { spaceId: 'b', reach: 'failed' },
      { spaceId: 'c', reach: 'no-record' },
    ]);
    expect(REACH_TEXT['no-record']).toBe('No record. It may not have been reached.');
    expect(Object.values(REACH_TEXT).join(' ')).not.toMatch(/not reached/i);
  });
});

test.describe('failure headlines', () => {
  test('one headline for each Action, and Promote never says nothing was written', () => {
    expect(failureSpaceHeadline({ Action: 'Failed' })).toBe('Could not be planned. Nothing was written to this Space.');
    expect(failureSpaceHeadline({ Action: 'Blocked', Reason: 'Takes from us-west.' })).toBe('Blocked: Takes from us-west.');
    const promote = failureSpaceHeadline({ Action: 'Promote' });
    expect(promote).toBe('Some Units failed. Other Units were written.');
    expect(promote).not.toMatch(/nothing|none/i);
  });

  test('the server overflow placeholder is split from the recorded Units', () => {
    const units = [
      { UnitID: 'u1', Slug: 'deployment', Error: 'denied' },
      { Error: 'more units failed than are recorded' },
    ];
    const split = splitFailureItems(units);
    expect(split.recorded).toHaveLength(1);
    expect(split.overflow).toBe(true);
    expect(splitFailureItems([{ UnitID: 'u1', Slug: 'x', Error: 'e' }]).overflow).toBe(false);
  });

  test('an error cut at 2048 characters is known as cut', () => {
    expect(isCutError(`${'x'.repeat(2048)}...`)).toBe(true);
    expect(isCutError('short...')).toBe(false);
  });
});

test.describe('filters', () => {
  const built = history({
    promotions: [
      { UserID: PRIYA, PromotedAt: at('10-06T11:20:04'), Stage: 'prod', SpaceIDs: ['a'] },
      { UserID: MARCO, PromotedAt: at('10-05T16:05:10'), Stage: 'staging', SpaceIDs: ['b'] },
    ],
    overrides: [{ UserID: MARCO, OverriddenAt: at('10-06T14:58:09'), Stage: 'prod', SpaceIDs: ['c'] }],
    failures: [{ UserID: GONE, FailedAt: at('10-04T09:15:21'), Stage: 'dev', Spaces: [{ Action: 'Failed' }] }],
    releases: [
      { ReleaseID: 'r1', ReleaseNum: 7, SpaceID: 'd', CreatedAt: at('10-04T09:31:00') },
      { ReleaseID: 'r2', ReleaseNum: 14, SpaceID: 'a', CreatedAt: at('10-06T15:12:48'), UserID: AUTOMATED_USER_ID },
    ],
    stageBySpaceId: new Map([
      ['a', 'prod'],
      ['d', 'dev'],
    ]),
  });

  test('kind tallies count each kind', () => {
    expect(kindTallies(built.entries, NO_FILTERS)).toEqual({
      all: 6,
      promotions: 4,
      exceptions: 2,
      overrides: 1,
      failures: 1,
      releases: 2,
    });
  });

  test('Stage pills follow the workflow order, and each count reflects the other filters', () => {
    expect(stageCounts(built.entries, NO_FILTERS, ['dev', 'staging', 'prod'])).toEqual([
      { stage: 'dev', count: 2 },
      { stage: 'staging', count: 1 },
      { stage: 'prod', count: 3 },
    ]);
    const releasesOnly = { ...NO_FILTERS, kind: 'releases' as const };
    expect(stageCounts(built.entries, releasesOnly, ['dev', 'staging', 'prod']).map((s) => s.count)).toEqual([1, 0, 1]);
  });

  test('people: you first, then people, then Automation and unknown; "Not recorded" is not a person', () => {
    const counts = personCounts(built.entries, NO_FILTERS);
    expect(counts.map((c) => c.person.name)).toEqual(['Priya Raman', 'Marco Lindqvist', 'Automation', 'Unknown user']);
    expect(counts.map((c) => c.count)).toEqual([1, 2, 1, 1]);
  });

  test('filters combine', () => {
    const f = { kind: 'exceptions' as const, stage: 'prod', person: MARCO };
    expect(built.entries.filter((e) => matchesFilters(e, f))).toHaveLength(1);
  });

  test('last activity is the newest promote action, not a Release', () => {
    const last = lastActivity(built.entries);
    expect(last?.override).toBeDefined();
    expect(last?.person.name).toBe('Marco Lindqvist');
  });
});

test.describe('days, folding and Release runs', () => {
  const now = Date.parse(at('10-06T15:40:00'));

  test('day labels say Today and Yesterday, in UTC', () => {
    expect(dayLabel(Date.parse(at('10-06T01:00:00')), now)).toBe('Today, Tue 6 Oct');
    expect(dayLabel(Date.parse(at('10-05T23:59:00')), now)).toBe('Yesterday, Mon 5 Oct');
    expect(dayLabel(Date.parse(at('09-14T09:00:00')), now)).toBe('Mon 14 Sep');
    expect(relativeTime(now - 42 * 60_000, now)).toBe('42 min ago');
  });

  const smallRollout = {
    promotions: [
      { UserID: PRIYA, PromotedAt: at('10-06T10:00:00'), Stage: 'prod', SpaceIDs: ['a'] },
      { UserID: PRIYA, PromotedAt: at('10-05T10:00:00'), Stage: 'prod', SpaceIDs: ['a'] },
      { UserID: PRIYA, PromotedAt: at('10-04T10:00:00'), Stage: 'prod', SpaceIDs: ['a'] },
    ],
    overrides: [
      { UserID: MARCO, OverriddenAt: at('10-04T12:00:00'), Stage: 'prod', SpaceIDs: ['a'] },
      { UserID: MARCO, OverriddenAt: at('10-03T12:00:00'), Stage: 'prod', SpaceIDs: ['a'] },
    ],
  };

  test('a small Rollout draws every day in full, old days too', () => {
    const built = history(smallRollout);
    expect(built.entries.length).toBeLessThan(HISTORY_FOLD_MIN_ENTRIES);
    const days = groupByDay(built.entries);
    expect(days.map((d) => d.key)).toEqual(['2026-10-06', '2026-10-05', '2026-10-04', '2026-10-03']);
    expect(days.map((d, i) => isFoldable(d, i, built.entries.length))).toEqual([false, false, false, false]);
  });

  test('a large Rollout folds the routine entries of older days, and a day of only exceptions does not fold', () => {
    const releases = Array.from({ length: HISTORY_FOLD_MIN_ENTRIES }, (_, n) => ({
      ReleaseID: `bulk-${n}`,
      ReleaseNum: n,
      SpaceID: 's',
      CreatedAt: `2026-10-02T${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}:00Z`,
      UserID: AUTOMATED_USER_ID,
    }));
    const built = history({ ...smallRollout, releases });
    expect(built.entries.length).toBeGreaterThanOrEqual(HISTORY_FOLD_MIN_ENTRIES);
    const days = groupByDay(built.entries);
    expect(days.map((d) => d.key)).toEqual(['2026-10-06', '2026-10-05', '2026-10-04', '2026-10-03', '2026-10-02']);
    expect(days.map((d, i) => isFoldable(d, i, built.entries.length))).toEqual([false, false, true, false, true]);
    expect(HISTORY_FULL_DAYS).toBe(2);
    // The folded day keeps its override on screen.
    expect(days[2].entries.filter(isException)).toHaveLength(1);
  });

  test('three or more Releases in a row by one publisher fold to one row; two do not', () => {
    const release = (n: number, minute: number, userId?: string) => ({
      ReleaseID: `r${n}`,
      ReleaseNum: n,
      SpaceID: `s${n}`,
      CreatedAt: at(`10-06T02:${String(minute).padStart(2, '0')}:00`),
      UserID: userId,
    });
    const built = history({
      releases: [
        release(1, 1, AUTOMATED_USER_ID),
        release(2, 2, AUTOMATED_USER_ID),
        release(3, 3, AUTOMATED_USER_ID),
        release(4, 10, PRIYA),
        release(5, 11, PRIYA),
      ],
    });
    const rows = foldReleaseRuns(built.entries);
    expect(rows.map((r) => r.kind)).toEqual(['release', 'release', 'release-run']);
    const run = rows[2];
    expect(run.kind === 'release-run' && run.items.map((i) => i.release.ReleaseNum)).toEqual([3, 2, 1]);
  });

  test('the days not yet loaded say how many overrides and failures they hold', () => {
    const days = (input: Omit<BuildHistoryInput, 'person'>) => groupByDay(history(input).entries);
    const override = (d: string) => ({ UserID: MARCO, OverriddenAt: at(`${d}T12:00:00`), Stage: 'prod', SpaceIDs: ['a'] });
    const failure = (d: string) => ({ UserID: PRIYA, FailedAt: at(`${d}T09:00:00`), Stage: 'prod', Spaces: [{ Action: 'Failed' }] });
    expect(hiddenExceptionsText(days({ overrides: [override('10-01'), override('09-30')], failures: [failure('09-29')] }))).toBe(
      '2 overrides and 1 failure in earlier days.',
    );
    expect(hiddenExceptionsText(days({ overrides: [override('10-01')] }))).toBe('1 override in earlier days.');
    expect(hiddenExceptionsText(days({ failures: [failure('10-01'), failure('09-30')] }))).toBe('2 failures in earlier days.');
    expect(hiddenExceptionsText(days({ promotions: [{ UserID: PRIYA, PromotedAt: at('10-01T09:00:00'), Stage: 'dev' }] }))).toBe(
      'No overrides or failures in earlier days.',
    );
  });

  test('Releases from two reads are each kept once', () => {
    const merged = mergeReleases([{ ReleaseID: 'a', ReleaseNum: 1 }], [{ ReleaseID: 'a', ReleaseNum: 1 }, { ReleaseID: 'b' }]);
    expect(merged.map((r) => r.ReleaseID)).toEqual(['a', 'b']);
  });
});
