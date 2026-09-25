// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { getInlineDiffPair, tokenizeForDiff } from '../src/pages/x/apps/inlineDiff';

/**
 * Unit coverage for the inline value diff.
 *
 * `inlineDiff` decides which characters of a changed value get highlighted, and
 * the release diff's image rows read a container image reference through it. An
 * image reference is the hardest value this function sees: it is long, it is
 * mostly shared between the two sides, and the part that moved is a few
 * characters buried in the middle of a registry/namespace/repository/tag string.
 * If the highlight lands on the wrong span, the row shows a change while hiding
 * WHICH change, which is the one thing a diff must not do.
 *
 * Runs as part of the normal suite (`npm run playwright:test`); needs no browser
 * or server, drives the pure diff functions directly.
 */

/** Render a side as text with the highlighted span wrapped in brackets. */
function boxed(segments: { text: string; changed: boolean }[]): string {
  return segments.map((s) => (s.changed ? `[${s.text}]` : s.text)).join('');
}

/**
 * A highlight splits a number when it covers a run of digits that has another
 * digit pressed against it in the full value — `v0.4.1[5]` claims the `1` is
 * shared and only the `5` moved, when what actually moved is 15 -> 16.
 *
 * Asserted as a property over the whole value rather than by comparing against
 * an expected string, so it holds for inputs this file never thought to list.
 */
function splitsANumber(segments: { text: string; changed: boolean }[]): boolean {
  const full = segments.map((s) => s.text).join('');
  let at = 0;
  for (const segment of segments) {
    if (segment.changed && /^\d+$/.test(segment.text)) {
      const before = full[at - 1] ?? '';
      const after = full[at + segment.text.length] ?? '';
      if (/\d/.test(before) || /\d/.test(after)) return true;
    }
    at += segment.text.length;
  }
  return false;
}

