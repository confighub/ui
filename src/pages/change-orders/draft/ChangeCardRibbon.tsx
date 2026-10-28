// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import CommitIcon from '@mui/icons-material/Commit';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import HistoryIcon from '@mui/icons-material/History';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LastPageIcon from '@mui/icons-material/LastPage';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';

import { PersonAvatar } from '../components/ChangeOrderHistoryEntry';
import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { cardsAffectedBy, type DraftChangeSet, type DraftEndOption, type DraftSummaryPart } from './draftChangeCards';
import { draftCopy } from './draftCopy';
import { draftPlaceId, focusWhenDrawn } from './draftFocus';
import { BARE_BUTTON, CODE_SX, DRAFT_TRANSITION, FOCUS_RING, PRESS } from './draftLook';
import { DraftPeek, PeekCode } from './DraftPeek';
import { CouldNotEstablish } from './CouldNotEstablish';
import type { DraftChangeCard, DraftChangeCards } from './useDraftChangeCards';

const copy = draftCopy.page.ribbon;

/** The gap between cards. The ChangeSet bracket's span is worked out from it. */
const GAP = 6;
/** A card narrower than this cannot hold its summary; the ribbon scrolls sideways instead. */
const CARD_MIN = 116;
/** Room above the cards for the start flag's label and the bracket, and below them for the end flag. */
const ABOVE = 22;
const BELOW = 19;

/** The id the blocker focuses when How much holds the first problem, and focus lands on after an end is picked. */
export const DRAFT_END_ID = 'draft-end';

/**
 * Change the end. The control that did it gives way to its opposite (the bracket's "End here"
 * to "End at latest", one end chip to the other): the keyboard lands on the end chip, and waits
 * on What and How much while it is redrawn, never at the page top.
 */
function endAndFollow(onEnd: (end: string | null) => void, end: string | null) {
  onEnd(end);
  focusWhenDrawn(DRAFT_END_ID, { fresh: true, holdAt: draftPlaceId('change') });
}

/**
 * A card's summary, split into its changes (`·` between them). In each change the names it
 * touches (the containers whose image moves, the field and its container) are code; the value it
 * takes is plain text after them, as a reader would say it: `api` → 1.15.0, `api` memory 768Mi.
 */
interface SummaryLineProps {
  parts: readonly DraftSummaryPart[];
}

function SummaryLine({ parts }: SummaryLineProps) {
  const changes: DraftSummaryPart[][] = [[]];
  for (const part of parts) {
    if (!part.mono && part.text === '·') changes.push([]);
    else changes[changes.length - 1].push(part);
  }
  const nodes: ReactNode[] = [];
  changes.forEach((change, changeIndex) => {
    if (changeIndex > 0) nodes.push(<span key={`sep-${changeIndex}`}> · </span>);
    const arrow = change.findIndex((part) => !part.mono && part.text === '→');
    // Before an arrow every name is code; without one, only the first part is the name.
    const codeUntil = arrow >= 0 ? arrow : Math.min(1, change.length);
    change.forEach((part, index) => {
      const key = `${changeIndex}-${index}`;
      const lead = index > 0 ? ' ' : '';
      const code = part.mono && index < codeUntil;
      nodes.push(
        <span key={key}>
          {lead}
          {code ? (
            <Box component="code" translate="no" sx={CODE_SX}>
              {part.text}
            </Box>
          ) : (
            part.text
          )}
        </span>,
      );
    });
  });
  return <>{nodes}</>;
}

/** The day of the month a change was made: the card's corner. */
function dayOf(at: string): string {
  const time = Date.parse(at);
  return Number.isNaN(time) ? '' : new Date(time).toLocaleDateString(undefined, { day: 'numeric' });
}

