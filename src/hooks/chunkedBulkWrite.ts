// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { chunkIds, inClause } from './inClauseChunks';

/**
 * Sending one bulk write (a bulk delete or patch) over a selection of any size.
 *
 * A bulk write names its entities with a `where` query parameter, and one `IN (...)` over a
 * large selection goes past the server's limit on a query string (see inClauseChunks.ts):
 * selecting every Trigger of an organization of a few hundred is enough. So the selection is
 * sent in chunks, one request after another.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */

/** A bulk endpoint's result for one entity: present with an Error when it failed. */
export interface BulkItemResult {
  Error?: { Message?: string };
  Message?: string;
}

/**
 * Sends `send` one `<column> IN (...)` clause per chunk of `ids` and returns what failed: a
 * message for each entity the server refused, and one for each request that failed outright.
 * Empty means every entity was written. A failed request does not stop the chunks after it,
 * since each is a separate write that would otherwise silently not happen.
 */
export async function runChunkedBulkWrite(
  column: string,
  ids: readonly string[],
  send: (where: string) => Promise<readonly BulkItemResult[] | undefined>,
  requestErrorMessage: (error: unknown) => string,
): Promise<string[]> {
  const failures: string[] = [];
  for (const chunk of chunkIds(column, ids)) {
    try {
      const results = (await send(inClause(column, chunk))) ?? [];
      for (const item of results) {
        if (item.Error) failures.push(item.Error.Message || item.Message || 'Unknown error');
      }
    } catch (error) {
      failures.push(requestErrorMessage(error));
    }
  }
  return failures;
}
