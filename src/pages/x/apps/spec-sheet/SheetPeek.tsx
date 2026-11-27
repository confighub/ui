// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The one hover peek of a sheet: a light card under the value the pointer or the keyboard is
// on, with where the value comes from, its state, its full path and the source. One Popper per
// sheet, placed by delegated `pointerover` / `focusin` on the sheet root, so a Unit of many
// values mounts no tooltip per value. The value's actions, when it has some, are at its foot.

import { useEffect, useRef, type ReactNode } from 'react';
import { Box, Popper } from '@mui/material';
import { Dotted, WrapValue } from './Dotted';
import { getInlineDiffPair } from '../inlineDiff';
import { InlineDiffSegments } from '../ValuePill';
import { INFO_PEEK_TOOLTIP_SX, InfoPeekCard } from '@/components/info-peek/InfoPeek';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { componentTheme } from '../componentTheme';
import { PendingIcon, UpgradingIcon } from '../flow-graph/DeploymentFlowNode';
import { PencilIcon } from './FieldActions';
import type { DefaultField } from './kubeDefaults';
import { originWord, type AtomOrigin } from './sheetOrigin';
import type { SheetOverlay, UpstreamSide } from './sheetOverlay';

/** The peek is the same 320px card at every tier. */
const PEEK_MAX_WIDTH = 320;

import { PEEK_CARD_CLASS, type PeekTarget } from './useSheetPeek';

/** The icon of an origin: a Link for a provided value, an up arrow for an inherited one, a dot for the rest. */
function originIcon(kind: string) {
  const common = { viewBox: '0 0 16 16', width: 11, height: 11, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true } as const;
  if (kind === 'link') {
    return (
      <svg {...common}>
        <path d='M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1' />
      </svg>
    );
  }
  if (kind === 'inherited') {
    return (
      <svg {...common}>
        <path d='M8 3v10M4 9l4 4 4-4' />
      </svg>
    );
  }
  // Set in this Unit: a filled dot; an origin not known: an open one.
  return (
    <svg {...common}>
      <circle cx='8' cy='8' r={kind === 'here' ? 3.5 : 3} fill={kind === 'here' ? 'currentColor' : 'none'} />
    </svg>
  );
}

function originColor(origin: AtomOrigin | undefined): string {
  if (origin?.kind === 'here') return componentTheme.fgDefault;
  if (origin?.kind === 'link') return componentTheme.variation;
  return componentTheme.fgMuted;
}

export interface SheetPeekProps {
  target: PeekTarget | null;
  overlay: SheetOverlay;
  /** The value's actions, at the card's foot; absent where the sheet cannot edit. */
  actions?: ReactNode;
  onCardEnter: () => void;
  onCardLeave: () => void;
  onClose: () => void;
}

/** The focusable elements after `el` in `root`, in document order. */
function nextFocusable(root: Element, el: Element): HTMLElement | undefined {
  const all = [...root.querySelectorAll<HTMLElement>('[tabindex="0"], button, a[href], input')];
  return all.find((x) => el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING && !el.contains(x));
}

