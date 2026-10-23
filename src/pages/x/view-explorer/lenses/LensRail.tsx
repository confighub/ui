// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { MouseEvent } from 'react';

import { useDroppable } from '@dnd-kit/core';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import type { EntityKind, Lens } from '../model/types';
import { GROUP_DROP_DATA, GROUP_RAIL_DROP_ID, useHeaderDrag } from './groupDnd';
import { noun } from './layer';
import { shortLensText } from './lensShort';

/**
 * The column folded to 36 px: the count, one dot per lens (filled = shown,
 * ring = hidden; click toggles, ⌥-click shows only that one), and the group
 * icon, which also takes a dropped column header. Anything else opens the
 * column.
 */

interface LensRailProps {
  entity: EntityKind;
  lenses: readonly Lens[];
  result: number;
  total: number;
  groupLevels: number;
  onExpand: () => void;
  onExpandToFilter: () => void;
  onEye: (lensId: string, e: MouseEvent) => void;
}

export function LensRail({
  entity,
  lenses,
  result,
  total,
  groupLevels,
  onExpand,
  onExpandToFilter,
  onEye,
}: LensRailProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: GROUP_RAIL_DROP_ID,
    data: GROUP_DROP_DATA,
  });
  const headerDrag = useHeaderDrag();
  const on = lenses.filter((l) => l.enabled).length;

  return (
    <Stack
      alignItems='center'
      spacing={0.75}
      data-testid='vx-lens-rail'
      onClick={(e) => {
        // A click on the rail's background opens the column; its buttons handle their own clicks.
        if (e.target === e.currentTarget) onExpand();
      }}
      sx={{ width: 36, height: '100%', pt: 1.25, cursor: 'pointer' }}
    >
      <Tooltip title='Expand  \' placement='right'>
        <IconButton
          size='small'
          aria-label='Expand the filter column'
          onClick={onExpand}
          data-testid='vx-rail-expand'
          sx={{ width: 30, height: 30 }}
        >
          <KeyboardDoubleArrowRightIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={`Filters: ${on} on`} placement='right'>
        <IconButton
          size='small'
          aria-label='Add a filter'
          onClick={onExpandToFilter}
          sx={{ width: 30, height: 30 }}
        >
          <FilterAltOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={`${result} of ${total} ${noun(entity, total)}`} placement='right'>
        <Typography
          data-testid='vx-rail-total'
          sx={{
            fontSize: 11,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: 'text.primary',
          }}
        >
          {result}
        </Typography>
      </Tooltip>
      {lenses.map((l) => (
        <Tooltip
          key={l.id}
          title={`${shortLensText(entity, l)} · click to ${l.enabled ? 'hide' : 'show'}`}
          placement='right'
        >
          <IconButton
            size='small'
            data-testid='vx-rail-dot'
            data-lens-id={l.id}
            data-enabled={l.enabled}
            aria-label={`${l.enabled ? 'Hide' : 'Show'} ${shortLensText(entity, l)}`}
            aria-pressed={l.enabled}
            onClick={(e) => onEye(l.id, e)}
            sx={{ width: 22, height: 22 }}
          >
            <Box
              sx={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                bgcolor: l.enabled ? 'text.secondary' : 'transparent',
                border: 1.5,
                borderColor: l.enabled ? 'text.secondary' : 'text.disabled',
              }}
            />
          </IconButton>
        </Tooltip>
      ))}
      <Box sx={{ width: 16, borderTop: 1, borderColor: 'divider', my: 0.5 }} />
      <Tooltip title='Group (drop a column here)' placement='right'>
        <IconButton
          ref={setNodeRef}
          size='small'
          aria-label='Group'
          onClick={onExpand}
          data-testid='vx-rail-group'
          sx={{
            width: 30,
            height: 30,
            color: headerDrag.active ? 'primary.main' : undefined,
            bgcolor: headerDrag.active ? 'primary.light' : undefined,
            boxShadow: isOver ? '0 0 0 2px var(--rust)' : 'none',
          }}
        >
          <Badge
            badgeContent={groupLevels || null}
            color='default'
            sx={{
              '& .MuiBadge-badge': {
                fontSize: 10,
                height: 16,
                minWidth: 16,
                bgcolor: 'text.primary',
                color: 'background.paper',
              },
            }}
          >
            <LayersOutlinedIcon sx={{ fontSize: 16 }} />
          </Badge>
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
