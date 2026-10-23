// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type FieldDef, fieldById, fieldByToken, statusesFor, tokenKeys } from './fields';
import type { EntityKind, Lens, LensSpec, StatusKind, WhereError } from './types';

/**
 * The token form of lenses, as typed in the add box: `space:payments-*`,
 * `is:unreleased`, `-toolchain:OpenTofu/HCL`, `app:checkout`, `label.tier:api`.
 *
 * - A leading `-` negates (is not).
 * - A key may be shortened to a unique prefix (`tool:` is `toolchain:`), and so
 *   may a value the catalog knows (`is:unre` is `is:unreleased`).
 * - `,` lists several values (IN); `*` makes a pattern, which takes one value.
 * - `none` is the empty value of a field that can be empty (`target:none`).
 * - A bare word is looked up in the value catalog (a Space slug, a Target, a
 *   label value…); failing that it matches names containing it.
 */

export interface TokenContext {
  entity: EntityKind;
  /** Label keys in use, which can be written bare (`app:checkout`). */
  labelKeys: readonly string[];
  /** The known values of a field (by field id), for prefix expansion and bare words. */
  values: (fieldId: string) => readonly string[];
}

export type TokenResult = { ok: true; spec: LensSpec } | { ok: false; error: string };

const STATUS_KEY = 'is';
const NONE = 'none';

