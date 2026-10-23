// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { WhereError } from '../types';
import {
  endOfLine,
  findStringEnd,
  scanAttribute,
  scanBool,
  scanInt,
  scanLength,
  scanOperator,
  scanTruthTest,
  scanWord,
  skipSpace,
} from './lexer';

/**
 * A parser for ConfigHub's WHERE grammar: `term (AND term)*`, nothing else.
 *
 *   term    = attr op operand [IS [NOT] TRUE|FALSE]
 *           | attr IS [NOT] NULL
 *           | attr [NOT] IN (literal, ...)
 *           | LEN(path) op integer
 *   operand = 'string' | integer | true | false | attr
 *
 * There is no OR, no NOT before a term, no grouping parentheses and no
 * functions such as now(). Each of those is refused with a message that says
 * what to write instead, and the span of the text it is about. Attribute names
 * are checked only for their shape: which names an entity has is the server's
 * to say.
 */

export type CompareOp =
  | '='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | 'LIKE'
  | 'NOT LIKE'
  | 'ILIKE'
  | '~~'
  | '!~~'
  | '~'
  | '~*'
  | '!~'
  | '!~*'
  | '?';

export type Literal =
  | { kind: 'string'; value: string }
  | { kind: 'int'; value: number }
  | { kind: 'bool'; value: boolean };

export type Operand = Literal | { kind: 'attr'; name: string };

export type TruthTest = 'IS TRUE' | 'IS FALSE' | 'IS NOT TRUE' | 'IS NOT FALSE';

interface TermBase {
  /** The attribute, or the path inside `LEN(...)`. */
  attr: string;
  /** Where the term starts and ends in the source. */
  start: number;
  end: number;
}

export interface CompareTerm extends TermBase {
  kind: 'compare';
  length: boolean;
  op: CompareOp;
  operand: Operand;
  truth?: TruthTest;
}

export interface NullTerm extends TermBase {
  kind: 'null';
  negated: boolean;
}

export interface InTerm extends TermBase {
  kind: 'in';
  negated: boolean;
  values: Literal[];
}

export type Term = CompareTerm | NullTerm | InTerm;

export type ParseResult = { ok: true; terms: Term[] } | { ok: false; error: WhereError };

const OR_MESSAGE = 'ConfigHub filters accept only AND. Use two views, or IN for one field.';
const NOT_MESSAGE =
  'NOT before a term is not supported. Use !=, NOT LIKE, NOT IN or IS NOT NULL.';
const PAREN_MESSAGE =
  'Parentheses are only allowed in IN (…) and LEN(…). ConfigHub filters cannot group terms.';
const NOW_MESSAGE =
  "now() is not supported. Write a fixed time, such as '2026-01-31T00:00:00Z'.";

class WhereSyntaxError extends Error {
  constructor(
    message: string,
    readonly start: number,
    readonly end: number,
  ) {
    super(message);
  }
}

function fail(message: string, start: number, end: number): never {
  throw new WhereSyntaxError(message, start, Math.max(end, start + 1));
}

