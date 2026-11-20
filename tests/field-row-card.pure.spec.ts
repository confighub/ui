// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What the row hover card ("Edit this value") adds for a field (PLAN.md U5, contract D5): the
// set-by row, at most one attention line (a block first, else what waits; warnings stay in the
// details), a guard line only where the card's "Keep on merge" row does not already say it.
import { expect, test } from '@playwright/test';

import { factsFromBlame, factsFromPath } from '../src/components/field-diagnosis/adapters';
import { explainField } from '../src/components/field-diagnosis/explainField';
import { rowCardLines } from '../src/pages/x/apps/field-diagnosis/rowCardLines';
import { many, prodWebField } from './fixtures/field-diagnosis/states';

const NOW = { now: Date.parse('2026-11-19T14:00:00Z') };
const blameView = (path: string) => explainField(factsFromBlame(prodWebField(path)), NOW);

test('a plain field: the set-by row only', () => {
  const lines = rowCardLines(blameView('metadata.labels.app'), { keepShown: true, hasStatus: false });
  expect(lines.setBy?.who).toBe('admin');
  expect(lines.attention).toBeUndefined();
  expect(lines.guards).toEqual([]);
});

test('Override with Keep on merge shown: the attention line, no Override line', () => {
  const lines = rowCardLines(blameView('spec.replicas'), { keepShown: true, hasStatus: false });
  expect(lines.attention?.kind).toBe('conflict');
  expect(lines.attention?.text).toBe('Upstream wants 7 · held by Override');
  expect(lines.guards).toEqual([]);
});

test('Override without Keep on merge (an array row): the Override line', () => {
  const lines = rowCardLines(blameView('spec.replicas'), { keepShown: false, hasStatus: false });
  expect(lines.guards.map((g) => g.key)).toEqual(['Override']);
});

test('a requirement guard: its line, whatever Keep on merge says', () => {
  const lines = rowCardLines(blameView('spec.template.spec.securityContext.runAsUser'), { keepShown: true, hasStatus: false });
  expect(lines.guards.map((g) => g.key)).toEqual(['RunAsRoot']);
  expect(lines.attention).toBeUndefined(); // no per-path gate, and no Unit gates in the card (D3)
});

test('many needs: one attention line, the first block', () => {
  const lines = rowCardLines(explainField(factsFromPath(many()), NOW), { keepShown: true, hasStatus: false });
  expect(lines.attention?.kind).toBe('gate');
  expect(lines.attention?.tone).toBe('block');
});

test('only a warning: no attention line (warnings stay in the details)', () => {
  const view = explainField(factsFromPath(many()), NOW);
  const warnOnly = { ...view, needs: view.needs.filter((n) => n.tone === 'warn') };
  expect(rowCardLines(warnOnly, { keepShown: true, hasStatus: false }).attention).toBeUndefined();
});

test("the card's own status (a staged edit) wins over the set-by row", () => {
  expect(rowCardLines(blameView('metadata.labels.app'), { keepShown: true, hasStatus: true }).setBy).toBeUndefined();
});

test('no line names the server\'s "Functions:"', () => {
  for (const path of ['spec.replicas', 'metadata.labels.app', 'metadata.annotations.reviewed']) {
    const lines = rowCardLines(blameView(path), { keepShown: true, hasStatus: false });
    expect(JSON.stringify(lines)).not.toContain('Functions:');
  }
});
