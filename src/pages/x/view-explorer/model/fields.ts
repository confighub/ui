// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';

import type { ResourceViewRow } from '../adapters/resource-row';
import type { EntityKind, FieldOp, StatusKind, ViewDef } from './types';

/**
 * The per-entity field catalog. One entry drives a column, a group level, a
 * sort key and (when it has a `where` attribute) a field lens, so the table,
 * the lens column and the WHERE text always agree on what a field is.
 *
 * Attribute names follow the server's `where` attribute table: a related
 * entity is reached through its expandable reference (`Space.Slug` through
 * `SpaceID`, `Target.Slug` through `TargetID`).
 */

export interface RowOfEntity {
  Unit: ExtendedUnitRead;
  Space: ExtendedSpaceRead;
  Resource: ResourceViewRow;
}

export type EntityRow = RowOfEntity[EntityKind];

/** A value as the server compares it: text (also times and ids), a number, or none. */
export type AttrValue = string | number | boolean | null;

/** Returned for an attribute the client cannot evaluate; the server must answer it. */
export const UNKNOWN_ATTRIBUTE: unique symbol = Symbol('unknown attribute');
export type AttrResult = AttrValue | typeof UNKNOWN_ATTRIBUTE;

export type FieldType = 'string' | 'number' | 'time' | 'status' | 'bool';

export type FieldCategory = 'field' | 'label' | 'space-label' | 'computed';

export interface FieldDef {
  /** The column name stored in `View.Columns`, `View.GroupBy` and `View.OrderBy`. */
  id: string;
  label: string;
  entity: EntityKind;
  type: FieldType;
  category: FieldCategory;
  /** The WHERE attribute a value lens compares. Absent: not available as a lens. */
  where?: string;
  /** The WHERE attribute for `empty` / `notEmpty` (`TargetID IS NULL`). */
  nullWhere?: string;
  /** The `key:` of the token form (`space:payments-*`). */
  token?: string;
  ops: readonly FieldOp[];
  /** Default column width in pixels. */
  width: number;
  /** The value shown, grouped and sorted on. Null when the row has none. */
  value: (row: EntityRow) => AttrValue;
}

const TEXT_OPS: readonly FieldOp[] = ['is', 'isNot', 'matches'];
const NULLABLE_TEXT_OPS: readonly FieldOp[] = ['is', 'isNot', 'matches', 'empty', 'notEmpty'];
const NUMBER_OPS: readonly FieldOp[] = ['is', 'isNot', 'gt', 'lt', 'gte', 'lte'];
const TIME_OPS: readonly FieldOp[] = ['gt', 'lt', 'gte', 'lte'];

export const LABEL_PREFIX = 'Labels.';
export const SPACE_LABEL_PREFIX = 'Space.Labels.';
export const UNIT_LABEL_PREFIX = 'Unit.Labels.';

/* ------------------------------------------------------------------------ */
/* Attribute resolution: what the client knows of each WHERE attribute.      */
/* ------------------------------------------------------------------------ */

const unitOf = (row: EntityRow) => row as ExtendedUnitRead;
const spaceOf = (row: EntityRow) => row as ExtendedSpaceRead;
const resourceOf = (row: EntityRow) => row as ResourceViewRow;

const orNull = <T>(v: T | undefined | null): T | null => (v === undefined ? null : v);

/**
 * The value of a WHERE attribute on a row, as the server would compare it, or
 * UNKNOWN_ATTRIBUTE when the client does not model the attribute. The data
 * layer must fetch the fields an attribute reads (`fieldRequirements`), or the
 * answer is wrong rather than unknown.
 */
export function resolveAttribute(
  entity: EntityKind,
  attr: string,
  row: EntityRow,
): AttrResult {
  switch (entity) {
    case 'Unit':
      return resolveUnitAttribute(attr, unitOf(row));
    case 'Space':
      return resolveSpaceAttribute(attr, spaceOf(row));
    case 'Resource':
      return resolveResourceAttribute(attr, resourceOf(row));
  }
}

