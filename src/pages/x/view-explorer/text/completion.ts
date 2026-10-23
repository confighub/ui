// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type FieldDef, fieldByWhere, fieldCatalog } from '../model/fields';
import type { EntityKind } from '../model/types';
import { splitTextLines } from '../model/where/format';
import { parseWhere } from '../model/where/parser';
import { type AttributeKnowledge, unknownAttributeMessage } from './analyze';

/**
 * Autocomplete for text mode's WHERE text: what the caret is in the middle of
 * (a field name, an operator, a value, or the gap before the next AND), what
 * to offer there, and how to insert a choice. Tolerant of half-typed text.
 */

export type CompletionContext =
  | { kind: 'none' }
  | { kind: 'field'; prefix: string; from: number; to: number }
  | { kind: 'operator'; attr: string; prefix: string; from: number; to: number }
  | {
      kind: 'value';
      attr: string;
      op: string;
      prefix: string;
      from: number;
      to: number;
      /** The value being typed opened a quote, which is part of [from, to). */
      quoted: boolean;
      /** Inside `IN (…)`: after a value, offer the next one. */
      inList: boolean;
    }
  | { kind: 'conjunction'; from: number; to: number };

/** Operators as the grammar spells them, longest first, so `IS NOT NULL` wins over `IS NULL`. */
const OPERATORS = [
  'IS NOT NULL',
  'IS NULL',
  'NOT LIKE',
  'NOT IN',
  'ILIKE',
  'LIKE',
  'IN',
  '!~~',
  '!~*',
  '<=',
  '>=',
  '!=',
  '~~',
  '~*',
  '!~',
  '<',
  '>',
  '=',
  '~',
];

const ATTR = '[A-Za-z][A-Za-z0-9_.\\-/~*$]*';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OP_ALT = OPERATORS.map(escapeRe).join('|');

const FIELD_RE = new RegExp(`^\\s*(${ATTR})?$`);
const OPERATOR_RE = new RegExp(`^\\s*(${ATTR})\\s+([A-Za-z]+(?: [A-Za-z]*)?|[=!<>~]*)$`);
const VALUE_RE = new RegExp(`^\\s*(${ATTR})\\s+(${OP_ALT})\\s+(.*)$`, 's');

/** Where the conjunct the caret is in starts: just after the last top-level AND. */
function conjunctStart(src: string): number {
  let inString = false;
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'") inString = !inString;
    if (inString) continue;
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (
      depth === 0 &&
      src.startsWith('AND', i) &&
      /\s/.test(src[i - 1] ?? ' ') &&
      /\s/.test(src[i + 3] ?? '')
    ) {
      start = i + 3;
    }
  }
  return start;
}

/** What the caret is in the middle of. Comment lines and the token form have no completion. */
export function completionContext(text: string, caret: number): CompletionContext {
  const { main } = splitTextLines(text);
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
  if (/^[ \t]*--/.test(text.slice(lineStart, caret))) return { kind: 'none' };
  const before = main.slice(0, caret);
  const segStart = conjunctStart(before);
  const seg = before.slice(segStart);

  const asTerm = parseWhere(seg);
  if (asTerm.ok && asTerm.terms.length === 1) {
    return /\s$/.test(seg) ? { kind: 'conjunction', from: caret, to: caret } : { kind: 'none' };
  }

  const value = VALUE_RE.exec(seg);
  if (value) {
    const [, attr, op, rest] = value;
    if (op === 'IS NULL' || op === 'IS NOT NULL') {
      return /\s$/.test(seg) ? { kind: 'conjunction', from: caret, to: caret } : { kind: 'none' };
    }
    const inList = op === 'IN' || op === 'NOT IN';
    let typed = rest;
    if (inList) {
      if (!typed.startsWith('(')) return { kind: 'none' };
      const lastSep = Math.max(typed.lastIndexOf('('), typed.lastIndexOf(','));
      typed = typed.slice(lastSep + 1).replace(/^\s+/, '');
    }
    // A finished value with a space after it: the term is complete.
    if (/^'[^']*'\s*$/.test(typed) || /^[0-9]+\s+$/.test(typed)) return { kind: 'none' };
    const quoted = typed.startsWith("'");
    const prefix = quoted ? typed.slice(1) : typed;
    if (prefix.includes("'")) return { kind: 'none' };
    return {
      kind: 'value',
      attr,
      op,
      prefix,
      from: caret - typed.length,
      to: caret,
      quoted,
      inList,
    };
  }

  const opMatch = OPERATOR_RE.exec(seg);
  if (opMatch) {
    const [, attr, prefix] = opMatch;
    return { kind: 'operator', attr, prefix, from: caret - prefix.length, to: caret };
  }

  const field = FIELD_RE.exec(seg);
  if (field) {
    const prefix = field[1] ?? '';
    return { kind: 'field', prefix, from: caret - prefix.length, to: caret };
  }
  return { kind: 'none' };
}

