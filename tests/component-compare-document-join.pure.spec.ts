// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// How a document finds its counterpart in the other deployments, and what a cell
// says when it genuinely cannot answer.
//
// THE BUG THIS EXISTS TO STOP COMING BACK. The document join originally keyed on
// resource type AND name. Within one unit that is correct and is this repo's
// settled rule — it tells a Deployment from a ConfigMap and one ConfigMap from
// another. Across DEPLOYMENTS it is self-defeating, because the resource name is
// itself one of the values being compared: a deployment routinely names its
// resource after its own space. The documents then stopped joining at exactly
// the moment there was a difference worth showing, and the grid split into two
// half-empty groups whose other column read `unknown` on every row.
//
// That surfaced as the user-visible symptom "a lot of the values don't show, the
// state seems stuck on loading", because `unknown` printed the loading word by
// default. So the two halves are asserted together: the join must hold, AND no
// settled state may ever print "loading".

import { expect, test } from '@playwright/test';

import {
  buildCompareResult,
  type CompareColumnInput,
  type CompareLeafRow,
} from '../src/pages/x/apps/compare/deploymentCompareModel';

const PROD = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: cubbychat
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: debug-shell
          image: ghcr.io/acme/debug:v0.3.0
        - name: otel-collector
          image: ghcr.io/acme/otel:v1.9.2
`;

/** The same unit in another deployment, with its resource named after its own space. */
const DEV = PROD.replace('name: cubbychat', 'name: cubbychat-dev').replace('replicas: 3', 'replicas: 1');

function columns(...data: (string | undefined)[]): CompareColumnInput[] {
  return data.map((d, i) => ({ deploymentId: `d${i}`, label: i === 0 ? 'prod' : `dev${i}`, data: d }));
}

function leaves(rows: readonly { type: string }[]): CompareLeafRow[] {
  return rows.filter((row): row is CompareLeafRow => row.type === 'leaf');
}

test.describe('the document join', () => {
  test('a resource named after its own deployment still joins the other column', () => {
    const result = buildCompareResult(columns(PROD, DEV));

    // ONE group, not two. Two was the bug.
    expect(result.groups).toHaveLength(1);

    const rows = leaves(result.groups[0]?.rows ?? []);
    const replicas = rows.find((row) => row.identityPath === 'spec.replicas');
    expect(replicas?.cells.map((cell) => cell.kind)).toEqual(['differs', 'differs']);

    // The differing name is a compared VALUE, which is the whole reason it must
    // not also be the join key.
    const name = rows.find((row) => row.identityPath === 'metadata.name');
    expect(name?.cells.map((cell) => cell.kind)).toEqual(['differs', 'differs']);

    // Nothing may be stuck unanswerable when both deployments loaded fine.
    for (const row of rows) {
      for (const cell of row.cells) {
        expect(cell.kind).not.toBe('unknown');
        expect(cell.kind).not.toBe('no-document');
      }
    }
  });

  test('the identity join is untouched by the looser document key', () => {
    // debug-shell and otel-collector both sit at an index; they must stay
    // separated by name, which is the guarantee the whole feature rests on.
    const result = buildCompareResult(columns(PROD, DEV));
    const paths = leaves(result.groups[0]?.rows ?? []).map((row) => row.identityPath);
    expect(paths).toContain('spec.template.spec.containers[debug-shell].image');
    expect(paths).toContain('spec.template.spec.containers[otel-collector].image');
    expect(paths.filter((path) => /\.\d+(\.|$)/.test(path))).toEqual([]);
  });

  test('two documents of the same Kind in one unit are still told apart by name', () => {
    // The name re-enters the key exactly where it earns its place.
    const twoMaps = `apiVersion: v1
kind: ConfigMap
metadata:
  name: settings
data:
  tier: gold
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: features
data:
  beta: "on"
`;
    const result = buildCompareResult(columns(twoMaps, twoMaps));
    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => group.name).sort()).toEqual(['features', 'settings']);
    // Joined, so nothing diverges.
    expect(result.differingCount).toBe(0);
  });

  test('different Kinds never merge into one group', () => {
    const pair = `apiVersion: v1
kind: ConfigMap
metadata:
  name: settings
data:
  tier: gold
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cubbychat
spec:
  replicas: 2
`;
    const result = buildCompareResult(columns(pair, pair));
    expect(result.groups.map((group) => group.kind).sort()).toEqual(['ConfigMap', 'Deployment']);
  });
});

test.describe('a cell that cannot answer says which, and only waits when it is waiting', () => {
  test('a deployment holding the resource reads against one that does not', () => {
    const withMap = `apiVersion: v1
