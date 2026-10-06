// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The console's data: two org-wide reads, then pure derivation.
 *
 * ⚠️ THE CHANGEORDER READ IS EXPENSIVE, AND NOT IN A WAY ANY CLIENT OPTION CAN
 * FIX. `InScopeSpaceIDs`, `ResolvedSpaceIDs`, `ReleasedSpaceIDs` and `State` are
 * derived per row at read time by a Links+Units graph walk. `/change_order`
 * accepts only `where`, `filter`, `contains`, `include` and `select`
 * (`confighubapi.gen.ts:262-268`) — no `limit`, no `offset`, no `order_by` — so
 * the read is unbounded and there is no server ordering to preserve.
 *
 * Four consequences are baked into this file rather than left to be
 * rediscovered:
 *
 *  1. NO `select`. Narrowing it would strip the four fields the whole page is
 *     built on, and would not save the server any work: computed fields are
 *     returned regardless, and a `select` omitting `EndTagID` makes the server
 *     issue an EXTRA full row fetch per ChangeOrder.
 *  2. NO POLLING. The detail page polls every 5s (`ROLLOUT_POLL_INTERVAL_MS`),
 *     but it polls a BOUNDED read — one ChangeOrder by id. Doing that on this
 *     unbounded list would multiply the most expensive read in the product by
 *     the number of open rollouts, on a timer. Refresh is explicit.
 *
 *     A comment does not stop someone adding a poll back, so this hook also
 *     returns `lastLoadedAt`: showing the data's age beside Refresh removes the
 *     MOTIVE for polling, which is the only durable half of the fix.
 *  3. FILTERING IS CLIENT-SIDE, because it cannot be anything else. The states
 *     a reader filters by are not fields — they are composites of `State`, live
 *     status and release status — and where-clauses naming computed fields are
 *     evaluated in memory *after* every row has been derived. A server-side
 *     filter would move zero work.
 *  4. SORTING IS CLIENT-SIDE TOO, and applied exactly once, in the `rows` memo,
 *     so the counts, the filter and the table all see one order and none of
 *     them has to agree on a comparator of its own.
 *
 * ⚠️ THE COST IS THE GRAPH WALK ITSELF, NOT AN UNINDEXED jsonb SCAN.
 * `Revision.Tags` is association-backed — `20260822043826` created the join
 * tables, `20260822052521` backfilled them, `20260823013550` rebuilt them, and
 * `internal/storage/association.go` is the read path — so anyone reaching for
 * the jsonb column as the reason will find it is not one.
 *
 * The read is still expensive and still unbounded because the walk is, so
 * points 1-4 stand on their own evidence. The distinction matters: a wrong
 * reason attached to a live constraint is how the constraint gets argued
 * away.
 */

import { useCallback, useMemo } from 'react';

import { useComponentSlugs } from '@/hooks/useComponentSlugs';
import { useListAllChangeOrdersQuery, useListSpacesQuery } from '@confighub/rtk-query';

import {
  buildConsoleRow,
  type ConsoleChangeOrder,
  type ConsoleRow,
  type ConsoleSpace,
  type ConsoleState,
} from '../x/apps/rollout/rolloutsConsoleModel';
import { changeOrderWorkflow } from '../x/apps/rollout/changeOrderWorkflow';
import { useRunningReleases } from '../x/apps/useRunningReleases';
import { useDistinctStageSpaces } from './useDistinctStageSpaces';


/**
 * One stable empty array, so a consumer's `useMemo`/`memo` deps do not churn on
 * every render that happens to have no data. A fresh `[]` is a new reference.
 */
const NO_ROWS: readonly ConsoleRow[] = [];
const NO_SLUGS: readonly string[] = [];


/**
 * Sort key for `createdAt`, oldest-safe: a missing or unparseable timestamp must
 * sort to the very end, never be mistaken for "just created" by landing at the
 * newest end of a descending sort.
 */
