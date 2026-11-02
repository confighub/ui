// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the Blame tab shows of a Unit's fields, and the requests its actions send for the
 * fields selected. Kept free of React so the request bodies can be checked without a page.
 */
import type {
  BlameField,
  BlameOrigin,
  FunctionInvocationsRequest,
  ResourceGuards,
  ResourceProtection,
  UnitConflictSelector,
} from '@confighub/rtk-query';

/** A flag code the server returns on a field, with how the tab shows it. */
export interface BlameFlagMeta {
  code: string;
  /** A short label for a chip. */
  label: string;
  /** What the flag means, for a tooltip. */
  meaning: string;
  /** Something is wrong or pending: the field needs attention. */
  attention: boolean;
  /** The flag's own hue, so each flag is recognizable at a glance. */
  color: string;
}

/** Every flag, in the order the server lists them. */
const BLAME_FLAG_TEXT: readonly Omit<BlameFlagMeta, 'color'>[] = [
  {
    code: 'Protected',
    label: 'Kept on merge',
    meaning:
      'Protected: an override a merge from upstream leaves alone, by itself or as part of a resource protected as a whole',
    attention: false,
  },
  {
    code: 'Guarded',
    label: 'Guarded',
    meaning:
      'Reasons are recorded for this value, and an operation must be cleared for them to overwrite it',
    attention: false,
  },
  {
    code: 'Conflict',
    label: 'Conflict',
    meaning: 'A merge or resolve dropped an upstream change to this field',
    attention: true,
  },
  {
    code: 'Absent',
    label: 'Absent',
    meaning:
      'The Unit does not have this field; a conflict names a change that could not be made to it',
    attention: true,
  },
  {
    code: 'Finding',
    label: 'Link finding',
    meaning: "A Link's resolve could not do what it names here",
    attention: true,
  },
  {
    code: 'ValidationError',
    label: 'Validation error',
    meaning: "A validating Trigger's failed check names this field, which blocks a release",
    attention: true,
  },
  {
    code: 'ValidationWarning',
    label: 'Validation warning',
    meaning: 'A validating Trigger with Warn set failed a check that names this field',
    attention: true,
  },
  {
    code: 'Upgraded',
    label: 'Upgraded',
    meaning: 'An upgrade from upstream brought the value to this Unit',
    attention: false,
  },
  {
    code: 'SetByLink',
    label: 'Set by Link',
    meaning: 'A Link set the value in this Unit, by resolving or merging',
    attention: false,
  },
  {
    code: 'SetByTrigger',
    label: 'Set by Trigger',
    meaning: 'A Trigger set the value in this Unit',
    attention: false,
  },
  {
    code: 'ChangeOrder',
    label: 'ChangeOrder',
    meaning: 'The change in this Unit was made by a ChangeOrder',
    attention: false,
  },
  {
    code: 'Unreleased',
    label: 'Unreleased',
    meaning:
      "The value changed after the Unit's last Release, or the Unit has never been released",
    attention: false,
  },
  {
    code: 'Needed',
    label: 'Needed',
    meaning: 'The value is to come from an upstream Unit, through a NeedsProvides Link',
    attention: false,
  },
  {
    code: 'Provided',
    label: 'Provided',
    meaning: 'The value is offered to downstream Units, through NeedsProvides Links',
    attention: false,
  },
];

/**
 * Each flag's hue. The flags that need attention are reds and oranges, and the rest each have a
 * hue of their own, so that two flags side by side are told apart without reading them.
 */
const BLAME_FLAG_COLORS: Readonly<Record<string, string>> = {
  Protected: '#1e88e5',
  Guarded: '#5e35b1',
  Conflict: '#d84315',
  Absent: '#e65100',
  Finding: '#b26a00',
  ValidationError: '#c62828',
  ValidationWarning: '#ef6c00',
  Upgraded: '#00897b',
  SetByLink: '#0097a7',
  SetByTrigger: '#8e24aa',
  ChangeOrder: '#6d4c41',
  Unreleased: '#546e7a',
  Needed: '#2e7d32',
  Provided: '#689f38',
};

const UNKNOWN_FLAG_COLOR = '#757575';

/** Every flag, in the order the server lists them. */
export const BLAME_FLAGS: readonly BlameFlagMeta[] = BLAME_FLAG_TEXT.map((flag) => ({
  ...flag,
  color: BLAME_FLAG_COLORS[flag.code] ?? UNKNOWN_FLAG_COLOR,
}));

const FLAG_BY_CODE = new Map(BLAME_FLAGS.map((flag) => [flag.code, flag]));

/** How the tab shows a flag code, or a plain chip for a code this version does not know. */
export function blameFlagMeta(code: string): BlameFlagMeta {
  return (
    FLAG_BY_CODE.get(code) ?? {
      code,
      label: code,
      meaning: code,
      attention: false,
      color: UNKNOWN_FLAG_COLOR,
    }
  );
}

