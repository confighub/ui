// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Review comments on a ChangeOrder's diffs, without a page: comments as threads by where they are
// anchored, Outdated, and the Markdown a comment is written in.
import type { ReviewCommentRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { markdownBlocks } from '../src/pages/change-orders/review-comments/reviewMarkdownBlocks';
import { anchorKey, isOutdated, threadsByAnchor, threadsOf } from '../src/pages/change-orders/review-comments/reviewThreads';

const comment = (id: string, overrides: Partial<ReviewCommentRead> = {}): ReviewCommentRead => ({
  ReviewCommentID: id,
  UnitID: 'u-dev-api',
  SpaceID: 's-dev',
  UnitSlug: 'api',
  RevisionNum: 2,
  Text: id,
  UserID: 'user-1',
  CreatedAt: `2026-10-20T10:00:0${id.length % 10}Z`,
  UpdatedAt: `2026-10-20T10:00:0${id.length % 10}Z`,
  ChangeOrderID: 'co-1',
  ...overrides,
});

test.describe('threads', () => {
  test('gather replies under the comment they answer, oldest first, and take its anchor', () => {
    const threads = threadsOf([
      comment('reply-later', { ReplyToID: 'root', CreatedAt: '2026-10-20T10:05:00Z', Resource: undefined, Path: undefined }),
      comment('root', { Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'payments/api' }, Path: 'spec.replicas', CreatedAt: '2026-10-20T10:00:00Z' }),
      comment('reply', { ReplyToID: 'root', CreatedAt: '2026-10-20T10:01:00Z' }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].comments.map((c) => c.id)).toEqual(['root', 'reply', 'reply-later']);
    expect(threads[0].anchor).toEqual({ unitId: 'u-dev-api', resourceType: 'apps/v1/Deployment', resourceName: 'payments/api', path: 'spec.replicas' });
  });

  test('keep a reply whose first comment is gone as a thread of its own, on its Unit', () => {
    const threads = threadsOf([comment('orphan', { ReplyToID: 'deleted' })]);
    expect(threads).toHaveLength(1);
    expect(threads[0].anchor).toEqual({ unitId: 'u-dev-api' });
  });

  test('share a key per row: the same Unit, resource and path', () => {
    const threads = threadsOf([
      comment('a', { Path: 'spec.replicas', Resource: { ResourceType: 'T', ResourceName: 'n' } }),
      comment('b', { Path: 'spec.replicas', Resource: { ResourceType: 'T', ResourceName: 'n' } }),
      comment('c', { Path: 'spec.replicas', Resource: { ResourceType: 'T', ResourceName: 'other' } }),
    ]);
    const byAnchor = threadsByAnchor(threads);
    expect(byAnchor.get(anchorKey({ unitId: 'u-dev-api', resourceType: 'T', resourceName: 'n', path: 'spec.replicas' }))?.map((t) => t.id)).toEqual(['a', 'b']);
    expect(byAnchor.size).toBe(2);
  });

  test('mark a comment edited only when it changed after it was posted', () => {
    const [thread] = threadsOf([comment('x', { CreatedAt: '2026-10-20T10:00:00Z', UpdatedAt: '2026-10-20T10:09:00Z' })]);
    expect(thread.comments[0].edited).toBe(true);
    const [fresh] = threadsOf([comment('y', { CreatedAt: '2026-10-20T10:00:00Z', UpdatedAt: '2026-10-20T10:00:01Z' })]);
    expect(fresh.comments[0].edited).toBe(false);
  });

  test('are Outdated when the diff is read at another Revision, and claim nothing when it is not known', () => {
    const [thread] = threadsOf([comment('x', { RevisionNum: 2 })]);
    expect(isOutdated(thread, 2)).toBe(false);
    expect(isOutdated(thread, 3)).toBe(true);
    expect(isOutdated(thread, undefined)).toBe(false);
  });
});

test.describe('the Markdown of a comment', () => {
  test('splits into paragraphs, fenced code, quotes, lists and headings', () => {
    const blocks = markdownBlocks(['## Why', 'Line one', 'line two', '', '```yaml', 'replicas: 4', '```', '> quoted', '- a', '- b', '1. first'].join('\n'));
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'code', 'quote', 'list', 'list']);
    expect(blocks[1]).toEqual({ kind: 'paragraph', lines: ['Line one', 'line two'] });
    expect(blocks[2]).toEqual({ kind: 'code', lang: 'yaml', text: 'replicas: 4' });
    expect(blocks[5]).toEqual({ kind: 'list', ordered: true, items: ['first'] });
  });

  test('keeps an unclosed fence to the end, rather than lose the text', () => {
    expect(markdownBlocks('```\nkubectl get pods')).toEqual([{ kind: 'code', lang: '', text: 'kubectl get pods' }]);
  });
});