export interface CompletionItem {
  kind: 'field' | 'operator' | 'value' | 'conjunction';
  /** What the list shows. */
  label: string;
  /** What replaces [from, to) when chosen. */
  insert: string;
  /** A short hint: a field's type, an operator's meaning. */
  hint?: string;
  /** Rows with this value, for value suggestions. */
  count?: number;
}

export interface CompletionEnv {
  entity: EntityKind;
  labelKeys: readonly string[];
  /** Attribute names besides fields.ts that may be suggested (the adapter's filter fields). */
  extraAttributes: readonly string[];
  knowledge: (attr: string) => AttributeKnowledge;
  /**
   * Known values of a field, most common first with their row counts; or, when
   * `countsOff`, the known values with no count, in text order.
   */
  values: (fieldId: string) => ReadonlyArray<{ value: string; count?: number }>;
  /** Live counts are off (a very large view): values come without counts. */
  countsOff?: boolean;
}

export interface CompletionResult {
  items: CompletionItem[];
  /** Shown instead of suggestions, e.g. after an unknown field. */
  error?: string;
  /** The values are listed without counts because live counts are off. */
  countsOff?: boolean;
}

const TYPE_HINT: Record<FieldDef['type'], string> = {
  string: 'text',
  number: 'number',
  time: 'time',
  status: 'status',
  bool: 'true/false',
};

function operatorsFor(field: FieldDef | undefined, knowledge: AttributeKnowledge): string[] {
  if (!field) {
    return knowledge === 'attribute'
      ? ['=', '!=', 'IN', 'NOT IN', 'LIKE', 'NOT LIKE', '>', '<', '>=', '<=', 'IS NULL', 'IS NOT NULL']
      : [];
  }
  const nullable = field.nullWhere ? ['IS NULL', 'IS NOT NULL'] : [];
  switch (field.type) {
    case 'number':
      return ['=', '!=', '>', '<', '>=', '<=', 'IN', 'NOT IN', ...nullable];
    case 'time':
      return ['>', '<', '>=', '<='];
    case 'bool':
      return ['=', '!='];
    default:
      return ['=', '!=', 'IN', 'NOT IN', 'LIKE', 'NOT LIKE', ...nullable];
  }
}

const OPERATOR_HINT: Record<string, string> = {
  '=': 'is',
  '!=': 'is not',
  IN: 'is one of',
  'NOT IN': 'is none of',
  LIKE: "matches, % is any text",
  'NOT LIKE': 'does not match',
  'IS NULL': 'is empty',
  'IS NOT NULL': 'is not empty',
  '>': 'more than',
  '<': 'less than',
  '>=': 'at least',
  '<=': 'at most',
};

const startsWithIgnoringCase = (s: string, prefix: string) =>
  s.toLowerCase().startsWith(prefix.toLowerCase());

