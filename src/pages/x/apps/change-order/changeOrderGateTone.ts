// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A gate's tone — satisfied, unsatisfied, or not-yet-evaluated — and how it
 * reads: colour and label text.
 *
 * Lives in its own file, not `ChangeOrderGateList.tsx`, so every surface that
 * draws a gate imports the SAME lookup rather than re-deriving it. Splitting
 * it out also keeps `ChangeOrderGateList.tsx` a component-only export, avoiding
 * the react-refresh/only-export-components warning a mixed export trips.
 */

import { changeOrderCopy } from './changeOrderCopy';
import type { ChangeOrderGate } from './changeOrderTypes';

export type GateTone = 'ok' | 'no' | 'idle';

export function toneOf(gate: ChangeOrderGate): GateTone {
  if (!gate.evaluated) return 'idle';
  return gate.ok ? 'ok' : 'no';
}

export function tagLabel(gate: ChangeOrderGate): string {
  if (!gate.evaluated) return changeOrderCopy.gateTag.notEvaluated;
  return gate.ok ? changeOrderCopy.gateTag.satisfied : changeOrderCopy.gateTag.unsatisfied;
}

