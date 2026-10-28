// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import ButtonBase from '@mui/material/ButtonBase';
import type { ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { getAdapter } from '../../adapters';
import type { ResourceViewRow } from '../../adapters/resource-row';
import type { GroupNavRow } from '../../cell-value';
import { fieldById, type EntityRow } from '../../model/fields';
import type { EntityKind } from '../../model/types';
import { type CellActions, TableCellContent } from '../../table/cells/TableCellContent';
import { ExplorerRowLink } from '../../results/ExplorerRowLink';
import { toolchainColor } from '../../table/format';
import { countOf, type OpenModifiers } from '../shared';

/**
 * One card on the board. Each entity shows what tells its rows apart at a
 * glance: a Unit its revision, Space and Target, status and labels; a Space
 * its unit counts and labels; a Resource its kind and where it lives. Values
 * are the same buttons as in the table (a click opens the value's popover).
 *
 * The card is a group, not a button, so its value buttons are not nested in
 * another control. Its name is the one button that opens the row; its hit
 * area stretches over the whole card, and the value buttons sit above it.
 */

interface BoardCardProps {
  entity: EntityKind;
  row: EntityRow;
  rowId: string;
  actions: CellActions;
  /** Label keys the rows carry; the card shows `app` and `tier` when present. */
  labelKeys: readonly string[];
  onOpen: (row: EntityRow, e: OpenModifiers) => void;
}

const CARD_LABELS = ['app', 'tier'];

function Cell({ entity, name, row, rowId, actions, primary = false }: { entity: EntityKind; name: string; row: EntityRow; rowId: string; actions: CellActions; primary?: boolean }) {
  return (
    <Box component='span' sx={{ display: 'inline-flex', minWidth: 0, maxWidth: '100%' }} data-column={name}>
      <TableCellContent entity={entity} name={name} row={row} rowId={rowId} primary={primary} serverMissing={false} actions={actions} />
    </Box>
  );
}

const openSx = {
  minWidth: 0,
  justifyContent: 'flex-start',
  font: 'inherit',
  fontWeight: 700,
  color: 'text.primary',
  position: 'static',
  '& .vx-card-open-text': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '&::after': { content: '""', position: 'absolute', inset: 0, borderRadius: 'inherit', cursor: 'pointer' },
} as const;

/**
 * The row's name: the one control that opens it. Its ::after covers the card.
 * A link to the row's page where it has one, so the browser offers a new tab.
 */
function OpenButton({ entity, row, text, onOpen }: { entity: EntityKind; row: EntityRow; text: string; onOpen: (e: OpenModifiers) => void }) {
  const button = (
    <ButtonBase className='vx-card-open' data-testid='vx-board-card-open' onClick={(e) => onOpen(e)} disableRipple sx={openSx}>
      <span className='vx-card-open-text'>{text}</span>
    </ButtonBase>
  );
  if (!getAdapter(entity).getRowHref(row as GroupNavRow)) return button;
  return (
    <Box component='span' sx={{ display: 'flex', minWidth: 0, '& > a': { display: 'inline-flex', ...openSx } }}>
      <ExplorerRowLink
        entity={entity}
        row={row}
        onOpen={() => onOpen({ metaKey: false, ctrlKey: false })}
        openOnSpace
        className='vx-card-open'
        data-testid='vx-board-card-open'
      >
        <span className='vx-card-open-text'>{text}</span>
      </ExplorerRowLink>
    </Box>
  );
}

function Dot() {
  return (
    <Typography component='span' variant='body2' color='text.disabled' sx={{ flexShrink: 0 }}>
      ·
    </Typography>
  );
}

function LabelChip({ name, children }: { name: string; children: ReactNode }) {
  return (
    <Box
      component='span'
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, height: 20, borderRadius: 1, bgcolor: 'background.default', fontSize: 11.5, minWidth: 0 }}
    >
      <Typography component='span' fontSize={11} fontWeight={600} color='text.disabled'>
        {name}
      </Typography>
      {children}
    </Box>
  );
}

function ToolchainMark({ toolchain }: { toolchain: string | undefined }) {
  if (!toolchain) return null;
  return (
    <Box
      component='span'
      title={toolchain}
      sx={{ width: 8, height: 8, borderRadius: 0.5, flexShrink: 0, bgcolor: (t) => t.palette[toolchainColor(toolchain)].main }}
    />
  );
}

function unitLabels(entity: EntityKind, row: EntityRow): Record<string, string> {
  if (entity === 'Unit') return (row as ExtendedUnitRead).Unit?.Labels ?? {};
  if (entity === 'Space') return (row as ExtendedSpaceRead).Space?.Labels ?? {};
  return (row as ResourceViewRow).UnitLabels ?? {};
}

