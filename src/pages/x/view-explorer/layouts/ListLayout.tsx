// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type KeyboardEvent, useCallback, useMemo, useRef, useState } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { fieldById } from '../model/fields';
import { flattenGroups } from '../model/grouping';
import { useResults } from '../state/results-context';
import { useActiveTab } from '../state/useExplorer';
import { TableCellContent } from '../table/cells/TableCellContent';
import { isPrimaryField } from '../table/format';
import { GROUP_INDENT, GroupHeaderRow } from '../table/GroupHeaderRow';
import { pathOf, statusColor, useGroupTree, useLayoutActions } from './shared';

/**
 * The List layout: one compact line per row under the view's group headers.
 * The row's name leads; the other visible columns follow as quiet text on the
 * right, leaving out the ones the groups already say. A row opens the drawer
 * (a click, or Enter or Space when it has focus); a value opens its popover; a
 * group count opens a peek. One row at a time is in the Tab order; ↑ and ↓ move
 * between rows, Home and End go to the first and last.
 */

const ROW_HEIGHT = 40;
const GROUP_HEIGHT = 36;
const NOUN = { Unit: 'units', Space: 'spaces', Resource: 'resources' } as const;

/** One list per tab and entity, so folded groups never carry over to another view. */
export function ListLayout() {
  const tab = useActiveTab();
  return <List key={`${tab.id}:${tab.work.entity}`} />;
}

function List() {
  const theme = useTheme();
  const { def, derived, universe } = useResults();
  const entity = def.entity;
  const tree = useGroupTree(entity, derived.rows, def.groupBy);
  const { actions, peek, openRow } = useLayoutActions(entity, def.groupBy, derived.rows, derived.rowId);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => flattenGroups(derived.rows, tree, collapsed), [derived.rows, tree, collapsed]);
  const visible = def.columns.map((c) => c.name);
  const primary = visible.find((n) => isPrimaryField(entity, n)) ?? visible[0];
  const meta = visible.filter((n) => n !== primary && !def.groupBy.includes(n));
  const statusField = fieldById(entity, 'Status');
  const paths = useMemo(() => {
    const out = new Map<string, ReturnType<typeof pathOf>>();
    const walk = (nodes: typeof tree, parent: ReturnType<typeof pathOf>) => {
      for (const n of nodes) {
        const p = pathOf(n, parent);
        out.set(n.key, p);
        walk(n.children, p);
      }
    };
    walk(tree, []);
    return out;
  }, [tree]);

  // The row in the Tab order (roving focus), by its id; the first row until another has had focus.
  const [focusId, setFocusId] = useState<string | null>(null);
  const rowIndexes = useMemo(() => items.flatMap((it, i) => (it.type === 'row' ? [i] : [])), [items]);

  const moveTo = (index: number) => {
    const it = items[index];
    if (it?.type !== 'row') return;
    const id = derived.rowId(it.row);
    setFocusId(id);
    virtualizer.scrollToIndex(index, { align: 'auto' });
    // The row may mount only after the scroll; focus it on the next frame.
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-testid="vx-list-row"][data-row-id="${CSS.escape(id)}"]`)?.focus());
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLElement>, index: number, row: (typeof derived.rows)[number]) => {
    if (e.target !== e.currentTarget) return;
    const at = rowIndexes.indexOf(index);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openRow(row, e);
    } else if (e.key === 'ArrowDown' && at < rowIndexes.length - 1) {
      e.preventDefault();
      moveTo(rowIndexes[at + 1]);
    } else if (e.key === 'ArrowUp' && at > 0) {
      e.preventDefault();
      moveTo(rowIndexes[at - 1]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveTo(rowIndexes[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      moveTo(rowIndexes[rowIndexes.length - 1]);
    }
  };

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.type === 'group' ? GROUP_HEIGHT : ROW_HEIGHT),
    getItemKey: (i) => {
      const it = items[i];
      return it.type === 'group' ? `g:${it.node.key}` : `r:${derived.rowId(it.row)}`;
    },
    overscan: 12,
  });

  // The row in the Tab order must be in the DOM, or Tab skips the list: when the
  // remembered row has scrolled out of the virtual window, the first drawn row stands in.
  const drawnRowIds: string[] = [];
  for (const v of virtualizer.getVirtualItems()) {
    const it = items[v.index];
    if (it?.type === 'row') drawnRowIds.push(derived.rowId(it.row));
  }
  const tabbable = focusId !== null && drawnRowIds.includes(focusId) ? focusId : (drawnRowIds[0] ?? null);

  if (!derived.loading && derived.rows.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }} data-testid='vx-list-empty'>
        <Typography variant='body2' color='text.secondary'>
          No {NOUN[entity]} match this view.
        </Typography>
      </Box>
    );
  }

  return (
    <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }} data-testid='vx-list' role='grid' aria-label={`${NOUN[entity]} as a list`}>
      <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((v) => {
          const item = items[v.index];
          const style = { position: 'absolute' as const, top: 0, left: 0, right: 0, height: v.size, transform: `translateY(${v.start}px)` };
          if (item.type === 'group') {
            return (
              <Box key={v.key} sx={style}>
                <GroupHeaderRow
                  entity={entity}
                  node={item.node}
                  collapsed={collapsed.has(item.node.key)}
                  rowIndex={v.index + 1}
                  onToggle={toggle}
                  onValue={(anchor, field, value, additive) => actions.onValue(anchor, '', field, value ?? '', additive)}
                  onPeek={(anchor, node) => peek(anchor, paths.get(node.key) ?? pathOf(node), node.rows)}
                />
              </Box>
            );
          }
          const row = item.row;
          const id = derived.rowId(row);
          const missing = universe.rowsWithoutServerColumns.has(id);
          const status = statusField ? String(statusField.value(row) ?? '') : '';
          return (
            <Box
              key={v.key}
              role='row'
              tabIndex={id === tabbable ? 0 : -1}
              data-testid='vx-list-row'
              data-row-id={id}
              onClick={(e) => openRow(row, e)}
              onFocus={(e) => e.target === e.currentTarget && setFocusId(id)}
              onKeyDown={(e) => onRowKeyDown(e, v.index, row)}
              sx={{
                ...style,
                display: 'flex',
                alignItems: 'center',
                gap: 1.75,
                pl: `${18 + item.depth * GROUP_INDENT}px`,
                pr: 2,
                borderBottom: 1,
                borderColor: 'divider',
                cursor: 'pointer',
                outline: 'none',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': { boxShadow: (t) => `inset 3px 0 0 ${t.palette.primary.main}`, bgcolor: 'action.hover' },
              }}
            >
              {statusField && (
                <Box
                  component='span'
                  title={status}
                  sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: statusColor(theme, status) }}
                />
              )}
              <Box role='gridcell' sx={{ minWidth: 0, flexShrink: 1, display: 'flex' }}>
                <TableCellContent entity={entity} name={primary} row={row} rowId={id} primary serverMissing={false} actions={actions} />
              </Box>
              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, color: 'text.secondary' }}>
                {meta.map((name) => (
                  <Box key={name} role='gridcell' data-column={name} sx={{ maxWidth: 200, minWidth: 0, display: 'flex', fontSize: 12.5 }}>
                    <TableCellContent
                      entity={entity}
                      name={name}
                      row={row}
                      rowId={id}
                      primary={false}
                      serverMissing={missing && universe.serverColumns.includes(name)}
                      actions={actions}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