/** `16 Oct, 13:55` (or `Oct 16, 1:55 PM`) in the reader's own locale. */
function whenOf(at: string): string {
  const time = Date.parse(at);
  if (Number.isNaN(time)) return at;
  return new Date(time).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** The attribute the ribbon finds its end card by. */
const END_ATTRIBUTE = 'data-ribbon-end';
/** The attribute the arrow keys find the cards by. */
const CARD_ATTRIBUTE = 'data-ribbon-card';
/** Room right of the end card for its flag. */
const END_FLAG_ROOM = 8;
/** The start flag's column, which stays at the left edge while the cards scroll under it. */
const START_FLAG_WIDTH = 30;
/** How wide the fade at an edge that has more beyond it is. */
const EDGE_FADE = 28;

interface Edges {
  /** There is more to the left. */
  start: boolean;
  /** There is more to the right. */
  end: boolean;
}

/**
 * A row that scrolls sideways when its cards do not fit: it brings the end card into view when
 * the end changes, and again whenever its size or its content's size changes (the fonts landing,
 * the column narrowing) until the reader scrolls it; and it says which edges have more beyond
 * them, so the page can fade them.
 */
function useSidewaysScroll() {
  const [edges, setEdges] = useState<Edges>({ start: false, end: false });
  const node = useRef<HTMLElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  // Where the ribbon last scrolled itself; a scroll that lands anywhere else is the reader's.
  const placed = useRef(0);
  const readerScrolled = useRef(false);

  const measure = useCallback(() => {
    const scroller = node.current;
    if (scroller === null) return;
    const start = scroller.scrollLeft > 1;
    const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
    setEdges((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
  }, []);

  const bringEndIntoView = useCallback(() => {
    const scroller = node.current;
    if (scroller === null) return;
    const card = scroller.querySelector<HTMLElement>(`[${END_ATTRIBUTE}]`);
    if (card !== null && scroller.scrollWidth > scroller.clientWidth) {
      const box = scroller.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      const past = cardBox.right + END_FLAG_ROOM - box.right;
      // The start flag stays over the left edge: a card under it is not in view.
      const before = box.left + START_FLAG_WIDTH - cardBox.left;
      if (past > 0) scroller.scrollLeft += past;
      else if (before > 0) scroller.scrollLeft -= before;
    }
    placed.current = scroller.scrollLeft;
    measure();
  }, [measure]);

  /** The end changed: it comes into view, whatever the reader did before. */
  const showEnd = useCallback(() => {
    readerScrolled.current = false;
    bringEndIntoView();
  }, [bringEndIntoView]);

  const onResize = useCallback(() => {
    if (readerScrolled.current) measure();
    else bringEndIntoView();
  }, [bringEndIntoView, measure]);

  const onScroll = useCallback(() => {
    const scroller = node.current;
    if (scroller !== null && Math.abs(scroller.scrollLeft - placed.current) > 1) readerScrolled.current = true;
    measure();
  }, [measure]);

  const ref = useCallback(
    (scroller: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      node.current = scroller;
      if (scroller === null) return;
      observer.current = new ResizeObserver(onResize);
      observer.current.observe(scroller);
      if (scroller.firstElementChild !== null) observer.current.observe(scroller.firstElementChild);
    },
    [onResize],
  );

  return { ref, edges, onScroll, showEnd };
}

/**
 * The scroller's mask: a fade at each edge that has more beyond it. The left one starts after
 * the start flag, which stays put over the cards.
 */
function edgeMask({ start, end }: Edges): string | undefined {
  if (!start && !end) return undefined;
  const left = start ? `#000 0, #000 ${START_FLAG_WIDTH}px, rgba(0,0,0,.12) ${START_FLAG_WIDTH}px, #000 ${START_FLAG_WIDTH + EDGE_FADE}px` : '#000 0';
  const right = end ? `#000 calc(100% - ${EDGE_FADE}px), transparent 100%` : '#000 100%';
  return `linear-gradient(to right, ${left}, ${right})`;
}

interface ChangeCardProps {
  card: DraftChangeCard;
  isEnd: boolean;
  /** This card holds the ribbon's one tab stop. */
  tabbable: boolean;
  /** Its summary could not be read: the author's own words stand in, and the ribbon says so once. */
  summaryFailed: boolean;
  onFocus: () => void;
  /** The end card is drawn: the ribbon brings it into view. */
  onEndDrawn: () => void;
}

interface CardSummaryProps {
  card: DraftChangeCard;
  summaryFailed: boolean;
}

function CardSummary({ card, summaryFailed }: CardSummaryProps) {
  if (card.summary.status === 'loading') {
    return (
      <>
        <Skeleton variant="text" width="80%" />
        <Skeleton variant="text" width="45%" />
      </>
    );
  }
  if (summaryFailed || card.summary.parts.length === 0) {
    return <Box component="span" sx={{ color: changeOrderInk.muted }}>{card.description}</Box>;
  }
  return <SummaryLine parts={card.summary.parts} />;
}

function ChangeCard({ card, isEnd, tabbable, summaryFailed, onFocus, onEndDrawn }: ChangeCardProps) {
  const out = card.inclusion === 'none';
  const resources = [...new Set(card.revisions.map((revision) => revision.unitSlug))];
  // When the ribbon scrolls sideways, the end of the change is what it opens on.
  const keepEndInView = useCallback(
    (node: HTMLElement | null) => {
      if (node !== null && isEnd) onEndDrawn();
    },
    [isEnd, onEndDrawn],
  );
  return (
    <DraftPeek
      spec={{
        eyebrow: copy.change,
        icon: <CommitIcon aria-hidden />,
        lines: [
          `${card.author.name} · ${whenOf(card.at)}`,
          card.description,
          <Box key="resources" component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px' }}>
            {resources.map((slug) => (
              <PeekCode key={slug}>{slug}</PeekCode>
            ))}
          </Box>,
          ...(out ? [copy.afterEnd] : []),
        ].filter((line) => line !== ''),
      }}
    >
      <Box
        component="article"
        ref={keepEndInView}
        tabIndex={tabbable ? 0 : -1}
        onFocus={(event) => {
          event.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest' });
          onFocus();
        }}
        aria-label={`${card.author.name}, ${whenOf(card.at)}: ${card.description}${out ? `. ${copy.afterEnd}` : ''}`}
        data-testid="draft-change-card"
        data-included={card.inclusion}
        {...{ [CARD_ATTRIBUTE]: '', ...(isEnd ? { [END_ATTRIBUTE]: '' } : {}) }}
        sx={{
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          padding: '8px 10px 9px',
          border: `1px ${out ? 'dashed' : 'solid'} ${isEnd ? changeOrderAction.line : changeOrderBorder.default}`,
          borderRadius: `${changeOrderShape.radius.lg}px`,
          background: out ? changeOrderSurface.sunk : changeOrderSurface.card,
          boxShadow: isEnd ? `inset -3px 0 0 ${changeOrderAction.ink}` : 'none',
          minWidth: 0,
          position: 'relative',
          transition: DRAFT_TRANSITION,
          '&:hover': { borderColor: isEnd ? changeOrderAction.line : changeOrderBorder.strong },
          '&:focus-visible': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: 1 },
          '& > .draft-card-body': { opacity: out ? 0.55 : 1 },
        }}
      >
        <Box
          className="draft-card-body"
          sx={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: changeOrderType.size.small, color: changeOrderInk.muted, minWidth: 0 }}
        >
          <PersonAvatar person={card.author} size={18} />
          {card.author.kind === 'loading' ? (
            <Skeleton variant="text" width={40} />
          ) : (
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {card.author.name}
            </Box>
          )}
          <Box component="span" sx={{ marginLeft: 'auto', color: changeOrderInk.subtle, whiteSpace: 'nowrap' }}>
            {dayOf(card.at)}
          </Box>
        </Box>
        <Box
          className="draft-card-body"
          sx={{ fontSize: changeOrderType.size.body, lineHeight: changeOrderType.lineHeight.heading, color: changeOrderInk.default, minHeight: 34 }}
        >
          <CardSummary card={card} summaryFailed={summaryFailed} />
        </Box>
        {isEnd ? (
          <Box
            component="span"
            sx={{
              position: 'absolute',
              right: -1,
              bottom: -BELOW,
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              fontSize: changeOrderType.size.micro,
              fontWeight: changeOrderType.weight.semibold,
              color: changeOrderAction.ink,
              whiteSpace: 'nowrap',
            }}
          >
            <FlagOutlinedIcon aria-hidden sx={{ fontSize: 13 }} />
            {copy.end}
          </Box>
        ) : null}
      </Box>
    </DraftPeek>
  );
}

interface ChangeSetBracketProps {
  changeSet: DraftChangeSet;
  first: number;
  count: number;
  total: number;
  isEnd: boolean;
  onEnd: (() => void) | undefined;
}

/** The bracket over the cards a closed ChangeSet holds; clicking it ends the change there. */
function ChangeSetBracket({ changeSet, first, count, total, isEnd, onEnd }: ChangeSetBracketProps) {
  const interactive = onEnd !== undefined;
  return (
    <Box
      sx={{
        position: 'absolute',
        top: -ABOVE,
        left: `calc(${first / total} * (100% + ${GAP}px))`,
        width: `calc(${count / total} * (100% + ${GAP}px) - ${GAP + 1}px)`,
        height: 18,
        display: 'flex',
        alignItems: 'flex-start',
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          left: 4,
          right: 4,
          top: 12,
          height: 8,
          border: `1px solid ${isEnd ? changeOrderAction.line : changeOrderBorder.strong}`,
          borderBottom: 0,
          borderRadius: '4px 4px 0 0',
        }}
      />
      <DraftPeek
        spec={{
          eyebrow: copy.changeSet,
          icon: <Inventory2OutlinedIcon aria-hidden />,
          title: <span translate="no">{changeSet.slug}</span>,
          lines: changeSet.description === '' ? [] : [changeSet.description],
          action: interactive && !isEnd ? copy.endHere : undefined,
        }}
      >
        <Box
          component={interactive ? 'button' : 'span'}
          type={interactive ? 'button' : undefined}
          onClick={onEnd}
          aria-pressed={interactive ? isEnd : undefined}
          aria-label={interactive ? copy.changeSetNamed(changeSet.slug) : undefined}
          sx={{
            ...BARE_BUTTON,
            position: 'relative',
            zIndex: 1,
            margin: '0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: changeOrderSurface.card,
            padding: '0 6px',
            fontSize: 11,
            lineHeight: '18px',
            whiteSpace: 'nowrap',
            color: isEnd ? changeOrderAction.ink : changeOrderInk.muted,
            borderRadius: '4px',
            cursor: interactive ? 'pointer' : 'default',
            transition: DRAFT_TRANSITION,
            '&:hover': { color: changeOrderAction.ink },
            '&:focus-visible': FOCUS_RING,
          }}
        >
          <Inventory2OutlinedIcon aria-hidden sx={{ fontSize: 14 }} />
          <Box component="b" translate="no" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.semibold, fontSize: 11 }}>
            {changeSet.slug}
          </Box>
        </Box>
      </DraftPeek>
    </Box>
  );
}

