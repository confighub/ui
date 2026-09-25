// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Holding the Version an edit started from.
 *
 * THE INVARIANT, in two clauses, both of which must hold or the protection is gone and
 * nothing says so:
 *
 *   1. NEVER OMIT the field. `toWire` emits `Version` unconditionally; see the note
 *      there for why a conditional spread is not the tidy-up it looks like.
 *   2. NEVER REFRESH the value while a draft is unsaved. The Version sent is the one
 *      read at the start of THIS edit. It changes exactly twice: when an edit session
 *      begins, and when a save succeeds and begins the next one. Never in between.
 *
 * CLAUSE 2 IS THE ONE NOTHING ELSE CATCHES, and that is not a figure of speech.
 *
 * The server's protection is a SQL compare-and-swap: `UPDATE ... WHERE version = <the
 * version the request carried>`, with zero rows affected reported as a conflict
 * (`internal/storage/entity.go:920-929`). That catches a version that is too OLD.
 *
 * A version REFRESHED from a later read is not too old -- it equals the stored one, so
 * the swap matches, the write lands, and the author whose copy was overwritten is never
 * told. No error, no banner, no sign. There is no second check behind it: the field-level
 * conflict check in the patch path is gated on a retry and is inert on a first attempt,
 * and two authors editing minutes apart produce two first attempts. Between a refreshed
 * version and silent data loss there is nothing in the stack except this latch.
 *
 * That is the reason it cannot be simplified into a rule people follow, or into reading
 * the version at save time from wherever the cache happens to hold it. A background
 * refetch cannot advance what it cannot reach.
 *
 * The latch is keyed on the edit session rather than on the value, because "has the
 * stored version moved" is exactly the question the server is there to answer, and a
 * client that re-asks it locally would answer it wrong.
 */

import { useRef } from 'react';

import type { WorkflowIdentity } from './mapping';

/**
 * The identity an edit began with.
 *
 * `sessionKey` names the edit session: change it to begin a new one -- a different
 * workflow, or a save that succeeded -- and keep it stable for as long as the draft is
 * the same piece of work. While it is stable, later reads of the same entity CANNOT
 * move the Version this returns, however many times the cache refetches underneath.
 *
 * Returns `undefined` until an identity has been read, which is what `useWorkflowSave`
 * refuses to write against.
 */
export function useLatchedIdentity(
  fetched: WorkflowIdentity | undefined,
  sessionKey: string,
): WorkflowIdentity | undefined {
  const latched = useRef<{ key: string; identity: WorkflowIdentity } | null>(null);

  if (fetched && (latched.current === null || latched.current.key !== sessionKey)) {
    latched.current = { key: sessionKey, identity: fetched };
  }

  // A session that has begun keeps its identity even if the fetch later goes undefined,
  // so an in-flight refetch cannot disarm a save that is about to happen.
  return latched.current?.identity;
}
