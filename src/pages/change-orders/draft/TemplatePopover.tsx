// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

import {
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import { dayMonth } from './draftPageModel';
import { DRAFT_NONE, type DraftAddressPatch, type DraftTemplate, KIND_FIELDS_CLEARED } from './draftDecisions';
import type { DraftKind } from './draftKinds';
import { KIND_ICON } from './kindIcons';
import { BARE_BUTTON, DRAFT_TRANSITION, FOCUS_RING, OPEN_PRESSED, OPTION_SX, PRESS } from './draftLook';
import { DraftPeek, type DraftPeekSpec } from './DraftPeek';
import { DraftPopover, OptionAside, OptionText, PopoverDivider, PopoverHeading } from './DraftPopover';
import type { DraftPastChangeOrder } from './draftTypes';

const copy = draftCopy.page.template;


/**
 * Starting over from another template: every decision returns to what that template says, the
 * kind of change with them.
 */
const RESTART: DraftAddressPatch = { ...KIND_FIELDS_CLEARED, kind: null, name: null, desc: null, wf: null, out: null };

/**
 * The "from <last ChangeOrder>" chip beside the title, and its picker: this base Space's
 * ChangeOrders that propagated over Links, newest first, and the Component's policy alone.
 */
export interface TemplatePickerProps {
  template: DraftTemplate;
  /** The URL names a template that is not there: picking any one, even the policy shown checked, fixes it. */
  stale: boolean;
  pastChangeOrders: readonly DraftPastChangeOrder[];
  componentName: string;
  /** The kind of change a past ChangeOrder made; `undefined` for one no draft re-aims. */
  kindOf: (order: DraftPastChangeOrder) => DraftKind | undefined;
  onChange: (patch: DraftAddressPatch) => void;
}

export function TemplatePicker({ template, stale, pastChangeOrders, componentName, kindOf, onChange }: TemplatePickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const options = pastChangeOrders.flatMap((order) => {
    const kind = kindOf(order);
    return kind === undefined ? [] : [{ order, kind }];
  });
  const current = template.kind === 'changeOrder' ? template.changeOrder : undefined;
  const pick = (from: string) => {
    setAnchor(null);
    // Picking the template the draft already re-aims changes nothing: it never resets the decisions.
    if (!stale && from === (current?.slug ?? DRAFT_NONE)) return;
    onChange({ ...RESTART, from });
  };

  // The policy needs no peek: the trigger already names it.
  const peek: DraftPeekSpec | undefined =
    current === undefined
      ? undefined
      : {
          eyebrow: copy.peekEyebrow,
          icon: <HistoryIcon aria-hidden />,
          title: <span translate="no">{current.slug}</span>,
          lines: [[current.author.name, dayMonth(current.createdAt), current.state].filter(Boolean).join(' · ')],
        };
  const label = `${copy.from} ${current === undefined ? copy.policy(componentName) : current.slug}`;

  const trigger = (
    <Box
      component="button"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={anchor !== null}
      aria-label={label}
      onClick={(event) => setAnchor(event.currentTarget)}
      id="draft-template"
      data-testid="draft-template"
      sx={{
        ...BARE_BUTTON,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        height: 24,
        padding: '0 8px 0 7px',
        borderRadius: `${changeOrderShape.radius.pill}px`,
        border: `1px solid ${changeOrderBorder.default}`,
        background: changeOrderSurface.sunk,
        fontSize: changeOrderType.size.small,
        lineHeight: changeOrderType.lineHeight.body,
        color: changeOrderInk.muted,
        transition: DRAFT_TRANSITION,
        '&:hover': { borderColor: changeOrderBorder.strong, background: changeOrderSurface.inset },
        '&:focus-visible': FOCUS_RING,
        ...OPEN_PRESSED,
        ...PRESS,
      }}
    >
      {current === undefined ? (
        <VerifiedUserOutlinedIcon aria-hidden sx={{ fontSize: 15, color: changeOrderInk.subtle }} />
      ) : (
        <HistoryIcon aria-hidden sx={{ fontSize: 15, color: changeOrderInk.subtle }} />
      )}
      {copy.from}
      <Box
        component="b"
        translate="no"
        sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default }}
      >
        {current === undefined ? copy.policy(componentName) : current.slug}
      </Box>
      <ExpandMoreIcon aria-hidden sx={{ fontSize: 16, color: changeOrderInk.subtle }} />
    </Box>
  );

  return (
    <>
      {peek === undefined ? trigger : <DraftPeek spec={peek}>{trigger}</DraftPeek>}
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={copy.reAim}>
        <PopoverHeading icon={<HistoryIcon aria-hidden />}>{copy.reAim}</PopoverHeading>
        <Box role="menu" aria-label={copy.reAim}>
          {options.map(({ order, kind }) => {
            const KindIcon = KIND_ICON[kind];
            return (
            <Box
              key={order.changeOrderId}
              component="button"
              type="button"
              role="menuitemradio"
              data-draft-option
              aria-checked={current?.changeOrderId === order.changeOrderId}
              onClick={() => pick(order.slug)}
              sx={OPTION_SX}
            >
              <KindIcon aria-hidden />
              <OptionText mono title={<span translate="no">{order.slug}</span>} sub={order.description || undefined} />
              <OptionAside>{dayMonth(order.createdAt)}</OptionAside>
            </Box>
            );
          })}
          {options.length > 0 ? <PopoverDivider /> : null}
          <Box
            component="button"
            type="button"
            role="menuitemradio"
            data-draft-option
            aria-checked={current === undefined}
            onClick={() => pick(DRAFT_NONE)}
            sx={OPTION_SX}
          >
            <VerifiedUserOutlinedIcon aria-hidden />
            <OptionText title={copy.policy(componentName)} />
          </Box>
        </Box>
      </DraftPopover>
    </>
  );
}
