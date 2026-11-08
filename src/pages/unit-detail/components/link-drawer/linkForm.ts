// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// What the Link drawer's form holds, which fields each UpdateType takes, and how the form becomes
// the Link it writes. The rules follow the server's validation of a Link, so a field the form
// shows is one the server accepts for the Link's type.

import type {
  Binding,
  ExtendedUnitRead,
  Link,
  NamedPath,
  PathExpression,
  ResourceInfo,
  UnitRead,
} from '@confighub/rtk-query';

import {
  type ClearanceRow,
  clearanceToRows,
  rowsToClearance,
} from '@/components/clearance-field/clearanceRows';
import { type MapRow, mapToRows, rowsToGates, rowsToMap } from '@/components/map-field-editor/map-rows';

/** A Unit at one end of a Link, with its Space's slug to name it by. */
export interface LinkEnd {
  unit: UnitRead;
  spaceSlug?: string;
}

export const linkEnd = (unit: ExtendedUnitRead): LinkEnd | undefined =>
  unit.Unit ? { unit: unit.Unit, spaceSlug: unit.Space?.Slug } : undefined;

export const LINK_UPDATE_TYPES = [
  'NeedsProvides',
  'MergeUnits',
  'UpgradeUnit',
  'Insert',
  'Upsert',
  'TransformPaths',
  'None',
] as const;
export type LinkUpdateType = (typeof LINK_UPDATE_TYPES)[number];

/** One line on what each UpdateType does, for choosing one. */
export const UPDATE_TYPE_DESCRIPTIONS: Record<LinkUpdateType, string> = {
  NeedsProvides: 'Sets the values the downstream Unit needs from those the upstream Unit provides.',
  MergeUnits: 'Merges changes to the upstream Unit into the downstream Unit.',
  UpgradeUnit:
    'Merges like MergeUnits and records the upstream as the Unit this one is a variant of. A Unit has at most one.',
  Insert: 'Inserts the upstream Unit’s configuration at one path of the downstream Unit.',
  Upsert: 'Adds or replaces the upstream Unit’s resources in the downstream Unit.',
  TransformPaths: 'Writes values computed from upstream paths to downstream paths.',
  None: 'Records the dependency only, and changes nothing.',
};

const isUpdateType = (value: string | undefined): value is LinkUpdateType =>
  (LINK_UPDATE_TYPES as readonly string[]).includes(value ?? '');

/** The fields a Link of the type takes, as the server's validation of a Link decides. */
export interface LinkTypeFields {
  autoUpdate: boolean;
  whereResource: boolean;
  /** WhereMutation, Squash and MergeEnableSubtraction: how a range of upstream Revisions merges */
  merge: boolean;
  /** Protect and Guards: what the Link says about the paths it writes */
  protectAndGuards: boolean;
  clearance: boolean;
  manualBindings: boolean;
  /** Insert's one binding names only the needed place */
  oneNeededBinding: boolean;
  transformInvocation: boolean;
  transformPaths: boolean;
  mergedRevisions: boolean;
}

export function linkTypeFields(type: string | undefined): LinkTypeFields {
  const merges = type === 'MergeUnits' || type === 'UpgradeUnit';
  const resolves = type !== 'None';
  return {
    autoUpdate: resolves,
    // An upgrade tracks the whole upstream Unit; taking part of one is what MergeUnits is for.
    whereResource: resolves && type !== 'UpgradeUnit',
    merge: merges,
    // A merge's guards arrive from upstream, and protecting what it delivered would freeze it.
    protectAndGuards: resolves && !merges,
    clearance: resolves,
    manualBindings: type === 'NeedsProvides' || type === 'Insert',
    oneNeededBinding: type === 'Insert',
    transformInvocation: type === 'Insert' || type === 'Upsert',
    transformPaths: type === 'TransformPaths',
    mergedRevisions: resolves,
  };
}

/** The data types a NeedsProvides binding or a DownstreamPath value takes. */
export const VALUE_DATA_TYPES = ['string', 'int', 'bool'] as const;

