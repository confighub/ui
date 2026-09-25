// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The N-deployment compare model, exercised directly — no page, no browser, no
// fixtures, the same pure-derivation pattern as `rollout-outcome.pure.spec.ts`.
//
// WHY THESE ARE THE ASSERTIONS THAT MATTER. Every claim this grid makes is a
// claim about two values being the same value, and each of the four ways it can
// be wrong is silent:
//
//   - ALIGNMENT. Join on `containers.0.image` and a deployment carrying one
//     extra container puts its api beside another column's otel. The grid then
//     reports an image change that never happened, with total confidence and no
//     visible symptom. The `dev` fixture below carries `debug` FIRST for exactly
//     this reason: under positional alignment every container would shift and
//     every one would read as changed.
//   - ABSENCE vs EMPTINESS. `""` is a value somebody authored. "not set" is the
//     absence of one. The rest of the component view answers `isEmptyValue` true
//     for both, which is safe while describing one document and is not safe here.
//   - THE UNKNOWN COLUMN. A deployment that has not loaded must not read as one
//     that sets nothing.
//   - THE COLUMN ORDER. There is no reference column: a path is joined in
//     first-appearance order, left to right, never re-sorted around slot A.

import { expect, test } from '@playwright/test';

import {
  buildCompareResult,
  elideSharedPrefix,
  filterRows,
  formatLiteral,
  rowDiffers,
  type CompareColumnInput,
  type CompareLeafRow,
  type CompareResult,
} from '../src/pages/x/apps/compare/deploymentCompareModel';
import {
  POSITIONAL_MARKER,
  indexUnitByIdentity,
  splitIdentityPath,
} from '../src/pages/x/apps/compare/identityPaths';

/** prod-us1 — slot A. Containers in the order api, otel. */
const PROD_US1 = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
  labels:
    app: payments-api
  annotations:
    confighub.com/gate: manual
spec:
  replicas: 6
  template:
    spec:
      containers:
        - name: api
          image: ghcr.io/confighubai/api:v0.4.15
          ports:
            - containerPort: 8080
          env:
            - name: LOG_LEVEL
              value: info
            - name: FEATURE_FLAGS
              value: ""
        - name: otel
          image: ghcr.io/confighubai/otel:v1.9.2
`;

/**
 * dev — one EXTRA container, and it is first in the list, so every container
 * after it sits at a different index than it does on the other column.
 */
const DEV = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
  labels:
    app: payments-api
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: debug
          image: ghcr.io/confighubai/debug:v0.3.0
        - name: api
          image: ghcr.io/confighubai/api:v0.5.0-rc.2
          ports:
            - containerPort: 8080
          env:
            - name: LOG_LEVEL
              value: debug
        - name: otel
          image: ghcr.io/confighubai/otel:v1.9.2
`;

function column(overrides: Partial<CompareColumnInput> & { deploymentId: string }): CompareColumnInput {
  return { label: overrides.deploymentId, ...overrides };
}

const COLUMNS: CompareColumnInput[] = [
  column({ deploymentId: 'prod-us1', data: PROD_US1 }),
  column({ deploymentId: 'dev', data: DEV }),
];

function leaves(result: CompareResult): CompareLeafRow[] {
  return result.groups.flatMap((group) =>
    group.rows.filter((row): row is CompareLeafRow => row.type === 'leaf'),
  );
}

function leafAt(result: CompareResult, identityPath: string): CompareLeafRow {
  const row = leaves(result).find((leaf) => leaf.identityPath === identityPath);
  if (!row) {
    throw new Error(
      `no row at ${identityPath}; the grid holds: ${leaves(result)
        .map((leaf) => leaf.identityPath)
        .join(', ')}`,
    );
  }
  return row;
}

