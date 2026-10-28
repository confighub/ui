// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState, type KeyboardEvent, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';

import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import { focusWhenDrawn } from './draftFocus';
import {
  BARE_BUTTON,
  DRAFT_TRANSITION,
  FACT_MONO_SX,
  FACT_SLOT_SX,
  FACT_SLOT_VALUE,
  FOCUS_RING,
  POPOVER_PAPER_SX,
  PRESS,
  REDUCED_MOTION,
} from './draftLook';
import { factSlotLabel } from './draftPageModel';

/**
 * The options a popover's arrow keys move between: one that cannot be picked too, so what it says
 * about why is read.
 */
const OPTION_SELECTOR = '[data-draft-option]';

/** One tab stop per popover list: the focused option takes it, the rest are reached by arrows. */
function rove(container: HTMLElement, active: HTMLElement) {
  for (const option of container.querySelectorAll<HTMLElement>(OPTION_SELECTOR)) option.tabIndex = option === active ? 0 : -1;
}

/**
 * A popover's search field works as a combobox's: Down goes to the first option the search kept,
 * Enter picks it. Everything else typed there is left to the field.
 */
function fromSearch(event: KeyboardEvent<HTMLElement>) {
  const first = event.currentTarget.querySelector<HTMLElement>(OPTION_SELECTOR);
  if (first === null) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    rove(event.currentTarget, first);
    first.focus();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    first.click();
  }
}

/** Up and Down move between a popover's options; Home and End go to either end. Typing in a field is left alone. */
function moveBetweenOptions(event: KeyboardEvent<HTMLElement>) {
  if (event.target instanceof HTMLInputElement) {
    fromSearch(event);
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const options = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(OPTION_SELECTOR));
  if (options.length === 0) return;
  event.preventDefault();
  const at = options.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowDown'
          ? (at + 1) % options.length
          : (at - 1 + options.length) % options.length;
  rove(event.currentTarget, options[next]);
  options[next].focus();
}

/** On open: the search field when there is one, else the chosen option, else the first. */
function focusChosen(node: HTMLElement) {
  const search = node.querySelector<HTMLElement>('input');
  const chosen = node.querySelector<HTMLElement>(`${OPTION_SELECTOR}[aria-checked="true"]`);
  const first = chosen ?? node.querySelector<HTMLElement>(OPTION_SELECTOR);
  if (first !== null) rove(node, first);
  (search ?? first)?.focus();
}

/** How long a popover takes to open and to close: fixed, so its close has a known end. */
const POPOVER_DURATION = { enter: 200, exit: 150 };
/** How long past its close transition a closed popover may stay before it is unmounted anyway. */
const CLOSE_GRACE_MS = 100;

export interface DraftPopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  label: string;
  wide?: boolean;
  /** About how tall it opens: it opens above its anchor when that much does not fit below. */
  height?: number;
  /** Return focus to the anchor on close. Off when the action taken sends focus somewhere else. */
  restoreFocus?: boolean;
  /** Which edges line up: an anchor at the right of the page opens its popover leftwards. */
  align?: 'left' | 'right';
  children: ReactNode;
}

/**
 * A choice that stays open for a click: the template, workflow, scope and update-type
 * pickers, and an outlier's actions. Opens under its anchor, left edges aligned; Escape and a
 * click outside close it and return focus to the anchor. It grows in, except for those who ask
 * for less motion.
 */
