// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConfigDiff, PathChange, PathSegment, ResourceDiff } from '@confighub/rtk-query';

// Relative, not `@/`: the pure specs import this module outside the app's bundler.
import { collapseFolderChains, VALUE_PLACEHOLDER, type DiffTreeNode, type KeptValue } from '../../pages/x/apps/diffTree';

/**
 * Rendering a server-computed `ConfigDiff` as the tree the diff views draw.
 *
 * The server matches array elements by merge key and resources across renames, and
 * returns both sides of each changed path. Nothing here matches anything: it only
 * arranges the changes it is given, one row per `PathChange`, in the order they came.
 * A diff read with `include=Context` also holds the unchanged paths around the changes,
 * as `None`, which become dimmed rows.
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
 * order under the array, and the merge key under the element it renamed. A comment is
 * reported at the node it annotates, so its row is beside that node's, labelled as the
 * node's comment, as `cub unit diff` labels it.
 */
function placeChange(change: PathChange): { folders: string[]; leafKey: string } {
  const segments = change.Segments ?? [];
  const labels = segments.map(segmentLabel);
  if (change.Comment) {
    const comment = `${change.Comment.toLowerCase()} comment`;
    if (labels.length === 0) return { folders: [], leafKey: `(${comment} on the resource)` };
    return { folders: labels.slice(0, -1), leafKey: `${labels[labels.length - 1]} (${comment})` };
  }
  if (labels.length === 0) return { folders: [], leafKey: change.DisplayPath ?? '' };

  if (change.ChangeType === 'Reorder') return { folders: labels, leafKey: ORDER_LEAF_KEY };
  if (change.ChangeType === 'Rename') {
    const keys = segments[segments.length - 1].MergeKeys ?? [];
    return { folders: labels, leafKey: keys.map((kv) => escapeDots(kv.Key ?? '')).join(',') };
  }
  return { folders: labels.slice(0, -1), leafKey: labels[labels.length - 1] };
}

/**
 * A server path (a mutation's or a conflict's) as the row labels `segmentLabel`
 * gives a diff's segments. A merge-keyed element is written `?key=value;@n`, and its
 * value can hold a dot, so it runs to the `;@n` rather than to the next dot; the
 * position is dropped, as the diff's labels carry none.
 */
export function serverPathLabels(path: string): string[] {
  const labels: string[] = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === '?') {
      const end = /;@\d+/.exec(path.slice(i));
      if (end !== null) {
        const [key, ...value] = path.slice(i + 1, i + end.index).split('=');
        labels.push(`?${key}=${escapeDots(value.join('='))}`);
        i += end.index + end[0].length + 1;
        continue;
      }
    }
    const dot = path.indexOf('.', i);
    const stop = dot === -1 ? path.length : dot;
    labels.push(path.slice(i, stop));
    i = stop + 1;
  }
  return labels.filter((label) => label !== '');
}

const isMergeKeyLabel = (label: string) => label.startsWith('?');

/** The last field a server path names, past any merge-keyed element: `limits.memory` gives `memory`. */
export function serverPathField(path: string): string {
  const fields = serverPathLabels(path).filter((label) => !isMergeKeyLabel(label));
  return fields[fields.length - 1] ?? path;
}

const CONTAINER_LISTS: ReadonlySet<string> = new Set(['containers', 'initContainers', 'ephemeralContainers']);

/** The container a server path is in, by its `name` key, when the path runs through a pod's container lists. */
export function serverPathContainer(path: string): string | undefined {
  const labels = serverPathLabels(path);
  let found: string | undefined;
  labels.forEach((label, i) => {
    if (i > 0 && CONTAINER_LISTS.has(labels[i - 1]) && label.startsWith('?name=')) {
      found = label.slice('?name='.length).replace(/~1/g, '.');
    }
  });
  return found;
}

function folderFor(root: FolderBuilder, folders: readonly string[]): FolderBuilder {
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
  return current;
}

/**
 * Build the tree for one resource's changes, and the values it kept.
 *
 * Siblings keep the order of `changes`, which is document order: a folder sits where
 * the first change beneath it was, and single-child folder chains collapse into one
 * row (`spec.template.spec.containers.?name=web`). A kept value goes under its path's
 * folders, after the changes beside it.
 */
export function buildConfigDiffTree(changes: PathChange[], kept: readonly KeptValue[] = []): DiffTreeNode[] {
  const root = newFolder('');

  for (const change of changes) {
    const { folders, leafKey } = placeChange(change);
    const current = folderFor(root, folders);

    if (change.ChangeType === 'None') {
      // An unchanged path, returned as context: the To side's value is the value on both.
      const value = change.ToValue ?? '';
      current.node.children!.push({ key: leafKey, type: 'leaf', context: true, diff: { oldValue: value, newValue: value } });
      continue;
    }

    // An added path has nothing on the From side, and a deleted one nothing on the To side.
    const oldValue = change.ChangeType === 'Add' ? VALUE_PLACEHOLDER : (change.FromValue ?? '');
    const newValue = change.ChangeType === 'Delete' ? VALUE_PLACEHOLDER : (change.ToValue ?? '');
    const leaf: DiffTreeNode = { key: leafKey, type: 'leaf', diff: { oldValue, newValue } };
    // A comment's change shares its node's path with the value's: only the value's row is an anchor.
    if (change.DisplayPath && !change.Comment) leaf.anchorPath = change.DisplayPath;
    if (oldValue.includes('\n') || newValue.includes('\n')) leaf.preformatted = true;
    if (change.ChangeType === 'Reorder') leaf.wholeValues = true;
    current.node.children!.push(leaf);
  }

  for (const value of kept) {
    const labels = serverPathLabels(value.path);
    if (labels.length === 0) continue;
    const current = folderFor(root, labels.slice(0, -1));
    current.node.children!.push({
      key: labels[labels.length - 1],
      type: 'leaf',
      diff: { oldValue: value.value, newValue: value.value },
      kept: value,
    });
  }

  return collapseFolderChains(root.node.children ?? []);
}

/**
 * The type and name a toolchain gives a resource that does not name itself, such as a
 * JSON document with no `configHub` block. They name nothing, so nothing shows them.
 */
export const PLACEHOLDER_RESOURCE_TYPE = 'NoSchema';
export const PLACEHOLDER_RESOURCE_NAME = 'NoName';

/** A resource's type and name, as `cub unit diff -o mutations` heads it, without placeholders. */
export function resourceDiffLabel(resource: ResourceDiff['Resource']): string {
  const type = resource?.ResourceType === PLACEHOLDER_RESOURCE_TYPE ? undefined : resource?.ResourceType;
  const name = resource?.ResourceName === PLACEHOLDER_RESOURCE_NAME ? undefined : resource?.ResourceName;
  return [type, name].filter(Boolean).join(' ');
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
 * or deleted whole, whose `Changes` are empty because the resource is the change. The
 * unchanged paths returned as context are not counted.
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
    for (const change of resource.Changes ?? []) {
      if (change.ChangeType !== 'None') count(change.ChangeType);
    }
  }
  return summary;
}
