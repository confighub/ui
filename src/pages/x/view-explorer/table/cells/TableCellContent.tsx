// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { forwardRef, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import type { ExtendedUnitRead } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { resourceDisplayName } from '@/utility/resource-type-functions';

import type { ResourceViewRow } from '../../adapters/resource-row';
import { getCellValue, type GroupNavRow } from '../../cell-value';
import { fieldById, isUpgradable, type EntityRow, type FieldDef } from '../../model/fields';
import type { EntityKind, StatusKind } from '../../model/types';
import { absoluteTime, shortRelative, shortToolchain, toolchainColor } from '../format';

/**
 * What one table cell shows. A value a filter can be made from is a button:
 * a click asks for the cell popover (Only this, Exclude, Group by, Sort), and
 * a status chip asks for a peek at that status. Both go through the page's
 * slots, so the cell does not know who answers.
 */

export interface CellActions {
  onValue: (anchor: HTMLElement, rowId: string, field: string, value: string, additive: boolean) => void;
  onStatus: (anchor: HTMLElement, status: StatusKind) => void;
}

interface Props {
  entity: EntityKind;
  name: string;
  row: EntityRow;
  rowId: string;
  /** The first column: the row's name, in bold. */
  primary: boolean;
  /** A server-computed column this row has no value for until the view is saved. */
  serverMissing: boolean;
  actions: CellActions;
}

function Dash() {
  return (
    <Typography component='span' variant='body2' sx={{ color: 'text.disabled' }}>
      —
    </Typography>
  );
}

/** A value that opens the cell popover. Clicks do not reach the row (which opens the drawer). */
function ValueButton({ rowId, field, value, actions, children }: { rowId: string; field: string; value: string; actions: CellActions; children: ReactNode }) {
  const open = (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    e.stopPropagation();
    actions.onValue(e.currentTarget, rowId, field, value, e.shiftKey);
  };
  return (
    <Box
      component='span'
      role='button'
      tabIndex={0}
      data-vx-value={field}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        open(e);
      }}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        maxWidth: '100%',
        minWidth: 0,
        mx: -0.5,
        px: 0.5,
        borderRadius: 1,
        cursor: 'pointer',
        overflow: 'hidden',
        '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
        '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: -1 },
      }}
    >
      {children}
    </Box>
  );
}

/** Text that ends in "…" when the column is too narrow. It takes a ref and props, so a Tooltip can wrap it. */
const Ellipsis = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement> & { strong?: boolean }>(function Ellipsis(
  { children, strong, ...rest },
  ref,
) {
  return (
    <Box
      component='span'
      ref={ref}
      {...rest}
      sx={{
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: strong ? 700 : undefined,
        color: strong ? 'text.primary' : undefined,
      }}
    >
      {children}
    </Box>
  );
});

function revisionParts(entity: EntityKind, row: EntityRow): { head: number; live: number | null } | null {
  if (entity === 'Unit') {
    const u = (row as ExtendedUnitRead).Unit;
    if (!u) return null;
    const head = u.HeadRevisionNum ?? 0;
    const released = u.LastReleasedRevisionNum ?? 0;
    return { head, live: u.TargetID && released > 0 && released !== head ? released : null };
  }
  if (entity === 'Resource') {
    const r = row as ResourceViewRow;
    const head = r.UnitHeadRevisionNum ?? 0;
    const released = r.UnitLastReleasedRevisionNum ?? 0;
    return { head, live: r.TargetSlug && released > 0 && released !== head ? released : null };
  }
  return null;
}

interface StatusChipSpec {
  status: StatusKind;
  label: string;
  color: 'warning' | 'success' | 'secondary' | 'default';
}

function statusChips(entity: EntityKind, row: EntityRow): StatusChipSpec[] {
  const rev = revisionParts(entity, row);
  const targeted =
    entity === 'Unit' ? !!(row as ExtendedUnitRead).Unit?.TargetID : entity === 'Resource' ? !!(row as ResourceViewRow).TargetSlug : false;
  if (!rev) return [];
  const chips: StatusChipSpec[] = [];
  if (!targeted) chips.push({ status: 'untargeted', label: 'Not targeted', color: 'default' });
  else {
    const released =
      entity === 'Unit'
        ? ((row as ExtendedUnitRead).Unit?.LastReleasedRevisionNum ?? 0)
        : ((row as ResourceViewRow).UnitLastReleasedRevisionNum ?? 0);
    const ahead = rev.head - released;
    if (ahead > 0) chips.push({ status: 'unreleased', label: `Unreleased +${ahead}`, color: 'warning' });
    else chips.push({ status: 'released', label: 'Released', color: 'success' });
  }
  if (entity === 'Unit' && isUpgradable(row as ExtendedUnitRead)) chips.push({ status: 'upgradable', label: 'Upgrade', color: 'secondary' });
  return chips;
}

