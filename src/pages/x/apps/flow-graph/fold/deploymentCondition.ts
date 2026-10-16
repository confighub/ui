// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentDeployment } from '../../componentTypes';
import { deriveHealthPresentation, deriveSyncPresentation } from '../../liveStatus';

/**
 * The conditions that decide where a Deployment goes in a folded graph.
 * Live health: degraded, outOfSync, progressing. Config (desired state):
 * gated, unreleased, stale, and changeSet: a ChangeSet is open on one of its
 * units, or its last change was made in one (`changeSets.ts`).
 */
export type ConditionKind =
  | 'degraded'
  | 'outOfSync'
  | 'gated'
  | 'progressing'
  | 'unreleased'
  | 'stale'
  | 'changeSet';

/**
 * The conditions that can become a wave. Only config conditions: one bulk
 * action (Upgrade, Release, Review gates) can clear them for a whole Base.
 * Live health is never a wave, because each failing workload needs its own
 * look.
 */
export type WaveCondition = 'stale' | 'unreleased' | 'gated';

/** Wave conditions, in the order their chips show. */
export const WAVE_CONDITIONS: readonly WaveCondition[] = ['stale', 'unreleased', 'gated'];

/**
 * The conditions that earn a full card, worst first. Stale is not here: it
 * is the normal state between an Upgrade and the next, so a card for it is
 * noise. A ChangeSet is not a problem, so it is last, but it is work somebody
 * is in the middle of, and a stack would hide which Deployment it is on.
 */
export const CARD_SEVERITY: readonly ConditionKind[] = [
  'degraded',
  'outOfSync',
  'gated',
  'progressing',
  'unreleased',
  'changeSet',
];

/**
 * Which conditions a Deployment has. Live axes use the same derivation as
 * the card's vitals, and config axes the same unit counts as its chips, so a
 * folded graph never disagrees with the card it replaces.
 */
export function conditionsOf(d: ComponentDeployment): Record<ConditionKind, boolean> {
  const health = deriveHealthPresentation(d.liveStatus)?.state;
  const sync = deriveSyncPresentation(d.liveStatus)?.state;
  return {
    degraded: health === 'Degraded',
    outOfSync: sync === 'OutOfSync',
    gated: d.configSignals.gatedUnits > 0,
    progressing: health === 'Progressing' || sync === 'Progressing',
    unreleased: d.configSignals.unreleasedUnits > 0,
    stale: d.configSignals.staleUnits > 0,
    changeSet: (d.changeSets?.length ?? 0) > 0,
  };
}

const isWave = (kind: ConditionKind, waves: ReadonlySet<WaveCondition>): boolean =>
  (waves as ReadonlySet<string>).has(kind);

/** The worst card-earning condition that is not a wave, or null. */
function worstCardKind(
  c: Record<ConditionKind, boolean>,
  waves: ReadonlySet<WaveCondition>,
): ConditionKind | null {
  for (const kind of CARD_SEVERITY) {
    if (c[kind] && !isWave(kind, waves)) return kind;
  }
  return null;
}

/**
 * How badly a Deployment needs a card: 6 (Degraded) down to 1 (a
 * ChangeSet), 0 when it is quiet. A condition that is a wave on its Base does
 * not count, because the wave chip already says it for all members.
 */
export function cardSeverity(
  c: Record<ConditionKind, boolean>,
  waves: ReadonlySet<WaveCondition>,
): number {
  const kind = worstCardKind(c, waves);
  return kind === null ? 0 : CARD_SEVERITY.length - CARD_SEVERITY.indexOf(kind);
}

/**
 * The mark a member gets in its stack's strip. A member over the card cap
 * keeps its colour here, so a problem is never hidden by the cap. Stale gets
 * a mark only when it is not a wave; a wave is not painted again.
 */
export function stripMark(
  c: Record<ConditionKind, boolean>,
  waves: ReadonlySet<WaveCondition>,
): ConditionKind | 'quiet' {
  const kind = worstCardKind(c, waves);
  if (kind !== null) return kind;
  if (c.stale && !waves.has('stale')) return 'stale';
  return 'quiet';
}
