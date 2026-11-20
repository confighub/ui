// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The whole-unit blame names a field by the server's path (`containers.?name=web.image`); the
// Component tree names its row by stage key (`containers.0.image`). buildBlameIndex puts each
// blame field on its row with the tree's own resolver (resolveConflictPath), so a row finds its
// field, and its Ref, by stage key. Pure; kept apart from the hook so browser-free specs import it.
import type { BlameField } from '@confighub/rtk-query';

import { type TreeData, resolveConflictPath } from '../configDiffFieldDiffs';

export type BlameIndex = Map<string, BlameField>;

// One index per (blame, configuration) pair: RTK hands every row the same objects, so the index
// is built once per answer. Keyed by the blame's Fields array, then by the tree data (a YAML
// string, or the parsed entries array).
const byFields = new WeakMap<readonly BlameField[], { text: Map<string, BlameIndex>; parsed: WeakMap<object, BlameIndex> }>();

const EMPTY: BlameIndex = new Map();

function build(fields: readonly BlameField[], treeData: TreeData): BlameIndex {
  const index: BlameIndex = new Map();
  for (const field of fields) {
    if (!field.Path) continue; // the resource's own record has no row
    const key = resolveConflictPath(
      { Resource: { ResourceType: field.ResourceType, ResourceName: field.ResourceName }, Path: field.Path },
      treeData,
    );
    if (key !== undefined) index.set(key, field);
  }
  return index;
}

/** Stage key -> blame field, for the rows of one Unit's tree. */
export function buildBlameIndex(fields: readonly BlameField[], treeData: TreeData): BlameIndex {
  if (treeData === undefined || (typeof treeData === 'string' && treeData === '')) return EMPTY;
  let cache = byFields.get(fields);
  if (!cache) {
    cache = { text: new Map(), parsed: new WeakMap() };
    byFields.set(fields, cache);
  }
  const hit = typeof treeData === 'string' ? cache.text.get(treeData) : cache.parsed.get(treeData);
  if (hit) return hit;
  const index = build(fields, treeData);
  if (typeof treeData === 'string') cache.text.set(treeData, index);
  else cache.parsed.set(treeData, index);
  return index;
}