/** The flags whose chip opens the Overview tab, where the failed checks are shown in full. */
export const VALIDATION_FLAGS: readonly string[] = ['ValidationError', 'ValidationWarning'];

/**
 * The failed checks a validation flag stands for, one line each, for the chip's tooltip: the
 * check, its severity, and what the function said, or what it found where it said nothing.
 */
export function validationSummary(field: BlameField, warning: boolean): string[] {
  return (field.Validation ?? [])
    .filter((validation) => Boolean(validation.Warning) === warning)
    .map((validation) => {
      const messages = [
        ...(validation.Issues ?? [])
          .map((issue) => issue.Message)
          .filter((message): message is string => !!message),
        ...(validation.Details ?? []),
      ];
      if (
        messages.length === 0 &&
        validation.Value !== undefined &&
        validation.Value !== null
      ) {
        messages.push(`found ${JSON.stringify(validation.Value)}`);
      }
      let line = validation.Gate ?? '';
      if (validation.Score) line += ` (${validation.Score})`;
      if (validation.Path) line += ` at ${validation.Path}`;
      return messages.length > 0 ? `${line}: ${messages.join('; ')}` : line;
    });
}

/** The flags the server selects for "Needs attention", as the `flags` parameter takes them. */
export const NEEDS_ATTENTION_FLAGS =
  'Conflict,Absent,Finding,ValidationError,ValidationWarning';

/** One row of the tab's grid: a field and what the grid shows of it. */
export interface BlameRow {
  id: string;
  field: BlameField;
  resource: string;
  /** The hop that set the value: the end of the chain. */
  origin?: BlameOrigin;
  /** The change in this Unit that brought the value: the start of the chain. */
  here?: BlameOrigin;
}

/** The resource a field is in, as `type name`. */
export function resourceLabel(
  field: Pick<BlameField, 'ResourceType' | 'ResourceName'>,
): string {
  return [field.ResourceType, field.ResourceName].filter(Boolean).join(' ');
}

/** The grid's rows, by resource and then path. A REF is unique within a Unit, but two
 * resources can share a path, so the id names the resource too. */
export function blameRows(fields: readonly BlameField[] | undefined): BlameRow[] {
  return (fields ?? [])
    .map((field) => {
      const chain = field.Chain ?? [];
      return {
        id: [field.Ref, field.ResourceType, field.ResourceName, field.Path].join('|'),
        field,
        resource: resourceLabel(field),
        origin: chain[chain.length - 1],
        here: chain[0],
      };
    })
    .sort(
      (a, b) =>
        a.resource.localeCompare(b.resource) ||
        (a.field.Path ?? '').localeCompare(b.field.Path ?? ''),
    );
}

/** What the tab filters in the browser. */
export interface BlameFilter {
  /** Only paths containing this. */
  path: string;
  /** Only this resource, as `resourceLabel` names it; empty for every one. */
  resource: string;
  /** Only fields with at least one of these flags; empty for every field. */
  flags: readonly string[];
}

export const NO_BLAME_FILTER: BlameFilter = { path: '', resource: '', flags: [] };

export function filterBlameRows(rows: readonly BlameRow[], filter: BlameFilter): BlameRow[] {
  return rows.filter((row) => {
    if (filter.path !== '' && !(row.field.Path ?? '').includes(filter.path)) return false;
    if (filter.resource !== '' && row.resource !== filter.resource) return false;
    if (
      filter.flags.length > 0 &&
      !(row.field.Flags ?? []).some((flag) => filter.flags.includes(flag))
    )
      return false;
    return true;
  });
}

/** The resources of the rows, for the resource filter. */
export function blameResources(rows: readonly BlameRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.resource)));
}

const hasFlag = (field: BlameField, code: string) => (field.Flags ?? []).includes(code);

/** Whether an action applies to at least one of the selected fields. */
export const blameActionApplies = {
  protect: (fields: readonly BlameField[]) => fields.some((f) => !f.Absent && !f.Protected),
  // A field protected because its resource is, as a whole, is unprotected by unprotecting the
  // resource, which is not what selecting the field asks for.
  unprotect: (fields: readonly BlameField[]) =>
    fields.some((f) => f.Protected && !f.ResourceProtected),
  guard: (fields: readonly BlameField[]) => fields.some((f) => !f.Absent),
  removeGuard: (fields: readonly BlameField[]) =>
    fields.some((f) => Object.keys(f.Guards ?? {}).length > 0),
  conflicts: (fields: readonly BlameField[]) =>
    fields.some((f) => hasFlag(f, 'Conflict') || (f.Conflicts ?? []).length > 0),
  setValue: (fields: readonly BlameField[]) => fields.length === 1 && !fields[0].Absent,
};