/**
 * The data types an Insert binding takes: a string, or the downstream Unit's own configuration
 * format, which inlines the upstream Unit as configuration data.
 */
export const INSERT_DATA_TYPES = ['string', 'YAML', 'JSON', 'TOML', 'INI', 'Properties', 'Env', 'Text'] as const;

export const EVALUATORS = ['template', 'cel'] as const;

/** One stated binding, its resources flattened to type and name. */
export interface BindingRow {
  Key: string;
  AttributeName: string;
  DataType: string;
  NeededResourceType: string;
  NeededResourceName: string;
  NeededPath: string;
  ProvidedResourceType: string;
  ProvidedResourceName: string;
  ProvidedPath: string;
}

export interface UpstreamPathRow {
  Name: string;
  ResourceType: string;
  ResourceName: string;
  Path: string;
}

export interface DownstreamPathRow {
  Key: string;
  ResourceType: string;
  ResourceName: string;
  Path: string;
  Expression: string;
  Evaluator: string;
  DataType: string;
}

export interface LinkFormInput {
  Slug: string;
  DisplayName: string;
  UpdateType: LinkUpdateType;
  AutoUpdate: boolean;
  WhereResource: string;
  WhereMutation: string;
  Squash: boolean;
  MergeEnableSubtraction: boolean;
  Protect: boolean;
  Guards: MapRow[];
  Clearance: ClearanceRow[];
  TransformInvocationID: string;
  ManualBindings: BindingRow[];
  UpstreamPaths: UpstreamPathRow[];
  DownstreamPaths: DownstreamPathRow[];
  Labels: MapRow[];
  Annotations: MapRow[];
  DeleteGates: MapRow[];
}

/** A new Link: NeedsProvides, resolved automatically, which is what one created with no type gets. */
export const defaultLinkFormInput = (): LinkFormInput => ({
  Slug: '',
  DisplayName: '',
  UpdateType: 'NeedsProvides',
  AutoUpdate: true,
  WhereResource: '',
  WhereMutation: '',
  Squash: false,
  MergeEnableSubtraction: false,
  Protect: false,
  Guards: [],
  Clearance: [],
  TransformInvocationID: '',
  ManualBindings: [],
  UpstreamPaths: [],
  DownstreamPaths: [],
  Labels: [],
  Annotations: [],
  DeleteGates: [],
});

export const emptyBindingRow = (): BindingRow => ({
  Key: '',
  AttributeName: '',
  DataType: 'string',
  NeededResourceType: '',
  NeededResourceName: '',
  NeededPath: '',
  ProvidedResourceType: '',
  ProvidedResourceName: '',
  ProvidedPath: '',
});

export const emptyUpstreamPathRow = (): UpstreamPathRow => ({
  Name: '',
  ResourceType: '',
  ResourceName: '',
  Path: '',
});

export const emptyDownstreamPathRow = (): DownstreamPathRow => ({
  Key: '',
  ResourceType: '',
  ResourceName: '',
  Path: '',
  Expression: '',
  Evaluator: 'template',
  DataType: 'string',
});

const bindingToRow = (binding: Binding): BindingRow => ({
  Key: binding.Key ?? '',
  AttributeName: binding.AttributeName ?? '',
  DataType: binding.DataType || 'string',
  NeededResourceType: binding.NeededResource?.ResourceType ?? '',
  NeededResourceName: binding.NeededResource?.ResourceName ?? '',
  NeededPath: binding.NeededPath ?? '',
  ProvidedResourceType: binding.ProvidedResource?.ResourceType ?? '',
  ProvidedResourceName: binding.ProvidedResource?.ResourceName ?? '',
  ProvidedPath: binding.ProvidedPath ?? '',
});

