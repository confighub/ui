// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The diffs a ChangeOrder made: at its source, for the image change it shows, and in
 * the Units a stage has taken, for what the promotion wrote.
 *
 * The same `GET /api/unit_diff` as the generated `searchUnitDiff`, without its
 * `Unit` tag. That tag makes every Unit write (a patch, an upload, an invoke)
 * refetch every cached diff, and the ChangeOrders list caches one diff over a
 * whole base Space per row it has shown. A ChangeOrder's own Revisions do not
 * change once made, so nothing needs to invalidate this read.
 *
 * And the reads a ChangeOrder that does not exist yet needs: the change it would carry,
 * between two numbered Revisions of each Unit, untagged for the same reason; the base's
 * Revisions, every page of them, tagged so a write to the base reaches the draft; and the
 * server's answer to creating it, as a dry run, keyed on what the draft rests on.
 */

import {
  confighubApi,
  type ChangeOrder,
  type CreateChangeOrderApiResponse,
  type ListAllRevisionsApiResponse,
  type SearchListLinksApiResponse,
  type SearchUnitDiffApiResponse,
  type UnitDiff,
} from '@confighub/rtk-query';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { fetchAllPages, MAX_PARALLEL_CHUNKS } from '@/hooks/chunkedQueriesApi';

import { SOURCE_REVISION_LIMIT } from '../x/apps/change-order/useFanOutSource';

export interface ChangeOrderImageDiffArgs {
  baseSpaceId: string;
  changeOrderId: string;
}

export interface ChangeOrderUnitDiffArgs {
  changeOrderId: string;
  unitIds: string[];
}

export interface FanOutSourceDiffArgs {
  changeOrderId: string;
  /** The source Units: the ones the ChangeOrder's Tags mark outside its scope. */
  unitIds: string[];
}

/** One Unit's change between two of its Revisions, by number or in the `--restore` syntax. */
export interface DraftUnitDiffItem {
  unitId: string;
  from: string;
  to: string;
}

export interface DraftSourceDiffArgs {
  /** The Space the Units are in. */
  spaceId: string;
  diffs: DraftUnitDiffItem[];
}

export interface DraftUnitDiffArgs extends DraftUnitDiffItem {
  spaceId: string;
}

export interface DraftCreateDryRunArgs {
  spaceId: string;
  changeOrder: ChangeOrder;
  /**
   * What the answer rests on besides the request: each base Unit's start and end
   * (`unitId@start-end`). Not sent; it keys the answer, so a write to the base that moves a
   * Unit's head or a variant's pointer asks again instead of reading the old answer.
   */
  basis?: string;
}

export interface DraftRevisionsArgs {
  /** One read per clause, each to its last page. */
  wheres: string[];
  select: string;
  include?: string;
}

/** At most this many per-Unit diffs are in flight for one read. */
const MAX_PARALLEL_UNIT_DIFFS = 4;

/** Run `work` over `items`, at most `parallel` at a time, results in item order. */
async function inParallel<T, R>(
  items: readonly T[],
  parallel: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, () => worker()));
  return results;
}

/** The server's own error body for a failed per-Unit read, when it sent one. */
function unitDiffErrorOf(unitId: string, error: FetchBaseQueryError): UnitDiff {
  const data = error.data as { Error?: UnitDiff['Error']; message?: string } | undefined;
  const status = typeof error.status === 'number' ? error.status : undefined;
  return {
    UnitID: unitId,
    Error: data?.Error ?? {
      Message: data?.message ?? 'The diff could not be read',
      Status: status,
    },
  };
}

/** ChangeSetID is what `include` expands, so it has to be selected for the ChangeSet to come back. */
const CHANGE_SET_REVISION_SELECT = 'RevisionID,UnitID,SpaceID,RevisionNum,CreatedAt,ChangeSetID';

/** A ChangeOrder's change in the Units `where` selects: from the Revision before it to its own. */
function changeOrderDiffQuery(where: string, changeOrderId: string) {
  return {
    url: '/unit_diff',
    params: {
      where,
      from: `Before:ChangeOrder:${changeOrderId}`,
      to: `ChangeOrder:${changeOrderId}`,
      // The unchanged siblings of each changed container: where `restartPolicy: Always`
      // marks an init container as a native sidecar.
      include: 'Context',
    },
  };
}

function unitIdsWhere(unitIds: readonly string[]): string {
  return `UnitID IN (${unitIds.map((id) => `'${id}'`).join(', ')})`;
}

const changeOrderImageDiffApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    /*
     * What creating the ChangeOrder would do, and every refusal it would meet, with nothing
     * written: the server runs the create and rolls it back. A query rather than the generated
     * `createChangeOrder` mutation, which invalidates `ChangeOrder` even on a dry run and so
     * refetches every ChangeOrder list on each keystroke of a draft; and keyed on the draft,
     * so asking again about the same decisions reads the answer already had.
     *
     * The ids in the answer (`ChangeOrderID`, its Tags) were rolled back with it and name
     * nothing.
     */
    /*
     * The base's Revisions, every page of each clause: a draft lists every change waiting, so
     * a read cut at a page would leave changes off the ribbon with nothing to say so. Tagged
     * `Revision`, so a change made in the base while the draft is open reaches it.
     */
    getDraftRevisions: build.query<ListAllRevisionsApiResponse, DraftRevisionsArgs>({
      queryFn: async ({ wheres, select, include }, _api, _extra, baseQuery) => {
        const pages = await inParallel(wheres, MAX_PARALLEL_CHUNKS, (where) =>
          fetchAllPages<ListAllRevisionsApiResponse[number]>(
            { url: '/revision', params: { where, distinct_on: 'Off', select, include } },
            baseQuery,
          ),
        );
        const rows: ListAllRevisionsApiResponse = [];
        for (const page of pages) {
          if (page.error !== undefined) return { error: page.error };
          rows.push(...page.data);
        }
        return { data: rows };
      },
      providesTags: ['Revision'],
    }),
    getDraftCreateDryRun: build.query<CreateChangeOrderApiResponse, DraftCreateDryRunArgs>({
      query: ({ spaceId, changeOrder }) => ({
        url: `/space/${spaceId}/change_order`,
        method: 'POST',
        body: changeOrder,
        params: { dry_run: true },
      }),
      keepUnusedDataFor: 30,
    }),
    getChangeOrderSourceDiff: build.query<SearchUnitDiffApiResponse, ChangeOrderImageDiffArgs>({
      query: ({ baseSpaceId, changeOrderId }) => changeOrderDiffQuery(`SpaceID = '${baseSpaceId}'`, changeOrderId),
    }),
    // A fan-out ChangeOrder's change is made in source Units outside its own Space, where the read above
    // sees nothing. The same diff, over the Units its Tags mark.
    getFanOutSourceDiff: build.query<SearchUnitDiffApiResponse, FanOutSourceDiffArgs>({
      query: ({ changeOrderId, unitIds }) => changeOrderDiffQuery(unitIdsWhere(unitIds), changeOrderId),
    }),
    // What the ChangeOrder wrote into each of these Units: a promotion puts the start Tag on the Unit's head
    // before it writes and the end Tag on what it writes, so the two name its change in every Unit it reached.
    getChangeOrderUnitDiff: build.query<SearchUnitDiffApiResponse, ChangeOrderUnitDiffArgs>({
      query: ({ changeOrderId, unitIds }) => changeOrderDiffQuery(unitIdsWhere(unitIds), changeOrderId),
    }),
    // The two reads that find the source Units and the paths the Links carry, as `useFanOutSource` makes them, but
    // untagged: a Revision or a Link written elsewhere must not refetch what a ChangeOrder's list row shows.
    getFanOutSourceRevisions: build.query<ListAllRevisionsApiResponse, { where: string }>({
      query: ({ where }) => ({
        url: '/revision',
        params: {
          where,
          distinct_on: 'Off',
          limit: SOURCE_REVISION_LIMIT,
          select: 'RevisionID,UnitID,SpaceID,RevisionNum,Tags',
        },
      }),
    }),
    getFanOutSourceLinks: build.query<SearchListLinksApiResponse, { where: string }>({
      query: ({ where }) => ({ url: '/link', params: { where } }),
    }),
    // The Revisions at the source made in a ChangeSet, with the ChangeSet expanded: the change as its
    // author grouped it, named and described there. Untagged for the same reason as the reads above.
    getChangeOrderChangeSetRevisions: build.query<ListAllRevisionsApiResponse, { where: string }>({
      query: ({ where }) => ({
        url: '/revision',
        params: {
          where,
          distinct_on: 'Off',
          limit: SOURCE_REVISION_LIMIT,
          select: CHANGE_SET_REVISION_SELECT,
          include: 'ChangeSetID',
        },
      }),
    }),
  }),
  overrideExisting: false,
});

/*
 * One Unit's change between two numbered Revisions: `GET .../unit/<id>/diff`. Its own cache
 * entry, so the change cards and the hero, which ask about overlapping Revisions, and a ribbon
 * that gains one card, read what they already have. A Revision does not change once made.
 */
const draftUnitDiffApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    getDraftUnitDiff: build.query<UnitDiff, DraftUnitDiffArgs>({
      query: ({ spaceId, unitId, from, to }) => ({
        url: `/space/${spaceId}/unit/${unitId}/diff`,
        // Context: the unchanged siblings of each changed container, which name it.
        params: { from, to, include: 'Context' },
      }),
    }),
  }),
  overrideExisting: false,
});

/*
 * A change that is no ChangeOrder's yet, Unit by Unit: each Unit from the Revision its
 * variants have taken to the one the change would end at. The bulk `unit_diff` takes only
 * selectors that name a Revision in every Unit (a Tag, a ChangeSet, the head), and where each
 * Unit's change starts is a number of its own, so this reads each through `getDraftUnitDiff`
 * and answers with the bulk read's shape. A Unit whose read fails carries its error, as the
 * bulk read reports one, so the image summary reads as unavailable rather than "no change".
 */
const draftSourceDiffApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    getDraftSourceDiff: build.query<SearchUnitDiffApiResponse, DraftSourceDiffArgs>({
      queryFn: async ({ spaceId, diffs }, api) => {
        const readOne = async (item: DraftUnitDiffItem): Promise<UnitDiff> => {
          const result = await api.dispatch(
            draftUnitDiffApi.endpoints.getDraftUnitDiff.initiate(
              { spaceId, ...item },
              { subscribe: false },
            ),
          );
          if (result.error !== undefined) {
            return unitDiffErrorOf(item.unitId, result.error as FetchBaseQueryError);
          }
          return { ...(result.data as UnitDiff), UnitID: item.unitId };
        };
        const data = await inParallel(diffs, MAX_PARALLEL_UNIT_DIFFS, readOne);
        return { data };
      },
    }),
  }),
  overrideExisting: false,
});

export const { useGetDraftSourceDiffQuery } = draftSourceDiffApi;

export const {
  useGetDraftRevisionsQuery,
  useGetDraftCreateDryRunQuery,
  useGetChangeOrderSourceDiffQuery,
  useGetChangeOrderUnitDiffQuery,
  useGetFanOutSourceDiffQuery,
  useGetFanOutSourceRevisionsQuery,
  useGetFanOutSourceLinksQuery,
  useGetChangeOrderChangeSetRevisionsQuery,
} = changeOrderImageDiffApi;
