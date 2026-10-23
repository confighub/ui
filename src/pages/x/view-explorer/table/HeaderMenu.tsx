// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import LayersClearOutlinedIcon from '@mui/icons-material/LayersClearOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import PlaylistAddOutlinedIcon from '@mui/icons-material/PlaylistAddOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';

import type { ExplorerAction } from '../model/reducer';
import type { ViewDef } from '../model/types';

/**
 * A column's menu: sort, group, filter, move and hide. Each item is one
 * reducer action, so each is one undo step and makes the view a draft.
 */

interface Props {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  name: string;
  label: string;
  def: ViewDef;
  visible: readonly string[];
  /** A field the explorer knows (not a server-computed column): it can be grouped and filtered on. */
  known: boolean;
  filterable: boolean;
  dispatch: (action: ExplorerAction) => void;
  onFilter: (anchor: HTMLElement | null) => void;
}

export function HeaderMenu({ anchorEl, onClose, name, label, def, visible, known, filterable, dispatch, onFilter }: Props) {
  // Moves are among the columns on screen; a column the table leaves out is skipped over.
  const shownAt = visible.indexOf(name);
  const defIndex = (column: string | undefined) => def.columns.findIndex((c) => c.name === column);
  const index = defIndex(name);
  const left = defIndex(visible[shownAt - 1]);
  const right = defIndex(visible[shownAt + 1]);
  const sorted = def.sort?.column === name ? def.sort.dir : null;
  const grouped = def.groupBy.includes(name);
  const run = (action: ExplorerAction) => {
    dispatch(action);
    onClose();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={!!anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      MenuListProps={{ dense: true, 'aria-label': `${label} column` }}
    >
      <MenuItem selected={sorted === 'ASC'} onClick={() => run({ type: 'setSort', sort: { column: name, dir: 'ASC' } })}>
        <ListItemIcon><ArrowUpwardIcon fontSize='small' /></ListItemIcon>
        <ListItemText>Sort ascending</ListItemText>
      </MenuItem>
      <MenuItem selected={sorted === 'DESC'} onClick={() => run({ type: 'setSort', sort: { column: name, dir: 'DESC' } })}>
        <ListItemIcon><ArrowDownwardIcon fontSize='small' /></ListItemIcon>
        <ListItemText>Sort descending</ListItemText>
      </MenuItem>
      {known && <Divider />}
      {known && !grouped && (
        <MenuItem onClick={() => run({ type: 'setGroupBy', groupBy: [name] })}>
          <ListItemIcon><LayersOutlinedIcon fontSize='small' /></ListItemIcon>
          <ListItemText>Group by {label}</ListItemText>
        </MenuItem>
      )}
      {known && !grouped && def.groupBy.length > 0 && (
        <MenuItem onClick={() => run({ type: 'setGroupBy', groupBy: [...def.groupBy, name] })}>
          <ListItemIcon><PlaylistAddOutlinedIcon fontSize='small' /></ListItemIcon>
          <ListItemText>Add as group level</ListItemText>
        </MenuItem>
      )}
      {grouped && (
        <MenuItem onClick={() => run({ type: 'setGroupBy', groupBy: def.groupBy.filter((g) => g !== name) })}>
          <ListItemIcon><LayersClearOutlinedIcon fontSize='small' /></ListItemIcon>
          <ListItemText>Stop grouping by {label}</ListItemText>
        </MenuItem>
      )}
      {filterable && (
        <MenuItem
          onClick={() => {
            onFilter(anchorEl);
            onClose();
          }}
        >
          <ListItemIcon><FilterAltOutlinedIcon fontSize='small' /></ListItemIcon>
          <ListItemText>Filter on {label}…</ListItemText>
        </MenuItem>
      )}
      <Divider />
      <MenuItem disabled={left === -1 || index === -1} onClick={() => run({ type: 'moveColumn', from: index, to: left })}>
        <ListItemIcon><ChevronLeftIcon fontSize='small' /></ListItemIcon>
        <ListItemText>Move left</ListItemText>
      </MenuItem>
      <MenuItem disabled={right === -1 || index === -1} onClick={() => run({ type: 'moveColumn', from: index, to: right })}>
        <ListItemIcon><ChevronRightIcon fontSize='small' /></ListItemIcon>
        <ListItemText>Move right</ListItemText>
      </MenuItem>
      <MenuItem disabled={visible.length <= 1} onClick={() => run({ type: 'hideColumn', name })}>
        <ListItemIcon><VisibilityOffOutlinedIcon fontSize='small' /></ListItemIcon>
        <ListItemText>Hide column</ListItemText>
      </MenuItem>
    </Menu>
  );
}
