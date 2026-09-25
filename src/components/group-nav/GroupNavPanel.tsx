// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, useCallback, useMemo, useState } from 'react';

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
import { styled } from '@mui/material/styles';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem, treeItemClasses } from '@mui/x-tree-view/TreeItem';

import { GroupNavBreadcrumb } from './GroupNavBreadcrumb';
import { GroupNavSkeleton } from './GroupNavSkeleton';
import { getChipIcon } from './field-icon';
import { ALL_GROUPS } from './types';
import { formatHeaderLabel, getCellValue } from './utils';

/** Width of the collapsed icon rail when {@link GroupNavPanelProps.open} is false. */
export const GROUP_NAV_COLLAPSED_WIDTH = 36;

interface GroupNavPanelProps {
  groupByColumns: string[];
  units: ExtendedUnitRead[];
  /** Selected path through the tree. Each entry is the value chosen at that level. */
  selectedGroups: string[];
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
}

interface GroupTreeNode {
  id: string;
  label: string;
  count: number;
  path: string[];
  children: GroupTreeNode[];
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

function buildGroupTree(
  units: ExtendedUnitRead[],
  groupByColumns: string[],
  depth: number,
  parentPath: string[],
): GroupTreeNode[] {
  if (depth >= groupByColumns.length) return [];

  const column = groupByColumns[depth];
  const buckets = new Map<string, ExtendedUnitRead[]>();

  for (const eu of units) {
    const val = getCellValue(eu, column) || '(empty)';
    let bucket = buckets.get(val);
    if (!bucket) {
      bucket = [];
      buckets.set(val, bucket);
    }
    bucket.push(eu);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, bucketUnits]) => {
      const path = [...parentPath, value];
      const id = path.join('\0');
      return {
        id,
        label: value,
        count: bucketUnits.length,
        path,
        children: buildGroupTree(bucketUnits, groupByColumns, depth + 1, path),
      };
    });
}

/**
 * IDs of all ancestors of the currently selected path. For selectedGroups
 * [a, b, c] the selected node is 'a\0b\0c' and its ancestors are 'a' and
 * 'a\0b'. Used to auto-expand deep-linked selections so the highlighted
 * folder is visible.
 */
function ancestorIds(selectedGroups: string[]): string[] {
  const ids: string[] = [];
  for (let i = 1; i < selectedGroups.length; i++) {
    ids.push(selectedGroups.slice(0, i).join('\0'));
  }
  return ids;
}

export const GroupNavPanel = memo(
  ({
    groupByColumns,
    units,
    selectedGroups,
    onSelectGroups,
    width = 240,
    open,
    onToggleOpen,
    headerSuffix,
    onEditLevels,
    availableLabelKeys,
    availableSpaceLabelKeys,
    availableLabelKeyCounts,
    availableSpaceLabelKeyCounts,
    isLoading = false,
  }: GroupNavPanelProps) => {
    const isExpanded = open !== false;

    const tree = useMemo(
      () => buildGroupTree(units, groupByColumns, 0, []),
      [units, groupByColumns],
    );

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
      function walk(nodes: GroupTreeNode[]) {
        for (const n of nodes) {
          map.set(n.id, n.path);
          walk(n.children);
        }
      }
      walk(tree);
      return map;
    }, [tree]);

    // Determine which item is currently selected.
    const selectedItemId = useMemo(() => {
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

    function renderTree(nodes: GroupTreeNode[], isSelected: (id: string) => boolean, depth = 0) {
      const column = groupByColumns[depth] ?? '';
      return nodes.map((node) => (
        <StyledTreeItem
          key={node.id}
          itemId={node.id}
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
                {getChipIcon(column)}
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
          {node.children.length > 0 ? renderTree(node.children, isSelected, depth + 1) : null}
        </StyledTreeItem>
      ));
    }

    const isSelected = (id: string) => id === selectedItemId;
    const allSelected = selectedGroups.length === 0;

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
        sx={{
          // Read width from a CSS variable so the parent can drive per-frame
          // updates via a DOM ref during drag without triggering React
          // re-renders. Falls back to the React-state width when the variable
          // isn't set (initial paint, no drag in progress).
          width: `var(--group-nav-width, ${width}px)`,
          minWidth: `var(--group-nav-width, ${width}px)`,
        }}
      >
        <Box
          sx={{
            // Dim the chip/breadcrumb header slightly during a transition so
            // the user can tell it's inert.  The body skeleton now carries the
            // "this panel is updating" cue, so the dim is lighter than it used
            // to be — just enough to explain why chips don't respond.
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
                    All
                  </Typography>
                  <CountBadge>{units.length}</CountBadge>
                </ItemLabel>
              }
            />
            {renderTree(tree, isSelected)}
          </SimpleTreeView>
          )}
        </PanelBody>
      </Panel>
    );
  },
);

GroupNavPanel.displayName = 'GroupNavPanel';