test.describe('identity keying', () => {
  test('list elements are named by identity, never by position', () => {
    const { documents } = indexUnitByIdentity(PROD_US1);
    const paths = [...(documents[0]?.valueByIdentityPath.keys() ?? [])];

    expect(paths).toContain('spec.template.spec.containers[api].image');
    expect(paths).toContain('spec.template.spec.containers[otel].image');
    expect(paths).toContain('spec.template.spec.containers[api].ports[8080].containerPort');
    expect(paths).toContain('spec.template.spec.containers[api].env[LOG_LEVEL].value');

    // No path may fall back to a bare index. `containers.0.image` is the exact
    // shape that makes this feature lie.
    expect(paths.filter((path) => /\.\d+(\.|$)/.test(path))).toEqual([]);
  });

  test('an identity token carrying a dot still splits back into one segment', () => {
    // A container called `my.sidecar` is one segment, not two. Tokens are the
    // part this module controls, so this is the part it must get right.
    const { documents } = indexUnitByIdentity(
      'spec:\n  containers:\n    - name: my.sidecar\n      image: nginx\n',
    );
    const paths = [...(documents[0]?.valueByIdentityPath.keys() ?? [])];
    expect(paths).toContain('spec.containers[my.sidecar].image');
    expect(splitIdentityPath('spec.containers[my.sidecar].image')).toEqual([
      'spec',
      'containers',
      '[my.sidecar]',
      'image',
    ]);
  });

  test('a dotted key under a free-form map is rejoined into one token', () => {
    // `annotations["confighub.com/gate"]` has already become two segments by the
    // time the parser hands it over. Flat, that only made the label coarser.
    // Nested, it manufactured an `annotations` › `confighub` folder the document
    // does not have, so the key is put back together for the maps known to hold
    // dotted keys.
    const { documents } = indexUnitByIdentity(PROD_US1);
    const paths = [...(documents[0]?.valueByIdentityPath.keys() ?? [])];
    expect(paths).toContain('metadata.annotations[confighub.com/gate]');
    expect(paths).not.toContain('metadata.annotations.confighub.com/gate');
  });

  test('an extra container does not shift the containers around it', () => {
    const result = buildCompareResult(COLUMNS);

    // otel holds the same image on both sides. Under positional alignment
    // column A's otel (index 1) would have been read against dev's api (index
    // 1) and this row would have reported a change.
    const otel = leafAt(result, 'spec.template.spec.containers[otel].image');
    expect(otel.cells[1]?.kind).toBe('same');

    // api differs on both columns — there is no reference column any more, so
    // both sides of a disagreement read as `differs`, not one `differs` and
    // one neutral.
    const api = leafAt(result, 'spec.template.spec.containers[api].image');
    expect(api.cells[0]?.kind).toBe('differs');
    expect(api.cells[1]?.kind).toBe('differs');
    expect(api.cells[1]?.literal).toBe('ghcr.io/confighubai/api:v0.5.0-rc.2');

    // The container only dev carries: absent on the column that lacks it,
    // differing (not neutral) on the column that sets it — set-vs-unset is
    // always a difference now.
    const debug = leafAt(result, 'spec.template.spec.containers[debug].image');
    expect(debug.cells[0]?.kind).toBe('absent');
    expect(debug.cells[1]?.kind).toBe('differs');
  });

  test('a scalar list is keyed by its own value, and by position only when it repeats', () => {
    const unique = indexUnitByIdentity('spec:\n  args:\n    - --verbose\n    - --dry-run\n');
    const uniquePaths = [...(unique.documents[0]?.valueByIdentityPath.keys() ?? [])];
    expect(uniquePaths).toContain('spec.args[--verbose]');
    expect(uniquePaths).toContain('spec.args[--dry-run]');

    // Two identical elements cannot be told apart by value. The path says so
    // rather than passing a position off as an identity.
    const repeated = indexUnitByIdentity('spec:\n  args:\n    - --v\n    - --v\n');
    const repeatedPaths = [...(repeated.documents[0]?.valueByIdentityPath.keys() ?? [])];
    expect(repeatedPaths).toContain(`spec.args[${POSITIONAL_MARKER}0]`);
    expect(repeatedPaths).toContain(`spec.args[${POSITIONAL_MARKER}1]`);
  });

  test('a positional fallback is reported to the caller, not hidden', () => {
    const result = buildCompareResult([
      column({ deploymentId: 'a', data: 'spec:\n  args:\n    - --v\n    - --v\n' }),
      column({ deploymentId: 'b', data: 'spec:\n  args:\n    - --v\n    - --v\n' }),
    ]);
    expect(result.hasPositionalRows).toBe(true);
    expect(leaves(result).every((leaf) => leaf.isPositional)).toBe(true);
  });
});

