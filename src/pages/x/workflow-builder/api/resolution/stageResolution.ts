// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a Stage's selector resolves to.
 *
 * Three kinds, and the distinction between the first two is the whole point: NOT YET
 * KNOWN and REFUSED are different answers, and only the second is the author's to fix.
 * A Stage whose request is still in flight, or whose request failed, must never raise a
 * fault or stop a save -- doing so blocks correct work because the network hiccuped.
 *
 * Note what is NOT here: any judgement about an empty match. `matched` with no Spaces
 * is reported as the fact it is, and how serious that is depends on what the selector
 * was resolved against, which is decided above this layer.
 */

/** A Space, reduced to what the builder reads. */
export interface SpaceRow {
  spaceId: string;
  slug: string;
  labels: Record<string, string>;
}

export type StageResolution =
  /** No answer yet: never asked, still in flight, or the request failed. Never a fault. */
  | { kind: 'unresolved' }
  /**
   * The server refused the expression. The message is its own, unedited and
   * unattributed -- the list endpoint passes the parser's text through without a
   * wrapper (`internal/views/list.go:167`), so it names the offending token and
   * nothing else. The sentence around it belongs to the page.
   */
  | { kind: 'invalid'; message: string }
  /**
   * The Spaces the selector reaches.
   *
   * `stale` marks an answer held over while a newer one is in flight, so that nothing
   * blanks mid-edit. It is information, not an instruction: a caller is free to render
   * it identically to a fresh answer, and the design has no state for it.
   */
  | { kind: 'matched'; spaces: SpaceRow[]; stale: boolean };

export const UNRESOLVED: StageResolution = { kind: 'unresolved' };

/** A Stage, reduced to what resolving one needs. */
export interface StageSelector {
  id: string;
  /** The Stage's own `WhereSpace`. Empty selects everything the scope allows. */
  where: string;
}