interface EndSuggestionProps {
  option: DraftEndOption;
  /** The cards the suggested end leaves out (or, back to the latest, takes in). */
  affected: readonly DraftChangeCard[];
  onEnd: () => void;
}

/** The one-click end over the ribbon's end: the finished ChangeSet, or back to the latest change. */
function EndSuggestion({ option, affected, onEnd }: EndSuggestionProps) {
  const toChangeSet = option.kind === 'changeSet';
  return (
    <DraftPeek
      spec={{
        eyebrow: toChangeSet ? copy.leavesOut : copy.takesIn,
        icon: toChangeSet ? <RemoveIcon aria-hidden /> : <AddIcon aria-hidden />,
        lines: affected.map((card) => `${card.author.name} · ${card.description}`),
      }}
    >
      <Box
        component="button"
        type="button"
        id={DRAFT_END_ID}
        onClick={onEnd}
        data-testid="draft-end-suggestion"
        sx={{
          ...BARE_BUTTON,
          boxSizing: 'border-box',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          height: 24,
          padding: '0 9px 0 7px',
          borderRadius: `${changeOrderShape.radius.pill}px`,
          border: `1px solid ${toChangeSet ? changeOrderAction.line : changeOrderBorder.default}`,
          background: toChangeSet ? changeOrderAction.soft : changeOrderSurface.card,
          color: toChangeSet ? changeOrderAction.ink : changeOrderInk.muted,
          fontSize: changeOrderType.size.small,
          fontWeight: changeOrderType.weight.semibold,
          whiteSpace: 'nowrap',
          transition: DRAFT_TRANSITION,
          '&:hover': { borderColor: toChangeSet ? changeOrderAction.ink : changeOrderBorder.strong },
          '&:focus-visible': FOCUS_RING,
          ...PRESS,
        }}
      >
        {toChangeSet ? <Inventory2OutlinedIcon aria-hidden sx={{ fontSize: 14 }} /> : <LastPageIcon aria-hidden sx={{ fontSize: 14 }} />}
        {toChangeSet ? `${copy.endAt} ` : copy.endAtLatest}
        {toChangeSet ? (
          <Box component="b" translate="no" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.semibold }}>
            {option.changeSet.slug}
          </Box>
        ) : null}
      </Box>
    </DraftPeek>
  );
}

