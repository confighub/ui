// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';

/** Where a column's value comes from. */
export type ColumnSource =
  | 'unit-field'
  | 'unit-label'
  | 'space-field'
  | 'space-label'
  | 'resource-info'
  /**
   * Value extracted from the resource document itself by walking a dot path
   * (e.g. "spec.cidrBlock" or "spec.template.spec.containers[0].image").
   * Triggers the table fetch to use body=json so the resource bodies are
   * available client-side.
   */
  | 'resource-path';

export interface ResourceColumn {
  /** Display name and DataGrid field key. Must be unique within the column list. */
  name: string;
  source: ColumnSource;
  /**
   * Identifier within the source. For *-label sources this is the label key.
   * For *-field and resource-info this is the entity field name (e.g. "Slug",
   * "ResourceName").
   */
  key: string;
}

/** Frontend-only view definition. JSON-serialized into the URL. */
export interface ResourceView {
  name?: string;
  /**
   * WHERE clause on the resources and the entities containing them. Resource
   * attributes are unprefixed (ResourceType, ResourceName, TargetID);
   * attributes of the containing entities take a prefix, as in
   * `Space.Labels.Component = 'web'` or `Space.Labels.Environment = 'prod'`.
   */
  where?: string;
  /**
   * Data-level WHERE clause: path-based expressions on the resource document
   * itself, e.g. `metadata.namespace = 'default' AND spec.replicas > 1`. Each
   * path is qualified with `Data.` and evaluated by the server as a SQL/JSON
   * path against the resource's stored JSON.
   */
  whereData?: string;
  /** Optional Kubernetes resource type filter (apiVersion/kind). */
  resourceType?: string;
  columns: ResourceColumn[];
  /** Column name to sort by. Empty = no explicit sort. */
  orderBy?: string;
  orderByDirection?: 'ASC' | 'DESC';
  /**
   * Ordered list of column names to group rows by, nesting outermost-first.
   * Group-by columns are hidden from the table and instead drive the
   * GroupNavPanel tree.
   */
  groupBy?: string[];
}

/** Sentinel ID for the "All" node in the group nav tree (selectedGroups = []). */
export const ALL_GROUPS = '__all__' as const;

/** Stable identifier for a column, used as DataGrid `field` and DraftView keys. */
export function columnId(col: ResourceColumn): string {
  return col.name;
}

/** Whitelist of unit fields available off the function-invoke response. */
export const UNIT_FIELDS = ['UnitSlug', 'UnitID'] as const;
export type UnitField = (typeof UNIT_FIELDS)[number];

/**
 * Whitelist of unit fields hydrated via the parallel listAllUnits query.
 * Unprefixed names (ToolchainType, CreatedAt, …) refer to the Unit; the
 * Space-side equivalents live under SPACE_FIELDS with `Space` prefixes.
 * Each name here corresponds to a key on the ResourceRow set by the row
 * builder in useResourceRows; getCellValue reads it via readScalar.
 */
export const UNIT_EXTRA_FIELDS = [
  'DisplayName',
  'ToolchainType',
  'TargetSlug',
  'ProviderType',
  'HeadRevisionNum',
  'LastReleasedRevisionNum',
  'UpstreamRevisionNum',
  'CreatedAt',
  'UpdatedAt',
  'LastChangeDescription',
] as const;
export type UnitExtraField = (typeof UNIT_EXTRA_FIELDS)[number];

/** Whitelist of space fields hydrated via the parallel listAllUnits query. */
export const SPACE_FIELDS = ['SpaceSlug', 'SpaceID'] as const;
export type SpaceField = (typeof SPACE_FIELDS)[number];

/**
 * Whitelist of fields the Resource entity itself carries. The remaining
 * ResourceInfo fields `get-resources` computes during its walk —
 * ResourceNameWithoutScope, ResourceCategory, ResourceNameStableCore — are not
 * stored, so they are not offered here.
 */
export const RESOURCE_INFO_FIELDS = ['ResourceType', 'ResourceName'] as const;
export type ResourceInfoField = (typeof RESOURCE_INFO_FIELDS)[number];

/** All non-label fields the column picker offers, grouped by source. */
export const ALL_FIELD_SOURCES: ReadonlyArray<{
  source: Exclude<ColumnSource, 'unit-label' | 'space-label'>;
  fields: readonly string[];
  label: string;
}> = [
  { source: 'resource-info', fields: RESOURCE_INFO_FIELDS, label: 'Resource' },
  {
    source: 'unit-field',
    fields: [...UNIT_FIELDS, ...UNIT_EXTRA_FIELDS],
    label: 'Unit',
  },
  { source: 'space-field', fields: SPACE_FIELDS, label: 'Space' },
];

export const DEFAULT_VIEW: ResourceView = {
  columns: [
    { name: 'ResourceType', source: 'resource-info', key: 'ResourceType' },
    { name: 'ResourceName', source: 'resource-info', key: 'ResourceName' },
    { name: 'UnitSlug', source: 'unit-field', key: 'UnitSlug' },
    { name: 'SpaceSlug', source: 'space-field', key: 'SpaceSlug' },
  ],
  orderBy: 'ResourceType',
  orderByDirection: 'ASC',
};

/** URL parameter name carrying the encoded view. */
export const URL_PARAM = 'v';

/**
 * Encode a view definition into a URL-safe lz-string blob. lz-string's
 * `compressToEncodedURIComponent` already produces URI-safe characters, so
 * the result can be dropped into a query parameter as-is.
 */
export function encodeView(view: ResourceView): string {
  return compressToEncodedURIComponent(JSON.stringify(view));
}

/** Decode a URL parameter value into a view, falling back to DEFAULT_VIEW on any error. */
export function decodeView(encoded: string | null | undefined): ResourceView {
  if (!encoded) return DEFAULT_VIEW;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return DEFAULT_VIEW;
    const parsed = JSON.parse(json) as Partial<ResourceView>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.columns)) {
      return DEFAULT_VIEW;
    }
    return {
      name: parsed.name,
      where: parsed.where,
      whereData: parsed.whereData,
      resourceType: parsed.resourceType,
      columns: parsed.columns.filter(isValidColumn),
      orderBy: parsed.orderBy,
      orderByDirection: parsed.orderByDirection === 'DESC' ? 'DESC' : 'ASC',
      groupBy: Array.isArray(parsed.groupBy)
        ? parsed.groupBy.filter((s): s is string => typeof s === 'string')
        : undefined,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

function isValidColumn(c: unknown): c is ResourceColumn {
  if (!c || typeof c !== 'object') return false;
  const col = c as Record<string, unknown>;
  return (
    typeof col.name === 'string' &&
    typeof col.key === 'string' &&
    typeof col.source === 'string' &&
    [
      'unit-field',
      'unit-label',
      'space-field',
      'space-label',
      'resource-info',
      'resource-path',
    ].includes(col.source)
  );
}

/** Are two view definitions effectively equal (same on-the-wire JSON)? */
export function viewsEqual(a: ResourceView, b: ResourceView): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * True iff the view has at least one column that needs the resource body
 * (currently only `resource-path`). Used by the data hook to decide whether
 * to ask the server for body=json or stay with the cheaper body=none.
 */
export function viewNeedsResourceBody(view: ResourceView): boolean {
  return view.columns.some((c) => c.source === 'resource-path');
}
