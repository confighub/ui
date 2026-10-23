// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  type FieldDef,
  STATUS_WHERE,
  fieldById,
  fieldByNullWhere,
  fieldByWhere,
} from './fields';
import type {
  EntityKind,
  FieldLens,
  FieldOp,
  Lens,
  LensSpec,
  StatusKind,
  WhereError,
} from './types';
import { type ParsedText, collapseSpace, formatTerm, joinConjuncts } from './where/format';
import { type Term, parseWhere } from './where/parser';

/**
 * Lenses ⇄ WHERE conjuncts. A field lens is one conjunct; a status lens is a
 * fixed group of conjuncts; a Custom WHERE lens is one conjunct kept as
 * written. Reading WHERE back gives each conjunct the lens it came from, and a
 * Custom WHERE lens for any conjunct no other lens can show.
 *
 * The round-trip law: for every lens with no `lensProblem`,
 * `whereToLenses(compileWhere(lenses))` equals `lenses` apart from ids. A lens
 * with a problem is not written at all, and the UI says why.
 *
 * In a field lens `*` always means "any text": the grammar has no escapes, so
 * a literal `*`, `_` or `%` in a pattern cannot be told apart from a wildcard,
 * and such conditions stay Custom WHERE lenses.
 */

export type IdGen = () => string;

/** Why a lens is not written into WHERE: not finished yet, or not expressible. */
export interface LensProblem {
  kind: 'incomplete' | 'invalid';
  message: string;
}

