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
 */

import {
  confighubApi,
  type ListAllRevisionsApiResponse,
  type SearchListLinksApiResponse,
  type SearchUnitDiffApiResponse,
} from '@confighub/rtk-query';

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

/** ChangeSetID is what `include` expands, so it has to be selected for the ChangeSet to come back. */
const CHANGE_SET_REVISION_SELECT = 'RevisionID,UnitID,SpaceID,RevisionNum,CreatedAt,ChangeSetID';

const changeOrderImageDiffApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    getChangeOrderSourceDiff: build.query<SearchUnitDiffApiResponse, ChangeOrderImageDiffArgs>({
      query: ({ baseSpaceId, changeOrderId }) => ({
        url: '/unit_diff',
        params: {
          where: `SpaceID = '${baseSpaceId}'`,
          from: `Before:ChangeOrder:${changeOrderId}`,
          to: `ChangeOrder:${changeOrderId}`,
          // The unchanged siblings of each changed container: where `restartPolicy: Always`
          // marks an init container as a native sidecar.
          include: 'Context',
        },
      }),
    }),
    // A fan-out ChangeOrder's change is made in source Units outside its own Space, where the read above
    // sees nothing. The same diff, over the Units its Tags mark.
    getFanOutSourceDiff: build.query<SearchUnitDiffApiResponse, FanOutSourceDiffArgs>({
      query: ({ changeOrderId, unitIds }) => ({
        url: '/unit_diff',
        params: {
          where: `UnitID IN (${unitIds.map((id) => `'${id}'`).join(', ')})`,
          from: `Before:ChangeOrder:${changeOrderId}`,
          to: `ChangeOrder:${changeOrderId}`,
          include: 'Context',
        },
      }),
    }),
    // What the ChangeOrder wrote into each of these Units: a promotion puts the start Tag on the Unit's head
    // before it writes and the end Tag on what it writes, so the two name its change in every Unit it reached.
    getChangeOrderUnitDiff: build.query<SearchUnitDiffApiResponse, ChangeOrderUnitDiffArgs>({
      query: ({ changeOrderId, unitIds }) => ({
        url: '/unit_diff',
        params: {
          where: `UnitID IN (${unitIds.map((id) => `'${id}'`).join(', ')})`,
          from: `Before:ChangeOrder:${changeOrderId}`,
          to: `ChangeOrder:${changeOrderId}`,
          include: 'Context',
        },
      }),
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

export const {
  useGetChangeOrderSourceDiffQuery,
  useGetChangeOrderUnitDiffQuery,
  useGetFanOutSourceDiffQuery,
  useGetFanOutSourceRevisionsQuery,
  useGetFanOutSourceLinksQuery,
  useGetChangeOrderChangeSetRevisionsQuery,
} = changeOrderImageDiffApi;
