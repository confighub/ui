// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ComponentDeployment } from '../componentTypes';
import type { FoldModel } from './fold/foldModel';
import { keptSelectedIds, nextHoldExpiry, stepFoldStability } from './fold/foldStability';

interface UseFoldStabilityInput {
  deployments: readonly ComponentDeployment[];
  groupKey: string | null;
  selectedIds: ReadonlySet<string>;
  folding: boolean;
  /**
   * Changes when the graph is another graph (another Component or grouping).
   * Holds and the previous model belong to the old graph and are dropped.
   */
  resetKey: string;
}

export interface FoldStability {
  /** Null when the graph does not fold. */
  model: FoldModel | null;
  /** Deployment id -> time (ms) its "Recovered" card folds back. */
  holdUntilById: ReadonlyMap<string, number>;
  /** Quiet cards kept only because they are selected. */
  keptSelectedIds: ReadonlySet<string>;
}

const NO_HOLDS: ReadonlyMap<string, number> = new Map();
const NO_IDS: ReadonlySet<string> = new Set();
const HOLD_TICK_MS = 1000;

/**
 * The fold model of a graph that is read while a status poll (every 2 s)
 * changes it. A card that recovers stays a card for RECOVERED_HOLD_MS and a
 * selected card never folds, so a poll adds and removes cards but does not
 * pull away the one the user is looking at.
 */
export function useFoldStability({
  deployments,
  groupKey,
  selectedIds,
  folding,
  resetKey,
}: UseFoldStabilityInput): FoldStability {
  const [holds, setHolds] = useState<ReadonlyMap<string, number>>(NO_HOLDS);
  // Bumped when a hold runs out, so the model is built again without it.
  // The countdown on the card has its own clock: rebuilding every Deployment
  // node once a second only to change one number is waste.
  const [expiryTick, setExpiryTick] = useState(0);
  // The model on screen, and the graph it belongs to. It is what "a card that
  // was an exception and now is not" is measured against.
  const previousRef = useRef<{ key: string; model: FoldModel } | null>(null);

  const step = useMemo(() => {
    if (!folding) return null;
    const entry = previousRef.current;
    const previous = entry?.key === resetKey ? entry.model : null;
    return stepFoldStability({
      deployments,
      groupKey,
      previous,
      // Without a previous model this is a new graph, and holds from the old
      // one mean nothing here.
      holds: previous ? holds : NO_HOLDS,
      selectedIds,
      now: Date.now(),
    });
    // expiryTick is a dependency only to rebuild when a hold runs out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folding, deployments, groupKey, selectedIds, holds, expiryTick, resetKey]);

  useEffect(() => {
    if (!step) {
      previousRef.current = null;
      if (holds.size > 0) setHolds(NO_HOLDS);
      return;
    }
    previousRef.current = { key: resetKey, model: step.model };
    if (step.holds !== holds) setHolds(step.holds);
  }, [step, holds, resetKey]);

  // One timer while any hold exists; none otherwise.
  useEffect(() => {
    if (holds.size === 0) return;
    const timer = window.setInterval(() => {
      const next = nextHoldExpiry(holds);
      if (next !== null && next <= Date.now()) setExpiryTick((t) => t + 1);
    }, HOLD_TICK_MS);
    return () => window.clearInterval(timer);
  }, [holds]);

  const model = step?.model ?? null;
  const kept = useMemo(() => (model ? keptSelectedIds(model) : NO_IDS), [model]);
  const holdUntilById = useMemo(() => {
    if (!step || step.holds.size === 0) return NO_HOLDS;
    // Only the holds that still make a card: an expired one waits for the
    // next tick to be dropped.
    const out = new Map<string, number>();
    for (const [id, until] of step.holds) {
      if (step.model.location.get(id)?.kind === 'card') out.set(id, until);
    }
    return out;
  }, [step]);

  return { model, holdUntilById, keptSelectedIds: kept };
}
