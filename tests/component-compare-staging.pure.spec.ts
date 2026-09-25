// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Staging an edit across several deployments, and what happens when only some
// of them accept it.
//
// THE PART WORTH THE MOST ATTENTION IS THE PARTIAL OUTCOME. With one deployment
// a refusal is a single clear failure. With five, an apply can be accepted by
// three Spaces and refused by two — and that is the ordinary case, not an error
// path. A footer reporting it as "apply failed" would be describing something
// that did not happen, after having already written to production. So the
// outcome is per deployment, and a refusal keeps its edits staged rather than
// discarding work the user cannot get back.
//
// Two things are deliberately NOT blocked, both verified against the source
// rather than assumed: protected paths (which mean *kept on merge*, and have
// always been hand-editable — the shipped gate is `!readOnly && onStageEdit`),
// and write permission (which the UI cannot see and the shipped editor does not
// check either). Asserted below so neither is quietly reintroduced.

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import {
  applyEditsToUnit,
  describeApply,
  editBlockReason,
  editKey,
  stagedKind,
  summariseEdits,
  type StagedCompareEdit,
} from '../src/pages/x/apps/compare/compareEditing';
import { COMPARE_STAGED_TOKENS } from '../src/pages/x/apps/compare/rowTypeTokens';
import {
  buildCompareResult,
  type CompareLeafRow,
} from '../src/pages/x/apps/compare/deploymentCompareModel';
import { parseUnitData } from '../src/pages/x/apps/configParser';

const DOC = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          image: ghcr.io/confighubai/api:v0.4.15
`;

/** A list whose elements carry no identity, so it can only be lined up by position. */
const POSITIONAL = `spec:
  args:
    - --v
    - --v
