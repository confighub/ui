// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// One canonical query arg per endpoint (ARCHITECTURE.md §7.1, §13 Q1b): two callers that ask for
// the same answer must share one RTK Query cache entry, so `false` is never sent where
// `undefined` means the same thing.
import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';
import { expect, test } from '@playwright/test';

import { blameArg, pathArg } from '../src/components/field-diagnosis/fieldArgs';

const key = (endpointName: string, queryArgs: unknown) =>
  defaultSerializeQueryArgs({ endpointName, queryArgs, endpointDefinition: {} as never });

const ADDRESS = {
  spaceId: 'space-1',
  unitId: 'unit-1',
  ref: '7253c88',
  path: 'spec.replicas',
  resourceName: 'test-ns/web',
};

test.describe('blameArg', () => {
  test('has exactly the space and the unit', () => {
    expect(Object.keys(blameArg('space-1', 'unit-1')).sort()).toEqual(['spaceId', 'unitId']);
  });

  test("the Blame tab's unfiltered arg shares its cache entry", () => {
    // BlameTable sends `flags: undefined` and `includeComments: includeComments || undefined`.
    const includeComments = false;
    const blameTableArg = {
      spaceId: 'space-1',
      unitId: 'unit-1',
      flags: undefined,
      includeComments: includeComments || undefined,
    };
    expect(key('getUnitBlame', blameTableArg)).toBe(key('getUnitBlame', blameArg('space-1', 'unit-1')));
  });
});

test.describe('pathArg', () => {
  test('history false and history left out share one cache entry', () => {
    expect(key('getUnitPath', pathArg(ADDRESS, { history: false }))).toBe(key('getUnitPath', pathArg(ADDRESS)));
  });

  test('history true is a different entry', () => {
    expect(key('getUnitPath', pathArg(ADDRESS, { history: true }))).not.toBe(key('getUnitPath', pathArg(ADDRESS)));
  });

  test('the Ref names the field when there is one', () => {
    expect(pathArg(ADDRESS).field).toBe('7253c88');
  });

  test('the path names the field when there is no Ref', () => {
    expect(pathArg({ ...ADDRESS, ref: undefined }).field).toBe('spec.replicas');
  });

  test('an empty resource name is left out, not sent as ""', () => {
    expect(key('getUnitPath', pathArg({ ...ADDRESS, resourceName: '' }))).toBe(
      key('getUnitPath', pathArg({ ...ADDRESS, resourceName: undefined })),
    );
  });

  test('carries the space, the unit and the resource', () => {
    expect(pathArg(ADDRESS)).toEqual({
      spaceId: 'space-1',
      unitId: 'unit-1',
      field: '7253c88',
      resource: 'test-ns/web',
      history: undefined,
    });
  });
});
