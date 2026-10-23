// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  LABEL_PREFIX,
  SPACE_LABEL_PREFIX,
  STATUS_WHERE,
  UNIT_LABEL_PREFIX,
  fieldByNullWhere,
  fieldByWhere,
} from '../model/fields';
import { type IdGen, type SourcedTerm, lensConjuncts, lensProblem, termsToSpecs } from '../model/lens-compile';
import { type TokenContext, isTokenForm, parseTokens } from '../model/tokens';
import type { EntityKind, Lens, LensSpec, WhereError } from '../model/types';
import { HIDDEN_PREFIX, collapseSpace, joinConjuncts, parseWhereText, splitTextLines } from '../model/where/format';
import { type Term, parseWhere } from '../model/where/parser';

/**
 * Text mode's view of its own text: which form it is in (WHERE or tokens),
 * whether it parses, what lenses it stands for, and which attribute names
 * the client cannot vouch for. The server has the last word on attribute
 * names (`useServerValidate`); this module only decides what to ask it.
 */

export type TextForm = 'where' | 'tokens';

/** A WHERE error with the 1-based line and column of its start, for "· line 2". */
export interface TextError extends WhereError {
  line: number;
  column: number;
}

/**
 * How well the client knows a WHERE attribute:
 * - `field`: a field of fields.ts, with a value catalog (value suggestions are offered);
 * - `attribute`: a name the client knows but has no values for (`UpstreamUnit.HeadRevisionNum`);
 * - `unknown`: neither. Only the server can say whether it exists (it has names the client
 *   does not list, such as `UnitID` or `Annotations.*`), so text mode sends it once the text
 *   parses, says "checking with the server" until the answer, and offers no values for it.
 */
export type AttributeKnowledge = 'field' | 'attribute' | 'unknown';

/** The 1-based line and column of an offset. */
export function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, offset));
  const line = before.split('\n').length;
  const column = offset - (before.lastIndexOf('\n') + 1) + 1;
  return { line, column };
}

function withLine(text: string, error: WhereError): TextError {
  return { ...error, ...lineAndColumn(text, error.start) };
}

/** The related entities an attribute can reach through, per entity (`Target.DisplayName`). */
const RELATIONS: Record<EntityKind, readonly string[]> = {
  Unit: ['Space.', 'Target.', 'UpstreamUnit.', 'UpstreamSpace.', 'ChangeSet.', 'HeadRevision.', 'LastReleasedRevision.', 'BridgeWorker.', 'Organization.'],
  Space: ['Component.', 'Organization.'],
  Resource: ['Unit.', 'Space.', 'Target.', 'Organization.'],
};

const LABEL_PREFIXES: Record<EntityKind, readonly string[]> = {
  Unit: [LABEL_PREFIX, SPACE_LABEL_PREFIX],
  Space: [LABEL_PREFIX],
  Resource: [UNIT_LABEL_PREFIX, SPACE_LABEL_PREFIX],
};

/** Every attribute the status forms of an entity use, read from STATUS_WHERE. */
function statusAttributes(entity: EntityKind): Set<string> {
  const out = new Set<string>();
  for (const group of Object.values(STATUS_WHERE[entity])) {
    for (const c of group ?? []) {
      const p = parseWhere(c);
      if (!p.ok) continue;
      for (const t of p.terms) {
        out.add(t.attr);
        if (t.kind === 'compare' && t.operand.kind === 'attr') out.add(t.operand.name);
      }
    }
  }
  return out;
}

/**
 * An attribute checker for one entity. `extraNames` is the list the WHERE
 * completions offer (the adapter's filter fields), so a name the old editor
 * suggested is never called unknown.
 */
export function attributeKnowledge(
  entity: EntityKind,
  extraNames: readonly string[] = [],
): (attr: string) => AttributeKnowledge {
  const extra = new Set(extraNames);
  const status = statusAttributes(entity);
  return (attr: string) => {
    if (fieldByWhere(entity, attr)) return 'field';
    if (fieldByNullWhere(entity, attr) || extra.has(attr) || status.has(attr)) return 'attribute';
    if (LABEL_PREFIXES[entity].some((p) => attr.startsWith(p) && attr.length > p.length))
      return 'attribute';
    if (entity === 'Unit' && attr.startsWith('Data.')) return 'attribute';
    if (RELATIONS[entity].some((p) => attr.startsWith(p) && attr.length > p.length)) return 'attribute';
    return 'unknown';
  };
}

export interface UnknownAttribute {
  attr: string;
  start: number;
  end: number;
}

