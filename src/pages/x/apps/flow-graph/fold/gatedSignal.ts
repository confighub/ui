// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { parseGateName } from '../../../../../utility/name-format-functions';

/**
 * How a card shows that it is Gated: the full chip, the lock icon alone, or
 * nothing.
 * - `chip`: Gated is not a wave on the card's Base, so the card is the only
 *   place that says it.
 * - `none`: Gated is a wave, which the fold header says once for every member.
 * - `mark`: Gated is a wave and the card is a member of an open stack. The user
 *   opened the stack to see its Variants one by one, and the header does not
 *   say which of them are gated or by which Trigger. A chip on each of dozens
 *   of members would be loud, so each gets the icon, with the same peek.
 */
export type GatedSignal = 'chip' | 'mark' | 'none';

export function gatedSignal({
  gated,
  gatedIsWave,
  stackMember,
}: {
  /** At least one of the card's Units has a gate. */
  gated: boolean;
  /** Gated is a wave on the card's Base, so its chip is suppressed. */
  gatedIsWave: boolean;
  /** The card is a member of an open stack. */
  stackMember: boolean;
}): GatedSignal {
  if (!gated) return 'none';
  if (!gatedIsWave) return 'chip';
  return stackMember ? 'mark' : 'none';
}

/**
 * The accessible name of the mark: "Gated: " and the Triggers of the card's
 * gates, each once. The icon has no text, so this is all a screen reader says
 * before the peek opens.
 */
export function gatedMarkLabel(units: ReadonlyArray<{ gates: readonly string[] }>): string {
  const triggers = [
    ...new Set(units.flatMap((u) => u.gates.map((gate) => parseGateName(gate).triggerSlug))),
  ];
  return triggers.length > 0 ? `Gated: ${triggers.join(', ')}` : 'Gated';
}