/** Text that can sit inside quotes: the grammar has no escapes, and the server refuses control characters. */
export function isExpressibleValue(v: string): boolean {
  for (const ch of v) {
    const code = ch.charCodeAt(0);
    if (ch === "'" || ch === '"' || ch === '\\' || code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

const COMPARE_SQL: Partial<Record<FieldOp, string>> = {
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
};

/** A glob (`payments-*`) as a LIKE pattern. Only for globs with no `_` or `%`. */
export function globToLike(glob: string): string {
  return glob.replace(/\*/g, '%');
}

const hasGlob = (v: string) => v.includes('*');
const hasLikeWildcard = (v: string) => v.includes('_') || v.includes('%');

const invalid = (message: string): { problem: LensProblem } => ({
  problem: { kind: 'invalid', message },
});

function literal(field: FieldDef, value: string): string {
  return field.type === 'number' ? value : `'${value}'`;
}

/** The conjunct of a field lens, or why there is none. */
function compileField(
  entity: EntityKind,
  lens: FieldLens,
): { conjunct: string } | { problem: LensProblem } {
  const field = fieldById(entity, lens.field);
  if (!field?.where)
    return invalid(`${field?.label ?? lens.field} cannot be used as a filter.`);
  if (!field.ops.includes(lens.op))
    return invalid(`${field.label} cannot be filtered that way.`);
  const w = field.where;
  if (lens.op === 'empty' || lens.op === 'notEmpty') {
    if (!field.nullWhere) return invalid(`${field.label} cannot be filtered that way.`);
    return { conjunct: `${field.nullWhere} IS ${lens.op === 'notEmpty' ? 'NOT ' : ''}NULL` };
  }
  const values = lens.values.filter((v) => v.length > 0);
  if (values.length === 0)
    return { problem: { kind: 'incomplete', message: `Choose a value for ${field.label}.` } };
  if (values.some((v) => !isExpressibleValue(v))) {
    return invalid('Values cannot contain quotes, backslashes, tabs or line breaks.');
  }
  if (field.type === 'number' && values.some((v) => !/^[0-9]{1,10}$/.test(v))) {
    return invalid(`${field.label} takes a whole number.`);
  }
  if (field.type === 'time' && values.some((v) => Number.isNaN(Date.parse(v)))) {
    return invalid(`${field.label} takes a date and time, such as 2026-01-31T00:00:00Z.`);
  }
  const glob = field.type === 'string' && values.some(hasGlob);
  const patternOp = lens.op === 'matches' || (lens.op === 'isNot' && glob);
  if (patternOp) {
    if (values.length > 1) return invalid('A pattern takes one value.');
    if (hasLikeWildcard(values[0])) {
      return invalid(
        'A pattern cannot hold _ or %: ConfigHub filters cannot match them as plain text.',
      );
    }
    return {
      conjunct: `${w} ${lens.op === 'isNot' ? 'NOT LIKE' : 'LIKE'} '${globToLike(values[0])}'`,
    };
  }
  if (glob) return invalid('* makes a pattern. Use "matches", with one value.');
  switch (lens.op) {
    case 'is':
    case 'isNot': {
      const neg = lens.op === 'isNot';
      if (values.length === 1)
        return { conjunct: `${w} ${neg ? '!=' : '='} ${literal(field, values[0])}` };
      return {
        conjunct: `${w} ${neg ? 'NOT IN' : 'IN'} (${values.map((v) => literal(field, v)).join(', ')})`,
      };
    }
    default: {
      const sql = COMPARE_SQL[lens.op];
      if (!sql) return invalid(`${field.label} cannot be filtered that way.`);
      if (values.length > 1) return invalid('A comparison takes one value.');
      return { conjunct: `${w} ${sql} ${literal(field, values[0])}` };
    }
  }
}

/** Why a lens is not written into WHERE, or null when it is. */
export function lensProblem(entity: EntityKind, lens: Lens | LensSpec): LensProblem | null {
  switch (lens.kind) {
    case 'custom': {
      const text = lens.where.trim();
      if (!text) return { kind: 'incomplete', message: 'Write a condition.' };
      const parsed = parseWhere(text);
      if (!parsed.ok) return { kind: 'invalid', message: parsed.error.message };
      if (parsed.terms.length !== 1) {
        return {
          kind: 'invalid',
          message: 'A Custom WHERE filter holds one condition. Add one filter for each.',
        };
      }
      return null;
    }
    case 'status':
      return STATUS_WHERE[entity][lens.status]
        ? null
        : { kind: 'invalid', message: `${entity}s have no ${lens.status} status.` };
    case 'field': {
      const r = compileField(entity, lens as FieldLens);
      return 'problem' in r ? r.problem : null;
    }
  }
}

/**
 * The conjuncts of one lens, or null when it has a `lensProblem` (no value
 * yet, a value WHERE cannot hold, a status the entity lacks).
 */
export function lensConjuncts(entity: EntityKind, lens: Lens | LensSpec): string[] | null {
  switch (lens.kind) {
    case 'custom':
      return lensProblem(entity, lens) ? null : [lens.where.trim()];
    case 'status': {
      const group = STATUS_WHERE[entity][lens.status];
      return group ? [...group] : null;
    }
    case 'field': {
      const r = compileField(entity, lens as FieldLens);
      return 'conjunct' in r ? [r.conjunct] : null;
    }
  }
}

/** The single-line WHERE of the enabled lenses: what is saved in `Filter.Where`. */
export function compileWhere(entity: EntityKind, lenses: readonly Lens[]): string {
  return joinConjuncts(
    lenses.filter((l) => l.enabled).flatMap((l) => lensConjuncts(entity, l) ?? []),
  );
}

/** Enabled conjuncts, and one AND-joined text per disabled lens: the input of text mode and annotations. */
export function lensesToConjuncts(
  entity: EntityKind,
  lenses: readonly Lens[],
): { enabled: string[]; hidden: string[] } {
  const enabled: string[] = [];
  const hidden: string[] = [];
  for (const l of lenses) {
    const c = lensConjuncts(entity, l);
    if (!c) continue;
    if (l.enabled) enabled.push(...c);
    else hidden.push(c.join(' AND '));
  }
  return { enabled, hidden };
}

/* ------------------------------------------------------------------------ */
/* WHERE -> lenses                                                           */
/* ------------------------------------------------------------------------ */

const LIKE_OPS = new Set(['LIKE', 'NOT LIKE']);
const ORDER_OPS: Record<string, FieldOp> = { '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte' };

function likeToGlob(pattern: string): string | null {
  // `_` and a literal `*` have no glob spelling, so such a pattern stays custom.
  if (pattern.includes('_') || pattern.includes('*')) return null;
  return pattern.replace(/%/g, '*');
}

function fieldSpec(field: FieldDef, op: FieldOp, values: string[]): LensSpec | null {
  if (!field.ops.includes(op)) return null;
  return { kind: 'field', field: field.id, op, values };
}

/** The field or status lens a single term is, or null for a Custom WHERE lens. */
function termToSpec(entity: EntityKind, term: Term): LensSpec | null {
  if (term.kind === 'null') {
    const field = fieldByNullWhere(entity, term.attr);
    return field ? fieldSpec(field, term.negated ? 'notEmpty' : 'empty', []) : null;
  }
  const field = fieldByWhere(entity, term.attr);
  if (!field) return null;
  if (term.kind === 'in') {
    // In a lens `*` is a wildcard, so a literal `*` must stay Custom WHERE.
    if (term.values.some((v) => v.kind === 'string' && hasGlob(v.value))) return null;
    if (field.type === 'string' && term.values.every((v) => v.kind === 'string')) {
      return fieldSpec(
        field,
        term.negated ? 'isNot' : 'is',
        term.values.map((v) => String(v.value)),
      );
    }
    if (field.type === 'number' && term.values.every((v) => v.kind === 'int')) {
      return fieldSpec(
        field,
        term.negated ? 'isNot' : 'is',
        term.values.map((v) => String(v.value)),
      );
    }
    return null;
  }
  if (term.truth || term.length || term.operand.kind === 'attr') return null;
  const lit = term.operand;
  if (field.type === 'string' && lit.kind === 'string') {
    if ((term.op === '=' || term.op === '!=') && hasGlob(lit.value)) return null;
    if (term.op === '=') return fieldSpec(field, 'is', [lit.value]);
    if (term.op === '!=') return fieldSpec(field, 'isNot', [lit.value]);
    if (LIKE_OPS.has(term.op)) {
      const glob = likeToGlob(lit.value);
      if (glob === null) return null;
      if (term.op === 'LIKE') return fieldSpec(field, 'matches', [glob]);
      // A `NOT LIKE` lens needs a `*`; without one it would be written back as `!=`.
      return glob.includes('*') ? fieldSpec(field, 'isNot', [glob]) : null;
    }
    return null;
  }
  if (field.type === 'number' && lit.kind === 'int') {
    if (term.op === '=') return fieldSpec(field, 'is', [String(lit.value)]);
    if (term.op === '!=') return fieldSpec(field, 'isNot', [String(lit.value)]);
    const op = ORDER_OPS[term.op];
    return op ? fieldSpec(field, op, [String(lit.value)]) : null;
  }
  if (field.type === 'time' && lit.kind === 'string') {
    const op = ORDER_OPS[term.op];
    return op ? fieldSpec(field, op, [lit.value]) : null;
  }
  return null;
}

interface StatusPattern {
  status: StatusKind;
  canonical: string[];
}

const patternCache = new Map<EntityKind, StatusPattern[]>();

/** Each status of an entity as canonical conjunct text, longest group first. */
function statusPatterns(entity: EntityKind): StatusPattern[] {
  const cached = patternCache.get(entity);
  if (cached) return cached;
  const out: StatusPattern[] = [];
  for (const [status, group] of Object.entries(STATUS_WHERE[entity]) as [
    StatusKind,
    readonly string[],
  ][]) {
    const canonical = group.map((c) => {
      const p = parseWhere(c);
      return p.ok && p.terms.length === 1 ? formatTerm(p.terms[0]) : c;
    });
    out.push({ status, canonical });
  }
  out.sort((a, b) => b.canonical.length - a.canonical.length);
  patternCache.set(entity, out);
  return out;
}

export interface SourcedTerm {
  term: Term;
  /** The conjunct as written, kept for a Custom WHERE lens. */
  source: string;
}

/**
 * Read conjuncts back as lens specs. A status is recognised only when its
 * conjuncts are next to each other in its own order, which is how lenses
 * write it; anything else stays a field or Custom WHERE lens.
 */
export function termsToSpecs(entity: EntityKind, terms: readonly SourcedTerm[]): LensSpec[] {
  const canon = terms.map((t) => formatTerm(t.term));
  const specs: LensSpec[] = [];
  let i = 0;
  outer: while (i < terms.length) {
    for (const p of statusPatterns(entity)) {
      if (p.canonical.every((c, k) => canon[i + k] === c)) {
        specs.push({ kind: 'status', status: p.status });
        i += p.canonical.length;
        continue outer;
      }
    }
    specs.push(
      termToSpec(entity, terms[i].term) ?? { kind: 'custom', where: terms[i].source.trim() },
    );
    i++;
  }
  return specs;
}

function specToLens(spec: LensSpec, id: string, enabled: boolean): Lens {
  return { ...spec, id, enabled } as Lens;
}

function parseSourced(
  where: string,
): { ok: true; terms: SourcedTerm[] } | { ok: false; error: WhereError } {
  const parsed = parseWhere(where);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    terms: parsed.terms.map((term) => ({
      term,
      source: collapseSpace(where.slice(term.start, term.end)),
    })),
  };
}

/** WHERE text as lenses, all enabled (or all disabled, for hidden-lens annotations). */
export function whereToLenses(
  entity: EntityKind,
  where: string,
  idGen: IdGen,
  enabled = true,
): { ok: true; lenses: Lens[] } | { ok: false; error: WhereError } {
  const parsed = parseSourced(where);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    lenses: termsToSpecs(entity, parsed.terms).map((s) => specToLens(s, idGen(), enabled)),
  };
}

/** Text mode's parsed form (enabled conjuncts and hidden groups) as lenses. */
export function parsedTextToLenses(
  entity: EntityKind,
  text: ParsedText,
  idGen: IdGen,
): Lens[] {
  const read = (conjuncts: readonly string[], enabled: boolean): Lens[] => {
    const terms: SourcedTerm[] = [];
    for (const c of conjuncts) {
      const p = parseSourced(c);
      if (p.ok) terms.push(...p.terms);
    }
    return termsToSpecs(entity, terms).map((s) => specToLens(s, idGen(), enabled));
  };
  return [...read(text.enabled, true), ...text.hidden.flatMap((group) => read(group, false))];
}

/** The lens as canonical WHERE text, or its signature when it has none; `enabled` is left out. */
function lensContentKey(entity: EntityKind, lens: Lens): string {
  const conjuncts = lensConjuncts(entity, lens);
  if (!conjuncts) return lensSignature({ ...lens, enabled: true });
  return conjuncts
    .map((c) => {
      const p = parseWhere(c);
      return p.ok ? p.terms.map(formatTerm).join(' AND ') : c;
    })
    .join(' AND ');
}

/** FNV-1a: a short, stable hash for ids. Not for security. */
function hash36(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Give each lens an id made from what it says: its canonical WHERE text and
 * how many equal lenses come before it. The same saved View then always loads
 * with the same ids, so a draft kept in this browser or sent in a link lines
 * up lens by lens with the saved View. A hidden lens gets the id it would
 * have if shown, so showing it is one change, not a removal and an addition.
 */
export function stableLensIds(entity: EntityKind, lenses: readonly Lens[]): Lens[] {
  const seen = new Map<string, number>();
  return lenses.map((lens) => {
    const key = lensContentKey(entity, lens);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return { ...lens, id: `s-${hash36(key)}-${n}` };
  });
}

/** A lens without its id, for comparing lens lists. */
export function lensSignature(lens: Lens): string {
  switch (lens.kind) {
    case 'field':
      return JSON.stringify(['field', lens.enabled, lens.field, lens.op, lens.values]);
    case 'status':
      return JSON.stringify(['status', lens.enabled, lens.status]);
    case 'custom':
      return JSON.stringify(['custom', lens.enabled, lens.where.trim()]);
  }
}

/** Equal lens lists, ignoring ids. */
export function lensesEqual(a: readonly Lens[], b: readonly Lens[]): boolean {
  return a.length === b.length && a.every((l, i) => lensSignature(l) === lensSignature(b[i]));
}
