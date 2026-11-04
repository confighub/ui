// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * THE REVISIONS A CHANGEORDER'S TAGS MARK: ONE INDEXED CLAUSE PER TAG, EVERY PAGE, EACH ONCE.
 *
 * `Tags.*.TagID IN (...)` is tested by the server after it reads a page of the organization's
 * Revisions, so its first page can be short, or empty, with a continue token. A read that took
 * that page as the whole answer found no source Units ("Could not read the image changes") and
 * called changed Units unchanged. No page, no browser.
 */
import { expect, test } from '@playwright/test';

import {
  CONTINUE_HEADER,
  type ChunkBaseQuery,
  fetchAllPages,
} from '../src/hooks/chunkedQueriesApi';
import {
  taggedRevisionWheres,
  uniqueRevisions,
} from '../src/pages/x/apps/change-order/taggedRevisionReads';

const START = '4d9494de-7728-4750-a1e9-fcd854f5c18d';
const END = 'c52b0b3d-5d26-4ee8-8edb-2867a4e0bb3e';

test.describe('one indexed clause per Tag', () => {
  test('outside the scope: the source Units', () => {
    expect(taggedRevisionWheres(START, END, { notIn: ['s2', 's1'] })).toEqual([
      `Tags ? '${START}' AND SpaceID NOT IN ('s1', 's2')`,
      `Tags ? '${END}' AND SpaceID NOT IN ('s1', 's2')`,
    ]);
  });

  test('inside the Spaces a review reads', () => {
    expect(taggedRevisionWheres(START, END, { in: ['s1'] })).toEqual([
      `Tags ? '${START}' AND SpaceID IN ('s1')`,
      `Tags ? '${END}' AND SpaceID IN ('s1')`,
    ]);
  });

  test('no Space named: nothing to read; no scope: every Space; a Tag not known yet: no read', () => {
    expect(taggedRevisionWheres(START, END, { in: [] })).toBeUndefined();
    expect(taggedRevisionWheres(START, END, { notIn: [] })).toEqual([
      `Tags ? '${START}'`,
      `Tags ? '${END}'`,
    ]);
    expect(taggedRevisionWheres(undefined, END)).toBeUndefined();
    expect(taggedRevisionWheres(START, undefined)).toBeUndefined();
  });

  test('never the form the server tests after a page', () => {
    for (const where of taggedRevisionWheres(START, END, { notIn: ['s1'] }) ?? [])
      expect(where).not.toContain('Tags.*');
  });
});

test('a Revision both Tags mark is read twice and kept once; rows keep their order', () => {
  const row = (id: string) => ({ Revision: { RevisionID: id } });
  // configmap revision 2 carries both Tags, so both clauses return it.
  const merged = uniqueRevisions([row('r1'), row('cm2'), row('r3'), row('cm2'), row('r4')]);
  expect(merged.map((r) => r.Revision.RevisionID)).toEqual(['r1', 'cm2', 'r3', 'r4']);
});

test.describe('the continue token, not the row count, says a read is done', () => {
  /** A list whose pages are given in order: each page but the last carries a continue token. */
  const pagedServer = (pages: string[][]) => {
    const asked: (string | undefined)[] = [];
    const baseQuery: ChunkBaseQuery = async (args) => {
      const params = (typeof args === 'string' ? {} : (args.params ?? {})) as Record<
        string,
        unknown
      >;
      const token = params.continue as string | undefined;
      asked.push(token);
      const index = token === undefined ? 0 : Number(token);
      const next = index + 1 < pages.length ? String(index + 1) : undefined;
      const headers = new Headers(next === undefined ? {} : { [CONTINUE_HEADER]: next });
      return {
        data: pages[index],
        meta: {
          request: new Request('http://x/api/revision'),
          response: new Response(null, { headers }),
        },
      };
    };
    return { baseQuery, asked };
  };

  test('a short first page with a token is followed to the last page', async () => {
    // The server's first page of 1000 Revisions held only one match; the rest are later.
    const { baseQuery, asked } = pagedServer([['a'], [], ['b', 'c']]);
    const result = await fetchAllPages<string>(
      { url: '/revision', params: { where: `Tags ? '${END}'` } },
      baseQuery,
    );
    expect('data' in result ? result.data : result).toEqual(['a', 'b', 'c']);
    expect(asked).toEqual([undefined, '1', '2']);
  });

  test('a page cut short by maxPages is said to be truncated, never complete', async () => {
    const { baseQuery } = pagedServer([['a'], ['b']]);
    const result = await fetchAllPages<string>({ url: '/revision', params: {} }, baseQuery, {
      maxPages: 1,
    });
    expect(result).toEqual({ data: ['a'], truncated: true });
  });
});
