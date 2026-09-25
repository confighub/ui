// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { RevisionRead, UserRead } from '@confighub/rtk-query';

/**
 * The pure part of the Components activity feed: the shape of a feed row, and how the fetched
 * Revisions are split across the feed's tabs.
 *
 * This used to also own merging two independently-fetched sources (automated UnitEvents and
 * Revisions) into one ordered stream — see git history if you need that. UnitAction/UnitEvent are
 * no longer used here (bgrant0607: they're legacy machinery kept alive only for the function
 * worker, not something to build UI on top of — #4905/#4916), so the feed is Revision-only and
 * there is nothing left to merge.
 *
 * `filterEntriesByTab`/`countEntriesByTab` live outside ComponentActivityFeed.tsx so the tab split
 * is directly assertable without a browser. See tests/component-activity-feed-tabs.spec.ts.
 */

/** How many entries the feed shows, and how many the Revisions query is asked for. */
export const MAX_FEED_ENTRIES = 20;

export type ActivityFeedTab = 'all' | 'people' | 'automated';

export interface FeedEntry {
  componentName: string;
  /**
   * Space this entry belongs to. The feed attributes rows to spaces rather than to units: the row
   * label reads "component / space" and clicking it navigates to the space.
   */
  spaceId?: string;
  /** Unix timestamp (ms) used for sorting. */
  timestamp: number;
  isAutomated: boolean;
  autoDisplayName?: string;
  autoSubLabel?: string;
  /**
   * Slug of the unit this revision belongs to. Not part of the row's identity — the row is
   * labelled by space — it is diff context: RevisionDiffPanel labels the diff with it.
   */
  unitSlug?: string;
  revision: RevisionRead;
  /** The human user who made this change; absent for automated revisions. */
  revisionUser?: UserRead;
}

/** The entries a given tab shows. `all` is the full list, unfiltered. */
export function filterEntriesByTab(entries: readonly FeedEntry[], tab: ActivityFeedTab): FeedEntry[] {
  if (tab === 'people') return entries.filter((e) => !e.isAutomated);
  if (tab === 'automated') return entries.filter((e) => e.isAutomated);
  return [...entries];
}

export interface ActivityFeedTabCounts {
  all: number;
  people: number;
  automated: number;
}

/**
 * Counts per tab, derived from the same list the tabs render, so a count can never promise rows
 * the tab cannot show. They describe the capped feed, not the total in the database.
 */
export function countEntriesByTab(entries: readonly FeedEntry[]): ActivityFeedTabCounts {
  let people = 0;
  for (const entry of entries) {
    if (!entry.isAutomated) people++;
  }
  return { all: entries.length, people, automated: entries.length - people };
}
