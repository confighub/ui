// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Releasing a ChangeSet, and the validation a Release needs: reading the dry run of a publish
// in one Space, the line beside Release, and which Revision of each Unit a Release of a
// ChangeOrder would bundle and whether it has ValidationErrors.
import { expect, test } from '@playwright/test';

import {
  bundledRevisions,
  validationGateHref,
  validationOf,
  validationSpaceHref,
  validationSummaryText,
  validationUnitHref,
} from '../src/pages/change-orders/releaseValidation';
import {
  type ChangeSetRelease,
  releasableSpaces,
  releaseGroups,
  releaseStatusOfAnswer,
  releaseSummaryText,
} from '../src/pages/change-sets/changeSetRelease';

test('a dry run that would publish is ready', () => {
  expect(releaseStatusOfAnswer({ status: 200, body: { Release: { ReleaseNum: 4 } } })).toEqual(
    { kind: 'ready' },
  );
});

test('a dry run whose bundle its latest Release already has is unchanged', () => {
  expect(
    releaseStatusOfAnswer({
      status: 200,
      body: { Release: { ReleaseNum: 3 }, Message: 'release 3 already bundles this' },
    }),
  ).toEqual({ kind: 'unchanged', releaseNum: 3 });
});

test('a refusal says why, naming the Unit and the items', () => {
  const status = releaseStatusOfAnswer({
    status: 422,
    body: {
      Message: 'legacy text',
      Error: {
        Message: 'outstanding ValidationErrors',
        ErrorMetadata: {
          EntityType: 'Unit',
          EntitySlug: 'web',
          Items: [{ Item: 'Validation Errors', Description: 'no-latest' }],
        },
      },
    },
  });
  expect(status).toEqual({
    kind: 'refused',
    message:
      'Unit web: outstanding ValidationErrors (Validation Errors: no-latest)',
  });
});

test('a refusal without an error body falls back to its message', () => {
  expect(
    releaseStatusOfAnswer({
      status: 400,
      body: { message: 'component c requires a ChangeWorkflow' },
    }),
  ).toEqual({
    kind: 'refused',
    message: 'component c requires a ChangeWorkflow',
  });
});

test('a 403 is no permission and no answer is unknown', () => {
  expect(releaseStatusOfAnswer({ status: 403, body: { message: 'forbidden' } })).toEqual({
    kind: 'noPermission',
  });
  expect(releaseStatusOfAnswer({ status: 0, body: { message: 'Failed to fetch' } })).toEqual({
    kind: 'unknown',
    message: 'Failed to fetch',
  });
});

const space = (
  spaceSlug: string,
  status: ChangeSetRelease extends { spaces: (infer S)[] } ? S['status'] : never,
) => ({
  spaceId: `${spaceSlug}-id`,
  spaceSlug,
  status,
});

test('the line beside Release', () => {
  expect(releaseSummaryText({ status: 'none' })).toBeUndefined();
  // A failed read is not "checking": it never answers.
  expect(releaseSummaryText({ status: 'failed' })).toBe(
    'Whether it can be released could not be checked.',
  );
  expect(
    releaseSummaryText({ status: 'open', spaces: [space('dev', { kind: 'checking' })] }),
  ).toBe('Close it to release it.');
  const mixed: ChangeSetRelease = {
    status: 'closed',
    spaces: [
      space('dev', { kind: 'ready' }),
      space('prod', { kind: 'refused', message: 'no' }),
    ],
  };
  expect(releaseSummaryText(mixed)).toBe('1 Space cannot be released yet.');
  expect(releasableSpaces(mixed).map((s) => s.spaceSlug)).toEqual(['dev']);
  expect(
    releaseSummaryText({
      status: 'closed',
      spaces: [space('dev', { kind: 'ready' }), space('qa', { kind: 'ready' })],
    }),
  ).toBe('Ready to release in 2 Spaces.');
  expect(
    releaseSummaryText({
      status: 'closed',
      spaces: [
        space('dev', { kind: 'released', releaseNum: 2 }),
        space('qa', { kind: 'unchanged' }),
      ],
    }),
  ).toBe('Released in 2 Spaces.');
  expect(
    releaseSummaryText({ status: 'closed', spaces: [space('dev', { kind: 'noPermission' })] }),
  ).toBe('You may not release it.');
  // An open ChangeSet releases nowhere yet.
  expect(
    releasableSpaces({ status: 'open', spaces: [space('dev', { kind: 'ready' })] }),
  ).toEqual([]);
});

