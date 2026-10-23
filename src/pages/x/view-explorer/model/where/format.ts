// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { WhereError } from '../types';
import type { Literal, Operand, Term } from './parser';
import { parseWhere } from './parser';

/** A literal as the grammar writes it. */
export function formatLiteral(lit: Literal): string {
  switch (lit.kind) {
    case 'string':
      return `'${lit.value}'`;
    case 'int':
      return String(lit.value);
    case 'bool':
      return lit.value ? 'true' : 'false';
  }
}

function formatOperand(op: Operand): string {
  return op.kind === 'attr' ? op.name : formatLiteral(op);
}

/** One term in the canonical form: single spaces, `true`/`false` in lower case. */
export function formatTerm(term: Term): string {
  switch (term.kind) {
    case 'null':
      return `${term.attr} IS ${term.negated ? 'NOT ' : ''}NULL`;
    case 'in':
      return `${term.attr} ${term.negated ? 'NOT IN' : 'IN'} (${term.values.map(formatLiteral).join(', ')})`;
    case 'compare': {
      const left = term.length ? `LEN(${term.attr})` : term.attr;
      const truth = term.truth ? ` ${term.truth}` : '';
      return `${left} ${term.op} ${formatOperand(term.operand)}${truth}`;
    }
  }
}

/** Conjuncts joined into the single-line form the server takes. */
export function joinConjuncts(conjuncts: readonly string[]): string {
  return conjuncts
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .join(' AND ');
}

/**
 * Text mode's multi-line form: one conjunct per line, `AND` at the start of
 * every line after the first, then one `-- hidden: <conjunct>` line for each
 * disabled lens, so hiding a filter survives a trip through the text box.
 */
export function formatWhereText(
  enabled: readonly string[],
  hidden: readonly string[],
): string {
  // Each hidden entry is one disabled lens, whose conjuncts are already joined with AND.
  const lines = enabled
    .filter((c) => c.trim())
    .map((c, i) => (i === 0 ? c.trim() : `AND ${c.trim()}`));
  for (const h of hidden) if (h.trim()) lines.push(`${HIDDEN_PREFIX}${h.trim()}`);
  return lines.join('\n');
}

export const HIDDEN_PREFIX = '-- hidden: ';

export interface HiddenLine {
  /** The conjunct text after `-- hidden:`. */
  text: string;
  /** Where `text` starts in the whole source, for error spans. */
  offset: number;
}

export interface SplitText {
  /** The source with every `--` comment blanked out, so spans still line up. */
  main: string;
  hidden: HiddenLine[];
}

/**
 * Separate text mode's comment lines from the expression. `-- hidden: …`
 * lines are disabled lenses; any other line starting with `--` is ignored. Comments are
 * replaced with spaces rather than removed, so an error span in `main` is a
 * span in the original text too.
 */
export function splitTextLines(text: string): SplitText {
  const hidden: HiddenLine[] = [];
  let main = '';
  let pos = 0;
  for (const line of text.split('\n')) {
    const idx = commentStart(line);
    if (idx === -1) {
      main += line;
    } else {
      main += line.slice(0, idx) + ' '.repeat(line.length - idx);
      const comment = line.slice(idx);
      const m = /^--[ \t]*hidden:[ \t]*/.exec(comment);
      if (m)
        hidden.push({
          text: comment.slice(m[0].length).trimEnd(),
          offset: pos + idx + m[0].length,
        });
    }
    main += '\n';
    pos += line.length + 1;
  }
  return { main: main.slice(0, -1), hidden };
}

/**
 * The index where a comment starts on a line, or -1. Only a line whose first
 * non-blank characters are `--` is a comment: `--` may appear inside a name
 * (`Labels.a--b`) or in quoted text, so it is not a comment anywhere else.
 */
function commentStart(line: string): number {
  const m = /^[ \t]*--/.exec(line);
  return m ? m[0].length - 2 : -1;
}

export interface ParsedText {
  enabled: string[];
  /** One group per `-- hidden:` line: the conjuncts of one disabled lens. */
  hidden: string[][];
}

/** Line breaks and runs of spaces become one space, except inside quoted text. */
export function collapseSpace(src: string): string {
  let out = '';
  let inString = false;
  let pendingSpace = false;
  for (const ch of src) {
    if (ch === "'") inString = !inString;
    if (!inString && /\s/.test(ch)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && out.length > 0) out += ' ';
    pendingSpace = false;
    out += ch;
  }
  return out;
}

/**
 * Parse text mode into enabled and hidden conjuncts (each as the source text
 * of one term). Errors carry spans in the original text.
 */
export function parseWhereText(
  text: string,
): { ok: true; value: ParsedText } | { ok: false; error: WhereError } {
  const { main, hidden } = splitTextLines(text);
  const parsed = parseWhere(main);
  if (!parsed.ok) return parsed;
  const enabled = parsed.terms.map((t) => collapseSpace(main.slice(t.start, t.end)));
  const hiddenOut: string[][] = [];
  for (const h of hidden) {
    const p = parseWhere(h.text);
    if (!p.ok) {
      return {
        ok: false,
        error: { ...p.error, start: p.error.start + h.offset, end: p.error.end + h.offset },
      };
    }
    if (p.terms.length)
      hiddenOut.push(p.terms.map((t) => collapseSpace(h.text.slice(t.start, t.end))));
  }
  return { ok: true, value: { enabled, hidden: hiddenOut } };
}