/** The form's values for a stored Link. */
export const linkToFormInput = (link: Link): LinkFormInput => ({
  ...defaultLinkFormInput(),
  Slug: link.Slug ?? '',
  // A Link given no display name shows its slug as one; the form leaves it blank then, so a
  // renamed Link does not keep the old name as its display name.
  DisplayName: link.DisplayName && link.DisplayName !== link.Slug ? link.DisplayName : '',
  UpdateType: isUpdateType(link.UpdateType) ? link.UpdateType : 'NeedsProvides',
  AutoUpdate: !!link.AutoUpdate,
  WhereResource: link.WhereResource ?? '',
  WhereMutation: link.WhereMutation ?? '',
  Squash: !!link.Squash,
  MergeEnableSubtraction: !!link.MergeEnableSubtraction,
  Protect: !!link.Protect,
  Guards: mapToRows(link.Guards),
  Clearance: clearanceToRows(link.Clearance),
  TransformInvocationID: link.TransformInvocationID ?? '',
  ManualBindings: (link.ManualBindings ?? []).map(bindingToRow),
  UpstreamPaths: (link.UpstreamPaths ?? []).map((p) => ({
    Name: p.Name ?? '',
    ResourceType: p.Resource?.ResourceType ?? '',
    ResourceName: p.Resource?.ResourceName ?? '',
    Path: p.Path ?? '',
  })),
  DownstreamPaths: (link.DownstreamPaths ?? []).map((p) => ({
    Key: p.Key ?? '',
    ResourceType: p.Resource?.ResourceType ?? '',
    ResourceName: p.Resource?.ResourceName ?? '',
    Path: p.Path ?? '',
    Expression: p.Expression ?? '',
    Evaluator: p.Evaluator || 'template',
    DataType: p.DataType || 'string',
  })),
  Labels: mapToRows(link.Labels),
  Annotations: mapToRows(link.Annotations),
  DeleteGates: mapToRows(link.DeleteGates),
});

/**
 * The names of the upstream values an expression refers to, sorted: `.Params.<name>` in a
 * template and `params.<name>` in CEL. They are what a DownstreamPath records as its
 * Parameters, as `cub link create --downstream-path` records them.
 */