export function SheetPeek({ target, overlay, actions, onCardEnter, onCardLeave, onClose }: SheetPeekProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const anchor = target?.el;
  // Tab from the value moves into its card's buttons; the card is portaled, so the browser's
  // own order would skip it.
  useEffect(() => {
    if (!anchor || !actions) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.shiftKey) return;
      const first = cardRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      if (!first) return;
      e.preventDefault();
      first.focus();
    };
    anchor.addEventListener('keydown', onKey);
    return () => anchor.removeEventListener('keydown', onKey);
  }, [anchor, actions]);
  if (!target || !target.el.isConnected) return null;
  const onCardKey = (e: React.KeyboardEvent) => {
    const buttons = [...(cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
    if (e.key === 'Escape') {
      // Escape closes the card only, not the drawer, which closes on an Escape at the document.
      e.preventDefault();
      e.stopPropagation();
      target.el.focus({ preventScroll: true });
      onClose();
    } else if (e.key === 'Tab' && e.shiftKey && document.activeElement === buttons[0]) {
      // Back to the value the card is on.
      e.preventDefault();
      target.el.focus({ preventScroll: true });
    } else if (e.key === 'Tab' && !e.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
      // On past the card: the next field after its value, as if the card were in line.
      const root = target.el.closest('[data-testid="field-sheet"]');
      const next = root ? nextFocusable(root, target.el) : undefined;
      if (next) {
        e.preventDefault();
        onClose();
        next.focus();
      }
    }
  };
  const origin = overlay.origins?.get(target.key);
  const kind = overlay.origins ? (origin?.kind ?? 'unknown') : 'pending';
  const lines: ReactNode[] = [<Dotted key='path'>{origin?.fullPath ?? target.path}</Dotted>];
  const lineIds: (string | undefined)[] = ['field-peek-path'];
  if (origin?.source && kind !== 'unknown' && kind !== 'pending' && kind !== 'here') {
    lines.push(origin.source);
    lineIds.push(undefined);
  }
  // A key reference's `optional` is said here, on each of its values: the line shows it only
  // when something happened to it.
  const optional = target.el.closest('[data-key-optional]')?.getAttribute('data-key-optional');
  if (optional === 'true' || optional === 'false') {
    lines.push(
      <span key='optional' style={{ fontFamily: componentTheme.fontSans, fontSize: 12 }}>
        {optional === 'true'
          ? 'Optional: the container starts even when this key is missing'
          : 'Required: the container does not start when this key is missing'}
      </span>,
    );
    lineIds.push('field-peek-optional');
  }
  // A value that has a Kubernetes default says it, so a value set over it reads as a choice.
  const field = overlay.defaults?.fields.get(target.key);
  if (field) {
    lines.push(
      <span key='kube-default' style={{ fontFamily: componentTheme.fontSans, fontSize: 12 }}>
        {field.isDefault ? (
          'The Kubernetes default'
        ) : (
          <>
            Kubernetes default:{' '}
            <span style={{ fontFamily: componentTheme.fontMono, color: componentTheme.fgDefault }}>
              {field.def.text}
              {field.def.unit}
            </span>
          </>
        )}
      </span>,
    );
    lineIds.push('field-peek-kube-default');
  }
  // The state lines are words, so they are in the sans face, with the icon of the state. Only
  // the path stays mono.
  if (overlay.stale.has(target.key)) {
    lines.push(<StateLine key='stale' kind='stale' />);
    lineIds.push('field-peek-stale');
  }
  if (overlay.unreleased.has(target.key)) {
    lines.push(<StateLine key='unreleased' kind='unreleased' />);
    lineIds.push('field-peek-unreleased');
  }
  return (
    <Popper
      open
      anchorEl={target.el}
      placement='bottom-start'
      modifiers={[
        { name: 'flip', enabled: true },
        { name: 'preventOverflow', options: { padding: 8 } },
        { name: 'offset', options: { offset: [0, 4] } },
      ]}
      sx={{ zIndex: (t) => t.zIndex.tooltip }}
    >
      {/* One card per value: it takes the pointer, so the pointer can move from the value down
          into it (the 250ms grace bridges the 4px gap) and stay there to click an action. */}
      <Box
        ref={cardRef}
        className={PEEK_CARD_CLASS}
        onPointerEnter={onCardEnter}
        onPointerLeave={onCardLeave}
        onKeyDown={onCardKey}
        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        style={{ ...flatSx(), width: PEEK_MAX_WIDTH, maxWidth: 'calc(100vw - 16px)', overflowWrap: 'break-word' }}
        sx={{
          // The eyebrow is a sentence in the sans face (11px, 700); the lines under it are t3.
          '& [data-testid="field-peek"] > :first-of-type': { fontFamily: componentTheme.fontSans, fontSize: 11, fontWeight: 700 },
          // fgMuted (7.06:1), not the shared card's t3 (2.86:1): the path and source are text to read.
          '& [data-testid="field-peek"] > :not(:first-of-type)': { color: componentTheme.fgMuted },
          '& [data-testid="field-peek-path"]': { fontSize: 10.5, lineHeight: 1.5 },
          '& [data-testid="field-peek-stale"] svg, & [data-testid="field-peek-unreleased"] svg': { width: 11, height: 11 },
        }}
      >
        <InfoPeekCard
          testId='field-peek'
          color={overlay.stale.has(target.key) ? STATE_INK.stale : originColor(origin)}
          spec={{ eyebrow: originWord(kind), lines }}
          lineTestIds={lineIds}
          sentenceCaseEyebrow
          eyebrowIcon={originIcon(kind)}
        />
        <IncomingBlock el={target.el} upstream={overlay.upstream?.get(target.key)} />
        <DefaultsBlock
          fields={overlay.defaults?.byHost.get(target.key)}
          onOpen={
            overlay.edit && !overlay.incoming
              ? (key) => {
                  onClose();
                  overlay.edit?.open(key);
                }
              : undefined
          }
        />
        {actions}
      </Box>
    </Popper>
  );
}


const INCOMING_WORD: Record<string, string> = {
  incoming: 'Incoming',
  added: 'Added upstream',
  removed: 'Deleted upstream',
  held: 'Held back',
};

/** A label above its value in the card: small caps, as the card's eyebrow. */
function CapsLabel({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div style={{ fontFamily: componentTheme.fontSans, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>
      {children}
    </div>
  );
}

/**
 * The card of a field with an upstream change shows what the upgrade does: CURRENT and its
 * value, then INCOMING and the value it becomes (its changed tokens marked, as in the sheet),
 * then, in Incoming, the hint. Each label is above its value. In Incoming it reads the value's
 * incoming facts from its `.inc-val`; in the other scopes, from the overlay's `upstream`.
 */
function IncomingBlock({ el, upstream }: { el: HTMLElement; upstream?: UpstreamSide }) {
  const dataset = el.closest<HTMLElement>('.inc-val')?.dataset;
  const inc = dataset?.incTestKey
    ? {
        testKey: dataset.incTestKey,
        kind: dataset.incKind ?? 'incoming',
        current: dataset.incCurrent,
        value: dataset.incValue ?? '',
        hint: dataset.incHint,
      }
    : upstream
      ? { ...upstream, hint: undefined }
      : undefined;
  if (!inc) return null;
  const { kind, current, value } = inc;
  const ink = kind === 'held' ? componentTheme.heldInk : componentTheme.upgradeInk;
  const diff = kind === 'incoming' && current !== undefined && current !== value ? getInlineDiffPair(current, value) : undefined;
  const valueSx = { fontFamily: componentTheme.fontMono, fontSize: 11, lineHeight: 1.45, overflowWrap: 'break-word' as const, marginTop: 2 };
  return (
    <div
      data-testid={`incoming-tooltip-${inc.testKey}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 12px 10px', borderTop: `1px solid ${componentTheme.borderSubtle}` }}
    >
      {current !== undefined && (
        <div>
          <CapsLabel color={componentTheme.fgMuted}>Current</CapsLabel>
          <div style={{ ...valueSx, color: componentTheme.fgDefault }}>
            <WrapValue>{current}</WrapValue>
          </div>
        </div>
      )}
      <div>
        <CapsLabel color={ink}>{INCOMING_WORD[kind] ?? 'Incoming'}</CapsLabel>
        <div style={{ ...valueSx, color: ink, fontStyle: kind === 'removed' || (kind === 'held' && value === 'deleted upstream') ? 'italic' : undefined }}>
          {diff && !diff.truncated ? <InlineDiffSegments segments={diff.new} changeType='upgrade' /> : <WrapValue>{value}</WrapValue>}
        </div>
      </div>
      {inc.hint && (
        <div style={{ fontFamily: componentTheme.fontSans, fontSize: 11.5, color: componentTheme.fgMuted }}>{inc.hint}</div>
      )}
    </div>
  );
}

/**
 * The quiet Kubernetes defaults that belong to the value (its pull policy, its protocol, its
 * probe timings), which the line does not draw. Each is a button where the sheet can edit: it
 * opens the field's editor on the line, and the field stays there while it is open or staged.
 */
function DefaultsBlock({ fields, onOpen }: { fields?: DefaultField[]; onOpen?: (key: string) => void }) {
  if (!fields?.length) return null;
  return (
    <div
      data-testid='field-peek-defaults'
      style={{ padding: '6px 8px 8px', borderTop: `1px solid ${componentTheme.borderSubtle}` }}
    >
      <div style={{ padding: '0 4px 2px', fontFamily: componentTheme.fontSans, fontSize: 11, fontWeight: 700, color: componentTheme.fgMuted }}>
        Kubernetes {fields.length === 1 ? 'default' : 'defaults'}
      </div>
      {fields.map(({ atom, def }) => {
        const row = (
          <>
            <span style={{ color: componentTheme.fgMuted }}>{def.label}</span>
            <span style={{ color: componentTheme.fgDefault, overflowWrap: 'anywhere' }}>
              {def.text}
              {def.unit}
            </span>
          </>
        );
        return onOpen ? (
          <Box
            component='button'
            type='button'
            key={atom.key}
            data-testid={`field-peek-default-${atom.testKey}`}
            aria-label={`Edit ${def.label}, ${def.text}${def.unit ?? ''}`}
            onClick={() => onOpen(atom.key)}
            sx={{
              ...DEFAULT_ROW,
              border: 0,
              bgcolor: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              '& .pen': { visibility: 'hidden', color: componentTheme.fgMuted },
              '&:hover, &:focus-visible': { bgcolor: componentTheme.bgSubtle },
              '&:hover .pen, &:focus-visible .pen': { visibility: 'visible' },
              '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '-2px' },
            }}
          >
            {row}
            <span className='pen' style={{ display: 'inline-flex', justifySelf: 'end' }}>
              <PencilIcon />
            </span>
          </Box>
        ) : (
          <Box key={atom.key} data-testid={`field-peek-default-${atom.testKey}`} sx={DEFAULT_ROW}>
            {row}
          </Box>
        );
      })}
    </div>
  );
}

const DEFAULT_ROW = {
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr) 14px',
  columnGap: '10px',
  alignItems: 'center',
  width: '100%',
  minHeight: 24,
  px: '4px',
  borderRadius: '4px',
  fontFamily: componentTheme.fontMono,
  fontSize: 11.5,
} as const;

/**
 * The state colours as text in the card, at 4.5:1 or more on white: Stale in the upgrade ink
 * (5.70:1; the chip's lighter violet is 4.34:1), Unreleased in the variation blue (4.98:1).
 */
const STATE_INK = { stale: componentTheme.upgradeInk, unreleased: componentTheme.variation } as const;

const STATE_WORD = { stale: 'Stale', unreleased: 'Unreleased changes' } as const;

function StateLine({ kind }: { kind: 'stale' | 'unreleased' }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: componentTheme.fontSans,
        fontSize: 12,
        color: STATE_INK[kind],
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', width: 11, height: 11 }}>
        {kind === 'stale' ? <UpgradingIcon /> : <PendingIcon />}
      </span>
      {STATE_WORD[kind]}
    </span>
  );
}

/** The shipped peek card's frame, as plain style for the Popper's child. */
function flatSx(): React.CSSProperties {
  const sx = INFO_PEEK_TOOLTIP_SX as Record<string, unknown>;
  return {
    background: sx.bgcolor as string,
    color: sx.color as string,
    border: sx.border as string,
    borderRadius: sx.borderRadius as string,
    boxShadow: sx.boxShadow as string,
    overflow: 'hidden',
  };
}
