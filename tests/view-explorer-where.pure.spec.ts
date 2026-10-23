// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The View Explorer's WHERE parser accepts ConfigHub's grammar (conjunctions
 * only) and refuses OR, NOT, grouping parentheses and now() with a message
 * and the span of the offending text.
 */
import { expect, test } from '@playwright/test';

import {
  collapseSpace,
  formatTerm,
  formatWhereText,
  parseWhereText,
  splitTextLines,
} from '../src/pages/x/view-explorer/model/where/format';
import { type Term, parseWhere } from '../src/pages/x/view-explorer/model/where/parser';

function terms(src: string): Term[] {
  const r = parseWhere(src);
  if (!r.ok) throw new Error(`unexpected error: ${r.error.message}`);
  return r.terms;
}

function errorOf(src: string) {
  const r = parseWhere(src);
  if (r.ok) throw new Error(`expected an error for: ${src}`);
  return { ...r.error, text: src.slice(r.error.start, r.error.end) };
}

test.describe('accepted forms', () => {
  const accepted: Array<[string, string]> = [
    ["Slug = 'a'", "Slug = 'a'"],
    ["Space.Slug LIKE 'payments-%'", "Space.Slug LIKE 'payments-%'"],
    ["Slug NOT LIKE 'x%'", "Slug NOT LIKE 'x%'"],
    ["Labels.app IN ('cart', 'web')", "Labels.app IN ('cart', 'web')"],
    ["Labels.app NOT IN ('cart')", "Labels.app NOT IN ('cart')"],
    ['TargetID IS NULL', 'TargetID IS NULL'],
    ['TargetID IS NOT NULL', 'TargetID IS NOT NULL'],
    ['HeadRevisionNum > LastReleasedRevisionNum', 'HeadRevisionNum > LastReleasedRevisionNum'],
    [
      'UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum',
      'UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum',
    ],
    ['LEN(Labels) > 2', 'LEN(Labels) > 2'],
    ["Labels ? 'app'", "Labels ? 'app'"],
    ["Slug ~* '^pay'", "Slug ~* '^pay'"],
    ["Slug !~~ 'a%'", "Slug !~~ 'a%'"],
    ["Slug ILIKE 'PAY%'", "Slug ILIKE 'PAY%'"],
    ["Labels.app.kubernetes.io/name = 'x'", "Labels.app.kubernetes.io/name = 'x'"],
    ['Data.spec.replicas > 1', 'Data.spec.replicas > 1'],
    [
      "Data.spec.containers.?name=main.image LIKE 'nginx%'",
      "Data.spec.containers.?name=main.image LIKE 'nginx%'",
    ],
    ['ValidationErrors.a = TRUE', 'ValidationErrors.a = true'],
    ["UpdatedAt > '2026-01-01T00:00:00Z'", "UpdatedAt > '2026-01-01T00:00:00Z'"],
    ["Slug = 'a' IS NOT TRUE", "Slug = 'a' IS NOT TRUE"],
    ["FromLink.*.Slug = 'x'", "FromLink.*.Slug = 'x'"],
  ];
  for (const [src, canonical] of accepted) {
    test(`parses ${src}`, () => {
      const t = terms(src);
      expect(t).toHaveLength(1);
      expect(formatTerm(t[0])).toBe(canonical);
      expect(src.slice(t[0].start, t[0].end)).toBe(src);
    });
  }

  test('several conjuncts, any spacing and line breaks', () => {
    const src =
      "Space.Slug LIKE 'p%'\nAND   TargetID IS NOT NULL\n\tAND Labels.app IN ('a','b')";
    const t = terms(src);
    expect(t.map(formatTerm)).toEqual([
      "Space.Slug LIKE 'p%'",
      'TargetID IS NOT NULL',
      "Labels.app IN ('a', 'b')",
    ]);
  });

  test('empty and blank text is no terms', () => {
    expect(terms('')).toEqual([]);
    expect(terms('  \n ')).toEqual([]);
  });

  test('numbers, booleans and an IN of numbers', () => {
    const [a, b] = terms('HeadRevisionNum IN (1, 2, 3) AND Flag = false');
    expect(a.kind === 'in' && a.values.map((v) => v.value)).toEqual([1, 2, 3]);
    expect(b.kind === 'compare' && b.operand).toEqual({ kind: 'bool', value: false });
  });

  test('a string may hold spaces and AND', () => {
    const [t] = terms("LastChangeDescription = 'fix a AND b'");
    expect(t.kind === 'compare' && t.operand).toEqual({
      kind: 'string',
      value: 'fix a AND b',
    });
  });
});

