// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { forwardRef, useState } from 'react';

import type { SvgIconComponent } from '@mui/icons-material';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import WorkspacesOutlinedIcon from '@mui/icons-material/WorkspacesOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { ENTITY_KINDS, type EntityKind, LAYOUTS, type Layout } from '../model/types';
import { useExplorerContext } from '../state/context';
import { useResults } from '../state/results-context';
import { useRowSelection } from '../state/selection-context';
import { SelectionBar } from '../table/SelectionBar';
import { SaveActions } from '../tabs/SaveActions';
import { COMPACT, LABEL, TOOLBAR_CONTAINER } from './compact';

/**
 * The results toolbar: how the rows are drawn (Table, Board, Matrix),
 * which entity they are, how many match, and Save at the right end — the one
 * place Save lives. While rows are picked, the selection bar takes the left
 * side in place of the layout and entity pickers, and its count replaces the
 * row count. It is a size container: its parts get smaller as it narrows
 * (`compact.ts`), and it never wraps.
 */

const LAYOUT_META: Record<Layout, { label: string; Icon: SvgIconComponent }> = {
  table: { label: 'Table', Icon: TableChartOutlinedIcon },
  board: { label: 'Board', Icon: ViewKanbanOutlinedIcon },
  matrix: { label: 'Matrix', Icon: GridViewOutlinedIcon },
};

const ENTITY_META: Record<
  EntityKind,
  { label: string; noun: [string, string]; Icon: SvgIconComponent }
> = {
  Unit: { label: 'Units', noun: ['unit', 'units'], Icon: ViewInArOutlinedIcon },
  Space: { label: 'Spaces', noun: ['space', 'spaces'], Icon: WorkspacesOutlinedIcon },
  Resource: {
    label: 'Resources',
    noun: ['resource', 'resources'],
    Icon: DataObjectOutlinedIcon,
  },
};

function EntityMenu({
  entity,
  onChange,
}: {
  entity: EntityKind;
  onChange: (e: EntityKind) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { Icon, label } = ENTITY_META[entity];
  return (
    <>
      <Button
        size='small'
        color='inherit'
        startIcon={<Icon fontSize='small' />}
        endIcon={<ExpandMoreIcon fontSize='small' />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup='menu'
        data-testid='vx-entity'
        sx={{
          fontWeight: 700,
          bgcolor: 'background.default',
          px: 1.25,
          '&:hover': { bgcolor: 'grey.200' },
        }}
      >
        {label}
      </Button>
      {/* Mounted only while open: closing unmounts it at once. A closing menu left to its exit animation can stay mounted (invisible) while the page re-renders, and then takes every click. */}
      {anchor && (
        <Menu
          anchorEl={anchor}
          open
          onClose={() => setAnchor(null)}
          MenuListProps={{ dense: true }}
        >
          {ENTITY_KINDS.map((k) => {
            const M = ENTITY_META[k];
            return (
              <MenuItem
                key={k}
                selected={k === entity}
                onClick={() => {
                  setAnchor(null);
                  onChange(k);
                }}
              >
                <ListItemIcon>
                  <M.Icon fontSize='small' />
                </ListItemIcon>
                <ListItemText>{M.label}</ListItemText>
              </MenuItem>
            );
          })}
        </Menu>
      )}
    </>
  );
}

export const Toolbar = forwardRef<HTMLDivElement>(function Toolbar(_props, ref) {
  const { def, derived } = useResults();
  const { dispatch } = useExplorerContext();
  const [one, many] = ENTITY_META[def.entity].noun;
  const { enabled, count } = useRowSelection();
  const selecting = enabled && count > 0;
  const shown = derived.rows.length;

  return (
    <Stack
      ref={ref}
      direction='row'
      alignItems='center'
      spacing={1}
      data-testid='vx-toolbar'
      sx={{
        minHeight: 48,
        px: 1.25,
        py: 0.75,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
        ...TOOLBAR_CONTAINER,
      }}
    >
      {/* First, and always rendered: its live region must never be remounted. */}
      <SelectionBar />
      {!selecting && (
        <ToggleButtonGroup
          size='small'
          exclusive
          value={def.layout}
          onChange={(_, next: Layout | null) => {
            if (next) dispatch({ type: 'setLayout', layout: next });
          }}
          aria-label='Layout'
          sx={{
            bgcolor: 'background.default',
            p: 0.25,
            borderRadius: 1.5,
            '& .MuiToggleButton-root': {
              border: 0,
              borderRadius: '6px !important',
              px: 1.25,
              py: 0.5,
              gap: 0.75,
              fontSize: 12.5,
              fontWeight: 600,
              color: 'text.secondary',
              textTransform: 'none',
            },
            [COMPACT]: { '& .MuiToggleButton-root': { px: 0.75 }, [`& .${LABEL}`]: { display: 'none' } },
            '& .MuiToggleButton-root.Mui-selected': {
              bgcolor: 'background.paper',
              color: 'text.primary',
              boxShadow: 1,
            },
          }}
        >
          {LAYOUTS.map((l) => {
            const { label, Icon } = LAYOUT_META[l];
            return (
              <Tooltip key={l} title={`${label} layout`} disableInteractive>
                <ToggleButton value={l} aria-label={label} data-testid={`vx-layout-${l}`}>
                  <Icon sx={{ fontSize: 16 }} />
                  <span className={LABEL}>{label}</span>
                </ToggleButton>
              </Tooltip>
            );
          })}
        </ToggleButtonGroup>
      )}
      {!selecting && (
        <EntityMenu
          entity={def.entity}
          onChange={(entity) => dispatch({ type: 'setEntity', entity })}
        />
      )}
      <Box sx={{ flex: 1 }} />
      {!selecting && (
        <Typography
          variant='body2'
          color='text.secondary'
          title={`${shown} of ${derived.total} ${derived.total === 1 ? one : many}`}
          data-short={`${shown}/${derived.total}`}
          sx={{
            whiteSpace: 'nowrap',
            px: 0.5,
            // The short form is drawn, not written, so the element's text stays "M of M units".
            [COMPACT]: { [`& .${LABEL}`]: { display: 'none' }, '&::after': { content: 'attr(data-short)' } },
          }}
          data-testid='vx-count'
        >
          <span className={LABEL}>
            <Typography
              component='span'
              variant='body2'
              fontWeight={800}
              color='text.primary'
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {shown}
            </Typography>{' '}
            of {derived.total} {derived.total === 1 ? one : many}
          </span>
        </Typography>
      )}
      <SaveActions />
    </Stack>
  );
});
