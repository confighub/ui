// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Where an edit to a compare cell actually gets written.
//
// THE FAILURE THIS EXISTS TO MAKE IMPOSSIBLE. The grid reads by identity —
// `containers[api].image` — while everything that WRITES (the staging model,
// `setValueAtPath`, `protectedPaths`) speaks the view's canonical dot-index
// paths. Those two disagree per deployment by design: `containers[api]` is
// `containers.0` in one and `containers.1` in another, and that disagreement is
// the entire reason the reading side is keyed by identity.
//
// So an edit must resolve its path against the document it is about to write,
// every time. Taking another column's canonical path and applying it to a
// sibling would set a DIFFERENT container's image and report success — the
// writing-side twin of aligning lists by position, and exactly as silent.
//
// The fixtures below are built so a positional mapping cannot pass: `dev` holds
// an extra container FIRST, so every container after it sits at a different
// index than it does in column A.

import { expect, test } from '@playwright/test';

import {
  buildCompareResult,
  type CompareColumnInput,
  type CompareLeafRow,
} from '../src/pages/x/apps/compare/deploymentCompareModel';
import { indexUnitByIdentity, resolveIdentityPath } from '../src/pages/x/apps/compare/identityPaths';
import { parseUnitData, setValueAtPath } from '../src/pages/x/apps/configParser';

const PROD = `apiVersion: apps/v1
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
        - name: otel
          image: ghcr.io/confighubai/otel:v1.9.2
`;

/** One extra container, and it is FIRST, so every index after it shifts. */
const DEV = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: debug
          image: ghcr.io/confighubai/debug:v0.3.0
        - name: api
          image: ghcr.io/confighubai/api:v0.5.0
        - name: otel
          image: ghcr.io/confighubai/otel:v1.9.2
`;

const COLUMNS: CompareColumnInput[] = [
  { deploymentId: 'prod', label: 'prod', data: PROD },
  { deploymentId: 'dev', label: 'dev', data: DEV },
];

function leafAt(identityPath: string): CompareLeafRow {
  const result = buildCompareResult(COLUMNS);
  const row = result.groups
    .flatMap((group) => group.rows)
    .find((candidate): candidate is CompareLeafRow =>
      candidate.type === 'leaf' && candidate.identityPath === identityPath,
    );
  if (!row) throw new Error(`no row at ${identityPath}`);
  return row;
}

test.describe('an edit resolves against the document it writes', () => {
  test('the same identity path maps to a different canonical path per deployment', () => {
    // If this ever returns the same path for both, the feature is writing to the
    // wrong container in one of them.
    const row = leafAt('spec.template.spec.containers[api].image');

    expect(row.editTargets[0]?.positionalPath).toBe('spec.template.spec.containers.0.image');
    expect(row.editTargets[1]?.positionalPath).toBe('spec.template.spec.containers.1.image');
    expect(row.editTargets[0]?.positionalPath).not.toBe(row.editTargets[1]?.positionalPath);
  });

  test('every container maps to its own index, not column A\'s ordering', () => {
    expect(leafAt('spec.template.spec.containers[otel].image').editTargets.map((t) => t?.positionalPath))
      .toEqual([
        'spec.template.spec.containers.1.image',
        'spec.template.spec.containers.2.image',
      ]);
  });

  test('the resolved path names the container the user was looking at', () => {
    // The assertion that would catch a positional write: follow the path back
    // into the raw document and check WHICH container it lands on.
    const row = leafAt('spec.template.spec.containers[api].image');
    for (const [index, data] of [PROD, DEV].entries()) {
      const target = row.editTargets[index];
      expect(target).toBeDefined();
      const flat = parseUnitData(data);
      const namePath = (target as { positionalPath: string }).positionalPath.replace(/\.image$/, '.name');
      expect(flat.get(namePath), `column ${index} resolved to the wrong container`).toBe('api');
    }
  });

  test('writing through the resolved path changes only that container', () => {
    const row = leafAt('spec.template.spec.containers[api].image');
    const target = row.editTargets[1];
    expect(target).toBeDefined();

    const written = setValueAtPath(DEV, (target as { positionalPath: string }).positionalPath, 'ghcr.io/x/api:v9');
    expect(written.ok).toBe(true);
    const after = parseUnitData(written.ok ? written.data : '');

    expect(after.get('spec.template.spec.containers.1.image')).toBe('ghcr.io/x/api:v9');
    // The neighbours column A's path would have hit are untouched.
    expect(after.get('spec.template.spec.containers.0.image')).toBe('ghcr.io/confighubai/debug:v0.3.0');
    expect(after.get('spec.template.spec.containers.2.image')).toBe('ghcr.io/confighubai/otel:v1.9.2');
  });

  test('a scalar field resolves identically everywhere, as it should', () => {
    expect(leafAt('spec.replicas').editTargets.map((target) => target?.positionalPath)).toEqual([
      'spec.replicas',
      'spec.replicas',
    ]);
  });
});

test.describe('a path that cannot be expressed is refused, not approximated', () => {
  test('a container only one deployment has offers no target on the other', () => {
    const row = leafAt('spec.template.spec.containers[debug].image');
    // prod has no `debug` container. Setting its image there is not an edit —
    // it is inserting a list element, and where it goes is undecidable here.
    expect(row.editTargets[0]).toBeUndefined();
    expect(row.editTargets[1]?.positionalPath).toBe('spec.template.spec.containers.0.image');
  });

  test('a field nothing has set yet still resolves, because its parent exists', () => {
    // An add. The leaf has no entry to look up, so this comes from the prefix
    // map — and it must still be THIS document's index for the container.
    const { documents } = indexUnitByIdentity(DEV);
    const document = documents[0];
    expect(document).toBeDefined();
    expect(
      resolveIdentityPath(
        document as NonNullable<typeof document>,
        'spec.template.spec.containers[api].imagePullPolicy',
      ),
    ).toBe('spec.template.spec.containers.1.imagePullPolicy');
  });

  test('a column that cannot answer offers no target at all', () => {
    const result = buildCompareResult(
      [
        { deploymentId: 'prod', label: 'prod', data: PROD },
        { deploymentId: 'dev', label: 'dev', unavailable: 'empty-unit' },
      ],
    );
    const rows = result.groups
      .flatMap((group) => group.rows)
      .filter((row): row is CompareLeafRow => row.type === 'leaf');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.editTargets[1]).toBeUndefined();
  });

  test('every row offers a target for every column that holds the path', () => {
    // Coverage: without this, all the assertions above could pass on an empty
    // set of targets.
    const rows = buildCompareResult(COLUMNS).groups
      .flatMap((group) => group.rows)
      .filter((row): row is CompareLeafRow => row.type === 'leaf');
    expect(rows.length).toBeGreaterThan(5);
    const resolved = rows.flatMap((row) => row.editTargets).filter(Boolean);
    expect(resolved.length).toBeGreaterThan(rows.length);
    for (const row of rows) expect(row.editTargets).toHaveLength(2);
  });
});
