// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type KeyboardEvent, useCallback, useMemo, useRef, useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import { visuallyHidden } from '@mui/utils';

import type { ExtendedUnitRead } from '@confighub/rtk-query';

import { type EntityAdapter, getAdapter } from '../adapters';
import { useCompare } from '../compare/compare-context';
import { CompareController } from '../compare/CompareController';
import { CompareView } from '../compare/CompareView';
import { getCellValue, type GroupNavRow } from '../cell-value';
import { type DetailLine, EntityDetailPanel } from '../components/EntityDetailDrawer/EntityDetailDrawer';
import { BoardLayout } from '../layouts/BoardLayout';
import { MatrixLayout } from '../layouts/MatrixLayout';
import { isModalOpen } from '../keys/usePageShortcuts';
import { compareIdsFor } from '../model/compare';
import { fieldById, type EntityRow } from '../model/fields';
import { tableOrder, type TableOrder } from '../model/table-order';
import type { EntityKind, Layout } from '../model/types';
import type { SavedView } from '../queries/useViews';
import { useExplorerContext, useRegisterSlot } from '../state/context';
import { RowSelectionProvider } from '../state/RowSelectionProvider';
import { useRowSelection } from '../state/selection-context';
import { useActiveTab } from '../state/useExplorer';
import { useResults } from '../state/results-context';
import { absoluteTime } from '../table/format';
import { ExplorerTable, type RevealRequest } from '../table/ExplorerTable';
import { rowNeedsAttention } from '../unit-panel/attention';
import { nextProblemIndex } from '../unit-panel/group-context';
import { panelKeyAction } from '../unit-panel/keys';
import { useSettledId } from '../unit-panel/useSettledId';
import { type PanelSelection, useUnitPanel } from '../unit-panel/useUnitPanel';
import type { ActionId } from '../unit-panel/verdict';
import type { UnitPanelModel, UnitPanelTab } from '../unit-panel/view/types';
import { withExplorerReturn } from './explorer-link';
import { HoldWhileHidden } from './HoldWhileHidden';
import { Toolbar } from './Toolbar';

/**
 * The right side of the view: the toolbar, then the rows in the chosen
 * layout. A row opens in the drawer, which starts below the toolbar so Save
 * stays in reach; ⌘-click opens the row's own page instead, except in a Units
 * Table, where ⌘-click picks the row and ⌘↵ opens its page.
 *
 * In compare mode the comparison takes the whole area. The toolbar, the rows
 * and the drawer stay mounted under it, hidden (not `display: none`, which
 * would drop the scroll position and measure every column as 0 wide), in the
 * same box, so "Back to table" finds the scroll, the folded groups, the
 * picked rows and the open row as they were.
 */

