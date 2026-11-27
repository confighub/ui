// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Types of a staged commit, shared by the field views and AppComponentView, which writes it.

/**
 * What a staged commit writes:
 * - 'upgrade-all': every upgradable field is staged, so the parent runs the whole upgrade.
 * - 'patch-data': a subset is staged → the staged changes have been merged into a
 *   single `data` document; the parent sends ONE upload to the unit's data endpoint.
 */
export type StagedCommitPayload =
  | { kind: 'upgrade-all' }
  | { kind: 'patch-data'; data: string };

/**
 * How a commit went: false when nothing was written. Written, it can come back with the stage
 * keys of the rows guards withheld, which the person chose to upgrade without; those rows are
 * not marked done, since the Unit keeps what it held there.
 */
export type StagedCommitResult = boolean | { withheldKeys: string[] };

/**
 * The value a staged edit holds to mean "remove this key". A real value cannot be told apart
 * from a removal by reference across a Map, so it is a string no one types.
 */
export const STAGED_DELETE_SENTINEL = '\x00__confighub_staged_delete__\x00';
export function isStagedDeleteSentinel(value: string | undefined): boolean {
  return value === STAGED_DELETE_SENTINEL;
}
