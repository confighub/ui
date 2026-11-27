// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// A field in the Incoming scope: the tick before it, and ONE value in its place: the value
// it becomes, its changed tokens marked in the upgrade violet (the tree's inline diff); a deletion
// struck through with a circled minus; an addition with a circled plus. A blocked upstream delete
// and a guarded key keep the current value, with the shield mark and the shield tick. Entering
// Incoming ticks a blocked delete with the other changes, as any value change; it never ticks a
// guarded key for the person, as only the person clears a guard. The current and the incoming
// value are in the value's hover card.
import { type ReactNode, memo } from 'react';

import { Checkbox } from '@mui/material';

import { componentTheme } from '../componentTheme';
import { isRemovalSentinel } from '../componentValues';
import { getInlineDiffPair } from '../inlineDiff';
import { InlineDiffSegments } from '../ValuePill';
import { CHIP_TONE, UpgradingIcon } from '../flow-graph/DeploymentFlowNode';
import type { SheetIncoming } from './sheetOverlay';
import type { SheetResource } from './specSheetModel';

// Held back: a shield, as a guard holds the change back. Not a lock: the lock means Kept on
// merge everywhere in the drawer.
const ShieldIcon = () => (
  <svg
    viewBox='0 0 16 16'
    width='11'
    height='11'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.6'
    strokeLinejoin='round'
    aria-hidden
  >
    <path d='M8 1.75l5 1.9v3.9c0 3.05-2.1 5.4-5 6.7-2.9-1.3-5-3.65-5-6.7v-3.9z' />
  </svg>
);

// Deleted and added upstream: a circled minus and a circled plus, as the staged marks are.
const CircledMinusIcon = () => (
  <svg viewBox='0 0 13 13' width='11' height='11' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' aria-hidden>
    <circle cx='6.5' cy='6.5' r='4.7' />
    <path d='M4.3 6.5h4.4' />
  </svg>
);

const CircledPlusIcon = () => (
  <svg viewBox='0 0 13 13' width='11' height='11' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' aria-hidden>
    <circle cx='6.5' cy='6.5' r='4.7' />
    <path d='M6.5 4.3v4.4M4.3 6.5h4.4' />
  </svg>
);

interface IncomingFieldProps {
  stageKey: string;
  testKey: string;
  incoming: SheetIncoming;
  /** The field's value as drawn; absent for a key only upstream has. */
  children: ReactNode;
  /** The Unit does not hold this key: upstream adds it. */
  added?: boolean;
  /** The field's value as text, which the incoming value is diffed against. */
  currentText?: string;
  /** Text after a value ("s" after seconds), so the hover card writes it as the sheet does. */
  unit?: string;
  /** Draws the field's value span with `content` in place of its value, and a state class. */
  renderValue: (content?: ReactNode, state?: 'incoming' | 'added' | 'removed' | 'held') => ReactNode;
}