/** Out of sight, out of the accessibility tree and out of reach of the pointer, at the size it had. */
const HIDDEN_STYLE = { position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none' } as const;

const NO_ORDER: TableOrder = { tree: [], ordered: [], index: new Map() };

const OTHER_LAYOUTS: Record<Exclude<Layout, 'table'>, () => JSX.Element | null> = {
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

interface RowPanelProps {
  row: GroupNavRow;
  rowId: string;
  saved: SavedView | undefined;
  adapter: EntityAdapter;
  details: DetailLine[] | undefined;
  rowHref: string | undefined;
  /** The row is a Unit, which the panel's "Compare with…" can compare. */
  isUnit: boolean;
  /** A Unit's Summary: its verdict, its place in the view and what to do next. */
  unit: UnitPanelModel | null;
  /** The panel is moving from row to row: the row's own reads wait. */
  holdReads: boolean;
  onClose: () => void;
}

/** The open row's panel; a Unit's offers "Compare with…", which opens the picker with it in slot A. */
function RowPanel({ row, rowId, saved, adapter, details, rowHref, isUnit, unit, holdReads, onClose }: RowPanelProps) {
  const { openPicker, pickerSource } = useCompare();
  const onCompare = useCallback(
    (anchor: HTMLElement) => openPicker({ kind: 'start', base: rowId, source: 'drawer', anchor }),
    [openPicker, rowId],
  );
  return (
    <EntityDetailPanel
      row={row}
      view={saved?.extended ?? null}
      adapter={adapter}
      details={details}
      rowHref={rowHref}
      onClose={onClose}
      onCompare={isUnit ? onCompare : undefined}
      compareExpanded={pickerSource === 'drawer'}
      unit={unit ?? undefined}
      holdReads={holdReads}
    />
  );
}

/** The row open in the panel, by id, with the tab and entity it was opened in, and the row as it was then. */
interface OpenedRow {
  id: string;
  row: EntityRow;
  tabId: string;
  entity: EntityKind;
}

/** A Unit's panel acts on the open Unit only: these keys run the first of its actions that the verdict lists and that can run. */
const KEYED: Partial<Record<string, readonly ActionId[]>> = {
  // u previews first; the preview's "Upgrade…" goes on to the confirm.
  upgrade: ['upgrade', 'preview-upgrade'],
  'edit-config': ['edit-config'],
  restore: ['restore', 'restore-history'],
};

function listedAndRunnable(model: UnitPanelModel, id: ActionId): boolean {
  const { primary, secondary } = model.verdict;
  const listed = (primary?.id === id && primary.enabled) || secondary.some((a) => a.id === id && a.enabled);
  return listed && !!model.actions[id];
}

/**
 * The open row is owned here, above the row selection and compare mode, which
 * both need it (`x` picks the open row, "Compare with…" starts from it);
 * everything else, the panel included, is drawn below them, so the panel can
 * read the selection (Run a Function adds the open Unit to it).
 */
export function ResultsPane() {
  const { def } = useResults();
  const { state } = useExplorerContext();
  const tab = useActiveTab();
  const comparing = def.entity === 'Unit' && compareIdsFor(state, tab.id).length > 0;
  // The open row belongs to the tab and entity it was opened in; on another
  // tab or entity the panel is closed, without an effect to close it.
  const [opened, setOpened] = useState<OpenedRow | null>(null);
  const current = opened && opened.tabId === tab.id && opened.entity === def.entity ? opened : null;
  const selectedId = current?.id ?? null;
  return (
    <RowSelectionProvider panelRowId={comparing ? null : selectedId}>
      <CompareController panelUnitId={def.entity === 'Unit' && !comparing ? selectedId : null}>
        <ResultsBody current={current} setOpened={setOpened} comparing={comparing} />
      </CompareController>
    </RowSelectionProvider>
  );
}

interface ResultsBodyProps {
  current: OpenedRow | null;
  setOpened: (opened: OpenedRow | null) => void;
  comparing: boolean;
}

function ResultsBody({ current, setOpened, comparing }: ResultsBodyProps) {
  const { def, saved, universe, derived } = useResults();
  const tab = useActiveTab();
  const selection = useRowSelection();
  // The panel's page links carry the URL of this tab; reading it here re-renders them when it changes.
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  // The row is kept by id and read from the universe on each render, so the panel follows a refetch
  // (an upgrade, a release); the row as opened stands in only once it has left the universe.
  const panelOpen = !!current;
  const rowById = useMemo(
    () => (panelOpen ? new Map(universe.rows.map((r) => [derived.rowId(r), r])) : null),
    [panelOpen, universe.rows, derived],
  );
  const panelRow = current ? (rowById?.get(current.id) ?? current.row) : null;
  // Deleted, or no longer visible to the viewer: the panel says so rather than show the row as it was.
  const rowGone = !!current && !!rowById && !universe.isLoading && !universe.isError && !rowById.has(current.id);
  const selectedId = current?.id ?? null;
  // The row the panel has stayed on: its reads wait for it, so a fast j/k reads nothing for the rows passed over.
  const settledId = useSettledId(comparing ? null : selectedId);
  const settled = settledId !== null && settledId === selectedId;
  const openId = useRef<string | null>(null);
  openId.current = selectedId;
  const returnFocus = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const adapter = getAdapter(def.entity);
  // The tab of a Unit's panel is kept while the panel moves from row to row, and starts on Summary again once it closes.
  const [unitTab, setUnitTab] = useState<UnitPanelTab>('summary');
  // A panel hidden by a switch of tab or entity is closed, so it opens on Summary again, as after Esc.
  if (!current && unitTab !== 'summary') setUnitTab('summary');
  // Moves from the keyboard and the panel's own buttons show the row in the table; a click on a row does not need to,
  // and clears the last request, so a table drawn later (from the Board) does not scroll to an old row.
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const revealSeq = useRef(0);

  const openRow = useCallback(
    (row: EntityRow) => {
      const active = document.activeElement;
      const inPanel = active instanceof HTMLElement && !!panelRef.current?.contains(active);
      // Opened from the page (not by moving inside the panel): remember where to go back to.
      if (!inPanel) returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
      setOpened({ id: derived.rowId(row), row, tabId: tab.id, entity: def.entity });
      setReveal(null);
      // The panel's content is replaced for the new row; keep focus in the panel so its keys and Esc keep working.
      if (inPanel) requestAnimationFrame(() => panelRef.current?.focus());
    },
    [tab.id, def.entity, derived, setOpened],
  );
  useRegisterSlot('openRow', openRow);
  const goTo = useCallback(
    (row: EntityRow) => {
      openRow(row);
      const id = derived.rowId(row);
      setReveal({ id, seq: ++revealSeq.current });
    },
    [openRow, derived],
  );
  const closeRow = useCallback(() => {
    const id = openId.current;
    setOpened(null);
    setUnitTab('summary');
    setReveal(null);
    // Back to the row the panel shows now, which ↑/↓ may have moved away from the one it opened on.
    const rowEl = id ? document.querySelector<HTMLElement>(`[data-testid="vx-row"][data-row-id="${CSS.escape(id)}"]`) : null;
    const fallback = returnFocus.current?.isConnected ? returnFocus.current : null;
    (rowEl ?? fallback)?.focus();
    returnFocus.current = null;
  }, [setOpened]);
  const openHref = useCallback(
    (row: EntityRow) => {
      const href = adapter.getRowHref(row as GroupNavRow);
      if (href) window.open(withExplorerReturn(href), '_blank', 'noopener');
    },
    [adapter],
  );

  // The table's order, built once per change of the rows rather than on each key, and only while a panel is open.
  const order = useMemo(
    () => (panelOpen ? tableOrder(derived.rows, def.groupBy, def.entity, derived.rowId) : NO_ORDER),
    [panelOpen, derived, def.groupBy, def.entity],
  );

  /** Open the row above or below the open one, in the order the table shows them; false when there is none. */
  const move = useCallback(
    (delta: 1 | -1): boolean => {
      const at = selectedId === null ? undefined : order.index.get(selectedId);
      const next = at === undefined ? undefined : order.ordered[at + delta];
      if (!next) return false;
      goTo(next);
      return true;
    },
    [selectedId, order, goTo],
  );
  const moveRow = useCallback((delta: 1 | -1) => void move(delta), [move]);
  /** Open the next (or previous) Unit that needs attention, across groups, wrapping. */
  const moveToProblem = useCallback(
    (dir: 1 | -1): boolean => {
      const at = selectedId === null ? -1 : (order.index.get(selectedId) ?? -1);
      const i = nextProblemIndex(order.ordered, at, dir, rowNeedsAttention);
      if (i === null) return false;
      goTo(order.ordered[i]);
      return true;
    },
    [selectedId, order, goTo],
  );

  const isUnit = def.entity === 'Unit';
  const focusPanel = useCallback(() => panelRef.current?.focus(), []);
  const { enabled: selectionEnabled, count: pickedCount, picked, pick } = selection;
  const panelSelection = useMemo<PanelSelection>(
    () => ({ enabled: selectionEnabled, count: pickedCount, picked, pick }),
    [selectionEnabled, pickedCount, picked, pick],
  );
  const { model: unitModel, announcement } = useUnitPanel({
    row: isUnit && panelRow && !comparing ? (panelRow as ExtendedUnitRead) : null,
    rowId: selectedId,
    order,
    allRows: universe.rows,
    rowIdOf: derived.rowId,
    selection: panelSelection,
    search,
    gone: rowGone,
    settled,
    goTo,
    move: moveRow,
    tab: unitTab,
    onTabChange: setUnitTab,
    focusPanel,
  });

  const comparingNow = useRef(comparing);
  comparingNow.current = comparing;
  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Held behind compare mode, the panel acts on nothing: a key that reaches it anyway changes no row. The hold keeps
    // this handler as it was when compare mode began, so it reads compare mode from a ref.
    if (comparingNow.current) return;
    // A dialog opened from the panel is portalled out of its DOM, but its keys still reach here through React.
    const fromPanel = e.target instanceof Node && e.currentTarget.contains(e.target);
    if (e.key === 'Escape') {
      // A dialog closes itself on Esc, before the panel.
      if (!fromPanel) return;
      e.stopPropagation();
      closeRow();
      return;
    }
    const action = panelKeyAction({
      key: e.key,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      fromPanel,
      onContainer: e.target === e.currentTarget,
      textEntry: isTextEntry(e.target),
      modalOpen: isModalOpen(),
    });
    if (action === 'next' || action === 'previous') {
      if (move(action === 'next' ? 1 : -1)) e.preventDefault();
    } else if ((action === 'next-problem' || action === 'previous-problem') && unitModel) {
      if (moveToProblem(action === 'next-problem' ? 1 : -1)) e.preventDefault();
    } else if (action === 'primary' && unitModel?.tab === 'summary') {
      const primary = unitModel.verdict.primary;
      const run = primary?.enabled && primary.id ? unitModel.actions[primary.id] : undefined;
      if (run) {
        e.preventDefault();
        run();
      }
    } else if (action === 'run-function' && unitModel) {
      // The same as the "Run a Function" item: pick the open Unit and open Functions (never close it). The page's own
      // f, which toggles the panel, does not see the key. Where the item is off (a Unit gone or hidden, the Board),
      // f does nothing here.
      e.preventDefault();
      e.stopPropagation();
      if (listedAndRunnable(unitModel, 'run-function')) unitModel.actions['run-function']?.();
    } else if (action && action !== 'run-function' && action !== 'primary' && unitModel) {
      // The panel owns its letters while it has focus, run or not: `e` also means Exclude in a cell's popover.
      e.preventDefault();
      const id = KEYED[action]?.find((a) => listedAndRunnable(unitModel, a));
      if (id) unitModel.actions[id]?.();
    }
  };

  const details = useMemo<DetailLine[] | undefined>(() => {
    // A Unit's panel has no Details tab.
    if (!panelRow || isUnit) return undefined;
    const missing = universe.rowsWithoutServerColumns.has(derived.rowId(panelRow));
    return def.columns.map((c) => ({
      label: fieldById(def.entity, c.name)?.label ?? c.name,
      value: detailText(def.entity, c.name, panelRow, missing && universe.serverColumns.includes(c.name)),
    }));
  }, [panelRow, isUnit, def.columns, def.entity, derived, universe.rowsWithoutServerColumns, universe.serverColumns]);

  const href = panelRow ? adapter.getRowHref(panelRow as GroupNavRow) : undefined;
  const panelTitle = panelRow ? getCellValue(panelRow as GroupNavRow, 'Slug') || getCellValue(panelRow as GroupNavRow, 'DisplayName') : '';
  const panelHref = href ? withExplorerReturn(href, search) : undefined;

  // Focus moves into the panel when it opens (not when ↑/↓ change its row).
  const focusOnOpen = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el;
    el?.focus();
  }, []);

  const Other = def.layout === 'table' ? null : OTHER_LAYOUTS[def.layout];

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }} data-testid='vx-results'>
      <Box
        aria-hidden={comparing || undefined}
        data-testid='vx-results-layout'
        style={comparing ? HIDDEN_STYLE : undefined}
        sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <HoldWhileHidden hold={comparing}>
          <Toolbar />
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {Other ? <Other /> : <ExplorerTable selectedId={selectedId} onOpenRow={openRow} onOpenHref={openHref} reveal={reveal} />}
            </Box>
            {panelRow && (
              <Box
                ref={focusOnOpen}
                role='complementary'
                aria-label={panelTitle ? `Row details: ${panelTitle}` : 'Row details'}
                tabIndex={-1}
                data-testid='vx-row-panel'
                onKeyDown={onPanelKeyDown}
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
                {/* Outside the row's own content, which is drawn anew for each row, so a move is announced. */}
                <Box role='status' aria-live='polite' sx={visuallyHidden} data-testid='vx-row-panel-status'>
                  {announcement}
                </Box>
                <RowPanel
                  row={panelRow as GroupNavRow}
                  rowId={selectedId ?? ''}
                  saved={saved}
                  adapter={adapter}
                  details={details}
                  rowHref={panelHref}
                  isUnit={isUnit}
                  unit={unitModel}
                  holdReads={!settled}
                  onClose={closeRow}
                />
              </Box>
            )}
          </Box>
        </HoldWhileHidden>
      </Box>
      {comparing && <CompareView />}
    </Box>
  );
}