/** The start flag: where every variant now is, labelled with the last ChangeOrder. */
interface StartFlagProps {
  /** The last ChangeOrder's slug; undefined draws the flag with no label. */
  label: string | undefined;
}

function StartFlag({ label }: StartFlagProps) {
  return (
    <Box
      sx={{
        flex: 'none',
        width: START_FLAG_WIDTH,
        // It stays readable at the left edge while the cards scroll sideways under it.
        position: 'sticky',
        left: 0,
        zIndex: 2,
        background: changeOrderSurface.card,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Box aria-hidden="true" sx={{ position: 'absolute', top: -16, bottom: 0, left: '50%', borderLeft: `1px dashed ${changeOrderBorder.strong}` }} />
      {label === undefined ? null : (
        <DraftPeek spec={{ eyebrow: copy.startEyebrow, icon: <HistoryIcon aria-hidden />, title: <span translate="no">{label}</span> }}>
          <Box
            component="span"
            sx={{
              position: 'absolute',
              top: -ABOVE,
              left: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
              fontSize: 11,
              lineHeight: changeOrderType.lineHeight.body,
              color: changeOrderInk.subtle,
              background: changeOrderSurface.card,
              paddingRight: '4px',
            }}
          >
            <HistoryIcon aria-hidden sx={{ fontSize: 14 }} />
            <Box component="b" translate="no" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.muted, fontSize: 11 }}>
              {label}
            </Box>
          </Box>
        </DraftPeek>
      )}
    </Box>
  );
}

