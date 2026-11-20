// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The row card reads the whole-unit blame; the details read the path report. The same field must
// explain the same way from both (ARCHITECTURE §5 FieldFacts): only history and review come from
// the path report alone.
import type { UnitPathReport } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { factsFromBlame, factsFromPath } from '../src/components/field-diagnosis/adapters';
import { explainField } from '../src/components/field-diagnosis/explainField';
import type { ExplainContext } from '../src/components/field-diagnosis/fieldDiagnosis.types';
import { SEED, inherited, linkSet, override, prodWebField, requirement } from './fixtures/field-diagnosis/states';

const CTX: ExplainContext = {
  now: Date.parse('2026-11-19T14:00:00Z'),
  upstream: { spaceId: SEED.stagingSpaceId, unitId: SEED.stagingWebId, revisionNum: SEED.prodUpstreamRevisionNum },
};

const CASES: [string, () => UnitPathReport][] = [
  ['spec.replicas', override],
  ['metadata.labels.app', inherited],
  ['spec.template.spec.securityContext.runAsUser', requirement],
  ['metadata.namespace', linkSet],
];

for (const [path, report] of CASES) {
  test(`${path}: blame and path report explain alike`, () => {
    const fromBlame = explainField(factsFromBlame(prodWebField(path)), CTX);
    const fromPath = explainField(factsFromPath(report()), CTX);
    expect(fromBlame.value).toBe(fromPath.value);
    expect(fromBlame.setBy).toEqual(fromPath.setBy);
    expect(fromBlame.chain).toEqual(fromPath.chain);
    expect(fromBlame.needs).toEqual(fromPath.needs);
    expect(fromBlame.guards).toEqual(fromPath.guards);
  });
}

test('blame facts carry no history', () => {
  expect(factsFromBlame(prodWebField('spec.replicas')).history).toBeUndefined();
  expect(explainField(factsFromBlame(prodWebField('spec.replicas')), CTX).history).toEqual([]);
});

test('path facts keep the history the report holds', () => {
  const report = override();
  report.History = [{ Value: '5\n', Origin: { RevisionNum: 3 } }];
  expect(factsFromPath(report).history).toHaveLength(1);
});

test('an empty report gives an empty field, never a throw', () => {
  expect(explainField(factsFromPath({}), CTX).state).toBe('resource');
});
