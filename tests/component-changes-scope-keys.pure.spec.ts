// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// changesScopeKeys is the one set behind the Changes chip and the Changes scope: the Unreleased
// fields (by stage key), each once. Staged edits are not in it; they show in the footer. unreleasedKeysOf reads the
// Unreleased fields only in a Unit with a Target and changes since its last release.
import { expect, test } from '@playwright/test';

import type { FieldDiff, MergedUnit } from '../src/pages/x/apps/componentTypes';
import { changesScopeKeys } from '../src/pages/x/apps/entryBuilders';
import type { AtomOrigin } from '../src/pages/x/apps/spec-sheet/sheetOrigin';
import { unreleasedKeysOf } from '../src/pages/x/apps/spec-sheet/unreleasedKeys';

const unit = (targetId: string, diffs = 1) =>
  ({ targetId, applyEntry: { fieldDiffs: Array.from({ length: diffs }, () => ({ path: 'x' }) as FieldDiff) } }) as unknown as Pick<
    MergedUnit,
    'applyEntry' | 'targetId'
  >;
const origins = (unreleased: string[], other: string[] = []) =>
  new Map<string, AtomOrigin>([
    ...unreleased.map((k) => [k, { unreleased: true } as AtomOrigin] as const),
    ...other.map((k) => [k, { unreleased: false } as AtomOrigin] as const),
  ]);

test('the Changes set is the Unreleased fields, each once', () => {
  expect([...changesScopeKeys(['spec.replicas', 'spec.image', 'spec.replicas'])].sort()).toEqual(['spec.image', 'spec.replicas']);
  expect(changesScopeKeys([]).size).toBe(0);
});

test('the Unreleased fields are the ones Blame marks, in a Unit with a Target and changes', () => {
  expect([...unreleasedKeysOf(unit('t'), origins(['a'], ['b']))]).toEqual(['a']);
  expect(unreleasedKeysOf(unit(''), origins(['a'])).size).toBe(0);
  expect(unreleasedKeysOf(unit('t', 0), origins(['a'])).size).toBe(0);
});
