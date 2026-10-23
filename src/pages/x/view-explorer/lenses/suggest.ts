// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  type FieldDef,
  STATUS_LABEL,
  fieldByToken,
  statusesFor,
  tokenKeys,
} from '../model/fields';
import { lensProblem } from '../model/lens-compile';
import { type TokenContext, type TokenResult, lensToToken, parseToken } from '../model/tokens';
import type { LensSpec, StatusKind } from '../model/types';

/**
 * What the add box shows while the viewer types: the words read so far (the
 * "Understood as …" read-back), and suggestions for the word being typed, each
 * with the count it would give. Pure, so it is proven without a browser; the
 * caller gives the counting function, which uses the page's match sets.
 *
 * Every word is read on its own (not with `parseTokens`, which stops at the
 * first failure), so an unknown token such as `bogus:thing` stays visible as an
 * error and is never dropped.
 */

const STATUS_KEY = 'is';
const NONE = 'none';
const DEFAULT_LIMIT = 10;
/** Value hits shown for a bare word, before the free-text suggestion. */
const BARE_VALUE_LIMIT = 7;
/**
 * How many values are counted for one word. Counting is a pass over the rows,
 * so values are first ranked by how they match the text (cheap), and only the
 * best few are counted and then ordered by what they keep.
 */
const COUNTED_VALUES = 24;

export interface WordSpan {
  raw: string;
  start: number;
  end: number;
}

export interface ComposerWords {
  /** Words followed by a space: complete, read as lenses. */
  done: WordSpan[];
  /** The word under the cursor at the end of the text; empty after a trailing space. */
  current: WordSpan;
}

/** Split the add box text into complete words and the word being typed. */
export function splitComposer(text: string): ComposerWords {
  const words: WordSpan[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null)
    words.push({ raw: m[0], start: m.index, end: m.index + m[0].length });
  const endsInSpace = text.length === 0 || /\s$/.test(text);
  if (endsInSpace || words.length === 0)
    return { done: words, current: { raw: '', start: text.length, end: text.length } };
  const current = words[words.length - 1];
  return { done: words.slice(0, -1), current };
}

export type ReadBackItem =
  | { ok: true; word: WordSpan; spec: LensSpec; token: string }
  | { ok: false; word: WordSpan; error: string };

function readWord(word: WordSpan, ctx: TokenContext): ReadBackItem {
  const r: TokenResult = parseToken(word.raw, ctx);
  if (!r.ok) return { ok: false, word, error: r.error };
  const problem = lensProblem(ctx.entity, r.spec);
  if (problem) return { ok: false, word, error: problem.message };
  return { ok: true, word, spec: r.spec, token: lensToToken(r.spec, ctx) ?? word.raw };
}

/**
 * The read-back: every complete word, plus the current word once it has a value
 * after its colon (`space:p`) — a bare `space:` or a half bare word is still
 * being typed and is not judged yet.
 */
export function readBack(text: string, ctx: TokenContext): ReadBackItem[] {
  const { done, current } = splitComposer(text);
  const items = done.map((w) => readWord(w, ctx));
  if (/:./.test(current.raw)) items.push(readWord(current, ctx));
  return items;
}

/**
 * What Enter adds: every word as a lens, or nothing when any word is not
 * understood. The errors stay in the read-back, so the viewer can fix them.
 */
export function commitText(
  text: string,
  ctx: TokenContext,
):
  | { ok: true; specs: LensSpec[] }
  | { ok: false; errors: Array<{ word: WordSpan; error: string }> } {
  const { done, current } = splitComposer(text);
  const words = current.raw ? [...done, current] : done;
  const items = words.map((w) => readWord(w, ctx));
  const errors = items.flatMap((i) => (i.ok ? [] : [{ word: i.word, error: i.error }]));
  if (errors.length) return { ok: false, errors };
  return { ok: true, specs: items.flatMap((i) => (i.ok ? [i.spec] : [])) };
}

export type Suggestion =
  /** A filter key: picking it puts `key:` in the box, to choose a value next. */
  | { kind: 'key'; key: string; field: FieldDef | null; valueCount: number }
  /**
   * A whole lens: picking it adds it. `to` is the result count with it added,
   * or null when live counts are off (a view too big to count on every key).
   */
  | { kind: 'lens'; spec: LensSpec; token: string; to: number | null; freeText: boolean }
  /** The current word cannot become a lens; says why. Not pickable. */
  | { kind: 'error'; message: string };

export interface SuggestContext extends TokenContext {
  /**
   * The result count with this lens added to the current result (and to the
   * words already typed). Absent when live counts are off: suggestions are
   * then ranked by how they match the text only, and carry no count.
   */
  count?: (spec: LensSpec) => number;
}

