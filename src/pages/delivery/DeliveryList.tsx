// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The delivery graph as a list: a row per Space, indented under the Space whose
 * resource delivers it, with a column for each thing the tree's cards leave to
 * the side pane.
 */

import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { StatusDot } from '@/components/console-detail/ConsoleDetail';
import { ConsoleTable, type ConsoleRowAttributes, type ConsoleTableColumn } from '@/components/console-table/ConsoleTable';

import { consoleTokens as T } from '../change-orders/consoleStyle';
import {
  LINK_SX,
  ONE_LINE,
  STATUS,
  SUB_SX,
  componentHref,
  deliveryText,
  deliveryUnitHref,
  plural,
  type NodeView,
} from './deliveryView';

const INDENT_PX = 20;

const GRID = {
  gap: '0 14px',
  padding: '0 14px',
  display: 'grid',
  alignItems: 'center',
  gridTemplateColumns: 'minmax(260px, 2fr) minmax(150px, 1fr) minmax(120px, .8fr) minmax(190px, 1.3fr) minmax(100px, .6fr)',
  '@media (max-width: 1200px)': {
    gridTemplateColumns: 'minmax(240px, 2fr) minmax(150px, 1fr) minmax(190px, 1.3fr)',
  },
} as const;
const HIDE_NARROW = { '@media (max-width: 1200px)': { display: 'none' } } as const;

export interface ListRow extends NodeView {
  depth: number;
  open: boolean;
  /** Slug of the Space holding each delivering Unit, by SpaceID. */
  spaceSlugById: ReadonlyMap<string, string>;
  focused: boolean;
  onToggle: (id: string) => void;
}

/**
 * The Space's name opens what delivers it: the configuration of the Unit holding
 * the Application, Kustomization or Profile. A Space nothing delivers, the top
 * of a tree with no root resource, opens the Space.
 */