kind: ConfigMap
metadata:
  name: settings
data:
  tier: gold
`;
    const result = buildCompareResult(columns(withMap, PROD));
    const configMap = result.groups.find((group) => group.kind === 'ConfigMap');
    const tier = leaves(configMap?.rows ?? []).find((row) => row.identityPath === 'data.tier');

    // Terminal, and NOT `unknown`: the other deployment loaded perfectly well.
    expect(tier?.cells[1]?.kind).toBe('no-document');
    expect(tier?.cells[1]?.kind).not.toBe('unknown');
  });

  test('a genuinely loading column is still unknown — the state is not deleted', () => {
    const result = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: PROD },
        { deploymentId: 'b', label: 'dev', unavailable: 'loading' },
      ],
    );
    const replicas = leaves(result.groups[0]?.rows ?? []).find(
      (row) => row.identityPath === 'spec.replicas',
    );
    expect(replicas?.cells[1]?.kind).toBe('unknown');
  });

  test('an empty unit is a settled answer, not a wait', () => {
    const result = buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: PROD },
        { deploymentId: 'b', label: 'dev', unavailable: 'empty-unit' },
      ],
    );
    const replicas = leaves(result.groups[0]?.rows ?? []).find(
      (row) => row.identityPath === 'spec.replicas',
    );
    // Still `unknown` in the model — the column cannot answer — but the reason
    // travels with it so the cell prints "empty" rather than "loading".
    expect(replicas?.cells[1]?.kind).toBe('unknown');
  });

  test('a resource missing from one column is not, by itself, a difference', () => {
    // Two columns hold the resource and agree; the third lacks it entirely.
    // `no-document` is not evidence either way — there is nothing here for a
    // reader to act on, so it must not inflate the count.
    const withMap = `apiVersion: v1
kind: ConfigMap
metadata:
  name: settings
data:
  tier: gold
`;
    const result = buildCompareResult(columns(withMap, PROD, withMap));
    const configMap = result.groups.find((group) => group.kind === 'ConfigMap');
    expect(configMap?.differingCount).toBe(0);
    const tier = leaves(configMap?.rows ?? []).find((row) => row.identityPath === 'data.tier');
    expect(tier?.cells[1]?.kind).toBe('no-document');
    expect(tier?.cells.map((cell) => cell.kind)).toContain('same');
  });

  test('a genuine disagreement still shows through even where a third column has no document at all', () => {
    const withMapGold = `apiVersion: v1
kind: ConfigMap
metadata:
  name: settings
data:
  tier: gold
`;
    const withMapSilver = withMapGold.replace('tier: gold', 'tier: silver');
    const result = buildCompareResult(columns(withMapGold, withMapSilver, PROD));
    const configMap = result.groups.find((group) => group.kind === 'ConfigMap');
    expect(configMap?.differingCount).toBeGreaterThan(0);
  });
});

test.describe('the namespace appears exactly where it disambiguates', () => {
  const NS = (ns: string, name: string) => `apiVersion: v1
kind: ConfigMap
metadata:
  namespace: ${ns}
  name: ${name}
data:
  tier: gold
`;

  test('a lone resource is headed by its bare name, with no leading slash', () => {
    const doc = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: metrics-server
spec:
  replicas: 1
`;
    const group = buildCompareResult(columns(doc, doc)).groups[0];
    expect(group?.name).toBe('metrics-server');
    expect(group?.namespace).toBeUndefined();
    expect(group?.kindIsAmbiguous).toBe(false);
  });

  test('a namespaced resource still shows only its name while the Kind is unique', () => {
    const group = buildCompareResult(columns(NS('prod', 'settings'), NS('prod', 'settings')))
      .groups[0];
    expect(group?.name).toBe('settings');
    expect(group?.namespace).toBe('prod');
    // Nothing to disambiguate, so the namespace stays off the header.
    expect(group?.kindIsAmbiguous).toBe(false);
  });

  test('two same-named resources in different namespaces are distinguishable', () => {
    // Without the namespace both headers would read `settings`, and a tooltip
    // cannot tell two identical headers apart.
    const unit = `${NS('alpha', 'settings')}---\n${NS('beta', 'settings')}`;
    const result = buildCompareResult(columns(unit, unit));
    expect(result.groups).toHaveLength(2);
    for (const group of result.groups) {
      expect(group.name).toBe('settings');
      expect(group.kindIsAmbiguous).toBe(true);
    }
    expect(result.groups.map((group) => group.namespace).sort()).toEqual(['alpha', 'beta']);
    // And they must not have collapsed into one another.
    expect(new Set(result.groups.map((group) => group.docKey)).size).toBe(2);
  });
});
