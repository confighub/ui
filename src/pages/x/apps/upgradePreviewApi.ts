// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The upgrade merge preview: a dry-run `PATCH /unit?upgrade=true`.
 *
 * The generated `bulkPatchUnits` invalidates Unit, Revision, Mutation and
 * ChangeSet (see `invalidationMap.ts`), and a dry run through it does too,
 * although it writes nothing. On a Component with a hundred Deployments that
 * refetched every Unit and their data (several MB) on each click of a card
 * with changes to preview. This endpoint sends the same request and
 * invalidates nothing.
 *
 * The Content-Type is set here, not left to the shared `prepareHeaders`: that
 * sets merge-patch+json only for endpoint names with a patch prefix, and the
 * server rejects a PATCH /unit of any other type with HTTP 400.
 */
import { MAX_PARALLEL_CHUNKS } from '@/hooks/chunkedQueriesApi';
import { DEFAULT_MAX_ENCODED_WHERE, chunkIds, inClause } from '@/hooks/inClauseChunks';
import {
  type BulkPatchUnitsApiArg,
  type BulkPatchUnitsApiResponse,
  type UnitCreateOrUpdateResponseRead,
  confighubApi,
} from '@confighub/rtk-query';
import { type FetchBaseQueryError, defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

type UpgradePreviewArg = Pick<
  BulkPatchUnitsApiArg,
  'where' | 'include' | 'body' | 'changeSetId' | 'mergeEnd' | 'squash'
>;

/** The upgrade dry run over every Unit of some Spaces whose upstream is one of some Units. */
export interface UpgradePreviewOverSpacesArg {
  /** The Spaces to preview. Sent in chunks, so any number of them fits the query-string limit. */
  spaceIds: string[];
  /** Only the Units of those Spaces whose upstream is one of these. */
  upstreamUnitIds: string[];
  /**
   * How far along the upstream to take the upgrade, in the `merge_end` syntax (`Tag:<id>`,
   * `ChangeSet:<id>`, a number). Absent is the upstream's head.
   */
  mergeEnd?: string;
  /** Merge the range as one rebased Revision instead of replaying it Revision by Revision. */
  squash?: boolean;
  include: string;
  /**
   * What the answer rests on besides these arguments (the base Units' ranges, say). Not
   * sent; it keys the cache entry, so a write upstream asks again instead of reading the old
   * answer.
   */
  basis?: string;
}

/** Spaces per request, at most: the server answers a request whole, so smaller is sooner. */
const SPACES_PER_REQUEST = 50;

const encodedLength = (text: string) => encodeURIComponent(text).length;

/**
 * The `where` clauses that cover every Space × upstream Unit pair once, each under the
 * query-string budget with both IN lists in it: the upstream list is cut first (at half the
 * budget), and each piece of it leaves the Space list what remains.
 */
export function upgradePreviewWheres(
  spaceIds: readonly string[],
  upstreamUnitIds: readonly string[],
  budget = DEFAULT_MAX_ENCODED_WHERE,
): string[] {
  const wheres: string[] = [];
  for (const upstream of chunkIds('UpstreamUnitID', upstreamUnitIds, {
    maxEncodedLength: budget / 2,
  })) {
    const upstreamClause = ` AND ${inClause('UpstreamUnitID', upstream)}`;
    const left = budget - encodedLength(upstreamClause);
    for (const spaces of chunkIds('SpaceID', spaceIds, {
      maxEncodedLength: left,
      maxItems: SPACES_PER_REQUEST,
    })) {
      wheres.push(`${inClause('SpaceID', spaces)}${upstreamClause}`);
    }
  }
  return wheres;
}

/** Order-free, so the same Spaces and Units in another order share one cache entry. */
const sortedSet = (ids: readonly string[] | undefined): string[] =>
  [...new Set(ids ?? [])].sort();

const upgradePreviewApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    previewUnitUpgrade: build.mutation<BulkPatchUnitsApiResponse, UpgradePreviewArg>({
      query: (queryArg) => ({
        url: `/unit`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/merge-patch+json' },
        body: queryArg.body,
        params: {
          where: queryArg.where,
          include: queryArg.include,
          upgrade: true,
          dry_run: true,
          change_set_id: queryArg.changeSetId,
          merge_end: queryArg.mergeEnd,
          squash: queryArg.squash,
        },
      }),
    }),
    /*
     * The same dry run as a query, for a preview keyed on what it previews: a page that asks
     * again for the same Spaces, Units and end reads the cached answer instead of sending the
     * request again, and needs no effect to send it. Nothing provides or invalidates a tag,
     * for the reason the file header gives.
     */
    getUnitUpgradePreview: build.query<
      UnitCreateOrUpdateResponseRead[],
      UpgradePreviewOverSpacesArg
    >({
      queryFn: async (arg, _api, _extra, baseQuery) => {
        const wheres = upgradePreviewWheres(
          sortedSet(arg.spaceIds),
          sortedSet(arg.upstreamUnitIds),
        );
        const answers: (UnitCreateOrUpdateResponseRead[] | undefined)[] = new Array(
          wheres.length,
        );
        let next = 0;
        let failure: FetchBaseQueryError | undefined;
        const worker = async () => {
          while (next < wheres.length && failure === undefined) {
            const index = next++;
            const result = await baseQuery({
              url: `/unit`,
              method: 'PATCH',
              headers: { 'Content-Type': 'application/merge-patch+json' },
              // Pre-stringified: the merge-patch body is sent as it is.
              body: JSON.stringify({}),
              params: {
                where: wheres[index],
                include: arg.include,
                upgrade: true,
                dry_run: true,
                merge_end: arg.mergeEnd,
                squash: arg.squash,
              },
            });
            if (result.error) failure = result.error;
            else
              answers[index] =
                (result.data as UnitCreateOrUpdateResponseRead[] | undefined) ?? [];
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(MAX_PARALLEL_CHUNKS, wheres.length) }, () => worker()),
        );
        // A partial answer would read as the whole scope: one failed request fails the read.
        if (failure !== undefined) return { error: failure };
        return { data: answers.flatMap((answer) => answer ?? []) };
      },
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: {
            ...queryArgs,
            spaceIds: sortedSet(queryArgs.spaceIds),
            upstreamUnitIds: sortedSet(queryArgs.upstreamUnitIds),
          },
        }),
    }),
  }),
  overrideExisting: false,
});

export const { usePreviewUnitUpgradeMutation, useGetUnitUpgradePreviewQuery } =
  upgradePreviewApi;
