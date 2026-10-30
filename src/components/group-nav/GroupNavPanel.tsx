// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type ReactNode, memo, useCallback, useMemo, useState } from 'react';

import { ExtendedUnitRead } from '@confighub/rtk-query';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { GroupNavBreadcrumb } from './GroupNavBreadcrumb';
import { GroupNavSkeleton } from './GroupNavSkeleton';
import { GroupNavTree } from './GroupNavTree';
import { type FlatTreeRow, TREE_LAYOUT, ancestorIds, buildGroupTree, flattenVisible } from './groupTree';
import type { GroupableFieldCatalog } from './groupable-fields';
import { ALL_GROUPS, type GroupNavItemProps, type GroupNavNodeContext } from './types';
import { formatHeaderLabel, getCellValue } from './utils';
import type { FieldIconKey } from '@/components/query-builder/field-icons';

/** Width of the collapsed icon rail when {@link GroupNavPanelProps.open} is false. */
export const GROUP_NAV_COLLAPSED_WIDTH = 36;

export type { GroupNavItemProps, GroupNavNodeContext } from './types';

/**
 * Shows each item as its own node (a leaf) under the last group level, or at
 * the root when there are no group levels. See {@link GroupNavPanelProps.leaf}.
 */
export interface GroupNavLeafOptions<T> {
  /** The leaf's label and the last entry of its path. Unique per item. */
  getId: (item: T) => string;
  /** The leaf's count badge. Defaults to 1. */
  getCount?: (item: T) => number;
  /** The field whose icon the leaf shows (looked up through `iconMap`). */
  iconField?: string;
}

interface GroupNavPanelProps<T> {
  groupByColumns: string[];
  items: T[];
  /**
   * Extracts the bucketing value of `column` from `item`. Defaults to
   * {@link getCellValue} (the `ExtendedUnitRead` getter), so the Unit list —
   * whose `items` really are `ExtendedUnitRead[]` — needs no change.
   */
  getValue?: (item: T, column: string) => string;
  /**
   * Selected path through the tree. Each entry is the value chosen at that
   * level; `[]` selects the "All"/`allLabel` root. `null` selects NOTHING —
   * for a caller whose selection lives elsewhere (e.g. Components, when a
   * Component's own graph is on screen: highlighting an unrelated tree node,
   * including the "Overview" root, would claim something that isn't there).
   */
  selectedGroups: string[] | null;
  onSelectGroups: (groups: string[]) => void;
  /** Width when expanded. */
  width?: number;
  /**
   * Whether the panel is in its expanded state. When `false`, the panel
   * collapses to a {@link GROUP_NAV_COLLAPSED_WIDTH}px-wide icon rail with a
   * single button that calls {@link onToggleOpen} to re-expand. When `undefined`
   * (the default), the panel is always expanded and no toggle is rendered —
   * preserves backward compatibility for callers that don't want the toggle.
   */
  open?: boolean;
  /** Called when the in-panel collapse/expand toggle is clicked. */
  onToggleOpen?: () => void;
  /**
   * Optional suffix appended to the panel header (e.g. "(default)") to hint
   * that the grouping is a fallback rather than view-configured. Hidden when
   * undefined.
   */
  headerSuffix?: string;
  /** Label for the "show everything" root node. Defaults to `'All'`. */
  allLabel?: string;
  /**
   * When provided, the panel header renders a GroupNavBreadcrumb instead of the
   * static text label. Pass `undefined` to keep the static header (no active view).
   *
   * Called on every chip add/remove/change — no PATCH fired, caller updates
   * localGroupByColumns immediately.
   */
  onEditLevels?: (newLevels: string[]) => void;
  /** Available unit label keys forwarded to the field picker. */
  availableLabelKeys?: string[];
  /** Available space label keys forwarded to the field picker. */
  availableSpaceLabelKeys?: string[];
  /** Per-label-key unit counts (key → number of filtered units that have the key). */
  availableLabelKeyCounts?: Record<string, number>;
  /** Per-space-label-key unit counts. */
  availableSpaceLabelKeyCounts?: Record<string, number>;
  /**
   * When true, the panel body shows a {@link GroupNavSkeleton} tree instead of
   * the real tree. Wired to the units list query's `isLoading` so that switching
   * to a tab whose data isn't cached yet shows the skeleton until the new data
   * arrives (background polling refetches don't set `isLoading`, so the tree
   * stays visible during routine polls).
   *
   * Keep this bound to `isLoading`, never `isFetching` — the app polls the units
   * list on a short interval, and `isFetching` would flash the skeleton on every
   * poll.
   */
  isLoading?: boolean;
  /**
   * Extra DOM/interaction props for a specific node — e.g. the Components tree
   * gives a Component leaf a `data-testid` of its own, and the open node the
   * selection ring. Keep this narrow (attribute + click override); it is not
   * a general render slot.
   */
  getItemProps?: (node: GroupNavNodeContext) => GroupNavItemProps | undefined;
  /**
   * When set, every item is also a node of its own (a leaf) under the last
   * group level, sorted by `getId`, and a group node's count is its number of
   * items. When not set, the deepest group level is the bottom of the tree.
   */
  leaf?: GroupNavLeafOptions<T>;
  /** Rendered at the end of the tree body — e.g. a partial-load skeleton row. */
  footer?: ReactNode;
  /** Field catalog for the breadcrumb's add/change-field picker. Defaults to the Unit catalog. */
  catalog?: GroupableFieldCatalog;
  /** Label overrides for the breadcrumb chips and picker rows. Defaults to the Unit catalog's labels. */
  fieldLabels?: Record<string, string>;
  /** Icon overrides for the breadcrumb chips and picker rows. Defaults to the Unit catalog's icons. */
  iconMap?: Partial<Record<string, FieldIconKey>>;
  /**
   * Which part of a tree item triggers expand/collapse. `'content'` (the
   * default) means clicking the row's label also expands it — the Unit
   * list's original behavior. `'iconContainer'` restricts that to the
   * chevron, so Components can give a content click its own meaning (opening
   * a node's graph) without it also toggling the row.
   */
  expansionTrigger?: 'content' | 'iconContainer';
  /**
   * When true, the panel stretches to `100%` of its parent instead of the
   * `width`/`--group-nav-width` CSS-variable sizing below. For a caller whose
   * OWN wrapper is already the resizable element (e.g. Components' `Panel`
   * from `react-resizable-panels`), that outer element already tracks drag
   * width — the panel just needs to fill it, not size itself independently.
   * Defaults to `false`: the Unit list drives its own custom drag handle and
   * sets `--group-nav-width` on an ancestor for per-frame updates, so it
   * needs the CSS-variable/`width` sizing this defaults to.
   */
  fillContainer?: boolean;
}

