// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The tree names an array element by its position (`containers.0.image`). The server names it
// by its merge keys where the array has them and the element carries them, else by its index
// (`containers.?name=web.image`, `ports.0.containerPort`): internal/blame/expand.go,
// appendSequenceLeaves. GET .../path accepts only the server's form (ARCHITECTURE §13 Q1).
//
// Used only when no blame field gives the server path (a heavy Unit). Which arrays have merge keys
// is the server's per-type knowledge, so the caller passes it in.

/** The server escapes a dot inside a path segment as `~1`. */
function escapeDots(text: string): string {
  return text.split('.').join('~1');
}

/**
 * The server path of the field at the positional `path` of one document.
 *
 * @param leaves the document's leaves, by positional path
 * @param mergeKeysFor the merge keys of the array at a positional path, or undefined for none
 * @returns the server path, or undefined when an element on the way is not in the document
 */
export function positionalToMergeKeyPath(
  leaves: ReadonlyMap<string, unknown>,
  path: string,
  mergeKeysFor: (arrayPath: string) => readonly string[] | undefined,
): string | undefined {
  const segments = path.split('.');
  let positional = '';
  const out: string[] = [];

  for (const segment of segments) {
    const here = positional ? `${positional}.${segment}` : segment;
    if (/^\d+$/.test(segment) && positional) {
      if (!hasElement(leaves, here)) return undefined;
      out.push(elementSegment(leaves, here, segment, mergeKeysFor(positional)));
    } else {
      out.push(segment);
    }
    positional = here;
  }
  return out.join('.');
}

function hasElement(leaves: ReadonlyMap<string, unknown>, elementPath: string): boolean {
  if (leaves.has(elementPath)) return true;
  const prefix = `${elementPath}.`;
  for (const key of leaves.keys()) if (key.startsWith(prefix)) return true;
  return false;
}

function elementSegment(
  leaves: ReadonlyMap<string, unknown>,
  elementPath: string,
  index: string,
  mergeKeys: readonly string[] | undefined,
): string {
  if (!mergeKeys || mergeKeys.length === 0) return index;
  const pairs: string[] = [];
  for (const key of mergeKeys) {
    const value = leaves.get(`${elementPath}.${key}`);
    if (value === undefined || value === null || typeof value === 'object') return index;
    const text = String(value);
    // Several keys are comma-joined, so a value holding a comma or "=" cannot be one of them.
    if (mergeKeys.length > 1 && (text.includes(',') || text.includes('='))) return index;
    pairs.push(`${escapeDots(key)}=${escapeDots(text)}`);
  }
  return `?${pairs.join(',')}`;
}
