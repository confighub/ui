// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState, type MouseEvent } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { fieldById, type EntityRow } from '../../model/fields';
import type { GroupNode } from '../../model/grouping';
import type { EntityKind } from '../../model/types';
import type { CellActions } from '../../table/cells/TableCellContent';
import { shortToolchain, toolchainColor } from '../../table/format';
import { groupMix, groupValueText, mixIsRedundant, type GroupStep } from '../../table/groups';
import { countOf, type OpenModifiers, pathOf, statusColor } from '../shared';
import { BoardCard } from './BoardCard';

/**
 * One lane of the board: a group of the first level. Its header has the
 * value, a count that opens a peek at the lane, and how many of its rows need
 * attention. With a second group level, the lane's cards sit under
 * sub-headings, each with its own count.
 */

/** Cards drawn per lane (or sub-heading) before "Show N more". */
export const LANE_PAGE = 60;

/** Sub-headings drawn per lane before "Show N more groups". */
export const SUB_PAGE = 12;

interface LaneProps {
  entity: EntityKind;
  node: GroupNode<EntityRow>;
  rowId: (row: EntityRow) => string;
  actions: CellActions;
  labelKeys: readonly string[];
  onOpen: (row: EntityRow, e: OpenModifiers) => void;
  onPeek: (anchor: HTMLElement, path: readonly GroupStep[], rows: readonly EntityRow[]) => void;
}

function CountButton({ count, title, onClick, testId }: { count: number; title: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; testId: string }) {
  return (
    <Box
      component='button'
      type='button'
      title={title}
      aria-label={title}
      data-testid={testId}
      onClick={onClick}
      sx={{
        border: 0,
        cursor: 'zoom-in',
        font: 'inherit',
        fontSize: 11.5,
        fontWeight: 700,
        lineHeight: '18px',
        px: 0.875,
        borderRadius: 'var(--r-pill)',
        bgcolor: 'grey.200',
        color: 'text.secondary',
        fontVariantNumeric: 'tabular-nums',
        '&:hover': { bgcolor: 'text.primary', color: 'background.paper' },
        '&:focus-visible': { outline: (t) => `2px solid ${t.palette.primary.main}`, outlineOffset: 1 },
      }}
    >
      {count}
    </Box>
  );
}

function Cards({ rows, ...rest }: Omit<LaneProps, 'node' | 'onPeek'> & { rows: readonly EntityRow[] }) {
  const [limit, setLimit] = useState(LANE_PAGE);
  return (
    <>
      {rows.slice(0, limit).map((row) => (
        <BoardCard key={rest.rowId(row)} entity={rest.entity} row={row} rowId={rest.rowId(row)} actions={rest.actions} labelKeys={rest.labelKeys} onOpen={rest.onOpen} />
      ))}
      {rows.length > limit && (
        <Button size='small' color='inherit' sx={{ color: 'text.secondary', alignSelf: 'center' }} onClick={() => setLimit((n) => n + LANE_PAGE)}>
          Show {Math.min(LANE_PAGE, rows.length - limit)} more of {rows.length - limit}
        </Button>
      )}
    </>
  );
}

