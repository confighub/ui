// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';
import { useVirtualizer } from '@tanstack/react-virtual';

import { getChipIcon } from './field-icon';
import { type FlatTreeRow, TREE_LAYOUT, findTypeAheadIndex } from './groupTree';
import type { GroupNavItemProps, GroupNavNodeContext } from './types';
import type { FieldIconKey } from '@/components/query-builder/field-icons';

const ROW_SLOT = TREE_LAYOUT.rowHeight + TREE_LAYOUT.rowGap;

/**
 * At or below this many rows on screen every row is in the DOM, so the
 * browser's find-in-page still finds any group. Above it only the rows in
 * view (and `OVERSCAN` on each side) are: thousands of mounted rows are what
 * made the panel slow to open, update, and leave.
 */
const RENDER_ALL_LIMIT = 200;
const OVERSCAN = 10;

const TreeRoot = styled(Box)({
  position: 'relative',
  outline: 'none',
});

/** The row's slot in the list: the dashed guide lines and the row itself. */
const RowSlot = styled('div')({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: ROW_SLOT,
});

/** One ancestor level's dashed guide line, through the full height of the slot. */
const Guide = styled('span')(({ theme }) => ({
  position: 'absolute',
  top: 0,
  bottom: 0,
  borderLeft: `1px dashed ${theme.palette.divider}`,
}));