/** The attributes of terms parsed from `src`, placed at `offset` in the whole text. */
function termAttributes(src: string, terms: readonly Term[], offset: number): UnknownAttribute[] {
  const out: UnknownAttribute[] = [];
  for (const t of terms) {
    const at = t.kind === 'compare' && t.length ? t.start + 'LEN('.length : t.start;
    out.push({ attr: t.attr, start: offset + at, end: offset + at + t.attr.length });
    if (t.kind === 'compare' && t.operand.kind === 'attr') {
      const name = t.operand.name;
      const pos = src.lastIndexOf(name, t.end);
      if (pos >= t.start) out.push({ attr: name, start: offset + pos, end: offset + pos + name.length });
    }
  }
  return out;
}

export interface AnalyzeContext {
  entity: EntityKind;
  tokens: TokenContext;
  knowledge: (attr: string) => AttributeKnowledge;
}

export type TextAnalysis =
  | { status: 'empty'; form: TextForm }
  | {
      status: 'ok';
      form: TextForm;
      /** Enabled conjuncts, as written (one per term). */
      enabled: string[];
      /** One AND-joined group per `-- hidden:` line. */
      hidden: string[][];
      /**
       * Every conjunct in the order of the text: runs of enabled ones, and one group per
       * `-- hidden:` line, so lenses keep their order when a hidden one sits between others.
       */
      groups: Array<{ enabled: boolean; conjuncts: string[] }>;
      /** Token form only: the lens specs the tokens stand for. */
      specs?: LensSpec[];
      /** Names the client does not list; the server decides whether they exist. */
      unknown: UnknownAttribute[];
      /** Everything the text says, as one WHERE, for the server's check. */
      validationWhere: string;
    }
  | { status: 'error'; form: TextForm; error: TextError };

/** Read text mode's text. Never throws. */
export function analyzeText(text: string, ctx: AnalyzeContext): TextAnalysis {
  const { main, hidden } = splitTextLines(text);
  const form: TextForm = main.trim() && isTokenForm(main) ? 'tokens' : 'where';
  if (!main.trim() && hidden.length === 0) return { status: 'empty', form };

  if (form === 'tokens') {
    const parsed = parseTokens(main, ctx.tokens);
    if (!parsed.ok) return { status: 'error', form, error: withLine(text, parsed.error) };
    const enabled: string[] = [];
    for (const spec of parsed.specs) {
      const problem = lensProblem(ctx.entity, spec);
      const conj = lensConjuncts(ctx.entity, spec);
      if (problem || !conj) {
        const at = main.search(/\S/);
        return {
          status: 'error',
          form,
          error: withLine(text, {
            message: problem?.message ?? 'This filter cannot be written as WHERE.',
            start: at,
            end: main.trimEnd().length,
          }),
        };
      }
      enabled.push(...conj);
    }
    if (hidden.length > 0) {
      const h = hidden[0];
      return {
        status: 'error',
        form,
        error: withLine(text, {
          message: `${HIDDEN_PREFIX.trim()} lines hold WHERE. Convert the tokens to WHERE first.`,
          start: h.offset,
          end: h.offset + h.text.length,
        }),
      };
    }
    return {
      status: 'ok',
      form,
      enabled,
      hidden: [],
      groups: [{ enabled: true, conjuncts: enabled }],
      specs: parsed.specs,
      unknown: [],
      validationWhere: joinConjuncts(enabled),
    };
  }

  const parsed = parseWhereText(text);
  if (!parsed.ok) return { status: 'error', form, error: withLine(text, parsed.error) };

  const attrs: UnknownAttribute[] = [];
  const mainTerms = parseWhere(main);
  const ordered: Array<{ at: number; enabled: boolean; conjuncts: string[] }> = [];
  if (mainTerms.ok) {
    attrs.push(...termAttributes(main, mainTerms.terms, 0));
    for (const t of mainTerms.terms)
      ordered.push({ at: t.start, enabled: true, conjuncts: [collapseSpace(main.slice(t.start, t.end))] });
  }
  for (const h of hidden) {
    const p = parseWhere(h.text);
    if (!p.ok) continue;
    attrs.push(...termAttributes(h.text, p.terms, h.offset));
    if (p.terms.length)
      ordered.push({
        at: h.offset,
        enabled: false,
        conjuncts: p.terms.map((t) => collapseSpace(h.text.slice(t.start, t.end))),
      });
  }
  ordered.sort((a, b) => a.at - b.at);
  const groups: Array<{ enabled: boolean; conjuncts: string[] }> = [];
  for (const o of ordered) {
    const last = groups[groups.length - 1];
    // Enabled conjuncts next to each other form one run (a status is two of them); each hidden line is its own lens.
    if (o.enabled && last?.enabled) last.conjuncts.push(...o.conjuncts);
    else groups.push({ enabled: o.enabled, conjuncts: [...o.conjuncts] });
  }
  const unknown = attrs.filter((a) => ctx.knowledge(a.attr) === 'unknown');
  return {
    status: 'ok',
    form,
    enabled: parsed.value.enabled,
    hidden: parsed.value.hidden,
    groups,
    unknown,
    validationWhere: joinConjuncts([...parsed.value.enabled, ...parsed.value.hidden.flat()]),
  };
}

