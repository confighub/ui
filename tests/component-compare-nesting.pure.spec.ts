// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The compare grid nests, using the same builder the shipped trees use.
//
// WHAT WENT WRONG THE FIRST TIME. The grid grew its own two-level substitute for
// `diffTree.ts` instead of calling it. That lost three things at once, and only
// the first was noticed: the nesting; composite leaf keys (`requests.cpu` instead
// of `cpu` under `requests`); and sibling ORDER, because folders were emitted
// when first reached rather than in tree order — so `resources.limits` could
// appear above the `resources` it belongs under, with `cpu` and `memory` under
// one folder while `requests.cpu` sat under another. That third one is a wrong
// picture of the document, not a denser one.
//
// All three are asserted here, because all three come back together if anyone
// reintroduces a local builder.

import { expect, test } from '@playwright/test';

import {
  buildCompareResult,
  type CompareFolderRow,
  type CompareLeafRow,
  type CompareRow,
} from '../src/pages/x/apps/compare/deploymentCompareModel';
import { indexUnitByIdentity, pathIsPositional } from '../src/pages/x/apps/compare/identityPaths';
import {
  ancestorPathsOf,
  buildCompareTreeRows,
  decodeIdentityPath,
  elideFolderLabel,
  encodeIdentityPath,
} from '../src/pages/x/apps/compare/compareTree';

const DEEP = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout
  labels: { app: checkout, tier: web }
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          image: nginx
          resources:
            limits: { cpu: "1", memory: 1Gi }
            requests: { cpu: "1" }
          env:
            - name: LOG_LEVEL
              value: info