function resolveUnitAttribute(attr: string, eu: ExtendedUnitRead): AttrResult {
  const u = eu.Unit;
  if (!u) return null;
  switch (attr) {
    case 'Slug':
      return u.Slug ?? null;
    case 'DisplayName':
      return orNull(u.DisplayName);
    case 'ToolchainType':
      return u.ToolchainType ?? null;
    case 'ProviderType':
      return orNull(u.ProviderType);
    case 'LastChangeDescription':
      return orNull(u.LastChangeDescription);
    case 'HeadRevisionNum':
      return u.HeadRevisionNum ?? 0;
    case 'LastReleasedRevisionNum':
      return u.LastReleasedRevisionNum ?? 0;
    case 'UpstreamRevisionNum':
      return u.UpstreamRevisionNum ?? 0;
    case 'CreatedAt':
      return orNull(u.CreatedAt);
    case 'UpdatedAt':
      return orNull(u.UpdatedAt);
    case 'UnitID':
      return orNull(u.UnitID);
    case 'SpaceID':
      return orNull(u.SpaceID);
    case 'TargetID':
      return u.TargetID || null;
    case 'UpstreamUnitID':
      return u.UpstreamUnitID || null;
    case 'UpstreamSpaceID':
      return u.UpstreamSpaceID || null;
    case 'ChangeSetID':
      return u.ChangeSetID || null;
    case 'Space.Slug':
      return eu.Space?.Slug ?? u.SpaceSlug ?? null;
    case 'Target.Slug':
      return u.TargetID ? (eu.Target?.Slug ?? null) : null;
    case 'UpstreamUnit.Slug':
      return u.UpstreamUnitID ? (eu.UpstreamUnit?.Slug ?? null) : null;
    case 'UpstreamUnit.HeadRevisionNum':
      return u.UpstreamUnitID ? (eu.UpstreamUnit?.HeadRevisionNum ?? 0) : null;
    case 'UpstreamSpace.Slug':
      return u.UpstreamSpaceID ? (eu.UpstreamSpace?.Slug ?? null) : null;
    case 'ChangeSet.Slug':
      return u.ChangeSetID ? (eu.ChangeSet?.Slug ?? null) : null;
  }
  if (attr.startsWith(SPACE_LABEL_PREFIX))
    return eu.Space?.Labels?.[attr.slice(SPACE_LABEL_PREFIX.length)] ?? null;
  if (attr.startsWith(LABEL_PREFIX))
    return u.Labels?.[attr.slice(LABEL_PREFIX.length)] ?? null;
  return UNKNOWN_ATTRIBUTE;
}

function resolveSpaceAttribute(attr: string, es: ExtendedSpaceRead): AttrResult {
  const s = es.Space;
  if (!s) return null;
  switch (attr) {
    case 'Slug':
      return s.Slug ?? null;
    case 'DisplayName':
      return orNull(s.DisplayName);
    case 'SpaceID':
      return orNull(s.SpaceID);
    case 'CreatedAt':
      return orNull(s.CreatedAt);
    case 'UpdatedAt':
      return orNull(s.UpdatedAt);
    case 'ComponentID':
      return s.ComponentID || null;
    case 'Component.Slug':
      return s.ComponentID ? (es.Component?.Slug ?? null) : null;
  }
  if (attr.startsWith(LABEL_PREFIX))
    return s.Labels?.[attr.slice(LABEL_PREFIX.length)] ?? null;
  return UNKNOWN_ATTRIBUTE;
}

function resolveResourceAttribute(attr: string, r: ResourceViewRow): AttrResult {
  switch (attr) {
    case 'ResourceName':
      return r.ResourceName;
    case 'ResourceType':
      return r.ResourceType;
    case 'ToolchainType':
      return orNull(r.UnitToolchainType);
    case 'UnitID':
      return r.UnitID;
    case 'SpaceID':
      return r.SpaceID;
    // The row carries the Target's slug, not its id; a slug means a Target.
    case 'TargetID':
      return r.TargetSlug ? r.TargetSlug : null;
    case 'Target.Slug':
      return r.TargetSlug ?? null;
    case 'Unit.Slug':
      return r.UnitSlug;
    case 'Space.Slug':
      return r.SpaceSlug;
    case 'Unit.HeadRevisionNum':
      return r.UnitHeadRevisionNum ?? 0;
    case 'Unit.LastReleasedRevisionNum':
      return r.UnitLastReleasedRevisionNum ?? 0;
  }
  if (attr.startsWith(UNIT_LABEL_PREFIX))
    return r.UnitLabels[attr.slice(UNIT_LABEL_PREFIX.length)] ?? null;
  if (attr.startsWith(SPACE_LABEL_PREFIX))
    return r.SpaceLabels[attr.slice(SPACE_LABEL_PREFIX.length)] ?? null;
  return UNKNOWN_ATTRIBUTE;
}

