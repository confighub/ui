// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What the grid says when a deployment has nothing to show, and what it must not
// say about one it never read.
//
// TWO DEFECTS, AND THE SECOND IS THE SERIOUS ONE.
//
// The first was drift. The grid and the hoisted image rows each spelled out the
// unanswerable wording for themselves. When `empty-unit` was added, only the
// grid learned it — the image rows still had a two-branch ternary whose else was
// `loading`, so the same empty unit read "empty" in the tree and "loading" in the
// rows above it, and the rows waited forever. Every reason is asserted against
// BOTH renderers below, through the one list they now share.
//
// The second never appeared in the bug report. A column that cannot answer
// produces no difference, so every count over the rows read it as agreement, and
// the pane went on to state "all 21 fields agree across these 2 deployments"
// about a deployment whose configuration it had never seen. Silence is not
// assent. `unansweredColumns`/`missingUnitColumns` are what a caller has to
// quote alongside any count, and the assertions here are that ONE of them is
// populated whenever a column is mute.
//
// A THIRD STATE, `no-such-unit`, is neither of those. Not holding a unit at
// all is settled and unremarkable — a component's variants need not share
// every unit — while `empty-unit` is a genuine read failure. The two are
// different claims about a deployment, so they are asserted into different
// buckets below: `missingUnitColumns` and `unansweredColumns`.

import { expect, test } from '@playwright/test';

import {
  buildCompareResult,
  filterRows,
  rowDiffers,
  type CompareLeafRow,
} from '../src/pages/x/apps/compare/deploymentCompareModel';
import {
  UNANSWERABLE,
  unanswerableReason,
  type UnanswerableReason,
} from '../src/pages/x/apps/compare/unanswerable';

const DOC = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: cubbychat
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: otel-collector
          image: ghcr.io/confighubai/otel:v1.9.2
