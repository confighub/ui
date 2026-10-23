// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The lens column's add box: words read one by one (so an unknown token is
 * shown and never dropped), suggestions with the counts they would give, Tab
 * completion, and the short form of lenses for one-line rows.
 */
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { shortLens, shortLensText } from '../src/pages/x/view-explorer/lenses/lensShort';
import {
  type SuggestContext,
  type Suggestion,
  commitText,
  completeWith,
  readBack,
  splitComposer,
  suggest,
  suggestKeys,
} from '../src/pages/x/view-explorer/lenses/suggest';
import { lensPredicate } from '../src/pages/x/view-explorer/model/client-eval';
import { fieldById } from '../src/pages/x/view-explorer/model/fields';
import type { Lens, LensSpec } from '../src/pages/x/view-explorer/model/types';
import { fakeUnits, lens } from './fixtures/view-explorer-model-views';

const ROWS = fakeUnits(200);
const LABEL_KEYS = ['app', 'tier', 'env', 'region'];

function valuesOf(fieldId: string): string[] {
  const f = fieldById('Unit', fieldId);
  if (!f) return [];
  const seen = new Set<string>();
  for (const r of ROWS) {
    const v = f.value(r);
    if (v !== null && v !== '') seen.add(String(v));
  }
  return [...seen].sort();
}

function countWith(base: readonly ExtendedUnitRead[], spec: LensSpec): number {
  const p = lensPredicate('Unit', { ...spec, id: 'x', enabled: true } as Lens);
  if (!p) throw new Error('needs the server');
  return base.filter((r) => p(r)).length;
}

const ctx: SuggestContext = {
  entity: 'Unit',
  labelKeys: LABEL_KEYS,
  values: valuesOf,
  count: (spec) => countWith(ROWS, spec),
};

const lensItems = (list: Suggestion[]) =>
  list.filter((s): s is Extract<Suggestion, { kind: 'lens' }> => s.kind === 'lens');

test.describe('splitComposer', () => {
  test('a trailing space ends the current word', () => {
    expect(splitComposer('space:a is:unre').current.raw).toBe('is:unre');
    expect(splitComposer('space:a is:unre ').current.raw).toBe('');
    expect(splitComposer('space:a is:unre ').done.map((w) => w.raw)).toEqual([
      'space:a',
      'is:unre',
    ]);
    expect(splitComposer('').done).toEqual([]);
  });
});

test.describe('read-back and Enter', () => {
  test('an unknown token stays visible as an error and blocks Enter', () => {
    const items = readBack('space:payments-prod bogus:thing is:unre ', ctx);
    expect(items.map((i) => i.ok)).toEqual([true, false, true]);
    const bad = items[1];
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('bogus');
    const commit = commitText('space:payments-prod bogus:thing is:unre', ctx);
    expect(commit.ok).toBe(false);
    if (!commit.ok) expect(commit.errors.map((e) => e.word.raw)).toEqual(['bogus:thing']);
  });

  test('every word is read; prefixes expand', () => {
    const commit = commitText('is:unre -tool:OpenTofu/HCL space:payments-*', ctx);
    expect(commit.ok).toBe(true);
    if (commit.ok) {
      expect(commit.specs).toEqual([
        { kind: 'status', status: 'unreleased' },
        { kind: 'field', field: 'ToolchainType', op: 'isNot', values: ['OpenTofu/HCL'] },
        { kind: 'field', field: 'Space', op: 'matches', values: ['payments-*'] },
      ]);
    }
  });

  test('the current word is judged only once it has a value', () => {
    expect(readBack('space:', ctx)).toEqual([]);
    expect(readBack('space:p', ctx)).toHaveLength(1);
    expect(readBack('paym', ctx)).toEqual([]);
  });
});