/** The value of an attribute that must be known, for field accessors. */
function known(entity: EntityKind, attr: string) {
  return (row: EntityRow): AttrValue => {
    const v = resolveAttribute(entity, attr, row);
    return v === UNKNOWN_ATTRIBUTE ? null : v;
  };
}

/* ------------------------------------------------------------------------ */
/* Statuses                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Each status as its WHERE conjuncts, per entity. The Unreleased pair is the
 * same expression the Units page and the server's per-Space
 * UnreleasedUnitCount use. A Space has no status attributes the server can
 * filter on (its counts are summaries, not attributes), so Spaces have none.
 */
export const STATUS_WHERE: Record<
  EntityKind,
  Partial<Record<StatusKind, readonly string[]>>
> = {
  Unit: {
    unreleased: ['HeadRevisionNum > LastReleasedRevisionNum', 'TargetID IS NOT NULL'],
    upgradable: [
      'UpstreamRevisionNum > 0',
      'UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum',
    ],
    released: ['HeadRevisionNum = LastReleasedRevisionNum', 'TargetID IS NOT NULL'],
    untargeted: ['TargetID IS NULL'],
  },
  Space: {},
  Resource: {
    unreleased: [
      'Unit.HeadRevisionNum > Unit.LastReleasedRevisionNum',
      'TargetID IS NOT NULL',
    ],
    released: ['Unit.HeadRevisionNum = Unit.LastReleasedRevisionNum', 'TargetID IS NOT NULL'],
    untargeted: ['TargetID IS NULL'],
  },
};

export const STATUS_LABEL: Record<StatusKind, string> = {
  unreleased: 'Unreleased',
  upgradable: 'Upgrade available',
  released: 'Released',
  untargeted: 'Not targeted',
};

/** Group order of the Status column: the most urgent first. */
export const STATUS_ORDER: readonly string[] = [
  'Unreleased',
  'Upgrade available',
  'Not targeted',
  'Released',
];

export function statusesFor(entity: EntityKind): StatusKind[] {
  return (Object.keys(STATUS_WHERE[entity]) as StatusKind[]).filter(
    (k) => STATUS_WHERE[entity][k],
  );
}

/** One status per Unit for the Status column: untargeted, unreleased, upgradable, then released. */
export function unitStatusLabel(eu: ExtendedUnitRead): string {
  const u = eu.Unit;
  if (!u?.TargetID) return STATUS_LABEL.untargeted;
  if ((u.HeadRevisionNum ?? 0) > (u.LastReleasedRevisionNum ?? 0))
    return STATUS_LABEL.unreleased;
  if (isUpgradable(eu)) return STATUS_LABEL.upgradable;
  return STATUS_LABEL.released;
}

export function isUpgradable(eu: ExtendedUnitRead): boolean {
  const upstream = eu.Unit?.UpstreamRevisionNum ?? 0;
  return upstream > 0 && upstream < (eu.UpstreamUnit?.HeadRevisionNum ?? 0);
}

function resourceStatusLabel(r: ResourceViewRow): string {
  if (!r.TargetSlug) return STATUS_LABEL.untargeted;
  if ((r.UnitHeadRevisionNum ?? 0) > (r.UnitLastReleasedRevisionNum ?? 0))
    return STATUS_LABEL.unreleased;
  return STATUS_LABEL.released;
}

/* ------------------------------------------------------------------------ */
/* Catalogs                                                                  */
/* ------------------------------------------------------------------------ */

type FieldInit = Omit<FieldDef, 'entity' | 'value' | 'category' | 'ops' | 'width'> &
  Partial<Pick<FieldDef, 'value' | 'category' | 'ops' | 'width'>>;

function define(entity: EntityKind, init: FieldInit): FieldDef {
  const ops =
    init.ops ??
    (init.type === 'number'
      ? NUMBER_OPS
      : init.type === 'time'
        ? TIME_OPS
        : init.nullWhere
          ? NULLABLE_TEXT_OPS
          : TEXT_OPS);
  return {
    category: 'field',
    width: init.type === 'number' ? 110 : init.type === 'time' ? 120 : 150,
    ...init,
    entity,
    ops: init.where ? ops : [],
    value: init.value ?? (init.where ? known(entity, init.where) : () => null),
  };
}