test.describe('cell states', () => {
  test('the answering states are distinguished, and absence keeps its two senses', () => {
    const result = buildCompareResult(COLUMNS);

    expect(leafAt(result, 'metadata.name').cells.map((cell) => cell.kind)).toEqual(['same', 'same']);
    expect(leafAt(result, 'spec.replicas').cells.map((cell) => cell.kind)).toEqual(['differs', 'differs']);

    // Absent where another column HAS a value: the reader is losing something.
    expect(leafAt(result, 'metadata.annotations[confighub.com/gate]').cells[1]?.kind).toBe('absent');
  });

  test('the empty string is a value, and is never printed as an absence', () => {
    const result = buildCompareResult(COLUMNS);
    const flags = leafAt(result, 'spec.template.spec.containers[api].env[FEATURE_FLAGS].value');

    const set = flags.cells[0];
    expect(set?.kind).toBe('differs');
    expect(set?.isEmptyString).toBe(true);
    expect(set?.literal).toBe('""');

    // dev does not carry the variable at all. That is a different fact from
    // carrying it and setting it to nothing, and the two must not collapse.
    const missing = flags.cells[1];
    expect(missing?.kind).toBe('absent');
    expect(missing?.isEmptyString).toBe(false);
    expect(missing?.literal).toBeUndefined();
  });

  test('quotes are spent only where the bare text would read as another type', () => {
    expect(formatLiteral('')).toBe('""');
    expect(formatLiteral('true')).toBe('"true"');
    expect(formatLiteral('1500m')).toBe('1500m');
    expect(formatLiteral('8080')).toBe('"8080"');
    expect(formatLiteral(8080)).toBe('8080');
    expect(formatLiteral(true)).toBe('true');
    expect(formatLiteral(null)).toBe('null');
  });

  test('a column that has not loaded says so instead of reading as unset', () => {
    const result = buildCompareResult([
      COLUMNS[0] as CompareColumnInput,
      column({ deploymentId: 'edge-ap1', unavailable: 'loading' }),
    ]);
    const replicas = leafAt(result, 'spec.replicas');
    expect(replicas.cells[1]?.kind).toBe('unknown');
    expect(replicas.cells[1]?.kind).not.toBe('absent');
  });

  test('a deployment holding no such unit is unknown, not empty', () => {
    const result = buildCompareResult([
      COLUMNS[0] as CompareColumnInput,
      column({ deploymentId: 'edge-ap1', unavailable: 'no-such-unit' }),
    ]);
    expect(leafAt(result, 'metadata.name').cells[1]?.kind).toBe('unknown');
  });
});

test.describe('what "differing" means with no reference column', () => {
  test('set vs unset counts as a difference, same as two different values', () => {
    const result = buildCompareResult(COLUMNS);
    const onlyOnDev = leafAt(result, 'spec.template.spec.containers[debug].image');
    expect(rowDiffers(onlyOnDev.cells)).toBe(true);

    const replicas = leafAt(result, 'spec.replicas');
    expect(rowDiffers(replicas.cells)).toBe(true);

    const name = leafAt(result, 'metadata.name');
    expect(rowDiffers(name.cells)).toBe(false);
  });

  test('two columns agreeing and a third disagreeing still differs, on every column', () => {
    const result = buildCompareResult([
      column({ deploymentId: 'a', data: 'spec:\n  replicas: 3\n' }),
      column({ deploymentId: 'b', data: 'spec:\n  replicas: 3\n' }),
      column({ deploymentId: 'c', data: 'spec:\n  replicas: 5\n' }),
    ]);
    const replicas = leafAt(result, 'spec.replicas');
    expect(replicas.cells.map((cell) => cell.kind)).toEqual(['differs', 'differs', 'differs']);
  });

  test('a column with no document for this row is not evidence either way', () => {
    const withConfigMap = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: shared\ndata:\n  tier: gold\n';
    const withoutConfigMap =
      'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payments-api\nspec:\n  replicas: 3\n';
    const result = buildCompareResult([
      column({ deploymentId: 'a', data: withConfigMap }),
      column({ deploymentId: 'b', data: withConfigMap }),
      column({ deploymentId: 'c', data: withoutConfigMap }),
    ]);
    const tier = leafAt(result, 'data.tier');
    expect(tier.cells[2]?.kind).toBe('no-document');
    expect(rowDiffers(tier.cells)).toBe(false);
  });

  test('filtering drops a folder row left with nothing under it', () => {
    const result = buildCompareResult(COLUMNS);
    const group = result.groups[0];
    expect(group).toBeDefined();

    const kept = filterRows(group?.rows ?? []);
    // Checked over the SUBTREE, not the immediate parent: now that the grid
    // nests, an intermediate folder is kept for a leaf several levels below it,
    // whose own `folderPath` names only the innermost folder.
    for (let i = 0; i < kept.length; i += 1) {
      const row = kept[i];
      if (!row || row.type !== 'folder') continue;
      const next = kept[i + 1];
      expect(
        next !== undefined && next.depth > row.depth,
        `${row.identityPath} survived with nothing under it`,
      ).toBe(true);
    }
    expect(kept.length).toBeLessThan((group?.rows ?? []).length);
  });
});

