// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A Unit's outstanding conflicts, split by what they ask of the reader.
 *
 * `kept`: a local override won on purpose (a protected path, a value this Unit
 * took out). Nothing needs a decision, so the panel shows it as a fact.
 * `withheld`: a change from upstream or from a guard was not applied and waits
 * for someone to apply or dismiss it, so it is a cause.
 *
 * The split follows the reasons the API documents for a MutationConflict and
 * for a conflict selector; a reason it does not name counts as withheld, so an
 * unknown case is shown rather than hidden.
 */

export interface ConflictLike {
  Reason?: string;
  Path?: string;
}

export type ConflictClass = 'kept' | 'withheld';

const KEPT_REASONS: ReadonlySet<string> = new Set(['ProtectedPath', 'Subtracted']);

export function conflictClass(conflict: ConflictLike): ConflictClass {
  return conflict.Reason && KEPT_REASONS.has(conflict.Reason) ? 'kept' : 'withheld';
}

export function splitConflicts<C extends ConflictLike>(conflicts: readonly C[] | null | undefined): { kept: C[]; withheld: C[] } {
  const kept: C[] = [];
  const withheld: C[] = [];
  for (const c of conflicts ?? []) (conflictClass(c) === 'kept' ? kept : withheld).push(c);
  return { kept, withheld };
}
