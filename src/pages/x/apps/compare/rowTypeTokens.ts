// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The staged-change colours, as the shipped configuration tree uses them.
 *
 * MIRRORED, NOT MOVED — and guarded. `ROW_TYPE_TOKENS` in
 * `ComponentValuesSection.tsx` is built from 32 colour constants whose comments
 * carry the reasoning for each one, and hauling that block out of a shipped
 * 4,000-line file to reach three of them would be a large edit for a small need.
 * So the three are restated here, and `component-compare-staging.pure.spec.ts`
 * reads the other file and fails if the values ever diverge — because two
 * descriptions of one fact do not stay equal on their own, which this feature has
 * already learned twice.
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
