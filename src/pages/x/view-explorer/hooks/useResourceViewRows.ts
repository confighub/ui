// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExtendedUnitRead,
  useLazyListAllResourcesQuery,
  useLazyListAllUnitsQuery,
} from '@confighub/rtk-query';

import { ResourceViewRow } from '../adapters/resource-row';

export interface UseResourceViewRowsArgs {
  /**
   * WHERE clause on the Resource. Resource attributes are unprefixed
   * (ResourceType, ResourceName, TargetID); the containing entities are
   * addressed with a prefix, as in `Space.Labels.Component = 'web'`.
   */
  where?: string;
  /**
   * View whose columns the server should extract for each resource, returned as
   * ViewColumns. This is how DataPath and DataExpression columns are answered.
   */
  viewId?: string;
  /**
   * Entities to expand, for columns that read fields the Resource does not
   * carry. Space.Slug and Unit.Slug need nothing -- the resource has both.
   */
  include?: string;
  /**
   * Ask for each resource's original configuration, which the drawer displays.
   * Off for a plain table: the bodies are bulk.
   */
  withBody?: boolean;
  /** Skip the fetch (e.g. view isn't Resource-typed). */
  skip?: boolean;
}

export interface UseResourceViewRowsResult {
  data: ResourceViewRow[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Fields the row builder reads off the Resource. */
const RESOURCE_SELECT =
  'ResourceID,ResourceType,ResourceName,UnitID,SpaceID,SpaceSlug,UnitSlug,TargetID';

const UNIT_SELECT =
  'UnitID,Slug,DisplayName,SpaceID,TargetID,ToolchainType,ProviderType,Labels,' +
  'HeadRevisionNum,LastReleasedRevisionNum,UpstreamRevisionNum,' +
  'CreatedAt,UpdatedAt,LastChangeDescription,BridgeWorkerID';

/**
 * The rows backing a Resource-typed view, read from the Resource entity.
 *
 * The view's own columns are extracted by the server: passing the view id
 * returns ViewColumns per resource, so a DataPath or DataExpression column
 * costs nothing on the client and needs no resource bodies on the wire. The
 * filter, including predicates on paths inside the document, is evaluated in
 * SQL.
 *
 * A second query hydrates the unit and space fields that columns can name but
 * the Resource does not carry -- labels, revision numbers, toolchain. It is
 * skipped entirely when no column asks for any of them.
 *
 * The fetch is imperative so refetch can drive the page's Refresh button; a
 * useEffect fires it on input changes.
 */
export function useResourceViewRows({
  where,
  viewId,
  include,
  withBody = false,
  skip = false,
}: UseResourceViewRowsArgs): UseResourceViewRowsResult {
  const [triggerListResources] = useLazyListAllResourcesQuery();
  const [triggerListUnits] = useLazyListAllUnitsQuery();

  const [data, setData] = useState<ResourceViewRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  // Stale-call cookie: only the most recent run commits results.
  const callIdRef = useRef(0);

  const run = useCallback(async () => {
    if (skip) {
      setData([]);
      setIsError(false);
      setIsLoading(false);
      return;
    }
    const callId = ++callIdRef.current;
    setIsLoading(true);
    setIsError(false);
    try {
      const resourceResult = await triggerListResources({
        where: where || undefined,
        select: RESOURCE_SELECT,
        include: include || undefined,
        view: viewId || undefined,
        rawData: withBody || undefined,
      });
      if (callId !== callIdRef.current) return;
      if (resourceResult.error) {
        setIsError(true);
        setData([]);
        return;
      }
      const resources = resourceResult.data ?? [];

      // Unit context, for columns the Resource cannot answer on its own. The
      // query is unfiltered because `where` is written against resources, not
      // units; the select keeps it to the fields columns can name.
      let unitIndex = new Map<string, ExtendedUnitRead>();
      if (resources.length > 0 && needsUnitContext(include)) {
        const unitsResult = await triggerListUnits({
          select: UNIT_SELECT,
          include: 'SpaceID,TargetID',
        });
        if (callId !== callIdRef.current) return;
        if (unitsResult.error) {
          setIsError(true);
          setData([]);
          return;
        }
        unitIndex = buildUnitIndex(unitsResult.data ?? []);
      }

      const rows: ResourceViewRow[] = [];
      for (const er of resources) {
        const resource = er.Resource;
        if (!resource) continue;
        const unitId = resource.UnitID ?? '';
        const eu = unitIndex.get(unitId);
        const unit = eu?.Unit;
        rows.push({
          id: resource.ResourceID ?? '',
          ResourceID: resource.ResourceID ?? '',
          ResourceType: resource.ResourceType ?? '',
          ResourceName: resource.ResourceName ?? '',
          ResourceBody: decodeRawData(er.RawData),
          ViewColumns: er.ViewColumns,
          UnitID: unitId,
          UnitSlug: resource.UnitSlug ?? unit?.Slug ?? '',
          UnitDisplayName: unit?.DisplayName,
          UnitToolchainType: unit?.ToolchainType,
          UnitProviderType: unit?.ProviderType,
          UnitHeadRevisionNum: unit?.HeadRevisionNum,
          UnitLastReleasedRevisionNum: unit?.LastReleasedRevisionNum,
          UnitUpstreamRevisionNum: unit?.UpstreamRevisionNum,
          UnitCreatedAt: unit?.CreatedAt,
          UnitUpdatedAt: unit?.UpdatedAt,
          UnitLastChangeDescription: unit?.LastChangeDescription,
          UnitLabels: unit?.Labels ?? {},
          SpaceID: resource.SpaceID ?? '',
          SpaceSlug: resource.SpaceSlug ?? eu?.Space?.Slug ?? '',
          SpaceLabels: eu?.Space?.Labels ?? {},
          TargetSlug: eu?.Target?.Slug,
        });
      }
      setData(rows);
    } catch {
      if (callId === callIdRef.current) {
        setIsError(true);
        setData([]);
      }
    } finally {
      if (callId === callIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    triggerListResources,
    triggerListUnits,
    where,
    viewId,
    include,
    withBody,
    skip,
  ]);

  // Sync the imperative call against prop changes. useEffect is intentional
  // here — same idiom resource-explorer's useResourceRows uses.
  useEffect(() => {
    void run();
  }, [run]);

  return { data, isLoading, isFetching: isLoading, isError, refetch: run };
}

/**
 * The unit query is worth making only for context the Resource does not carry.
 * `include` naming the Unit or Space is the signal that some column does.
 */
function needsUnitContext(include: string | undefined): boolean {
  return !!include && (include.includes('UnitID') || include.includes('SpaceID'));
}



/**
 * RawData is declared as a byte-format string in the spec, so it arrives
 * base64-encoded. atob yields one byte per code unit; the TextDecoder turns
 * those back into the UTF-8 the document was written in.
 */
export function decodeRawData(encoded: string | undefined): string | undefined {
  if (!encoded) return undefined;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

function buildUnitIndex(units: ExtendedUnitRead[]): Map<string, ExtendedUnitRead> {
  const index = new Map<string, ExtendedUnitRead>();
  for (const eu of units) {
    const id = eu.Unit?.UnitID;
    if (id) index.set(id, eu);
  }
  return index;
}