const RowContent = styled('div', {
  shouldForwardProp: (prop) => prop !== '$hasSelections',
})<{ $hasSelections?: boolean }>(({ theme, $hasSelections }) => ({
  position: 'relative',
  boxSizing: 'border-box',
  height: TREE_LAYOUT.rowHeight,
  display: 'flex',
  alignItems: 'center',
  gap: TREE_LAYOUT.chevronGap,
  padding: `0 ${TREE_LAYOUT.rowPaddingX}px`,
  borderRadius: theme.shape.borderRadius,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: 'box-shadow 0.15s ease',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '&[aria-selected="true"]': {
    backgroundColor: theme.palette.action.selected,
  },
  // A caller-driven ring for a node with its own nested selection (see
  // `GroupNavItemProps.$hasSelections`).
  ...($hasSelections && {
    boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.4)}`,
    '&[aria-selected="true"]': {
      backgroundColor: theme.palette.action.selected,
      boxShadow: `0 0 0 2px ${theme.palette.primary.main}`,
    },
  }),
  // Keyboard focus only: a mouse click focuses the tree without
  // `:focus-visible`, so a clicked row shows no ring.
  '[role="tree"]:focus-visible &[data-focused="true"]': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: -2,
  },
}));

const ChevronSlot = styled('span')(({ theme }) => ({
  width: TREE_LAYOUT.chevronWidth,
  flexShrink: 0,
  display: 'flex',
  justifyContent: 'center',
  '& svg': {
    fontSize: 18,
    color: theme.palette.text.secondary,
  },
}));

const RowLabel = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: TREE_LAYOUT.iconGap,
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  paddingLeft: TREE_LAYOUT.labelPaddingLeft,
  fontSize: '0.875rem',
});

const CountBadge = styled(Typography)(({ theme }) => ({
  fontSize: '0.7rem',
  color: theme.palette.text.disabled,
  marginLeft: 'auto',
  paddingLeft: TREE_LAYOUT.countPaddingLeft,
}));

/** DOM id of a row, for `aria-activedescendant`. Encoded: values can hold spaces. */
function rowDomId(treeId: string, rowId: string): string {
  return `${treeId}-${encodeURIComponent(rowId)}`;
}

interface GroupNavTreeRowProps {
  row: FlatTreeRow;
  domId: string;
  /** Offset of the slot from the top of the list. */
  top: number;
  isSelected: boolean;
  isFocused: boolean;
  /** The field icon of a group or leaf row; ignored on the "All" row. */
  icon: ReactNode;
  testId?: string;
  hasSelections?: boolean;
  onItemClick?: (e: MouseEvent) => void;
  onRowClick: (row: FlatTreeRow) => void;
  onChevronClick: (row: FlatTreeRow, e: MouseEvent) => void;
}

/**
 * One row. Memoized and given booleans, not the selected or focused id, so
 * selecting a row re-renders only the rows whose state changed.
 */
const GroupNavTreeRow = memo(function GroupNavTreeRow({
  row,
  domId,
  top,
  isSelected,
  isFocused,
  icon,
  testId,
  hasSelections,
  onItemClick,
  onRowClick,
  onChevronClick,
}: GroupNavTreeRowProps) {
  const indent = row.depth * TREE_LAYOUT.indent;
  const guides: ReactNode[] = [];
  for (let level = 0; level < row.depth; level++) {
    guides.push(
      <Guide key={level} style={{ left: level * TREE_LAYOUT.indent + TREE_LAYOUT.guideOffset }} />,
    );
  }
  const iconColor = isSelected ? 'primary.main' : 'text.secondary';

  return (
    <RowSlot style={{ transform: `translateY(${top}px)` }}>
      {guides}
      <RowContent
        id={domId}
        role='treeitem'
        aria-level={row.depth + 1}
        aria-setsize={row.setSize}
        aria-posinset={row.posInSet}
        aria-selected={isSelected}
        aria-expanded={row.hasChildren ? row.isExpanded : undefined}
        data-testid={testId}
        data-focused={isFocused}
        $hasSelections={hasSelections}
        style={{ marginLeft: indent }}
        onClick={(e) => {
          // The row's own select/toggle first, then the caller's click.
          onRowClick(row);
          onItemClick?.(e);
        }}
      >
        <ChevronSlot aria-hidden onClick={(e) => onChevronClick(row, e)}>
          {row.hasChildren && (row.isExpanded ? <ExpandMoreIcon /> : <ChevronRightIcon />)}
        </ChevronSlot>
        <RowLabel>
          {row.isAll ? (
            <SelectAllIcon fontSize='small' sx={{ color: iconColor }} />
          ) : (
            <Box
              component='span'
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 15,
                color: iconColor,
                '& svg': { fontSize: 15 },
              }}
            >
              {icon}
            </Box>
          )}
          <Typography
            variant='body2'
            noWrap
            sx={{
              fontWeight: isSelected ? 600 : 400,
              color: isSelected ? 'primary.main' : 'text.primary',
            }}
          >
            {row.label}
          </Typography>
          <CountBadge data-testid='group-nav-node-count'>{row.count}</CountBadge>
        </RowLabel>
      </RowContent>
    </RowSlot>
  );
});

export interface GroupNavTreeProps {
  rows: FlatTreeRow[];
  /** Id of the selected row; `null` selects nothing. */
  selectedId: string | null;
  /**
   * The element that scrolls the rows (the panel body). Passed as a value, not
   * a ref: React attaches a parent's ref after its children's layout effects,
   * so a ref read on mount is still empty, and the virtualizer would draw no
   * rows until some later render. A new value re-renders the tree, which
   * attaches the virtualizer to it.
   */
  scrollElement: HTMLDivElement | null;
  /** See `GroupNavPanel`'s prop of the same name. */
  expansionTrigger: 'content' | 'iconContainer';
  onSelect: (row: FlatTreeRow) => void;
  onSetExpanded: (ids: string[], expanded: boolean) => void;
  /** Group levels, for each group row's icon. */
  groupByColumns: string[];
  /** Whether items are leaves of their own (`GroupNavPanel`'s `leaf`). */
  hasItemLeaves: boolean;
  /** Field whose icon an item leaf shows. */
  leafIconField?: string;
  iconMap?: Partial<Record<string, FieldIconKey>>;
  getItemProps?: (node: GroupNavNodeContext) => GroupNavItemProps | undefined;
  'aria-label'?: string;
}

/**
 * The rows of `GroupNavPanel` as a flat, virtualized ARIA tree: one
 * `role='tree'` element that keeps focus and points at the focused row with
 * `aria-activedescendant`, and absolutely positioned `role='treeitem'` rows
 * carrying their level, set size and position.
 *
 * Keys, as the MUI tree it replaces had them: Up/Down move; Right expands,
 * then moves to the first child; Left collapses, then moves to the parent;
 * Home/End; Space selects; Enter toggles a row with children and selects a
 * row without; `*` expands the siblings; a letter moves to the next row that
 * starts with it.
 */
export function GroupNavTree({
  rows,
  selectedId,
  scrollElement,
  expansionTrigger,
  onSelect,
  onSetExpanded,
  groupByColumns,
  hasItemLeaves,
  leafIconField,
  iconMap,
  getItemProps,
  'aria-label': ariaLabel,
}: GroupNavTreeProps) {
  const treeId = useId();
  // The focused row, and where it was: when a data refresh removes that row,
  // focus stays at the same place in the list instead of going back to the top.
  const [focus, setFocus] = useState<{ id: string; index: number } | null>(null);

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, i) => map.set(r.id, i));
    return map;
  }, [rows]);

  const getItemKey = useCallback((i: number) => rows[i].id, [rows]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_SLOT,
    getItemKey,
    overscan: rows.length <= RENDER_ALL_LIMIT ? rows.length : OVERSCAN,
    // The rows start below the panel body's top padding.
    scrollMargin: TREE_LAYOUT.bodyPaddingTop,
  });

  const focusedIndex =
    focus === null || rows.length === 0
      ? -1
      : (indexById.get(focus.id) ?? Math.min(focus.index, rows.length - 1));
  const selectedIndex = selectedId === null ? -1 : (indexById.get(selectedId) ?? -1);

  // Bring a selection made elsewhere (a deep link, Back) into view, once per
  // selected row: a row out of view is not in the DOM. Not on later data
  // refreshes, which would undo the user's own scrolling. A row selected by
  // a click is in view already, so this does not move.
  const scrolledToRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scrollElement || selectedIndex < 0 || scrolledToRef.current === selectedId) return;
    scrolledToRef.current = selectedId;
    virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [scrollElement, selectedId, selectedIndex, virtualizer]);

  const handleRowClick = useCallback(
    (row: FlatTreeRow) => {
      setFocus({ id: row.id, index: indexById.get(row.id) ?? 0 });
      // A click selects even the selected row, as MUI's tree did: callers
      // use it to reset what else the URL holds (the Components page's
      // Overview) and ignore it where nothing changes.
      onSelect(row);
      if (expansionTrigger === 'content' && row.hasChildren) {
        onSetExpanded([row.id], !row.isExpanded);
      }
    },
    [expansionTrigger, indexById, onSelect, onSetExpanded],
  );

  const handleChevronClick = useCallback(
    (row: FlatTreeRow, e: MouseEvent) => {
      // With 'content' the click goes on to the row, which selects and toggles.
      if (expansionTrigger !== 'iconContainer') return;
      e.stopPropagation();
      setFocus({ id: row.id, index: indexById.get(row.id) ?? 0 });
      if (row.hasChildren) onSetExpanded([row.id], !row.isExpanded);
    },
    [expansionTrigger, indexById, onSetExpanded],
  );

  const moveFocus = (index: number) => {
    if (index < 0 || index >= rows.length) return;
    setFocus({ id: rows[index].id, index });
    virtualizer.scrollToIndex(index, { align: 'auto' });
  };

  const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || focusedIndex >= 0 || rows.length === 0) return;
    const index = selectedIndex >= 0 ? selectedIndex : 0;
    setFocus({ id: rows[index].id, index });
    // Bring the row into view for a keyboard user. A click focuses the tree
    // too, and must not scroll it.
    if (e.currentTarget.matches(':focus-visible')) {
      virtualizer.scrollToIndex(index, { align: 'auto' });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || rows.length === 0) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const index = focusedIndex >= 0 ? focusedIndex : 0;
    const row = rows[index];
    let handled = true;

    switch (e.key) {
      case 'ArrowDown':
        moveFocus(index + 1);
        break;
      case 'ArrowUp':
        moveFocus(index - 1);
        break;
      case 'ArrowRight':
        if (ctrl) return;
        if (row.isExpanded) moveFocus(index + 1);
        else if (row.hasChildren) onSetExpanded([row.id], true);
        break;
      case 'ArrowLeft':
        if (ctrl) return;
        if (row.isExpanded) onSetExpanded([row.id], false);
        else moveFocus(row.parentIndex);
        break;
      case 'Home':
        moveFocus(0);
        break;
      case 'End':
        moveFocus(rows.length - 1);
        break;
      case ' ':
        setFocus({ id: row.id, index });
        if (row.id !== selectedId) onSelect(row);
        break;
      case 'Enter':
        setFocus({ id: row.id, index });
        if (row.hasChildren) onSetExpanded([row.id], !row.isExpanded);
        else if (row.id !== selectedId) onSelect(row);
        break;
      case '*':
        onSetExpanded(
          rows.filter((r) => r.parentIndex === row.parentIndex && r.hasChildren).map((r) => r.id),
          true,
        );
        break;
      default:
        if (!ctrl && !e.shiftKey && e.key.length === 1 && e.key !== ' ') {
          const match = findTypeAheadIndex(rows, index, e.key);
          if (match >= 0) moveFocus(match);
        } else {
          handled = false;
        }
    }
    if (handled) e.preventDefault();
  };

  const isLeafRow = (row: FlatTreeRow) =>
    hasItemLeaves ? row.isItem : row.depth === groupByColumns.length - 1;

  return (
    <TreeRoot
      role='tree'
      aria-label={ariaLabel}
      tabIndex={0}
      aria-activedescendant={focusedIndex >= 0 ? rowDomId(treeId, rows[focusedIndex].id) : undefined}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((v) => {
        const row = rows[v.index];
        const extra = row.isAll
          ? undefined
          : getItemProps?.({ path: row.path, depth: row.depth, isLeaf: isLeafRow(row) });
        const column = row.isItem ? (leafIconField ?? '') : (groupByColumns[row.depth] ?? '');
        return (
          <GroupNavTreeRow
            key={v.key}
            row={row}
            domId={rowDomId(treeId, row.id)}
            top={v.start - TREE_LAYOUT.bodyPaddingTop}
            isSelected={row.id === selectedId}
            isFocused={v.index === focusedIndex}
            icon={row.isAll ? null : getChipIcon(column, iconMap)}
            testId={extra?.['data-testid']}
            hasSelections={extra?.$hasSelections}
            onItemClick={extra?.onClick}
            onRowClick={handleRowClick}
            onChevronClick={handleChevronClick}
          />
        );
      })}
    </TreeRoot>
  );
}
