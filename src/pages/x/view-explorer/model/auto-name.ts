// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { STATUS_LABEL, fieldById } from './fields';
import type { EntityKind, FieldOp, Lens } from './types';

/** Lenses in plain words: tab names for temporary views, and the changes list. */

const OP_WORDS: Record<FieldOp, string> = {
  is: 'is',
  isNot: 'is not',
  matches: 'matches',
  empty: 'is empty',
  notEmpty: 'is set',
  gt: 'is after',
  lt: 'is before',
  gte: 'is at or after',
  lte: 'is at or before',
};

const NUMBER_OP_WORDS: Partial<Record<FieldOp, string>> = {
  gt: 'is more than',
  lt: 'is less than',
  gte: 'is at least',
  lte: 'is at most',
};

/** One lens as a short sentence: "Space matches payments-*", "Status is Unreleased". */
export function describeLens(entity: EntityKind, lens: Lens): string {
  switch (lens.kind) {
    case 'status':
      return `Status is ${STATUS_LABEL[lens.status]}`;
    case 'custom':
      return `Custom WHERE: ${lens.where}`;
    case 'field': {
      const field = fieldById(entity, lens.field);
      const label = field?.label ?? lens.field;
      const op =
        (field?.type === 'number' ? NUMBER_OP_WORDS[lens.op] : undefined) ?? OP_WORDS[lens.op];
      const values =
        lens.values.length > 1 ? `any of ${lens.values.join(', ')}` : (lens.values[0] ?? '');
      return values ? `${label} ${op} ${values}` : `${label} ${op}`;
    }
  }
}

function namePart(entity: EntityKind, lens: Lens): string | null {
  switch (lens.kind) {
    case 'status':
      return STATUS_LABEL[lens.status].toLowerCase();
    case 'custom':
      return null;
    case 'field': {
      const label = fieldById(entity, lens.field)?.label ?? lens.field;
      const values = lens.values.join(', ');
      switch (lens.op) {
        case 'is':
        case 'matches':
          return values;
        case 'isNot':
          return `not ${values}`;
        case 'empty':
          return `no ${label.toLowerCase()}`;
        case 'notEmpty':
          return `has ${label.toLowerCase()}`;
        default:
          return `${label.toLowerCase()} ${OP_WORDS[lens.op].replace(/^is /, '')} ${values}`;
      }
    }
  }
}

/**
 * A name for a temporary tab from its enabled lenses, such as
 * "payments-* · unreleased". Empty when nothing names it, so the caller can say
 * "Untitled view".
 */
export function autoName(entity: EntityKind, lenses: readonly Lens[], maxParts = 3): string {
  const parts = lenses
    .filter((l) => l.enabled)
    .map((l) => namePart(entity, l))
    .filter((p): p is string => !!p);
  const shown = parts.slice(0, maxParts);
  if (parts.length > maxParts) shown.push(`+${parts.length - maxParts}`);
  return shown.join(' · ');
}
