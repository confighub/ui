// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  ExtendedUnitRead,
  useLazyListAllResourcesQuery,
  useLazyListAllUnitsQuery,
} from '@confighub/rtk-query';

/**
 * One row in the resource grid: a single resource (drawn from a Unit's data)
 * tagged with the originating unit/space metadata so all column sources can
 * resolve client-side.
 */
export interface ResourceRow {
  /** Stable id for the DataGrid row. */
  id: string;
  /** Identifies the resource to the API, which is how the drawer fetches its body. */
  ResourceID: string;
  ResourceType: string;
  ResourceName: string;
  UnitID: string;
  UnitSlug: string;
  UnitLabels: Record<string, string>;
  // Unit fields hydrated via listAllUnits. Names match the Unit model fields
  // so getCellValue's readScalar can look them up directly by ColumnSource
  // 'unit-field' + key. Numbers and timestamps are coerced to strings on
  // render, not here.
  DisplayName?: string;
  ToolchainType?: string;
  TargetSlug?: string;
  ProviderType?: string;
  /**
   * Globally-unique ID of the Unit's Target (the cluster the resource is
   * delivered to). TargetSlug is only unique within a Space, so any grouping
   * by cluster must key on this ID, not the slug. Empty when the Unit has no
   * Target.
   */
  TargetID?: string;
  HeadRevisionNum?: number;
  LastReleasedRevisionNum?: number;
  UpstreamRevisionNum?: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  LastChangeDescription?: string;
  BridgeWorkerID?: string;
  SpaceID: string;
  SpaceSlug: string;
  SpaceLabels: Record<string, string>;
  /**
   * The resource document, present only when the table fetch asked for it
   * (i.e. the view has at least one resource-path column). Already an object:
   * it is the Resource's jsonb, not a string that needs parsing.
   */
  resourceData?: unknown;
}

export interface UseResourceRowsResult {
  rows: ResourceRow[];
  isLoading: boolean;
  error: string | null;
  /** Imperatively re-run the org-wide resource query. */
  refetch: (args: {
    /**
     * Filter on the resources and the entities containing them. Resource
     * attributes are unprefixed (ResourceType, ResourceName, TargetID);
     * attributes of the containing entities take a prefix, as in
     * `Space.Labels.Component = 'web'` or `Space.Labels.Environment = 'prod'`.
     */
    where: string;
    /**
     * Filter on paths within the resource document itself, e.g.
     * `metadata.namespace = 'default' AND spec.replicas > 1`. Each path is
     * qualified with `Data.` and evaluated as a SQL/JSON path by the server.
     */
    whereData: string;
    resourceType: string;
    /**
     * When true, fetch the resource documents so that resource-path columns
     * can extract values client-side. They are bulk, so the page only opts in
     * when the view actually uses such a column.
     */
    needBody: boolean;
  }) => Promise<void>;
}

/** Fields the row builder reads off the Resource. */
const RESOURCE_SELECT =
  'ResourceID,ResourceType,ResourceName,UnitID,SpaceID,SpaceSlug,UnitSlug,TargetID,ResourceIndex';

/**
 * Fields the row builder reads off the Unit. Keep aligned with what
 * UNIT_EXTRA_FIELDS exposes to the column picker. Data is deliberately absent:
 * the resources have already been extracted from it server-side.
 */
const UNIT_SELECT =
  'UnitID,Slug,DisplayName,SpaceID,TargetID,ToolchainType,ProviderType,Labels,' +
  'HeadRevisionNum,LastReleasedRevisionNum,UpstreamRevisionNum,' +
  'CreatedAt,UpdatedAt,LastChangeDescription,BridgeWorkerID';

