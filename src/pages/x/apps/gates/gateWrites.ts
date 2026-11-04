// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { FunctionInvocation, FunctionInvocationsResponse } from '@confighub/rtk-query';
import { stringify } from 'yaml';

import type { SetAttributeDataType } from '../useSetAttributesMutation';
import type { GateField } from './gateModel';

/**
 * A fix the user staged on a row. Nothing is written until "Save N fixes and re-check".
 * - set: a typed value (set-attributes, the field's own type).
 * - yaml: a whole value written back as YAML: the released value, the value before a change,
 *   a quoted value, or null.
 * - delete: remove the duplicate list entry (delete-path).
 */
export type StagedFix =
  | { op: 'set'; value: string }
  | { op: 'yaml'; value: string; label: string }
  | { op: 'delete' };

/** The set-attributes DataType for a typed value: the field's own, else read from the text. */
export const typedDataType = (
  field: Pick<GateField, 'dataType' | 'value'>,
  text: string,
): SetAttributeDataType => {
  if (field.dataType === 'int' || field.dataType === 'bool' || field.dataType === 'string')
    return field.dataType;
  if (typeof field.value === 'number') return 'int';
  if (typeof field.value === 'boolean') return 'bool';
  if (typeof field.value === 'string') return 'string';
  if (text === 'true' || text === 'false') return 'bool';
  if (text !== '' && /^-?\d+$/.test(text)) return 'int';
  return 'string';
};

const typedValue = (text: string, type: SetAttributeDataType): unknown => {
  if (type === 'int') return Number(text);
  if (type === 'bool') return text === 'true';
  return text;
};

/**
 * Why a typed value cannot be written as the field's type, or undefined when it can. A number
 * field gets a whole number, a true/false field gets true or false; anything else would be sent
 * as null.
 */
export const typedValueProblem = (
  field: Pick<GateField, 'dataType' | 'value'>,
  text: string,
): string | undefined => {
  const type = typedDataType(field, text);
  if (type === 'int' && !/^-?\d+$/.test(text.trim())) return 'Enter a whole number.';
  if (type === 'bool' && text !== 'true' && text !== 'false') return 'Enter true or false.';
  return undefined;
};

/**
 * The list entry a vet-merge-keys finding names: its path without the key field, by position
 * (`containers.2.name` -> `containers.2`). Two duplicate entries share one merge key, so only the
 * position tells them apart.
 */
export const duplicateEntryPath = (path: string): string => path.replace(/\.[^.]+$/, '');

/** The position of the list entry a path ends in (`containers.2` -> 2), or -1. */
const entryIndex = (path: string): number => {
  const last = path.split('.').pop() ?? '';
  return /^\d+$/.test(last) ? Number(last) : -1;
};

/** A ConfigHub resource filter that selects one resource, by its type and name. */
export const oneResourceFilter = (resourceType: string, resourceName: string): string =>
  `ConfigHub.ResourceType = ${quote(resourceType)} AND ConfigHub.ResourceName = ${quote(resourceName)}`;

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** The value written for "Quote it": the found text as a YAML double-quoted string. */
export const quotedYaml = (text: string): string => JSON.stringify(text);

/**
 * The function invocations that write the staged fixes of one Unit, as ONE request, so they
 * make one Revision: one set-attributes with every value, then a delete-path per removed entry.
 * ResourceType and ResourceName are always sent: without them set-attributes skips a path it
 * cannot resolve and still reports success. delete-path takes only a type and a path, so each
 * delete is limited to its own resource; and the deletes in one list go from the last entry to
 * the first, because removing an entry moves the ones after it.
 */