function SpaceCell({ node, depth, open, below, rollup, spaceSlugById, onToggle }: ListRow) {
  const delivery = node.deliveredBy[0] ?? node.root;
  let nameTo: string | undefined;
  let nameTitle = node.slug;
  if (delivery) {
    const fromSlug = spaceSlugById.get(delivery.fromSpaceId);
    const unit = fromSlug && delivery.unitSlug ? `, in Unit ${fromSlug}/${delivery.unitSlug}` : '';
    nameTo = deliveryUnitHref(delivery);
    nameTitle = `Open the ${delivery.kind} that deploys ${node.slug}${unit}`;
  } else if (node.space) {
    nameTo = `/spaces/${node.space.spaceId}`;
    nameTitle = `Open the Space ${node.slug}`;
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '4px', minWidth: 0, paddingLeft: `${depth * INDENT_PX}px` }}>
      {node.children.length > 0 ? (
        <Box
          component='button'
          type='button'
          onClick={() => onToggle(node.id)}
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} the ${plural(below, 'Space')} ${node.slug} deploys`}
          data-testid='delivery-toggle'
          sx={{
            all: 'unset',
            flex: 'none',
            display: 'inline-flex',
            cursor: 'pointer',
            color: T.ink3,
            borderRadius: '3px',
            '&:hover': { color: T.ink, background: T.surfaceSunk },
            '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 1 },
          }}
        >
          {open ? <ExpandMoreIcon sx={{ fontSize: 18 }} /> : <ChevronRightIcon sx={{ fontSize: 18 }} />}
        </Box>
      ) : (
        <Box aria-hidden='true' sx={{ flex: 'none', width: 18 }} />
      )}
      <Box sx={{ minWidth: 0 }}>
        {nameTo ? (
          <Typography
            component={RouterLink}
            to={nameTo}
            title={nameTitle}
            data-testid='delivery-row-name'
            sx={{ ...ONE_LINE, ...LINK_SX, fontFamily: T.mono, fontSize: 13, lineHeight: T.lh, fontWeight: 600 }}
          >
            {node.slug}
          </Typography>
        ) : (
          <Typography title={node.slug} sx={{ ...ONE_LINE, fontFamily: T.mono, fontSize: 13, lineHeight: T.lh, fontWeight: 600, color: T.ink }}>
            {node.slug}
          </Typography>
        )}
        {below > 0 && (
          <Typography component='span' title={rollup} sx={SUB_SX}>
            {rollup}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function StatusCell({ status, statusText, node }: ListRow) {
  if (status === 'none') {
    return <Typography sx={{ ...ONE_LINE, fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}>{statusText}</Typography>;
  }
  const style = STATUS[status];
  return <StatusDot color={style.color} hollow={style.hollow} testId='delivery-row-status' label={node.space ? statusText : style.label} />;
}

function ComponentCell({ node }: ListRow) {
  const componentSlug = node.space?.componentSlug;
  if (!node.space || !componentSlug) return null;
  const to = componentHref(componentSlug, node.space.spaceId);
  return (
    <Typography
      component={RouterLink}
      to={to}
      title={`Open the Variant ${node.space.variant ?? node.slug} in the Component ${componentSlug}`}
      data-testid='delivery-row-component'
      sx={{ ...ONE_LINE, ...LINK_SX, fontSize: 12.5, lineHeight: T.lh }}
    >
      {node.space.variant ? `${componentSlug} / ${node.space.variant}` : componentSlug}
    </Typography>
  );
}

function DeliveredByCell({ node, spaceSlugById }: ListRow) {
  const first = node.deliveredBy[0] ?? node.root;
  if (!first) return null;
  const others = node.deliveredBy.slice(1);
  return (
    <>
      <Box sx={ONE_LINE}>
        {!node.deliveredBy[0] && (
          <Typography component='span' sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}>
            Itself, by{' '}
          </Typography>
        )}
        <Typography component='span' title={first.sourceUrl} sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink }}>
          {deliveryText(first)}
        </Typography>
        {others.length > 0 && (
          <Typography
            component='span'
            title={others.map((d) => `${d.kind} ${d.name} in ${spaceSlugById.get(d.fromSpaceId) ?? 'another Space'}`).join('\n')}
            sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}
          >
            {` +${others.length} more`}
          </Typography>
        )}
      </Box>
      {first.destination && (
        <Typography component='span' title={`Applies to ${first.destination}`} sx={SUB_SX}>
          to {first.destination}
        </Typography>
      )}
    </>
  );
}

const COLUMNS: ConsoleTableColumn<ListRow>[] = [
  { id: 'space', header: 'Space', cell: (row) => <SpaceCell {...row} /> },
  { id: 'status', header: 'Running Release', cell: (row) => <StatusCell {...row} /> },
  { id: 'component', header: 'Variant in Component', sx: HIDE_NARROW, cell: (row) => <ComponentCell {...row} /> },
  { id: 'deliveredBy', header: 'Deployed by', cell: (row) => <DeliveredByCell {...row} /> },
  {
    id: 'target',
    header: 'Target',
    sx: HIDE_NARROW,
    cell: ({ targetSlug }) => <Typography sx={{ ...ONE_LINE, fontSize: 12.5, lineHeight: T.lh, color: T.ink2 }}>{targetSlug}</Typography>,
  },
];

const rowId = (row: ListRow) => row.node.id;
const rowAttributes = (row: ListRow): ConsoleRowAttributes => ({
  'data-testid': 'delivery-row',
  'data-slug': row.node.slug,
  'data-status': row.status,
  'data-depth': String(row.depth),
  'data-selected': row.focused ? 'true' : undefined,
});

export function DeliveryList({ rows, empty, footer }: { rows: ListRow[]; empty: ReactNode; footer: ReactNode }) {
  return (
    <Box
      sx={{
        // The Space a link from another page asked for.
        '& [data-selected="true"]': { background: T.actionSoft, boxShadow: `inset 3px 0 0 ${T.action}` },
        // A tree is read down its rows, so they are closer than a console's.
        '& [data-testid="delivery-row"]': { paddingTop: '7px', paddingBottom: '7px' },
      }}
    >
      <ConsoleTable label='GitOps list' data={rows} columns={COLUMNS} grid={GRID} getRowId={rowId} rowAttributes={rowAttributes} empty={empty} footer={footer} />
    </Box>
  );
}
