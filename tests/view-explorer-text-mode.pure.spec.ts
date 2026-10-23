// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Text mode's pure parts: syntax colours, reading the text (WHERE or tokens,
 * errors with a line number, hidden lines, attributes only the server can
 * vouch for), lenses as text and back, and autocomplete, which offers no
 * values after a field it does not know.
 */
import { expect, test } from '@playwright/test';

import { lensesEqual, lensesToConjuncts } from '../src/pages/x/view-explorer/model/lens-compile';
import type { TokenContext } from '../src/pages/x/view-explorer/model/tokens';
import type { EntityKind, Lens } from '../src/pages/x/view-explorer/model/types';
import { formatWhereText } from '../src/pages/x/view-explorer/model/where/format';
import {
  type AnalyzeContext,
  analysisLenses,
  analyzeText,
  attributeKnowledge,
  lensesToText,
  lineAndColumn,
  unwrittenNote,
} from '../src/pages/x/view-explorer/text/analyze';
import {
  type CompletionEnv,
  applyCompletion,
  completionContext,
  completionEdit,
  suggest,
} from '../src/pages/x/view-explorer/text/completion';
import { resourceTypeProblem, whereDataProblem } from '../src/pages/x/view-explorer/text/extraChecks';
import {
  type HighlightSpan,
  highlightTokens,
  highlightWhere,
} from '../src/pages/x/view-explorer/text/highlight';

const LABEL_KEYS = ['app', 'tier', 'env', 'team', 'region'];

function tokenContext(entity: EntityKind): TokenContext {
  return { entity, labelKeys: LABEL_KEYS, values: () => [] };
}

function ctxFor(entity: EntityKind = 'Unit', extra: string[] = []): AnalyzeContext {
  return { entity, tokens: tokenContext(entity), knowledge: attributeKnowledge(entity, extra) };
}

let seq = 0;
const idGen = () => `l${++seq}`;

function kinds(text: string, spans: HighlightSpan[]): Array<[string, string]> {
  return spans.filter((s) => s.kind !== 'text').map((s) => [s.kind, text.slice(s.start, s.end)]);
}

function covers(text: string, spans: HighlightSpan[]) {
  let pos = 0;
  for (const s of spans) {
    expect(s.start).toBe(pos);
    expect(s.end).toBeGreaterThan(s.start);
    pos = s.end;
  }
  expect(pos).toBe(text.length);
}

test.describe('highlight', () => {
  test('colours WHERE text and covers every character', () => {
    const text = "Space.Slug LIKE 'payments-%'\nAND HeadRevisionNum > 3\n-- hidden: Labels.app IN ('a', 'b')";
    const spans = highlightWhere(text);
    covers(text, spans);
    expect(kinds(text, spans)).toEqual([
      ['field', 'Space.Slug'],
      ['keyword', 'LIKE'],
      ['string', "'payments-%'"],
      ['keyword', 'AND'],
      ['field', 'HeadRevisionNum'],
      ['operator', '>'],
      ['number', '3'],
      ['comment', "-- hidden: Labels.app IN ('a', 'b')"],
    ]);
  });

  test('half-typed text never throws and still covers everything', () => {
    for (const text of ["Slug = 'unterminated", 'Slug IN (', 'AND OR (( ))', '', '--', "'", '¬¬ 中文']) {
      covers(text, highlightWhere(text));
    }
  });

  test('colours the token form', () => {
    const text = 'space:payments-* -toolchain:OpenTofu/HCL';
    const spans = highlightTokens(text);
    covers(text, spans);
    expect(kinds(text, spans)).toEqual([
      ['field', 'space'],
      ['operator', ':'],
      ['string', 'payments-*'],
      ['operator', '-'],
      ['field', 'toolchain'],
      ['operator', ':'],
      ['string', 'OpenTofu/HCL'],
    ]);
  });
});

