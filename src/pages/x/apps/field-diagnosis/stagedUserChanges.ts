// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The person's staged work in one Unit (team-lead decision on review item 3): value edits,
// deletes and restores, and upgrade picks that differ from the default the Incoming view stages by
// itself. The new-tab rule (b) and the Back blocker protect only this; default picks come back on
// their own. Pure.

export function userStagedCount({
  staged,
  edits,
  defaults,
}: {
  /** The Unit's staged stage keys: picks and edits. */
  staged: ReadonlySet<string>;
  /** The stage keys with a staged value edit (a delete and a restore are edits too). */
  edits: ReadonlySet<string>;
  /** The picks the Incoming view staged by itself. */
  defaults: ReadonlySet<string>;
}): number {
  let count = edits.size;
  for (const key of staged) if (!edits.has(key) && !defaults.has(key)) count += 1;
  for (const key of defaults) if (!staged.has(key) && !edits.has(key)) count += 1;
  return count;
}
