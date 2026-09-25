// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo, useState } from 'react';

import {
  GROUP_BY_CONFIGS,
  GroupByOption,
  GroupBySelector,
} from '@/components/group-by-selector/GroupBySelector';
import { EmptyIconBubble } from '@/components/styled';
import { TreeNavSkeleton } from '@/pages/x/unit-dashboard-page/components/TreeNavSkeleton';
import {
  TreeNodes,
  type UnitTreeNode,
} from '@/pages/x/unit-dashboard-page/components/TreeNode';
import { ExtendedUnitRead } from '@confighub/rtk-query';
import { syncGroupSelections } from '@/utility/tree-selection-utils';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';

type SortOption = 'slug-asc' | 'slug-desc' | 'updated-desc' | 'pending-first';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'slug-asc', label: 'Name A → Z' },
  { value: 'slug-desc', label: 'Name Z → A' },
  { value: 'updated-desc', label: 'Recently updated' },
  { value: 'pending-first', label: 'Pending changes first' },
];

const sortUnits = (units: ExtendedUnitRead[], sort: SortOption): ExtendedUnitRead[] => {
  const copy = [...units];
  switch (sort) {
    case 'slug-asc':
      return copy.sort((a, b) => (a.Unit?.Slug ?? '').localeCompare(b.Unit?.Slug ?? ''));
    case 'slug-desc':
      return copy.sort((a, b) => (b.Unit?.Slug ?? '').localeCompare(a.Unit?.Slug ?? ''));
    case 'updated-desc':
      return copy.sort(
        (a, b) =>
          new Date(b.Unit?.UpdatedAt ?? 0).getTime() -
          new Date(a.Unit?.UpdatedAt ?? 0).getTime(),
      );
    case 'pending-first':
      return copy.sort((a, b) => {
        const aPending =
          (a.Unit?.HeadRevisionNum ?? 0) !== (a.Unit?.LastReleasedRevisionNum ?? 0) ? 0 : 1;
        const bPending =
          (b.Unit?.HeadRevisionNum ?? 0) !== (b.Unit?.LastReleasedRevisionNum ?? 0) ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return (a.Unit?.Slug ?? '').localeCompare(b.Unit?.Slug ?? '');
      });
  }
};

export interface IUnitHierarchyTreeProps {
  /** units */
  units: ExtendedUnitRead[];
  /** Current grouping option */
  groupBy: GroupByOption;
  /** Callback when grouping option changes */
  onGroupByChange: (groupBy: GroupByOption) => void;
  /** Loading */
  isLoading: boolean;
  /** Selected unit IDs */
  selectedUnitIds: string[];
  /** Callback when selection changes */
  onMultiSelectChange: (selectedIds: string[]) => void;
}

const Container = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: theme.palette.background.paper,
  borderRight: `1px solid ${theme.palette.divider}`,
}));

const TreeContainer = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: 'auto',
  padding: theme.spacing(1),
}));

const EmptyStateContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',

  flex: 1,
  padding: theme.spacing(3, 2),
  textAlign: 'center',
  gap: theme.spacing(1.5),
}));

const ControlBar = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1, 1.5),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: alpha(theme.palette.background.paper, 0.5),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}));

interface GroupLevel {
  labelKey: string;
  groupType: GroupByOption;
}

/** Build leaf-level unit nodes */
const buildUnitNodes = (units: ExtendedUnitRead[]): UnitTreeNode[] =>
  units.map((unit) => ({
    id: unit.Unit?.UnitID || '',
    label: unit.Unit?.Slug || unit.Unit?.UnitID || '',
    unit,
    nodeType: 'unit' as const,
    hasChanges: (unit.Unit?.HeadRevisionNum ?? 0) !== (unit.Unit?.LastReleasedRevisionNum ?? 0),
    children: [],
  }));

/** Build tree structure with one or more grouping levels */
const buildMultiLevelTree = (
  units: ExtendedUnitRead[],
  levels: GroupLevel[],
): UnitTreeNode[] => {
  if (levels.length === 0) return buildUnitNodes(units);

  const [current, ...remaining] = levels;
  const groupMap = new Map<string, ExtendedUnitRead[]>();
  const ungrouped: ExtendedUnitRead[] = [];

  units.forEach((unit) => {
    const value = unit.Unit?.Labels?.[current.labelKey];
    if (value) {
      if (!groupMap.has(value)) groupMap.set(value, []);
      groupMap.get(value)!.push(unit);
    } else {
      ungrouped.push(unit);
    }
  });

  const nodes = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, groupUnits]) => ({
      id: `group-${current.labelKey}-${label}`,
      label,
      nodeType: 'environment' as const,
      groupType: current.groupType,
      hasChanges: false,
      children: buildMultiLevelTree(groupUnits, remaining),
    }));

  if (ungrouped.length > 0) {
    nodes.push({
      id: `group-${current.labelKey}-ungrouped`,
      label: 'Ungrouped',
      nodeType: 'environment' as const,
      groupType: current.groupType,
      hasChanges: false,
      children: buildMultiLevelTree(ungrouped, remaining),
    });
  }

  return nodes;
};