/** Groups fields by resource, in the order they first appear. */
function byResource<T>(
  fields: readonly BlameField[],
  entry: (field: BlameField) => [string, T] | undefined,
) {
  const groups = new Map<string, { field: BlameField; entries: [string, T][] }>();
  for (const field of fields) {
    const pair = entry(field);
    if (pair === undefined) continue;
    const key = `${field.ResourceType}\u0000${field.ResourceName}`;
    const group = groups.get(key) ?? { field, entries: [] };
    group.entries.push(pair);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

/** The SetUnitProtection edits that protect, or unprotect, the selected fields' paths. */
export function protectionRequest(
  fields: readonly BlameField[],
  protect: boolean,
): ResourceProtection[] {
  return byResource(fields, (field) => {
    if (field.Absent || field.Path === undefined) return undefined;
    if (!protect && (!field.Protected || field.ResourceProtected)) return undefined;
    if (protect && field.Protected) return undefined;
    return [field.Path, protect];
  }).map(({ field, entries }) => ({
    Resource: { ResourceType: field.ResourceType, ResourceName: field.ResourceName },
    Protected: Object.fromEntries(entries),
  }));
}

/** The SetUnitGuard edits that record one guard on the selected fields' paths. */
export function guardSetRequest(
  fields: readonly BlameField[],
  key: string,
  value: string,
): ResourceGuards[] {
  return byResource(fields, (field) =>
    field.Absent || field.Path === undefined ? undefined : [field.Path, { [key]: value }],
  ).map(({ field, entries }) => ({
    Resource: { ResourceType: field.ResourceType, ResourceName: field.ResourceName },
    Set: Object.fromEntries(entries),
  }));
}

/**
 * The SetUnitGuard edits that remove one guard key from the selected fields' paths. A guard a
 * field inherits from an ancestor or its resource is not on the field's own path, so it is
 * removed only where the field itself holds it; the server reports a key it did not find.
 */
export function guardRemoveRequest(
  fields: readonly BlameField[],
  key: string,
): ResourceGuards[] {
  return byResource(fields, (field) =>
    field.Path === undefined || field.Guards?.[key] === undefined
      ? undefined
      : [field.Path, [key]],
  ).map(({ field, entries }) => ({
    Resource: { ResourceType: field.ResourceType, ResourceName: field.ResourceName },
    Remove: Object.fromEntries(entries),
  }));
}

/** The guard keys the selected fields have, for the remove dialog. */
export function guardKeys(fields: readonly BlameField[]): string[] {
  return Array.from(
    new Set(fields.flatMap((field) => Object.keys(field.Guards ?? {}))),
  ).sort();
}

/** The ResolveUnitConflicts selectors for the conflicts on the selected fields. */
export function conflictSelectors(fields: readonly BlameField[]): UnitConflictSelector[] {
  const selectors: UnitConflictSelector[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    for (const conflict of field.Conflicts ?? []) {
      // The type keeps apart a resource of the same name, as a Deployment and a Service named
      // for their app are.
      const selector = {
        ResourceType: conflict.Resource?.ResourceType,
        ResourceName: conflict.Resource?.ResourceName,
        Path: conflict.Path,
      };
      const key = `${selector.ResourceType}\u0000${selector.ResourceName}\u0000${selector.Path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      selectors.push(selector);
    }
  }
  return selectors;
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * The invocation that sets one field's value with set-path, which writes at a path in every
 * resource that has it; WhereResource narrows it to the field's own resource.
 */
export function setValueRequest(
  field: BlameField,
  value: string,
  changeDescription: string,
): FunctionInvocationsRequest {
  return {
    ChangeDescription: changeDescription || undefined,
    FunctionInvocations: [
      {
        FunctionName: 'set-path',
        Arguments: [
          { ParameterName: 'path', Value: field.Path ?? '' },
          { ParameterName: 'value', Value: value },
        ],
      },
    ],
    WhereResource: `ConfigHub.ResourceType = ${quote(field.ResourceType ?? '')} AND ConfigHub.ResourceName = ${quote(field.ResourceName ?? '')}`,
  };
}

/** A Unit as the UI shows one: `SPACE/Unit`. */
/**
 * Whether the field's value was set in its own Unit, rather than in an upstream Unit and
 * brought here by a merge or a Link. A field with no recorded change is neither.
 */
export function setInThisUnit(row: Pick<BlameRow, 'field' | 'origin'>): boolean | undefined {
  if (!row.origin?.UnitID || !row.field.UnitID) return undefined;
  return row.origin.UnitID === row.field.UnitID;
}

export function originUnitLabel(
  origin: Pick<BlameOrigin, 'SpaceSlug' | 'UnitSlug'> | undefined,
): string {
  if (origin === undefined) return '';
  return [origin.SpaceSlug, origin.UnitSlug].filter(Boolean).join('/');
}
