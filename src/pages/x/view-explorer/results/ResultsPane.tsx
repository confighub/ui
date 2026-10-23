// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useRef, useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';

import { getAdapter } from '../adapters';
import { getCellValue, type GroupNavRow } from '../cell-value';
import { type DetailLine, EntityDetailPanel } from '../components/EntityDetailDrawer/EntityDetailDrawer';
import { BoardLayout } from '../layouts/BoardLayout';
import { ListLayout } from '../layouts/ListLayout';
import { MatrixLayout } from '../layouts/MatrixLayout';
import { fieldById, type EntityRow } from '../model/fields';
import { buildGroupTree, flattenGroups } from '../model/grouping';
import { groupLevelFor } from '../model/sort';
import type { EntityKind, Layout } from '../model/types';
import { useRegisterSlot } from '../state/context';
import { useActiveTab } from '../state/useExplorer';
import { useResults } from '../state/results-context';
import { absoluteTime } from '../table/format';
import { ExplorerTable } from '../table/ExplorerTable';
import { withExplorerReturn } from './explorer-link';
import { Toolbar } from './Toolbar';

/**
 * The right side of the view: the toolbar, then the rows in the chosen
 * layout. A row opens in the drawer, which starts below the toolbar so Save
 * stays in reach; ⌘-click opens the row's own page instead.
 */

const OTHER_LAYOUTS: Record<Exclude<Layout, 'table'>, () => JSX.Element | null> = {
  list: ListLayout,
  board: BoardLayout,
  matrix: MatrixLayout,
};

function detailText(entity: EntityKind, name: string, row: EntityRow, missing: boolean): string {
  if (missing) return 'Save the view to compute this column';
  const field = fieldById(entity, name);
  if (!field) return getCellValue(row as GroupNavRow, name);
  const v = field.value(row);
  if (v === null) return '';
  return field.type === 'time' ? absoluteTime(String(v)) : String(v);
}

/** Keys typed into these belong to them, not to the panel's ↑/↓. */
function isTextEntry(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest('.monaco-editor'));
}

export const ROW_PANEL_WIDTH = 480;

export function ResultsPane() {
  const { def, saved, universe, derived } = useResults();
  const tab = useActiveTab();
  // The panel's page links carry the URL of this tab; reading it here re-renders them when it changes.
  const [searchParams] = useSearchParams();
  // The open row belongs to the tab and entity it was opened in; on another
  // tab or entity the panel is closed, without an effect to close it.
  const [opened, setOpened] = useState<{ row: EntityRow; tabId: string; entity: EntityKind } | null>(null);
  const panelRow = opened && opened.tabId === tab.id && opened.entity === def.entity ? opened.row : null;
  const returnFocus = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const adapter = getAdapter(def.entity);

  const openRow = useCallback(
    (row: EntityRow) => {
      const active = document.activeElement;
      const inPanel = active instanceof HTMLElement && !!panelRef.current?.contains(active);
      // Opened from the page (not by moving inside the panel): remember where to go back to.
      if (!inPanel) returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
      setOpened({ row, tabId: tab.id, entity: def.entity });
      // The panel's content is replaced for the new row; keep focus in the panel so ↑/↓ and Esc keep working.
      if (inPanel) requestAnimationFrame(() => panelRef.current?.focus());
    },
    [tab.id, def.entity],
  );
  useRegisterSlot('openRow', openRow);
  const closeRow = useCallback(() => {
    setOpened(null);
    returnFocus.current?.focus();
    returnFocus.current = null;
  }, []);
  const openHref = useCallback(
    (row: EntityRow) => {
      const href = adapter.getRowHref(row as GroupNavRow);
      if (href) window.open(withExplorerReturn(href), '_blank', 'noopener');
    },
    [adapter],
  );

  /** The row above or below the open one, in the order the table shows them. */
  const neighbour = useCallback(
    (delta: number): EntityRow | null => {
      if (!panelRow) return null;
      let ordered: readonly EntityRow[] = derived.rows;
      if (def.groupBy.length) {
        const levels = def.groupBy.map((f) => groupLevelFor(def.entity, f)).filter((l): l is NonNullable<typeof l> => l !== null);
        ordered = flattenGroups(derived.rows, buildGroupTree(derived.rows, levels), new Set())
          .filter((i): i is Extract<typeof i, { type: 'row' }> => i.type === 'row')
          .map((i) => i.row);
      }
      const id = derived.rowId(panelRow);
      const at = ordered.findIndex((r) => derived.rowId(r) === id);
      return at === -1 ? null : (ordered[at + delta] ?? null);
    },
    [panelRow, derived, def.groupBy, def.entity],
  );

  const selectedId = panelRow ? derived.rowId(panelRow) : null;
  const details = useMemo<DetailLine[] | undefined>(() => {
    if (!panelRow) return undefined;
    const missing = universe.rowsWithoutServerColumns.has(derived.rowId(panelRow));
    return def.columns.map((c) => ({
      label: fieldById(def.entity, c.name)?.label ?? c.name,
      value: detailText(def.entity, c.name, panelRow, missing && universe.serverColumns.includes(c.name)),
    }));
  }, [panelRow, def.columns, def.entity, derived, universe.rowsWithoutServerColumns, universe.serverColumns]);

  const href = panelRow ? adapter.getRowHref(panelRow as GroupNavRow) : undefined;
  const panelHref = href ? withExplorerReturn(href, searchParams.toString()) : undefined;

  // Focus moves into the panel when it opens (not when ↑/↓ change its row).
  const focusOnOpen = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el;
    el?.focus();
  }, []);

  const Other = def.layout === 'table' ? null : OTHER_LAYOUTS[def.layout];

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }} data-testid='vx-results'>
      <Toolbar />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {Other ? <Other /> : <ExplorerTable selectedId={selectedId} onOpenRow={openRow} onOpenHref={openHref} />}
        </Box>
        {panelRow && (
          <Box
            ref={focusOnOpen}
            role='complementary'
            aria-label='Row details'
            tabIndex={-1}
            data-testid='vx-row-panel'
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                closeRow();
                return;
              }
              if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isTextEntry(e.target)) {
                const next = neighbour(e.key === 'ArrowDown' ? 1 : -1);
                if (next) {
                  e.preventDefault();
                  openRow(next);
                }
              }
            }}
            sx={{
              width: ROW_PANEL_WIDTH,
              maxWidth: '50%',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              borderLeft: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              outline: 'none',
            }}
          >
            <EntityDetailPanel
              row={panelRow as GroupNavRow}
              view={saved?.extended ?? null}
              adapter={adapter}
              details={details}
              rowHref={panelHref}
              onClose={closeRow}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
