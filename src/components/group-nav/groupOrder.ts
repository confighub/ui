// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The bucket of a group tree for an item with no value for a level. Kept in
 * this React-free module so pure logic and specs can share it with
 * `GroupNavPanel` and the explorers' group panels.
 */
export const EMPTY_GROUP_VALUE = '(empty)';

/**
 * Sibling order of group nodes in every group tree: `localeCompare`, except
 * that the `EMPTY_GROUP_VALUE` node sorts after every other sibling. An item
 * with no value is the exception, so the real groups come first. Callers that
 * pick a "first node on screen" use this too, so they agree with the tree.
 */
export function compareGroupValues(a: string, b: string): number {
  if (a !== b) {
    if (a === EMPTY_GROUP_VALUE) return 1;
    if (b === EMPTY_GROUP_VALUE) return -1;
  }
  return a.localeCompare(b);
}