export const fixInvocations = (
  fields: GateField[],
  staged: ReadonlyMap<string, StagedFix>,
): FunctionInvocation[] => {
  const attributes: object[] = [];
  const deletes: { path: string; resource: string; invocation: FunctionInvocation }[] = [];
  for (const field of fields) {
    const fix = staged.get(field.key);
    if (!fix) continue;
    const resource = {
      ...(field.resourceType ? { ResourceType: field.resourceType } : {}),
      ...(field.resourceName
        ? {
            ResourceName: field.resourceName,
            ResourceNameWithoutScope: field.resourceNameWithoutScope ?? '',
          }
        : {}),
    };
    if (fix.op === 'delete') {
      const path = duplicateEntryPath(field.path);
      deletes.push({
        path,
        resource: `${field.resourceType ?? ''}\u0000${field.resourceName ?? ''}`,
        invocation: {
          FunctionName: 'delete-path',
          ...(field.resourceType && field.resourceName
            ? { WhereResource: oneResourceFilter(field.resourceType, field.resourceName) }
            : {}),
          Arguments: [
            { ParameterName: 'resource-type', Value: field.resourceType ?? '' },
            { ParameterName: 'path', Value: path },
          ],
        },
      });
      continue;
    }
    const dataType: SetAttributeDataType =
      fix.op === 'yaml' ? 'YAML' : typedDataType(field, fix.value);
    attributes.push({
      AttributeName: field.path,
      Path: field.path,
      DataType: dataType,
      Value: fix.op === 'yaml' ? fix.value : typedValue(fix.value, dataType),
      ...resource,
    });
  }
  const invocations: FunctionInvocation[] = [];
  if (attributes.length > 0) {
    invocations.push({
      FunctionName: 'set-attributes',
      Arguments: [{ ParameterName: 'attribute-list', Value: JSON.stringify(attributes) }],
    });
  }
  const ordered = [...deletes].sort(
    (a, b) =>
      a.resource.localeCompare(b.resource) ||
      duplicateEntryPath(a.path).localeCompare(duplicateEntryPath(b.path)) ||
      entryIndex(b.path) - entryIndex(a.path),
  );
  return [...invocations, ...ordered.map((d) => d.invocation)];
};

/** The paths a failed set-attributes write names, from the server's "matches nothing" detail. */
export const unmatchedPaths = (message: string): string[] =>
  [...message.matchAll(/path (\S+) matches nothing/g)].map((m) => m[1]);

/**
 * Whether a Trigger ran on a Unit, read from the server's answer for that Unit. The request can
 * answer 207 with one Unit failed, so the per-Unit item is read, not only the status.
 */
export const triggerRunOutcome = (
  response: FunctionInvocationsResponse | undefined,
): { ran: true } | { ran: false; reason: string } => {
  if (!response) return { ran: false, reason: 'The server sent no answer for this Unit.' };
  if (response.Error?.Message || response.Success === false) {
    return { ran: false, reason: response.Error?.Message || 'The Trigger did not run.' };
  }
  return { ran: true };
};

/** What one Unit's write did, read from the server's answer for that Unit. */
export type WriteOutcome =
  | { status: 'written' }
  | { status: 'nothing'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Whether a write made a new Revision. A write that changes nothing makes none, and a path a
 * guard withheld is not written; both are said, so a save never looks done when it is not.
 */
export const writeOutcome = (
  response: FunctionInvocationsResponse | undefined,
): WriteOutcome => {
  if (!response)
    return { status: 'failed', reason: 'The server sent no answer for this Unit.' };
  if (response.Error?.Message || response.Success === false) {
    return { status: 'failed', reason: response.Error?.Message || 'The functions failed.' };
  }
  const withheld = (response.Conflicts ?? [])
    .map((c) => c.Path)
    .filter((p): p is string => !!p);
  if (!response.HasNewMutations) {
    return {
      status: 'nothing',
      reason:
        withheld.length > 0
          ? `A guard withheld ${withheld.join(', ')}.`
          : 'The values are already set, so nothing changed.',
    };
  }
  return { status: 'written' };
};

/**
 * A value as the YAML text "Restore released value" writes back with DataType YAML: a string that
 * reads as a number or a boolean ("8080", "true") is quoted, so it stays a string.
 */
export const releasedYaml = (value: unknown): string => stringify(value).trimEnd();
