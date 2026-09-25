// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Whether the gates on a stage stand in the way of promoting it.
 *
 * ONE RULE, EVERY SURFACE THAT PROMOTES. Two predicates for one rule is how two
 * surfaces come to disagree about whether a stage may be promoted.
 *
 * `blockingGates` (rolloutGates.ts) already counts a gate that has NOT BEEN
 * EVALUATED as blocking, which is deliberate: not knowing whether a check
 * passed is not the same as it having passed.
 */
export function gatesBlockPromotion(blockingGateCount: number): boolean {
  return blockingGateCount > 0;
}
