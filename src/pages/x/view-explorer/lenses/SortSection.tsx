// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import CheckIcon from '@mui/icons-material/Check';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';

import { type FieldDef, fieldById, fieldCatalog } from '../model/fields';
import type { EntityKind, SortDir, SortState } from '../model/types';
import { useExplorerContext } from '../state/context';
import { lensLayerProps } from './layer';
import { Section } from './parts';

/** The view's sort in words ("Updated, newest first"); one menu to change the field or the direction. */

function dirWords(field: FieldDef | undefined, dir: SortDir): string {
  if (field?.type === 'time') return dir === 'DESC' ? 'newest first' : 'oldest first';
  if (field?.type === 'number') return dir === 'DESC' ? 'high to low' : 'low to high';
  return dir === 'DESC' ? 'Z to A' : 'A to Z';
}

interface SortSectionProps {
  entity: EntityKind;
  sort: SortState | null;
  labelKeys: readonly string[];
}

export function SortSection({ entity, sort, labelKeys }: SortSectionProps) {
  const { dispatch } = useExplorerContext();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const field = sort ? fieldById(entity, sort.column) : undefined;
  const fields = fieldCatalog(entity, labelKeys).filter((f) => f.category !== 'space-label');
  const set = (next: SortState | null) => {
    setAnchor(null);
    dispatch({ type: 'setSort', sort: next });
  };

  return (
    <Section label='Sort' testId='vx-sort-section'>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        data-testid='vx-sort-button'
        sx={{
          width: '100%',
          height: 32,
          px: 1,
          gap: 0.875,
          justifyContent: 'flex-start',
          borderRadius: 1,
          color: 'text.secondary',
          '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
        }}
      >
        <SwapVertIcon sx={{ fontSize: 16 }} />
        {sort ? (
          <Typography noWrap sx={{ fontSize: 13, color: 'inherit' }}>
            <b style={{ fontWeight: 700 }}>{field?.label ?? sort.column}</b>{' '}
            {dirWords(field, sort.dir)}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: 13, color: 'inherit' }}>Default order</Typography>
        )}
      </ButtonBase>
      {/*
        Mounted only while open: a closed MUI Menu runs an exit transition, and
        a busy page can leave its invisible root on screen, taking every click.
      */}
      {anchor && (
        <Menu
          anchorEl={anchor}
          open={!!anchor}
          onClose={() => setAnchor(null)}
          slotProps={{
            root: lensLayerProps,
            paper: { sx: { maxHeight: 420, minWidth: 220 } },
          }}
        >
          {sort &&
            (['ASC', 'DESC'] as const).map((dir) => (
              <MenuItem
                key={dir}
                selected={sort.dir === dir}
                onClick={() => set({ ...sort, dir })}
                dense
              >
                <ListItemIcon>
                  {sort.dir === dir && <CheckIcon fontSize='small' />}
                </ListItemIcon>
                {dirWords(field, dir)}
              </MenuItem>
            ))}
          {sort && <Divider />}
          {fields.map((f) => (
            <MenuItem
              key={f.id}
              selected={sort?.column === f.id}
              dense
              onClick={() =>
                set({
                  column: f.id,
                  dir: sort?.column === f.id ? sort.dir : f.type === 'time' ? 'DESC' : 'ASC',
                })
              }
            >
              <ListItemIcon>
                {sort?.column === f.id && <CheckIcon fontSize='small' />}
              </ListItemIcon>
              {f.category === 'label' ? `label · ${f.label}` : f.label}
            </MenuItem>
          ))}
          {sort && <Divider />}
          {sort && (
            <MenuItem dense onClick={() => set(null)}>
              <ListItemIcon />
              Default order
            </MenuItem>
          )}
        </Menu>
      )}
    </Section>
  );
}