function createdAtSortValue(createdAt: string | undefined): number {
  if (createdAt === undefined) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(createdAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export interface RolloutConsoleData {
  /** Every rollout, newest first. Terminal rows included — hiding them is the caller's choice. */
  rows: readonly ConsoleRow[];
  /** How many rows are in each state, counted over `rows` — every state present, zero included. */
  stateCounts: Readonly<Record<ConsoleState, number>>;
  /** Every Space slug that appears on a row, for the Space filter. */
  spaceSlugs: readonly string[];
  /** Every Component slug that appears on a row, for the Component filter. */
  componentSlugs: readonly string[];
  /**
   * Space id -> the slug a reader recognises, for the Spaces a rollback names.
   *
   * The id is the honest fallback: a Space missing from this read is still a
   * Space a rollback writes into, and dropping it would make the dialog list
   * fewer Spaces than the run touches.
   */
  spaceLabel: (spaceId: string) => string;
  /**
   * Records the server returned that could not be built into a row, and were
   * therefore not shown.
   *
   * ⚠️ COUNTED, NOT JUST SKIPPED, and the distinction is the whole point. A
   * guard that drops a record silently turns "we could not read this" into
   * "this does not exist" — and a list is read as complete. The reader has no
   * way to tell a fleet of nine from a fleet of ten with one unreadable.
   *
   * Non-zero should be rare and means the server sent a ChangeOrder with no id
   * or no slug, or a Space with no id or no slug. It is not actionable by the
   * reader, which is exactly why it must not be silent: they need to know the
   * count is short before they trust it.
   */
  unreadable: { orders: number; spaces: number };
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  /**
   * When the newer of the two reads last came back, as epoch ms, or null before
   * either has. Fed by RTK's `fulfilledTimeStamp`, so it survives a failed
   * refresh: a refetch that errors leaves this at the last SUCCESS, which is
   * what "the rollouts below are from the last successful load" has to mean.
   */
  lastLoadedAt: number | null;
  refetch: () => void;
}

/** Every state, so a count of zero is a rendered zero rather than a missing key. */
const ZERO_COUNTS: Readonly<Record<ConsoleState, number>> = {
  ready: 0,
  degraded: 0,
  blocked: 0,
  held: 0,
  progressing: 0,
  complete: 0,
  'complete-unverified': 0,
  aborted: 0,
  'no-workflow': 0,
  'no-stages': 0,
  unknown: 0,
};

export function useRolloutConsole(): RolloutConsoleData {
  const orders = useListAllChangeOrdersQuery({});
  const spaces = useListSpacesQuery({});
  const { componentById } = useComponentSlugs();

  const { consoleSpaces, unreadableSpaces } = useMemo(() => {
    let unreadableSpaces = 0;
    const consoleSpaces: ConsoleSpace[] = (spaces.data ?? []).flatMap((entry) => {
        const space = entry.Space;
        // Cannot be placed in a stage without an id, cannot be named without a
        // slug. Counted on the way out — see `unreadable`.
        if (space?.SpaceID === undefined || space.Slug === undefined) {
          unreadableSpaces += 1;
          return [];
        }
        return [
          {
            spaceId: space.SpaceID,
            slug: space.Slug,
            displayName: space.DisplayName,
            labels: space.Labels,
            annotations: space.Annotations,
            releaseTargetId: space.ReleaseTargetID,
            component: space.ComponentID ? componentById.get(space.ComponentID) : undefined,
          },
        ];
      });
    return { consoleSpaces, unreadableSpaces };
  }, [spaces.data, componentById]);

  const { built, unreadableOrders } = useMemo(() => {
    let unreadableOrders = 0;
    const built = (orders.data ?? []).flatMap((entry) => {
      const order = entry.ChangeOrder;
      // Half a row is worse than no row: without an id it cannot be opened, and
      // without a slug it cannot be named. Dropped rather than rendered blank —
      // but COUNTED, so the list can say it is short instead of looking whole.
      if (order?.ChangeOrderID === undefined || order.Slug === undefined) {
        unreadableOrders += 1;
        return [];
      }

      const consoleOrder: ConsoleChangeOrder = {
        changeOrderId: order.ChangeOrderID,
        slug: order.Slug,
        displayName: order.DisplayName,
        spaceId: order.SpaceID,
        // `SpaceSlug` comes from the ChangeOrder itself. The `Space` sibling on
        // `ExtendedChangeOrderRead` is declared in the generated types but is
        // NOT populated by the list endpoint, so reading it alone typechecked
        // and was always undefined.
        spaceSlug: order.SpaceSlug ?? entry.Space?.Slug,
        createdAt: order.CreatedAt,
        // Passed through exactly as they arrived. `undefined` is load-bearing:
        // it is what tells `deriveProgress` the server did not answer, as
        // distinct from answering "nothing has moved". Defaulting any of these
        // to `[]` is the boolean-collapse this module exists to prevent.
        resolvedSpaceIds: order.ResolvedSpaceIDs,
        releasedSpaceIds: order.ReleasedSpaceIDs,
        restoredSpaceIds: order.RestoredSpaceIDs,
        releasedRestoredSpaceIds: order.ReleasedRestoredSpaceIDs,
        // The Release that released the change in each Space, which the Healthy
        // gate reads. Derived only for a read of the whole row, as this one is.
        releases: order.Releases,
        // What the two above are measured against, and the third term of
        // stage membership — see `buildRolloutSequence`.
        inScopeSpaceIds: order.InScopeSpaceIDs,
        annotations: order.Annotations,
        // The workflow's rules travel with the order, so every row is governed
        // or not from this one response — no second read, and nothing to
        // deduplicate across rows.
        governing: changeOrderWorkflow(order),
        abortedReason: order.AbortedReason,
        stage: order.Stage,
        state: order.State,
        restoreTagId: order.RestoreTagID,
        // What says which Units of a Space this rollout covers, and so what a
        // rollback restores there and what a promote clones. Every row-level
        // write needs it, and a row carrying `undefined` refuses rather than
        // assuming the change covers the whole base Space.
        startTagId: order.StartTagID,
      };
      return [consoleOrder];
    });
    return { built, unreadableOrders };
  }, [orders.data]);

  // ONE REQUEST PER DISTINCT STAGE CLAUSE, NOT PER ROW. The rows go in rather
  // than the workflows, since only the governed ones have stages to ask about.
  const { stageSpacesByClause, isLoading: stageSpacesLoading } = useDistinctStageSpaces(built);

  // The Release each staged Space is running, for its live status: one search
  // over the Spaces some rollout is headed for, rather than every Space in the
  // org. A stage's members are always among its ChangeOrder's in-scope Spaces,
  // and the clause answers are not yet narrowed to them, so this reads the
  // in-scope sets of the governed rows instead.
  const stagedSpaces = useMemo(() => {
    const bySpaceId = new Map(consoleSpaces.map((space) => [space.spaceId, space]));
    const staged = new Map<string, ConsoleSpace>();
    for (const order of built) {
      if (order.governing.state !== 'governed') continue;
      for (const spaceId of order.inScopeSpaceIds ?? []) {
        const space = bySpaceId.get(spaceId);
        if (space) staged.set(space.spaceId, space);
      }
    }
    return [...staged.values()];
  }, [consoleSpaces, built]);
  const releases = useRunningReleases(stagedSpaces);

  const spacesWithReleases: ConsoleSpace[] = useMemo(() => {
    if (!releases.loaded) return consoleSpaces;
    return consoleSpaces.map((space) =>
      space.releaseTargetId === undefined
        ? space
        : { ...space, release: releases.bySpaceId.get(space.spaceId) ?? null },
    );
  }, [consoleSpaces, releases.loaded, releases.bySpaceId]);

  const rows: readonly ConsoleRow[] = useMemo(() => {
    if (spacesWithReleases.length === 0 || built.length === 0) return NO_ROWS;
    const rows = built.map((order) => buildConsoleRow(order, spacesWithReleases, stageSpacesByClause));
    rows.sort((a, b) => createdAtSortValue(b.createdAt) - createdAtSortValue(a.createdAt));
    return rows;
  }, [built, spacesWithReleases, stageSpacesByClause]);

  const unreadable = useMemo(
    () => ({ orders: unreadableOrders, spaces: unreadableSpaces }),
    [unreadableOrders, unreadableSpaces],
  );

  const stateCounts = useMemo(() => {
    const counts = { ...ZERO_COUNTS };
    for (const row of rows) counts[row.state] += 1;
    return counts;
  }, [rows]);

  const spaceSlugs: readonly string[] = useMemo(() => {
    const slugs = new Set<string>();
    for (const row of rows) if (row.spaceSlug !== undefined) slugs.add(row.spaceSlug);
    if (slugs.size === 0) return NO_SLUGS;
    return [...slugs].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const componentSlugs: readonly string[] = useMemo(() => {
    const slugs = new Set<string>();
    for (const row of rows) if (row.appName !== undefined) slugs.add(row.appName);
    if (slugs.size === 0) return NO_SLUGS;
    return [...slugs].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const spaceLabel = useMemo(() => {
    const slugBySpaceId = new Map(consoleSpaces.map((space) => [space.spaceId, space.slug]));
    return (spaceId: string) => slugBySpaceId.get(spaceId) ?? spaceId;
  }, [consoleSpaces]);

  // The OLDER of the two, not the newer: the page shows both reads together, so
  // its age is the age of the staler half. Reporting the fresher one would
  // overstate how current the screen is, which is the opposite of the point.
  const lastLoadedAt = useMemo(() => {
    const stamps = [orders.fulfilledTimeStamp, spaces.fulfilledTimeStamp];
    if (stamps.some((s) => s === undefined)) return null;
    return Math.min(...(stamps as number[]));
  }, [orders.fulfilledTimeStamp, spaces.fulfilledTimeStamp]);

  // Stable identity, so a `memo()`'d consumer is not re-rendered by the mere act
  // of this hook running.
  const refetchReleases = releases.refetch;
  const refetch = useCallback(() => {
    void orders.refetch();
    void spaces.refetch();
    refetchReleases();
  }, [orders, spaces, refetchReleases]);

  return useMemo(
    () => ({
      rows,
      stateCounts,
      spaceSlugs,
      componentSlugs,
      spaceLabel,
      unreadable,
      // Workflow resolution counts as loading, so no row is ever shown against
      // stage Spaces that have not resolved yet.
      isLoading: orders.isLoading || spaces.isLoading || stageSpacesLoading,
      isFetching: orders.isFetching || spaces.isFetching || releases.isFetching,
      error: orders.error ?? spaces.error ?? releases.error,
      lastLoadedAt,
      refetch,
    }),
    [
      rows,
      stateCounts,
      spaceSlugs,
      componentSlugs,
      spaceLabel,
      unreadable,
      stageSpacesLoading,
      orders.isLoading,
      spaces.isLoading,
      orders.isFetching,
      spaces.isFetching,
      releases.isFetching,
      orders.error,
      spaces.error,
      releases.error,
      lastLoadedAt,
      refetch,
    ],
  );
}