test.describe('refused forms carry a message and a span', () => {
  test('OR', () => {
    const e = errorOf("Slug = 'a' OR Slug = 'b'");
    expect(e.message).toBe(
      'ConfigHub filters accept only AND. Use two views, or IN for one field.',
    );
    expect(e.text).toBe('OR');
  });

  test('lower-case or', () => {
    expect(errorOf("Slug = 'a' or Slug = 'b'").text).toBe('or');
  });

  test('NOT before a term', () => {
    const e = errorOf("NOT Slug = 'a'");
    expect(e.message).toContain('NOT before a term is not supported');
    expect(e.text).toBe('NOT');
    expect(errorOf("Slug = 'a' AND NOT (Slug = 'b')").text).toBe('NOT');
  });

  test('grouping parentheses', () => {
    const e = errorOf("(Slug = 'a' AND Slug = 'b')");
    expect(e.message).toContain('Parentheses are only allowed in IN');
    expect(e.text).toBe("(Slug = 'a' AND Slug = 'b')");
    expect(errorOf("Slug = 'a' AND (TargetID IS NULL)").text).toBe('(TargetID IS NULL)');
    expect(errorOf("Slug = ('a')").message).toContain('Parentheses');
  });

  test('now()', () => {
    const e = errorOf("UpdatedAt > now() - '7d'");
    expect(e.message).toContain('now() is not supported');
    expect(e.text).toBe('now()');
    expect(errorOf('NOW() < UpdatedAt').message).toContain('now() is not supported');
  });

  test('a dangling AND', () => {
    const e = errorOf("Slug = 'a' AND ");
    expect(e.message).toBe('Expected a term after the final AND.');
    expect(e.text).toBe('AND');
  });

  test('an unterminated string', () => {
    const e = errorOf("Slug = 'abc");
    expect(e.message).toBe('This text has no closing quote.');
    expect(e.text).toBe("'abc");
  });

  test('quotes and backslashes inside a string', () => {
    expect(errorOf("Slug = 'it''s'").message).toBe('Text in quotes cannot contain a quote.');
    expect(errorOf("Slug = 'a\\b'").message).toContain('cannot contain');
  });

  test('<> and missing AND', () => {
    expect(errorOf("Slug <> 'a'").message).toBe('Use != instead of <>.');
    const e = errorOf("Slug = 'a' Slug = 'b'");
    expect(e.message).toBe('Expected AND between terms.');
    expect(e.text).toBe('Slug');
    expect(errorOf("Slug = 'a' and Slug = 'b'").message).toBe('Write AND in capitals.');
  });

  test('mixed IN lists and empty IN', () => {
    expect(errorOf("Slug IN ('a', 1)").message).toContain('must all be of one kind');
    expect(errorOf('Slug IN ()').message).toBe('IN needs at least one value.');
  });

  test('a missing operator or value', () => {
    expect(errorOf('Slug').message).toContain('Expected an operator after Slug');
    expect(errorOf('Slug =').message).toBe('Expected a value after the operator.');
    expect(errorOf('Slug = "a"').message).toContain('single quotes');
  });

  test('spans point into multi-line text', () => {
    const src = "Slug = 'a'\nAND Space.Slug = 'b'\nOR TargetID IS NULL";
    const e = errorOf(src);
    expect(e.text).toBe('OR');
    expect(src.slice(0, e.start).split('\n').length).toBe(3);
  });
});

test.describe('text mode', () => {
  test('format and parse are inverse, with hidden lines', () => {
    const text = formatWhereText(
      ["Space.Slug LIKE 'payments-%'", 'TargetID IS NOT NULL'],
      ['HeadRevisionNum > LastReleasedRevisionNum AND TargetID IS NOT NULL'],
    );
    expect(text).toBe(
      "Space.Slug LIKE 'payments-%'\nAND TargetID IS NOT NULL\n-- hidden: HeadRevisionNum > LastReleasedRevisionNum AND TargetID IS NOT NULL",
    );
    const parsed = parseWhereText(text);
    expect(parsed.ok && parsed.value).toEqual({
      enabled: ["Space.Slug LIKE 'payments-%'", 'TargetID IS NOT NULL'],
      hidden: [['HeadRevisionNum > LastReleasedRevisionNum', 'TargetID IS NOT NULL']],
    });
  });

  test('comments keep spans aligned and other comments are ignored', () => {
    const text = "-- my note\nSlug = 'a'\n-- hidden: Slug OR";
    const split = splitTextLines(text);
    expect(split.main.length).toBe(text.length);
    const parsed = parseWhereText(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(text.slice(parsed.error.start, parsed.error.end)).toBe('OR');
  });

  test('-- inside quotes is not a comment', () => {
    const parsed = parseWhereText("LastChangeDescription = 'a -- b'");
    expect(parsed.ok && parsed.value.enabled).toEqual(["LastChangeDescription = 'a -- b'"]);
  });

  test('collapseSpace keeps quoted text as written', () => {
    expect(collapseSpace("Slug   =\n  'a  b'")).toBe("Slug = 'a  b'");
  });
});

test.describe('comments and control characters', () => {
  test('-- inside a name is not a comment; only a line that starts with -- is', () => {
    const parsed = parseWhereText("Labels.a--b = 'x'");
    expect(parsed.ok && parsed.value.enabled).toEqual(["Labels.a--b = 'x'"]);
    const withNote = parseWhereText("  -- a note\nSlug = 'a'");
    expect(withNote.ok && withNote.value.enabled).toEqual(["Slug = 'a'"]);
  });

  test('control characters in quoted text are refused, as the server does', () => {
    const e = errorOf("Slug = 'a\tb'");
    expect(e.message).toBe(
      'Text in quotes cannot contain tabs, line breaks or other control characters.',
    );
    expect(parseWhere("Slug = 'a\u007fb'").ok).toBe(false);
  });
});
