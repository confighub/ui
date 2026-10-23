// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import { sameInstant } from '../src/pages/x/view-explorer/queries/instant';

/** UpdatedAt from a write (nanoseconds) and from a read (microseconds, cut or rounded) are the same moment. */
test.describe('sameInstant', () => {
  test('a write’s nanoseconds equal the stored microseconds, cut or rounded', () => {
    expect(sameInstant('2026-10-21T10:00:00.123456789Z', '2026-10-21T10:00:00.123456Z')).toBe(true);
    expect(sameInstant('2026-10-21T10:00:00.123456789Z', '2026-10-21T10:00:00.123457Z')).toBe(true);
    expect(sameInstant('2026-10-21T10:00:00.9999996Z', '2026-10-21T10:00:01Z')).toBe(true);
    expect(sameInstant('2026-10-21T10:00:00.5Z', '2026-10-21T10:00:00.500000Z')).toBe(true);
  });

  test('a later change is a different moment', () => {
    expect(sameInstant('2026-10-21T10:00:00.123456Z', '2026-10-21T10:00:00.123460Z')).toBe(false);
    expect(sameInstant('2026-10-21T10:00:00Z', '2026-10-21T10:00:01Z')).toBe(false);
    expect(sameInstant('2026-10-21T10:00:00Z', '')).toBe(false);
  });
});
