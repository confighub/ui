// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';

import type { ResourceViewRow } from '../adapters/resource-row';
import { type AttrValue, type EntityRow, UNKNOWN_ATTRIBUTE, resolveAttribute } from './fields';
import { lensConjuncts } from './lens-compile';
import type { EntityKind, Lens } from './types';
import { type CompareTerm, type Literal, type Term, parseWhere } from './where/parser';

/**
 * Evaluate WHERE terms on one row in the browser, with the server's meaning.
 * When the row has no value for the attribute (a label it lacks, no Target):
 *
 * - `!=` matches: the server compares as IS DISTINCT FROM.
 * - `NOT IN` matches for the entity's own columns and labels, and does not
 *   for an attribute of a related entity (`Target.Slug`, `Space.Labels.env`),
 *   which the server evaluates in memory after expanding the reference.
 * - `=`, `<`, `>`, `LIKE` and `NOT LIKE` do not match.
 *
 * LIKE is case-sensitive and matches the whole value, `%` any text and `_` one
 * character; ILIKE ignores case. These are the server's rules, which are not
 * plain SQL, so counts made here agree with the server. Terms the client does
 * not model (Data paths, LEN, `?`, regular expressions, attributes it cannot
 * read) evaluate to `undefined`, and the server answers their lens instead.
 */

/** SQL's three values: true, false, and unknown (null). */
type Tri = boolean | null;

const CLIENT_OPS = new Set([
  '=',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'LIKE',
  'NOT LIKE',
  'ILIKE',
  '~~',
  '!~~',
]);

function likeRegExp(pattern: string, ignoreCase: boolean): RegExp {
  let re = '';
  for (const ch of pattern) {
    if (ch === '%') re += '.*';
    else if (ch === '_') re += '.';
    else re += ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, ignoreCase ? 'is' : 's');
}

const likeCache = new Map<string, RegExp>();

function likeMatch(value: string, pattern: string, ignoreCase: boolean): boolean {
  const key = (ignoreCase ? 'i' : 's') + pattern;
  let re = likeCache.get(key);
  if (!re) {
    re = likeRegExp(pattern, ignoreCase);
    likeCache.set(key, re);
  }
  return re.test(value);
}

function literalValue(lit: Literal): string | number | boolean {
  return lit.value;
}

