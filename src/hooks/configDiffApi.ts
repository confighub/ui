// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The server's ConfigDiff, read two ways: one Unit between two of its Revisions, and any two
 * configurations (`POST /diff`).
 *
 * Injected rather than the generated `getUnitDiff`, `searchUnitDiff` and `diffConfigurations`.
 * The first two provide the `Unit` tag, so every Unit write anywhere (a patch, an upload, an
 * invoke) refetches every diff in the cache, and `diffConfigurations` is a mutation that
 * invalidates `Unit`, so each read would refetch the rest. A numbered Revision does not change
 * once made, so these reads are tagged only by the selectors that can move: a Unit's head or
 * last-released Revision, a ChangeSet or Tag that a later write can extend, or a Release that
 * can be withdrawn.
 */
import {
  confighubApi,
  type DiffRequest,
  type DiffResult,
  type DiffSide,
  type UnitDiff,
} from '@confighub/rtk-query';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { type ChunkBaseQuery } from '@/hooks/chunkedQueriesApi';
import { getApiErrorMessage } from '@/utility/error-functions';

/** The selector of a Unit's head, which `to` and a Unit side without a Revision default to. */
export const HEAD_REVISION = 'HeadRevisionNum';

type DiffTag = 'Unit' | 'Release';

/**
 * The tags a Revision selector's answer can go stale on. A number, a Revision ID and a
 * ChangeOrder name Revisions that stay as they are, so they need none.
 */
function selectorTags(selector: string): DiffTag[] {
  const name = selector.startsWith('Before:') ? selector.slice('Before:'.length) : selector;
  if (name === 'HeadRevisionNum' || name === 'LastReleasedRevisionNum') return ['Unit'];
  const kind = name.includes(':') ? name.slice(0, name.indexOf(':')) : undefined;
  switch (kind) {
    case 'Release':
      return ['Release'];
    // An open ChangeSet ends at the head of each of its Units, and a write can carry a Tag.
    case 'ChangeSet':
    case 'Tag':
      return ['Unit'];
    default:
      return [];
  }
}

function tagsOf(selectors: readonly string[]): DiffTag[] {
  return Array.from(new Set(selectors.flatMap(selectorTags)));
}

/** A side that names no Unit and holds no inline Data: no configuration at all. */
function isNothing(side: DiffSide | undefined): boolean {
  return !side?.UnitID && !side?.Data;
}

/** The selectors a `POST /diff` side reads through: a Unit side's Revision, or its head. */
function sideSelectors(side: DiffSide | undefined): string[] {
  if (!side?.UnitID) return [];
  return [side.Revision || HEAD_REVISION];
}

/**
 * True when a `getConfigDiff` from nothing found nothing on the To side either: the Revision
 * it names does not exist, such as a Release that bundled no Revision of the Unit. The server
 * always names the To side it resolved, so only this answer has none.
 */
export function isNothingToDiff(result: DiffResult): boolean {
  return result.To === undefined;
}

/**
 * True for the 404 that says the To side's Revision selector named no Revision of its Unit,
 * such as a Release that bundled none. The server prefixes that error with the side, as
 * `To: <why>`. Its other 404, `To Unit <id> not found`, is a Unit that is gone, which is a
 * failure and not an empty side.
 */
function isNoToRevision(error: FetchBaseQueryError): boolean {
  return error.status === 404 && getApiErrorMessage(error, '').startsWith('To: ');
}

/**
 * One `POST /diff`. From nothing, a To side that names no Revision either is no change rather
 * than a failure: the answer is an empty result, which `isNothingToDiff` recognises. Every
 * other error, a To Unit that is not found included, is the error it says.
 */
export async function fetchConfigDiff(
  baseQuery: ChunkBaseQuery,
  diffRequest: DiffRequest,
  include?: string,
): Promise<{ data: DiffResult } | { error: FetchBaseQueryError }> {
  const result = await baseQuery({ url: '/diff', method: 'POST', params: { include }, body: diffRequest });
  if (result.error) {
    const error = result.error as FetchBaseQueryError;
    if (isNothing(diffRequest.From) && isNoToRevision(error)) return { data: {} };
    return { error };
  }
  return { data: result.data as DiffResult };
}

export interface RevisionDiffArgs {
  spaceId: string;
  unitId: string;
  /** The From Revision; the server's default is the Revision before `to`, or nothing before the first. */
  from?: string;
  /** The To Revision; the server's default is the head. */
  to?: string;
  /** Comma-separated diff options: Attribution, Unchanged, Context. */
  include?: string;
}

export interface ConfigDiffArgs {
  /** Each side is a Unit at a Revision (its head without one), inline Data, or `{}` for nothing. */
  diffRequest: DiffRequest;
  /** Comma-separated diff options: Attribution, Unchanged, Context. */
  include?: string;
}

export const configDiffApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    /** `GET /space/{spaceId}/unit/{unitId}/diff`. */
    getRevisionDiff: build.query<UnitDiff, RevisionDiffArgs>({
      query: ({ spaceId, unitId, from, to, include }) => ({
        url: `/space/${spaceId}/unit/${unitId}/diff`,
        params: { from, to, include },
      }),
      providesTags: (_result, _error, { from, to }) =>
        tagsOf([to ?? HEAD_REVISION, ...(from !== undefined ? [from] : [])]),
    }),

    /**
     * `POST /diff`, a read the server serves as a POST only because inline Data does not fit
     * in a query string.
     */
    getConfigDiff: build.query<DiffResult, ConfigDiffArgs>({
      queryFn: ({ diffRequest, include }, _api, _extra, baseQuery) =>
        fetchConfigDiff(baseQuery, diffRequest, include),
      providesTags: (_result, _error, { diffRequest }) =>
        tagsOf([...sideSelectors(diffRequest.From), ...sideSelectors(diffRequest.To)]),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetRevisionDiffQuery,
  useLazyGetRevisionDiffQuery,
  useGetConfigDiffQuery,
  useLazyGetConfigDiffQuery,
} = configDiffApi;
