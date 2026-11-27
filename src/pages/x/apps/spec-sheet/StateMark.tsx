// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The state icons of the sheet, the glyphs of the shipped Unit header: Stale (up arrow) and
// Unreleased changes (double chevron). Icons only, no words.
import { memo } from 'react';

import { CHIP_TONE, PendingIcon, UpgradingIcon } from '../flow-graph/DeploymentFlowNode';
import { COMPARE_STAGED_TOKENS } from '../compare/rowTypeTokens';
import { componentTheme } from '../componentTheme';

export type StateKind = 'stale' | 'unreleased';

const LABEL: Record<StateKind, string> = { stale: 'Stale', unreleased: 'Unreleased changes' };

export const StateMark = memo(function StateMark({
  kind,
  testId,
  chip,
}: {
  kind: StateKind;
  testId?: string;
  /** On the tinted chip ground, as in the Unit header (heads and tiles). */
  chip?: boolean;
}) {
  return (
    <span
      className='mk'
      data-testid={testId}
      aria-label={LABEL[kind]}
      role='img'
      style={{ color: CHIP_TONE[kind].color, background: chip ? CHIP_TONE[kind].tint : undefined }}
    >
      {kind === 'stale' ? <UpgradingIcon /> : <PendingIcon />}
    </span>
  );
});

const PencilIcon = () => (
  <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinejoin='round'>
    <path d='M10.5 2.5l3 3-8 8H2.5v-3z' />
  </svg>
);
// A staged removal and a staged add: a circled minus and a circled plus, after the value.
const MinusIcon = () => (
  <svg viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round'>
    <circle cx='6.5' cy='6.5' r='4.7' />
    <path d='M4.3 6.5h4.4' />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round'>
    <circle cx='6.5' cy='6.5' r='4.7' />
    <path d='M6.5 4.3v4.4M4.3 6.5h4.4' />
  </svg>
);
const LockIcon = () => (
  <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.7'>
    <rect x='3.5' y='7' width='9' height='6.5' rx='1.2' />
    <path d='M5.5 7V5a2.5 2.5 0 015 0v2' />
  </svg>
);

export type StagedKind = 'edit' | 'delete' | 'add';
const STAGED_LABEL: Record<StagedKind, string> = { edit: 'Staged edit', delete: 'Staged removal', add: 'Staged add' };

/** The mark after a staged value, in the staging hue of its change type. */
export const StagedMark = memo(function StagedMark({ kind, testId }: { kind: StagedKind; testId?: string }) {
  return (
    <span className='mk' data-testid={testId} aria-label={STAGED_LABEL[kind]} role='img' style={{ color: COMPARE_STAGED_TOKENS[kind].fill }}>
      {kind === 'edit' ? <PencilIcon /> : kind === 'delete' ? <MinusIcon /> : <PlusIcon />}
    </span>
  );
});

/** The lock after a value kept on merge: t2 when kept, rust while the keep is staged. */
export const KeptMark = memo(function KeptMark({ staged, testId }: { staged: boolean; testId?: string }) {
  return (
    <span
      className='mk'
      data-testid={testId}
      aria-label={staged ? 'Keep on merge staged' : 'Kept on merge'}
      role='img'
      style={{ color: staged ? componentTheme.accent : componentTheme.fgMuted }}
    >
      <LockIcon />
    </span>
  );
});

/** The marks of a group of fields (a block, a part, a resource): each kind once. */
export function StateMarks({ stale, unreleased, chip }: { stale: boolean; unreleased: boolean; chip?: boolean }) {
  if (!stale && !unreleased) return null;
  return (
    <span className={chip ? 'marks chips' : 'marks'}>
      {stale && <StateMark kind='stale' chip={chip} />}
      {unreleased && <StateMark kind='unreleased' chip={chip} />}
    </span>
  );
}
