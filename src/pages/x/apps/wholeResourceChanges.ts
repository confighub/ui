// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { PathChange, PathSegment, ResourceDiff } from '@confighub/rtk-query';
import { parse as parseYaml } from 'yaml';

/**
 * The server reports a resource added or deleted whole as one document with no path changes.
 * This reads that document as the path changes it stands for, one per leaf, so the diff
 * tree can draw it as it draws every other resource: folders that open, values in a column.
 */

const field = (name: string): PathSegment => ({ Field: name, FromIndex: -1, ToIndex: -1 });
const element = (index: number): PathSegment => ({ FromIndex: index, ToIndex: index });

const isCollection = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null;

function collect(
  value: unknown,
  segments: PathSegment[],
  changeType: 'Add' | 'Delete',
  out: PathChange[],
): void {
  if (
    isCollection(value) &&
    (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0)
  ) {
    if (Array.isArray(value)) {
      value.forEach((item, i) => collect(item, [...segments, element(i)], changeType, out));
    } else {
      for (const [key, item] of Object.entries(value))
        collect(item, [...segments, field(key)], changeType, out);
    }
    return;
  }
  if (segments.length === 0) return;
  // An empty map or array is a leaf with nothing in it, shown as the YAML flow form.
  const text = Array.isArray(value) ? '[]' : isCollection(value) ? '{}' : String(value);
  out.push(
    changeType === 'Add'
      ? { ChangeType: 'Add', Segments: segments, ToValue: text }
      : { ChangeType: 'Delete', Segments: segments, FromValue: text },
  );
}

/**
 * The resource with its document read as path changes. A resource that is not added or
 * deleted whole, already holds changes, or has a document that is not a map or array
 * (a properties or INI file, say) comes back unchanged, to be drawn as its document.
 */
export function withDocumentChanges(resource: ResourceDiff): ResourceDiff {
  const added = resource.ChangeType === 'Add';
  if ((!added && resource.ChangeType !== 'Delete') || (resource.Changes ?? []).length > 0)
    return resource;
  const document = added ? resource.ToValue : resource.FromValue;
  if (!document) return resource;
  let parsed: unknown;
  try {
    parsed = parseYaml(document);
  } catch {
    return resource;
  }
  if (!isCollection(parsed)) return resource;
  const changes: PathChange[] = [];
  collect(parsed, [], added ? 'Add' : 'Delete', changes);
  return changes.length === 0 ? resource : { ...resource, Changes: changes };
}