/** The suggestions for a context. After an unknown field there are none, only the error. */
export function suggest(ctx: CompletionContext, env: CompletionEnv, limit = 12): CompletionResult {
  switch (ctx.kind) {
    case 'none':
      return { items: [] };
    case 'conjunction':
      return { items: [{ kind: 'conjunction', label: 'AND', insert: 'AND ', hint: 'and also' }] };
    case 'field': {
      const items: CompletionItem[] = [];
      const seen = new Set<string>();
      for (const f of fieldCatalog(env.entity, env.labelKeys)) {
        if (!f.where || seen.has(f.where) || !startsWithIgnoringCase(f.where, ctx.prefix)) continue;
        seen.add(f.where);
        items.push({ kind: 'field', label: f.where, insert: `${f.where} `, hint: TYPE_HINT[f.type] });
      }
      for (const a of env.extraAttributes) {
        if (seen.has(a) || !startsWithIgnoringCase(a, ctx.prefix)) continue;
        seen.add(a);
        items.push({ kind: 'field', label: a, insert: `${a} ` });
      }
      return { items: items.slice(0, limit) };
    }
    case 'operator': {
      const knowledge = env.knowledge(ctx.attr);
      if (knowledge === 'unknown') return { items: [], error: unknownAttributeMessage(env.entity, ctx.attr) };
      const field = fieldByWhere(env.entity, ctx.attr);
      const items = operatorsFor(field, knowledge)
        .filter((op) => startsWithIgnoringCase(op, ctx.prefix))
        .map<CompletionItem>((op) => ({
          kind: 'operator',
          label: op,
          insert: op === 'IN' || op === 'NOT IN' ? `${op} (` : `${op} `,
          hint: OPERATOR_HINT[op],
        }));
      return { items };
    }
    case 'value': {
      const knowledge = env.knowledge(ctx.attr);
      if (knowledge === 'unknown') return { items: [], error: unknownAttributeMessage(env.entity, ctx.attr) };
      const field = fieldByWhere(env.entity, ctx.attr);
      if (!field || knowledge !== 'field') return { items: [] };
      const like = ctx.op === 'LIKE' || ctx.op === 'NOT LIKE';
      const quote = field.type === 'number' ? '' : "'";
      const after = ctx.inList ? '' : ' ';
      const items = env
        .values(field.id)
        .filter((v) => startsWithIgnoringCase(v.value, ctx.prefix))
        .slice(0, limit)
        .map<CompletionItem>((v) => ({
          kind: 'value',
          label: v.value,
          insert: `${quote}${like ? `${v.value}%` : v.value}${quote}${after}`,
          count: env.countsOff ? undefined : v.count,
        }));
      return env.countsOff ? { items, countsOff: true } : { items };
    }
  }
}

/** The replacement choosing an item makes: [from, to) becomes `insert`, and where the caret ends. */
export function completionEdit(
  text: string,
  ctx: Exclude<CompletionContext, { kind: 'none' }>,
  item: CompletionItem,
): { from: number; to: number; insert: string; caret: number } {
  // `AND` goes on a line of its own, as text mode writes it.
  if (item.kind === 'conjunction' && ctx.from > 0 && text[ctx.from - 1] !== '\n') {
    const from = text.slice(0, ctx.from).replace(/[ \t]+$/, '').length;
    const insert = `\n${item.insert}`;
    return { from, to: ctx.to, insert, caret: from + insert.length };
  }
  return { from: ctx.from, to: ctx.to, insert: item.insert, caret: ctx.from + item.insert.length };
}

/** The text and caret after choosing an item. */
export function applyCompletion(
  text: string,
  ctx: Exclude<CompletionContext, { kind: 'none' }>,
  item: CompletionItem,
): { text: string; caret: number } {
  const e = completionEdit(text, ctx, item);
  return { text: text.slice(0, e.from) + e.insert + text.slice(e.to), caret: e.caret };
}
