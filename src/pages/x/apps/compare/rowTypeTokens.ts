// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The staged-change colours: one place for them, so the compare grid and the
 * spec sheet cannot drift apart.
 *
 * Only the three that a compare cell can produce are here. A staged compare edit
 * is an edit, an add, or a delete; there is no upgrade or protect staging on this
 * surface.
 */

export type CompareStagedKind = 'edit' | 'add' | 'delete';

export interface StagedTokens {
  /** Checkbox fill and the left-edge row bar. */
  fill: string;
  /** Row tint behind a staged row. */
  tint: string;
}

export const COMPARE_STAGED_TOKENS: Record<CompareStagedKind, StagedTokens> = {
  // Manual edit — clear gold-yellow (yellow-600), never amber-brown.
  edit: { fill: '#ca8a04', tint: 'rgba(234,179,8,.07)' },
  // An add, which is also what setting a not-set field is: green already means
  // "present only here" in this grid, so a staged add reads as the same claim.
  add: { fill: '#16a34a', tint: 'rgba(22,163,74,.045)' },
  delete: { fill: '#dc2626', tint: 'rgba(220,38,38,.04)' },
};