`;

function leaves(rows: readonly { type: string }[]): CompareLeafRow[] {
  return rows.filter((row): row is CompareLeafRow => row.type === 'leaf');
}

const EVERY_REASON: UnanswerableReason[] = ['loading', 'no-such-unit', 'empty-unit', 'no-document'];

/**
 * Every deployment that contributed nothing, whichever bucket it is in.
 *
 * Three buckets: a request in flight (`loadingColumns`), a settled read
 * failure (`unansweredColumns`), and a settled but unremarkable absence
 * (`missingUnitColumns`) — but the property they SHARE is the one this file
 * is about: a deployment that said nothing must never be read as one that
 * agreed. Assertions about that property go through here, so splitting the
 * buckets again cannot quietly drop one of them.
 */
function muteColumns(result: {
  loadingColumns: string[];
  unansweredColumns: string[];
  missingUnitColumns: string[];
}): string[] {
  return [...result.loadingColumns, ...result.unansweredColumns, ...result.missingUnitColumns].sort();
}

test.describe('the unanswerable vocabulary', () => {
  test('every reason has a word, and only loading is a wait', () => {
    for (const reason of EVERY_REASON) {
      const spoken = UNANSWERABLE[reason];
      expect(spoken, `no wording for ${reason}`).toBeDefined();
      expect(spoken.word.length).toBeGreaterThan(0);
      expect(spoken.why('dev')).toContain('dev');
      expect(spoken.transient).toBe(reason === 'loading');
    }
  });

  test('no settled reason may print the waiting word', () => {
    // This is the defect, stated directly: "empty" and "no unit" and "no
    // resource" are answers. Printing "loading" for any of them is a cell that
    // never stops waiting.
    for (const reason of EVERY_REASON) {
      if (reason === 'loading') continue;
      expect(UNANSWERABLE[reason].word).not.toBe('loading');
    }
  });

  test('an empty unit resolves the same way wherever it is rendered', () => {
    // The grid and the image rows both go through this, so they cannot drift
    // apart again the way they did.
    expect(unanswerableReason('unknown', 'empty-unit')).toBe('empty-unit');
    expect(UNANSWERABLE[unanswerableReason('unknown', 'empty-unit')].word).toBe('empty');
  });

  test("a row's own missing document outranks the column's reason", () => {
    expect(unanswerableReason('no-document', undefined)).toBe('no-document');
    expect(unanswerableReason('no-document', 'loading')).toBe('no-document');
  });

  test('a column with no stated reason is still treated as waiting, not as an answer', () => {
    expect(unanswerableReason('unknown', undefined)).toBe('loading');
  });
});

test.describe('a deployment that could not be read is never counted as agreeing', () => {
  test('an empty sibling is reported, not silently folded into agreement', () => {
    const result = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DOC },
        { deploymentId: 'b', label: 'dev', unavailable: 'empty-unit' },
      ],
    );

    // No row differs — an unknown cell is not evidence of a difference, and
    // pretending otherwise would flood the filter with rows that may well agree.
    expect(result.differingCount).toBe(0);
    expect(result.totalCount).toBeGreaterThan(0);

    // So the count ALONE says "everything agrees". This is the field that stops
    // a caller from believing it.
    expect(result.unansweredColumns).toEqual(['dev']);
  });

  test('every unanswerable reason marks its column, in the bucket that fits it', () => {
    for (const reason of ['loading', 'no-such-unit', 'empty-unit'] as const) {
      const result = buildCompareResult(
        [
          { deploymentId: 'a', label: 'prod', data: DOC },
          { deploymentId: 'b', label: 'dev', unavailable: reason },
        ],
      );
      expect(muteColumns(result), `${reason} went unreported`).toEqual(['dev']);
      // Three settled/transient buckets, and each reason lands in exactly one:
      // `loading` is the only wait; `no-such-unit` is settled but unremarkable,
      // never a read failure; `empty-unit` is the only settled failure.
      expect(result.loadingColumns, reason).toEqual(reason === 'loading' ? ['dev'] : []);
      expect(result.missingUnitColumns, reason).toEqual(reason === 'no-such-unit' ? ['dev'] : []);
      expect(result.unansweredColumns, reason).toEqual(reason === 'empty-unit' ? ['dev'] : []);
    }
  });

  test('several mute deployments are all named, split by which bucket fits each one', () => {
    const result = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DOC },
        { deploymentId: 'b', label: 'dev', unavailable: 'empty-unit' },
        { deploymentId: 'c', label: 'edge-ap1', unavailable: 'no-such-unit' },
      ],
    );
    // `dev` genuinely could not be read: it holds the unit, empty. `edge-ap1`
    // simply does not hold this unit — settled, unremarkable, and NOT a read
    // failure, so it must not share `dev`'s bucket.
    expect(result.unansweredColumns).toEqual(['dev']);
    expect(result.missingUnitColumns).toEqual(['edge-ap1']);
  });

  test('when every deployment answers, nothing is flagged', () => {
    const result = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DOC },
        { deploymentId: 'b', label: 'dev', data: DOC },
      ],
    );
    expect(muteColumns(result)).toEqual([]);
    expect(result.differingCount).toBe(0);
  });

  test('an unknown cell is still not a difference', () => {
    const result = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DOC },
        { deploymentId: 'b', label: 'dev', unavailable: 'loading' },
      ],
    );
    const replicas = leaves(result.groups[0]?.rows ?? []).find(
      (row) => row.identityPath === 'spec.replicas',
    );
    expect(replicas?.cells[1]?.kind).toBe('unknown');
    expect(rowDiffers(replicas?.cells ?? [])).toBe(false);
  });
});

test.describe('the count and the filter handle every non-value state', () => {
  const MUTE = ['loading', 'no-such-unit', 'empty-unit'] as const;

  test('a mute deployment is never reported as agreement', () => {
    for (const reason of MUTE) {
      const result = buildCompareResult(
        [
          { deploymentId: 'a', label: 'prod', data: DOC },
          { deploymentId: 'b', label: 'dev', unavailable: reason },
        ],
      );
      // The exact sentence the escalation was about: "Differing 0 — all N fields
      // agree" is only ever true when NOTHING went unchecked.
      expect(result.differingCount, reason).toBe(0);
      expect(result.unverifiableCount, `${reason} was counted as agreement`).toBe(result.totalCount);
      expect(muteColumns(result), reason).toEqual(['dev']);
    }
  });

  test('a transient column is treated exactly like a settled one, mid-flight', () => {
    // The failure is the same whether the wait ends or not: for as long as it
    // lasts, agreement is being asserted over a column nobody has read.
    const loading = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DOC },
        { deploymentId: 'b', label: 'dev', unavailable: 'loading' },
      ],
    );
    expect(loading.unverifiableCount).toBe(loading.totalCount);
    // A wait, not a verdict — but still never agreement.
    expect(loading.loadingColumns).toEqual(['dev']);
    expect(loading.unansweredColumns).toEqual([]);
    expect(muteColumns(loading)).toEqual(['dev']);
  });

  test('the Differing filter shows what it could not check, rather than hiding it', () => {
    const result = buildCompareResult([
      { deploymentId: 'a', label: 'prod', data: DOC },
      { deploymentId: 'b', label: 'dev', unavailable: 'empty-unit' },
    ]);
    const rows = result.groups[0]?.rows ?? [];
    const kept = leaves(filterRows(rows));
    // Hiding these would be the worst version of this screen: a filtered view
    // that omits exactly the rows the reader cannot trust.
    expect(kept.length).toBe(leaves(rows).length);
    expect(kept.length).toBeGreaterThan(0);
  });

  test('when everything answers, the filter still hides what genuinely agrees', () => {
    const result = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DOC },
        { deploymentId: 'b', label: 'dev', data: DOC },
      ],
    );
    const rows = result.groups[0]?.rows ?? [];
    expect(result.unverifiableCount).toBe(0);
    expect(filterRows(rows)).toEqual([]);
  });

  test('a real difference and an unchecked row are counted separately, never merged', () => {
    const differs = DOC.replace('replicas: 3', 'replicas: 1');
    const result = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DOC },
        { deploymentId: 'b', label: 'dev', data: differs },
        { deploymentId: 'c', label: 'edge', unavailable: 'empty-unit' },
      ],
    );
    // One genuine difference; every row also unchecked against `edge`.
    expect(result.differingCount).toBe(1);
    expect(result.unverifiableCount).toBe(result.totalCount);
    expect(result.unansweredColumns).toEqual(['edge']);
  });
});

test('the model always states why a cell cannot answer, so no renderer has to guess', () => {
  // The pair (`unknown`, no reason) is what a renderer would have to default on,
  // and the only sane default is the waiting word — which is how a settled state
  // comes to wait forever. The model never emits it.
  for (const reason of ['loading', 'no-such-unit', 'empty-unit'] as const) {
    const result = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DOC },
        { deploymentId: 'b', label: 'dev', unavailable: reason },
      ],
    );
    for (const row of leaves(result.groups[0]?.rows ?? [])) {
      expect(row.cells[1]?.kind).toBe('unknown');
      expect(row.cells[1]?.reason, `cell gave no reason for ${reason}`).toBe(reason);
    }
  }

  // And a row whose document is missing states that instead of the column's.
  const withMap = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: settings\ndata:\n  tier: gold\n';
  const mixed = buildCompareResult(
    [
      { deploymentId: 'a', label: 'prod', data: withMap },
      { deploymentId: 'b', label: 'dev', data: DOC },
    ],
  );
  const configMap = mixed.groups.find((group) => group.kind === 'ConfigMap');
  for (const row of leaves(configMap?.rows ?? [])) {
    expect(row.cells[1]?.reason).toBe('no-document');
  }
});

test('a wait, a verdict and a plain absence are held apart, because only two of them are final and only one is a failure', () => {
  // A wait, a read failure, and a settled non-failure are three different
  // facts about a column and must stay in three different buckets — folding
  // any two together makes one of them print a claim that isn't true.
  const result = buildCompareResult(
    [
      { deploymentId: 'a', label: 'prod', data: DOC },
      { deploymentId: 'b', label: 'dev', unavailable: 'loading' },
      { deploymentId: 'c', label: 'edge', unavailable: 'empty-unit' },
      { deploymentId: 'd', label: 'staging', unavailable: 'no-such-unit' },
    ],
  );
  expect(result.loadingColumns).toEqual(['dev']);
  expect(result.unansweredColumns).toEqual(['edge']);
  expect(result.missingUnitColumns).toEqual(['staging']);
  // None of the three is agreement.
  expect(muteColumns(result)).toEqual(['dev', 'edge', 'staging']);
});
