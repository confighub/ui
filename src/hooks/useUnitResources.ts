// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from 'react';

import { decodeBase64 } from '@/utility/string-functions';
import { useLazyListAllResourcesQuery } from '@confighub/rtk-query';

/** One resource contained in a Unit, read from the Resource entity. */
export interface UnitResourceRow {
  id: string;
  ResourceType: string;
  ResourceName: string;
  /** Distinguishes resources of one Unit that share a type and name; 0 when the name is unique. */
  ResourceIndex: number;
  /** The ToolchainType of the Unit the resource was extracted from. */
  ToolchainType: string;
  /**
   * The resource in its original toolchain-native form -- YAML with comments
   * and field order intact for Kubernetes. Present when `withBody` is true.
   */
  ResourceBody?: string;
}

interface UseUnitResourcesArgs {
  spaceID: string | undefined;
  unitID: string | undefined;
  /**
   * Include each resource's original configuration, so the drawer can show a
   * body immediately on selection without a second round trip.
   */
  withBody?: boolean;
  /** Skip the fetch (e.g. when the drawer is closed). */
  skip?: boolean;
  /**
   * Fetches again when this changes. The Unit's head revision number serves, since the
   * resources change only with the Unit's data.
   */
  refreshKey?: unknown;
}

interface UseUnitResourcesResult {
  rows: UnitResourceRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * The resources contained in a single Unit.
 *
 * ConfigHub maintains these as the Unit's data changes, so this is a query
 * rather than a re-extraction of the Unit's configuration: opening a detail
 * pane no longer runs a function.
 */
export function useUnitResources({
  spaceID,
  unitID,
  withBody = false,
  skip = false,
  refreshKey,
}: UseUnitResourcesArgs): UseUnitResourcesResult {
  const [triggerListResources] = useLazyListAllResourcesQuery();

  const [rows, setRows] = useState<UnitResourceRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drop stale results when the user switches rows quickly.
  const callIdRef = useRef(0);

  const run = useCallback(async () => {
    if (skip || !spaceID || !unitID) {
      setRows([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    const callId = ++callIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await triggerListResources({
        where: `UnitID = '${unitID}'`,
        select: 'ResourceID,ResourceType,ResourceName,ResourceIndex,ToolchainType',
        rawData: withBody || undefined,
      });
      if (callId !== callIdRef.current) return;
      if (result.error) {
        setError('Failed to list the resources of this unit');
        setRows([]);
        return;
      }
      const flattened: UnitResourceRow[] = [];
      for (const er of result.data ?? []) {
        const resource = er.Resource;
        if (!resource) continue;
        flattened.push({
          id: resource.ResourceID ?? '',
          ResourceType: resource.ResourceType ?? '',
          ResourceName: resource.ResourceName ?? '',
          ResourceIndex: resource.ResourceIndex ?? 0,
          ToolchainType: resource.ToolchainType ?? '',
          ResourceBody: er.RawData ? decodeBase64(er.RawData) : undefined,
        });
      }
      setRows(flattened);
    } catch {
      if (callId === callIdRef.current) {
        setError('Failed to fetch resources');
        setRows([]);
      }
    } finally {
      if (callId === callIdRef.current) {
        setIsLoading(false);
      }
    }
    // refreshKey is a dependency only so that a change to it fetches again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerListResources, spaceID, unitID, withBody, skip, refreshKey]);

  // Re-run on argument change. Using useEffect here is intentional —
  // we're syncing an imperative fetch against props, the same idiom used
  // by Resource Explorer's useResourceRows.
  useEffect(() => {
    void run();
  }, [run]);

  return { rows, isLoading, error, refetch: run };
}
