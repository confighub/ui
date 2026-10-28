// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { KeyboardEvent } from 'react';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import HistoryIcon from '@mui/icons-material/History';
import UpgradeIcon from '@mui/icons-material/Upgrade';

import { VISUALLY_HIDDEN_SX } from '@/utility/visually-hidden';

import {
  changeOrderFontMono,
  changeOrderInk,
  changeOrderSelectedRing,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import { focusWhenDrawn } from './draftFocus';
import { BARE_BUTTON, DRAFT_TRANSITION, FOCUS_RING, PRESS } from './draftLook';
import { factSlotLabel } from './draftPageModel';
import { RevertButton } from './DraftPopover';
import type { DraftReadStatus, DraftUpdateType } from './draftTypes';
import type { DraftUpdateTypeAvailability } from './draftUpdateTypes';
import type { DraftIcon } from './kindIcons';

const copy = draftCopy.page.updateType;

/** The id the blocker focuses when the update type holds the first problem: the chosen option. */
export const DRAFT_UPDATE_TYPE_ID = 'draft-update-type';

const ICON: Record<DraftUpdateType, DraftIcon> = { UpgradeUnit: UpgradeIcon, MergeUnits: CallMergeIcon };

/** How long a pointer rests on an option before what it does shows. */
const TOOLTIP_DELAY_MS = 400;

export interface UpdateTypeBarProps<T extends string = DraftUpdateType> {
  /** The types the change's kind chooses between, in order. */
  types: readonly T[];
  value: T;
  /** Last time's type, marked on its option. `undefined` with no last ChangeOrder to compare. */
  last: T | undefined;
  /** This draft's type is not last time's, and last time's can be gone back to: the bar says what it was, and offers the way back. */
  changed: boolean;
  /** Whether each type's Links reach the scope. */
  availability: Readonly<Record<T, DraftUpdateTypeAvailability>>;
  /** Each type's mark and what it does: Base changes' own when absent. */
  icons?: Readonly<Record<T, DraftIcon>>;
  tips?: Readonly<Record<T, string>>;
  /** Why a type whose Links reach no variant in scope cannot be chosen. */
  noLinkTip?: (type: T) => string;
  /** The id the chosen option takes, which a blocker focuses. */
  id?: string;
  testId?: string;
  /** Where the Links read is: while it loads, the other options are inert; when it failed, all can be chosen. */
  linksStatus: DraftReadStatus;
  onRetryLinks: () => void;
  /** The ids of the problems said about the update type. */
  problemIds: readonly string[];
  onPick: (value: T) => void;
  /** Back to last time's type. */
  onRevert: () => void;
}

/**
 * How the change propagates, under its kind's chip: one option per update type, a radio group
 * (the arrows move and choose; one tab stop). A type whose Links reach no variant in scope has
 * nothing to promote, and cannot be chosen; its tooltip says why. While the Links are being
 * read, nothing is said of the other type. If they could not be read, every type can be
 * chosen, and the create dry run decides.
 */
export function UpdateTypeBar<T extends string = DraftUpdateType>({
  types,
  value,
  last,
  changed,
  availability,
  icons,
  tips,
  noLinkTip = draftCopy.problems.updateTypeNoLink,
  id = DRAFT_UPDATE_TYPE_ID,
  testId = 'draft-update-type-bar',
  linksStatus,
  onRetryLinks,
  problemIds,
  onPick,
  onRevert,
}: UpdateTypeBarProps<T>) {
  const iconOf = (type: T): DraftIcon => icons?.[type] ?? ICON[type as unknown as DraftUpdateType] ?? UpgradeIcon;
  const tipOf = (type: T): string => tips?.[type] ?? copy[type as unknown as DraftUpdateType] ?? type;
  const choosable = (type: T) =>
    type === value || (linksStatus === 'failed' ? true : linksStatus === 'resolved' && availability[type] !== 'unavailable');
  const lastLabel = changed ? last : undefined;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const options = types.filter(choosable);
    if (options.length === 0) return;
    let next: T | undefined;
    if (event.key === 'Home') next = options[0];
    else if (event.key === 'End') next = options[options.length - 1];
    else if (step !== undefined) next = options[(options.indexOf(value) + step + options.length) % options.length];
    if (next === undefined) return;
    event.preventDefault();
    const target = event.currentTarget.querySelector<HTMLElement>(`[data-update-type="${next}"]`);
    target?.focus();
    if (next !== value) onPick(next);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 6px', marginTop: '8px', minHeight: 24 }}>
      <Box
        role="radiogroup"
        aria-label={factSlotLabel(copy.title, value, lastLabel)}
        aria-invalid={problemIds.length > 0 ? true : undefined}
        aria-describedby={problemIds.length > 0 ? problemIds.join(' ') : undefined}
        data-testid={testId}
        onKeyDown={onKeyDown}
        sx={{
          display: 'inline-flex',
          gap: '2px',
          padding: '2px',
          borderRadius: `${changeOrderShape.radius.md}px`,
          background: changeOrderSurface.sunk,
        }}
      >
        {types.map((type) => {
          const checked = type === value;
          const unavailable = linksStatus === 'resolved' && availability[type] === 'unavailable' && !checked;
          const inert = !checked && !choosable(type);
          const Icon = iconOf(type);
          const isLast = type === last;
          let tip: string = tipOf(type);
          if (unavailable) tip = noLinkTip(type);
          else if (isLast) tip = `${tipOf(type)} · ${draftCopy.page.facts.lastTime}`;
          return (
            <Tooltip key={type} title={tip} enterDelay={TOOLTIP_DELAY_MS} describeChild>
              <Box
                component="button"
                type="button"
                role="radio"
                id={checked ? id : undefined}
                aria-checked={checked}
                aria-disabled={inert ? true : undefined}
                tabIndex={checked ? 0 : -1}
                data-update-type={type}
                onClick={() => {
                  if (!inert && !checked) onPick(type);
                }}
                sx={{
                  ...BARE_BUTTON,
                  boxSizing: 'border-box',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: 20,
                  padding: '0 7px 0 5px',
                  borderRadius: `${changeOrderShape.radius.sm + 1}px`,
                  fontFamily: changeOrderFontMono,
                  fontSize: changeOrderType.size.small,
                  color: checked ? changeOrderInk.default : changeOrderInk.muted,
                  background: checked ? changeOrderSurface.card : 'transparent',
                  boxShadow: checked ? changeOrderSelectedRing : 'none',
                  whiteSpace: 'nowrap',
                  transition: DRAFT_TRANSITION,
                  '& .MuiSvgIcon-root': { fontSize: 14, color: checked ? changeOrderInk.muted : changeOrderInk.subtle },
                  '&:hover': inert ? {} : { background: checked ? changeOrderSurface.card : changeOrderSurface.inset },
                  '&:focus-visible': { ...FOCUS_RING, outlineOffset: 1 },
                  '&[aria-disabled="true"]': { cursor: 'not-allowed' },
                  // Not chosen and cannot be: quiet, not struck; the tooltip says why.
                  ...(unavailable ? { color: changeOrderInk.subtle, opacity: 0.6 } : {}),
                  ...(inert ? {} : PRESS),
                }}
              >
                <Icon aria-hidden />
                {type}
                {isLast ? (
                  <>
                    <HistoryIcon aria-hidden sx={{ '&&': { fontSize: 12 } }} />
                    <Box component="span" sx={VISUALLY_HIDDEN_SX}>
                      {`, ${draftCopy.page.facts.lastTime}`}
                    </Box>
                  </>
                ) : null}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      {lastLabel === undefined ? null : (
        <RevertButton
          label={draftCopy.page.facts.backTo(lastLabel)}
          onClick={() => {
            onRevert();
            // The undo goes with the change; the keyboard lands on the option it chose again.
            focusWhenDrawn(id, { fresh: true });
          }}
        />
      )}
      {linksStatus === 'failed' ? <CouldNotEstablish onRetry={onRetryLinks} retryWhat={draftCopy.page.retryWhat.links} /> : null}
    </Box>
  );
}
