// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState, type KeyboardEvent, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Popover from '@mui/material/Popover';

import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderType } from '../changeOrdersTokens';
import { POPOVER_PAPER_SX } from './draftLook';

/** The options a popover's arrow keys move between. */
const OPTION_SELECTOR = '[data-draft-option]:not([aria-disabled="true"])';

/** One tab stop per popover list: the focused option takes it, the rest are reached by arrows. */
function rove(container: HTMLElement, active: HTMLElement) {
  for (const option of container.querySelectorAll<HTMLElement>(OPTION_SELECTOR)) option.tabIndex = option === active ? 0 : -1;
}

/** Up and Down move between a popover's options; Home and End go to either end. Typing in a field is left alone. */
function moveBetweenOptions(event: KeyboardEvent<HTMLElement>) {
  if (event.target instanceof HTMLInputElement) return;
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
 * click outside close it and return focus to the anchor.
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
  const [placement, setPlacement] = useState<{ anchor: HTMLElement | null; above: boolean }>({ anchor: null, above: false });
  if (placement.anchor !== anchorEl) {
    const rect = anchorEl?.getBoundingClientRect();
    const below = rect === undefined ? Infinity : window.innerHeight - rect.bottom;
    setPlacement({ anchor: anchorEl, above: rect !== undefined && below < height && rect.top > below });
  }
  const above = placement.above;
  return (
    <Popover
      open={anchorEl !== null}
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
        transition: { onEntered: focusChosen },
      }}
    >
      <Box
        onKeyDown={moveBetweenOptions}
        onFocus={(event) => {
          if (event.target instanceof HTMLElement && event.target.matches(OPTION_SELECTOR)) rove(event.currentTarget, event.target);
        }}
      >
        {children}
      </Box>
    </Popover>
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