test.describe('column order — first appearance, left to right, not slot A', () => {
  test('a path only a later column carries lands after the earlier columns\' paths', () => {
    const result = buildCompareResult([
      column({ deploymentId: 'a', data: 'spec:\n  replicas: 3\n  timeout: 30\n' }),
      column({ deploymentId: 'b', data: 'spec:\n  replicas: 3\n  timeout: 30\n' }),
      column({ deploymentId: 'c', data: 'spec:\n  replicas: 3\n  timeout: 30\n  onlyOnC: yes\n' }),
    ]);
    const group = result.groups[0];
    const paths = (group?.rows ?? []).filter((row) => row.type === 'leaf').map((row) => row.identityPath);
    expect(paths.indexOf('spec.onlyOnC')).toBeGreaterThan(paths.indexOf('spec.timeout'));
  });

  test('positionalPath is drawn from the first column that actually holds the path', () => {
    const result = buildCompareResult([
      column({ deploymentId: 'a', data: 'spec:\n  replicas: 3\n' }),
      column({
        deploymentId: 'b',
        data: 'spec:\n  replicas: 3\n  containers:\n    - name: sidecar\n      image: nginx\n',
      }),
    ]);
    // `a` has no `containers` at all, so the row's canonical dot-index path
    // has to come from `b` — the only column that can resolve it.
    const leaf = leafAt(result, 'spec.containers[sidecar].image');
    expect(leaf.positionalPath).toBe('spec.containers.0.image');
  });
});

test.describe('common-prefix elision', () => {
  test('the shared head goes and the differing tail survives', () => {
    const prefix = elideSharedPrefix([
      'ghcr.io/confighubai/api:v0.4.15',
      'ghcr.io/confighubai/api:v0.5.0-rc.2',
    ]);
    expect(prefix).toBe('ghcr.io/confighubai/api:v0.');

    const result = buildCompareResult(COLUMNS);
    const api = leafAt(result, 'spec.template.spec.containers[api].image');
    expect(api.elidedPrefix).toBe('ghcr.io/confighubai/api:v0.');
    expect(api.cells[0]?.display).toBe('…4.15');
    expect(api.cells[1]?.display).toBe('…5.0-rc.2');
    // The whole value is kept, for the title and for copying.
    expect(api.cells[0]?.literal).toBe('ghcr.io/confighubai/api:v0.4.15');
  });

  test('short values are left alone — nothing on the row is at risk of truncating', () => {
    expect(elideSharedPrefix(['info', 'infra'])).toBe('');
    expect(elideSharedPrefix(['1Gi', '512Mi'])).toBe('');
  });

  test('a prefix is cut back to a token boundary, never mid-word', () => {
    const prefix = elideSharedPrefix([
      'registry.example.com/team/service-alpha',
      'registry.example.com/team/service-beta',
    ]);
    expect(prefix.endsWith('-')).toBe(true);
    expect(prefix).toBe('registry.example.com/team/service-');
  });
});

test.describe('documents', () => {
  test('two resources in one unit are compared separately, never merged', () => {
    const multi = `apiVersion: v1
kind: ConfigMap
metadata:
  name: payments-config
data:
  tier: gold
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
spec:
  replicas: 3
`;
    const other = multi.replace('tier: gold', 'tier: silver');
    const result = buildCompareResult([
      column({ deploymentId: 'a', data: multi }),
      column({ deploymentId: 'b', data: other }),
    ]);

    expect(result.groups).toHaveLength(2);
    const kinds = result.groups.map((group) => group.kind);
    expect(kinds).toContain('ConfigMap');
    expect(kinds).toContain('Deployment');

    // Both documents carry `metadata.name`. Joined across documents they would
    // read as a difference; joined within them they are two unanimous rows.
    const names = leaves(result).filter((leaf) => leaf.identityPath === 'metadata.name');
    expect(names).toHaveLength(2);
    for (const row of names) expect(rowDiffers(row.cells)).toBe(false);
  });
});
