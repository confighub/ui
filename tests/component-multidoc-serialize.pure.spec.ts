// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A write to one document of a multi-document YAML Unit (`setValueAtPath`,
// `deleteValueAtPath`, `applyConfigWrites` in configParser.ts) re-serialises the stream.
// Each document's `---` marker belongs to that document's own text, so the stream must
// come back with exactly one separator between documents whichever document the write
// changed: a second marker is an extra, empty document in the Unit. The documents the
// write did not change, and a write that changes nothing, keep their text byte for byte.
//
// Takes no `page` fixture and starts no browser:
//   cd ui && npx playwright test -c playwright.pure.config.ts component-multidoc-serialize

import { expect, test } from '@playwright/test';
import { parseAllDocuments } from 'yaml';

import { applyConfigWrites, deleteValueAtPath, setValueAtPath } from '../src/pages/x/apps/configParser';

const CM = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cm\ndata:\n  color: blue\n';
const SVC = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: svc\nspec:\n  port: 80\n';
const DEP = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: dep\nspec:\n  env:\n    - name: A\n    - name: B\n';

const BARE = `${CM}---\n${SVC}---\n${DEP}`;
const LEADING = `---\n${BARE}`;

function written(r: ReturnType<typeof setValueAtPath>): string {
  expect(r.ok).toBe(true);
  return (r as { data: string }).data;
}

function kinds(data: string): unknown[] {
  return parseAllDocuments(data).map((d) => (d.toJSON() as { kind?: string } | null)?.kind ?? null);
}

function separators(data: string): number {
  return data.split('\n').filter((l) => l === '---').length;
}

for (const [label, input] of [['without a leading ---', BARE], ['with a leading ---', LEADING]] as const) {
  test.describe(`a write to one document, ${label}`, () => {
    const leading = input.startsWith('---');

    test('to the first document writes one separator between documents', () => {
      const out = written(deleteValueAtPath(input, 'data.color'));
      expect(kinds(out)).toEqual(['ConfigMap', 'Service', 'Deployment']);
      expect(separators(out)).toBe(separators(input));
      expect(out.startsWith('---\n')).toBe(leading);
      expect(out.endsWith(`---\n${SVC}---\n${DEP}`)).toBe(true);
    });

    test('to a middle document writes one separator between documents', () => {
      const out = written(setValueAtPath(input, 'spec.port', '8080'));
      expect(kinds(out)).toEqual(['ConfigMap', 'Service', 'Deployment']);
      expect(separators(out)).toBe(separators(input));
      expect(out.startsWith(`${leading ? '---\n' : ''}${CM}---\n`)).toBe(true);
      expect(out.endsWith(`---\n${DEP}`)).toBe(true);
      expect(out).toContain('port: 8080');
    });

    test('to the last document writes one separator between documents', () => {
      const out = written(setValueAtPath(input, 'spec.env.0.value', 'x'));
      expect(kinds(out)).toEqual(['ConfigMap', 'Service', 'Deployment']);
      expect(separators(out)).toBe(separators(input));
      expect(out.startsWith(`${leading ? '---\n' : ''}${CM}---\n${SVC}---\n`)).toBe(true);
    });

    test('an inserted list element writes one separator between documents', () => {
      const r = applyConfigWrites(input, [{
        path: 'spec.env.2.name',
        kind: 'set',
        value: 'C',
        insertion: { arrayPath: 'spec.env', index: 2, after: 0, order: 0 },
      }]);
      expect(r.failedPaths).toEqual([]);
      expect(kinds(r.data)).toEqual(['ConfigMap', 'Service', 'Deployment']);
      expect(separators(r.data)).toBe(separators(input));
      const dep = parseAllDocuments(r.data)[2].toJSON() as { spec: { env: { name: string }[] } };
      expect(dep.spec.env.map((e) => e.name)).toEqual(['A', 'C', 'B']);
    });

    test('a write that changes nothing gives back the Unit byte for byte', () => {
      expect(written(setValueAtPath(input, 'data.color', 'blue'))).toBe(input);
      expect(written(setValueAtPath(input, 'spec.port', '80'))).toBe(input);
      expect(written(deleteValueAtPath(input, 'data.absent'))).toBe(input);
    });
  });
}

test.describe('the text around the documents', () => {
  const COMMENTED = [
    '# stream head',
    '---',
    '# about the ConfigMap',
    'kind: ConfigMap # inline',
    'metadata:',
    '  name: cm',
    'data:',
    '  color: blue',
    '# after the ConfigMap',
    '---   # the Service',
    '# about the Service',
    'kind: Service',
    'metadata:',
    '  name: svc',
    'spec:',
    '  port: 80',
    '...',
    '%YAML 1.2',
    '---',
    'kind: Deployment',
    'metadata:',
    '  name: dep',
    '',
  ].join('\n');

  test('a sibling of the changed document keeps its comments, markers and directives', () => {
    const out = written(setValueAtPath(COMMENTED, 'spec.port', '8080'));
    expect(out.startsWith(COMMENTED.slice(0, COMMENTED.indexOf('---   # the Service')))).toBe(true);
    expect(out.endsWith('...\n%YAML 1.2\n---\nkind: Deployment\nmetadata:\n  name: dep\n')).toBe(true);
    expect(kinds(out)).toEqual(['ConfigMap', 'Service', 'Deployment']);
  });

  test('the changed document keeps its marker, the comments above its body and its end marker', () => {
    const out = written(setValueAtPath(COMMENTED, 'spec.port', '8080'));
    expect(out).toContain('---   # the Service\n# about the Service\nkind: Service\n');
    expect(out).toContain('port: 8080\n...\n%YAML 1.2\n');
  });

  test('a write to the first document keeps the stream head and the trailing comment', () => {
    const out = written(setValueAtPath(COMMENTED, 'data.color', 'red'));
    expect(out.startsWith('# stream head\n---\n# about the ConfigMap\n')).toBe(true);
    expect(out).toContain('color: red\n# after the ConfigMap\n---   # the Service\n');
    expect(separators(out)).toBe(separators(COMMENTED));
  });

  test('a write that changes nothing gives back the commented Unit byte for byte', () => {
    expect(written(setValueAtPath(COMMENTED, 'spec.port', '80'))).toBe(COMMENTED);
    expect(written(deleteValueAtPath(COMMENTED, 'spec.absent'))).toBe(COMMENTED);
  });
});