const UNIT_FIELDS: readonly FieldDef[] = [
  define('Unit', {
    id: 'Slug',
    label: 'Unit',
    type: 'string',
    where: 'Slug',
    token: 'name',
    width: 180,
  }),
  define('Unit', {
    id: 'Space',
    label: 'Space',
    type: 'string',
    where: 'Space.Slug',
    token: 'space',
    width: 160,
  }),
  // Target has no `empty` op: a Unit with no Target is the Not targeted status.
  define('Unit', {
    id: 'Target',
    label: 'Target',
    type: 'string',
    where: 'Target.Slug',
    nullWhere: 'TargetID',
    token: 'target',
    ops: ['is', 'isNot', 'matches', 'notEmpty'],
  }),
  define('Unit', {
    id: 'ToolchainType',
    label: 'Toolchain',
    type: 'string',
    where: 'ToolchainType',
    token: 'toolchain',
  }),
  define('Unit', {
    id: 'ProviderType',
    label: 'Provider',
    type: 'string',
    where: 'ProviderType',
    token: 'provider',
  }),
  define('Unit', {
    id: 'DisplayName',
    label: 'Display name',
    type: 'string',
    where: 'DisplayName',
  }),
  define('Unit', {
    id: 'HeadRevisionNum',
    label: 'Head revision',
    type: 'number',
    where: 'HeadRevisionNum',
  }),
  define('Unit', {
    id: 'LastReleasedRevisionNum',
    label: 'Released revision',
    type: 'number',
    where: 'LastReleasedRevisionNum',
  }),
  define('Unit', {
    id: 'UpstreamRevisionNum',
    label: 'Upstream revision',
    type: 'number',
    where: 'UpstreamRevisionNum',
  }),
  define('Unit', {
    id: 'UpstreamUnitSlug',
    label: 'Upstream unit',
    type: 'string',
    where: 'UpstreamUnit.Slug',
    nullWhere: 'UpstreamUnitID',
  }),
  define('Unit', {
    id: 'UpstreamSpaceSlug',
    label: 'Upstream space',
    type: 'string',
    where: 'UpstreamSpace.Slug',
    nullWhere: 'UpstreamSpaceID',
    token: 'upstream',
  }),
  define('Unit', {
    id: 'ChangeSetSlug',
    label: 'Change set',
    type: 'string',
    where: 'ChangeSet.Slug',
    nullWhere: 'ChangeSetID',
    token: 'changeset',
  }),
  define('Unit', {
    id: 'LastChangeDescription',
    label: 'Last change',
    type: 'string',
    where: 'LastChangeDescription',
    width: 240,
  }),
  define('Unit', { id: 'CreatedAt', label: 'Created', type: 'time', where: 'CreatedAt' }),
  define('Unit', { id: 'UpdatedAt', label: 'Updated', type: 'time', where: 'UpdatedAt' }),
  define('Unit', {
    id: 'Status',
    label: 'Status',
    type: 'status',
    category: 'computed',
    width: 200,
    value: (row) => unitStatusLabel(unitOf(row)),
  }),
  define('Unit', {
    id: 'UnreleasedChanges',
    label: 'Unreleased changes',
    type: 'bool',
    category: 'computed',
    value: (row) => {
      const u = unitOf(row).Unit;
      return !!u?.TargetID && (u.HeadRevisionNum ?? 0) > (u.LastReleasedRevisionNum ?? 0)
        ? 'Yes'
        : 'No';
    },
  }),
  define('Unit', {
    id: 'UpgradeNeeded',
    label: 'Upgrade needed',
    type: 'bool',
    category: 'computed',
    value: (row) => (isUpgradable(unitOf(row)) ? 'Yes' : 'No'),
  }),
];

const SPACE_COUNT_FIELDS: ReadonlyArray<[keyof ExtendedSpaceRead, string]> = [
  ['TotalUnitCount', 'Units'],
  ['UnreleasedUnitCount', 'Unreleased units'],
  ['UpgradableUnitCount', 'Upgradable units'],
  ['UnlinkedUnitCount', 'Unlinked units'],
  ['GatedUnitCount', 'Gated units'],
  ['TotalLinkCount', 'Links'],
  ['TotalTargetCount', 'Targets'],
];

