// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How a finding is fixed in the Gates tab. The function that found it decides, and for vet-format
 * the rule (Issue.Identifier) that it broke.
 * - set: type a new value (set-attributes).
 * - restore / undo: write the released value, or the value before the change, back (YAML).
 * - duplicate: remove the duplicate list entry (delete-path), or rename it.
 * - quote / null: write the value quoted, or as null (YAML).
 * - schema: type a value for a field the schema requires.
 * - message: no write can fix it here; the messages and "Open in Configuration".
 */
export type FixKind =
  | 'set'
  | 'restore'
  | 'undo'
  | 'duplicate'
  | 'quote'
  | 'null'
  | 'duplicate-key'
  | 'schema'
  | 'message';

const KIND_BY_FUNCTION: Record<string, FixKind> = {
  'vet-placeholders': 'set',
  'vet-values': 'set',
  'vet-images': 'set',
  'vet-cel': 'set',
  'vet-pod-security-standard': 'set',
  'vet-namespace': 'set',
  'vet-immutable': 'restore',
  'vet-disruption': 'undo',
  'vet-merge-keys': 'duplicate',
  'vet-jsonschema': 'schema',
  'vet-schemas': 'schema',
};

const FORMAT_KIND_BY_IDENTIFIER: Record<string, FixKind> = {
  'no-truthy': 'quote',
  'no-octal-values': 'quote',
  'no-empty-values': 'null',
  'no-duplicate-keys': 'duplicate-key',
};

/**
 * A path set-attributes cannot write: a vet-schemas path with a leading dot, or a vet-values path
 * with a `#uri` suffix. Such a row gets the messages and "Open in Configuration".
 */
export const isUnwritablePath = (path: string | undefined): boolean =>
  !path || path.startsWith('.') || path.includes('#');

export const fixKindOf = (
  functionName: string | undefined,
  attributeName: string | undefined,
  path: string | undefined,
  identifier: string | undefined,
  dataType?: string,
): FixKind => {
  if (isUnwritablePath(path)) return 'message';
  if (functionName === 'vet-format')
    return FORMAT_KIND_BY_IDENTIFIER[identifier ?? ''] ?? 'message';
  const kind = KIND_BY_FUNCTION[functionName ?? ''] ?? 'message';
  // A check that reports a whole block (pod security on spec.template.spec) names no attribute and
  // no type: there is no value to type. A placeholder on any path is "none" too, but has a type.
  if (kind === 'set' && attributeName === 'none' && !dataType) return 'message';
  return kind;
};

/** A kind whose fix is a value the user types. */
export const isTypedKind = (kind: FixKind): boolean => kind === 'set' || kind === 'schema';

/** A kind with any fix in the tab, typed or one click. */
export const isFixableKind = (kind: FixKind): boolean =>
  kind !== 'message' && kind !== 'duplicate-key';

export const ACTION_LABEL: Partial<Record<FixKind, string>> = {
  restore: 'Restore released value',
  undo: 'Undo this change',
  duplicate: 'Remove this entry',
  quote: 'Quote it',
  null: 'Write null',
  'duplicate-key': 'Open in Configuration',
};

/** The value a vet-format finding is about, from its message: `value "yes" is ambiguous`. */
export const formatFindingValue = (message: string | undefined): string | undefined =>
  /value "([^"]*)"/.exec(message ?? '')?.[1];

/** The value before a vet-disruption change, from its message: `changing it from X to Y`. */
export const disruptionBefore = (message: string | undefined): string | undefined =>
  /changing it from (.*) to .* cannot be reconciled/.exec(message ?? '')?.[1];
