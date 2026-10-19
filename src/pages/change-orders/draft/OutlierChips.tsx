// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import HistoryIcon from '@mui/icons-material/History';
import RemoveIcon from '@mui/icons-material/Remove';
import BlockIcon from '@mui/icons-material/Block';

import { serverPathLabels } from '@/components/config-diff/configDiffTree';

import { componentTheme } from '../../x/apps/componentTheme';
import type { ChangeOrderOutcomeKind } from '../changeOrderOutcome';
import { OUTCOME_META } from '../components/outcomeMeta';
import {
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import { BARE_BUTTON, CODE_SX, DRAFT_TRANSITION, FOCUS_RING, OPEN_PRESSED, PRESS } from './draftLook';
import type { OutlierAction } from './draftPageModel';
import { DraftPopover, PopoverHeading } from './DraftPopover';
import type { DraftOutlierFact } from './draftPreview';

const copy = draftCopy.page.outlier;

/** Chips shown before the rest fold into "+K". */
const SHOWN = 4;

/** The popover's actions: neutral, like the detail view's secondary buttons; neither is the page's primary action. */
const QUIET_BUTTON_SX = {
  color: componentTheme.fgMuted,
  borderColor: componentTheme.borderDefault,
  background: changeOrderSurface.card,
  '&:hover': { background: componentTheme.bgInset, borderColor: changeOrderBorder.strong },
  '&:focus-visible': FOCUS_RING,
  '& .MuiButton-startIcon .MuiSvgIcon-root': { fontSize: 16 },
} as const;

const CHIP_SX = {
  ...BARE_BUTTON,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: 26,
  padding: '3px 9px 3px 7px',
  borderRadius: '7px',
  border: `1px solid ${changeOrderBorder.default}`,
  background: changeOrderSurface.card,
  fontSize: 12,
  lineHeight: changeOrderType.lineHeight.heading,
  color: changeOrderInk.muted,
  maxWidth: '100%',
  transition: DRAFT_TRANSITION,
  '&:hover': { borderColor: changeOrderBorder.strong, background: changeOrderSurface.sunk },
  '&:focus-visible': FOCUS_RING,
  ...OPEN_PRESSED,
  ...PRESS,
} as const;

export interface OutcomeSquareProps {
  kind: ChangeOrderOutcomeKind;
}

/** The square in front of an outlier: the outcome its stage puts it in. */
export function OutcomeSquare({ kind }: OutcomeSquareProps) {
  return (
    <Box
      component="i"
      aria-hidden="true"
      sx={{ width: 8, height: 8, borderRadius: `${changeOrderShape.radius.xs}px`, flex: 'none', background: OUTCOME_META[kind].tone }}
    />
  );
}

interface CodeProps {
  children: ReactNode;
}

function Code({ children }: CodeProps) {
  return (
    <Box component="code" translate="no" sx={{ ...CODE_SX, fontSize: 11 }}>
      {children}
    </Box>
  );
}

/** `limits.memory`, `data.RETRY_LIMIT`: the last two fields of a server path, past any merge-keyed element. */
function shortPath(path: string): string {
  return serverPathLabels(path)
    .filter((label) => !label.startsWith('?'))
    .slice(-2)
    .join('.');
}

interface FactLineProps {
  fact: DraftOutlierFact;
}

/** What the dry run found, as the reader checks it: the path, what the variant keeps, what the base writes. */
function FactLine({ fact }: FactLineProps) {
  if (fact.kind === 'adds') {
    return (
      <>
        <Code>{fact.slug}</Code> {copy.addsTail}
      </>
    );
  }
  const path = <Code>{shortPath(fact.path)}</Code>;
  // The server's reason decides the words: a protected path is kept on merge, never a "local override".
  const kept =
    fact.reason === 'ProtectedPath' ? (
      <>
        {path} {copy.keptOnMerge}
      </>
    ) : (
      <>
        {fact.reason === 'Subtracted' ? copy.localOverrideKeeps : copy.keeps} {path}
      </>
    );
  if (fact.value === undefined) return <>{kept}.</>;
  return (
    <>
      {kept} {copy.at} <Code>{fact.value}</Code>
      {fact.incoming === undefined ? null : (
        <>
          ; {copy.baseWrites} <Code>{fact.incoming}</Code>
        </>
      )}
      .
    </>
  );
}

interface OutlierChipProps {
  item: OutlierAction;
  expanded: boolean;
  onOpen: (anchor: HTMLElement) => void;
}

function OutlierChip({ item, expanded, onOpen }: OutlierChipProps) {
  return (
    <Box
      component="button"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={`${item.outlier.name} ${item.outlier.text}`}
      data-outlier={item.outlier.name}
      onClick={(event) => onOpen(event.currentTarget)}
      sx={CHIP_SX}
    >
      <OutcomeSquare kind={item.kind} />
      <ChipName>{item.outlier.name}</ChipName>
      <span>{item.outlier.text}</span>
    </Box>
  );
}

interface ChipNameProps {
  children: ReactNode;
}

/** The variant's name in a chip: code, never broken across lines. */
function ChipName({ children }: ChipNameProps) {
  return (
    <Box
      component="b"
      translate="no"
      sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.strong, color: changeOrderInk.default, fontSize: changeOrderType.size.small, whiteSpace: 'nowrap' }}
    >
      {children}
    </Box>
  );
}

