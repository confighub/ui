// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type ReactNode, memo, useCallback, useMemo, useState } from 'react';

import { ExtendedUnitRead } from '@confighub/rtk-query';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem, treeItemClasses } from '@mui/x-tree-view/TreeItem';

import { GroupNavBreadcrumb } from './GroupNavBreadcrumb';
import { GroupNavSkeleton } from './GroupNavSkeleton';
import { getChipIcon } from './field-icon';
import { EMPTY_GROUP_VALUE, compareGroupValues } from './groupOrder';
import type { GroupableFieldCatalog } from './groupable-fields';
import { ALL_GROUPS } from './types';
import { formatHeaderLabel, getCellValue } from './utils';
import type { FieldIconKey } from '@/components/query-builder/field-icons';

/** Width of the collapsed icon rail when {@link GroupNavPanelProps.open} is false. */
export const GROUP_NAV_COLLAPSED_WIDTH = 36;

/** A node's identity while the tree walks it — used by {@link GroupNavPanelProps.getItemProps}. */
export interface GroupNavNodeContext {
  /** Values chosen at each level up to and including this node. */
  path: string[];
  /** 0-indexed level of this node in `groupByColumns`. */
  depth: number;
  /**
   * True for a leaf. With {@link GroupNavPanelProps.leaf}, a leaf is one item,
   * one level below the last group level. Without it, a leaf is a node at the
   * deepest configured level.
   */
  isLeaf: boolean;
}

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

/** Extra DOM/interaction props {@link GroupNavPanelProps.getItemProps} may attach to a node. */
export interface GroupNavItemProps {
  'data-testid'?: string;
  $hasSelections?: boolean;
  onClick?: (e: React.MouseEvent) => void;
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

interface GroupTreeNode<T> {
  id: string;
  label: string;
  count: number;
  path: string[];
  depth: number;
  /** True for an item's own node (see {@link GroupNavPanelProps.leaf}). */
  isItem: boolean;
  children: GroupTreeNode<T>[];
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
  padding: '4px 8px',
}));

const StyledTreeItem = styled(TreeItem)(({ theme }) => ({
  [`& .${treeItemClasses.content}`]: {
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.75, 1),
    marginBottom: 2,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    '&.Mui-selected': {
      backgroundColor: theme.palette.action.selected,
      '&:hover': {
        backgroundColor: theme.palette.action.selected,
      },
      '&.Mui-focused': {
        backgroundColor: theme.palette.action.selected,
      },
    },
    '&.Mui-focused': {
      backgroundColor: 'transparent',
    },
  },
  [`& .${treeItemClasses.iconContainer}`]: {
    width: 20,
    '& svg': {
      fontSize: 18,
      color: theme.palette.text.secondary,
    },
  },
  [`& .${treeItemClasses.label}`]: {
    fontSize: '0.875rem',
    paddingLeft: 4,
  },
  [`& .${treeItemClasses.groupTransition}`]: {
    marginLeft: 16,
    paddingLeft: 12,
    borderLeft: `1px dashed ${theme.palette.divider}`,
  },
}));

/**
 * Tree item with a blue selection ring when `$hasSelections` is set (via
 * `getItemProps`) — a caller-driven hint distinct from ordinary node
 * selection, for a node that represents something with its own nested
 * selection state (e.g. a Component with selected deployments underneath).
 */
