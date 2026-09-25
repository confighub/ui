// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Validate a proposed new key name.
 *
 * Rules:
 * 1. Must be non-empty after trimming.
 * 2. Must not contain `.`, `[`, `]`, or whitespace.
 * 3. Must not duplicate an existing path or be a prefix of one.
 *
 * Returns an error string on failure, or null when valid.
 */
export function validateKey(
  rawKey: string,
  parentPath: string,
  allPaths: { path: string; value: string }[],
): string | null {
  const key = rawKey.trim();
  if (!key) return 'Key name is required';
  if (/[.[\]\s]/.test(key)) return 'Key must not contain . [ ] or spaces';

  const newFullPath = parentPath ? `${parentPath}.${key}` : key;
  const collision = allPaths.some(
    (p) => p.path === newFullPath || p.path.startsWith(`${newFullPath}.`),
  );
  if (collision) {
    const parent = parentPath.split('.').pop() ?? parentPath;
    return `\`${key}\` already exists in \`${parent || 'root'}\``;
  }

  return null;
}

// ============================================================================
// DOT-INDEX PATH HELPERS
// ============================================================================
//
// Canonical path format throughout the component view area is DOT-INDEX notation:
// flattenObject/parseUnitData emit `env.0.name`, the backend resolves array
// indices to bare numeric segments joined by '.' (`spec.containers.0.image`), and
// the tree builds fullPath as `pathPrefix + '.' + node.key`. There is NO bracket
// (`env[0]`) notation at runtime. These helpers centralise dot-index array
// detection so callers don't re-invent (often stale, bracket-based) regexes.

/**
 * True if a path SEGMENT is an array index — a bare non-negative integer
 * (dot-index notation, e.g. the `0` in `env.0.name`).
 */
export function isArrayIndexSegment(segment: string): boolean {
  return /^\d+$/.test(segment);
}

/**
 * True if a (possibly chain-collapsed) path's LAST segment is an array index —
 * i.e. the path/key identifies an array ELEMENT itself (`env.0`,
 * `spec.containers.2`). Used to decide whether a folder is an array-item folder.
 */
export function isArrayElementPath(path: string): boolean {
  return isArrayIndexSegment(path.slice(path.lastIndexOf('.') + 1));
}

/**
 * True if ANY segment of the path is an array index — i.e. the path lives inside
 * an array element (`env.0.value`, `spec.containers.0.image`, or `env.0` itself).
 * Used to gate operations that array elements don't support (e.g. Remove key,
 * which would corrupt the array structure).
 */
export function pathContainsArrayIndex(path: string): boolean {
  return path.split('.').some(isArrayIndexSegment);
}