interface VariantPillProps {
  name: string;
}

/** The variant a popover is about, as the detail view's variant pill. */
function VariantPill({ name }: VariantPillProps) {
  return (
    <Box sx={{ padding: '0 8px 6px' }}>
      <Box
        component="span"
        translate="no"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 22,
          padding: '0 8px',
          borderRadius: `${changeOrderShape.radius.pill}px`,
          border: `1px solid ${changeOrderBorder.strong}`,
          fontFamily: changeOrderFontMono,
          fontSize: changeOrderType.size.small,
          color: changeOrderInk.muted,
        }}
      >
        {name}
      </Box>
    </Box>
  );
}

const FACT_SX = { padding: '2px 8px 6px', fontSize: 12, lineHeight: changeOrderType.lineHeight.body, color: changeOrderInk.muted, maxWidth: 340 } as const;

export interface OutlierChipsProps {
  items: readonly OutlierAction[];
  onShow: (item: OutlierAction) => void;
  onLeaveOut: (item: OutlierAction) => void;
}

/**
 * The variants the dry run says will not take the change as the base wrote it, one chip each: a
 * value it keeps, a resource it does not have yet. The first few show; the rest fold into "+K".
 * A chip opens what was found, with Show (its stage's card) and Leave out (out of scope, with an
 * undo).
 */
export function OutlierChips({ items, onShow, onLeaveOut }: OutlierChipsProps) {
  const [open, setOpen] = useState<{ anchor: HTMLElement; item: OutlierAction } | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  // Show and Leave out send focus on themselves (the stage card, the Undo); Escape returns it to the chip.
  const [restoreFocus, setRestoreFocus] = useState(true);
  const close = () => {
    setRestoreFocus(true);
    setOpen(null);
  };
  const act = (action: (item: OutlierAction) => void, item: OutlierAction) => {
    setRestoreFocus(false);
    setOpen(null);
    action(item);
  };
  const shown = items.slice(0, SHOWN);
  const rest = items.slice(SHOWN);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minWidth: 0 }} data-testid="draft-outliers">
      {shown.map((item, index) => (
        <OutlierChip
          key={index}
          item={item}
          expanded={open?.item.outlier.spaceId === item.outlier.spaceId}
          onOpen={(anchor) => setOpen({ anchor, item })}
        />
      ))}
      {rest.length === 0 ? null : (
        <Box
          component="button"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreAnchor !== null}
          aria-label={copy.moreLabel(rest.length)}
          onClick={(event) => setMoreAnchor(event.currentTarget)}
          sx={{ ...CHIP_SX, fontWeight: changeOrderType.weight.semibold }}
        >
          +{rest.length}
        </Box>
      )}
      <DraftPopover anchorEl={moreAnchor} onClose={() => setMoreAnchor(null)} label={copy.more(rest.length)} wide>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', padding: '4px' }}>
          {rest.map((item, index) => (
            <OutlierChip
              key={index}
              item={item}
              expanded={false}
              onOpen={() => {
                const anchor = moreAnchor;
                setMoreAnchor(null);
                if (anchor !== null) setOpen({ anchor, item });
              }}
            />
          ))}
        </Box>
      </DraftPopover>
      <DraftPopover anchorEl={open?.anchor ?? null} onClose={close} label={open?.item.outlier.name ?? ''} restoreFocus={restoreFocus}>
        {open === null ? null : (
          <>
            <PopoverHeading icon={<HistoryIcon aria-hidden />}>{draftCopy.page.ledger.variants(1)}</PopoverHeading>
            <Box sx={FACT_SX}>
              {open.item.outlier.facts.map((fact, index) => (
                <Box key={index}>
                  <FactLine fact={fact} />
                </Box>
              ))}
            </Box>
            <VariantPill name={open.item.outlier.name} />
            <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '6px 8px 4px' }}>
              {open.item.stage === undefined ? null : (
                <Button
                  size="small"
                  variant="outlined"
                  sx={QUIET_BUTTON_SX}
                  startIcon={<ArrowDownwardIcon />}
                  onClick={() => act(onShow, open.item)}
                >
                  {copy.show}
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                sx={QUIET_BUTTON_SX}
                startIcon={<RemoveIcon />}
                onClick={() => act(onLeaveOut, open.item)}
              >
                {copy.leaveOut}
              </Button>
            </Box>
          </>
        )}
      </DraftPopover>
    </Box>
  );
}