const SelectableTreeItem = styled(StyledTreeItem, {
  shouldForwardProp: (p) => p !== '$hasSelections',
})<{ $hasSelections?: boolean }>(({ theme, $hasSelections }) => ({
  [`& .${treeItemClasses.content}`]: {
    transition: 'box-shadow 0.15s ease',
    ...($hasSelections && {
      boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.4)}`,
    }),
    '&.Mui-selected': {
      ...($hasSelections && {
        boxShadow: `0 0 0 2px ${theme.palette.primary.main}`,
      }),
    },
  },
}));

const ItemLabel = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: 1,
  minWidth: 0,
});

const CountBadge = styled(Typography)(({ theme }) => ({
  fontSize: '0.7rem',
  color: theme.palette.text.disabled,
  marginLeft: 'auto',
  paddingLeft: theme.spacing(1),
}));

const defaultGetValue = (item: ExtendedUnitRead, column: string): string => getCellValue(item, column);

function buildGroupTree<T>(
  items: T[],
  groupByColumns: string[],
  depth: number,
  parentPath: string[],
  getValue: (item: T, column: string) => string,
  leaf?: GroupNavLeafOptions<T>,
): GroupTreeNode<T>[] {
  if (depth >= groupByColumns.length) {
    if (!leaf) return [];
    return items
      .map((item) => {
        const label = leaf.getId(item);
        const path = [...parentPath, label];
        return {
          id: path.join('\0'),
          label,
          count: leaf.getCount ? leaf.getCount(item) : 1,
          path,
          depth,
          isItem: true,
          children: [],
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const column = groupByColumns[depth];
  const buckets = new Map<string, T[]>();

  for (const item of items) {
    const val = getValue(item, column) || EMPTY_GROUP_VALUE;
    let bucket = buckets.get(val);
    if (!bucket) {
      bucket = [];
      buckets.set(val, bucket);
    }
    bucket.push(item);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => compareGroupValues(a, b))
    .map(([value, bucketItems]) => {
      const path = [...parentPath, value];
      const id = path.join('\0');
      return {
        id,
        label: value,
        count: bucketItems.length,
        path,
        depth,
        isItem: false,
        children: buildGroupTree(bucketItems, groupByColumns, depth + 1, path, getValue, leaf),
      };
    });
}

/**
 * IDs of all ancestors of the currently selected path. For selectedGroups
 * [a, b, c] the selected node is 'a\0b\0c' and its ancestors are 'a' and
 * 'a\0b'. Used to auto-expand deep-linked selections so the highlighted
 * folder is visible.
 */
function ancestorIds(selectedGroups: string[] | null): string[] {
  if (!selectedGroups) return [];
  const ids: string[] = [];
  for (let i = 1; i < selectedGroups.length; i++) {
    ids.push(selectedGroups.slice(0, i).join('\0'));
  }
  return ids;
}

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

  const handleExpandedItemsChange = useCallback(
    (_event: React.SyntheticEvent | null, itemIds: string[]) => {
      setExpandedItems(itemIds);
    },
    [],
  );

  // Build a map from item ID to the selection path it represents.
  const pathById = useMemo(() => {
    const map = new Map<string, string[]>();
    map.set(ALL_GROUPS, []);
    function walk(nodes: GroupTreeNode<T>[]) {
      for (const n of nodes) {
        map.set(n.id, n.path);
        walk(n.children);
      }
    }
    walk(tree);
    return map;
  }, [tree]);

  // Determine which item is currently selected. `null` selects nothing —
  // MUI's SimpleTreeView accepts `null` for "no item selected".
  const selectedItemId = useMemo(() => {
    if (selectedGroups === null) return null;
    if (selectedGroups.length === 0) return ALL_GROUPS;
    return selectedGroups.join('\0');
  }, [selectedGroups]);

  const handleSelectedItemsChange = useCallback(
    (_event: React.SyntheticEvent | null, itemId: string | null) => {
      if (!itemId) return;
      const path = pathById.get(itemId);
      if (path !== undefined) {
        onSelectGroups(path);
      }
    },
    [pathById, onSelectGroups],
  );

  const headerLabel = formatHeaderLabel(groupByColumns);

  // MUI's own content-click handler calls `handleSelection` unconditionally
  // (it only gates `handleExpansion` on `expansionTrigger`) — a click on the
  // icon container, with no `stopPropagation`, bubbles up to that same
  // content handler and selects the row regardless of `expansionTrigger`.
  // With `expansionTrigger='iconContainer'` the chevron must be
  // expand-only, so this stops that bubble at the icon itself.
  const iconContainerSlotProps = useMemo(
    () =>
      expansionTrigger === 'iconContainer'
        ? { iconContainer: { onClick: (e: React.MouseEvent) => e.stopPropagation() } }
        : undefined,
    [expansionTrigger],
  );

  function renderTree(nodes: GroupTreeNode<T>[], isSelected: (id: string) => boolean) {
    return nodes.map((node) => {
      const column = node.isItem ? (leaf?.iconField ?? '') : (groupByColumns[node.depth] ?? '');
      const isLeaf = leaf ? node.isItem : node.depth === groupByColumns.length - 1;
      const extraProps = getItemProps?.({ path: node.path, depth: node.depth, isLeaf });
      return (
        <SelectableTreeItem
          key={node.id}
          itemId={node.id}
          data-testid={extraProps?.['data-testid']}
          $hasSelections={extraProps?.$hasSelections}
          onClick={extraProps?.onClick}
          slotProps={iconContainerSlotProps}
          label={
            <ItemLabel>
              <Box
                component='span'
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 15,
                  color: isSelected(node.id) ? 'primary.main' : 'text.secondary',
                  '& svg': { fontSize: 15 },
                }}
              >
                {getChipIcon(column, iconMap)}
              </Box>
              <Typography
                variant='body2'
                noWrap
                sx={{
                  fontWeight: isSelected(node.id) ? 600 : 400,
                  color: isSelected(node.id) ? 'primary.main' : 'text.primary',
                }}
              >
                {node.label}
              </Typography>
              <CountBadge>{node.count}</CountBadge>
            </ItemLabel>
          }
        >
          {node.children.length > 0 ? renderTree(node.children, isSelected) : null}
        </SelectableTreeItem>
      );
    });
  }

  const isSelected = (id: string) => selectedItemId !== null && id === selectedItemId;
  const allSelected = selectedGroups !== null && selectedGroups.length === 0;

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
      <PanelBody>
        {isLoading ? (
          <GroupNavSkeleton />
        ) : (
          <SimpleTreeView
          expandedItems={expandedItems}
          onExpandedItemsChange={handleExpandedItemsChange}
          selectedItems={selectedItemId}
          onSelectedItemsChange={handleSelectedItemsChange}
          expansionTrigger={expansionTrigger}
          slots={{
            expandIcon: ChevronRightIcon,
            collapseIcon: ExpandMoreIcon,
          }}
        >
          <StyledTreeItem
            itemId={ALL_GROUPS}
            label={
              <ItemLabel>
                <SelectAllIcon
                  fontSize='small'
                  sx={{ color: allSelected ? 'primary.main' : 'text.secondary' }}
                />
                <Typography
                  variant='body2'
                  sx={{
                    fontWeight: allSelected ? 600 : 400,
                    color: allSelected ? 'primary.main' : 'text.primary',
                  }}
                >
                  {allLabel}
                </Typography>
                <CountBadge>{allCount}</CountBadge>
              </ItemLabel>
            }
          />
          {renderTree(tree, isSelected)}
        </SimpleTreeView>
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