test.describe('inline value diff', () => {
  /**
   * The shapes a container tag actually takes in the wild. Each names what a
   * reader needs to see, because that is what the highlight has to land on.
   */
  const TAG_SHAPES: { name: string; before: string; after: string; expect: string }[] = [
    {
      name: 'a patch bump highlights the whole version segment',
      before: 'ghcr.io/confighubai/confighub:v0.4.15',
      after: 'ghcr.io/confighubai/confighub:v0.4.16',
      expect: 'ghcr.io/confighubai/confighub:v0.4.[16]',
    },
    {
      name: 'a multi-digit minor bump stays one span',
      before: 'otel/opentelemetry-collector-contrib:0.104.0',
      after: 'otel/opentelemetry-collector-contrib:0.112.0',
      expect: 'otel/opentelemetry-collector-contrib:0.[112].0',
    },
    {
      // Every component of the version moved, so the tag is one highlight
      // rather than three: a major bump is a single event, not three edits.
      name: 'a major bump highlights the tag as one span, not one per component',
      before: 'ghcr.io/confighubai/queue-proxy:v1.9.2',
      after: 'ghcr.io/confighubai/queue-proxy:v2.0.0',
      expect: 'ghcr.io/confighubai/queue-proxy:[v2.0.0]',
    },
    {
      name: 'a build counter highlights only the counter',
      before: 'app:1.4.2-build.77',
      after: 'app:1.4.2-build.78',
      expect: 'app:1.4.2-build.[78]',
    },
    {
      name: 'a calendar tag keeps the unchanged date prefix dim',
      before: 'ghcr.io/confighubai/docs-site:2026-09-13.1a4f',
      after: 'ghcr.io/confighubai/docs-site:2026-09-16.9c02',
      expect: 'ghcr.io/confighubai/docs-site:2026-09-[16.9c02]',
    },
    {
      name: 'a commit sha highlights the sha and keeps the branch prefix',
      before: 'app:main-41ce908',
      after: 'app:main-7f3ab2c',
      expect: 'app:main-[7f3ab2c]',
    },
    {
      // A digest move at an identical tag is the case the image row exists to
      // surface: nothing in the human-readable part changed.
      name: 'a digest-only move highlights the digest and nothing else',
      before: 'redis:7.4.1-alpine@sha256:4f2ad1c9e0b37a5c8d1e6f04b2c9a7e3',
      after: 'redis:7.4.1-alpine@sha256:9c81b4ef2d60a7139f5c2b8ae04d16b7',
      expect: 'redis:7.4.1-alpine@sha256:[9c81b4ef2d60a7139f5c2b8ae04d16b7]',
    },
    {
      // The tag is identical on both sides, so the registry is the only thing
      // that moved and the highlight has to find it at the far left.
      name: 'a registry move highlights the host, not the tag',
      before: 'ghcr.io/confighubai/envoy:v1.30.0',
      after: 'quay.io/confighubai/envoy:v1.30.0',
      expect: '[quay].io/confighubai/envoy:v1.30.0',
    },
  ];

  for (const shape of TAG_SHAPES) {
    test(shape.name, () => {
      const pair = getInlineDiffPair(shape.before, shape.after);
      expect(boxed(pair.new)).toBe(shape.expect);
      expect(pair.truncated).toBe(false);
    });
  }

  test('an unchanged value highlights nothing on either side', () => {
    const pair = getInlineDiffPair('app:v1.0.0', 'app:v1.0.0');
    expect(pair.old.some((s) => s.changed)).toBe(false);
    expect(pair.new.some((s) => s.changed)).toBe(false);
    expect(boxed(pair.new)).toBe('app:v1.0.0');
  });

  /**
   * The release pane shows an unmoved container alongside the ones that moved,
   * so an identical pair reaches this function on every render of that row. It
   * must produce no highlight at all rather than an empty one: an empty
   * highlight still carries its own padding and tint, so the row that exists to
   * say "this did not move" would paint two change marks on itself.
   */
  test('an unchanged value produces no empty highlight segment', () => {
    const pair = getInlineDiffPair('app:v2.3.1', 'app:v2.3.1');
    for (const side of [pair.old, pair.new]) {
      expect(side.filter((s) => s.text === '')).toHaveLength(0);
      expect(side.filter((s) => s.changed && s.text.length === 0)).toHaveLength(0);
    }
  });

  /**
   * The property that makes a half-number highlight unreachable, asserted over
   * every case above plus the adjacent-number pairs that are easiest to get
   * wrong. `v1.2.3` -> `v1.2.30` shares the leading `3` as characters but not as
   * a number, and `15` -> `16` shares the leading `1` the same way.
   */
  test('no highlight ever splits a number', () => {
    const pairs: [string, string][] = [
      ...TAG_SHAPES.map((s) => [s.before, s.after] as [string, string]),
      ['v1.2.3', 'v1.2.30'],
      ['1Gi', '2Gi'],
      ['256Mi', '512Mi'],
      ['8', '16'],
      ['replicas: 9', 'replicas: 10'],
      ['port 8080', 'port 8090'],
    ];
    for (const [before, after] of pairs) {
      const pair = getInlineDiffPair(before, after);
      expect(splitsANumber(pair.old), `old side of ${before} -> ${after}`).toBe(false);
      expect(splitsANumber(pair.new), `new side of ${before} -> ${after}`).toBe(false);
    }
  });

  /**
   * The structural reason the assertion above holds: the tokenizer emits maximal
   * alphanumeric runs, so a number is never offered to the aligner in pieces and
   * no alignment can select half of one. Asserted directly, because it is the
   * invariant the highlight rules depend on rather than an incidental property.
   */
  test('tokenizing keeps every alphanumeric run whole', () => {
    expect(tokenizeForDiff('v0.4.15')).toEqual(['v0', '.', '4', '.', '15']);
    expect(tokenizeForDiff('sha256:4f2ad1c')).toEqual(['sha256', ':', '4f2ad1c']);
    expect(tokenizeForDiff('ghcr.io/ns/repo:v1.2.3')).toEqual([
      'ghcr', '.', 'io', '/', 'ns', '/', 'repo', ':', 'v1', '.', '2', '.', '3',
    ]);
    // Reassembling the tokens must give the input back, or the aligner is
    // diffing something other than the value the reader sees.
    for (const value of ['2026-09-13.1a4f', 'redis:7.4.1-alpine@sha256:abc', '', 'x']) {
      expect(tokenizeForDiff(value).join('')).toBe(value);
    }
  });

  /**
   * Values above the length cap short-circuit to a whole-value swap flagged
   * `truncated`, which a renderer drawing a box per changed token must fall back
   * to flat text for. An image reference must never reach that path: the longest
   * realistic one carries a registry, a namespace, a repository, a tag and a
   * full digest and is still an order of magnitude below the cap.
   */
  test('a full-length image reference stays well inside the precise-diff path', () => {
    const longest =
      'registry.internal.example.com:5000/platform/team/service-with-a-long-name' +
      ':v1.2.3-rc.4-alpine@sha256:4f2ad1c9e0b37a5c8d1e6f04b2c9a7e34f2ad1c9e0b37a5c8d1e6f04b2c9a7e3';
    expect(longest.length).toBeLessThan(500);
    const pair = getInlineDiffPair(longest, longest.replace('v1.2.3', 'v1.2.4'));
    expect(pair.truncated).toBe(false);
    expect(splitsANumber(pair.new)).toBe(false);
  });
});
