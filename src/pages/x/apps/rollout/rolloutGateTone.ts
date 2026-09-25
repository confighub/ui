// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A gate's tone — satisfied, unsatisfied, or not-yet-evaluated — and how it
 * reads: colour and label text.
 *
 * Lives in its own file, not `RolloutGateList.tsx`, so every surface that
 * draws a gate imports the SAME lookup rather than re-deriving it. Splitting
 * it out also keeps `RolloutGateList.tsx` a component-only export, avoiding
 * the react-refresh/only-export-components warning a mixed export trips.
 */

import { rolloutCopy } from './rolloutCopy';
import type { RolloutGate } from './rolloutTypes';

export type GateTone = 'ok' | 'no' | 'idle';

export function toneOf(gate: RolloutGate): GateTone {
  if (!gate.evaluated) return 'idle';
  return gate.ok ? 'ok' : 'no';
}

export function tagLabel(gate: RolloutGate): string {
  if (!gate.evaluated) return rolloutCopy.gateTag.notEvaluated;
  return gate.ok ? rolloutCopy.gateTag.satisfied : rolloutCopy.gateTag.unsatisfied;
}

