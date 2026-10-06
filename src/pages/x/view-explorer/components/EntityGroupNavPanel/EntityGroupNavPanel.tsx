// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, useCallback, useMemo, useState } from 'react';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem, treeItemClasses } from '@mui/x-tree-view/TreeItem';

import { ALL_GROUPS, formatHeaderLabel } from '@/components/group-nav';
import { getChipIcon } from '@/components/group-nav/field-icon';
import { EMPTY_GROUP_VALUE, compareGroupValues } from '@/components/group-nav/groupOrder';

import { GroupNavRow, getCellValue } from '../../cell-value';

/**
 * Group-tree navigation panel for the View Explorer.
 *
 * This is a lean fork of the shared `components/group-nav/GroupNavPanel`,
 * intentionally separate so the stable shared component stays unaware of the
 * View Explorer's Unit/Space/Resource entity types. It supports only the
 * subset the View Explorer uses (static header + selectable tree + optional
 * counts); the breadcrumb/collapse/field-picker features of the shared panel
 * are not reproduced here.
 */
interface EntityGroupNavPanelProps {
  groupByColumns: string[];
  rows: GroupNavRow[];
  /** Selected path through the tree; each entry is the value chosen per level. */
  selectedGroups: string[];
  onSelectGroups: (groups: string[]) => void;
  width?: number;
  /**
   * Suppress the per-node row counts. Resource views hide them because the
   * rows are units (grouping) but the user is thinking in resources, so a
   * unit count would mislead.
   */
  hideCounts?: boolean;
}

interface GroupTreeNode {
  id: string;
  label: string;
  count: number;
  path: string[];
  children: GroupTreeNode[];
}

const Panel = styled(Box)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  borderRight: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  flexShrink: 0,
  overflow: 'hidden',
}));

const PanelHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(1.5, 1, 1, 1.5),
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
    '&:hover': { backgroundColor: theme.palette.action.hover },
    '&.Mui-selected': {
      backgroundColor: theme.palette.action.selected,
      '&:hover': { backgroundColor: theme.palette.action.selected },
      '&.Mui-focused': { backgroundColor: theme.palette.action.selected },
    },
    '&.Mui-focused': { backgroundColor: 'transparent' },
  },
  [`& .${treeItemClasses.iconContainer}`]: {
    width: 20,
    '& svg': { fontSize: 18, color: theme.palette.text.secondary },
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
  rows: GroupNavRow[],
  groupByColumns: string[],
  depth: number,
  parentPath: string[],
): GroupTreeNode[] {
  if (depth >= groupByColumns.length) return [];

  const column = groupByColumns[depth];
  const buckets = new Map<string, GroupNavRow[]>();
  for (const row of rows) {
    const val = getCellValue(row, column) || EMPTY_GROUP_VALUE;
    let bucket = buckets.get(val);
    if (!bucket) {
      bucket = [];
      buckets.set(val, bucket);
    }
    bucket.push(row);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => compareGroupValues(a, b))
    .map(([value, bucketRows]) => {
      const path = [...parentPath, value];
      return {
        id: path.join('\0'),
        label: value,
        count: bucketRows.length,
        path,
        children: buildGroupTree(bucketRows, groupByColumns, depth + 1, path),
      };
    });
}

/** Ancestor IDs of the selected path, so deep-linked selections auto-expand. */
function ancestorIds(selectedGroups: string[]): string[] {
  const ids: string[] = [];
  for (let i = 1; i < selectedGroups.length; i++) {
    ids.push(selectedGroups.slice(0, i).join('\0'));
  }
  return ids;
}

export const EntityGroupNavPanel = memo(function EntityGroupNavPanel({
  groupByColumns,
  rows,
  selectedGroups,
  onSelectGroups,
  width = 240,
  hideCounts = false,
}: EntityGroupNavPanelProps) {
  const tree = useMemo(
    () => buildGroupTree(rows, groupByColumns, 0, []),
    [rows, groupByColumns],
  );

  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  // Rows load async, so the tree is empty on first render. Apply default
  // expansion (top-level nodes + ancestors of the selected path) once it
  // populates.
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

  const selectedItemId = useMemo(
    () => (selectedGroups.length === 0 ? ALL_GROUPS : selectedGroups.join('\0')),
    [selectedGroups],
  );

  const handleSelectedItemsChange = useCallback(
    (_event: React.SyntheticEvent | null, itemId: string | null) => {
      if (!itemId) return;
      const path = pathById.get(itemId);
      if (path !== undefined) onSelectGroups(path);
    },
    [pathById, onSelectGroups],
  );

  const isSelected = (id: string) => id === selectedItemId;
  const allSelected = selectedGroups.length === 0;
  const headerLabel = formatHeaderLabel(groupByColumns);

  function renderTree(nodes: GroupTreeNode[], depth = 0) {
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
            {!hideCounts && <CountBadge>{node.count}</CountBadge>}
          </ItemLabel>
        }
      >
        {node.children.length > 0 ? renderTree(node.children, depth + 1) : null}
      </StyledTreeItem>
    ));
  }

  return (
    <Panel sx={{ width, minWidth: width }}>
      <PanelHeader>
        <Typography variant='subtitle2' fontWeight={600} color='text.secondary' noWrap>
          {headerLabel}
        </Typography>
      </PanelHeader>
      <Divider />
      <PanelBody>
        <SimpleTreeView
          expandedItems={expandedItems}
          onExpandedItemsChange={handleExpandedItemsChange}
          selectedItems={selectedItemId}
          onSelectedItemsChange={handleSelectedItemsChange}
          slots={{ expandIcon: ChevronRightIcon, collapseIcon: ExpandMoreIcon }}
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
                {!hideCounts && <CountBadge>{rows.length}</CountBadge>}
              </ItemLabel>
            }
          />
          {renderTree(tree)}
        </SimpleTreeView>
      </PanelBody>
    </Panel>
  );
});