/** The span of a parenthesised group starting at `pos`, for errors about it. */
function parenSpanEnd(src: string, pos: number): number {
  let depth = 0;
  for (let i = pos; i < src.length; i++) {
    if (src[i] === '(') depth++;
    if (src[i] === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return endOfLine(src, pos);
}

function parseStringLiteral(src: string, pos: number): { value: string; end: number } {
  const close = findStringEnd(src, pos);
  if (close === -1) fail('This text has no closing quote.', pos, endOfLine(src, pos));
  const value = src.slice(pos + 1, close);
  if (/["\\]/.test(value)) {
    fail('Text in quotes cannot contain " or \\.', pos, close + 1);
  }
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      fail(
        'Text in quotes cannot contain tabs, line breaks or other control characters.',
        pos,
        close + 1,
      );
    }
  }
  // `'it''s'` is two strings to the server; say so rather than "expected AND".
  if (src[close + 1] === "'")
    fail(
      'Text in quotes cannot contain a quote.',
      pos,
      findStringEnd(src, close + 1) + 1 || close + 2,
    );
  return { value, end: close + 1 };
}

function parseLiteral(src: string, pos: number): { literal: Literal; end: number } | null {
  if (src[pos] === "'") {
    const s = parseStringLiteral(src, pos);
    return { literal: { kind: 'string', value: s.value }, end: s.end };
  }
  const int = scanInt(src, pos);
  if (int) return { literal: { kind: 'int', value: Number(int.text) }, end: int.end };
  const bool = scanBool(src, pos);
  if (bool)
    return {
      literal: { kind: 'bool', value: bool.text.toLowerCase() === 'true' },
      end: bool.end,
    };
  return null;
}

function parseInList(src: string, pos: number): { values: Literal[]; end: number } {
  if (src[pos] !== '(')
    fail("IN needs a list in parentheses, such as IN ('a', 'b').", pos, endOfLine(src, pos));
  const values: Literal[] = [];
  let i = skipSpace(src, pos + 1);
  if (src[i] === ')') fail('IN needs at least one value.', pos, i + 1);
  for (;;) {
    const lit = parseLiteral(src, i);
    if (!lit)
      fail('IN takes only quoted text, numbers or true/false.', i, parenSpanEnd(src, pos));
    values.push(lit.literal);
    i = skipSpace(src, lit.end);
    if (src[i] === ',') {
      i = skipSpace(src, i + 1);
      continue;
    }
    if (src[i] === ')') break;
    fail('Expected a comma or a closing parenthesis.', i, i + 1);
  }
  const kinds = new Set(values.map((v) => v.kind));
  if (kinds.size > 1)
    fail(
      'The values in IN (…) must all be of one kind: all text, all numbers or all true/false.',
      pos,
      i + 1,
    );
  return { values, end: i + 1 };
}

function parseOperand(src: string, pos: number): { operand: Operand; end: number } {
  if (src[pos] === undefined) fail('Expected a value after the operator.', pos, pos + 1);
  const lit = parseLiteral(src, pos);
  if (lit) return { operand: lit.literal, end: lit.end };
  if (/^now\s*\(/i.test(src.slice(pos))) fail(NOW_MESSAGE, pos, parenSpanEnd(src, pos));
  if (src[pos] === '(') fail(PAREN_MESSAGE, pos, parenSpanEnd(src, pos));
  if (src[pos] === '"')
    fail(
      "Text values go in single quotes, such as 'payments-prod'.",
      pos,
      endOfLine(src, pos),
    );
  if (src[pos] === '-') fail('Numbers cannot be negative.', pos, pos + 1);
  const attr = scanAttribute(src, pos);
  if (attr) {
    if (src[attr.end] === '(')
      fail(
        `${attr.text}() is not supported: ConfigHub filters have no functions except LEN().`,
        pos,
        parenSpanEnd(src, attr.end),
      );
    return { operand: { kind: 'attr', name: attr.text }, end: attr.end };
  }
  fail(
    'Expected a value: quoted text, a number, true/false, or a field name.',
    pos,
    endOfLine(src, pos),
  );
}

function parseTerm(src: string, pos: number): { term: Term; end: number } {
  const start = pos;
  if (src[pos] === '(') fail(PAREN_MESSAGE, pos, parenSpanEnd(src, pos));
  const word = scanWord(src, pos);
  if (word?.text === 'NOT' && /[\s(]/.test(src[word.end] ?? ''))
    fail(NOT_MESSAGE, word.start, word.end);
  if (word && /^(or|and)$/i.test(word.text)) {
    fail(
      word.text.toUpperCase() === 'OR' ? OR_MESSAGE : 'Expected a term here, not AND.',
      word.start,
      word.end,
    );
  }

  let attr: string;
  let length = false;
  let i: number;
  const len = scanLength(src, pos);
  if (len) {
    attr = len.text;
    length = true;
    i = len.end;
  } else {
    const a = scanAttribute(src, pos);
    if (!a)
      fail('Expected a field name, such as Slug or Labels.app.', pos, endOfLine(src, pos));
    if (src[a.end] === '(') {
      const fn =
        a.text.toLowerCase() === 'now'
          ? NOW_MESSAGE
          : `${a.text}() is not supported: ConfigHub filters have no functions except LEN().`;
      fail(fn, pos, parenSpanEnd(src, a.end));
    }
    attr = a.text;
    i = a.end;
  }

  i = skipSpace(src, i);
  const op = scanOperator(src, i);
  if (!op)
    fail(
      `Expected an operator after ${attr}, such as =, !=, LIKE, IN or IS NULL.`,
      i,
      endOfLine(src, i),
    );
  if (op.op === '<>') fail('Use != instead of <>.', op.start, op.end);
  i = op.end;

  if (op.op === 'IS NULL' || op.op === 'IS NOT NULL') {
    if (length) fail('LEN(…) takes a number comparison, not IS NULL.', op.start, op.end);
    return {
      term: { kind: 'null', attr, negated: op.op === 'IS NOT NULL', start, end: i },
      end: i,
    };
  }
  if (op.op === 'IN' || op.op === 'NOT IN') {
    const list = parseInList(src, skipSpace(src, i));
    return {
      term: {
        kind: 'in',
        attr,
        negated: op.op === 'NOT IN',
        values: list.values,
        start,
        end: list.end,
      },
      end: list.end,
    };
  }

  const operand = parseOperand(src, skipSpace(src, i));
  i = operand.end;
  if (length && operand.operand.kind !== 'int')
    fail('LEN(…) is compared with a number.', skipSpace(src, op.end), i);
  let truth: TruthTest | undefined;
  const afterOperand = skipSpace(src, i);
  const t = scanTruthTest(src, afterOperand);
  if (t && afterOperand > i) {
    truth = t.text as TruthTest;
    i = t.end;
  }
  return {
    term: {
      kind: 'compare',
      attr,
      length,
      op: op.op,
      operand: operand.operand,
      truth,
      start,
      end: i,
    },
    end: i,
  };
}

/**
 * Parse a WHERE expression. An empty or blank string is no terms. Line
 * breaks count as spaces, so text mode can put one term on each line.
 */
export function parseWhere(src: string): ParseResult {
  try {
    const terms: Term[] = [];
    let i = skipSpace(src, 0);
    if (i >= src.length) return { ok: true, terms };
    for (;;) {
      const { term, end } = parseTerm(src, i);
      terms.push(term);
      i = skipSpace(src, end);
      if (i >= src.length) break;
      if (i === end) fail('Expected a space before the next word.', i, i + 1);
      const word = scanWord(src, i);
      if (word?.text === 'AND') {
        const next = skipSpace(src, word.end);
        if (next >= src.length)
          fail('Expected a term after the final AND.', word.start, word.end);
        if (next === word.end) fail('Expected a space after AND.', word.start, word.end + 1);
        i = next;
        continue;
      }
      if (word && word.text.toUpperCase() === 'OR') fail(OR_MESSAGE, word.start, word.end);
      if (word && word.text.toLowerCase() === 'and')
        fail('Write AND in capitals.', word.start, word.end);
      if (src[i] === ')') fail(PAREN_MESSAGE, i, i + 1);
      fail('Expected AND between terms.', i, word ? word.end : endOfLine(src, i));
    }
    return { ok: true, terms };
  } catch (e) {
    if (e instanceof WhereSyntaxError) {
      return {
        ok: false,
        error: {
          message: e.message,
          start: e.start,
          end: Math.min(e.end, Math.max(src.length, e.start + 1)),
        },
      };
    }
    throw e;
  }
}

/** The source text of each term, in order: the conjuncts as the viewer wrote them. */
export function termSources(src: string, terms: readonly Term[]): string[] {
  return terms.map((t) => src.slice(t.start, t.end));
}