`;

function rowsOf(...data: (string | undefined)[]): CompareLeafRow[] {
  return buildCompareResult(
    data.map((d, i) => ({ deploymentId: `d${i}`, label: i === 0 ? 'prod' : `dev${i}`, data: d })),
  )
    .groups.flatMap((group) => group.rows)
    .filter((row): row is CompareLeafRow => row.type === 'leaf');
}

function edit(overrides: Partial<StagedCompareEdit> & { deploymentId: string }): StagedCompareEdit {
  return {
    unitSlug: 'checkout',
    identityPath: 'spec.replicas',
    positionalPath: 'spec.replicas',
    before: '3',
    after: '5',
    ...overrides,
  };
}

test.describe('which cells refuse an edit', () => {
  test('a by-position row is refused in every column', () => {
    const rows = rowsOf(POSITIONAL, POSITIONAL);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.isPositional).toBe(true);
      expect(editBlockReason(row, 0)).toBe('by-position');
      expect(editBlockReason(row, 1)).toBe('by-position');
    }
  });

  test('a column with nothing to edit is refused for that reason, not the other', () => {
    const rows = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DOC },
        { deploymentId: 'b', label: 'dev', unavailable: 'empty-unit' },
      ],
    )
      .groups.flatMap((group) => group.rows)
      .filter((row): row is CompareLeafRow => row.type === 'leaf');

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(editBlockReason(row, 0)).toBeNull();
      expect(editBlockReason(row, 1)).toBe('unanswerable');
    }
  });

  test('an ordinary identity-keyed row is editable everywhere', () => {
    // Coverage: if this failed, every "is refused" assertion above would pass
    // vacuously on a grid where nothing is editable.
    const rows = rowsOf(DOC, DOC);
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) {
      expect(editBlockReason(row, 0)).toBeNull();
      expect(editBlockReason(row, 1)).toBeNull();
    }
  });

  test('there are exactly two refusals — permission and protection are not among them', () => {
    // `protectedPaths` means kept-on-merge, and the UI cannot see per-Space
    // permissions. Blocking on either would delete a shipped capability.
    const reasons = new Set(
      rowsOf(DOC, POSITIONAL).flatMap((row) => [editBlockReason(row, 0), editBlockReason(row, 1)]),
    );
    reasons.delete(null);
    for (const reason of reasons) expect(['by-position', 'unanswerable']).toContain(reason);
  });
});

test.describe('what a staged edit is', () => {
  test('setting a field that was not set is an add', () => {
    expect(stagedKind(edit({ deploymentId: 'a', before: undefined, after: 'x' }))).toBe('add');
    expect(stagedKind(edit({ deploymentId: 'a', before: '3', after: '5' }))).toBe('edit');
  });

  test('one edit per field per deployment, never shared between them', () => {
    const a = editKey('prod', 'checkout', 'spec.replicas');
    const b = editKey('dev', 'checkout', 'spec.replicas');
    const c = editKey('prod', 'other-unit', 'spec.replicas');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  test('the footer breaks the count down per deployment, in slot order', () => {
    const summaries = summariseEdits(
      [
        edit({ deploymentId: 'prod' }),
        edit({ deploymentId: 'prod', identityPath: 'spec.paused' }),
        edit({ deploymentId: 'edge' }),
      ],
      [
        { deploymentId: 'prod', label: 'prod-us1' },
        { deploymentId: 'staging', label: 'staging' },
        { deploymentId: 'edge', label: 'edge-ap1' },
      ],
    );
    // `staging` has nothing staged and is left out entirely.
    expect(summaries.map((s) => [s.letter, s.label, s.count])).toEqual([
      ['A', 'prod-us1', 2],
      ['C', 'edge-ap1', 1],
    ]);
  });
});

test.describe('folding edits into a unit', () => {
  test('several edits to one unit all land', () => {
    const result = applyEditsToUnit(DOC, [
      edit({ deploymentId: 'a', positionalPath: 'spec.replicas', after: '9' }),
      edit({
        deploymentId: 'a',
        identityPath: 'spec.template.spec.containers[api].image',
        positionalPath: 'spec.template.spec.containers.0.image',
        after: 'ghcr.io/x:v2',
      }),
    ]);
    expect(result.ok).toBe(true);
    const after = parseUnitData(result.ok ? result.data : '');
    expect(after.get('spec.replicas')).toBe('9');
    expect(after.get('spec.template.spec.containers.0.image')).toBe('ghcr.io/x:v2');
  });

  test('a path that cannot be written aborts that unit and names itself', () => {
    // All-or-nothing per unit, matching the shipped commit: a partial write
    // would drop staged changes with nothing on screen to say which.
    const result = applyEditsToUnit(DOC, [
      edit({ deploymentId: 'a', positionalPath: 'spec.replicas.nope.deeper', after: '1' }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.failedPaths).toContain('spec.replicas.nope.deeper');
  });
});

test.describe('applying to several deployments at once', () => {
  test('some accepted and some refused is reported as exactly that', () => {
    const described = describeApply([
      { deploymentId: 'a', label: 'prod-us1', ok: true },
      { deploymentId: 'b', label: 'prod-eu1', ok: true },
      { deploymentId: 'c', label: 'staging', ok: false, reason: 'the server did not accept the write' },
    ]);
    expect(described.partial).toBe(true);
    expect(described.applied.map((o) => o.label)).toEqual(['prod-us1', 'prod-eu1']);
    expect(described.refused.map((o) => o.label)).toEqual(['staging']);
  });

  test('all-accepted and all-refused are both distinguishable from partial', () => {
    expect(describeApply([{ deploymentId: 'a', label: 'a', ok: true }]).partial).toBe(false);
    expect(describeApply([{ deploymentId: 'a', label: 'a', ok: false }]).partial).toBe(false);
    expect(describeApply([{ deploymentId: 'a', label: 'a', ok: false }]).applied).toEqual([]);
  });

  test('a refusal names the deployment, so the user knows which one to retry', () => {
    const { refused } = describeApply([
      { deploymentId: 'c', label: 'staging', ok: false, reason: 'the server did not accept the write' },
    ]);
    expect(refused[0]?.label).toBe('staging');
    expect(refused[0]?.reason).toContain('server');
  });
});

test('the staged colours still match the shipped tree', () => {
  // These three are mirrored from `ROW_TYPE_TOKENS`, which is welded into a
  // 4,000-line file behind 32 annotated constants. Mirroring is what lets the
  // compare grid use them without that edit; this is what stops the mirror
  // drifting, which is a thing that has already happened twice in this feature.
  const shipped = readFileSync('src/pages/x/apps/ComponentValuesSection.tsx', 'utf8');
  const declared = (name: string) => {
    const match = new RegExp(`const ${name} = '([^']+)'`).exec(shipped);
    if (!match) throw new Error(`${name} is no longer declared — the mirror has lost its source`);
    return match[1];
  };

  expect(COMPARE_STAGED_TOKENS.edit.fill).toBe(declared('EDIT_CONTROL'));
  expect(COMPARE_STAGED_TOKENS.add.fill).toBe(declared('ADD_FILL'));
  expect(COMPARE_STAGED_TOKENS.delete.fill).toBe(declared('DEL_FILL'));
  expect(COMPARE_STAGED_TOKENS.edit.tint).toBe(declared('EDIT_TINT'));
  expect(COMPARE_STAGED_TOKENS.add.tint).toBe(declared('ADD_TINT'));
  expect(COMPARE_STAGED_TOKENS.delete.tint).toBe(declared('DEL_TINT'));
});
