// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { describeLens } from '../model/auto-name';
import { STATUS_LABEL, fieldById } from '../model/fields';
import type { EntityKind, FieldOp, Lens, LensSpec } from '../model/types';

/**
 * The short form of a lens for one-line rows and chips: `Space ≠ checkout-dev`,
 * `Space ~ payments-*`, `Status = Unreleased`. The full sentence
 * (`describeLens`) goes in the hover title, so the row can stay one line.
 */

const OP_SYMBOL: Record<FieldOp, string> = {
  is: '=',
  isNot: '≠',
  matches: '~',
  empty: '=',
  notEmpty: '≠',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
};

export interface ShortLens {
  /** The field label (`Space`, `tier`), `Status`, or `WHERE` for a Custom WHERE lens. */
  field: string;
  /** True for a label field, so the row can mark it as a label. */
  isLabel: boolean;
  /** `=`, `≠`, `~`, `>`…; empty for a Custom WHERE lens. */
  op: string;
  /** True when the lens excludes (`≠`): the row draws the operator in the exclude colour. */
  negated: boolean;
  /** The first value; the raw conjunct for a Custom WHERE lens. */
  value: string;
  /** How many more values an IN / NOT IN lens has (the `+N` chip outside the ellipsis). */
  more: number;
}

/** The parts of the short form, for a row that styles each part. */
export function shortLens(entity: EntityKind, lens: Lens | LensSpec): ShortLens {
  switch (lens.kind) {
    case 'status':
      return {
        field: 'Status',
        isLabel: false,
        op: '=',
        negated: false,
        value: STATUS_LABEL[lens.status],
        more: 0,
      };
    case 'custom':
      return {
        field: 'WHERE',
        isLabel: false,
        op: '',
        negated: false,
        value: lens.where,
        more: 0,
      };
    case 'field': {
      const field = fieldById(entity, lens.field);
      const isLabel = field?.category === 'label' || field?.category === 'space-label';
      const label = field?.label ?? lens.field;
      const negated = lens.op === 'isNot' || lens.op === 'notEmpty';
      if (lens.op === 'empty' || lens.op === 'notEmpty') {
        return {
          field: label,
          isLabel,
          op: OP_SYMBOL[lens.op],
          negated,
          value: 'none',
          more: 0,
        };
      }
      // An excluded pattern keeps `≠`: the `*` in the value already says it is a pattern.
      return {
        field: label,
        isLabel,
        op: OP_SYMBOL[lens.op],
        negated,
        value: lens.values[0] ?? '',
        more: Math.max(0, lens.values.length - 1),
      };
    }
  }
}

/** The short form as one string: `Space ≠ checkout-dev +1`. */
export function shortLensText(entity: EntityKind, lens: Lens | LensSpec): string {
  const s = shortLens(entity, lens);
  const head = s.op ? `${s.field} ${s.op} ${s.value}` : `${s.field} ${s.value}`;
  return s.more ? `${head} +${s.more}` : head;
}

/** The hover title: the full sentence, with every value. */
export function lensTitle(entity: EntityKind, lens: Lens): string {
  return describeLens(entity, lens);
}
