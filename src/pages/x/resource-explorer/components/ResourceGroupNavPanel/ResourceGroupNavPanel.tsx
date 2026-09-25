// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, useCallback, useMemo, useState } from 'react';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem, treeItemClasses } from '@mui/x-tree-view/TreeItem';

import { ResourceRow } from '../../hooks/useResourceRows';
import { ALL_GROUPS, ResourceColumn } from '../../types';
import { getCellValue } from '../../utils';

/**
 * Tree-shaped nav over `rows`, bucketed by an ordered list of group-by
 * columns. Selecting a node returns the path of values; the parent uses that
 * path to filter rows passed to the table. "All" (empty path) restores the
 * full set.
 *
 * Adapted from `pages/x/view-explorer/components/GroupNavPanel`. Same shape
 * and behaviour, just rebound to `ResourceRow` and the resource-explorer's
 * `ResourceColumn` lookup.
 */
interface ResourceGroupNavPanelProps {
  /** Group-by columns in nesting order (outermost first). */
  groupByColumns: ResourceColumn[];
  rows: ResourceRow[];
  /** Selected path through the tree. Each entry is the bucket value at that depth. */
  selectedGroups: string[];
  onSelectGroups: (groups: string[]) => void;
}

interface GroupTreeNode {
  id: string;
  label: string;
  count: number;
  path: string[];
  children: GroupTreeNode[];
}

const Panel = styled(Box)(() => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
}));

const PanelHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(1, 1.5, 0.5),
}));

const PanelBody = styled(Box)(() => ({
  flex: 1,
  overflowY: 'auto',
  padding: '4px 8px',
}));

const StyledTreeItem = styled(TreeItem)(({ theme }) => ({
  [`& .${treeItemClasses.content}`]: {
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.5, 1),
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
  [`& .${treeItemClasses.label}`]: { fontSize: '0.875rem', paddingLeft: 4 },
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
  rows: ResourceRow[],
  cols: ResourceColumn[],
  depth: number,
  parentPath: string[],
): GroupTreeNode[] {
  if (depth >= cols.length) return [];

  const col = cols[depth];
  const buckets = new Map<string, ResourceRow[]>();

  for (const row of rows) {
    const val = getCellValue(row, col) || '(empty)';
    let bucket = buckets.get(val);
    if (!bucket) {
      bucket = [];
      buckets.set(val, bucket);
    }
    bucket.push(row);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, bucketRows]) => {
      const path = [...parentPath, value];
      return {
        id: path.join('\0'),
        label: value,
        count: bucketRows.length,
        path,
        children: buildGroupTree(bucketRows, cols, depth + 1, path),
      };
    });
}

/**
 * Trim the `Space.Labels.` / `Unit.Labels.` / legacy `Labels.` prefixes off
 * a column name for the panel header. View Explorer does the same — keeps
 * the header readable when grouping by a label key.
 */
function stripLabelPrefix(name: string): string {
  if (name.startsWith('Space.Labels.')) return name.slice('Space.Labels.'.length);
  if (name.startsWith('Unit.Labels.')) return name.slice('Unit.Labels.'.length);
  if (name.startsWith('Labels.')) return name.slice('Labels.'.length);
  return name;
}

/** Ancestor IDs of the currently selected path, for auto-expansion. */
function ancestorIds(selectedGroups: string[]): string[] {
  const ids: string[] = [];
  for (let i = 1; i < selectedGroups.length; i++) {
    ids.push(selectedGroups.slice(0, i).join('\0'));
  }
  return ids;
}

export const ResourceGroupNavPanel = memo(function ResourceGroupNavPanel({
  groupByColumns,
  rows,
  selectedGroups,
  onSelectGroups,
}: ResourceGroupNavPanelProps) {
  const tree = useMemo(
    () => buildGroupTree(rows, groupByColumns, 0, []),
    [rows, groupByColumns],
  );

  // Default-expand top-level + ancestors of the current selection once
  // rows arrive. Same idiom as view-explorer's GroupNavPanel — set state
  // during render only on the transition from empty to populated.
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
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

  const selectedItemId = useMemo(() => {
    if (selectedGroups.length === 0) return ALL_GROUPS;
    return selectedGroups.join('\0');
  }, [selectedGroups]);

  const handleSelectedItemsChange = useCallback(
    (_event: React.SyntheticEvent | null, itemId: string | null) => {
      if (!itemId) return;
      const path = pathById.get(itemId);
      if (path !== undefined) onSelectGroups(path);
    },
    [pathById, onSelectGroups],
  );

  const headerLabel = groupByColumns
    .map((c) => stripLabelPrefix(c.name))
    .join(' / ')
    .toUpperCase();

  function renderTree(nodes: GroupTreeNode[], isSelected: (id: string) => boolean) {
    return nodes.map((node) => (
      <StyledTreeItem
        key={node.id}
        itemId={node.id}
        label={
          <ItemLabel>
            <FolderOutlinedIcon
              fontSize='small'
              sx={{ color: isSelected(node.id) ? 'primary.main' : 'text.secondary' }}
            />
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
      </StyledTreeItem>
    ));
  }

  const isSelected = (id: string) => id === selectedItemId;
  const allSelected = selectedGroups.length === 0;

  return (
    <Panel>
      <PanelHeader>
        <Typography variant='subtitle2' fontWeight={600} color='text.secondary' noWrap>
          {headerLabel || 'GROUPS'}
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
                <CountBadge>{rows.length}</CountBadge>
              </ItemLabel>
            }
          />
          {renderTree(tree, isSelected)}
        </SimpleTreeView>
      </PanelBody>
    </Panel>
  );
});