/** Whether a whole text is tokens rather than WHERE: every word is `key:value`. */
export function isTokenForm(text: string): boolean {
  const words = text.trim().split(/\s+/);
  // Keys may hold `.`, `/` and `-`, as label keys do (`app.kubernetes.io/name:web`).
  return (
    words[0] !== '' && words.every((w) => /^-?[A-Za-z][A-Za-z0-9_./-]*:[^\s'"()=<>]+$/.test(w))
  );
}

function allKeys(ctx: TokenContext): string[] {
  const keys = [STATUS_KEY, ...tokenKeys(ctx.entity)];
  for (const k of ctx.labelKeys) {
    keys.push(`label.${k}`);
    if (!keys.some((x) => x.toLowerCase() === k.toLowerCase())) keys.push(k);
  }
  return keys;
}

/** The full key for what was typed: an exact key, or the one key it is a prefix of. */
function expandKey(typed: string, ctx: TokenContext): string | null {
  const t = typed.toLowerCase();
  const keys = allKeys(ctx);
  const exact = keys.find((k) => k.toLowerCase() === t);
  if (exact) return exact;
  const hits = keys.filter((k) => k.toLowerCase().startsWith(t));
  return hits.length === 1 ? hits[0] : null;
}

/** A known value, by exact match (ignoring case) or as the one value it is a prefix of. */
function expandValue(typed: string, known: readonly string[]): string {
  if (typed.includes('*')) return typed;
  const t = typed.toLowerCase();
  const exact = known.find((k) => k.toLowerCase() === t);
  if (exact !== undefined) return exact;
  const hits = known.filter((k) => k.toLowerCase().startsWith(t));
  return hits.length === 1 ? hits[0] : typed;
}

function statusToken(typed: string, ctx: TokenContext, negated: boolean): TokenResult {
  if (negated)
    return { ok: false, error: 'is: cannot be negated. Choose the status you want instead.' };
  const statuses = statusesFor(ctx.entity);
  if (statuses.length === 0)
    return { ok: false, error: `${ctx.entity}s have no statuses to filter on.` };
  const status = expandValue(typed, statuses) as StatusKind;
  if (!statuses.includes(status)) {
    return {
      ok: false,
      error: `“${typed}” is not a status. Use one of: ${statuses.join(', ')}.`,
    };
  }
  return { ok: true, spec: { kind: 'status', status } };
}

function fieldToken(
  field: FieldDef,
  rawValues: string,
  ctx: TokenContext,
  negated: boolean,
): TokenResult {
  const typed = rawValues.split(',').filter((v) => v.length > 0);
  if (typed.length === 0) return { ok: false, error: `Give ${field.label} a value.` };
  if (typed.some((v) => v.toLowerCase() === NONE)) {
    if (typed.length > 1)
      return { ok: false, error: 'none cannot be listed with other values.' };
    const op = negated ? 'notEmpty' : 'empty';
    if (!field.ops.includes(op))
      return {
        ok: false,
        error: `${field.label} cannot be ${negated ? 'set' : 'empty'} as a filter.`,
      };
    return { ok: true, spec: { kind: 'field', field: field.id, op, values: [] } };
  }
  const known = ctx.values(field.id);
  const values = typed.map((v) => expandValue(v, known));
  const glob = values.some((v) => v.includes('*'));
  if (glob && values.length > 1)
    return { ok: false, error: 'A pattern with * takes one value.' };
  if (glob && /[_%]/.test(values[0])) {
    return {
      ok: false,
      error: 'A pattern with * cannot hold _ or %: filters cannot match them as plain text.',
    };
  }
  const op = negated ? 'isNot' : glob ? 'matches' : 'is';
  if (!field.ops.includes(op))
    return { ok: false, error: `${field.label} cannot be filtered that way.` };
  return { ok: true, spec: { kind: 'field', field: field.id, op, values } };
}

/** The bare-word lookup order: the fields whose values people type most. */
const BARE_ORDER = [
  'space',
  'target',
  'toolchain',
  'kind',
  'unit',
  'component',
  'upstream',
  'changeset',
  'provider',
];

function nameField(entity: EntityKind): FieldDef | undefined {
  return fieldByToken(entity, 'name') ?? fieldByToken(entity, 'space');
}

function bareWord(word: string, ctx: TokenContext, negated: boolean): TokenResult {
  const lw = word.toLowerCase();
  const statuses = statusesFor(ctx.entity);
  if (!negated && statuses.includes(lw as StatusKind))
    return { ok: true, spec: { kind: 'status', status: lw as StatusKind } };
  const candidates: FieldDef[] = [];
  for (const key of BARE_ORDER) {
    const f = fieldByToken(ctx.entity, key);
    if (f) candidates.push(f);
  }
  for (const k of ctx.labelKeys) {
    const f = fieldByToken(ctx.entity, `label.${k}`);
    if (f) candidates.push(f);
  }
  for (const f of candidates) {
    const hit = ctx.values(f.id).find((v) => v.toLowerCase() === lw);
    if (hit !== undefined)
      return {
        ok: true,
        spec: { kind: 'field', field: f.id, op: negated ? 'isNot' : 'is', values: [hit] },
      };
  }
  const space = fieldByToken(ctx.entity, 'space');
  if (word.includes('*') && space && ctx.values(space.id).some((v) => globMatches(word, v))) {
    return {
      ok: true,
      spec: {
        kind: 'field',
        field: space.id,
        op: negated ? 'isNot' : 'matches',
        values: [word],
      },
    };
  }
  const name = nameField(ctx.entity);
  if (!name) return { ok: false, error: `“${word}” is not a filter for ${ctx.entity}s.` };
  // `_` and `%` cannot sit in a pattern, so such a word is looked up as an exact name.
  if (/[_%]/.test(word)) {
    if (word.includes('*'))
      return {
        ok: false,
        error: 'A pattern with * cannot hold _ or %: filters cannot match them as plain text.',
      };
    return {
      ok: true,
      spec: { kind: 'field', field: name.id, op: negated ? 'isNot' : 'is', values: [word] },
    };
  }
  const pattern = word.includes('*') ? word : `*${word}*`;
  return {
    ok: true,
    spec: {
      kind: 'field',
      field: name.id,
      op: negated ? 'isNot' : 'matches',
      values: [pattern],
    },
  };
}

/** `*` matches any text; nothing else is special. */
export function globMatches(glob: string, value: string): boolean {
  const re = new RegExp(
    `^${glob
      .split('*')
      .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
    's',
  );
  return re.test(value);
}

/** One token (or bare word) as a lens spec. */
export function parseToken(raw: string, ctx: TokenContext): TokenResult {
  let word = raw.trim();
  if (!word) return { ok: false, error: 'Type a filter.' };
  const negated = word.startsWith('-');
  if (negated) word = word.slice(1);
  const colon = word.indexOf(':');
  if (colon <= 0) return bareWord(word, ctx, negated);
  const typedKey = word.slice(0, colon);
  const value = word.slice(colon + 1);
  // `label.<key>` names any label, known or not, so it is never shortened.
  const key = /^label\./i.test(typedKey)
    ? `label.${typedKey.slice('label.'.length)}`
    : expandKey(typedKey, ctx);
  if (!key) return { ok: false, error: `“${typedKey}:” is not a filter for ${ctx.entity}s.` };
  if (key === STATUS_KEY) return statusToken(value, ctx, negated);
  const field = fieldByToken(ctx.entity, key, ctx.labelKeys);
  if (!field)
    return { ok: false, error: `“${typedKey}:” is not a filter for ${ctx.entity}s.` };
  return fieldToken(field, value, ctx, negated);
}

/** Every token in a text, or the first one that fails, with its span. */
export function parseTokens(
  text: string,
  ctx: TokenContext,
): { ok: true; specs: LensSpec[] } | { ok: false; error: WhereError } {
  const specs: LensSpec[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const r = parseToken(m[0], ctx);
    if (!r.ok)
      return {
        ok: false,
        error: { message: r.error, start: m.index, end: m.index + m[0].length },
      };
    specs.push(r.spec);
  }
  return { ok: true, specs };
}

function tokenKeyFor(field: FieldDef, ctx: TokenContext): string | null {
  if (field.category === 'label' && field.token?.startsWith('label.')) {
    const key = field.token.slice('label.'.length);
    const clashes = [STATUS_KEY, ...tokenKeys(ctx.entity)].includes(key.toLowerCase());
    return ctx.labelKeys.includes(key) && !clashes ? key : field.token;
  }
  return field.token ?? null;
}

const TOKEN_VALUE_RE = /^[^\s,'"()=<>]+$/;

/** One lens as a token, or null when the token form cannot say it. */
export function lensToToken(lens: Lens | LensSpec, ctx: TokenContext): string | null {
  if (lens.kind === 'custom') return null;
  if (lens.kind === 'status') return `${STATUS_KEY}:${lens.status}`;
  const field = fieldById(ctx.entity, lens.field);
  if (!field) return null;
  const key = tokenKeyFor(field, ctx);
  if (!key) return null;
  switch (lens.op) {
    case 'empty':
      return `${key}:${NONE}`;
    case 'notEmpty':
      return `-${key}:${NONE}`;
    case 'is':
    case 'isNot':
    case 'matches': {
      const vs = lens.values;
      if (
        vs.length === 0 ||
        vs.some((v) => !TOKEN_VALUE_RE.test(v) || v.toLowerCase() === NONE)
      )
        return null;
      const glob = vs.some((v) => v.includes('*'));
      if (lens.op === 'matches' && (!glob || vs.length > 1)) return null;
      if (lens.op === 'is' && glob) return null;
      return `${lens.op === 'isNot' ? '-' : ''}${key}:${vs.join(',')}`;
    }
    default:
      return null;
  }
}

/** All lenses as tokens, or null when one is Custom WHERE, hidden, or has no token. */
export function lensesToTokens(lenses: readonly Lens[], ctx: TokenContext): string | null {
  const out: string[] = [];
  for (const l of lenses) {
    if (!l.enabled) return null;
    const t = lensToToken(l, ctx);
    if (t === null) return null;
    out.push(t);
  }
  return out.join(' ');
}