/** Every key the token form accepts for this entity, in display order. */
export function suggestKeys(ctx: TokenContext): string[] {
  const keys: string[] = [];
  if (statusesFor(ctx.entity).length) keys.push(STATUS_KEY);
  const fixed = tokenKeys(ctx.entity);
  keys.push(...fixed);
  for (const k of ctx.labelKeys) {
    const clashes = [STATUS_KEY, ...fixed].includes(k.toLowerCase());
    keys.push(clashes ? `label.${k}` : k);
  }
  return keys;
}

/** The full key for what was typed: exact, or the one key it is a prefix of (as `parseToken` reads it). */
function resolveKey(typed: string, ctx: TokenContext): string | null {
  if (/^label\./i.test(typed)) return `label.${typed.slice('label.'.length)}`;
  const t = typed.toLowerCase();
  const all = [
    STATUS_KEY,
    ...tokenKeys(ctx.entity),
    ...ctx.labelKeys.flatMap((k) => [k, `label.${k}`]),
  ];
  const exact = all.find((k) => k.toLowerCase() === t);
  if (exact) return exact;
  const hits = [...new Set(all.filter((k) => k.toLowerCase().startsWith(t)))];
  return hits.length === 1 ? hits[0] : null;
}

function keyField(key: string, ctx: TokenContext): FieldDef | null {
  if (key === STATUS_KEY) return null;
  return fieldByToken(ctx.entity, key, ctx.labelKeys) ?? null;
}

function keySuggestion(key: string, ctx: TokenContext): Suggestion {
  const field = keyField(key, ctx);
  const valueCount = field ? ctx.values(field.id).length : statusesFor(ctx.entity).length;
  return { kind: 'key', key, field, valueCount };
}

function lensSuggestion(spec: LensSpec, ctx: SuggestContext, freeText = false): Suggestion {
  return {
    kind: 'lens',
    spec,
    token: lensToToken(spec, ctx) ?? '',
    to: ctx.count ? ctx.count(spec) : null,
    freeText,
  };
}

/** Values first that start with the typed text, then values that contain it. */
function rankValues(known: readonly string[], typed: string): string[] {
  const t = typed.toLowerCase();
  const starts = known.filter((v) => v.toLowerCase().startsWith(t));
  const contains = t
    ? known.filter((v) => !v.toLowerCase().startsWith(t) && v.toLowerCase().includes(t))
    : [];
  return [...starts, ...contains];
}

/** Lenses that keep rows first; among them, the biggest result first (smallest when excluding). */
function byUsefulness(negated: boolean) {
  return (a: Suggestion, b: Suggestion): number => {
    // Without counts the order stays the text-match order (the sort is stable).
    if (a.kind !== 'lens' || b.kind !== 'lens' || a.to === null || b.to === null) return 0;
    const keep = Number(b.to > 0) - Number(a.to > 0);
    if (keep) return keep;
    return negated ? a.to - b.to : b.to - a.to;
  };
}

function statusSuggestions(typed: string, ctx: SuggestContext): Suggestion[] {
  const t = typed.toLowerCase();
  return statusesFor(ctx.entity)
    .filter((s) => s.startsWith(t) || STATUS_LABEL[s].toLowerCase().startsWith(t))
    .map((status: StatusKind) => lensSuggestion({ kind: 'status', status }, ctx));
}

/** Suggestions for `key:value…` (the value may be a list `a,b,` or a pattern). */
function keyedSuggestions(
  typedKey: string,
  rest: string,
  negated: boolean,
  ctx: SuggestContext,
): Suggestion[] {
  const key = resolveKey(typedKey, ctx);
  if (!key)
    return [{ kind: 'error', message: `“${typedKey}:” is not a filter for ${ctx.entity}s.` }];
  if (key === STATUS_KEY) {
    if (negated)
      return [
        {
          kind: 'error',
          message: 'is: cannot be negated. Choose the status you want instead.',
        },
      ];
    const out = statusSuggestions(rest, ctx);
    return out.length ? out : [{ kind: 'error', message: `“${rest}” is not a status.` }];
  }
  const field = keyField(key, ctx);
  if (!field)
    return [{ kind: 'error', message: `“${typedKey}:” is not a filter for ${ctx.entity}s.` }];
  const parts = rest.split(',');
  const partial = parts.pop() ?? '';
  const have = parts.filter((p) => p.length > 0);
  if (partial.includes('*')) {
    if (have.length) return [{ kind: 'error', message: 'A pattern with * takes one value.' }];
    const op = negated ? 'isNot' : 'matches';
    if (!field.ops.includes(op))
      return [{ kind: 'error', message: `${field.label} cannot be filtered that way.` }];
    const spec: LensSpec = { kind: 'field', field: field.id, op, values: [partial] };
    const problem = lensProblem(ctx.entity, spec);
    if (problem) return [{ kind: 'error', message: problem.message }];
    return [lensSuggestion(spec, ctx)];
  }
  const op = negated ? 'isNot' : 'is';
  const out: Suggestion[] = [];
  if (field.ops.includes(op)) {
    const known = ctx.values(field.id).filter((v) => !have.includes(v));
    for (const v of rankValues(known, partial).slice(0, COUNTED_VALUES)) {
      out.push(
        lensSuggestion({ kind: 'field', field: field.id, op, values: [...have, v] }, ctx),
      );
    }
  }
  const emptyOp = negated ? 'notEmpty' : 'empty';
  if (!have.length && field.ops.includes(emptyOp) && NONE.startsWith(partial.toLowerCase())) {
    out.push(lensSuggestion({ kind: 'field', field: field.id, op: emptyOp, values: [] }, ctx));
  }
  out.sort(byUsefulness(negated));
  if (out.length) return out;
  return [{ kind: 'error', message: `No ${field.label} matches “${partial}”.` }];
}