test.describe('analyzeText', () => {
  const refused: Array<[string, RegExp, string]> = [
    ["Slug = 'a'\nAND Slug = 'b' OR Slug = 'c'", /accept only AND/, 'OR'],
    ["Slug = 'a'\nAND NOT Slug = 'b'", /NOT before a term/, 'NOT'],
    ["Slug = 'a'\nAND (Slug = 'b')", /Parentheses/, "(Slug = 'b')"],
    ['Slug = \'a\'\nAND UpdatedAt > now()', /now\(\) is not supported/, 'now()'],
    ["Slug = 'a'\nAND Slug <> 'b'", /Use != instead of <>/, '<>'],
  ];
  for (const [text, message, span] of refused) {
    test(`refuses ${span} with a message on line 2`, () => {
      const a = analyzeText(text, ctxFor());
      expect(a.status).toBe('error');
      if (a.status !== 'error') return;
      expect(a.error.message).toMatch(message);
      expect(a.error.line).toBe(2);
      expect(text.slice(a.error.start, a.error.end)).toBe(span);
    });
  }

  test('reads WHERE with hidden lines', () => {
    const a = analyzeText("Space.Slug = 'payments-prod'\nAND Labels.app = 'api'\n-- hidden: TargetID IS NULL", ctxFor());
    expect(a).toMatchObject({
      status: 'ok',
      form: 'where',
      enabled: ["Space.Slug = 'payments-prod'", "Labels.app = 'api'"],
      hidden: [['TargetID IS NULL']],
      unknown: [],
      validationWhere: "Space.Slug = 'payments-prod' AND Labels.app = 'api' AND TargetID IS NULL",
    });
  });

  test('other comment lines are ignored', () => {
    const a = analyzeText("-- just a note\nSlug = 'a'", ctxFor());
    expect(a).toMatchObject({ status: 'ok', enabled: ["Slug = 'a'"], hidden: [] });
  });

  test('an error on a hidden line points into that line', () => {
    const text = "Slug = 'a'\n-- hidden: Slug = 'b' OR Slug = 'c'";
    const a = analyzeText(text, ctxFor());
    expect(a.status).toBe('error');
    if (a.status !== 'error') return;
    expect(a.error.line).toBe(2);
    expect(text.slice(a.error.start, a.error.end)).toBe('OR');
  });

  test('detects the token form and reads it as lenses', () => {
    const a = analyzeText('space:payments-* is:unreleased', ctxFor());
    expect(a.status).toBe('ok');
    if (a.status !== 'ok') return;
    expect(a.form).toBe('tokens');
    expect(a.specs).toHaveLength(2);
    expect(a.validationWhere).toBe(
      "Space.Slug LIKE 'payments-%' AND HeadRevisionNum > LastReleasedRevisionNum AND TargetID IS NOT NULL",
    );
  });

  test('a bad token is an error with its span', () => {
    const text = 'space:payments-* bogus:thing';
    const a = analyzeText(text, ctxFor());
    expect(a.status).toBe('error');
    if (a.status !== 'error') return;
    expect(a.form).toBe('tokens');
    expect(text.slice(a.error.start, a.error.end)).toBe('bogus:thing');
  });

  test('empty text is empty, not an error', () => {
    expect(analyzeText('  \n ', ctxFor()).status).toBe('empty');
  });

  test('marks names the client cannot vouch for, and only those', () => {
    const text =
      "bogus = 'x'\nAND UpstreamUnit.HeadRevisionNum > UpstreamRevisionNum\nAND Space.Labels.team = 'p'\nAND Data.spec.replicas > 2\nAND Wat.Ever IS NULL";
    const a = analyzeText(text, ctxFor());
    expect(a.status).toBe('ok');
    if (a.status !== 'ok') return;
    expect(a.unknown.map((u) => [u.attr, text.slice(u.start, u.end)])).toEqual([
      ['bogus', 'bogus'],
      ['Wat.Ever', 'Wat.Ever'],
    ]);
  });

  test('names through a related entity go to the server', () => {
    const know = attributeKnowledge('Unit');
    expect(know('Target.DisplayName')).toBe('attribute');
    expect(know('UpstreamUnit.LastChangeDescription')).toBe('attribute');
    expect(know('Wat.Ever')).toBe('unknown');
    expect(know('Target.')).toBe('unknown');
  });

  test('names from the completions list are known', () => {
    const a = analyzeText("SpaceID = 'x'", ctxFor('Unit', ['SpaceID']));
    expect(a).toMatchObject({ status: 'ok', unknown: [] });
  });

  test('line and column are 1-based', () => {
    expect(lineAndColumn('ab\ncd', 0)).toEqual({ line: 1, column: 1 });
    expect(lineAndColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
  });
});

const LENS_SETS: Array<[string, EntityKind, Lens[]]> = [
  [
    'field, status and custom',
    'Unit',
    [
      { id: 'a', enabled: true, kind: 'field', field: 'Space', op: 'matches', values: ['payments-*'] },
      { id: 'b', enabled: true, kind: 'status', status: 'unreleased' },
      { id: 'c', enabled: true, kind: 'custom', where: 'UpdatedAt > CreatedAt' },
    ],
  ],
  [
    'hidden lenses',
    'Unit',
    [
      { id: 'a', enabled: true, kind: 'field', field: 'Labels.app', op: 'is', values: ['api', 'web'] },
      { id: 'b', enabled: false, kind: 'status', status: 'upgradable' },
      { id: 'c', enabled: false, kind: 'field', field: 'Target', op: 'isNot', values: ['k8s-dev-shared'] },
    ],
  ],
  [
    'resources',
    'Resource',
    [
      { id: 'a', enabled: true, kind: 'field', field: 'ResourceType', op: 'is', values: ['apps/v1/Deployment'] },
      { id: 'b', enabled: true, kind: 'status', status: 'untargeted' },
    ],
  ],
  ['no lenses', 'Unit', []],
  [
    'a hidden lens first',
    'Unit',
    [
      { id: 'a', enabled: false, kind: 'field', field: 'Target', op: 'isNot', values: ['k8s-dev-shared'] },
      { id: 'b', enabled: true, kind: 'field', field: 'Space', op: 'is', values: ['payments-prod'] },
    ],
  ],
  [
    'a hidden lens between enabled ones',
    'Unit',
    [
      { id: 'a', enabled: true, kind: 'field', field: 'Space', op: 'is', values: ['payments-prod'] },
      { id: 'b', enabled: false, kind: 'status', status: 'unreleased' },
      { id: 'c', enabled: true, kind: 'status', status: 'upgradable' },
      { id: 'd', enabled: false, kind: 'custom', where: 'UpdatedAt > CreatedAt' },
      { id: 'e', enabled: true, kind: 'field', field: 'Labels.app', op: 'is', values: ['api'] },
    ],
  ],
];

/** Whether every hidden lens comes after every enabled one: then the text is formatWhereText's. */
const hiddenLast = (lenses: readonly Lens[]) =>
  lenses.findIndex((l) => !l.enabled) === -1 ||
  lenses.slice(lenses.findIndex((l) => !l.enabled)).every((l) => !l.enabled);

test.describe('lenses → text → lenses', () => {
  for (const [name, entity, lenses] of LENS_SETS) {
    test(`round-trips: ${name}`, () => {
      const { text, unwritten } = lensesToText(entity, lenses);
      expect(unwritten).toEqual([]);
      const { enabled, hidden } = lensesToConjuncts(entity, lenses);
      if (hiddenLast(lenses)) expect(text).toBe(formatWhereText(enabled, hidden));
      const a = analyzeText(text, ctxFor(entity));
      if (lenses.length === 0) {
        expect(a.status).toBe('empty');
        return;
      }
      expect(a.status).toBe('ok');
      if (a.status !== 'ok') return;
      expect(lensesEqual(analysisLenses(entity, a, idGen), lenses)).toBe(true);
    });
  }

  test('each lens knows where its text is', () => {
    const [, entity, lenses] = LENS_SETS[0];
    const { text, ranges } = lensesToText(entity, lenses);
    const at = (id: string) => {
      const r = ranges.get(id);
      return r ? text.slice(r.start, r.end) : null;
    };
    expect(at('a')).toBe("Space.Slug LIKE 'payments-%'");
    expect(at('b')).toBe('HeadRevisionNum > LastReleasedRevisionNum\nAND TargetID IS NOT NULL');
    expect(at('c')).toBe('UpdatedAt > CreatedAt');
    const hiddenSet = lensesToText('Unit', LENS_SETS[1][2]);
    const r = hiddenSet.ranges.get('c');
    expect(r && hiddenSet.text.slice(r.start, r.end)).toBe("Target.Slug != 'k8s-dev-shared'");
  });

  test('hidden lines stay where their lenses are', () => {
    const [, entity, lenses] = LENS_SETS[5];
    expect(lensesToText(entity, lenses).text).toBe(
      [
        "Space.Slug = 'payments-prod'",
        '-- hidden: HeadRevisionNum > LastReleasedRevisionNum AND TargetID IS NOT NULL',
        'AND UpstreamRevisionNum > 0',
        'AND UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum',
        '-- hidden: UpdatedAt > CreatedAt',
        "AND Labels.app = 'api'",
      ].join('\n'),
    );
  });

  test('a saved condition that does not parse is written as saved, with its error', () => {
    const lenses: Lens[] = [
      { id: 'a', enabled: true, kind: 'field', field: 'Space', op: 'is', values: ['p'] },
      { id: 'b', enabled: true, kind: 'custom', where: "Slug = 'x' OR Slug = 'y'" },
    ];
    const { text, raw, unwritten } = lensesToText('Unit', lenses);
    expect(text).toBe("Space.Slug = 'p'\nAND Slug = 'x' OR Slug = 'y'");
    expect(raw.map((l) => l.id)).toEqual(['b']);
    expect(unwritten).toEqual([]);
    const a = analyzeText(text, ctxFor());
    expect(a.status).toBe('error');
    if (a.status === 'error') expect(a.error.message).toMatch(/accept only AND/);
  });

  test('an unfinished lens is reported, not dropped silently', () => {
    const lenses: Lens[] = [
      { id: 'a', enabled: true, kind: 'field', field: 'Space', op: 'is', values: [] },
      { id: 'b', enabled: true, kind: 'status', status: 'untargeted' },
    ];
    const { text, unwritten } = lensesToText('Unit', lenses);
    expect(text).toBe('TargetID IS NULL');
    expect(unwritten.map((l) => l.id)).toEqual(['a']);
    expect(unwrittenNote(unwritten)).toBe(
      '1 unfinished filter is not in the text. Editing the text removes it.',
    );
    expect(unwrittenNote([])).toBeNull();
  });
});

test.describe('ResourceType and WhereData checks', () => {
  test('ResourceType accepts * for any type', () => {
    expect(resourceTypeProblem('*')).toBeNull();
    expect(resourceTypeProblem('apps/v1/*')).toBeNull();
    expect(resourceTypeProblem('apps/v1/Deployment')).toBeNull();
    expect(resourceTypeProblem('apps v1')).toMatch(/ResourceType is a type/);
  });

  test('WhereData: OR in quoted text is a value, not the keyword', () => {
    expect(whereDataProblem("metadata.name = 'OR'")).toBeNull();
    expect(whereDataProblem("metadata.name = 'a or b'")).toBeNull();
    expect(whereDataProblem('spec.replicas > 2 OR spec.replicas < 1')).toMatch(/only AND/);
  });
});

test.describe('autocomplete', () => {
  const env: CompletionEnv = {
    entity: 'Unit',
    labelKeys: LABEL_KEYS,
    extraAttributes: ['SpaceID', 'TargetID'],
    knowledge: attributeKnowledge('Unit', ['SpaceID', 'TargetID']),
    values: (fieldId) =>
      fieldId === 'Space'
        ? [
            { value: 'vx-demo-payments-prod', count: 9 },
            { value: 'vx-demo-payments-dev', count: 8 },
            { value: 'vx-demo-checkout-dev', count: 5 },
          ]
        : fieldId === 'HeadRevisionNum'
          ? [{ value: '3', count: 12 }]
          : [],
  };
  const at = (text: string) => completionContext(text, text.length);

  test('fields at the start and after AND', () => {
    expect(at('')).toMatchObject({ kind: 'field', prefix: '' });
    expect(at("Slug = 'a'\nAND Spa")).toMatchObject({ kind: 'field', prefix: 'Spa' });
    const r = suggest(at('Spa'), env);
    expect(r.items.length).toBeGreaterThan(1);
    expect(r.items.every((i) => i.label.startsWith('Spa'))).toBe(true);
    expect(r.items.map((i) => i.label)).toContain('SpaceID');
    expect(r.items[0]).toMatchObject({ label: 'Space.Slug', hint: 'text' });
  });

  test('operators for a known field', () => {
    const c = at('Space.Slug ');
    expect(c).toMatchObject({ kind: 'operator', attr: 'Space.Slug', prefix: '' });
    const ops = suggest(c, env).items.map((i) => i.label);
    expect(ops).toEqual(['=', '!=', 'IN', 'NOT IN', 'LIKE', 'NOT LIKE']);
    expect(suggest(at('Space.Slug L'), env).items.map((i) => i.label)).toEqual(['LIKE']);
  });

  test('values with counts, quoted for text', () => {
    const text = "Space.Slug = 'vx-demo-pay";
    const c = at(text);
    expect(c).toMatchObject({ kind: 'value', attr: 'Space.Slug', op: '=', prefix: 'vx-demo-pay', quoted: true });
    const r = suggest(c, env);
    expect(r.items.map((i) => [i.label, i.count])).toEqual([
      ['vx-demo-payments-prod', 9],
      ['vx-demo-payments-dev', 8],
    ]);
    if (c.kind === 'none') return;
    expect(applyCompletion(text, c, r.items[0])).toEqual({
      text: "Space.Slug = 'vx-demo-payments-prod' ",
      caret: "Space.Slug = 'vx-demo-payments-prod' ".length,
    });
  });

  test('LIKE values end with %, numbers are not quoted', () => {
    const like = at('Space.Slug LIKE ');
    expect(suggest(like, env).items[0].insert).toBe("'vx-demo-payments-prod%' ");
    const num = at('HeadRevisionNum = ');
    expect(suggest(num, env).items[0].insert).toBe('3 ');
  });

  test('values inside IN (…)', () => {
    const c = at("Space.Slug IN ('vx-demo-payments-prod', 'vx-demo-c");
    expect(c).toMatchObject({ kind: 'value', inList: true, prefix: 'vx-demo-c' });
    expect(suggest(c, env).items.map((i) => i.insert)).toEqual(["'vx-demo-checkout-dev'"]);
  });

  test('no value suggestions after an unknown field: the error instead', () => {
    for (const text of ["bogus = '", 'bogus ', "bogus IN ('"]) {
      const r = suggest(at(text), env);
      expect(r.items).toEqual([]);
      expect(r.error).toBe('Unknown field “bogus” for Units.');
    }
  });

  test('a known attribute without values gets operators but no values', () => {
    expect(suggest(at('SpaceID '), env).items.length).toBeGreaterThan(0);
    const r = suggest(at("SpaceID = '"), env);
    expect(r).toEqual({ items: [] });
  });

  test('after a whole term: AND, on a new line', () => {
    const text = "Slug = 'a' ";
    const c = at(text);
    expect(c.kind).toBe('conjunction');
    if (c.kind === 'none') return;
    const r = suggest(c, env);
    expect(applyCompletion(text, c, r.items[0])).toEqual({ text: "Slug = 'a'\nAND ", caret: "Slug = 'a'\nAND ".length });
    expect(at('TargetID IS NULL ').kind).toBe('conjunction');
  });

  test('a pick is one replacement, so the browser can undo it', () => {
    const text = 'Space.Slug L';
    const c = at(text);
    if (c.kind === 'none') throw new Error('expected an operator context');
    const item = suggest(c, env).items[0];
    expect(completionEdit(text, c, item)).toEqual({ from: 11, to: 12, insert: 'LIKE ', caret: 16 });
    const after = "Slug = 'a' ";
    const conj = at(after);
    if (conj.kind === 'none') throw new Error('expected a conjunction context');
    expect(completionEdit(after, conj, suggest(conj, env).items[0])).toEqual({
      from: 10,
      to: 11,
      insert: '\nAND ',
      caret: 15,
    });
  });

  test('nothing inside a comment line', () => {
    expect(at("Slug = 'a'\n-- hidden: Spa").kind).toBe('none');
  });
});