/** The message for an attribute the client does not know, shown until the server answers. */
export function unknownAttributeMessage(entity: EntityKind, attr: string): string {
  return `Unknown field “${attr}” for ${entity}s.`;
}

/** The lenses an `ok` analysis stands for, with fresh ids. */
export function analysisLenses(
  entity: EntityKind,
  analysis: Extract<TextAnalysis, { status: 'ok' }>,
  idGen: IdGen,
): Lens[] {
  if (analysis.specs)
    return analysis.specs.map((s) => ({ ...s, id: idGen(), enabled: true }) as Lens);
  return analysis.groups.flatMap((g) => {
    const terms: SourcedTerm[] = g.conjuncts.flatMap((c) => {
      const p = parseWhere(c);
      return p.ok ? p.terms.map((term) => ({ term, source: c })) : [];
    });
    return termsToSpecs(entity, terms).map((s) => ({ ...s, id: idGen(), enabled: g.enabled }) as Lens);
  });
}

/* ------------------------------------------------------------------------ */
/* Lenses -> text                                                            */
/* ------------------------------------------------------------------------ */

export interface LensesAsText {
  /** One conjunct per line, `AND` first on later enabled lines; a hidden lens is a `-- hidden:` line where it is. */
  text: string;
  /** Where each written lens is in `text`, by lens id. */
  ranges: Map<string, { start: number; end: number }>;
  /** Lenses with no value yet: nothing to write, so they are not in `text`. */
  unwritten: Lens[];
  /** Custom WHERE lenses whose saved text does not parse: written as saved, so the error shows and nothing is lost. */
  raw: Lens[];
}

/**
 * The lenses as text mode shows them, in their order, plus where each lens is
 * (so a Custom WHERE lens can open with its text selected) and the lenses the
 * text cannot hold or holds only as written.
 */
export function lensesToText(entity: EntityKind, lenses: readonly Lens[]): LensesAsText {
  const ranges = new Map<string, { start: number; end: number }>();
  const unwritten: Lens[] = [];
  const raw: Lens[] = [];
  const lines: string[] = [];
  let length = 0;
  const addLine = (line: string): { start: number; end: number } => {
    const start = length + (lines.length > 0 ? 1 : 0);
    lines.push(line);
    length = start + line.length;
    return { start, end: length };
  };
  let firstEnabled = true;
  for (const l of lenses) {
    let conj = lensConjuncts(entity, l);
    if (!conj) {
      if (l.kind === 'custom' && l.where.trim()) {
        conj = [collapseSpace(l.where.trim())];
        raw.push(l);
      } else {
        unwritten.push(l);
        continue;
      }
    }
    if (!l.enabled) {
      const r = addLine(`${HIDDEN_PREFIX}${conj.join(' AND ')}`);
      ranges.set(l.id, { start: r.start + HIDDEN_PREFIX.length, end: r.end });
      continue;
    }
    let range: { start: number; end: number } | null = null;
    for (const c of conj) {
      const prefix = firstEnabled ? '' : 'AND ';
      firstEnabled = false;
      const r = addLine(`${prefix}${c.trim()}`);
      const span = { start: r.start + prefix.length, end: r.end };
      range = range ? { start: range.start, end: span.end } : span;
    }
    if (range) ranges.set(l.id, range);
  }
  return { text: lines.join('\n'), ranges, unwritten, raw };
}

/** The note for lenses text mode cannot show, or null. */
export function unwrittenNote(unwritten: readonly Lens[]): string | null {
  if (unwritten.length === 0) return null;
  const n = unwritten.length;
  return `${n} unfinished filter${n === 1 ? ' is' : 's are'} not in the text. Editing the text removes ${n === 1 ? 'it' : 'them'}.`;
}
