// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Revisions a ChangeOrder's start and end Tags mark, as where clauses and as one list.
 *
 * Each Tag is read with the indexed `Tags ? '<id>'`, one clause per Tag, because the where
 * grammar has no OR. `Tags.*.TagID IN (...)` is tested by the server after it reads a page,
 * so its first page can come back short, or empty, with a continue token: a read that stops
 * there misses Revisions. The clauses are read to their last page and the rows merged here.
 */

/** Which Spaces the clauses keep: those in `in`, or all but those in `notIn`. */
export interface TaggedRevisionScope {
  in?: readonly string[];
  notIn?: readonly string[];
}

const quoted = (ids: readonly string[]) =>
  [...ids]
    .sort()
    .map((id) => `'${id}'`)
    .join(', ');

/** One clause per Tag; `undefined` while a Tag is not known, or when `in` names no Space. */
export function taggedRevisionWheres(
  startTagId: string | undefined,
  endTagId: string | undefined,
  scope: TaggedRevisionScope = {},
): string[] | undefined {
  if (startTagId === undefined || endTagId === undefined) return undefined;
  if (scope.in !== undefined && scope.in.length === 0) return undefined;
  const spaces =
    scope.in !== undefined
      ? ` AND SpaceID IN (${quoted(scope.in)})`
      : scope.notIn !== undefined && scope.notIn.length > 0
        ? ` AND SpaceID NOT IN (${quoted(scope.notIn)})`
        : '';
  return [...new Set([startTagId, endTagId])].map((tagId) => `Tags ? '${tagId}'${spaces}`);
}

/** The rows of every clause as one list: a Revision both Tags mark is read twice and kept once. */
export function uniqueRevisions<T extends { Revision?: { RevisionID?: string } }>(
  rows: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = row.Revision?.RevisionID;
    if (id !== undefined) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(row);
  }
  return out;
}
