// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ExtendedUnitRead } from '@confighub/rtk-query';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { visuallyHidden } from '@mui/utils';
import { defaultRangeExtractor, type Range, useVirtualizer } from '@tanstack/react-virtual';

import { componentTheme } from '@/pages/x/apps/componentTheme';
import { LETTER_SX, letterFor } from '@/pages/x/apps/compare/slotLetter';

import { statusColor } from '../layouts/shared';
import { rowStatus } from '../layouts/matrix/matrix-model';
import { Kbd } from '../lenses/parts';
import { fieldById, STATUS_LABEL, type EntityRow } from '../model/fields';
import { buildGroupTree, type FlatItem, flattenGroups, type GroupNode } from '../model/grouping';
import { groupLevelsFor } from '../model/sort';
import { useResults } from '../state/results-context';
import { groupValueText } from '../table/groups';

/**
 * The rows of the view, narrowed to their names, beside the comparison: the
 * same filters, sort and groups as the table, so the viewer keeps their
 * place. A click on a Unit puts it in the next empty slot, or takes it out
 * when it is in one. Groups fold here without folding them in the table.
 *
 * One tab stop (a roving tabindex): ↑/↓, Home and End move between rows,
 * Enter or Space adds or removes a Unit, or folds a group. The list is
 * virtualized like the table, so a view of thousands of Units costs only the
 * rows on screen.
 */

const GROUP_HEIGHT = [28, 26] as const;
const UNIT_HEIGHT = 30;
const INDENT = 10;

const itemKey = (item: FlatItem<EntityRow>) => (item.type === 'group' ? `g:${item.node.key}` : `r:${(item.row as ExtendedUnitRead).Unit?.UnitID ?? ''}`);
const itemSize = (item: FlatItem<EntityRow>) => (item.type === 'group' ? GROUP_HEIGHT[Math.min(item.node.depth, 1)] : UNIT_HEIGHT);

interface Props {
  width: number;
  /** UnitIDs in slot order. */
  ids: readonly string[];
  onAdd: (id: string, slug: string) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
}

const ROW_BASE_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  height: '100%',
  border: 'none',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '-2px' },
} as const;

interface GroupRowProps {
  node: GroupNode<EntityRow>;
  label: string;
  folded: boolean;
  focusable: boolean;
  index: number;
  onToggle: (key: string) => void;
}

const RailGroupRow = memo(function RailGroupRow({ node, label, folded, focusable, index, onToggle }: GroupRowProps) {
  const value = groupValueText(node.value);
  return (
    <Box
      component='button'
      type='button'
      tabIndex={focusable ? 0 : -1}
      data-rail-index={index}
      data-testid='vx-rail-group'
      data-group-key={node.key}
      aria-expanded={!folded}
      aria-label={`${label} ${value || 'none'}, ${node.rows.length} ${node.rows.length === 1 ? 'Unit' : 'Units'}`}
      onClick={() => onToggle(node.key)}
      sx={{
        ...ROW_BASE_SX,
        pl: `${12 + node.depth * INDENT}px`,
        pr: '12px',
        bgcolor: node.depth === 0 ? 'grey.200' : 'grey.100',
        fontSize: 12.5,
        fontWeight: node.depth === 0 ? 600 : 500,
        color: node.depth === 0 ? 'text.primary' : 'text.secondary',
      }}
    >
      <ExpandMoreIcon sx={{ fontSize: 15, color: 'text.disabled', transform: folded ? 'rotate(-90deg)' : 'none', ml: '-3px' }} />
      <Box component='span' sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || <Box component='span' sx={{ color: 'text.disabled', fontWeight: 400 }}>No {label}</Box>}
      </Box>
      <Box component='span' sx={{ color: 'text.disabled', fontWeight: 400, flexShrink: 0 }}>
        · {node.rows.length}
      </Box>
    </Box>
  );
});

/**
 * The Unit's status, as the Status column says it: a filled dot in the status
 * colour, a ring for a Unit with no Target (it has nothing to be released to),
 * and nothing when the status is not known. The space stays, so names line up.
 */
function StatusDot({ status, color }: { status: string; color: string }) {
  const known = KNOWN_STATUS.has(status);
  const ring = status === STATUS_LABEL.untargeted;
  return (
    <Box
      component='span'
      title={known ? status : undefined}
      data-testid='vx-rail-status'
      data-status={known ? status : undefined}
      sx={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        flexShrink: 0,
        boxSizing: 'border-box',
        visibility: known ? 'visible' : 'hidden',
        ...(ring ? { border: '1.5px solid', borderColor: color } : { bgcolor: color }),
      }}
    />
  );
}

