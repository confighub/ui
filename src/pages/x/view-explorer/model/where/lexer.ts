// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Scanning helpers for the WHERE grammar. Each `scan*` function looks at the
 * source from a position and returns the matched text and where it ends, or
 * null. The patterns follow the server's own (the entityfilter and the
 * function query parsers in the ConfigHub SDK), so a string this module accepts is one
 * the server reads the same way, apart from attribute names, which only the
 * server can check.
 */

export interface Scanned {
  text: string;
  start: number;
  end: number;
}

/** Spaces, tabs and line breaks. Text mode is multi-line; the server reads one line. */
export function skipSpace(src: string, pos: number): number {
  let i = pos;
  while (
    i < src.length &&
    (src[i] === ' ' || src[i] === '\t' || src[i] === '\n' || src[i] === '\r')
  )
    i++;
  return i;
}

function scanRe(src: string, pos: number, re: RegExp): Scanned | null {
  re.lastIndex = pos;
  const m = re.exec(src);
  if (!m || m.index !== pos) return null;
  return { text: m[0], start: pos, end: pos + m[0].length };
}

// A data path after `Data.`: the server's jsonPathRegexpString.
const JSON_KEY = '(?:[A-Za-z_$](?:[A-Za-z0-9/_$\\-]|~1){0,127})';
const JSON_INDEX = '(?:[0-9]{1,10})';
const JSON_ASSOC = `(?:\\?${JSON_KEY}=[^.#'"\\\\ \\t\\n]{1,255})`;
const JSON_SEGMENT = `(?:${JSON_KEY}|${JSON_INDEX}|\\*|${JSON_ASSOC})`;
const JSON_PLAIN = `(?:${JSON_KEY}|${JSON_INDEX})`;
const DATA_PATH_RE = new RegExp(
  `Data\\.${JSON_SEGMENT}(?:\\.${JSON_SEGMENT})*(?:\\.\\|${JSON_PLAIN}(?:\\.${JSON_PLAIN})*)?`,
  'y',
);

// `Attr`, `Prefix.Attr`, `Prefix.*.Attr`, then map keys (`Labels.app.kubernetes.io/name`).
const ATTRIBUTE_RE =
  /[A-Za-z][A-Za-z0-9]*(?:\.(?:\*|[A-Za-z0-9](?:[-_./A-Za-z0-9~]*[A-Za-z0-9])?))*/y;

/** An attribute name, a `Data.` path, or null. */
export function scanAttribute(src: string, pos: number): Scanned | null {
  if (src.startsWith('Data.', pos)) {
    const data = scanRe(src, pos, DATA_PATH_RE);
    if (data) return data;
  }
  return scanRe(src, pos, ATTRIBUTE_RE);
}

/** `LEN(path)`; `text` is the path inside the parentheses. */
export function scanLength(src: string, pos: number): Scanned | null {
  const m = scanRe(src, pos, /LEN\(([A-Za-z][A-Za-z.]{0,60})\)/y);
  if (!m) return null;
  return { text: m.text.slice(4, -1), start: m.start, end: m.end };
}

/**
 * Operators, longest first so `IS NOT NULL` is not read as `IS`, and `!~~` not as `!~`.
 * `<>` is listed only so the parser can say to use `!=`.
 */
export const OPERATORS = [
  'IS NOT NULL',
  'IS NULL',
  'NOT LIKE',
  'NOT IN',
  'ILIKE',
  'LIKE',
  'IN',
  '!~~',
  '!~*',
  '<>',
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
  '?',
] as const;

export type ScannedOperator = (typeof OPERATORS)[number];

const WORD_OPERATORS = new Set<string>([
  'IS NOT NULL',
  'IS NULL',
  'NOT LIKE',
  'NOT IN',
  'ILIKE',
  'LIKE',
  'IN',
]);

export function scanOperator(
  src: string,
  pos: number,
): (Scanned & { op: ScannedOperator }) | null {
  for (const op of OPERATORS) {
    if (!src.startsWith(op, pos)) continue;
    const end = pos + op.length;
    // A word operator must end at a word boundary: `INDEX` is not `IN`.
    if (WORD_OPERATORS.has(op) && end < src.length && /[A-Za-z0-9_]/.test(src[end])) continue;
    return { text: op, op, start: pos, end };
  }
  return null;
}

/** `IS [NOT] TRUE|FALSE` after an operand. */
export function scanTruthTest(src: string, pos: number): Scanned | null {
  return scanRe(src, pos, /IS NOT FALSE|IS NOT TRUE|IS FALSE|IS TRUE/y);
}

/** A whole word at `pos` (letters only), for keyword checks such as AND, OR, NOT. */
export function scanWord(src: string, pos: number): Scanned | null {
  return scanRe(src, pos, /[A-Za-z]+/y);
}

export const INT_RE = /[0-9]{1,10}(?![0-9A-Za-z_])/y;
export const BOOL_RE = /(?:true|TRUE|false|FALSE)(?![0-9A-Za-z_])/y;

export function scanInt(src: string, pos: number): Scanned | null {
  return scanRe(src, pos, INT_RE);
}

export function scanBool(src: string, pos: number): Scanned | null {
  return scanRe(src, pos, BOOL_RE);
}

/** The index of the closing quote of a string starting at `pos`, or -1. */
export function findStringEnd(src: string, pos: number): number {
  return src.indexOf("'", pos + 1);
}

/** The end of the line containing `pos`, for spans that run to the end of the text. */
export function endOfLine(src: string, pos: number): number {
  const nl = src.indexOf('\n', pos);
  return nl === -1 ? src.length : nl;
}