/** Order two values as the server does: numbers numerically, times by instant, text by code point. */
function compareValues(a: AttrValue, b: string | number | boolean): number | null {
  if (a === null) return null;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b ? 0 : null;
  const sa = String(a);
  const sb = String(b);
  const ta = Date.parse(sa);
  const tb = Date.parse(sb);
  if (
    /^\d{4}-\d{2}-\d{2}/.test(sa) &&
    /^\d{4}-\d{2}-\d{2}/.test(sb) &&
    !Number.isNaN(ta) &&
    !Number.isNaN(tb)
  )
    return ta - tb;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function equalValues(a: AttrValue, b: string | number | boolean): Tri {
  if (a === null) return null;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
}

function evalCompare(
  term: CompareTerm,
  left: AttrValue,
  right: AttrValue | string | number | boolean,
): Tri {
  if (term.op === '!=' && (left === null || right === null)) return left !== right;
  if (left === null || right === null) return null;
  switch (term.op) {
    case '=':
      return equalValues(left, right);
    case '!=': {
      const eq = equalValues(left, right);
      return eq === null ? null : !eq;
    }
    case '<':
    case '>':
    case '<=':
    case '>=': {
      const c = compareValues(left, right);
      if (c === null) return null;
      return term.op === '<'
        ? c < 0
        : term.op === '>'
          ? c > 0
          : term.op === '<='
            ? c <= 0
            : c >= 0;
    }
    case 'LIKE':
    case '~~':
      return likeMatch(String(left), String(right), false);
    case 'NOT LIKE':
    case '!~~':
      return !likeMatch(String(left), String(right), false);
    case 'ILIKE':
      return likeMatch(String(left), String(right), true);
    default:
      return null;
  }
}

function applyTruth(v: Tri, truth: CompareTerm['truth']): Tri {
  switch (truth) {
    case undefined:
      return v;
    case 'IS TRUE':
      return v === true;
    case 'IS FALSE':
      return v === false;
    case 'IS NOT TRUE':
      return v !== true;
    case 'IS NOT FALSE':
      return v !== false;
  }
}

/** True or false when the client can answer the term on this row; `undefined` when it cannot. */
export function evalTerm(entity: EntityKind, term: Term, row: EntityRow): boolean | undefined {
  const left = resolveAttribute(entity, term.attr, row);
  if (left === UNKNOWN_ATTRIBUTE) return undefined;
  switch (term.kind) {
    case 'null':
      return term.negated ? left !== null : left === null;
    case 'in': {
      if (left === null) return term.negated && !isRelatedAttribute(entity, term.attr);
      const hit = term.values.some((v) => equalValues(left, literalValue(v)) === true);
      return term.negated ? !hit : hit;
    }
    case 'compare': {
      if (term.length || !CLIENT_OPS.has(term.op)) return undefined;
      let right: AttrValue | string | number | boolean;
      if (term.operand.kind === 'attr') {
        const r = resolveAttribute(entity, term.operand.name, row);
        if (r === UNKNOWN_ATTRIBUTE) return undefined;
        right = r;
      } else {
        right = literalValue(term.operand);
      }
      return applyTruth(evalCompare(term, left, right), term.truth) === true;
    }
  }
}

/** Map attributes of the entity itself: `Labels.app` reads a key, not another entity. */
const OWN_MAP_PREFIXES: Record<EntityKind, readonly string[]> = {
  Unit: ['Labels.', 'Annotations.', 'Values.'],
  Space: ['Labels.', 'Annotations.'],
  Resource: [],
};

/** An attribute reached through a reference (`Target.Slug`), which the server evaluates in memory. */
export function isRelatedAttribute(entity: EntityKind, attr: string): boolean {
  return attr.includes('.') && !OWN_MAP_PREFIXES[entity].some((p) => attr.startsWith(p));
}

/* ------------------------------------------------------------------------ */
/* Which terms the client can answer                                         */
/* ------------------------------------------------------------------------ */

const PROBE_ROWS: Record<EntityKind, EntityRow> = {
  Unit: { Unit: { Slug: '', ToolchainType: '' } } satisfies ExtendedUnitRead,
  Space: { Space: { Slug: '' } } satisfies ExtendedSpaceRead,
  Resource: {
    id: '',
    ResourceID: '',
    ResourceType: '',
    ResourceName: '',
    UnitID: '',
    UnitSlug: '',
    UnitLabels: {},
    SpaceID: '',
    SpaceSlug: '',
    SpaceLabels: {},
  } satisfies ResourceViewRow,
};

function clientKnows(entity: EntityKind, attr: string): boolean {
  return resolveAttribute(entity, attr, PROBE_ROWS[entity]) !== UNKNOWN_ATTRIBUTE;
}

/** Whether the client can evaluate a term on any row of the entity. */
export function isClientTerm(entity: EntityKind, term: Term): boolean {
  if (!clientKnows(entity, term.attr)) return false;
  if (term.kind !== 'compare') return true;
  if (term.length || !CLIENT_OPS.has(term.op)) return false;
  return term.operand.kind !== 'attr' || clientKnows(entity, term.operand.name);
}

export type RowPredicate = (row: EntityRow) => boolean;

/**
 * A predicate for a field or status lens, or null when the server must answer
 * it (every Custom WHERE lens, and any lens with a term the client cannot
 * evaluate). The lens's `enabled` flag is not consulted: counts need the
 * match set of a hidden lens too.
 */
export function lensPredicate(entity: EntityKind, lens: Lens): RowPredicate | null {
  if (lens.kind === 'custom') return null;
  const conjuncts = lensConjuncts(entity, lens);
  if (!conjuncts) return () => true;
  const terms: Term[] = [];
  for (const c of conjuncts) {
    const parsed = parseWhere(c);
    if (!parsed.ok) return null;
    terms.push(...parsed.terms);
  }
  if (!terms.every((t) => isClientTerm(entity, t))) return null;
  return (row) => terms.every((t) => evalTerm(entity, t, row) === true);
}

/** Evaluate a whole WHERE on a row; `undefined` when some term needs the server. */
export function evalWhere(
  entity: EntityKind,
  where: string,
  row: EntityRow,
): boolean | undefined {
  const parsed = parseWhere(where);
  if (!parsed.ok) return undefined;
  let result = true;
  for (const t of parsed.terms) {
    const v = evalTerm(entity, t, row);
    if (v === undefined) return undefined;
    result = result && v;
  }
  return result;
}