const KNOWN_STATUS: ReadonlySet<string> = new Set(Object.values(STATUS_LABEL));

interface UnitRowProps {
  id: string;
  slug: string;
  space: string;
  showSpace: boolean;
  status: string;
  dot: string;
  /** The slot letter, when the Unit is in a slot. */
  letter: string;
  indent: number;
  focusable: boolean;
  index: number;
  onPress: (id: string, slug: string, held: boolean) => void;
}

const RailUnitRow = memo(function RailUnitRow({ id, slug, space, showSpace, status, dot, letter, indent, focusable, index, onPress }: UnitRowProps) {
  const where = `Space ${space}, ${status}`;
  return (
    <Box
      component='button'
      type='button'
      tabIndex={focusable ? 0 : -1}
      data-rail-index={index}
      data-testid='vx-rail-unit'
      data-unit-id={id}
      data-slot={letter || undefined}
      aria-label={letter ? `${slug} (${where}) is in slot ${letter}. Remove it from the comparison` : `Add ${slug} (${where}) to the comparison`}
      onClick={() => onPress(id, slug, !!letter)}
      sx={{
        ...ROW_BASE_SX,
        pl: `${indent}px`,
        pr: '10px',
        bgcolor: letter ? 'primary.light' : 'background.paper',
        borderBottom: `1px solid ${componentTheme.borderSubtle}`,
        fontSize: 13,
        fontWeight: letter ? 500 : 400,
        color: 'text.primary',
        '&:hover': { bgcolor: letter ? 'primary.light' : 'background.default' },
        '& .vx-rail-hint': { opacity: 0 },
        '&:hover .vx-rail-hint, &:focus-visible .vx-rail-hint': { opacity: 1 },
      }}
    >
      <StatusDot status={status} color={dot} />
      {letter && (
        <Box component='span' sx={LETTER_SX}>
          {letter}
        </Box>
      )}
      <Box component='span' sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {slug}
        {showSpace && (
          <Box component='span' sx={{ color: 'text.disabled', fontWeight: 400 }}>
            {' '}· {space}
          </Box>
        )}
      </Box>
      <Box
        component='span'
        className='vx-rail-hint'
        aria-hidden
        sx={{ flexShrink: 0, fontSize: 11.5, fontWeight: 500, color: letter ? 'text.secondary' : 'primary.main' }}
      >
        {letter ? '✕' : '+ add'}
      </Box>
    </Box>
  );
});

