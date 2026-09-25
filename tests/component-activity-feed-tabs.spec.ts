// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import {
  countEntriesByTab,
  filterEntriesByTab,
  type FeedEntry,
} from '../src/pages/x/apps/activityFeedEntries';

/**
 * Regression coverage for the Components activity feed's People/Automated tab split.
 *
 * This spec used to guard a two-source merge bug: the feed combined automated UnitEvents with
 * Revisions, and a per-space collapse in that merge step could drop an older human revision in
 * favor of a newer same-space automated event, silently hiding activity from the People tab. See
 * git history (`component-activity-feed-merge.spec.ts`) for the original scenario.
 *
 * The feed is now Revision-only (bgrant0607: UnitAction/UnitEvent "are useless now" — kept alive
 * only for the function worker, not something to build UI on top of; see #4905/#4916). With a
 * single already-deduped (`distinct_on=Off`), already-sorted-and-capped source, that specific
 * two-source collapse can no longer happen — there is only one list to merge with itself.
 *
 * What still matters, and what this spec asserts, is the invariant one level down: splitting a
 * single recency-ordered list of Revisions across tabs must never drop or miscount a row, even
 * when automated and human revisions are interleaved within the same space.
 *
 * Runs as part of the normal suite (`npm run playwright:test`); needs no browser or server, drives
 * the pure tab-filtering functions directly.
 */

const T = (isoMinute: string) => new Date(`2026-07-31T${isoMinute}:00Z`).getTime();

const humanRevision = (spaceId: string, at: string): FeedEntry => ({
  componentName: 'checkout',
  spaceId,
  timestamp: T(at),
  isAutomated: false,
  revision: { RevisionID: `revision-${spaceId}-${at}`, SpaceID: spaceId },
  unitSlug: 'checkout-api',
});

const automatedRevision = (spaceId: string, at: string): FeedEntry => ({
  componentName: 'checkout',
  spaceId,
  timestamp: T(at),
  isAutomated: true,
  autoDisplayName: 'ConfigHub System',
  revision: { RevisionID: `revision-${spaceId}-${at}`, SpaceID: spaceId },
  unitSlug: 'checkout-api',
});

test.describe('ComponentActivityFeed tab split', () => {
  test('an automated revision does not crowd out an older human revision in the same space', () => {
    // The closest analog to the original bug scenario, adapted to a single Revision source: one
    // space, an automated revision at 10:05, and an OLDER human revision at 10:00. Both must
    // survive (there's no collapse step left to lose one), and the People tab must still show its
    // entry.
    const spaceId = 'space-prod';
    const entries = [automatedRevision(spaceId, '10:05'), humanRevision(spaceId, '10:00')];

    const people = filterEntriesByTab(entries, 'people');
    expect(people).toHaveLength(1);
    expect(people[0].revision.RevisionID).toBe(`revision-${spaceId}-10:00`);

    const counts = countEntriesByTab(entries);
    expect(counts.people).toBe(people.length);
    expect(counts.automated).toBe(filterEntriesByTab(entries, 'automated').length);
    expect(counts.all).toBe(entries.length);
  });

  test('filtering by tab never removes an entry of the other category', () => {
    const entries = [
      automatedRevision('space-a', '10:06'),
      humanRevision('space-a', '10:05'),
      automatedRevision('space-b', '10:04'),
      humanRevision('space-b', '10:03'),
      humanRevision('space-a', '10:02'),
    ];

    const people = filterEntriesByTab(entries, 'people');
    const automated = filterEntriesByTab(entries, 'automated');

    expect(people).toHaveLength(3);
    expect(automated).toHaveLength(2);
    expect(people.length + automated.length).toBe(entries.length);
    expect(new Set(people.map((e) => e.spaceId))).toEqual(new Set(['space-a', 'space-b']));

    const counts = countEntriesByTab(entries);
    expect(counts).toEqual({ all: entries.length, people: people.length, automated: automated.length });
  });

  test('the "all" tab is the full list, unfiltered and in whatever order it was given', () => {
    const entries = [
      automatedRevision('space-a', '10:03'),
      humanRevision('space-a', '10:02'),
      humanRevision('space-b', '10:01'),
    ];

    expect(filterEntriesByTab(entries, 'all')).toEqual(entries);
    expect(countEntriesByTab(entries).all).toBe(entries.length);
  });

  test('entries without a space are still counted, not silently dropped', () => {
    // Space attribution is a display detail; an entry missing SpaceID is still activity.
    const spaceless: FeedEntry = { ...humanRevision('space-a', '10:01'), spaceId: undefined };
    const entries = [automatedRevision('space-a', '10:02'), spaceless];

    expect(filterEntriesByTab(entries, 'people')).toHaveLength(1);
    expect(countEntriesByTab(entries)).toEqual({ all: 2, people: 1, automated: 1 });
  });
});