const Panel = styled(Box, {
  shouldForwardProp: (prop) => prop !== '$open',
})<{ $open: boolean }>(({ theme, $open }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  borderRight: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  transition:
    'width 200ms cubic-bezier(0.4, 0, 0.2, 1), min-width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  // Suppress the width transition while the parent wrapper is in the
  // middle of a drag-resize. Without this, every per-frame width change
  // re-arms the 200ms ease and the pane appears to lag the cursor.
  '[data-resizing="true"] &': {
    transition: 'none',
  },
  flexShrink: 0,
  overflow: 'hidden',
  ...(!$open && { width: GROUP_NAV_COLLAPSED_WIDTH, minWidth: GROUP_NAV_COLLAPSED_WIDTH }),
}));

const PanelHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(1.5, 1, 1, 1.5),
  gap: theme.spacing(1),
}));

const CollapsedRail = styled(Box)(({ theme }) => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: theme.spacing(1),
  gap: theme.spacing(1),
}));

const PanelBody = styled(Box)(() => ({
  flex: 1,
  overflowY: 'auto',
  padding: `${TREE_LAYOUT.bodyPaddingTop}px ${TREE_LAYOUT.bodyPaddingX}px`,
}));

const defaultGetValue = (item: ExtendedUnitRead, column: string): string => getCellValue(item, column);