`;

function rowsOf(data = DEEP): CompareRow[] {
  return (
    buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data },
        { deploymentId: 'b', label: 'dev', data },
      ],
    ).groups[0]?.rows ?? []
  );
}

const folders = (rows: CompareRow[]) => rows.filter((r): r is CompareFolderRow => r.type === 'folder');
const leaves = (rows: CompareRow[]) => rows.filter((r): r is CompareLeafRow => r.type === 'leaf');

test.describe('the grid nests', () => {
  test('rows reach the depth the document actually has', () => {
    const rows = rowsOf();
    // Coverage: a fixture that is flat would satisfy every assertion below.
    expect(rows.length).toBeGreaterThan(15);
    expect(folders(rows).length).toBeGreaterThan(4);
    // Two levels was the whole of the old renderer.
    expect(Math.max(...rows.map((row) => row.depth))).toBeGreaterThan(2);
  });

  test('a leaf key is its own key, never a dotted composite', () => {
    const rows = leaves(rowsOf());
    const cpu = rows.filter((row) => row.identityPath.endsWith('.cpu'));
    expect(cpu.length).toBe(2);
    for (const row of cpu) expect(row.leafKey).toBe('cpu');
    // `requests.cpu` as a leaf key is the exact shape that was wrong.
    expect(rows.every((row) => !row.leafKey.includes('.'))).toBe(true);
  });

  test('every leaf sits deeper than the folder above it', () => {
    const rows = rowsOf();
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const row = rows[i];
      if (!previous || !row || previous.type !== 'folder') continue;
      expect(row.depth, `${row.identityPath} is not inside ${previous.identityPath}`).toBe(
        previous.depth + 1,
      );
    }
  });

  test('siblings are in tree order — a child never precedes its parent', () => {
    // The bug: `…resources.limits` emitted above `…resources`.
    const rows = rowsOf();
    const seen = new Set<string>();
    for (const row of rows) {
      for (const ancestor of ancestorPathsOf(
        rows.map((r) => ({ type: r.type, identityPath: r.identityPath, key: '', depth: r.depth })),
        row.identityPath,
      )) {
        expect(seen.has(ancestor), `${row.identityPath} came before its parent ${ancestor}`).toBe(true);
      }
      seen.add(row.identityPath);
    }
  });

  test('a subtree is contiguous, which is what the filter and collapsing rely on', () => {
    const rows = rowsOf();
    const resources = folders(rows).find((row) => row.identityPath.endsWith('.resources'));
    expect(resources).toBeDefined();
    const start = rows.indexOf(resources as CompareRow);
    let end = start + 1;
    while (end < rows.length && (rows[end]?.depth ?? 0) > (resources as CompareFolderRow).depth) end += 1;
    const subtree = rows.slice(start + 1, end).map((row) => row.identityPath);
    // limits + its two leaves, requests + its one leaf.
    expect(subtree.length).toBe(5);
    for (const path of subtree) expect(path.startsWith(`${(resources as CompareFolderRow).identityPath}.`)).toBe(true);
  });

  test('chains always collapse — a single-child run costs one row, not five', () => {
    const collapsed = folders(rowsOf()).find((row) => row.label.includes('template'));
    expect(collapsed, 'the single-child chain did not collapse').toBeDefined();
    expect((collapsed as CompareFolderRow).label).toContain('.');
  });
});

test.describe('identity tokens survive the shared builder', () => {
  test('a dot inside a token is not a folder boundary', () => {
    // `buildPathTree` splits on `.`, so `containers[my.sidecar]` would otherwise
    // become two levels. The encoding is what keeps `diffTree.ts` untouched.
    const rows = buildCompareTreeRows(['spec.containers[my.sidecar].image']);
    expect(rows.map((row) => row.identityPath)).toContain('spec.containers[my.sidecar].image');
    expect(rows.some((row) => row.identityPath.includes('my.sidecar]'))).toBe(true);
    expect(rows.filter((row) => row.type === 'leaf')).toHaveLength(1);
  });

  test('the encoding round-trips', () => {
    for (const path of [
      'spec.containers[my.sidecar].image',
      'spec.containers[api].image',
      'metadata.annotations.confighub.com/gate',
    ]) {
      expect(decodeIdentityPath(encodeIdentityPath(path))).toBe(path);
    }
  });

  test('an identity-keyed list still nests by its token', () => {
    const rows = rowsOf();
    const container = folders(rows).find((row) => row.label.includes('containers[api]'));
    expect(container).toBeDefined();
    const env = folders(rows).find((row) => row.identityPath.endsWith('env[LOG_LEVEL]'));
    expect(env).toBeDefined();
    expect((env as CompareFolderRow).depth).toBeGreaterThan((container as CompareFolderRow).depth);
  });
});

test.describe('ancestors', () => {
  test('a row names every folder it sits inside, outermost first', () => {
    const rows = rowsOf();
    const cpu = leaves(rows).find((row) => row.identityPath.endsWith('resources.limits.cpu'));
    expect(cpu).toBeDefined();
    const ancestors = ancestorPathsOf(
      rows.map((r) => ({ type: r.type, identityPath: r.identityPath, key: '', depth: r.depth })),
      (cpu as CompareLeafRow).identityPath,
    );
    expect(ancestors.length).toBeGreaterThanOrEqual(2);
    expect(ancestors[ancestors.length - 1]).toContain('limits');
    // Outermost first, and each one a prefix of the next.
    for (let i = 1; i < ancestors.length; i += 1) {
      expect((ancestors[i] ?? '').startsWith(`${ancestors[i - 1]}.`)).toBe(true);
    }
  });

  test('a top-level row has no ancestors', () => {
    const rows = rowsOf();
    const top = leaves(rows).find((row) => row.identityPath === 'apiVersion');
    expect(top).toBeDefined();
    expect(
      ancestorPathsOf(
        rows.map((r) => ({ type: r.type, identityPath: r.identityPath, key: '', depth: r.depth })),
        'apiVersion',
      ),
    ).toEqual([]);
  });
});

test('the edit targets still resolve, so nesting did not move the write', () => {
  // Nesting is grouping and indent. If it ever became row identity, an edit
  // would start writing somewhere else.
  const extra = DEEP.replace(
    '        - name: api',
    '        - name: debug\n          image: busybox\n        - name: api',
  );
  const rows = leaves(
    buildCompareResult(
      [
        { deploymentId: 'a', label: 'prod', data: DEEP },
        { deploymentId: 'b', label: 'dev', data: extra },
      ],
    ).groups[0]?.rows ?? [],
  );
  const image = rows.find((row) => row.identityPath === 'spec.template.spec.containers[api].image');
  expect(image).toBeDefined();
  expect((image as CompareLeafRow).editTargets[0]?.positionalPath).toBe(
    'spec.template.spec.containers.0.image',
  );
  expect((image as CompareLeafRow).editTargets[1]?.positionalPath).toBe(
    'spec.template.spec.containers.1.image',
  );
});

test.describe('a folder label is shortened without being destroyed', () => {
  // The first version split on `.` without the bracket-aware splitter that
  // already existed for the tree builder — so
  // `annotations[kubectl.kubernetes.io/restartedAt]` came back as `spec.…`, the
  // identity gone and the label naming nothing. The same bug in a second place,
  // which is why both now share one splitter.

  const LONG = 'spec.template.metadata.annotations[kubectl.kubernetes.io/restartedAt]';

  test('an identity token is never torn apart', () => {
    const out = elideFolderLabel(LONG, 20);
    expect(out).not.toBe('spec.…');
    // Both ends of the token survive, which is what identifies it.
    expect(out).toContain('annota');
    expect(out).toContain('tedAt]');
  });

  test('the result always fits the budget it was given', () => {
    // It used to prefer keeping identity units at ANY cost, so the CSS ellipsis
    // fired on top of the elision — two ellipses, and the tail lost anyway.
    for (const [label, budget] of [
      [LONG, 20],
      ['spec.template.spec.containers[api].resources.limits', 22],
      ['spec.template.spec.containers[api]', 18],
      ['a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p', 12],
    ] as const) {
      expect(elideFolderLabel(label, budget).length, `${label} @ ${budget}`).toBeLessThanOrEqual(budget);
    }
  });

  test('a label that already fits is left exactly as it is', () => {
    for (const label of ['metadata', 'spec.template.spec', 'containers[api]']) {
      expect(elideFolderLabel(label, 22)).toBe(label);
    }
  });

  test('whole units go before any unit is cut', () => {
    // Middle-truncation is the last resort, not the first move.
    expect(elideFolderLabel('spec.template.spec.containers[api].resources.limits', 22)).toBe(
      'spec.….limits',
    );
  });
});

test('a document with no identity is marked positional, not joined quietly', () => {
  // `doc:0` joins by position one level above the list keying this module is
  // about. Same risk, so it gets the same visible mark.
  //
  // JSON RATHER THAN INI, and that matters: an INI fixture parses to the single
  // positional path `[#0]`, so it reports `hasPositionalRows` whatever the
  // document key does — a test built on it passes with the mark removed. These
  // paths are clean, so the flag can only be coming from the key.
  const noKind = '{"outer": {"inner": 1, "other": 2}}';
  const result = buildCompareResult(
    [
      { deploymentId: 'a', label: 'prod', data: noKind },
      { deploymentId: 'b', label: 'dev', data: noKind },
    ],
  );
  const paths = result.groups
    .flatMap((group) => group.rows)
    .filter((row): row is CompareLeafRow => row.type === 'leaf')
    .map((row) => row.identityPath);
  expect(paths).toEqual(['outer.inner', 'outer.other']);
  expect(paths.some(pathIsPositional), 'the fixture is positional for another reason').toBe(false);

  expect(result.groups[0]?.docKey).toContain('#');
  expect(result.hasPositionalRows, 'an identity-less document joined silently').toBe(true);
});

