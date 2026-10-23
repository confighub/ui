// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type MouseEvent, type PointerEvent, type TouchEvent, useState } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';

import type { ExplorerDragItem, ExplorerDropTarget } from '../dnd/registry';
import type { ExplorerAction } from '../model/reducer';
import type { ColumnState, EntityKind, ViewDef } from '../model/types';
import { HeaderMenu } from './HeaderMenu';
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from './useExplorerTable';

/**
 * A column header: a click opens the column menu, a drag reorders the column
 * (and, over the Group section, groups by it), and the right edge resizes it.
 * A double-click on the edge puts the default width back.
 */

function withoutWidth(column: ColumnState): ColumnState {
  const rest = { ...column };
  delete rest.width;
  return rest;
}

interface Props {
  entity: EntityKind;
  name: string;
  label: string;
  def: ViewDef;
  /** The columns on screen, in order (a column can be in the view but not shown). */
  visible: readonly string[];
  known: boolean;
  filterable: boolean;
  isResizing: boolean;
  width: number;
  onResizeStart: (event: unknown) => void;
  /** Arrow keys on the edge: change the width on screen, then commit it when the key is released. */
  onNudge: (delta: number) => void;
  onNudgeEnd: () => void;
  dispatch: (action: ExplorerAction) => void;
  onFilter: (name: string, anchor: HTMLElement | null) => void;
}

export function HeaderCell({
  entity,
  name,
  label,
  def,
  visible,
  known,
  filterable,
  isResizing,
  width,
  onResizeStart,
  onNudge,
  onNudgeEnd,
  dispatch,
  onFilter,
}: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const data: ExplorerDragItem & ExplorerDropTarget = {
    type: 'column-header',
    field: name,
    entity,
    label,
    kind: 'column-slot',
  };
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: name,
    data,
  });
  const startDrag = listeners?.onPointerDown as
    | ((event: PointerEvent<HTMLElement>) => void)
    | undefined;
  // A pointer drags the header. The keyboard opens its menu instead (Enter or
  // Space); a column moves from the keyboard with the menu's Move left/right.
  const sorted = def.sort?.column === name ? def.sort.dir : null;
  const grouped = def.groupBy.includes(name);

  const startResize = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    onResizeStart(e);
  };

  return (
    <Box
      ref={setNodeRef}
      role='columnheader'
      aria-sort={sorted === 'ASC' ? 'ascending' : sorted === 'DESC' ? 'descending' : 'none'}
      data-testid='vx-header'
      data-column={name}
      sx={{
        position: 'relative',
        height: '100%',
        minWidth: 0,
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
        // The drag ghost follows the pointer; this is the place the column will go.
        opacity: isDragging ? 0.5 : 1,
        transform: CSS.Translate.toString(transform),
        transition,
      }}
    >
      <ButtonBase
        onPointerDown={startDrag}
        aria-haspopup='menu'
        aria-expanded={!!menuAnchor}
        aria-label={`${label} column menu`}
        onClick={(e) => setMenuAnchor(e.currentTarget)}
        sx={{
          width: '100%',
          height: '100%',
          justifyContent: 'flex-start',
          gap: 0.75,
          px: 1.5,
          fontSize: 12,
          fontWeight: 700,
          color: sorted || grouped ? 'text.primary' : 'text.secondary',
          whiteSpace: 'nowrap',
          cursor: isDragging ? 'grabbing' : 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          '&.Mui-focusVisible': {
            outline: 2,
            outlineColor: 'primary.main',
            outlineOffset: -2,
          },
        }}
      >
        <Box
          component='span'
          sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {label}
        </Box>
        {sorted === 'ASC' && (
          <ArrowUpwardIcon sx={{ fontSize: 14, color: 'primary.main' }} aria-hidden />
        )}
        {sorted === 'DESC' && (
          <ArrowDownwardIcon sx={{ fontSize: 14, color: 'primary.main' }} aria-hidden />
        )}
        {grouped && (
          <Tooltip title={`Grouped by ${label}`} enterDelay={400}>
            <LayersOutlinedIcon
              sx={{ fontSize: 15, color: 'primary.main', ml: 'auto' }}
              aria-label='grouped'
            />
          </Tooltip>
        )}
      </ButtonBase>
      <Box
        role='separator'
        tabIndex={0}
        aria-orientation='vertical'
        aria-label={`Resize ${label}`}
        aria-valuenow={Math.round(width)}
        aria-valuemin={MIN_COLUMN_WIDTH}
        aria-valuemax={MAX_COLUMN_WIDTH}
        data-testid='vx-resize'
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          const step = e.shiftKey ? 32 : 8;
          onNudge(e.key === 'ArrowLeft' ? -step : step);
        }}
        onKeyUp={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onNudgeEnd();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={startResize}
        onTouchStart={startResize}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // Back to the default width; the rest of the column (a computed column's source) stays.
          dispatch({
            type: 'setColumns',
            columns: def.columns.map((c) => (c.name === name ? withoutWidth(c) : c)),
          });
        }}
        sx={{
          position: 'absolute',
          top: 0,
          right: -4,
          width: 8,
          height: '100%',
          zIndex: 3,
          cursor: 'col-resize',
          touchAction: 'none',
          '&::after': {
            content: '""',
            position: 'absolute',
            left: 3,
            top: 6,
            bottom: 6,
            width: 2,
            borderRadius: 1,
            bgcolor: isResizing ? 'primary.main' : 'transparent',
          },
          '&:hover::after': { bgcolor: isResizing ? 'primary.main' : 'grey.300' },
          '&:focus-visible': { outline: 'none' },
          '&:focus-visible::after': { bgcolor: 'primary.main' },
        }}
      />
      {/* Mounted only while open: closing unmounts it at once (see the Matrix menus). */}
      {menuAnchor && (
        <HeaderMenu
          anchorEl={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          name={name}
          label={label}
          def={def}
          visible={visible}
          known={known}
          filterable={filterable}
          dispatch={dispatch}
          onFilter={(anchor) => onFilter(name, anchor)}
        />
      )}
    </Box>
  );
}