export function DraftPopover({
  anchorEl,
  onClose,
  label,
  wide = false,
  height = 260,
  restoreFocus = true,
  align = 'left',
  children,
}: DraftPopoverProps) {
  // Measured once, as it opens: a popover that would cover its own anchor opens above it instead.
  // Each opening is a popover of its own (`opening` is its key), so one reopened while the last
  // is still closing never inherits that one's half-run transition.
  const [placement, setPlacement] = useState<{ anchor: HTMLElement | null; above: boolean; opening: number }>({
    anchor: null,
    above: false,
    opening: 0,
  });
  if (placement.anchor !== anchorEl) {
    const rect = anchorEl?.getBoundingClientRect();
    const below = rect === undefined ? Infinity : window.innerHeight - rect.bottom;
    setPlacement({
      anchor: anchorEl,
      above: rect !== undefined && below < height && rect.top > below,
      opening: anchorEl !== null && placement.anchor === null ? placement.opening + 1 : placement.opening,
    });
  }
  // The last opening that has finished closing. A closed popover is unmounted once its close has
  // run, whether or not the transition says so: MUI's close can be stranded when the page
  // re-renders under it (a pick that moves the URL), leaving it invisible on the page with its
  // backdrop taking every click.
  const [closed, setClosed] = useState(0);
  const reduceMotion = useMediaQuery(REDUCED_MOTION);
  const exitMs = reduceMotion ? 0 : POPOVER_DURATION.exit;
  const opening = placement.opening;
  const above = placement.above;
  if (anchorEl === null && closed === opening) return null;
  return (
    <Popover
      key={opening}
      open={anchorEl !== null}
      transitionDuration={reduceMotion ? 0 : POPOVER_DURATION}
      anchorEl={anchorEl}
      onClose={onClose}
      disableRestoreFocus={!restoreFocus}
      anchorOrigin={{ vertical: above ? 'top' : 'bottom', horizontal: align }}
      transformOrigin={{ vertical: above ? 'bottom' : 'top', horizontal: align }}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': label,
          sx: { ...POPOVER_PAPER_SX, marginTop: above ? '-6px' : '6px', ...(wide ? { minWidth: 'min(340px, calc(100vw - 32px))', maxWidth: 'min(420px, calc(100vw - 32px))' } : {}) },
        },
        transition: {
          onEntered: focusChosen,
          onExit: () => window.setTimeout(() => setClosed(opening), exitMs + CLOSE_GRACE_MS),
          onExited: () => setClosed(opening),
        },
      }}
    >
      <Box
        onKeyDown={moveBetweenOptions}
        onFocus={(event) => {
          if (event.target instanceof HTMLElement && event.target.matches(OPTION_SELECTOR)) rove(event.currentTarget, event.target);
        }}
        onInput={(event) => {
          // The search changed what is listed: the first option left holds the list's one tab stop,
          // once the list is drawn again.
          const container = event.currentTarget;
          window.requestAnimationFrame(() => {
            const first = container.querySelector<HTMLElement>(OPTION_SELECTOR);
            if (first !== null) rove(container, first);
          });
        }}
      >
        {children}
      </Box>
    </Popover>
  );
}

/** How long a pointer rests on a control before its name shows. */
const TOOLTIP_DELAY_MS = 400;

export interface RevertButtonProps {
  /** Its name and tooltip: "Back to UpgradeUnit". */
  label: string;
  onClick: () => void;
}

/**
 * The way back to last time, beside a changed fact or a name that is not the default: an icon,
 * named on hover and to a screen reader. It is a shape as well as the rust rule, so "changed"
 * never rests on colour alone.
 */
export function RevertButton({ label, onClick }: RevertButtonProps) {
  return (
    <Tooltip title={label} enterDelay={TOOLTIP_DELAY_MS}>
      <Box
        component="button"
        type="button"
        aria-label={label}
        onClick={onClick}
        data-testid="draft-revert"
        sx={{
          ...BARE_BUTTON,
          display: 'inline-grid',
          placeItems: 'center',
          flex: 'none',
          width: 24,
          height: 24,
          // A 24px target that takes no more height than the line it sits on.
          margin: '-3px 0 -3px 2px',
          verticalAlign: 'middle',
          borderRadius: '5px',
          color: changeOrderInk.subtle,
          transition: DRAFT_TRANSITION,
          '&:hover': { background: changeOrderSurface.inset, color: changeOrderAction.ink },
          '&:focus-visible': { ...FOCUS_RING, color: changeOrderAction.ink },
          ...PRESS,
        }}
      >
        <HistoryIcon aria-hidden sx={{ fontSize: 16 }} />
      </Box>
    </Tooltip>
  );
}

/** Marks last time's option in a fact's popover: a history icon, "Last time" on hover and to a screen reader. */
export function LastTimeMark() {
  const label = draftCopy.page.facts.lastTime;
  return (
    <Tooltip title={label} enterDelay={TOOLTIP_DELAY_MS}>
      <Box
        component="span"
        role="img"
        aria-label={label}
        data-testid="draft-last-time"
        sx={{ display: 'inline-grid', placeItems: 'center', alignSelf: 'center', flex: 'none', color: changeOrderInk.subtle }}
      >
        <HistoryIcon aria-hidden sx={{ fontSize: 14 }} />
      </Box>
    </Tooltip>
  );
}

export interface FactSlotProps {
  id: string;
  testId?: string;
  /** The fact's term: "Workflow". */
  term: string;
  /** Its value as drawn: "main-line", "8 variants". */
  value: string;
  /**
   * Last time's value, when this draft changes it: the rule turns rust, the slot's name says
   * what it was, and `revert` goes back to it.
   */
  last?: string;
  /** The way back to `last`. */
  revert?: RevertButtonProps;
  /** Its popover is open. */
  open: boolean;
  /** A slug or a code word: the facts' mono, never translated. */
  mono?: boolean;
  /** The value's ink, where it is not the default (a choice nobody has made yet, an empty scope). */
  tone?: string;
  /** The ids of the problems said about it (`draftProblemId`): it is described by them, and invalid while there are any. */
  problemIds?: readonly string[];
  onOpen: (anchor: HTMLElement) => void;
}