test.describe('a free-form map key is one segment, however many dots it has', () => {
  // The parser splits every path on `.` before this module sees it, so
  // `annotations["kubectl.kubernetes.io/restartedAt"]` arrives as four segments.
  // Flat, that only made a label imprecise. Nested, it manufactured folders the
  // document does not have — `annotations` › `kubectl` › `kubernetes` — and split
  // an identity across a folder boundary, which is what the whole module exists
  // to prevent.

  const ANNOTATED = `apiVersion: v1
kind: Pod
metadata:
  annotations:
    kubectl.kubernetes.io/restartedAt: "2026-01-01"
  labels:
    app: checkout
`;

  test('the key is rejoined into one identity token', () => {
    const paths = [
      ...(indexUnitByIdentity(ANNOTATED).documents[0]?.valueByIdentityPath.keys() ?? []),
    ];
    expect(paths).toContain('metadata.annotations[kubectl.kubernetes.io/restartedAt]');
    // And ONLY when the key has a dot. A plain key needs no rejoining, and
    // bracketing it anyway would reprint every `labels.app` in the grid.
    expect(paths).toContain('metadata.labels.app');
    expect(paths).not.toContain('metadata.labels[app]');
  });

  test('so it never becomes a folder boundary', () => {
    const paths = [
      ...(indexUnitByIdentity(ANNOTATED).documents[0]?.valueByIdentityPath.keys() ?? []),
    ];
    const rows = buildCompareTreeRows(paths);
    // No folder may be named after a fragment of the key.
    for (const row of rows.filter((candidate) => candidate.type === 'folder')) {
      expect(row.key, `"${row.key}" is a piece of an annotation key`).not.toContain('kubernetes');
    }
    // And the leaf carries the whole key, not its tail. `annotations` holds one
    // child, so the chain collapses onto it — which is the shared builder doing
    // its job, and is why the key is prefixed rather than bare.
    const leaf = rows.find((row) => row.type === 'leaf' && row.key.includes('restartedAt'));
    expect(leaf?.key).toBe('annotations[kubectl.kubernetes.io/restartedAt]');
  });

  test('a name that is a map in one Kind and a struct in another is left alone', () => {
    // A Service's `selector` IS free-form, but a Deployment's is a LabelSelector
    // whose `matchLabels` is a structural field. Treating the name as free-form
    // swallowed `matchLabels.app` into `selector[matchLabels.app]` and collapsed
    // a real level of the document. The dotted keys live under `matchLabels`,
    // and that is where the rule applies.
    const paths = [
      ...(indexUnitByIdentity(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: checkout
`).documents[0]?.valueByIdentityPath.keys() ?? []),
    ];
    expect(paths).toContain('spec.selector.matchLabels[app.kubernetes.io/name]');
    // The structural level survives: no path may end at `selector` swallowing
    // the field below it.
    expect(paths.some((path) => path.startsWith('spec.selector[matchLabels'))).toBe(false);
  });

  test('the CANONICAL path is untouched, so an edit still writes correctly', () => {
    // The identity path is a label and a join key; the positional path is what
    // `setValueAtPath` and `protectedPaths` read. However the identity is
    // rewritten, the map must still hand back the path the document actually
    // has, or every edit to a dotted key would be written to a field that does
    // not exist.
    const document = indexUnitByIdentity(ANNOTATED).documents[0];
    expect(document?.positionalByIdentityPath.get('metadata.annotations[kubectl.kubernetes.io/restartedAt]'))
      .toBe('metadata.annotations.kubectl.kubernetes.io/restartedAt');
  });
});
