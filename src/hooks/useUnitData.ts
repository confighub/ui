// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';

import {
  useDownloadRevisionDataQuery,
  useDownloadUnitDataQuery,
  useGetRevisionMutationSourcesQuery,
  useGetUnitMutationSourcesQuery,
  useLazyDownloadReleaseDataQuery,
  useLazyDownloadUnitDataQuery,
  useLazySearchRevisionDataQuery,
  useSearchRevisionDataQuery,
  useSearchRevisionMutationSourcesQuery,
  useSearchUnitDataQuery,
  useSearchUnitMutationSourcesQuery,
  useUploadUnitDataMutation,
} from '@confighub/rtk-query';

/**
 * Configuration data and mutation sources are not fields of a Unit or a Revision. They are
 * the two bulk columns, and a list of Units should not carry a copy of every document, so
 * they are read from their own endpoints. These hooks wrap the generated queries so that
 * components ask for what they need rather than reaching for a field that is not there.
 *
 * Each returns '' (or undefined) while loading, which is what every caller wants: an editor
 * with nothing in it yet, a diff with nothing to compare, a body that has not arrived.
 */

/** A Unit's configuration. Skipped until both ids are known. */
export const useUnitData = (spaceId?: string, unitId?: string) => {
  const { data, isFetching, error } = useDownloadUnitDataQuery(
    { spaceId: spaceId as string, unitId: unitId as string },
    { skip: !spaceId || !unitId },
  );
  return { data: (data as string | undefined) ?? '', isFetching, error };
};

/** A Revision's configuration. Skipped until all three ids are known. */
export const useRevisionData = (spaceId?: string, unitId?: string, revisionId?: string) => {
  const { data, isFetching, error } = useDownloadRevisionDataQuery(
    { spaceId: spaceId as string, unitId: unitId as string, revisionId: revisionId as string },
    { skip: !spaceId || !unitId || !revisionId },
  );
  return { data: (data as string | undefined) ?? '', isFetching, error };
};

/** What set each value in a Unit's configuration. */
export const useUnitMutationSources = (spaceId?: string, unitId?: string) => {
  const { data, isFetching } = useGetUnitMutationSourcesQuery(
    { spaceId: spaceId as string, unitId: unitId as string },
    { skip: !spaceId || !unitId },
  );
  return { mutationSources: data?.MutationSources ?? [], isFetching };
};

/** The Revision counterpart of useUnitMutationSources. */
export const useRevisionMutationSources = (
  spaceId?: string,
  unitId?: string,
  revisionId?: string,
) => {
  const { data, isFetching } = useGetRevisionMutationSourcesQuery(
    { spaceId: spaceId as string, unitId: unitId as string, revisionId: revisionId as string },
    { skip: !spaceId || !unitId || !revisionId },
  );
  return { mutationSources: data?.MutationSources ?? [], isFetching };
};

/**
 * Writing a Unit's configuration. It is a separate call from updating the Unit: the update
 * body has nowhere to put a configuration, which is what stops a metadata write from
 * destroying one it never fetched.
 */
export const useUploadUnitData = useUploadUnitDataMutation;

/**
 * The configuration of several Revisions in one request, keyed by RevisionID.
 *
 * This is what a diff view needs. Fetching each Revision separately would be two requests
 * per Unit -- for a change review over a fleet, hundreds -- which is the cost the
 * configuration was taken off the entity to avoid in the first place. distinct_on=Off is
 * required because the default keeps one Revision per Unit, and a diff wants two of the same
 * Unit; the explicit limit is what the server asks for in exchange.
 */
export const useRevisionDataMap = (revisionIds: (string | undefined)[]) => {
  const ids = revisionIds.filter((id): id is string => !!id);
  const where = ids.length ? `RevisionID IN (${ids.map((id) => `'${id}'`).join(', ')})` : '';
  const { data, isFetching } = useSearchRevisionDataQuery(
    { where, distinctOn: 'Off', limit: Math.max(ids.length, 1) },
    { skip: ids.length === 0 },
  );
  // Memoized on the query result, so the accessor keeps its identity between renders. A
  // caller that reads configuration inside a useMemo has to list it as a dependency -- the
  // data arrives after the entities do -- and a fresh closure every render would turn that
  // dependency into "recompute always".
  const dataFor = useMemo(() => {
    const byRevisionId = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.RevisionID) byRevisionId.set(row.RevisionID, row.Data ?? '');
    }
    return (revisionId?: string) => (revisionId && byRevisionId.get(revisionId)) || '';
  }, [data]);
  // Whether dataFor answers for every id: until the request lands it returns '' for all of
  // them, which a caller comparing configurations would read as every field changed.
  const ready = ids.length === 0 || (data !== undefined && !isFetching);
  return { dataFor, isFetching, ready };
};

/** The configuration of several Units in one request, keyed by UnitID. */
export const useUnitDataMap = (unitIds: (string | undefined)[]) => {
  const ids = unitIds.filter((id): id is string => !!id);
  const where = ids.length ? `UnitID IN (${ids.map((id) => `'${id}'`).join(', ')})` : '';
  const { data, isFetching } = useSearchUnitDataQuery({ where }, { skip: ids.length === 0 });
  // Memoized on the query result, so the accessor keeps its identity between renders. A
  // caller that reads configuration inside a useMemo has to list it as a dependency -- the
  // data arrives after the entities do -- and a fresh closure every render would turn that
  // dependency into "recompute always".
  const dataFor = useMemo(() => {
    const byUnitId = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.UnitID) byUnitId.set(row.UnitID, row.Data ?? '');
    }
    return (unitId?: string) => (unitId && byUnitId.get(unitId)) || '';
  }, [data]);
  return { dataFor, isFetching };
};

