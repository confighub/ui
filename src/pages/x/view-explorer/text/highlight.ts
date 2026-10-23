// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Syntax colours for text mode. The scanner is tolerant on purpose: it runs on
 * every keystroke, on text that is often half-typed or wrong, so it never
 * fails and always covers the whole text with spans. What is wrong is the
 * parser's to say; the editor underlines that separately.
 */

export type HighlightKind =
  | 'keyword'
  | 'field'
  | 'string'
  | 'number'
  | 'operator'
  | 'punct'
  | 'comment'
  | 'text';

export interface HighlightSpan {
  kind: HighlightKind;
  start: number;
  end: number;
}

const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'NULL',
  'LIKE',
  'ILIKE',
  'TRUE',
  'FALSE',
  'LEN',
]);

const WORD_RE = /[A-Za-z][A-Za-z0-9_.\-/~*$]*/y;
const NUMBER_RE = /[0-9]+(?![A-Za-z_])/y;
const OPERATOR_RE = /[=!<>~?*]+/y;

function match(re: RegExp, src: string, pos: number): number {
  re.lastIndex = pos;
  const m = re.exec(src);
  return m && m.index === pos ? pos + m[0].length : -1;
}

/** Spans for WHERE text, comment lines included. Adjacent spans of one kind are merged. */
export function highlightWhere(text: string): HighlightSpan[] {
  const out: HighlightSpan[] = [];
  const push = (kind: HighlightKind, start: number, end: number) => {
    if (end <= start) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind && last.end === start) last.end = end;
    else out.push({ kind, start, end });
  };
  let i = 0;
  let lineStart = true;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') {
      push('text', i, i + 1);
      i++;
      lineStart = true;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      push('text', i, i + 1);
      i++;
      continue;
    }
    if (lineStart && text.startsWith('--', i)) {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      push('comment', i, end);
      i = end;
      continue;
    }
    lineStart = false;
    if (ch === "'") {
      const close = text.indexOf("'", i + 1);
      const nl = text.indexOf('\n', i + 1);
      let end: number;
      if (close !== -1 && (nl === -1 || close < nl)) end = close + 1;
      else end = nl === -1 ? text.length : nl;
      push('string', i, end);
      i = end;
      continue;
    }
    const num = match(NUMBER_RE, text, i);
    if (num !== -1) {
      push('number', i, num);
      i = num;
      continue;
    }
    const word = match(WORD_RE, text, i);
    if (word !== -1) {
      const w = text.slice(i, word);
      push(KEYWORDS.has(w.toUpperCase()) && !w.includes('.') ? 'keyword' : 'field', i, word);
      i = word;
      continue;
    }
    const op = match(OPERATOR_RE, text, i);
    if (op !== -1) {
      push('operator', i, op);
      i = op;
      continue;
    }
    push(ch === '(' || ch === ')' || ch === ',' ? 'punct' : 'text', i, i + 1);
    i++;
  }
  return out;
}

/** Spans for the token form: `-` and `:` as operators, keys as fields, values as strings. */
export function highlightTokens(text: string): HighlightSpan[] {
  const out: HighlightSpan[] = [];
  const re = /\S+/g;
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > pos) out.push({ kind: 'text', start: pos, end: m.index });
    const word = m[0];
    let i = m.index;
    if (word.startsWith('--')) {
      out.push({ kind: 'comment', start: i, end: i + word.length });
      pos = i + word.length;
      continue;
    }
    if (word.startsWith('-')) {
      out.push({ kind: 'operator', start: i, end: i + 1 });
      i++;
    }
    const colon = text.indexOf(':', i);
    const end = m.index + word.length;
    if (colon !== -1 && colon < end) {
      if (colon > i) out.push({ kind: 'field', start: i, end: colon });
      out.push({ kind: 'operator', start: colon, end: colon + 1 });
      if (end > colon + 1) out.push({ kind: 'string', start: colon + 1, end });
    } else if (end > i) {
      out.push({ kind: 'string', start: i, end });
    }
    pos = end;
  }
  if (pos < text.length) out.push({ kind: 'text', start: pos, end: text.length });
  return out;
}
