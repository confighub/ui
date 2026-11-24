// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The delivery graph as a tree of cards, left to right: a Space, then a column
 * of the Spaces its resources deliver, joined by lines. It is ordinary page
 * content, at one size, and scrolls with the page.
 *
 * A card says how the Space's Release is running and opens the side pane. The
 * card of a Variant also links to it in Components. A
 * Space with many synced and healthy children that deliver nothing shows them
 * as one stack, so the children that need attention are the cards beside it.
 */

import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { consoleTokens as T } from '../change-orders/consoleStyle';
import { stackChildren, type DeliveryGraph } from './deliveryGraph';
import { STATUS, componentHref, controllerName, plural, type NodeView } from './deliveryView';

/**
 * Every card has one width, so that each level of the tree is a column. A slug
 * longer than the card wraps inside it.
 */
const CARD_WIDTH = 248;
/** The room between a card and its children, which the joining lines cross. */
const LEVEL_GAP = 36;
const ROW_GAP = 8;
/** How far below a card's top edge its line meets it: the middle of the card's first line of text. */
const ANCHOR = 19;

const LINE = `1px solid ${T.lineStrong}`;

/** One child of a card, with the lines that join it to its parent and to the sibling below it. */
const CHILD_SX = {
  position: 'relative',
  paddingLeft: `${LEVEL_GAP}px`,
  '&::before': { content: '""', position: 'absolute', top: ANCHOR, left: LEVEL_GAP / 2, width: LEVEL_GAP / 2, borderTop: LINE },
  '&:first-of-type::before': { left: 0, width: LEVEL_GAP },
  '&:not(:last-of-type)::after': {
    content: '""',
    position: 'absolute',
    top: ANCHOR,
    left: LEVEL_GAP / 2,
    height: `calc(100% + ${ROW_GAP}px)`,
    borderLeft: LINE,
  },
} as const;

const CARD_SX = {
  flex: 'none',
  boxSizing: 'border-box',
  width: CARD_WIDTH,
  display: 'flex',
  alignItems: 'flex-start',
  background: T.surface,
  border: `1px solid ${T.line}`,
  borderRadius: '8px',
  boxShadow: T.shadow,
  '&[data-selected="true"]': { borderColor: T.action, background: T.actionSoft, boxShadow: `0 0 0 1px ${T.action}` },
  '&[data-dim="true"]': { opacity: 0.6 },
} as const;

const BUTTON_RESET = {
  all: 'unset',
  boxSizing: 'border-box',
  cursor: 'pointer',
  '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 1, borderRadius: '6px' },
} as const;

const NAME_SX = { fontFamily: T.mono, fontSize: 13, lineHeight: '20px', fontWeight: 600, color: T.ink, overflowWrap: 'anywhere' } as const;
const SUB_SX = { display: 'block', fontSize: 11.5, lineHeight: T.lh, color: T.ink3, overflowWrap: 'anywhere' } as const;

function Dot({ color, hollow }: { color: string; hollow?: boolean }) {
  return (
    <Box
      aria-hidden='true'
      sx={{
        flex: 'none',
        width: 8,
        height: 8,
        mt: '6px',
        borderRadius: '999px',
        background: hollow ? 'transparent' : color,
        border: hollow ? `1.5px solid ${color}` : 'none',
      }}
    />
  );
}

export interface DeliveryCardsProps {
  graph: DeliveryGraph;
  /** The roots of the trees to draw. */
  roots: readonly string[];
  /** What is shown above a tree's root: the Target the tree releases to. */
  rootCaption: (rootId: string) => ReactNode;
  views: ReadonlyMap<string, NodeView>;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  /** With a search or a status filter: the nodes drawn, and those among them that match. */
  shown?: ReadonlySet<string>;
  matches?: ReadonlySet<string>;
  selectedId?: string;
  onSelect: (slug: string) => void;
  /** The parents whose stack the person opened. */
  unstacked: ReadonlySet<string>;
  onStack: (parentId: string, stacked: boolean) => void;
}