/** A variant in scope that no stage of the workflow holds. */
export interface OutsideVariant {
  spaceId: string;
  /** Its display name. */
  name: string;
}

export interface OutsideChipsProps {
  variants: readonly OutsideVariant[];
  /** The workflow none of whose stages hold them. */
  workflowSlug: string;
  onLeaveOut: (spaceIds: readonly string[]) => void;
}

/**
 * The variants in scope on no stage of the workflow, as outlier chips in the "could not
 * establish" tone: the server accepts them, and no promotion reaches them. Each opens what that
 * means, with Leave out.
 */
export function OutsideChips({ variants, workflowSlug, onLeaveOut }: OutsideChipsProps) {
  const [open, setOpen] = useState<{ anchor: HTMLElement; variant: OutsideVariant } | null>(null);
  const [restoreFocus, setRestoreFocus] = useState(true);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minWidth: 0 }} data-testid="draft-outside-chips">
      {variants.map((variant) => (
        <Box
          key={variant.spaceId}
          component="button"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open?.variant.spaceId === variant.spaceId}
          aria-label={`${variant.name} ${copy.outsideText}`}
          onClick={(event) => {
            setRestoreFocus(true);
            setOpen({ anchor: event.currentTarget, variant });
          }}
          sx={CHIP_SX}
        >
          <OutcomeSquare kind="unknown" />
          <ChipName>{variant.name}</ChipName>
          <span>{copy.outsideText}</span>
        </Box>
      ))}
      <DraftPopover anchorEl={open?.anchor ?? null} onClose={() => setOpen(null)} label={open?.variant.name ?? ''} restoreFocus={restoreFocus}>
        {open === null ? null : (
          <>
            <PopoverHeading icon={<BlockIcon aria-hidden />}>{draftCopy.page.ledger.variants(1)}</PopoverHeading>
            <Box sx={FACT_SX}>
              <Code>{open.variant.name}</Code> {copy.outsideLine} <Code>{workflowSlug}</Code>
              {copy.outsideTail}
            </Box>
            <VariantPill name={open.variant.name} />
            <Box sx={{ display: 'flex', gap: '6px', padding: '6px 8px 4px' }}>
              <Button
                size="small"
                variant="outlined"
                sx={QUIET_BUTTON_SX}
                startIcon={<RemoveIcon />}
                onClick={() => {
                  setRestoreFocus(false);
                  setOpen(null);
                  onLeaveOut([open.variant.spaceId]);
                }}
              >
                {copy.leaveOut}
              </Button>
            </Box>
          </>
        )}
      </DraftPopover>
    </Box>
  );
}