export function referencedParameters(...texts: string[]): string[] {
  const names = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(/(?:\.Params\.|\bparams\.)([A-Za-z_][A-Za-z0-9_]*)/g)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

/**
 * A resource as a row names it. The stored one is kept when the row still names it, so the
 * fields the form does not show -- a name without its scope, a category -- survive an edit.
 */
const resourceInfo = (type: string, name: string, stored?: ResourceInfo): ResourceInfo =>
  stored && stored.ResourceType === type.trim() && stored.ResourceName === name.trim()
    ? stored
    : { ResourceType: type.trim(), ResourceName: name.trim() };

const isBlank = (...values: string[]) => values.every((v) => !v.trim());

const rowToBinding = (row: BindingRow, oneNeeded: boolean, stored?: Binding): Binding => {
  const binding: Binding = {
    DataType: row.DataType || 'string',
    NeededResource: resourceInfo(row.NeededResourceType, row.NeededResourceName, stored?.NeededResource),
    NeededPath: row.NeededPath.trim(),
  };
  if (row.Key.trim()) binding.Key = row.Key.trim();
  if (row.AttributeName.trim()) binding.AttributeName = row.AttributeName.trim();
  if (!oneNeeded) {
    binding.ProvidedResource = resourceInfo(
      row.ProvidedResourceType,
      row.ProvidedResourceName,
      stored?.ProvidedResource,
    );
    binding.ProvidedPath = row.ProvidedPath.trim();
  }
  return binding;
};

const rowToUpstreamPath = (row: UpstreamPathRow, stored?: NamedPath): NamedPath => ({
  Name: row.Name.trim(),
  Resource: resourceInfo(row.ResourceType, row.ResourceName, stored?.Resource),
  Path: row.Path.trim(),
});

const rowToDownstreamPath = (row: DownstreamPathRow, stored?: PathExpression): PathExpression => {
  const path: PathExpression = {
    Resource: resourceInfo(row.ResourceType, row.ResourceName, stored?.Resource),
    Path: row.Path.trim(),
    Expression: row.Expression,
    Evaluator: row.Evaluator || 'template',
    DataType: row.DataType || 'string',
  };
  if (row.Key.trim()) path.Key = row.Key.trim();
  const parameters = referencedParameters(row.Expression);
  if (parameters.length > 0) path.Parameters = parameters;
  return path;
};

/** A list, or undefined when it is empty, so the Link is written without it. */
const optionalList = <T>(list: T[]): T[] | undefined => (list.length > 0 ? list : undefined);

/** A map, or undefined when it is empty. */
const optionalMap = <T>(map: Record<string, T>): Record<string, T> | undefined =>
  Object.keys(map).length > 0 ? map : undefined;

/** The text of an optional field, or undefined when it is blank. */
const optional = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

/**
 * The Link the form writes, over `base`: the stored Link for an edit, which keeps what the form
 * does not edit (its Units, its merge pointers, its getters and setters, its Version), or the
 * Units to connect for a create. The fields the form hides for the Link's type are written as
 * `base` has them, so a create leaves them off; the type itself cannot change once the Link exists.
 *
 * Rows left entirely blank are dropped, so an added row the person did not fill in writes nothing.
 */
export function formInputToLink(input: LinkFormInput, base: Link): Link {
  const takes = linkTypeFields(input.UpdateType);
  const storedBindings = base.ManualBindings ?? [];
  const storedUpstream = base.UpstreamPaths ?? [];
  const storedDownstream = base.DownstreamPaths ?? [];

  const bindings = input.ManualBindings.filter(
    (row) =>
      !isBlank(
        row.Key,
        row.AttributeName,
        row.NeededResourceType,
        row.NeededResourceName,
        row.NeededPath,
        row.ProvidedResourceType,
        row.ProvidedResourceName,
        row.ProvidedPath,
      ),
  );
  const upstream = input.UpstreamPaths.filter((row) => !isBlank(row.Name, row.ResourceType, row.ResourceName, row.Path));
  const downstream = input.DownstreamPaths.filter(
    (row) => !isBlank(row.Key, row.ResourceType, row.ResourceName, row.Path, row.Expression),
  );
  const clearance = rowsToClearance(input.Clearance);

  // A field the form does not show for the type keeps what the Link has: nothing, on a create.
  // The server is what refuses a field on a type, so a Link it accepted is written back as it
  // was, and a field the form left hidden is not cleared on the strength of the client's copy
  // of the rule.
  return {
    ...base,
    Slug: input.Slug.trim(),
    DisplayName: optional(input.DisplayName),
    UpdateType: input.UpdateType,
    AutoUpdate: takes.autoUpdate ? input.AutoUpdate : (base.AutoUpdate ?? false),
    WhereResource: takes.whereResource ? optional(input.WhereResource) : base.WhereResource,
    WhereMutation: takes.merge ? optional(input.WhereMutation) : base.WhereMutation,
    Squash: takes.merge ? input.Squash : base.Squash,
    MergeEnableSubtraction: takes.merge ? input.MergeEnableSubtraction : base.MergeEnableSubtraction,
    Protect: takes.protectAndGuards ? input.Protect : base.Protect,
    Guards: takes.protectAndGuards ? optionalMap(rowsToMap(input.Guards)) : base.Guards,
    Clearance: takes.clearance ? optionalList(clearance) : base.Clearance,
    TransformInvocationID: takes.transformInvocation ? optional(input.TransformInvocationID) : base.TransformInvocationID,
    ManualBindings: takes.manualBindings
      ? optionalList(bindings.map((row, i) => rowToBinding(row, takes.oneNeededBinding, storedBindings[i])))
      : base.ManualBindings,
    UpstreamPaths: takes.transformPaths
      ? optionalList(upstream.map((row, i) => rowToUpstreamPath(row, storedUpstream[i])))
      : base.UpstreamPaths,
    DownstreamPaths: takes.transformPaths
      ? optionalList(downstream.map((row, i) => rowToDownstreamPath(row, storedDownstream[i])))
      : base.DownstreamPaths,
    UpstreamGetters: base.UpstreamGetters,
    DownstreamSetters: base.DownstreamSetters,
    Labels: rowsToMap(input.Labels),
    Annotations: rowsToMap(input.Annotations),
    DeleteGates: rowsToGates(input.DeleteGates),
  };
}