export function DeliveryCards({ graph, roots: allRoots, rootCaption, views, isOpen, onToggle, shown, matches, selectedId, onSelect, unstacked, onStack }: DeliveryCardsProps) {
  const card = (id: string): ReactNode => {
    const view = views.get(id);
    if (!view) return null;
    const { node, title, named, status, statusText, below, rollup, otherTarget } = view;
    const style = status === 'none' ? undefined : STATUS[status];
    const delivery = node.deliveredBy[0] ?? node.root;
    const open = shown ? true : isOpen(id);
    return (
      <Box
        data-testid='delivery-card'
        data-slug={node.slug}
        data-status={status}
        data-depth={node.depth}
        data-selected={id === selectedId ? 'true' : undefined}
        data-dim={matches && !matches.has(id) ? 'true' : undefined}
        sx={CARD_SX}
      >
        <Box
          component='button'
          type='button'
          onClick={() => onSelect(node.slug)}
          aria-pressed={id === selectedId}
          title={`Show what deploys ${named}`}
          data-testid='delivery-card-select'
          sx={{ ...BUTTON_RESET, flex: 1, minWidth: 0, display: 'flex', gap: '8px', padding: '8px 6px 8px 10px', '&:hover span[data-name]': { color: T.action } }}
        >
          <Dot color={style?.color ?? T.idleLine} hollow={style ? style.hollow : true} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component='span' data-name sx={{ ...NAME_SX, display: 'block', ...(node.space?.componentSlug ? { fontFamily: T.sans, fontSize: 13.5 } : null) }}>
              {title}
            </Typography>
            <Typography component='span' sx={{ ...SUB_SX, color: T.ink2 }}>
              {node.space ? statusText : STATUS.missing.label}
              {delivery ? ` · ${controllerName(delivery)}` : ''}
            </Typography>
            {otherTarget && (
              <Typography component='span' data-testid='delivery-card-other-target' sx={{ ...SUB_SX, color: T.wait }}>
                Releases to {otherTarget}
              </Typography>
            )}
            {below > 0 && (
              <Typography component='span' sx={SUB_SX}>
                {rollup}
              </Typography>
            )}
          </Box>
        </Box>
        {node.space?.componentSlug && (
          <Box
            component={RouterLink}
            to={componentHref(node.space.componentSlug, node.space.spaceId)}
            title={`Open ${named} in Components`}
            aria-label={`Open ${named} in Components`}
            data-testid='delivery-card-variant'
            sx={{
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              margin: '7px 6px 0 0',
              color: T.ink3,
              borderRadius: '6px',
              '&:hover': { color: T.action, background: T.surfaceSunk },
              '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 1 },
            }}
          >
            <AccountTreeIcon sx={{ fontSize: 15 }} />
          </Box>
        )}
        {node.children.length > 0 && (
          <Box
            component='button'
            type='button'
            onClick={() => onToggle(id)}
            disabled={Boolean(shown)}
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} the ${plural(below, 'Space')} ${title} deploys`}
            data-testid='delivery-toggle'
            sx={{
              ...BUTTON_RESET,
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              margin: '7px 6px 0 0',
              padding: '0 1px 0 6px',
              height: 24,
              fontSize: 11.5,
              fontWeight: 650,
              color: T.ink2,
              border: `1px solid ${T.line}`,
              borderRadius: '999px',
              background: T.surfaceSunk,
              '&:hover:not(:disabled)': { color: T.ink, borderColor: T.lineStrong },
              '&:disabled': { cursor: 'default' },
            }}
          >
            {node.children.length}
            {open ? <ChevronLeftIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
          </Box>
        )}
      </Box>
    );
  };

  const branch = (id: string): ReactNode => {
    const node = graph.nodes.get(id);
    if (!node) return null;
    const open = shown ? true : isOpen(id);
    const children = shown ? node.children.filter((childId) => shown.has(childId)) : node.children;
    // A search or a status filter draws every match as its own card.
    const isStackable = (childId: string) => {
      const child = views.get(childId);
      return child?.status === 'ok' && child.node.children.length === 0 && childId !== selectedId;
    };
    const all = shown ? { cards: children, stacked: [] } : stackChildren(children, isStackable);
    const opened = unstacked.has(id);
    const cards = opened ? children : all.cards;
    const stacked = opened ? [] : all.stacked;
    const names = stacked.map((childId) => views.get(childId)?.title ?? '');
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        {card(id)}
        {open && children.length > 0 && (
          <Box role='group' aria-label={`Deployed by ${node.slug}`} sx={{ display: 'flex', flexDirection: 'column', gap: `${ROW_GAP}px` }}>
            {cards.map((childId) => (
              <Box key={childId} sx={CHILD_SX}>
                {branch(childId)}
              </Box>
            ))}
            {stacked.length > 0 && (
              <Box sx={CHILD_SX}>
                <Box
                  component='button'
                  type='button'
                  onClick={() => onStack(id, false)}
                  title={`Show these ${stacked.length} Spaces one by one`}
                  data-testid='delivery-stack'
                  data-count={stacked.length}
                  sx={{
                    ...BUTTON_RESET,
                    ...CARD_SX,
                    gap: '8px',
                    padding: '8px 10px',
                    marginBottom: '6px',
                    // Two more cards showing behind it.
                    boxShadow: `3px 3px 0 -1px ${T.surface}, 3px 3px 0 0 ${T.line}, 6px 6px 0 -1px ${T.surface}, 6px 6px 0 0 ${T.line}`,
                    '&:hover': { borderColor: T.lineStrong },
                  }}
                >
                  <Dot color={STATUS.ok.color} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography component='span' sx={{ display: 'block', fontSize: 13, lineHeight: '20px', fontWeight: 600, color: T.ink }}>
                      {stacked.length} Spaces {STATUS.ok.rollup}
                    </Typography>
                    <Typography
                      component='span'
                      sx={{ ...SUB_SX, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {names.join(', ')}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
            {opened && all.stacked.length > 0 && (
              <Box sx={CHILD_SX}>
                <Box
                  component='button'
                  type='button'
                  onClick={() => onStack(id, true)}
                  data-testid='delivery-restack'
                  sx={{
                    ...BUTTON_RESET,
                    padding: '0 8px',
                    marginTop: `${ANCHOR - 12}px`,
                    lineHeight: '24px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: T.ink2,
                    '&:hover': { color: T.action },
                  }}
                >
                  Stack the {all.stacked.length} {STATUS.ok.rollup}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const roots = shown ? allRoots.filter((id) => shown.has(id)) : allRoots;
  return (
    <Box
      role='group'
      aria-label='GitOps trees'
      data-testid='delivery-cards'
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '18px', padding: '4px 10px 14px 2px', overflowX: 'auto' }}
    >
      {roots.map((id) => (
        <Box key={id}>
          {rootCaption(id)}
          {branch(id)}
        </Box>
      ))}
    </Box>
  );
}
