// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Dashboard-only `listSpaces` endpoint with a longer cache lifetime.
 *
 * RTK Query's `keepUnusedDataFor` is an endpoint-level setting baked in at
 * `injectEndpoints` time — it is not a per-hook-call option, so
 * `useListSpacesQuery(arg, { keepUnusedDataFor: ... })` is rejected by the
 * generated hook's types (and silently ignored even if it weren't). The
 * generated `listSpaces` endpoint (`confighubapi.gen.ts`) is shared by many
 * other pages — SpaceListPage, TargetListPage, InitiativesPage, and others —
 * each with their own caching expectations, so raising its cache lifetime
 * globally would change behavior well outside the Components dashboard.
 *
 * Instead, this injects a second endpoint that issues the exact same request
 * as `listSpaces` (same URL, same params, same `Space` tag so mutations
 * elsewhere still invalidate it correctly) but configured with a longer
 * `keepUnusedDataFor`, so a brief navigate-away-and-back from `/components`
 * serves cache instead of forcing a cold refetch — without touching any other
 * page's cache lifetime.
 */
import {
  confighubApi,
  type ListSpacesApiArg,
  type ListSpacesApiResponse,
} from '@confighub/rtk-query';

/**
 * How long RTK Query keeps these queries' cache warm after the last
 * subscriber unmounts (generated endpoints default to 60s). A dashboard
 * visitor who drills into a component and comes back within a few minutes
 * should see the cached list instantly rather than a full cold refetch;
 * nobody expects sub-minute freshness on cold return anyway, since the live
 * poll (see `useComponentSpaces.ts`) only runs while the page is mounted. 5
 * minutes comfortably covers a "look at one component, come back" round trip
 * without holding stale data indefinitely.
 */
export const COMPONENT_SPACES_KEEP_UNUSED_DATA_FOR_SECONDS = 300;

const componentSpacesApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    listComponentSpaces: build.query<ListSpacesApiResponse, ListSpacesApiArg>({
      query: (queryArg) => ({
        url: `/space`,
        params: {
          where: queryArg.where,
          filter: queryArg.filter,
          contains: queryArg.contains,
          include: queryArg.include,
          select: queryArg.select,
          summary: queryArg.summary,
        },
      }),
      providesTags: ['Space'],
      keepUnusedDataFor: COMPONENT_SPACES_KEEP_UNUSED_DATA_FOR_SECONDS,
    }),
  }),
  overrideExisting: false,
});

export const { useListComponentSpacesQuery } = componentSpacesApi;
