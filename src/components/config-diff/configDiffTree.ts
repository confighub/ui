// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConfigDiff, PathChange, PathSegment, ResourceDiff } from '@confighub/rtk-query';

// Relative, not `@/`: the pure specs import this module outside the app's bundler.
import { collapseFolderChains, VALUE_PLACEHOLDER, type DiffTreeNode } from '../../pages/x/apps/diffTree';

/**
 * Rendering a server-computed `ConfigDiff` as the tree the diff views draw.
 *
 * The server matches array elements by merge key and resources across renames, and
 * returns both sides of each changed path. Nothing here matches anything: it only
 * arranges the changes it is given, one row per `PathChange`, in the order they came.
 */

/** The leaf under a reordered array: the array's own row is its folder. */
export const ORDER_LEAF_KEY = '(order)';

const escapeDots = (text: string): string => text.replace(/\./g, '~1');

/**
 * One path segment in configuration path syntax: a map key with its dots escaped, a
 * merge-keyed element as `?key=value`, any other element by its index.
 *
 * It is the server's `DisplayPath` taken a segment at a time, so the labels from a
 * tree's root down to a row, joined with dots, are the path a `--path` argument or a
 * where filter takes.
 */
export function segmentLabel(segment: PathSegment): string {
  if (segment.MergeKeys?.length) {
    return `?${segment.MergeKeys.map((kv) => `${escapeDots(kv.Key ?? '')}=${escapeDots(kv.Value ?? '')}`).join(',')}`;
  }
  const toIndex = segment.ToIndex ?? -1;
  if (toIndex >= 0) return String(toIndex);
  const fromIndex = segment.FromIndex ?? -1;
  if (fromIndex >= 0) return String(fromIndex);
  return escapeDots(segment.Field ?? '');
}

/** A folder under construction, with its child folders indexed by label. */
interface FolderBuilder {
  node: DiffTreeNode;
  folders: Map<string, FolderBuilder>;
}

function newFolder(key: string): FolderBuilder {
  return { node: { key, type: 'folder', children: [] }, folders: new Map() };
}

/**
 * Where a change's row goes: the folders above it, and its own label.
 *
 * A Reorder is reported at the array and a Rename at the element, each of which is
 * also the folder of any change beneath it, so their rows go inside that folder: the
 * order under the array, and the merge key under the element it renamed.
 */
function placeChange(change: PathChange): { folders: string[]; leafKey: string } {
  const segments = change.Segments ?? [];
  const labels = segments.map(segmentLabel);
  if (labels.length === 0) return { folders: [], leafKey: change.DisplayPath ?? '' };

  if (change.ChangeType === 'Reorder') return { folders: labels, leafKey: ORDER_LEAF_KEY };
  if (change.ChangeType === 'Rename') {
    const keys = segments[segments.length - 1].MergeKeys ?? [];
    return { folders: labels, leafKey: keys.map((kv) => escapeDots(kv.Key ?? '')).join(',') };
  }
  return { folders: labels.slice(0, -1), leafKey: labels[labels.length - 1] };
}

/**
 * Build the tree for one resource's changes.
 *
 * Siblings keep the order of `changes`, which is document order: a folder sits where
 * the first change beneath it was, and single-child folder chains collapse into one
 * row (`spec.template.spec.containers.?name=web`).
 */
export function buildConfigDiffTree(changes: PathChange[]): DiffTreeNode[] {
  const root = newFolder('');

  for (const change of changes) {
    const { folders, leafKey } = placeChange(change);

    let current = root;
    for (const label of folders) {
      let child = current.folders.get(label);
      if (!child) {
        child = newFolder(label);
        current.folders.set(label, child);
        current.node.children!.push(child.node);
      }
      current = child;
    }

    // An added path has nothing on the From side, and a deleted one nothing on the To side.
    const oldValue = change.ChangeType === 'Add' ? VALUE_PLACEHOLDER : (change.FromValue ?? '');
    const newValue = change.ChangeType === 'Delete' ? VALUE_PLACEHOLDER : (change.ToValue ?? '');
    const leaf: DiffTreeNode = { key: leafKey, type: 'leaf', diff: { oldValue, newValue } };
    if (oldValue.includes('\n') || newValue.includes('\n')) leaf.preformatted = true;
    if (change.ChangeType === 'Reorder') leaf.wholeValues = true;
    current.node.children!.push(leaf);
  }

  return collapseFolderChains(root.node.children ?? []);
}

/** A resource's type and name, as `cub unit diff -o mutations` heads it. */
export function resourceDiffLabel(resource: ResourceDiff['Resource']): string {
  return [resource?.ResourceType, resource?.ResourceName].filter(Boolean).join(' ');
}

export interface ConfigDiffSummary {
  additions: number;
  deletions: number;
  /** Everything that is neither: updates, replaces, reorders and renames. */
  changes: number;
  total: number;
}

/**
 * Count a diff's changes: one per changed path, and one for a resource that was added
 * or deleted whole, whose `Changes` are empty because the resource is the change.
 */
export function summarizeConfigDiff(diff: ConfigDiff | undefined): ConfigDiffSummary {
  const summary: ConfigDiffSummary = { additions: 0, deletions: 0, changes: 0, total: 0 };
  const count = (changeType: string | undefined) => {
    if (changeType === 'Add') summary.additions += 1;
    else if (changeType === 'Delete') summary.deletions += 1;
    else summary.changes += 1;
    summary.total += 1;
  };

  for (const resource of diff?.Resources ?? []) {
    if (resource.ChangeType === 'Add' || resource.ChangeType === 'Delete') {
      count(resource.ChangeType);
      continue;
    }
    for (const change of resource.Changes ?? []) count(change.ChangeType);
  }
  return summary;
}