test("a ChangeOrder's Release bundles the release Tag's mark, else the end Tag's, at the highest Revision", () => {
  const rows = [
    {
      unitId: 'a',
      slug: 'web',
      spaceId: 's',
      spaceSlug: 'prod',
      revisionNum: 3,
      tags: ['end'],
      gates: ['old'],
      triggerIdByGate: {},
    },
    {
      unitId: 'a',
      slug: 'web',
      spaceId: 's',
      spaceSlug: 'prod',
      revisionNum: 5,
      tags: ['release'],
      gates: [],
      triggerIdByGate: {},
    },
    {
      unitId: 'b',
      slug: 'api',
      spaceId: 's',
      spaceSlug: 'prod',
      revisionNum: 2,
      tags: ['end'],
      gates: [],
      triggerIdByGate: {},
    },
    {
      unitId: 'b',
      slug: 'api',
      spaceId: 's',
      spaceSlug: 'prod',
      revisionNum: 4,
      tags: ['end'],
      gates: ['g1'],
      triggerIdByGate: { g1: 't1' },
    },
    {
      unitId: 'c',
      slug: 'db',
      spaceId: 's',
      spaceSlug: 'prod',
      revisionNum: 9,
      tags: ['other'],
      gates: ['g2'],
      triggerIdByGate: {},
    },
  ];
  const bundled = bundledRevisions(rows, 'release', 'end');
  expect(bundled.map((r) => [r.unitId, r.revisionNum]).sort()).toEqual([
    ['a', 5],
    ['b', 4],
  ]);
  const validation = validationOf(bundled);
  expect(validation).toEqual({
    status: 'read',
    unitCount: 2,
    failures: [
      {
        unitId: 'b',
        slug: 'api',
        spaceId: 's',
        spaceSlug: 'prod',
        gates: ['g1'],
        triggerIdByGate: { g1: 't1' },
      },
    ],
  });
  expect(validationSummaryText(validation)).toBe('1 Unit with ValidationErrors.');
  expect(validationSummaryText(validationOf([]))).toBe('No Unit to validate yet.');
});

test('a failure links to the Unit, the Space and the Trigger, where it is read and fixed', () => {
  const failure = {
    spaceId: 's1',
    unitId: 'u1',
    gates: ['sp/t/vet-cel'],
    triggerIdByGate: { 'sp/t/vet-cel': 't1' },
  };
  expect(validationUnitHref(failure)).toBe('/units/s1/u1?tab=0&gate=sp%2Ft%2Fvet-cel');
  // With several gates, the Overview lists them all rather than opening one.
  expect(validationUnitHref({ ...failure, gates: ['a', 'b'] })).toBe('/units/s1/u1?tab=0');
  expect(validationGateHref(failure, 'sp/t/vet-cel')).toBe('/validation/t1');
  expect(validationGateHref(failure, 'other')).toBeUndefined();
  expect(new URLSearchParams(validationSpaceHref('s1').split('?')[1]).get('filterWhere')).toBe(
    "SpaceID = 's1' AND LEN(ValidationErrors) > 0",
  );
});

test('the Release section names the refused Spaces and lists the rest by outcome', () => {
  const groups = releaseGroups([
    space('a', { kind: 'ready' }),
    space('b', { kind: 'released', releaseNum: 2 }),
    space('c', { kind: 'refused', message: 'no' }),
    space('d', { kind: 'unknown', message: 'Failed to fetch' }),
    space('e', { kind: 'unchanged' }),
    space('f', { kind: 'ready' }),
  ]);
  expect(groups.map((g) => [g.kind, g.spaces.map((s) => s.spaceSlug)])).toEqual([
    ['refused', ['c', 'd']],
    ['ready', ['a', 'f']],
    ['released', ['b', 'e']],
  ]);
});
