// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `parseWhereClausesToFilters` / `buildWhereClauses` (components/query-builder),
// exercised directly for the round trip the coverage editor's blocks and text
// door both depend on: no page, no browser.
//
// This is not a new grammar under test -- it is the one the blocks already use
// to read and write `Stage.where`, pinned here so `StageWhereEditor`'s
// round-trip fidelity check (blocks <-> text) has a known-good baseline. An
// unparsed fragment degrading to ONE verbatim raw chip, rather than being
// silently dropped, is the property the text door's refusal logic leans on.

import { expect, test } from '@playwright/test';

// Imported from the specific modules rather than the `query-builder` barrel:
// the barrel also re-exports `QueryBuilder` and friends, which pull in MUI via
// a deep `@mui/material/*` path Node's own ESM resolver -- used here, since a
// pure spec runs with no browser -- cannot follow. Vite resolves that fine for
// the running app; only this direct-Node test run needs the narrower import.
import { buildWhereClauses } from '../src/components/query-builder/where-clause-builder';
import { getAvailableFieldsForEntity } from '../src/components/query-builder/operators';
import { parseWhereClausesToFilters } from '../src/components/query-builder/where-clause-parser';

const SPACE_FIELDS = getAvailableFieldsForEntity('Space');

function roundTrip(where: string) {
  const filters = parseWhereClausesToFilters(where, '', '', [], undefined, SPACE_FIELDS);
  return { filters, rebuilt: buildWhereClauses(filters).where };
}

test('a label equality clause survives blocks and comes back unchanged', () => {
  const where = "Labels.Team = 'payments'";
  const { rebuilt } = roundTrip(where);
  expect(rebuilt).toBe(where);
});

test('an AND run of three label clauses survives the round trip', () => {
  const where = "Labels.Team = 'payments' AND Labels.Tier = 'prod' AND Labels.Region = 'us'";
  const { filters, rebuilt } = roundTrip(where);
  expect(filters).toHaveLength(3);
  expect(rebuilt).toBe(where);
});

test('LEN(Labels) > 4 degrades to one raw where chip and is emitted verbatim', () => {
  const where = 'LEN(Labels) > 4';
  const { filters, rebuilt } = roundTrip(where);
  expect(filters).toHaveLength(1);
  expect(filters[0].field).toBe('where');
  expect(filters[0].operator).toBe('raw');
  expect(filters[0].value).toBe(where);
  expect(rebuilt).toBe(where);
});

test('a double-quoted value degrades to a raw chip rather than being dropped', () => {
  // The parser is single-quote only -- the server's own convention (per
  // test/scripts/test-changeorder.sh:1377) is single quotes -- so this pins
  // that the fallback is LOSSLESS, not that double quotes are a supported
  // second syntax.
  const where = 'Slug = "prod"';
  const { filters, rebuilt } = roundTrip(where);
  expect(filters).toHaveLength(1);
  expect(filters[0].operator).toBe('raw');
  expect(rebuilt).toBe(where);
});

test('an empty where produces no filters and rebuilds as an empty string', () => {
  const { filters, rebuilt } = roundTrip('');
  expect(filters).toEqual([]);
  expect(rebuilt).toBe('');
});

test('an IN (...) clause survives the round trip', () => {
  const where = "Slug IN ('a', 'b', 'c')";
  const { filters, rebuilt } = roundTrip(where);
  expect(filters).toHaveLength(1);
  expect(filters[0].operator).toBe('in');
  expect(rebuilt).toBe(where);
});

test('no round trip ever emits an empty string for a non-empty input', () => {
  const samples = [
    "Labels.Team = 'payments'",
    'LEN(Labels) > 4',
    'Slug = "prod"',
    "Slug IN ('a', 'b', 'c')",
    "Labels.Region != 'eu' AND Slug ILIKE '%checkout%'",
  ];
  for (const where of samples) {
    const { rebuilt } = roundTrip(where);
    expect(rebuilt).not.toBe('');
  }
});
