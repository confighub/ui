// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo } from 'react';

import { type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { Ellipses, TruncatedTooltip } from '@/components/styled';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AppsIcon from '@mui/icons-material/Apps';
import DnsIcon from '@mui/icons-material/Dns';
import FolderCopyIcon from '@mui/icons-material/FolderCopy';
import LanIcon from '@mui/icons-material/Lan';
import LayersIcon from '@mui/icons-material/Layers';
import StorageIcon from '@mui/icons-material/Storage';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';
import { TreeItem, treeItemClasses } from '@mui/x-tree-view/TreeItem';

// import { Separator } from '../../components/Breadcrumb';

/** Get icon based on node type and group type */
const getNodeIcon = (nodeType: UnitTreeNode['nodeType'], groupType?: GroupByOption) => {
  // For unit nodes, always use DnsIcon
  if (nodeType === 'unit') {
    return <DnsIcon fontSize='small' sx={{ color: 'primary.main' }} />;
  }

  // For group nodes, use icon matching the groupBy selector
  switch (groupType) {
    case 'cluster':
      return <LayersIcon fontSize='small' sx={{ color: 'secondary.main' }} />;
    case 'app':
      return <AppsIcon fontSize='small' sx={{ color: 'secondary.main' }} />;
    case 'environment':
      return <LanIcon fontSize='small' sx={{ color: 'secondary.main' }} />;
    case 'space':
      return <FolderCopyIcon fontSize='small' sx={{ color: 'secondary.main' }} />;
    case 'target':
      return <StorageIcon fontSize='small' sx={{ color: 'secondary.main' }} />;
    case 'none':
      return <AccountTreeIcon fontSize='small' sx={{ color: 'primary.main' }} />;
    default:
      // Fallback based on nodeType
      if (nodeType === 'cluster') {
        return <LayersIcon fontSize='small' sx={{ color: 'secondary.main' }} />;
      }
      return <LanIcon fontSize='small' sx={{ color: 'secondary.main' }} />;
  }
};

/** Determine unit health status based on revisions */
const getUnitHealth = (unit: ExtendedUnitRead): 'healthy' | 'warning' | 'error' => {
  const headRev = unit.Unit?.HeadRevisionNum ?? 0;
  const liveRev = unit.Unit?.LastReleasedRevisionNum ?? 0;

  if (headRev === liveRev && headRev > 0) {
    return 'healthy';
  }
  if (headRev > liveRev) {
    return 'warning'; // Has pending changes
  }
  return 'error';
};

/** Tree node structure for units */
export interface UnitTreeNode {
  id: string;
  label: string;
  unit?: ExtendedUnitRead;
  nodeType: 'cluster' | 'environment' | 'unit';
  /** The groupBy option that created this node (for group headers) */
  groupType?: GroupByOption;
  hasChanges: boolean;
  children: UnitTreeNode[];
}

const StyledTreeItem = styled(TreeItem)(({ theme }) => ({
  [`& .${treeItemClasses.content}`]: {
    borderRadius: theme.spacing(0.5),
    padding: theme.spacing(0.5, 1),
    margin: theme.spacing(0.2, 0),
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.08),
    },
    '&.Mui-selected': {
      backgroundColor: alpha(theme.palette.primary.main, 0.12),
      '&:hover': {
        backgroundColor: alpha(theme.palette.primary.main, 0.16),
      },
      '&.Mui-focused': {
        backgroundColor: alpha(theme.palette.primary.main, 0.16),
      },
    },
    '&.Mui-focused': {
      backgroundColor: alpha(theme.palette.primary.main, 0.08),
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
    borderLeft: `1px dashed ${alpha(theme.palette.text.primary, 0.2)}`,
  },
}));

const ItemContent = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  gap: 2,
});

const ItemLabel = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flex: 1,
  minWidth: 0,
});

const StatusIndicator = styled(Box)<{ $status: 'healthy' | 'warning' | 'error' }>(
  ({ theme, $status }) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    backgroundColor:
      $status === 'healthy'
        ? theme.palette.success.main
        : $status === 'warning'
          ? theme.palette.warning.main
          : theme.palette.error.main,
  }),
);

const PathSeparator = styled(Typography)(({ theme }) => ({
  fontSize: '0.72rem',
  color: theme.palette.text.disabled,
  flexShrink: 0,
  userSelect: 'none',
  lineHeight: 1,
  px: 0.25,
}));

export interface TreeNodesProps {
  nodes: UnitTreeNode[];
  groupBy?: GroupByOption;
}

/** Recursively renders tree nodes with custom labels */
export const TreeNodes = memo<TreeNodesProps>(({ nodes, groupBy }) => {
  const showSpaceSlug = groupBy !== 'space';

  return (
    <>
      {nodes.map((node) => {
        const health = node.unit ? getUnitHealth(node.unit) : 'healthy';

        const label = (
          <ItemContent>
            <ItemLabel>
              {getNodeIcon(node.nodeType, node.groupType)}
              {node.nodeType === 'unit' && node.unit?.Space?.Slug && showSpaceSlug && (
                <>
                  <TruncatedTooltip title={node.unit.Space.Slug}>
                    <Ellipses
                      variant='body2'
                      noWrap
                      sx={{
                        fontSize: '0.72rem',
                        color: 'text.disabled',
                        flex: '0 1 auto',
                        minWidth: 0,
                        maxWidth: '45%',
                      }}
                    >
                      {node.unit.Space.Slug}
                    </Ellipses>
                  </TruncatedTooltip>
                  <PathSeparator>/</PathSeparator>
                </>
              )}
              <TruncatedTooltip title={node.label}>
                <Ellipses
                  variant='body2'
                  noWrap
                  sx={{
                    fontWeight: node.children?.length ? 500 : 400,
                    fontSize: '0.8rem',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {node.label}
                </Ellipses>
              </TruncatedTooltip>
              {node.nodeType === 'unit' && node.hasChanges && (
                <StatusIndicator $status={health} />
              )}
            </ItemLabel>
          </ItemContent>
        );

        return (
          <StyledTreeItem key={node.id} itemId={node.id} label={label}>
            {node.children && node.children.length > 0 && (
              <TreeNodes nodes={node.children} groupBy={groupBy} />
            )}
          </StyledTreeItem>
        );
      })}
    </>
  );
});

TreeNodes.displayName = 'TreeNodes';
