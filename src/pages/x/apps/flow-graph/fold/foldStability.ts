// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentDeployment } from '../../componentTypes';
import {
  type FoldModel,
  buildFoldModel,
  keepSelectedCards,
  updateRecoveredHolds,
} from './foldModel';

export interface FoldStabilityInput {
  deployments: readonly ComponentDeployment[];
  groupKey: string | null;
  /** The model on screen before this change; null for a new graph. */
  previous: FoldModel | null;
  /** Deployment id -> time (ms) its recovered hold runs out. */
  holds: ReadonlyMap<string, number>;
  selectedIds: ReadonlySet<string>;
  now: number;
}

export interface FoldStabilityStep {
  model: FoldModel;
  /** The same map instance as the input when no hold started or ended. */
  holds: ReadonlyMap<string, number>;
}

function unexpired(holds: ReadonlyMap<string, number>, now: number): Set<string> {
  const ids = new Set<string>();
  for (const [id, until] of holds) if (until > now) ids.add(id);
  return ids;
}

const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((id) => b.has(id));

/**
 * The next model after a status poll (or a selection change), and the holds
 * that go with it. A card that just recovered is held in the SAME step, so
 * it never leaves for one frame and comes back on the next: that one-frame
 * jump is the movement the hold exists to stop.
 */
export function stepFoldStability({
  deployments,
  groupKey,
  previous,
  holds,
  selectedIds,
  now,
}: FoldStabilityInput): FoldStabilityStep {
  const keepAsCardIds = keepSelectedCards(previous, selectedIds);
  const heldIds = unexpired(holds, now);
  const model = buildFoldModel({
    deployments,
    groupKey,
    recoveredIds: heldIds,
    keepAsCardIds,
  });
  const nextHolds = updateRecoveredHolds({ previous, next: model, holds, now });
  if (nextHolds === holds) return { model, holds };
  const nextHeldIds = unexpired(nextHolds, now);
  if (sameIds(nextHeldIds, heldIds)) return { model, holds: nextHolds };
  return {
    model: buildFoldModel({ deployments, groupKey, recoveredIds: nextHeldIds, keepAsCardIds }),
    holds: nextHolds,
  };
}

/**
 * Cards held only because they are selected and have nothing to show: they
 * say so, so the user does not look for a problem on them.
 */
export function keptSelectedIds(model: FoldModel): Set<string> {
  const ids = new Set<string>();
  for (const base of model.bases.values()) {
    for (const card of base.cards) {
      if (card.reason === 'selected' && card.severity === 0) ids.add(card.id);
    }
  }
  return ids;
}

/** The earliest time a hold runs out, or null when there are none. */
export function nextHoldExpiry(holds: ReadonlyMap<string, number>): number | null {
  let next: number | null = null;
  for (const until of holds.values()) if (next === null || until < next) next = until;
  return next;
}
