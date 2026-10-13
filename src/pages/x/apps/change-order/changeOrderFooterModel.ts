// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Whether the gates on a stage stand in the way of promoting it.
 *
 * ONE RULE, EVERY SURFACE THAT PROMOTES. Two predicates for one rule is how two
 * surfaces come to disagree about whether a stage may be promoted.
 *
 * Counts only the gates that were evaluated and FAILED
 * (`partitionBlockingGates(...).failed`). A gate this page could not evaluate
 * is the server's to decide: the promotion asks it, and it refuses with 409
 * when the gate does not hold. Refusing here instead would make a stage that
 * gates on a check only the server can make impossible to promote from the UI.
 */
export function gatesBlockPromotion(failedGateCount: number): boolean {
  return failedGateCount > 0;
}