/**
 * Org-wide resource listing, one row per resource.
 *
 * The resources are read from the Resource entity, which ConfigHub maintains as
 * each Unit's data changes, so a fleet-wide table costs one query rather than a
 * `get-resources` invocation per Unit. Filtering — including on paths inside the
 * resource document — is evaluated by the server.
 *
 * Unit metadata is a second query rather than an `include`: expanding the Unit
 * would fetch one copy of it per resource, configuration data and all, to read
 * a handful of fields. The Space and Unit slugs the default view shows need
 * neither -- the Resource carries them.
 *
 * Refetching is imperative (the page calls `refetch()` on mount, on Apply, and
 * on Refresh) so we don't accidentally re-run on draft edits.
 */
export function useResourceRows(): UseResourceRowsResult {
  const [triggerListResources] = useLazyListAllResourcesQuery();
  const [triggerListUnits] = useLazyListAllUnitsQuery();

  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest-call cookie: only the most recent refetch is allowed to commit
  // results, so a slow earlier call can't overwrite a fresh one.
  const callIdRef = useRef(0);

  const refetch = useCallback(
    async ({
      where,
      whereData,
      resourceType,
      needBody,
    }: {
      where: string;
      whereData: string;
      resourceType: string;
      needBody: boolean;
    }) => {
      const callId = ++callIdRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const resourceWhere = buildResourceWhere({ where, whereData, resourceType });
        const resourceResult = await triggerListResources({
          where: resourceWhere || undefined,
          select: needBody ? `${RESOURCE_SELECT},Data` : RESOURCE_SELECT,
        });

        // Drop late results.
        if (callId !== callIdRef.current) return;

        if (resourceResult.error) {
          setError('Failed to list resources');
          setRows([]);
          return;
        }
        const resources = resourceResult.data ?? [];

        // Hydrate the unit metadata the unit- and space-sourced columns read.
        // Unfiltered: `where` is written against resources and their related
        // entities, so it cannot be reused here, and naming the units by id
        // would put one UUID per resource in the query string -- past the 8KB
        // request line at a few hundred units. The select keeps this to the
        // handful of fields the columns use, so it stays small even org-wide.
        let unitIndex = new Map<string, ExtendedUnitRead>();
        if (resources.length > 0) {
          const unitsResult = await triggerListUnits({
            select: UNIT_SELECT,
            include: 'SpaceID,TargetID',
          });
          if (callId !== callIdRef.current) return;
          if (unitsResult.error) {
            setError('Failed to hydrate unit metadata');
            setRows([]);
            return;
          }
          unitIndex = buildUnitIndex(unitsResult.data ?? []);
        }

        const flattened: ResourceRow[] = [];
        for (const er of resources) {
          const resource = er.Resource;
          if (!resource) continue;
          const unitId = resource.UnitID ?? '';
          const eu = unitIndex.get(unitId);
          const unit = eu?.Unit;
          flattened.push({
            // ResourceID is already unique across the org, so the row key needs
            // nothing appended to it.
            id: resource.ResourceID ?? `${unitId}:${resource.ResourceIndex ?? 0}`,
            ResourceID: resource.ResourceID ?? '',
            ResourceType: resource.ResourceType ?? '',
            ResourceName: resource.ResourceName ?? '',
            UnitID: unitId,
            UnitSlug: resource.UnitSlug ?? unit?.Slug ?? '',
            UnitLabels: unit?.Labels ?? {},
            DisplayName: unit?.DisplayName,
            ToolchainType: unit?.ToolchainType,
            TargetSlug: eu?.Target?.Slug,
            ProviderType: unit?.ProviderType,
            // The Unit's (globally-unique) Target. A Unit with no Target still
            // serializes the zero UUID (uuid.UUID can't be omitempty'd), which
            // realTargetID() maps to '' so it buckets as "no target".
            TargetID:
              realTargetID(resource.TargetID) ||
              realTargetID(eu?.Target?.TargetID) ||
              realTargetID(unit?.TargetID),
            HeadRevisionNum: unit?.HeadRevisionNum,
            LastReleasedRevisionNum: unit?.LastReleasedRevisionNum,
            UpstreamRevisionNum: unit?.UpstreamRevisionNum,
            CreatedAt: unit?.CreatedAt,
            UpdatedAt: unit?.UpdatedAt,
            LastChangeDescription: unit?.LastChangeDescription,
            BridgeWorkerID: unit?.BridgeWorkerID,
            SpaceID: resource.SpaceID ?? '',
            SpaceSlug: resource.SpaceSlug ?? eu?.Space?.Slug ?? '',
            SpaceLabels: eu?.Space?.Labels ?? {},
            resourceData: needBody ? resource.Data : undefined,
          });
        }
        setRows(flattened);
      } finally {
        if (callId === callIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [triggerListResources, triggerListUnits],
  );

  return useMemo(
    () => ({ rows, isLoading, error, refetch }),
    [rows, isLoading, error, refetch],
  );
}

/**
 * Combine the view's three filter inputs into one Resource `where` expression.
 * They are independent scopes, so they AND together.
 */
export function buildResourceWhere({
  where,
  whereData,
  resourceType,
}: {
  where: string;
  whereData: string;
  resourceType: string;
}): string {
  const clauses: string[] = [];
  if (resourceType.trim()) {
    clauses.push(`ResourceType = '${resourceType.trim().replace(/'/g, "''")}'`);
  }
  if (whereData.trim()) {
    clauses.push(qualifyDataPaths(whereData.trim()));
  }
  if (where.trim()) {
    clauses.push(where.trim());
  }
  return clauses.join(' AND ');
}

/**
 * Qualify each term of a data-level filter with `Data.`, so that a clause
 * written against the resource document — `metadata.namespace = 'default' AND
 * spec.replicas > 1` — addresses the Resource's stored JSON.
 *
 * The scan is quote-aware so that an ` AND ` inside a string literal is not
 * mistaken for a term separator. Terms already written with the prefix are left
 * alone, so a user who knows the entity syntax can type it directly.
 */
export function qualifyDataPaths(expression: string): string {
  return splitTopLevelAnd(expression)
    .map((term) => {
      const trimmed = term.trim();
      if (!trimmed || /^Data(\.|\s|$)/.test(trimmed)) return trimmed;
      return `Data.${trimmed}`;
    })
    .filter(Boolean)
    .join(' AND ');
}

/** Split on ` AND ` at the top level, ignoring occurrences inside '...' literals. */
function splitTopLevelAnd(expression: string): string[] {
  const terms: string[] = [];
  let start = 0;
  let inQuote = false;
  for (let i = 0; i < expression.length; i++) {
    const c = expression[i];
    if (c === "'") {
      // '' inside a literal is an escaped quote, and skipping the second one
      // keeps the in/out state correct.
      if (inQuote && expression[i + 1] === "'") i++;
      else inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (/\s/.test(c) && /^\s+AND\s/i.test(expression.slice(i))) {
      terms.push(expression.slice(start, i));
      const match = /^\s+AND\s/i.exec(expression.slice(i));
      i += (match?.[0].length ?? 1) - 1;
      start = i + 1;
    }
  }
  terms.push(expression.slice(start));
  return terms;
}

/** The all-zero UUID a Go uuid.UUID serializes to when unset. */
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Normalize a UUID string to '' when it's missing or the zero UUID. uuid.UUID
 * is a fixed-size array, so `json:",omitempty"` can't drop it — an unset Target
 * comes across the wire as the zero UUID rather than being omitted, and we must
 * not treat that as a real Target id.
 */
function realTargetID(id: string | undefined): string {
  return id && id !== ZERO_UUID ? id : '';
}

function buildUnitIndex(units: ExtendedUnitRead[]): Map<string, ExtendedUnitRead> {
  const index = new Map<string, ExtendedUnitRead>();
  for (const eu of units) {
    const id = eu.Unit?.UnitID;
    if (id) index.set(id, eu);
  }
  return index;
}