export function Lane({ entity, node, rowId, actions, labelKeys, onOpen, onPeek }: LaneProps) {
  const theme = useTheme();
  const [subLimit, setSubLimit] = useState(SUB_PAGE);
  const hiddenSubs = node.children.length - subLimit;
  const field = fieldById(entity, node.field);
  const fieldLabel = field?.label ?? node.field;
  const value = groupValueText(node.value) || `No ${fieldLabel.toLowerCase()}`;
  const path = pathOf(node);
  const mix = mixIsRedundant(node.field) ? null : groupMix(entity, node.rows);
  // "3 unreleased", or "1 unreleased unit" when the lane holds something other than Units.
  const tally = (n: number, what: string) => (mix?.ofUnits ? countOf(n, `${what} unit`) : `${n} ${what}`);
  const dot =
    node.field === 'Status'
      ? statusColor(theme, node.value)
      : node.field.endsWith('ToolchainType') && node.value
        ? theme.palette[toolchainColor(node.value)].main
        : null;
  const shownValue = node.field.endsWith('ToolchainType') ? shortToolchain(value) : value;

  return (
    <Box
      role='group'
      aria-label={`${fieldLabel} ${value}: ${node.rows.length}`}
      data-testid='vx-lane'
      data-lane={node.value}
      sx={{ flex: '1 1 0', minWidth: 250, maxWidth: 420, bgcolor: 'background.default', borderRadius: 1.5, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <Stack direction='row' alignItems='center' flexWrap='wrap' columnGap={1} rowGap={0.25} sx={{ px: 1.5, pt: 1.375, pb: 1 }}>
        {dot && <Box component='span' sx={{ width: 9, height: 9, borderRadius: node.field === 'Status' ? '50%' : 0.5, bgcolor: dot, flexShrink: 0 }} />}
        <Typography variant='body2' fontWeight={700} fontSize={13} noWrap sx={{ minWidth: 0 }} title={value}>
          {shownValue}
        </Typography>
        <CountButton count={node.rows.length} title={`Peek at these ${node.rows.length}`} testId='vx-lane-count' onClick={(e) => onPeek(e.currentTarget, path, node.rows)} />
        {mix && mix.unreleased > 0 && (
          <Typography variant='body2' fontSize={11.5} fontWeight={600} color='warning.main'>
            {tally(mix.unreleased, 'unreleased')}
          </Typography>
        )}
        {mix && mix.upgradable > 0 && (
          <Typography variant='body2' fontSize={11.5} fontWeight={600} color='secondary.main'>
            {tally(mix.upgradable, 'upgradable')}
          </Typography>
        )}
      </Stack>
      <Stack spacing={0.875} sx={{ px: 1, pb: 1.25, overflowY: 'auto', flex: 1, minHeight: 0 }} data-testid='vx-lane-cards'>
        {node.children.length === 0 ? (
          <Cards rows={node.rows} entity={entity} rowId={rowId} actions={actions} labelKeys={labelKeys} onOpen={onOpen} />
        ) : (
          node.children.slice(0, subLimit).map((child) => {
            const childPath = pathOf(child, path);
            const childField = fieldById(entity, child.field)?.label ?? child.field;
            const childValue = groupValueText(child.value) || 'none';
            return (
              <Stack key={child.key} spacing={0.875} data-testid='vx-lane-sub'>
                <Stack direction='row' alignItems='center' spacing={0.75} sx={{ px: 0.5, pt: 0.75 }}>
                  <Typography component='span' fontSize={10.5} fontWeight={700} letterSpacing='0.06em' textTransform='uppercase' color='text.disabled'>
                    {childField}
                  </Typography>
                  <Typography component='span' variant='body2' fontWeight={700} noWrap sx={{ minWidth: 0 }}>
                    {child.field.endsWith('ToolchainType') ? shortToolchain(childValue) : childValue}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <Box>
                    <CountButton count={child.rows.length} title={`Peek at these ${child.rows.length}`} testId='vx-lane-sub-count' onClick={(e) => onPeek(e.currentTarget, childPath, child.rows)} />
                  </Box>
                </Stack>
                <Cards rows={child.rows} entity={entity} rowId={rowId} actions={actions} labelKeys={labelKeys} onOpen={onOpen} />
              </Stack>
            );
          })
        )}
        {hiddenSubs > 0 && (
          <Button size='small' color='inherit' sx={{ color: 'text.secondary', alignSelf: 'center' }} onClick={() => setSubLimit((n) => n + SUB_PAGE)} data-testid='vx-lane-more-subs'>
            Show {countOf(Math.min(SUB_PAGE, hiddenSubs), 'more group')} of {hiddenSubs}
          </Button>
        )}
      </Stack>
    </Box>
  );
}

/** The lanes past the cap, as one strip; a click draws the next ones. */
export function MoreLanes({ count, next, onMore }: { count: number; next: number; onMore: () => void }) {
  return (
    <Box
      component='button'
      type='button'
      onClick={onMore}
      title={`Show ${countOf(next, 'more lane')}`}
      aria-label={`${countOf(count, 'more lane')}. Show ${next} more.`}
      data-testid='vx-more-lanes'
      sx={{
        flex: '0 0 44px',
        border: 1,
        borderStyle: 'dashed',
        borderColor: 'divider',
        bgcolor: 'transparent',
        borderRadius: 1.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        py: 1.5,
        cursor: 'pointer',
        font: 'inherit',
        color: 'text.secondary',
        '&:hover': { bgcolor: 'background.default', color: 'text.primary' },
        '&:focus-visible': { outline: (t) => `2px solid ${t.palette.primary.main}`, outlineOffset: 1 },
      }}
    >
      <Typography component='span' fontSize={12} fontWeight={700} sx={{ writingMode: 'vertical-rl', whiteSpace: 'nowrap' }}>
        {countOf(count, 'more lane')}
      </Typography>
    </Box>
  );
}

/** A lane with no cards in this view, drawn as a narrow strip when empty lanes are shown. */
export function EmptyLane({ entity, field, value }: { entity: EntityKind; field: string; value: string }) {
  const label = groupValueText(value) || `No ${(fieldById(entity, field)?.label ?? field).toLowerCase()}`;
  const shown = field.endsWith('ToolchainType') ? shortToolchain(label) : label;
  return (
    <Box
      role='group'
      aria-label={`${shown}: none in this view`}
      data-testid='vx-lane-empty'
      data-lane={value}
      title={`${shown}: nothing in this view`}
      sx={{ flex: '0 0 40px', bgcolor: 'background.default', borderRadius: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.5, color: 'text.disabled' }}
    >
      <Typography component='span' fontSize={12} fontWeight={700} sx={{ writingMode: 'vertical-rl', whiteSpace: 'nowrap' }}>
        {shown}
      </Typography>
      <Typography component='span' fontSize={11} fontWeight={700}>
        0
      </Typography>
    </Box>
  );
}