test.describe('suggest', () => {
  test('a lens the model refuses is an error, never a choice', () => {
    const list = suggest('space:pay_*', ctx);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('error');
    const commit = commitText('space:pay%*', ctx);
    expect(commit.ok).toBe(false);
  });

  test('an empty word lists every key, status first', () => {
    const keys = suggest('', ctx, 50).map((s) => (s.kind === 'key' ? s.key : null));
    expect(keys[0]).toBe('is');
    expect(keys).toEqual(suggestKeys(ctx));
    expect(keys).toContain('space');
    expect(keys).toContain('app');
  });

  test('values of a key carry the count they would give', () => {
    const list = lensItems(suggest('space:pay', ctx));
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      expect(s.spec.kind).toBe('field');
      if (s.spec.kind === 'field') expect(s.spec.values[0].startsWith('payments-')).toBe(true);
      expect(s.to).toBe(countWith(ROWS, s.spec));
    }
  });

  test('a list keeps the chosen values and offers the rest', () => {
    const list = lensItems(suggest('space:payments-prod,', ctx));
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      if (s.spec.kind !== 'field') throw new Error('field lens expected');
      expect(s.spec.values[0]).toBe('payments-prod');
      expect(s.spec.values).toHaveLength(2);
      expect(s.token.startsWith('space:payments-prod,')).toBe(true);
    }
  });

  test('a pattern gives one matches lens; a negated word gives is not', () => {
    const [p] = lensItems(suggest('space:payments-*', ctx));
    expect(p.spec).toEqual({
      kind: 'field',
      field: 'Space',
      op: 'matches',
      values: ['payments-*'],
    });
    const neg = lensItems(suggest('-toolchain:Open', ctx));
    expect(neg[0].spec).toEqual({
      kind: 'field',
      field: 'ToolchainType',
      op: 'isNot',
      values: ['OpenTofu/HCL'],
    });
  });

  test('an unknown key gives one error item and no choice', () => {
    const list = suggest('bogus:thing', ctx);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('error');
  });

  test('statuses expand from a prefix, and cannot be negated', () => {
    expect(lensItems(suggest('is:up', ctx)).map((s) => s.spec)).toEqual([
      { kind: 'status', status: 'upgradable' },
    ]);
    expect(suggest('-is:unreleased', ctx)[0].kind).toBe('error');
  });

  test('a bare word offers keys, values and a name match, the useful ones first', () => {
    const list = suggest('pay', ctx, 20);
    const lenses = lensItems(list);
    expect(lenses.some((s) => s.spec.kind === 'field' && s.spec.field === 'Space')).toBe(true);
    const free = lenses.find((s) => s.freeText);
    expect(free?.spec).toEqual({
      kind: 'field',
      field: 'Slug',
      op: 'matches',
      values: ['*pay*'],
    });
    const counted = lenses.filter((s) => !s.freeText).map((s) => s.to);
    const firstZero = counted.indexOf(0);
    if (firstZero >= 0) expect(counted.slice(firstZero).every((n) => n === 0)).toBe(true);
  });

  test('none is offered for a field that can be empty', () => {
    const list = lensItems(suggest('target:no', ctx));
    expect(list.some((s) => s.spec.kind === 'field' && s.spec.op === 'empty')).toBe(false);
    const tier = lensItems(suggest('tier:no', ctx));
    expect(tier.some((s) => s.spec.kind === 'field' && s.spec.op === 'empty')).toBe(true);
  });
});

test.describe('suggest without live counts', () => {
  test('no count is made: suggestions carry none and keep the text-match order', () => {
    const noCounts = { ...ctx, count: undefined };
    const list = lensItems(suggest('space:pay', noCounts));
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.to === null)).toBe(true);
    const values = list.map((s) => (s.spec.kind === 'field' ? s.spec.values[0] : ''));
    expect(values).toEqual([...values].sort((a, b) => a.localeCompare(b)));
  });
});

test.describe('completeWith', () => {
  test('a key completes to key:, a lens to its token and a space', () => {
    const [key] = suggest('spa', ctx);
    expect(completeWith('is:unreleased spa', key)).toBe('is:unreleased space:');
    const [val] = lensItems(suggest('space:payments-p', ctx));
    expect(completeWith('is:unreleased space:payments-p', val)).toBe(
      'is:unreleased space:payments-prod ',
    );
    const [neg] = suggest('-tool', ctx);
    expect(completeWith('-tool', neg)).toBe('-toolchain:');
  });
});

test.describe('short form', () => {
  test('field, status and custom lenses', () => {
    expect(
      shortLensText(
        'Unit',
        lens({ kind: 'field', field: 'Space', op: 'isNot', values: ['checkout-dev'] }),
      ),
    ).toBe('Space ≠ checkout-dev');
    expect(
      shortLensText(
        'Unit',
        lens({ kind: 'field', field: 'Space', op: 'matches', values: ['payments-*'] }),
      ),
    ).toBe('Space ~ payments-*');
    expect(shortLensText('Unit', lens({ kind: 'status', status: 'unreleased' }))).toBe(
      'Status = Unreleased',
    );
    expect(
      shortLensText(
        'Unit',
        lens({
          kind: 'field',
          field: 'Labels.region',
          op: 'is',
          values: ['eu-west-1', 'eu-central-1'],
        }),
      ),
    ).toBe('region = eu-west-1 +1');
    expect(
      shortLensText(
        'Unit',
        lens({ kind: 'field', field: 'Target', op: 'notEmpty', values: [] }),
      ),
    ).toBe('Target ≠ none');
    expect(shortLensText('Unit', lens({ kind: 'custom', where: 'LEN(Slug) > 3' }))).toBe(
      'WHERE LEN(Slug) > 3',
    );
  });

  test('parts mark labels, exclusion and the extra values', () => {
    const s = shortLens(
      'Unit',
      lens({ kind: 'field', field: 'Labels.tier', op: 'isNot', values: ['config', 'web'] }),
    );
    expect(s).toEqual({
      field: 'tier',
      isLabel: true,
      op: '≠',
      negated: true,
      value: 'config',
      more: 1,
    });
  });
});
