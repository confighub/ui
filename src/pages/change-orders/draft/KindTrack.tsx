// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { KeyboardEvent } from 'react';

import Box from '@mui/material/Box';
import HistoryIcon from '@mui/icons-material/History';

import {
  changeOrderAction,
  changeOrderCardTokens,
  changeOrderFontMono,
  changeOrderFontSans,
  changeOrderInk,
  changeOrderSelectedRing,
  changeOrderStatus,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import { focusWhenDrawn } from './draftFocus';
import { DRAFT_KINDS, type DraftKind } from './draftKinds';
import { BARE_BUTTON, DRAFT_TRANSITION, FOCUS_RING, PRESS } from './draftLook';
import { DraftPeek, PeekCode } from './DraftPeek';
import { RevertButton } from './DraftPopover';
import { KIND_ICON } from './kindIcons';
import type { DraftPastChangeOrder } from './draftTypes';

/** The id the blocker focuses when the kind holds the first problem: the chosen segment. */
export const DRAFT_KIND_ID = 'draft-kind';

const copy = draftCopy.kinds;

const NONE = {};

/** The update type a kind's ChangeOrder carries, for its peek: the re-aimed one's, else the kind's default. */
function updateTypeWord(kind: DraftKind, template: DraftPastChangeOrder | undefined): string {
  if (kind === 'invoke') return 'Invoke';
  if (kind === 'transformPaths') return template?.updateType ?? 'TransformPaths';
  return template?.updateType ?? 'UpgradeUnit';
}

export interface KindTrackProps {
  value: DraftKind;
  /** The kind of the ChangeOrder re-aimed, marked on its segment; none from the policy. */
  last: DraftKind | undefined;
  /** The kind is not the re-aimed ChangeOrder's: the track offers the way back. */
  changed: boolean;
  /** What each kind would re-aim: its newest ChangeOrder, or none (the policy). */
  templates: Readonly<Record<DraftKind, DraftPastChangeOrder | undefined>>;
  /** How many changes wait in the base, for Base changes' count; undefined until read. */
  baseCount: number | undefined;
  /** Kinds that cannot be chosen for this draft, with why: their segment is inert and says so. */
  unavailable?: Readonly<Partial<Record<DraftKind, string>>>;
  /** A segment's name where it is not the kind's own: Transform paths named for the type chosen. */
  labels?: Readonly<Partial<Record<DraftKind, string>>>;
  onPick: (kind: DraftKind) => void;
  onRevert: () => void;
}

/**
 * What kind of change the draft makes, as a segmented track: Base changes, with how many wait in
 * the base; Invoke; Transform paths, inert where no variant reads a shared source. A
 * radio group: one tab stop, the arrows move and choose.
 * Each segment's peek says what the kind changes, what choosing it starts from, and the update
 * type it makes. A kind that is not the re-aimed ChangeOrder's has the way back beside the track.
 */
export function KindTrack({ value, last, changed, templates, baseCount, unavailable = NONE, labels = NONE, onPick, onRevert }: KindTrackProps) {
  const labelOf = (kind: DraftKind) => labels[kind] ?? copy[kind];
  // The arrows move between the kinds that can be chosen; an inert one is skipped.
  const choosable = DRAFT_KINDS.filter((kind) => kind === value || unavailable[kind] === undefined);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    let next: DraftKind | undefined;
    if (event.key === 'Home') next = choosable[0];
    else if (event.key === 'End') next = choosable[choosable.length - 1];
    else if (step !== undefined) next = choosable[(choosable.indexOf(value) + step + choosable.length) % choosable.length];
    if (next === undefined) return;
    event.preventDefault();
    event.currentTarget.querySelector<HTMLElement>(`[data-kind="${next}"]`)?.focus();
    if (next !== value) onPick(next);
  };
  const lastLabel = changed && last !== undefined ? labelOf(last) : undefined;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
      <Box
        role="radiogroup"
        aria-label={lastLabel === undefined ? copy.label : `${copy.label}, ${draftCopy.page.facts.was(lastLabel)}`}
        data-testid="draft-kind-track"
        onKeyDown={onKeyDown}
        sx={{ display: 'inline-flex', background: changeOrderSurface.inset, borderRadius: '7px', padding: '2px', gap: '2px' }}
      >
        {DRAFT_KINDS.map((kind) => {
          const checked = kind === value;
          const Icon = KIND_ICON[kind];
          const template = templates[kind];
          const isLast = changed && kind === last;
          const reason = checked ? undefined : unavailable[kind];
          const name = [labelOf(kind), kind === 'baseChanges' && baseCount !== undefined ? draftCopy.page.facts.changesCount(baseCount) : undefined, isLast ? draftCopy.page.facts.lastTime : undefined, reason]
            .filter((part) => part !== undefined)
            .join(', ');
          return (
            <DraftPeek
              key={kind}
              spec={{
                eyebrow: labelOf(kind),
                icon: <Icon aria-hidden />,
                lines: [
                  ...(reason === undefined ? [] : [<Box key="reason" component="span" sx={{ color: changeOrderStatus.warn }}>{reason}</Box>]),
                  ...(template === undefined
                    ? []
                    : [
                        <span key="template">
                          {`${copy.reAims} `}
                          <PeekCode>{template.slug}</PeekCode>
                        </span>,
                      ]),
                  <PeekCode key="type">{updateTypeWord(kind, template)}</PeekCode>,
                ],
              }}
            >
              <Box
                component="button"
                type="button"
                role="radio"
                aria-label={name}
                id={checked ? DRAFT_KIND_ID : undefined}
                aria-checked={checked}
                aria-disabled={reason === undefined ? undefined : true}
                tabIndex={checked ? 0 : -1}
                data-kind={kind}
                onClick={() => {
                  if (!checked && reason === undefined) onPick(kind);
                }}
                sx={{
                  ...BARE_BUTTON,
                  boxSizing: 'border-box',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: 24,
                  padding: '0 9px',
                  borderRadius: '5px',
                  fontFamily: changeOrderFontSans,
                  fontSize: changeOrderType.size.small,
                  fontWeight: changeOrderType.weight.semibold,
                  letterSpacing: '-.01em',
                  whiteSpace: 'nowrap',
                  color: checked ? changeOrderInk.default : changeOrderInk.muted,
                  background: checked ? changeOrderSurface.card : 'transparent',
                  boxShadow: checked ? `${changeOrderCardTokens.shadow}, ${changeOrderSelectedRing}` : 'none',
                  transition: DRAFT_TRANSITION,
                  // The icon takes the label's ink: the selected segment is told apart by its card and ring.
                  '& > .MuiSvgIcon-root': { fontSize: 15, color: 'inherit' },
                  '&:hover': checked || reason !== undefined ? {} : { background: changeOrderSurface.sunk, color: changeOrderInk.default },
                  // Cannot be chosen here: quiet, never struck; its peek says why.
                  '&[aria-disabled="true"]': { color: changeOrderInk.subtle, cursor: 'not-allowed' },
                  '&:focus-visible': { ...FOCUS_RING, outlineOffset: 1 },
                  ...PRESS,
                }}
              >
                <Icon aria-hidden />
                {labelOf(kind)}
                {kind === 'baseChanges' && baseCount !== undefined ? (
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      fontFamily: changeOrderFontMono,
                      fontSize: changeOrderType.size.micro,
                      fontWeight: changeOrderType.weight.bold,
                      background: changeOrderAction.ink,
                      color: changeOrderSurface.card,
                      borderRadius: `${changeOrderShape.radius.pill}px`,
                      padding: '0 5px',
                      lineHeight: '15px',
                      transition: DRAFT_TRANSITION,
                    }}
                  >
                    {baseCount}
                  </Box>
                ) : null}
                {isLast ? <HistoryIcon aria-hidden sx={{ '&&': { fontSize: 13, color: changeOrderInk.subtle } }} /> : null}
              </Box>
            </DraftPeek>
          );
        })}
      </Box>
      {lastLabel === undefined ? null : (
        <RevertButton
          label={copy.backTo(lastLabel)}
          onClick={() => {
            onRevert();
            focusWhenDrawn(DRAFT_KIND_ID, { fresh: true });
          }}
        />
      )}
    </Box>
  );
}