export interface ChangeCardRibbonProps {
  cards: DraftChangeCards;
  /** The last ChangeOrder's slug, on the start flag. `undefined` draws the flag with no label. */
  startLabel: string | undefined;
  /** Change the end: a ChangeSet slug, or `null` for the latest change. */
  onEnd: (end: string | null) => void;
  /** Ask again for what could not be read. */
  onRetry?: () => void;
  /** A problem above already says nothing is waiting, so the empty ribbon draws nothing. */
  emptySaid?: boolean;
}

/**
 * How much of the base's waiting change the ChangeOrder takes: the changes since the last
 * ChangeOrder as cards, oldest first, from the start flag (where every variant now is) to the end
 * flag. A closed ChangeSet's bracket and the latest change are the ends a draft can take (the
 * one-click end is `ChangeCardEnd`, on What's line); cards after the end are greyed, not
 * hidden. The cards are one tab stop; the arrow keys move between them. When they do not fit,
 * the ribbon scrolls sideways and opens on the end.
 */
export const ChangeCardRibbon = memo(function ChangeCardRibbon({
  cards,
  startLabel,
  onEnd,
  onRetry,
  emptySaid = false,
}: ChangeCardRibbonProps) {
  const [focusIndex, setFocusIndex] = useState<number | undefined>(undefined);
  const sideways = useSidewaysScroll();

  if (cards.status === 'loading') {
    return (
      <Box aria-busy="true" sx={{ display: 'flex', gap: `${GAP}px`, paddingTop: `${ABOVE}px`, paddingLeft: '30px' }}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} variant="rounded" height={75} sx={{ flex: 1, borderRadius: `${changeOrderShape.radius.lg}px` }} />
        ))}
      </Box>
    );
  }
  if (cards.status === 'failed') return (
      <CouldNotEstablish onRetry={onRetry} retryWhat={draftCopy.page.retryWhat.howMuch} focusAfterRetry={draftPlaceId('change')} reason={cards.reason} />
    );
  // Undetermined: asking again gives the same answer, so there is no retry.
  if (cards.status === 'undetermined' && cards.cards.length === 0) return <CouldNotEstablish reason={cards.reason} />;
  if (cards.cards.length === 0) {
    if (emptySaid) return null;
    return <Box sx={{ color: changeOrderInk.subtle, fontSize: changeOrderType.size.body }}>{copy.nothing}</Box>;
  }

  const list = cards.cards;
  const total = list.length;
  const indexOf = new Map(list.map((card, index) => [card.cardId, index]));
  // The end flag says which cards are in; while any card's inclusion is unknown it says nothing.
  const lastIncluded = list.some((card) => card.inclusion === 'unknown')
    ? -1
    : list.reduce((found, card, index) => (card.inclusion === 'none' ? found : index), -1);
  const currentEnd = cards.end.status === 'resolved' ? cards.end.end : undefined;
  const endChangeSetId = currentEnd?.kind === 'tag' ? currentEnd.changeSet.changeSetId : undefined;
  const closedIds = new Set(cards.ends.flatMap((option) => (option.kind === 'changeSet' ? [option.changeSet.changeSetId] : [])));
  const summariesFailed = list.some((card) => card.summary.status === 'failed');
  const tabStop = focusIndex ?? (lastIncluded >= 0 ? lastIncluded : total - 1);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const moves: Record<string, number> = { ArrowRight: tabStop + 1, ArrowLeft: tabStop - 1, Home: 0, End: total - 1 };
    const next = moves[event.key];
    if (next === undefined || !(event.target instanceof HTMLElement) || !event.target.hasAttribute(CARD_ATTRIBUTE)) return;
    event.preventDefault();
    const index = Math.min(total - 1, Math.max(0, next));
    setFocusIndex(index);
    event.currentTarget.querySelectorAll<HTMLElement>(`[${CARD_ATTRIBUTE}]`)[index]?.focus();
  };

  return (
    <Box role="group" aria-label={copy.label}>
      <Box
        ref={sideways.ref}
        onKeyDown={onKeyDown}
        onScroll={sideways.onScroll}
        sx={{
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingTop: `${ABOVE}px`,
          paddingBottom: `${BELOW}px`,
          marginBottom: `-${BELOW}px`,
          maskImage: edgeMask(sideways.edges),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'stretch', position: 'relative', minWidth: 'min-content' }}>
          <StartFlag label={startLabel} />
          <Box
            sx={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: `repeat(${total}, minmax(${CARD_MIN}px,1fr))`,
              gap: `${GAP}px`,
              position: 'relative',
              minWidth: 0,
            }}
          >
            {cards.changeSets.map((changeSet) => {
              const positions = changeSet.cardIds.map((id) => indexOf.get(id)).filter((index): index is number => index !== undefined);
              if (positions.length === 0) return null;
              const first = Math.min(...positions);
              return (
                <ChangeSetBracket
                  key={changeSet.changeSetId}
                  changeSet={changeSet}
                  first={first}
                  count={Math.max(...positions) - first + 1}
                  total={total}
                  isEnd={endChangeSetId === changeSet.changeSetId}
                  onEnd={closedIds.has(changeSet.changeSetId) ? () => endAndFollow(onEnd, changeSet.slug) : undefined}
                />
              );
            })}
            {list.map((card, index) => (
              <ChangeCard
                key={card.cardId}
                card={card}
                isEnd={index === lastIncluded}
                tabbable={index === tabStop}
                summaryFailed={card.summary.status === 'failed'}
                onFocus={() => setFocusIndex(index)}
                onEndDrawn={sideways.showEnd}
              />
            ))}
          </Box>
        </Box>
      </Box>
      {summariesFailed || cards.status === 'undetermined' ? (
        <Box sx={{ marginTop: `${BELOW + 2}px` }}>
          <CouldNotEstablish
            onRetry={cards.status === 'undetermined' ? undefined : onRetry}
            retryWhat={draftCopy.page.retryWhat.howMuch}
            focusAfterRetry={draftPlaceId('change')}
            reason={cards.reason}
          />
        </Box>
      ) : null}
    </Box>
  );
});

export interface ChangeCardEndProps {
  cards: DraftChangeCards;
  /** Change the end: a ChangeSet slug, or `null` for the latest change. */
  onEnd: (end: string | null) => void;
}

/**
 * The one-click end, on What's line over the ribbon's end: "End at <ChangeSet>" while the change
 * runs past a finished ChangeSet, "End at latest" once it ends there. Drawn whenever the ribbon
 * draws its cards, and only then.
 */
export const ChangeCardEnd = memo(function ChangeCardEnd({ cards, onEnd }: ChangeCardEndProps) {
  const suggestion = cards.suggestedEnd;
  if (cards.status === 'loading' || cards.status === 'failed' || cards.cards.length === 0 || suggestion === undefined) return null;
  return (
    <EndSuggestion
      option={suggestion}
      affected={cardsAffectedBy(suggestion, cards.cards)}
      onEnd={() => endAndFollow(onEnd, suggestion.kind === 'changeSet' ? suggestion.changeSet.slug : null)}
    />
  );
});
