// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Splitting one `<column> IN (...)` filter into several that the server accepts.
 *
 * The server rejects a query string longer than 8,192 characters and a `limit` above
 * 1,000 rows. One IN clause over every Unit or Revision of a large Component breaks both
 * (104 Spaces and 520 Units come to about 25,000 encoded characters), and the request
 * fails with HTTP 400. Each chunk this returns stays under both limits on its own, so a
 * caller sends one request per chunk and concatenates the rows.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */

/**
 * Budget for the encoded `where` value alone. The server's 8,192 applies to the whole
 * query string, and the other parameters (`select`, `include`, `limit`, `distinct_on`)
 * need the rest.
 */
export const DEFAULT_MAX_ENCODED_WHERE = 6000;

/** The server's row limit: a chunk never asks for more rows than one response may hold. */
export const DEFAULT_MAX_IN_ITEMS = 1000;

export interface InClauseChunkOptions {
  maxEncodedLength?: number;
  maxItems?: number;
}

const quote = (id: string) => `'${id}'`;

/** `<column> IN ('a', 'b', ...)`: the text format every bulk read by id sends. */
export const inClause = (column: string, ids: readonly string[]): string =>
  `${column} IN (${ids.map(quote).join(', ')})`;

/** Ids without empties and duplicates, in first-seen order. */
export function uniqueIds(ids: readonly (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Group ids into chunks in first-seen order. Each chunk holds at most `maxItems` ids and
 * its clause encodes to at most `maxEncodedLength` characters. An id whose clause alone
 * is over the budget still gets a chunk of its own: dropping it would hide a row without
 * a sign, and the server's error is the honest result for it.
 */
export function chunkIds(
  column: string,
  ids: readonly (string | undefined | null)[],
  opts: InClauseChunkOptions = {},
): string[][] {
  const maxEncodedLength = opts.maxEncodedLength ?? DEFAULT_MAX_ENCODED_WHERE;
  const maxItems = Math.max(1, opts.maxItems ?? DEFAULT_MAX_IN_ITEMS);
  const unique = uniqueIds(ids);
  if (unique.length === 0) return [];

  // Encoded length of a clause is prefix + items + separators + suffix, so it can be
  // tracked incrementally instead of encoding the growing clause for every id.
  const prefixLength = encodeURIComponent(`${column} IN (`).length;
  const suffixLength = encodeURIComponent(')').length;
  const separatorLength = encodeURIComponent(', ').length;

  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLength = prefixLength + suffixLength;
  for (const id of unique) {
    const itemLength = encodeURIComponent(quote(id)).length;
    const added = current.length === 0 ? itemLength : separatorLength + itemLength;
    if (current.length > 0 && (current.length >= maxItems || currentLength + added > maxEncodedLength)) {
      chunks.push(current);
      current = [];
      currentLength = prefixLength + suffixLength;
    }
    currentLength += current.length === 0 ? itemLength : separatorLength + itemLength;
    current.push(id);
  }
  chunks.push(current);
  return chunks;
}

/**
 * `<column> IN ('a', 'b', ...)` clauses covering every id exactly once, in first-seen
 * order, each under the encoded-length and item limits. Empty input gives no clauses.
 */
export function chunkInClause(
  column: string,
  ids: readonly (string | undefined | null)[],
  opts?: InClauseChunkOptions,
): string[] {
  return chunkIds(column, ids, opts).map((chunk) => inClause(column, chunk));
}