export function CompareRail({ width, ids, onAdd, onRemove, onBack }: Props) {
  const theme = useTheme();
  const { def, derived } = useResults();
  const { rows } = derived;
  const entity = def.entity;
  const [folds, setFolds] = useState<ReadonlySet<string>>(() => new Set());
  const onToggle = useCallback(
    (key: string) =>
      setFolds((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  const groupKey = def.groupBy.join('|');
  const levels = useMemo(
    () => groupLevelsFor(entity, def.groupBy),
    // groupKey stands for def.groupBy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, groupKey],
  );
  const tree = useMemo(() => buildGroupTree(rows, levels), [rows, levels]);
  const items = useMemo(() => flattenGroups(rows, tree, folds), [rows, tree, folds]);
  const statusOf = useMemo(() => rowStatus(entity), [entity]);
  const showSpace = !def.groupBy.includes('Space');
  const unitIndent = 14 + levels.length * INDENT;

  const letters = useMemo(() => new Map(ids.map((id, i) => [id, letterFor(i)])), [ids]);
  const onPress = useCallback((id: string, slug: string, held: boolean) => (held ? onRemove(id) : onAdd(id, slug)), [onAdd, onRemove]);

  // The one row in the Tab order: the last one moved to, else slot A's Unit, else the first row.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const keys = useMemo(() => items.map(itemKey), [items]);
  const slotAKey = ids[0] ? `r:${ids[0]}` : null;
  const activeAt = activeKey ? keys.indexOf(activeKey) : -1;
  const slotAAt = slotAKey ? keys.indexOf(slotAKey) : -1;
  const focusIndex = activeAt !== -1 ? activeAt : slotAAt !== -1 ? slotAAt : 0;
  const focusKey = keys[focusIndex];

  // The row in the Tab order stays drawn when it scrolls out of the window, or Tab would skip the rail.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const drawn = defaultRangeExtractor(range);
      if (focusIndex >= range.count || drawn.includes(focusIndex)) return drawn;
      return [...drawn, focusIndex].sort((a, b) => a - b);
    },
    [focusIndex],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    rangeExtractor,
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i] ? itemSize(items[i]) : UNIT_HEIGHT),
    getItemKey: (i) => itemKey(items[i]),
    overscan: 10,
  });


  // Slot A's Unit is in view when the rail opens, as the row was in the table.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || items.length === 0) return;
    opened.current = true;
    if (slotAAt > 0) virtualizer.scrollToIndex(slotAAt, { align: 'center' });
  }, [items.length, slotAAt, virtualizer]);

  // A row moved to by key may not be drawn yet: it takes focus once the list has scrolled to it.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const at = keys.indexOf(key);
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-rail-index="${at}"]`);
    if (el) {
      pendingFocus.current = null;
      el.focus();
    }
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || keys.length === 0) return;
    e.preventDefault();
    const from = Number((e.target as HTMLElement).closest<HTMLElement>('[data-rail-index]')?.dataset.railIndex ?? focusIndex);
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : Math.min(keys.length - 1, Math.max(0, from + (e.key === 'ArrowDown' ? 1 : -1)));
    pendingFocus.current = keys[to];
    setActiveKey(keys[to]);
    virtualizer.scrollToIndex(to);
  };

  const label = (field: string) => fieldById(entity, field)?.label ?? field;

  return (
    <Box
      component='nav'
      aria-label='Units in this view'
      data-testid='vx-compare-rail'
      sx={{
        width,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Button
          size='small'
          color='inherit'
          onClick={onBack}
          startIcon={<ArrowBackIcon sx={{ fontSize: '15px !important' }} />}
          data-testid='vx-rail-back'
          sx={{ color: 'text.secondary', px: 0.75, gap: 0.25 }}
        >
          Table
          <Kbd aria-hidden sx={{ ml: 0.75 }}>
            esc
          </Kbd>
        </Button>
        <Box sx={{ flex: 1 }} />
        <Box component='span' sx={{ typography: 'body2', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }} data-testid='vx-rail-count'>
          {rows.length}
          <Box component='span' sx={visuallyHidden}>
            {rows.length === 1 ? ' Unit' : ' Units'}
          </Box>
        </Box>
      </Box>
      {items.length === 0 ? (
        <Box sx={{ p: 2, typography: 'body2', color: 'text.secondary' }}>No Units match the filters.</Box>
      ) : (
        <Box
          ref={scrollRef}
          onKeyDown={onKeyDown}
          onFocus={(e) => {
            const at = (e.target as HTMLElement).dataset.railIndex;
            if (at !== undefined && keys[Number(at)] !== activeKey) setActiveKey(keys[Number(at)]);
          }}
          sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>
          <Box role='list' sx={{ position: 'relative', height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((v) => {
              const item = items[v.index];
              const focusable = keys[v.index] === focusKey;
              return (
                <Box
                  key={v.key}
                  role='listitem'
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: v.size, transform: `translateY(${v.start}px)` }}
                >
                  {item.type === 'group' ? (
                    <RailGroupRow
                      node={item.node}
                      label={label(item.node.field)}
                      folded={folds.has(item.node.key)}
                      focusable={focusable}
                      index={v.index}
                      onToggle={onToggle}
                    />
                  ) : (
                    <RailUnitItem
                      row={item.row as ExtendedUnitRead}
                      statusOf={statusOf}
                      dotFor={(s) => statusColor(theme, s)}
                      showSpace={showSpace}
                      letter={letters.get((item.row as ExtendedUnitRead).Unit?.UnitID ?? '') ?? ''}
                      indent={levels.length ? unitIndent : 12}
                      focusable={focusable}
                      index={v.index}
                      onPress={onPress}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}

interface UnitItemProps {
  row: ExtendedUnitRead;
  statusOf: (row: EntityRow) => string;
  dotFor: (status: string) => string;
  showSpace: boolean;
  letter: string;
  indent: number;
  focusable: boolean;
  index: number;
  onPress: (id: string, slug: string, held: boolean) => void;
}

/** Reads a Unit row into the plain values `RailUnitRow` is memoized on. */
function RailUnitItem({ row, statusOf, dotFor, ...rest }: UnitItemProps) {
  const status = statusOf(row);
  return <RailUnitRow id={row.Unit?.UnitID ?? ''} slug={row.Unit?.Slug ?? ''} space={row.Space?.Slug ?? ''} status={status} dot={dotFor(status)} {...rest} />;
}
