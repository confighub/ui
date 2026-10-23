// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { type FieldCategory, type FieldDef, fieldCatalog } from '../model/fields';
import type { EntityKind } from '../model/types';

/**
 * The `+` at the end of the header: pick a field to show as a new column.
 * Fields are grouped the way the lens column groups them, and the search
 * matches labels and ids, so `Labels.tier` is found by "tier".
 */

interface Props {
  entity: EntityKind;
  visible: readonly string[];
  labelKeys: readonly string[];
  /** Computed columns of this view (data paths, expressions) that are not shown now. */
  viewColumns?: ReadonlyArray<{ id: string; label: string }>;
  onAdd: (name: string) => void;
}

const CATEGORY_TITLE: Record<FieldCategory, string> = {
  field: 'Fields',
  computed: 'Computed',
  label: 'Labels',
  'space-label': 'Space labels',
};
const CATEGORY_ORDER: FieldCategory[] = ['field', 'computed', 'label', 'space-label'];

export function AddColumnButton({
  entity,
  visible,
  labelKeys,
  viewColumns = [],
  onAdd,
}: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const shown = new Set(visible);
    const q = query.trim().toLowerCase();
    const fields = fieldCatalog(entity, labelKeys).filter(
      (f) =>
        !shown.has(f.id) &&
        (!q || f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q)),
    );
    return CATEGORY_ORDER.map((c) => ({
      category: c,
      fields: fields.filter((f) => f.category === c),
    })).filter((g) => g.fields.length > 0);
  }, [entity, labelKeys, visible, query]);

  const q = query.trim().toLowerCase();
  const ownColumns = viewColumns.filter(
    (c) => !q || c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
  );

  const close = () => {
    setAnchor(null);
    setQuery('');
  };
  const pick = (f: FieldDef) => {
    onAdd(f.id);
    close();
  };

  return (
    <>
      <Tooltip title='Add a column' enterDelay={400}>
        <IconButton
          size='small'
          aria-label='Add a column'
          data-testid='vx-add-column'
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          <AddIcon fontSize='small' />
        </IconButton>
      </Tooltip>
      {/* Mounted only while open: closing unmounts it at once (see the Matrix menus). */}
      {anchor && (
        <Popover
          open
          anchorEl={anchor}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          // It opens at once: the table re-renders while it opens (its columns are measured), which stalled the grow animation.
          transitionDuration={0}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              sx: {
                width: 280,
                maxHeight: 'min(360px, 60vh)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              },
            },
          }}
        >
          <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
            <TextField
              size='small'
              fullWidth
              autoFocus
              placeholder='Find a field'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && groups[0]?.fields[0]) pick(groups[0].fields[0]);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position='start'>
                    <SearchIcon fontSize='small' />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          <MenuList
            dense
            sx={{ flex: 1, minHeight: 0, overflow: 'auto', py: 0.5 }}
            aria-label='Fields to add'
            data-testid='vx-add-column-list'
          >
            {ownColumns.length > 0 && (
              <ListSubheader
                sx={{
                  lineHeight: '28px',
                  typography: 'caption',
                  textTransform: 'uppercase',
                  color: 'text.disabled',
                }}
              >
                This view's columns
              </ListSubheader>
            )}
            {ownColumns.map((c) => (
              <MenuItem
                key={`view-${c.id}`}
                data-field={c.id}
                onClick={() => {
                  onAdd(c.id);
                  close();
                }}
              >
                {c.label}
              </MenuItem>
            ))}
            {groups.length === 0 && ownColumns.length === 0 && (
              <Typography variant='body2' color='text.disabled' sx={{ px: 2, py: 1.5 }}>
                No other fields.
              </Typography>
            )}
            {groups.flatMap((g) => [
              <ListSubheader
                key={`h-${g.category}`}
                sx={{
                  lineHeight: '28px',
                  typography: 'caption',
                  textTransform: 'uppercase',
                  color: 'text.disabled',
                }}
              >
                {CATEGORY_TITLE[g.category]}
              </ListSubheader>,
              ...g.fields.map((f) => (
                <MenuItem key={f.id} onClick={() => pick(f)} data-field={f.id}>
                  {f.label}
                </MenuItem>
              )),
            ])}
          </MenuList>
        </Popover>
      )}
    </>
  );
}
