// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { CSSProperties } from 'react';

import { componentTheme } from '../../componentTheme';
import type { ConditionKind, WaveCondition } from './deploymentCondition';

/** A strip mark: one member's worst condition, or quiet. */
export type MarkKind = ConditionKind | 'quiet';

/** The words for a mark, for labels read by assistive technology and tooltips. */
export const MARK_LABEL: Record<MarkKind, string> = {
  degraded: 'Degraded',
  outOfSync: 'Out of sync',
  gated: 'Gated',
  progressing: 'Progressing',
  unreleased: 'Unreleased changes',
  stale: 'Stale',
  quiet: 'Quiet',
};

const QUIET_MARK = 'rgba(142,154,170,0.35)';
/** The light half of a Progressing hatch: the attention tone at 20%. */
const ATTENTION_HATCH_GAP = 'rgba(159,66,0,0.2)';

/**
 * How one strip mark is painted. Each condition has its own SHAPE as well as
 * its colour: Gated is a ring and Progressing is hatched, because Out of
 * sync, Gated and Progressing share the attention tone, and status must not
 * depend on colour alone.
 */
export function markStyle(kind: MarkKind): CSSProperties {
  switch (kind) {
    case 'degraded':
      return { background: componentTheme.danger };
    case 'outOfSync':
      return { background: componentTheme.attention };
    case 'gated':
      return {
        background: 'transparent',
        boxShadow: `inset 0 0 0 1.5px ${componentTheme.attention}`,
        borderRadius: '50%',
      };
    case 'progressing':
      return {
        background: `repeating-linear-gradient(135deg, ${componentTheme.attention} 0 1.5px, ${ATTENTION_HATCH_GAP} 1.5px 3px)`,
      };
    case 'unreleased':
      return { background: componentTheme.variation };
    case 'stale':
      return { background: componentTheme.upgrade };
    case 'quiet':
      return { background: QUIET_MARK };
  }
}

/** A wave chip on a fold header: the condition's word, tone and shape. */
export const WAVE_CHIP: Record<
  WaveCondition,
  { label: string; color: string; tint: string; ring: boolean }
> = {
  stale: {
    label: 'Stale',
    color: componentTheme.upgrade,
    tint: 'rgba(153,81,244,0.149)',
    ring: false,
  },
  unreleased: {
    label: 'Unreleased changes',
    color: componentTheme.variation,
    tint: 'rgba(68,103,220,0.149)',
    ring: false,
  },
  gated: { label: 'Gated', color: componentTheme.attention, tint: 'transparent', ring: true },
};

/** A one-line summary of a strip for assistive technology: "2 Degraded, 6 Quiet". */
export function stripSummary(marks: readonly MarkKind[]): string {
  const counts = new Map<MarkKind, number>();
  for (const m of marks) counts.set(m, (counts.get(m) ?? 0) + 1);
  return [...counts].map(([kind, n]) => `${n} ${MARK_LABEL[kind]}`).join(', ');
}

/**
 * The name of a stack's caret button. A page holds many stacks, so each name
 * says which stack it is and how big: "Expand stack retail, 13 Deployments".
 * In a graph of several Components it also names the Component, as two
 * Components can both have a "retail" stack.
 */
export function stackToggleLabel(
  expanded: boolean,
  label: string,
  count: number,
  componentName?: string,
): string {
  const noun = count === 1 ? 'Deployment' : 'Deployments';
  const where = componentName ? ` in ${componentName}` : '';
  return `${expanded ? 'Collapse' : 'Expand'} stack ${label}, ${count} ${noun}${where}`;
}