export function BoardCard({ entity, row, rowId, actions, labelKeys, onOpen }: BoardCardProps) {
  const labels = unitLabels(entity, row);
  const labelField = (k: string) => (entity === 'Resource' ? `Unit.Labels.${k}` : `Labels.${k}`);
  const shownLabels = CARD_LABELS.filter((k) => labelKeys.includes(k) && labels[k]);
  const cell = (name: string, primary = false) => <Cell entity={entity} name={name} row={row} rowId={rowId} actions={actions} primary={primary} />;
  const nameField = entity === 'Resource' ? 'ResourceName' : 'Slug';
  const name = String(fieldById(entity, nameField)?.value(row) ?? '') || rowId;
  const open = <OpenButton entity={entity} row={row} text={name} onOpen={(e) => onOpen(row, e)} />;

  let title: ReactNode;
  let meta: ReactNode;
  let chips: ReactNode;
  if (entity === 'Space') {
    const s = row as ExtendedSpaceRead;
    title = (
      <>
        {open}
        <Box sx={{ flex: 1 }} />
        {s.TotalUnitCount !== undefined && (
          <Typography variant='body2' color='text.secondary' sx={{ flexShrink: 0 }}>
            {countOf(s.TotalUnitCount, 'unit')}
          </Typography>
        )}
      </>
    );
    meta = s.Space?.ComponentID ? cell('Component') : null;
    const unreleased = s.UnreleasedUnitCount ?? 0;
    const upgradable = s.UpgradableUnitCount ?? 0;
    chips = (
      <>
        {unreleased > 0 && <Chip size='small' color='warning' variant='outlined' label={`${unreleased} unreleased`} />}
        {upgradable > 0 && <Chip size='small' color='secondary' variant='outlined' label={`${upgradable} upgradable`} />}
        {unreleased === 0 && upgradable === 0 && <Chip size='small' color='success' variant='outlined' label='All released' />}
      </>
    );
  } else if (entity === 'Resource') {
    const r = row as ResourceViewRow;
    title = (
      <>
        <ToolchainMark toolchain={r.UnitToolchainType} />
        {open}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ flexShrink: 0, maxWidth: '45%', display: 'flex' }}>{cell('ResourceType')}</Box>
      </>
    );
    meta = (
      <>
        {cell('Space.Slug')}
        <Dot />
        {cell('Unit.Target')}
      </>
    );
    chips = cell('Status');
  } else {
    const u = (row as ExtendedUnitRead).Unit;
    title = (
      <>
        <ToolchainMark toolchain={u?.ToolchainType} />
        {open}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ flexShrink: 0, display: 'flex' }}>{cell('HeadRevisionNum')}</Box>
      </>
    );
    meta = (
      <>
        {cell('Space')}
        <Dot />
        {cell('Target')}
      </>
    );
    chips = cell('Status');
  }

  return (
    <Box
      component='article'
      aria-label={name}
      data-testid='vx-board-card'
      data-row-id={rowId}
      sx={{
        position: 'relative',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        px: 1.375,
        py: 1.125,
        fontSize: 12.5,
        transition: (t) => t.transitions.create(['border-color', 'box-shadow', 'transform'], { duration: 150 }),
        '&:hover': { borderColor: 'grey.400', boxShadow: 'var(--sh-md)', transform: 'translateY(-1px)' },
        '&:has(.vx-card-open.Mui-focusVisible), &:has(a.vx-card-open:focus-visible)': {
          outline: (t) => `2px solid ${t.palette.primary.main}`,
          outlineOffset: 1,
        },
        '& a.vx-card-open:focus-visible': { outline: 'none' },
        // Values stay clickable above the name's stretched hit area.
        '& [data-column]': { position: 'relative', zIndex: 1 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
      }}
    >
      <Stack direction='row' alignItems='center' spacing={0.875} sx={{ minWidth: 0, mb: 0.5, fontSize: 13 }}>
        {title}
      </Stack>
      {meta && (
        <Stack direction='row' alignItems='center' spacing={0.75} sx={{ minWidth: 0, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', mb: 0.75 }}>
          {meta}
        </Stack>
      )}
      <Stack direction='row' flexWrap='wrap' useFlexGap spacing={0.5} sx={{ '&:empty': { display: 'none' } }}>
        {chips}
      </Stack>
      {shownLabels.length > 0 && (
        <Stack direction='row' spacing={0.625} sx={{ mt: 0.875, minWidth: 0 }}>
          {shownLabels.map((k) => (
            <LabelChip key={k} name={k}>
              {cell(labelField(k))}
            </LabelChip>
          ))}
        </Stack>
      )}
    </Box>
  );
}