function StatusCell({ entity, row, actions }: { entity: EntityKind; row: EntityRow; actions: CellActions }) {
  const chips = statusChips(entity, row);
  if (!chips.length) return <Dash />;
  return (
    <Stack direction='row' spacing={0.5} sx={{ minWidth: 0, overflow: 'hidden' }}>
      {chips.map((c) => (
        <Tooltip key={c.status} title={c.label} enterDelay={600}>
          <Chip
            size='small'
            color={c.color}
            label={c.label}
            data-vx-status={c.status}
            onClick={(e) => {
              e.stopPropagation();
              actions.onStatus(e.currentTarget, c.status);
            }}
            sx={{ fontWeight: 600, height: 22, fontSize: '11.5px', minWidth: 0, flexShrink: 1, maxWidth: '100%' }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

function TimeCell({ value }: { value: string | null }) {
  const short = shortRelative(value);
  if (!short) return <Dash />;
  return (
    <Tooltip title={absoluteTime(value)} enterDelay={400}>
      <Ellipsis>{short}</Ellipsis>
    </Tooltip>
  );
}

/** A Kubernetes type: `v1/Service`, `apps/v1/Deployment`. */
const KUBERNETES_TYPE = /^([a-z0-9.-]+\/)?v\d+[a-z0-9]*\/[A-Z]/;

/**
 * A resource's name as people write it: "web", or "default/web". The row may
 * not carry its Unit's toolchain; a Kubernetes resource type says as much.
 */
function resourceName(row: ResourceViewRow, name: string): string {
  const toolchain = row.UnitToolchainType ?? (KUBERNETES_TYPE.test(row.ResourceType) ? 'Kubernetes/YAML' : undefined);
  return resourceDisplayName(name, toolchain);
}

const REVISION_FIELDS = new Set(['LastReleasedRevisionNum', 'UpstreamRevisionNum']);

const SPACE_COUNT_COLORS: Record<string, 'warning.main' | 'secondary.main'> = {
  UnreleasedUnitCount: 'warning.main',
  UpgradableUnitCount: 'secondary.main',
};

function fieldCell(entity: EntityKind, field: FieldDef, row: EntityRow, rowId: string, primary: boolean, actions: CellActions): ReactNode {
  if (field.type === 'status') return <StatusCell entity={entity} row={row} actions={actions} />;
  if (field.id === 'HeadRevisionNum' || field.id === 'Unit.HeadRevisionNum') {
    const rev = revisionParts(entity, row);
    if (!rev) return <Dash />;
    return (
      <Box component='span' sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        <Box component='span' sx={{ color: 'text.primary', fontWeight: 600 }}>
          r{rev.head}
        </Box>
        {rev.live !== null && <Box component='span' sx={{ color: 'text.disabled' }}>{` · live r${rev.live}`}</Box>}
      </Box>
    );
  }
  const value = field.value(row);
  // Revision numbers read like the Revision column; 0 means none (never released).
  if (REVISION_FIELDS.has(field.id)) {
    if (typeof value !== 'number' || value <= 0) return <Dash />;
    return (
      <Box component='span' sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
        r{value}
      </Box>
    );
  }
  if (value === null || value === '') return <Dash />;
  if (field.type === 'time') return <TimeCell value={String(value)} />;
  if (entity === 'Space' && typeof value === 'number') {
    const color = value > 0 ? SPACE_COUNT_COLORS[field.id] : undefined;
    return (
      <Box component='span' sx={{ fontVariantNumeric: 'tabular-nums', color, fontWeight: color ? 600 : undefined }}>
        {value}
      </Box>
    );
  }
  const text = String(value);
  if (field.id === 'ToolchainType' || field.id === 'Unit.ToolchainType') {
    return (
      <Tooltip title={text} enterDelay={400}>
        <span>
          <ValueButton rowId={rowId} field={field.id} value={text} actions={actions}>
            <Box component='span' sx={{ width: 8, height: 8, borderRadius: 0.5, flexShrink: 0, bgcolor: `${toolchainColor(text)}.main` }} />
            <Ellipsis>{shortToolchain(text)}</Ellipsis>
          </ValueButton>
        </span>
      </Tooltip>
    );
  }
  // The row's name opens the row (the drawer); other values open the cell popover.
  const shown = field.id === 'ResourceName' ? resourceName(row as ResourceViewRow, text) : text;
  if (!field.where || primary) return <Ellipsis strong={primary}>{shown}</Ellipsis>;
  return (
    <ValueButton rowId={rowId} field={field.id} value={text} actions={actions}>
      <Ellipsis strong={primary}>{shown}</Ellipsis>
    </ValueButton>
  );
}

export function TableCellContent({ entity, name, row, rowId, primary, serverMissing, actions }: Props) {
  if (serverMissing) {
    return (
      <Tooltip title='Save the view to compute this column' enterDelay={400}>
        <Box component='span' sx={{ flex: 1, alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>
          <Dash />
        </Box>
      </Tooltip>
    );
  }
  const field = fieldById(entity, name);
  if (field) return <>{fieldCell(entity, field, row, rowId, primary, actions)}</>;
  // A column the server computes from the View (a data path or an expression).
  const text = getCellValue(row as GroupNavRow, name);
  if (!text) return <Dash />;
  return (
    <Tooltip title={text.length > 40 ? text : ''} enterDelay={400}>
      <Ellipsis>{text}</Ellipsis>
    </Tooltip>
  );
}