export const IncomingField = memo(function IncomingField({
  stageKey,
  testKey,
  incoming,
  children,
  added,
  currentText,
  unit = '',
  renderValue,
}: IncomingFieldProps) {
  // Part of another key's change (the name of an env var added whole): plain text, no tick.
  if (incoming.secondary.has(stageKey)) {
    return (
      <span className='inc' data-testid={`incoming-${testKey}`}>
        <span className='inc-row'>{added ? renderValue(incoming.upstream.get(stageKey) ?? '') : children}</span>
      </span>
    );
  }
  const blocked = incoming.blocked.has(stageKey);
  const guarded = incoming.guarded.has(stageKey);
  const held = blocked || guarded;
  const ticked = incoming.staged.has(stageKey);
  const upstream = incoming.upstream.get(stageKey);
  const removed = !held && upstream !== undefined && isRemovalSentinel(upstream);
  const upgraded = !held && !removed && !added && upstream !== undefined && currentText !== undefined && currentText !== upstream;
  const diff = upgraded ? getInlineDiffPair(currentText, upstream) : undefined;
  // One value in its place: what the field becomes, so the line reads as the Unit will be after
  // the upgrade. A held-back change keeps the current value, with its hold mark.
  let shown: ReactNode;
  if (added) shown = renderValue(upstream ?? '', 'added');
  else if (removed) shown = renderValue(undefined, 'removed');
  else if (diff) shown = renderValue(diff.truncated ? upstream : <InlineDiffSegments segments={diff.new} changeType='upgrade' />, 'incoming');
  else shown = renderValue(undefined, held ? 'held' : undefined);
  const heldValue = blocked ? 'deleted upstream' : (upstream ?? '');
  const incomingText = removed ? 'deleted upstream' : held ? heldValue : (upstream ?? '');
  return (
    <span className='inc' data-testid={`incoming-${testKey}`}>
      <span className='inc-row'>
        {!incoming.readOnly && (
          <Checkbox
            size='small'
            checked={ticked}
            onChange={() => incoming.onToggle(stageKey)}
            data-testid={`incoming-tick-${testKey}`}
            data-held={held ? 'true' : undefined}
            title={
              guarded
                ? (incoming.guardTitles.get(stageKey) ?? 'A guard keeps this field')
                : blocked
                  ? 'Deleted upstream, set here'
                  : undefined
            }
            inputProps={{
              'aria-label': held ? 'Accept the upstream change' : 'Upgrade this field',
            }}
            checkedIcon={held ? <HeldCheck checked /> : undefined}
            icon={held ? <HeldCheck checked={false} /> : undefined}
            className='inc-tick'
            sx={{
              p: '1px',
              mr: 0.5,
              color: componentTheme.borderEdge,
              '&.Mui-checked': { color: CHIP_TONE.stale.color },
              '& .MuiSvgIcon-root': { fontSize: 16 },
            }}
          />
        )}
        {/* The current and the incoming value are in the value's one hover card (SheetPeek). */}
        <span
          className={`inc-val${held ? ' held' : ''}`}
          data-testid={`incoming-value-${testKey}`}
          // What the value's one hover card (SheetPeek) shows: the current and incoming values.
          data-inc-test-key={testKey}
          data-inc-kind={held ? 'held' : added ? 'added' : removed ? 'removed' : 'incoming'}
          data-inc-current={added || currentText === undefined ? undefined : currentText + unit}
          data-inc-value={removed || blocked ? incomingText : incomingText + unit}
          data-inc-hint={incoming.readOnly ? undefined : held ? 'Tick to accept the upstream change' : 'Tick to upgrade this field'}
        >
          {shown}
          <span className='mk' aria-label={held ? 'Held back' : removed ? 'Deleted upstream' : added ? 'Added upstream' : 'Incoming'} role='img'>
            {held ? <ShieldIcon /> : removed ? <CircledMinusIcon /> : added ? <CircledPlusIcon /> : <UpgradingIcon />}
          </span>
        </span>
      </span>
    </span>
  );
});

function HeldCheck({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 3,
        border: `1.5px solid ${checked ? CHIP_TONE.stale.color : componentTheme.attention}`,
        color: checked ? CHIP_TONE.stale.color : componentTheme.attention,
      }}
    >
      <ShieldIcon />
    </span>
  );
}

/** The tick of a whole-resource change, on the resource head: one tick, its fields never ticked one by one. */
export function WholeResourceTick({
  resource,
  incoming,
}: {
  resource: SheetResource;
  incoming: SheetIncoming;
}) {
  const whole = resource.whole;
  if (!whole) return null;
  return (
    <Checkbox
      size='small'
      checked={incoming.staged.has(whole.key)}
      disabled={!whole.available}
      onChange={() => incoming.onToggle(whole.key)}
      data-testid={`incoming-tick-res-${resource.id}`}
      inputProps={{
        'aria-label': whole.change === 'added' ? 'Add this resource' : 'Delete this resource',
      }}
      sx={{
        p: '1px',
        color: componentTheme.borderEdge,
        '&.Mui-checked': { color: CHIP_TONE.stale.color },
        '& .MuiSvgIcon-root': { fontSize: 16 },
      }}
    />
  );
}
