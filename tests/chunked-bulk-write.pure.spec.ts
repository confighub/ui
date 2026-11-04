// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import { runChunkedBulkWrite } from '../src/hooks/chunkedBulkWrite';
import { DEFAULT_MAX_ENCODED_WHERE } from '../src/hooks/inClauseChunks';

// An organization's every Trigger, as a select-all on the Triggers page sends it: one IN clause
// over these is about 20,000 characters, past the server's 8,192-character query string.
const ids = Array.from({ length: 513 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

const idsOf = (where: string) => [...where.matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('a selection too long for one query is sent in chunks the server accepts, each id once', async () => {
  const wheres: string[] = [];
  const failures = await runChunkedBulkWrite(
    'TriggerID',
    ids,
    async (where) => {
      wheres.push(where);
      return idsOf(where).map(() => ({}));
    },
    String,
  );
  expect(failures).toEqual([]);
  expect(wheres.length).toBeGreaterThan(1);
  for (const where of wheres) {
    expect(where.startsWith('TriggerID IN (')).toBe(true);
    expect(encodeURIComponent(where).length).toBeLessThanOrEqual(DEFAULT_MAX_ENCODED_WHERE);
  }
  expect(wheres.flatMap(idsOf)).toEqual(ids);
});

test('what failed is reported: refused entities and failed requests, and a failed request does not stop the rest', async () => {
  let request = 0;
  const sent: string[] = [];
  const failures = await runChunkedBulkWrite(
    'TriggerID',
    ids,
    async (where) => {
      request += 1;
      sent.push(...idsOf(where));
      if (request === 1) throw new Error('HTTP 500');
      return idsOf(where).map((id) => (id === ids[ids.length - 1] ? { Error: { Message: `cannot delete ${id}` } } : {}));
    },
    (error) => `request failed: ${(error as Error).message}`,
  );
  expect(sent).toEqual(ids);
  expect(failures).toEqual(['request failed: HTTP 500', `cannot delete ${ids[ids.length - 1]}`]);
});

test('an empty selection sends nothing', async () => {
  let sends = 0;
  const failures = await runChunkedBulkWrite('TriggerID', [], async () => {
    sends += 1;
    return [];
  }, String);
  expect(failures).toEqual([]);
  expect(sends).toBe(0);
});