const SPACE_FIELDS: readonly FieldDef[] = [
  define('Space', {
    id: 'Slug',
    label: 'Space',
    type: 'string',
    where: 'Slug',
    token: 'space',
    width: 200,
  }),
  define('Space', {
    id: 'DisplayName',
    label: 'Display name',
    type: 'string',
    where: 'DisplayName',
  }),
  define('Space', {
    id: 'Component',
    label: 'Component',
    type: 'string',
    where: 'Component.Slug',
    nullWhere: 'ComponentID',
    token: 'component',
  }),
  define('Space', { id: 'CreatedAt', label: 'Created', type: 'time', where: 'CreatedAt' }),
  define('Space', { id: 'UpdatedAt', label: 'Updated', type: 'time', where: 'UpdatedAt' }),
  ...SPACE_COUNT_FIELDS.map(([key, label]) =>
    define('Space', {
      id: key,
      label,
      type: 'number',
      category: 'computed',
      value: (row) => {
        const v = spaceOf(row)[key];
        return typeof v === 'number' ? v : null;
      },
    }),
  ),
];

const RESOURCE_FIELDS: readonly FieldDef[] = [
  define('Resource', {
    id: 'ResourceName',
    label: 'Resource',
    type: 'string',
    where: 'ResourceName',
    token: 'name',
    width: 200,
  }),
  define('Resource', {
    id: 'ResourceType',
    label: 'Resource type',
    type: 'string',
    where: 'ResourceType',
    token: 'kind',
    width: 220,
  }),
  define('Resource', {
    id: 'Unit.Slug',
    label: 'Unit',
    type: 'string',
    where: 'Unit.Slug',
    token: 'unit',
  }),
  define('Resource', {
    id: 'Space.Slug',
    label: 'Space',
    type: 'string',
    where: 'Space.Slug',
    token: 'space',
  }),
  define('Resource', {
    id: 'Unit.Target',
    label: 'Target',
    type: 'string',
    where: 'Target.Slug',
    nullWhere: 'TargetID',
    token: 'target',
    ops: ['is', 'isNot', 'matches', 'notEmpty'],
  }),
  define('Resource', {
    id: 'Unit.ToolchainType',
    label: 'Toolchain',
    type: 'string',
    where: 'ToolchainType',
    token: 'toolchain',
  }),
  define('Resource', {
    id: 'Unit.HeadRevisionNum',
    label: 'Head revision',
    type: 'number',
    category: 'computed',
    value: known('Resource', 'Unit.HeadRevisionNum'),
  }),
  define('Resource', {
    id: 'Status',
    label: 'Status',
    type: 'status',
    category: 'computed',
    width: 200,
    value: (row) => resourceStatusLabel(resourceOf(row)),
  }),
];

const STATIC_FIELDS: Record<EntityKind, readonly FieldDef[]> = {
  Unit: UNIT_FIELDS,
  Space: SPACE_FIELDS,
  Resource: RESOURCE_FIELDS,
};

/** The label prefixes each entity's rows answer, with the attribute each one filters on. */
const LABEL_PREFIXES: Record<
  EntityKind,
  ReadonlyArray<{ prefix: string; where: string; category: FieldCategory }>
> = {
  Unit: [
    { prefix: SPACE_LABEL_PREFIX, where: SPACE_LABEL_PREFIX, category: 'space-label' },
    { prefix: LABEL_PREFIX, where: LABEL_PREFIX, category: 'label' },
  ],
  Space: [{ prefix: LABEL_PREFIX, where: LABEL_PREFIX, category: 'label' }],
  Resource: [
    { prefix: SPACE_LABEL_PREFIX, where: SPACE_LABEL_PREFIX, category: 'space-label' },
    { prefix: UNIT_LABEL_PREFIX, where: UNIT_LABEL_PREFIX, category: 'label' },
    // Older Resource views name the Unit's labels with the bare prefix.
    { prefix: LABEL_PREFIX, where: UNIT_LABEL_PREFIX, category: 'label' },
  ],
};

function labelField(entity: EntityKind, id: string): FieldDef | undefined {
  for (const { prefix, where, category } of LABEL_PREFIXES[entity]) {
    if (!id.startsWith(prefix)) continue;
    const key = id.slice(prefix.length);
    if (!/^[A-Za-z0-9]([-_./A-Za-z0-9]*[A-Za-z0-9])?$/.test(key)) return undefined;
    return define(entity, {
      id,
      label: category === 'space-label' ? `Space ${key}` : key,
      type: 'string',
      category,
      where: where + key,
      nullWhere: where + key,
      token: category === 'label' ? `label.${key}` : undefined,
      width: 120,
    });
  }
  return undefined;
}

