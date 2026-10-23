// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, type MouseEvent } from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';

import { fieldById, type EntityRow } from '../model/fields';
import { EMPTY_GROUP_VALUE, type GroupNode } from '../model/grouping';
import type { EntityKind } from '../model/types';
import { groupMix, groupValueText, mixIsRedundant } from './groups';

/**
 * One group header in the table: "SPACE checkout-dev 3 · 3 unreleased".
 * A click on the row (or Enter on its fold button) folds the group; the value
 * opens the cell popover, like a value in a cell; the count asks for a peek.
 */

interface Props {
  entity: EntityKind;
  node: GroupNode<EntityRow>;
  collapsed: boolean;
  rowIndex: number;
  onToggle: (key: string) => void;
  onPeek: (anchor: HTMLElement, node: GroupNode<EntityRow>) => void;
  /** The group's value was clicked; `value` is null for the empty group. */
  onValue: (anchor: HTMLElement, field: string, value: string | null, additive: boolean) => void;
}

export const GROUP_INDENT = 20;

const focusRing = { '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 1 } } as const;

export const GroupHeaderRow = memo(function GroupHeaderRow({ entity, node, collapsed, rowIndex, onToggle, onPeek, onValue }: Props) {
  const label = fieldById(entity, node.field)?.label ?? node.field;
  const value = groupValueText(node.value);
  const mix = mixIsRedundant(node.field) ? null : groupMix(entity, node.rows);
  const units = mix?.ofUnits ? ' units' : '';
  const stop = (e: MouseEvent<HTMLElement>, run: (el: HTMLElement) => void) => {
    e.stopPropagation();
    run(e.currentTarget);
  };

  return (
    <Box
      role='row'
      aria-rowindex={rowIndex}
      aria-level={node.depth + 1}
      data-testid='vx-group-row'
      data-group-key={node.key}
      data-collapsed={collapsed}
      onClick={() => onToggle(node.key)}
      sx={{
        height: '100%',
        bgcolor: node.depth === 0 ? 'background.default' : 'grey.100',
        borderBottom: 1,
        borderColor: 'divider',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <Box
        role='rowheader'
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          height: '100%',
          pl: `${12 + node.depth * GROUP_INDENT}px`,
          pr: 1.5,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <ButtonBase
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Show' : 'Hide'} ${label} ${value || 'none'}`}
          data-testid='vx-group-toggle'
          onClick={(e) => stop(e, () => onToggle(node.key))}
          sx={{ gap: 1, borderRadius: 1, px: 0.25, mx: -0.25, ...focusRing }}
        >
          <ExpandMoreIcon
            sx={{
              fontSize: 16,
              color: 'text.disabled',
              transition: 'transform 150ms',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              transform: collapsed ? 'rotate(-90deg)' : 'none',
            }}
          />
          <Typography variant='caption' sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {label}
          </Typography>
        </ButtonBase>
        <ButtonBase
          data-vx-value={node.field}
          data-testid='vx-group-value'
          onClick={(e) => stop(e, (el) => onValue(el, node.field, node.value === EMPTY_GROUP_VALUE ? null : node.value, e.shiftKey))}
          sx={{
            minWidth: 0,
            px: 0.5,
            mx: -0.5,
            borderRadius: 1,
            fontSize: 13.5,
            fontWeight: 700,
            color: value ? 'text.primary' : 'text.disabled',
            fontStyle: value ? 'normal' : 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            justifyContent: 'flex-start',
            '&:hover': { bgcolor: 'action.hover' },
            ...focusRing,
          }}
        >
          {value || 'none'}
        </ButtonBase>
        <ButtonBase
          onClick={(e) => stop(e, (el) => onPeek(el, node))}
          aria-label={`Peek at ${node.rows.length} in ${label} ${value || 'none'}`}
          data-testid='vx-group-count'
          sx={{
            height: 20,
            minWidth: 22,
            px: 0.75,
            borderRadius: 'var(--r-pill)',
            bgcolor: 'grey.200',
            color: 'text.secondary',
            fontSize: '11.5px',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            '&:hover': { bgcolor: 'grey.300', color: 'text.primary' },
            ...focusRing,
          }}
        >
          {node.rows.length}
        </ButtonBase>
        {mix && mix.unreleased > 0 && (
          <Typography variant='body2' sx={{ color: 'warning.main', fontWeight: 600 }}>
            {mix.unreleased} unreleased{units}
          </Typography>
        )}
        {mix && mix.upgradable > 0 && (
          <Typography variant='body2' sx={{ color: 'secondary.main', fontWeight: 600 }}>
            {mix.upgradable} upgradable{units}
          </Typography>
        )}
      </Box>
    </Box>
  );
});