/** Build tree grouped by a unit entity field (Space or Target) using a key extractor */
const buildEntityTree = (
  units: ExtendedUnitRead[],
  groupType: GroupByOption,
  getKey: (unit: ExtendedUnitRead) => string | undefined,
): UnitTreeNode[] => {
  const groupMap = new Map<string, ExtendedUnitRead[]>();
  const ungrouped: ExtendedUnitRead[] = [];

  units.forEach((unit) => {
    const key = getKey(unit);
    if (key) {
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(unit);
    } else {
      ungrouped.push(unit);
    }
  });

  const nodes = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, groupUnits]) => ({
      id: `group-${groupType}-${label}`,
      label,
      nodeType: 'environment' as const,
      groupType,
      hasChanges: false,
      children: buildUnitNodes(groupUnits),
    }));

  if (ungrouped.length > 0) {
    nodes.push({
      id: `group-${groupType}-ungrouped`,
      label: 'Ungrouped',
      nodeType: 'environment' as const,
      groupType,
      hasChanges: false,
      children: buildUnitNodes(ungrouped),
    });
  }

  return nodes;
};

/** Build tree structure based on groupBy option */
const buildUnitTree = (units: ExtendedUnitRead[], groupBy: GroupByOption): UnitTreeNode[] => {
  switch (groupBy) {
    case 'none':
      return buildUnitNodes(units);
    case 'space':
      return buildEntityTree(units, 'space', (u) => u.Space?.DisplayName ?? u.Space?.Slug);
    case 'target':
      return buildEntityTree(units, 'target', (u) => u.Target?.DisplayName ?? u.Target?.Slug);
    case 'environment':
    case 'app': {
      const config = GROUP_BY_CONFIGS[groupBy];
      if (config.labelKey) {
        return buildMultiLevelTree(units, [{ labelKey: config.labelKey, groupType: groupBy }]);
      }
      return buildUnitNodes(units);
    }
    case 'app>environment':
      return buildMultiLevelTree(units, [
        { labelKey: 'app', groupType: 'app' },
        { labelKey: 'environment', groupType: 'environment' },
      ]);
    case 'environment>app':
      return buildMultiLevelTree(units, [
        { labelKey: 'environment', groupType: 'environment' },
        { labelKey: 'app', groupType: 'app' },
      ]);
    default:
      return buildUnitNodes(units);
  }
};

/** Collect every item ID in the tree (units and group nodes) */
const getAllItemIds = (items: UnitTreeNode[]): string[] => {
  const ids: string[] = [];
  const traverse = (nodes: UnitTreeNode[]) => {
    nodes.forEach((node) => {
      ids.push(node.id);
      if (node.children) traverse(node.children);
    });
  };
  traverse(items);
  return ids;
};

/** Get all expandable item IDs for default expansion */
const getExpandableItemIds = (items: UnitTreeNode[]): string[] => {
  const ids: string[] = [];

  const traverse = (nodes: UnitTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        ids.push(node.id);
        traverse(node.children);
      }
    });
  };

  traverse(items);
  return ids;
};

/**
 * Displays units in a hierarchical tree view based on their clone relationships.
 * Units with UpstreamUnitID are shown as children of their parent units.
 */