function GroupNavPanelInner<T>({
  groupByColumns,
  items,
  getValue,
  selectedGroups,
  onSelectGroups,
  width = 240,
  open,
  onToggleOpen,
  headerSuffix,
  allLabel = 'All',
  onEditLevels,
  availableLabelKeys,
  availableSpaceLabelKeys,
  availableLabelKeyCounts,
  availableSpaceLabelKeyCounts,
  isLoading = false,
  getItemProps,
  leaf,
  footer,
  catalog,
  fieldLabels,
  iconMap,
  expansionTrigger = 'content',
  fillContainer = false,
}: GroupNavPanelProps<T>) {
  const isExpanded = open !== false;

  // Cast is safe: the default only runs for callers that never pass a custom
  // `getValue`, which is exactly the callers whose `T` is `ExtendedUnitRead`.
  const resolvedGetValue = (getValue ??
    (defaultGetValue as unknown as (item: T, column: string) => string));

  const tree = useMemo(
    () => buildGroupTree(items, groupByColumns, 0, [], resolvedGetValue, leaf),
    [items, groupByColumns, resolvedGetValue, leaf],
  );

  const allCount = items.length;

  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  // Units load asynchronously, so tree is empty on first render. Apply
  // default expansion (all top-level nodes + ancestors of the currently
  // selected path, for deep-link support) once the tree first populates.
  const [initialExpansionApplied, setInitialExpansionApplied] = useState(false);
  if (!initialExpansionApplied && tree.length > 0) {
    setInitialExpansionApplied(true);
    const ids = new Set<string>();
    for (const t of tree) ids.add(t.id);
    for (const a of ancestorIds(selectedGroups)) ids.add(a);
    setExpandedItems(Array.from(ids));
  }

  const expandedSet = useMemo(() => new Set(expandedItems), [expandedItems]);

  const handleSetExpanded = useCallback((ids: string[], expanded: boolean) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (expanded) next.add(id);
        else next.delete(id);
      }
      return Array.from(next);
    });
  }, []);

  const rows = useMemo(
    () => flattenVisible(tree, expandedSet, { label: allLabel, count: allCount }),
    [tree, expandedSet, allLabel, allCount],
  );

  // `null` selects nothing; `[]` selects the "All" row.
  const selectedItemId = useMemo(() => {
    if (selectedGroups === null) return null;
    if (selectedGroups.length === 0) return ALL_GROUPS;
    return selectedGroups.join('\0');
  }, [selectedGroups]);

  const handleSelectRow = useCallback(
    (row: FlatTreeRow) => onSelectGroups(row.path),
    [onSelectGroups],
  );

  const headerLabel = formatHeaderLabel(groupByColumns);

  // The rows scroll inside the panel body; the tree virtualizes against it.
  // State, not a ref: see `GroupNavTreeProps.scrollElement`.
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);

  // Collapsed: 36px icon rail with a single button that re-expands the panel.
  if (!isExpanded) {
    return (
      <Panel $open={false}>
        <CollapsedRail>
          <Tooltip title='Expand grouping panel' placement='right'>
            <IconButton
              size='small'
              onClick={onToggleOpen}
              sx={{ p: 0.75, color: 'text.secondary' }}
              aria-label='Expand grouping panel'
            >
              <AccountTreeOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </CollapsedRail>
      </Panel>
    );
  }

  return (
    <Panel
      $open
      sx={
        fillContainer
          ? // The caller's own wrapper (e.g. a react-resizable-panels `Panel`)
            // already tracks the drag width; stretch to fill it rather than
            // sizing independently.
            { width: '100%', minWidth: 0 }
          : {
              // Read width from a CSS variable so the parent can drive
              // per-frame updates via a DOM ref during drag without
              // triggering React re-renders. Falls back to the React-state
              // width when the variable isn't set (initial paint, no drag in
              // progress).
              width: `var(--group-nav-width, ${width}px)`,
              minWidth: `var(--group-nav-width, ${width}px)`,
            }
      }
    >
      <Box
        sx={{
          // Dim the chip/breadcrumb header slightly during a transition so
          // the user can tell it's inert. The body skeleton carries the main
          // "this panel is updating" cue, so this dim only needs to be light
          // enough to explain why chips don't respond.
          // `pointerEvents: none` blocks chip clicks while the panel is
          // mid-transition — clicking a chip that's about to be replaced by
          // the new view's chips would race the URL writers.  Short
          // transition keeps the fast case (sub-perceptible) from feeling
          // jittery.
          opacity: isLoading ? 0.7 : 1,
          pointerEvents: isLoading ? 'none' : 'auto',
          transition: 'opacity 120ms ease-out',
        }}
      >
      {onEditLevels ? (
        <GroupNavBreadcrumb
          localLevels={groupByColumns}
          onEditLevels={onEditLevels}
          labelKeys={availableLabelKeys ?? []}
          spaceLabelKeys={availableSpaceLabelKeys ?? []}
          labelKeyCounts={availableLabelKeyCounts}
          spaceLabelKeyCounts={availableSpaceLabelKeyCounts}
          onToggleOpen={onToggleOpen}
          catalog={catalog}
          fieldLabels={fieldLabels}
          iconMap={iconMap}
        />
      ) : (
        <>
          <PanelHeader>
            <Typography variant='subtitle2' fontWeight={600} color='text.secondary' noWrap>
              {headerLabel}
              {headerSuffix && (
                <Typography
                  component='span'
                  variant='caption'
                  sx={{
                    fontWeight: 400,
                    textTransform: 'none',
                    letterSpacing: 0,
                    color: 'text.disabled',
                    ml: 0.75,
                  }}
                >
                  {headerSuffix}
                </Typography>
              )}
            </Typography>
            {onToggleOpen && (
              <Tooltip title='Collapse grouping panel' placement='right'>
                <IconButton
                  size='small'
                  onClick={onToggleOpen}
                  sx={{ p: 0.5, color: 'text.secondary' }}
                  aria-label='Collapse grouping panel'
                >
                  <ChevronLeftIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </PanelHeader>
          <Divider />
        </>
      )}
      </Box>
      {/* When breadcrumb is active, it renders its own bottom border; no extra Divider needed */}
      <PanelBody ref={setBodyEl}>
        {isLoading ? (
          <GroupNavSkeleton />
        ) : (
          <GroupNavTree
            rows={rows}
            selectedId={selectedItemId}
            scrollElement={bodyEl}
            expansionTrigger={expansionTrigger}
            onSelect={handleSelectRow}
            onSetExpanded={handleSetExpanded}
            groupByColumns={groupByColumns}
            hasItemLeaves={leaf !== undefined}
            leafIconField={leaf?.iconField}
            iconMap={iconMap}
            getItemProps={getItemProps}
            aria-label='Groups'
          />
        )}
        {footer}
      </PanelBody>
    </Panel>
  );
}

const GroupNavPanelMemo = memo(GroupNavPanelInner) as unknown as (<T,>(
  props: GroupNavPanelProps<T>,
) => React.ReactElement);

(GroupNavPanelMemo as unknown as { displayName?: string }).displayName = 'GroupNavPanel';

export const GroupNavPanel = GroupNavPanelMemo;
