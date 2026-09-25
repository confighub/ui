// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `rowImageChange` — the widest kind of move among a compare row's distinct
// image references, now that there is no reference column for a per-line
// classification to read against.

import { expect, test } from '@playwright/test';

import { parseImageRef, rowImageChange } from '../src/pages/x/apps/imageRef';

function ref(literal: string) {
  const parsed = parseImageRef(literal);
  if (!parsed) throw new Error(`could not parse ${literal}`);
  return parsed;
}

test.describe('rowImageChange', () => {
  test('fewer than two distinct references: nothing to compare', () => {
    expect(rowImageChange([])).toBeNull();
    expect(rowImageChange([ref('ghcr.io/x/api:v1.0.0')])).toBeNull();
    // Every column agrees — same reference repeated is still only ONE distinct one.
    expect(
      rowImageChange([ref('ghcr.io/x/api:v1.0.0'), ref('ghcr.io/x/api:v1.0.0'), ref('ghcr.io/x/api:v1.0.0')]),
    ).toBeNull();
  });

  test('picks the widest pairwise classification, not just the first pair', () => {
    // a↔b is a patch bump; a↔c is a registry move. The row as a whole must
    // report the registry move — the widest fact any pair carries — even
    // though it does not involve the first two columns.
    const a = ref('ghcr.io/x/api:v1.0.0');
    const b = ref('ghcr.io/x/api:v1.0.1');
    const c = ref('quay.io/x/api:v1.0.0');
    expect(rowImageChange([a, b, c])).toBe('repo');
  });

  test('ranks a major bump above a minor one among three distinct versions', () => {
    const a = ref('ghcr.io/x/api:v1.0.0');
    const b = ref('ghcr.io/x/api:v1.1.0');
    const c = ref('ghcr.io/x/api:v2.0.0');
    expect(rowImageChange([a, b, c])).toBe('major');
  });

  test('two distinct references at the same tag: a digest move', () => {
    const a = ref('ghcr.io/x/api:v1.0.0@sha256:aaa');
    const b = ref('ghcr.io/x/api:v1.0.0@sha256:bbb');
    expect(rowImageChange([a, b])).toBe('digest');
  });
});
