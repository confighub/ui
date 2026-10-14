// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A fan-out ChangeOrder's source diff is narrowed to the paths its TransformPaths Links read,
// and only when that is all they read.
import { expect, test } from '@playwright/test';

import { diffsUnderPaths, linkedSourcePaths } from '../src/pages/x/apps/change-order/linkedSourcePaths';

const tagPath = { Name: 'tag', Path: 'streams.stable.tag' };

test('Links that read only paths narrow to those paths, deduplicated', () => {
  expect(
    linkedSourcePaths([
      { UpstreamPaths: [tagPath] },
      { UpstreamPaths: [tagPath, { Name: 'digest', Path: 'streams.stable.digest' }] },
    ]),
  ).toEqual(['streams.stable.digest', 'streams.stable.tag']);
});

test('a getter, a Link without paths, or no Links at all leaves the whole diff', () => {
  const getter = { Name: 'x', FunctionInvocation: { FunctionName: 'get-placeholders' } };
  expect(linkedSourcePaths([{ UpstreamPaths: [tagPath] }, { UpstreamPaths: [tagPath], UpstreamGetters: [getter] }])).toBeUndefined();
  expect(linkedSourcePaths([{ UpstreamPaths: [tagPath] }, { UpstreamPaths: [] }])).toBeUndefined();
  expect(linkedSourcePaths([])).toBeUndefined();
});

test('a path the flattened diff cannot name leaves the whole diff', () => {
  for (const path of ['spec.containers.*.image', 'spec.containers.?name=web.image', 'metadata.annotations.a~1b']) {
    expect(linkedSourcePaths([{ UpstreamPaths: [{ Name: 'p', Path: path }] }])).toBeUndefined();
  }
});

test('the diff keeps the paths read and what is under them', () => {
  const diffs = [
    { path: 'streams.stable.tag' },
    { path: 'streams.stable.digest' },
    { path: 'streams.newest.tag' },
    { path: 'streams.stable.tagged' },
    { path: 'observedAt' },
  ];
  expect(diffsUnderPaths(diffs, ['streams.stable.tag']).map((d) => d.path)).toEqual(['streams.stable.tag']);
  expect(diffsUnderPaths(diffs, ['streams.stable']).map((d) => d.path)).toEqual([
    'streams.stable.tag',
    'streams.stable.digest',
    'streams.stable.tagged',
  ]);
  expect(diffsUnderPaths(diffs, undefined)).toBe(diffs);
});