/** The field with this id (a column name), including label fields. */
export function fieldById(entity: EntityKind, id: string): FieldDef | undefined {
  return STATIC_FIELDS[entity].find((f) => f.id === id) ?? labelField(entity, id);
}

/** The id of the label field for a key: `Labels.app` for Units and Spaces, `Unit.Labels.app` for Resources. */
export function labelFieldId(entity: EntityKind, key: string): string {
  return (entity === 'Resource' ? UNIT_LABEL_PREFIX : LABEL_PREFIX) + key;
}

/** The fields of an entity, with one label field for each known label key. */
export function fieldCatalog(
  entity: EntityKind,
  labelKeys: readonly string[] = [],
): FieldDef[] {
  const labels = labelKeys
    .map((k) => labelField(entity, labelFieldId(entity, k)))
    .filter((f): f is FieldDef => !!f);
  return [...STATIC_FIELDS[entity], ...labels];
}

/** The field a WHERE attribute belongs to, for reading a conjunct back as a lens. */
export function fieldByWhere(entity: EntityKind, attr: string): FieldDef | undefined {
  const direct = STATIC_FIELDS[entity].find((f) => f.where === attr);
  if (direct) return direct;
  for (const { prefix, where } of LABEL_PREFIXES[entity]) {
    if (attr.startsWith(where) && prefix === where) return labelField(entity, attr);
  }
  return undefined;
}

/** The field whose `empty` / `notEmpty` uses this attribute. */
export function fieldByNullWhere(entity: EntityKind, attr: string): FieldDef | undefined {
  const direct = STATIC_FIELDS[entity].find((f) => f.nullWhere === attr);
  if (direct) return direct;
  const label = fieldByWhere(entity, attr);
  return label?.nullWhere === attr ? label : undefined;
}

/** The field a token key names: a field's `token`, `label.<key>`, or a bare label key. */
export function fieldByToken(
  entity: EntityKind,
  key: string,
  labelKeys: readonly string[] = [],
): FieldDef | undefined {
  const k = key.toLowerCase();
  const direct = STATIC_FIELDS[entity].find((f) => f.token === k);
  if (direct) return direct;
  if (k.startsWith('label.'))
    return labelField(entity, labelFieldId(entity, key.slice('label.'.length)));
  const bare = labelKeys.find((l) => l.toLowerCase() === k);
  return bare ? labelField(entity, labelFieldId(entity, bare)) : undefined;
}

/** The token keys of an entity's static fields, for prefix expansion. */
export function tokenKeys(entity: EntityKind): string[] {
  return STATIC_FIELDS[entity].map((f) => f.token).filter((t): t is string => !!t);
}

/* ------------------------------------------------------------------------ */
/* Defaults                                                                  */
/* ------------------------------------------------------------------------ */

const DEFAULT_COLUMNS: Record<EntityKind, readonly string[]> = {
  Unit: ['Slug', 'Space', 'Target', 'ToolchainType', 'HeadRevisionNum', 'Status', 'UpdatedAt'],
  Space: [
    'Slug',
    'Component',
    'TotalUnitCount',
    'UnreleasedUnitCount',
    'UpgradableUnitCount',
    'UpdatedAt',
  ],
  Resource: [
    'ResourceName',
    'ResourceType',
    'Unit.Slug',
    'Space.Slug',
    'Unit.Target',
    'Status',
  ],
};

const DEFAULT_MATRIX: Record<EntityKind, { rows: string; cols: string }> = {
  Unit: { rows: 'Space', cols: 'Target' },
  // Few values on each axis; a Space's own name would give one column per Space.
  Space: { rows: 'Labels.team', cols: 'Labels.env' },
  Resource: { rows: 'Space.Slug', cols: 'ResourceType' },
};

/** A new, empty view of an entity: no lenses, the default columns, newest first. */
export function defaultViewDef(entity: EntityKind): ViewDef {
  return {
    entity,
    lenses: [],
    resourceType: '',
    whereData: '',
    groupBy: [],
    sort:
      entity === 'Resource'
        ? { column: 'ResourceName', dir: 'ASC' }
        : { column: 'UpdatedAt', dir: 'DESC' },
    columns: DEFAULT_COLUMNS[entity].map((name) => ({ name })),
    layout: 'table',
    matrix: { ...DEFAULT_MATRIX[entity] },
  };
}