/**
 * A fact in the summary's facts row that the draft can change: the value on a dashed rule and a
 * chevron, opening its popover, and the way back to last time while it differs. It stays where it
 * is while the popover is open, so closing the popover gives the keyboard back to it. A value cut
 * short by its column shows whole on hover.
 */
export function FactSlot({ id, testId, term, value, last, revert, open, mono = false, tone, problemIds = [], onOpen }: FactSlotProps) {
  const [truncated, setTruncated] = useState(false);
  const measure = (slot: HTMLElement) => {
    const text = slot.querySelector(`.${FACT_SLOT_VALUE}`);
    setTruncated(text !== null && text.scrollWidth > text.clientWidth);
  };
  return (
    // The slot and its way back stay together, and the value gives way when the column is narrow.
    // Its padding hangs left of the column, so the value lines up with the term above it.
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', maxWidth: 'calc(100% + 3px)', minWidth: 0, marginLeft: '-3px' }}>
      <Tooltip title={truncated && !open ? value : ''} enterDelay={TOOLTIP_DELAY_MS} describeChild>
        <Box
          component="button"
          type="button"
          id={id}
          data-testid={testId}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={factSlotLabel(term, value, last)}
          aria-invalid={problemIds.length > 0 ? true : undefined}
          aria-describedby={problemIds.length > 0 ? problemIds.join(' ') : undefined}
          data-changed={last === undefined ? undefined : ''}
          onPointerEnter={(event) => measure(event.currentTarget)}
          onFocus={(event) => measure(event.currentTarget)}
          onClick={(event) => onOpen(event.currentTarget)}
          sx={FACT_SLOT_SX}
        >
          <Box
            component="span"
            className={FACT_SLOT_VALUE}
            translate={mono ? 'no' : undefined}
            sx={{ ...(mono ? FACT_MONO_SX : {}), ...(tone === undefined ? {} : { color: tone }) }}
          >
            {value}
          </Box>
          <ExpandMoreIcon aria-hidden />
        </Box>
      </Tooltip>
      {last === undefined || revert === undefined ? null : (
        <RevertButton
          label={revert.label}
          onClick={() => {
            revert.onClick();
            // The undo goes with the change; the keyboard stays on the fact it put back.
            focusWhenDrawn(id);
          }}
        />
      )}
    </Box>
  );
}

export interface PopoverHeadingProps {
  icon?: ReactNode;
  children: ReactNode;
}

/** A popover's heading: small, quiet, with the icon of what it picks. */
export function PopoverHeading({ icon, children }: PopoverHeadingProps) {
  return (
    <Box
      component="h2"
      sx={{
        margin: '4px 8px 6px',
        fontSize: changeOrderType.size.small,
        lineHeight: changeOrderType.lineHeight.body,
        fontWeight: changeOrderType.weight.semibold,
        color: changeOrderInk.subtle,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        '& .MuiSvgIcon-root': { fontSize: 15 },
      }}
    >
      {icon}
      {children}
    </Box>
  );
}

/** The rule between a popover's groups of options. */
export function PopoverDivider() {
  return (
    <Box
      component="hr"
      aria-hidden="true"
      sx={{ border: 0, borderTop: `1px solid ${changeOrderBorder.default}`, margin: '6px 2px' }}
    />
  );
}

export interface OptionTextProps {
  title: ReactNode;
  sub?: ReactNode;
  mono?: boolean;
}

/** An option's text: a title line and an optional quieter line under it. */
export function OptionText({ title, sub, mono = false }: OptionTextProps) {
  return (
    <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'block' }}>
      <Box
        component="span"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: changeOrderType.weight.semibold,
          color: changeOrderInk.default,
          ...(mono ? { fontFamily: changeOrderFontMono, fontSize: 12 } : {}),
        }}
      >
        {title}
      </Box>
      {sub === undefined ? null : (
        <Box component="span" sx={{ display: 'block', fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
          {sub}
        </Box>
      )}
    </Box>
  );
}

export interface OptionAsideProps {
  children: ReactNode;
}

/** An option's right-hand note: a date, a count. */
export function OptionAside({ children }: OptionAsideProps) {
  return (
    <Box component="span" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, whiteSpace: 'nowrap' }}>
      {children}
    </Box>
  );
}