export const TreeNav = memo<IUnitHierarchyTreeProps>(
  ({ isLoading, units, groupBy, onGroupByChange, selectedUnitIds, onMultiSelectChange }) => {
    const [sortOption, setSortOption] = useState<SortOption>('slug-asc');
    const [sortAnchorEl, setSortAnchorEl] = useState<null | HTMLElement>(null);

    const sortedUnits = useMemo(() => sortUnits(units, sortOption), [units, sortOption]);

    // Build tree structure from units based on groupBy option
    const treeItems = useMemo(
      () => buildUnitTree(sortedUnits, groupBy),
      [sortedUnits, groupBy],
    );

    // Get default expanded items (expand all by default)
    const defaultExpandedItems = useMemo(() => getExpandableItemIds(treeItems), [treeItems]);

    // Create a map for quick item lookup
    const itemMap = useMemo(() => {
      const map = new Map<string, UnitTreeNode>();
      const addToMap = (items: UnitTreeNode[]) => {
        items.forEach((item) => {
          map.set(item.id, item);
          if (item.children) {
            addToMap(item.children);
          }
        });
      };
      addToMap(treeItems);
      return map;
    }, [treeItems]);

    const handleSelectAll = useCallback(() => {
      onMultiSelectChange(getAllItemIds(treeItems));
    }, [treeItems, onMultiSelectChange]);

    const handleUnselectAll = useCallback(() => {
      onMultiSelectChange([]);
    }, [onMultiSelectChange]);

    // Sync group and unit selections: checking a group selects children,
    // unchecking a child unchecks the group, selecting all children checks the group
    const handleMultiSelectChange = useCallback(
      (_event: React.SyntheticEvent, ids: string[]) => {
        const syncedIds = syncGroupSelections(ids, selectedUnitIds, itemMap);
        onMultiSelectChange(syncedIds);
      },
      [itemMap, selectedUnitIds, onMultiSelectChange],
    );

    // First load only — the dashboard query polls in the background and keeps
    // `isLoading` false, so the tree never flips back to the skeleton.
    if (isLoading) {
      return (
        <Container>
          <TreeNavSkeleton />
        </Container>
      );
    }

    if (treeItems.length === 0) {
      return (
        <Container>
          <ControlBar>
            <GroupBySelector groupBy={groupBy} onGroupByChange={onGroupByChange} />
          </ControlBar>
          <EmptyStateContainer>
            <EmptyIconBubble>
              <DataObjectIcon sx={{ fontSize: 28 }} />
            </EmptyIconBubble>
            <Typography variant='body2' fontWeight={600} color='text.primary'>
              No units found
            </Typography>
            <Typography variant='caption' color='text.secondary' sx={{ lineHeight: 1.5 }}>
              Create your first unit to start managing deployable configuration.
            </Typography>
            <Link
              href='https://docs.confighub.com/background/entities/unit/'
              target='_blank'
              rel='noopener noreferrer'
              variant='caption'
              underline='hover'
              sx={{ mt: 0.5 }}
            >
              Learn about Units →
            </Link>
          </EmptyStateContainer>
        </Container>
      );
    }

    return (
      <Container>
        <ControlBar>
          <GroupBySelector groupBy={groupBy} onGroupByChange={onGroupByChange} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Link
              component='button'
              variant='caption'
              underline='hover'
              color='text.secondary'
              onClick={handleSelectAll}
            >
              Select all
            </Link>
            <Link
              component='button'
              variant='caption'
              underline='hover'
              color='text.secondary'
              onClick={handleUnselectAll}
            >
              Unselect all
            </Link>
            <Tooltip title='Sort order'>
              <IconButton
                size='small'
                onClick={(e) => setSortAnchorEl(e.currentTarget)}
                sx={{
                  p: 0.25,
                  color: sortOption !== 'slug-asc' ? 'primary.main' : 'text.secondary',
                }}
              >
                <SwapVertIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={sortAnchorEl}
              open={Boolean(sortAnchorEl)}
              onClose={() => setSortAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              {SORT_OPTIONS.map((opt) => (
                <MenuItem
                  key={opt.value}
                  dense
                  selected={sortOption === opt.value}
                  onClick={() => {
                    setSortOption(opt.value);
                    setSortAnchorEl(null);
                  }}
                >
                  <ListItemText>{opt.label}</ListItemText>
                  {sortOption === opt.value && (
                    <ListItemIcon sx={{ minWidth: 'unset', ml: 1 }}>
                      <CheckIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                    </ListItemIcon>
                  )}
                </MenuItem>
              ))}
            </Menu>
          </Box>
        </ControlBar>
        <TreeContainer>
          <SimpleTreeView
            multiSelect
            checkboxSelection
            defaultExpandedItems={defaultExpandedItems}
            selectedItems={selectedUnitIds}
            //   @ts-expect-error - types are wrong for onSelectedItemsChange
            onSelectedItemsChange={handleMultiSelectChange}
            slots={{
              expandIcon: ChevronRightIcon,
              collapseIcon: ExpandMoreIcon,
            }}
          >
            <TreeNodes nodes={treeItems} groupBy={groupBy} />
          </SimpleTreeView>
        </TreeContainer>
      </Container>
    );
  },
);

TreeNav.displayName = 'TreeNav';