/**
 * What set each value in several Revisions' configuration, in one request, keyed by
 * RevisionID. The bulk counterpart of useRevisionMutationSources, for a view over many Units.
 */
export const useRevisionMutationSourcesMap = (revisionIds: (string | undefined)[]) => {
  const ids = revisionIds.filter((id): id is string => !!id);
  const where = ids.length ? `RevisionID IN (${ids.map((id) => `'${id}'`).join(', ')})` : '';
  const { data, isFetching } = useSearchRevisionMutationSourcesQuery(
    { where, distinctOn: 'Off', limit: Math.max(ids.length, 1) },
    { skip: ids.length === 0 },
  );
  // Memoized on the query result, so the accessor keeps its identity between renders. A
  // caller that reads configuration inside a useMemo has to list it as a dependency -- the
  // data arrives after the entities do -- and a fresh closure every render would turn that
  // dependency into "recompute always".
  const sourcesFor = useMemo(() => {
    const byRevisionId = new Map<string, NonNullable<typeof data>[number]['MutationSources']>();
    for (const row of data ?? []) {
      if (row.RevisionID) byRevisionId.set(row.RevisionID, row.MutationSources);
    }
    return (revisionId?: string) => (revisionId && byRevisionId.get(revisionId)) || [];
  }, [data]);
  return { sourcesFor, isFetching };
};

/**
 * What set each value in several Units' configuration, in one request, keyed by UnitID. The
 * bulk counterpart of useUnitMutationSources -- for a Scope-row audit ("Kept on merge N of M")
 * spanning every unit currently expanded in the pane.
 *
 * Unlike useRevisionMutationSourcesMap, no distinctOn/limit is needed: a Unit row is already
 * unique, there is no per-Unit ambiguity the way there can be several Revisions for one Unit.
 */
export const useUnitMutationSourcesMap = (unitIds: (string | undefined)[]) => {
  const ids = unitIds.filter((id): id is string => !!id);
  const where = ids.length ? `UnitID IN (${ids.map((id) => `'${id}'`).join(', ')})` : '';
  const { data, isFetching } = useSearchUnitMutationSourcesQuery({ where }, { skip: ids.length === 0 });
  // Memoized on the query result, so the accessor keeps its identity between renders. A
  // caller that reads mutation sources inside a useMemo has to list it as a dependency -- the
  // data arrives after the entities do -- and a fresh closure every render would turn that
  // dependency into "recompute always".
  const sourcesFor = useMemo(() => {
    const byUnitId = new Map<string, NonNullable<typeof data>[number]['MutationSources']>();
    for (const row of data ?? []) {
      if (row.UnitID) byUnitId.set(row.UnitID, row.MutationSources);
    }
    return (unitId?: string) => (unitId && byUnitId.get(unitId)) || [];
  }, [data]);
  return { sourcesFor, isFetching };
};

/**
 * Fetch a Unit's configuration from inside an event handler, where a query hook cannot be
 * called. Returns '' when either id is missing or the request fails, which is what the
 * callers want: a diff pane with nothing on that side rather than a thrown error.
 */
export const useLazyUnitData = () => {
  const [trigger] = useLazyDownloadUnitDataQuery();
  return useCallback(
    async (spaceId?: string, unitId?: string): Promise<string> => {
      if (!spaceId || !unitId) return '';
      try {
        return ((await trigger({ spaceId, unitId }).unwrap()) as string) ?? '';
      } catch {
        return '';
      }
    },
    [trigger],
  );
};

/**
 * Fetch several Revisions' configuration from inside an event handler or async flow, where a
 * query hook cannot be called. Returns a map keyed by RevisionID.
 */
export const useLazyRevisionDataMap = () => {
  const [trigger] = useLazySearchRevisionDataQuery();
  return useCallback(
    async (revisionIds: (string | undefined)[]): Promise<Map<string, string>> => {
      const ids = revisionIds.filter((id): id is string => !!id);
      if (ids.length === 0) return new Map();
      const where = `RevisionID IN (${ids.map((id) => `'${id}'`).join(', ')})`;
      try {
        const rows = await trigger({ where, distinctOn: 'Off', limit: ids.length }).unwrap();
        const byRevisionId = new Map<string, string>();
        for (const row of rows) {
          if (row.RevisionID) byRevisionId.set(row.RevisionID, row.Data ?? '');
        }
        return byRevisionId;
      } catch {
        return new Map();
      }
    },
    [trigger],
  );
};

/**
 * Fetch a Release's bundle from inside an async flow. The bundle is not on the Release --
 * a list of Releases should not carry a copy of every tarball -- so it is read from the
 * Release's data endpoint. Returns undefined when it cannot be read, which callers treat as
 * "unknown" rather than "empty".
 */
export const useLazyReleaseBundle = () => {
  const [trigger] = useLazyDownloadReleaseDataQuery();
  return useCallback(
    async (spaceId?: string, releaseId?: string): Promise<string | undefined> => {
      if (!spaceId || !releaseId) return undefined;
      try {
        return (await trigger({ spaceId, releaseId }).unwrap()) as unknown as string;
      } catch {
        return undefined;
      }
    },
    [trigger],
  );
};
