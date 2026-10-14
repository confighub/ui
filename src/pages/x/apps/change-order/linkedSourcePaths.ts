// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which paths of a fan-out ChangeOrder's source Unit can reach the Spaces it is promoted into.
 *
 * A TransformPaths Link reads named paths from its upstream Unit (`UpstreamPaths`) and hands
 * only their values to the downstream Unit. When every Link taking from a source Unit reads
 * only paths, a change anywhere else in that Unit goes nowhere, and diffing all of it buries
 * the one value that moves: a registry fact Unit can change a digest and timestamps per image
 * stream on every push while the Links read one image tag.
 *
 * A getter (`UpstreamGetters`) runs a function over the whole Unit, so a Link with one can
 * carry any change, and the whole diff stays. So does a path this cannot place in the
 * flattened diff, such as a wildcard, an associative match or an escaped key: showing more
 * than the Links read is harmless, hiding what they read is not.
 */

import type { LinkRead } from '@confighub/rtk-query';

/** A path the flattened diff names the same way: dot-separated keys and array indices. */
const PLAIN_PATH = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

/**
 * The paths the Links read, sorted and deduplicated, or `undefined` when the whole Unit can
 * reach downstream: no Links to go by, a Link with a getter or without paths, or a path that
 * is not plain.
 */
export function linkedSourcePaths(
  links: readonly Pick<LinkRead, 'UpstreamPaths' | 'UpstreamGetters'>[],
): string[] | undefined {
  if (links.length === 0) return undefined;
  const paths = new Set<string>();
  for (const link of links) {
    if ((link.UpstreamGetters ?? []).length > 0) return undefined;
    const upstreamPaths = link.UpstreamPaths ?? [];
    if (upstreamPaths.length === 0) return undefined;
    for (const named of upstreamPaths) {
      const path = named.Path ?? '';
      if (!PLAIN_PATH.test(path)) return undefined;
      paths.add(path);
    }
  }
  return [...paths].sort();
}

/** The diffs at or under one of `paths`; all of them when `paths` is `undefined`. */
export function diffsUnderPaths<T extends { path: string }>(diffs: T[], paths: readonly string[] | undefined): T[] {
  if (paths === undefined) return diffs;
  return diffs.filter((diff) => paths.some((path) => diff.path === path || diff.path.startsWith(`${path}.`)));
}
