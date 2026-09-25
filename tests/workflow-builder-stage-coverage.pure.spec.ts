// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `stageCoverage` (workflow-builder/model.ts) — the pure split of a Stage's
// resolution into "will run against" / "will not run against", read directly:
// no page, no browser. Same pattern as `workflow-builder-summary-note.pure.spec.ts`.
//
// The three-way split is the whole point: `unresolved` (no answer yet),
// `invalid` (refused), and `split` (a real answer, possibly empty) must never
// be collapsed into one another. A reader who cannot tell "not answered yet"
// from "answered: nothing" from "refused" has been told something false by
// something that looked like a fact.

import { expect, test } from '@playwright/test';

import { stageCoverage } from '../src/pages/x/workflow-builder/model';
import { UNRESOLVED } from '../src/pages/x/workflow-builder/api/resolution/stageResolution';
import type {
  SpaceRow,
  StageResolution,
} from '../src/pages/x/workflow-builder/api/resolution/stageResolution';

function space(spaceId: string, slug: string, labels: Record<string, string> = {}): SpaceRow {
  return { spaceId, slug, labels };
}

const A = space('a', 'checkout-dev', { Variant: 'dev' });
const B = space('b', 'checkout-staging', { Variant: 'staging' });
const C = space('c', 'checkout-prod', { Variant: 'prod' });
const INVENTORY = [A, B, C];

function matched(spaces: SpaceRow[], stale = false): StageResolution {
  return { kind: 'matched', spaces, stale };
}

test('an unresolved Stage is not reported as matching nothing', () => {
  const cov = stageCoverage(UNRESOLVED, INVENTORY);
  expect(cov.kind).toBe('unresolved');
  expect(cov).not.toHaveProperty('runs');
});

test('a Stage whose request has not been made is unresolved, not empty', () => {
  const cov = stageCoverage(undefined, INVENTORY);
  expect(cov.kind).toBe('unresolved');
});

test("an invalid Stage carries the server's message through unedited", () => {
  const res: StageResolution = { kind: 'invalid', message: "unexpected token 'OR' at position 14" };
  const cov = stageCoverage(res, INVENTORY);
  expect(cov.kind).toBe('invalid');
  if (cov.kind === 'invalid') {
    expect(cov.message).toBe("unexpected token 'OR' at position 14");
  }
});

test('a valid Stage that matches nothing splits into an empty run list and a full skip list', () => {
  const cov = stageCoverage(matched([]), INVENTORY);
  expect(cov.kind).toBe('split');
  if (cov.kind === 'split') {
    expect(cov.runs).toEqual([]);
    expect(cov.skips).toEqual(INVENTORY);
  }
});

test('invalid and matches-nothing are different kinds, not one empty list', () => {
  const invalidCov = stageCoverage({ kind: 'invalid', message: 'bad expression' }, INVENTORY);
  const emptyMatchCov = stageCoverage(matched([]), INVENTORY);
  expect(invalidCov.kind).not.toBe(emptyMatchCov.kind);
  expect(invalidCov.kind).toBe('invalid');
  expect(emptyMatchCov.kind).toBe('split');
});

test('a matched Space outside the previewed inventory is not listed as running', () => {
  const outsider = space('outsider', 'payments-dev', { Variant: 'dev' });
  const cov = stageCoverage(matched([A, outsider]), INVENTORY);
  expect(cov.kind).toBe('split');
  if (cov.kind === 'split') {
    expect(cov.runs.map((sp) => sp.spaceId)).toEqual(['a']);
    expect(cov.runs.some((sp) => sp.spaceId === 'outsider')).toBe(false);
    expect(cov.skips.some((sp) => sp.spaceId === 'outsider')).toBe(false);
    // Every inventory row lands in exactly one list; the outsider inflates neither.
    expect(cov.runs.length + cov.skips.length).toBe(INVENTORY.length);
  }
});

test('both lists read in inventory order, so a variant never jumps between renders', () => {
  // The server answers with C and A, in that order; inventory order is A, B, C.
  const cov = stageCoverage(matched([C, A]), INVENTORY);
  expect(cov.kind).toBe('split');
  if (cov.kind === 'split') {
    expect(cov.runs.map((sp) => sp.spaceId)).toEqual(['a', 'c']);
    expect(cov.skips.map((sp) => sp.spaceId)).toEqual(['b']);
  }
});

test('a matched Stage covering everything leaves the skip list empty', () => {
  const cov = stageCoverage(matched([A, B, C]), INVENTORY);
  expect(cov.kind).toBe('split');
  if (cov.kind === 'split') {
    expect(cov.skips).toEqual([]);
    expect(cov.runs).toEqual(INVENTORY);
  }
});

test('a stale answer is split the same as a fresh one', () => {
  const fresh = stageCoverage(matched([A, B], false), INVENTORY);
  const stale = stageCoverage(matched([A, B], true), INVENTORY);
  expect(stale).toEqual(fresh);
});