/** Suggestions for a word with no colon: keys it starts, values it names, then a free-text match. */
function bareSuggestions(word: string, negated: boolean, ctx: SuggestContext): Suggestion[] {
  const t = word.toLowerCase();
  const out: Suggestion[] = [];
  for (const k of suggestKeys(ctx)) {
    // `is:` cannot be negated, so `-i` does not offer it.
    if (k.toLowerCase().startsWith(t) && !(negated && k === STATUS_KEY))
      out.push(keySuggestion(k, ctx));
  }
  if (!negated) out.push(...statusSuggestions(word, ctx));
  const op = negated ? 'isNot' : 'is';
  // Values that start with the word come before values that only contain it, across all fields.
  const starts: LensSpec[] = [];
  const contains: LensSpec[] = [];
  for (const key of suggestKeys(ctx)) {
    const field = keyField(key, ctx);
    if (!field || !field.ops.includes(op) || field.type !== 'string') continue;
    for (const v of rankValues(ctx.values(field.id), word)) {
      const spec: LensSpec = { kind: 'field', field: field.id, op, values: [v] };
      (v.toLowerCase().startsWith(t) ? starts : contains).push(spec);
    }
  }
  const values = [...starts, ...contains]
    .slice(0, COUNTED_VALUES)
    .map((spec) => lensSuggestion(spec, ctx));
  values.sort(byUsefulness(negated));
  out.push(...values.slice(0, BARE_VALUE_LIMIT));
  // What Enter would make of the word as typed (a known value, a Space pattern, or a name match).
  const asTyped = parseToken(negated ? `-${word}` : word, ctx);
  if (asTyped.ok) {
    const token = lensToToken(asTyped.spec, ctx);
    if (!out.some((s) => s.kind === 'lens' && s.token === token)) {
      // The name-contains fallback (`*word*`) is shown as "name contains word".
      const freeText = asTyped.spec.kind === 'field' && asTyped.spec.values[0] === `*${word}*`;
      out.push(lensSuggestion(asTyped.spec, ctx, freeText));
    }
  }
  return out;
}

/**
 * Suggestions for the word being typed. An empty word lists the keys; a word
 * that cannot become a lens gives one error item, so the list never shows a
 * choice that Enter would refuse.
 */
export function suggest(
  current: string,
  ctx: SuggestContext,
  limit = DEFAULT_LIMIT,
): Suggestion[] {
  let word = current.trim();
  const negated = word.startsWith('-');
  if (negated) word = word.slice(1);
  if (!word) {
    if (negated)
      return suggestKeys(ctx)
        .filter((k) => k !== STATUS_KEY)
        .map((k) => keySuggestion(k, ctx))
        .slice(0, limit);
    return suggestKeys(ctx)
      .map((k) => keySuggestion(k, ctx))
      .slice(0, limit);
  }
  const colon = word.indexOf(':');
  const out =
    colon > 0
      ? keyedSuggestions(word.slice(0, colon), word.slice(colon + 1), negated, ctx)
      : bareSuggestions(word, negated, ctx);
  // A known value can hold text a lens cannot (a literal `*`); never offer a lens Enter would refuse.
  return out
    .filter((s) => s.kind !== 'lens' || !lensProblem(ctx.entity, s.spec))
    .slice(0, limit);
}

/**
 * The add box text after a suggestion is completed with Tab or picked: a key
 * becomes `key:` (keep typing a value), a lens becomes its token and a space.
 */
export function completeWith(text: string, s: Suggestion): string {
  if (s.kind === 'error') return text;
  const { current } = splitComposer(text);
  const head = text.slice(0, current.start);
  const negated = current.raw.startsWith('-');
  if (s.kind === 'key') return `${head}${negated ? '-' : ''}${s.key}:`;
  return s.token ? `${head}${s.token} ` : text;
}
