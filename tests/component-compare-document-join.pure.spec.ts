// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// How a document finds its counterpart in the other deployments.
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
// default. So the join is asserted together with its symptom: when both
// deployments loaded, no cell may be left unanswerable. What an unanswerable
// cell says is component-compare-unanswerable.pure.spec.ts's subject.

import { expect, test } from '@playwright/test';

import {
  buildCompareResult,
  type CompareColumnInput,
  type CompareLeafRow,
} from '../src/pages/x/apps/compare/deploymentCompareModel';
import { resourceAliasKey } from '../src/pages/x/apps/compare/identityPaths';

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

  test('a resource whose namespace a variant replaced joins by its name without the namespace', () => {
    // Two ExternalSecrets, so the name is part of the join; the variant moved
    // both out of the upstream's placeholder namespace.
    const upstream = `apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: app-secrets
  namespace: confighubplaceholder
spec:
  refreshInterval: 1h
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: ghcr-secret
  namespace: confighubplaceholder
spec:
  refreshInterval: 1h
`;
    const variant = upstream.replaceAll('namespace: confighubplaceholder', 'namespace: app-staging');
    const result = buildCompareResult(columns(upstream, variant));
    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => group.name).sort()).toEqual(['app-secrets', 'ghcr-secret']);
    for (const group of result.groups) {
      const rows = leaves(group.rows);
      const namespace = rows.find((row) => row.identityPath === 'metadata.namespace');
      expect(namespace?.cells.map((cell) => cell.kind)).toEqual(['differs', 'differs']);
      // Only the namespace differs; nothing is left without its counterpart.
      expect(group.differingCount).toBe(1);
      for (const row of rows) for (const cell of row.cells) expect(cell.kind).not.toBe('no-document');
    }
  });

  test('a name without its namespace that names two resources joins neither by it', () => {
    const twoNamespaces = `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: reader
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: reader
  namespace: app
`;
    const moved = twoNamespaces.replace('namespace: app', 'namespace: app-prod');
    const result = buildCompareResult(columns(twoNamespaces, moved));
    // kube-system/reader joins exactly; app/reader and app-prod/reader stay apart,
    // rather than one of them being picked.
    expect(result.groups).toHaveLength(3);

    // Aliases list each resource's current name too, so once MutationSources
    // load they must not join what the name without its namespace could not.
    const aliasesOf = (data: string) =>
      new Map(
        [...data.matchAll(/namespace: (\S+)/g)].map((match) => [
          resourceAliasKey('rbac.authorization.k8s.io/v1/Role', `${match[1]}/reader`),
          new Set(['reader']),
        ]),
      );
    const [before, after] = columns(twoNamespaces, moved);
    const withAliases = buildCompareResult([
      { ...(before as CompareColumnInput), resourceAliases: aliasesOf(twoNamespaces) },
      { ...(after as CompareColumnInput), resourceAliases: aliasesOf(moved) },
    ]);
    expect(withAliases.groups).toHaveLength(3);
  });

  test('documents of a repeated type with no name still join by position, and say so', () => {
    const jobs = `apiVersion: batch/v1
kind: Job
metadata:
  generateName: migrate-
spec:
  backoffLimit: 1
---
apiVersion: batch/v1
kind: Job
metadata:
  generateName: seed-
spec:
  backoffLimit: 1
`;
    const result = buildCompareResult(columns(jobs, jobs));
    expect(result.groups).toHaveLength(2);
    expect(result.differingCount).toBe(0);
    expect(result.hasPositionalRows).toBe(true);
  });

  test('a renamed resource joins its counterpart through its MutationSources aliases', () => {
    const before = `apiVersion: v1
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
    const after = before.replace('name: settings', 'name: settings-v2');
    const renamed = new Map([[resourceAliasKey('v1/ConfigMap', '/settings-v2'), new Set(['settings', 'settings-v2'])]]);

    const withoutAliases = buildCompareResult(columns(before, after));
    expect(withoutAliases.groups).toHaveLength(3);

    const [prod, dev] = columns(before, after);
    const result = buildCompareResult([prod as CompareColumnInput, { ...(dev as CompareColumnInput), resourceAliases: renamed }]);
    expect(result.groups).toHaveLength(2);
    const settings = result.groups.find((group) => group.name === 'settings');
    const name = leaves(settings?.rows ?? []).find((row) => row.identityPath === 'metadata.name');
    expect(name?.cells.map((cell) => cell.literal)).toEqual(['settings', 'settings-v2']);
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
