// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo, useState } from 'react';

import { spaceComponentSlug, useComponentSlugs } from '@/hooks/useComponentSlugs';
import { type ExtendedSpaceRead } from '@confighub/rtk-query';
import AppsIcon from '@mui/icons-material/Apps';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GridViewIcon from '@mui/icons-material/GridView';
import PeopleIcon from '@mui/icons-material/People';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem, treeItemClasses } from '@mui/x-tree-view/TreeItem';

import { AppNavigationTreeRowsSkeleton } from './AppNavigationTreeSkeleton';
import { type SelectedApp, OVERVIEW_ITEM_ID } from './appTypes';
import { LABEL_OWNER } from './componentData';

// ============================================================================
// TYPES
// ============================================================================

interface AppTreeNode {
  id: string;
  label: string;
  nodeType: 'owner' | 'app';
  appName?: string;
  ownerName?: string;
  deploymentCount: number;
  children: AppTreeNode[];
}

interface AppNavigationTreeProps {
  spaces: ExtendedSpaceRead[];
  selectedApp: SelectedApp | null;
  onAppSelect: (app: SelectedApp) => void;
  selectionCount?: number;
  onClearSelection?: () => void;
  isOverviewSelected: boolean;
  onOverviewSelect: () => void;
  /** True while `spaces` is a partial (single-app) set from a `?app=` deep-link's priority
   * query — the full org-wide app list is still loading in the background. */
  isLoadingMore?: boolean;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: theme.palette.background.paper,
}));

const Header = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.5, 2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: alpha(theme.palette.background.paper, 0.5),
}));

const TreeContainer = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: 'auto',
  padding: theme.spacing(1),
}));

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

const ItemLabel = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
});

const CountBadge = styled('span')(({ theme }) => ({
  fontSize: '0.7rem',
  color: theme.palette.text.disabled,
  backgroundColor: alpha(theme.palette.text.primary, 0.08),
  borderRadius: 9,
  padding: '1px 6px',
  lineHeight: 1.4,
}));

/** Tree item with blue selection ring when targets are selected */
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

// ============================================================================
// TREE BUILDING
// ============================================================================

const buildAppTree = (spaces: ExtendedSpaceRead[], slugById: ReadonlyMap<string, string>): AppTreeNode[] => {
  // Extract distinct (Owner, Component) pairs with deployment counts
  const ownerMap = new Map<string, Map<string, number>>();

  for (const space of spaces) {
    const app = spaceComponentSlug(space.Space, slugById);
    const owner = space.Space?.Labels?.[LABEL_OWNER] ?? 'Unassigned';
    if (!app) continue;

    if (!ownerMap.has(owner)) ownerMap.set(owner, new Map());
    const appMap = ownerMap.get(owner)!;
    appMap.set(app, (appMap.get(app) ?? 0) + 1);
  }

  // Build tree nodes
  return Array.from(ownerMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([owner, apps]) => ({
      id: `owner-${owner}`,
      label: owner,
      nodeType: 'owner' as const,
      ownerName: owner,
      deploymentCount: Array.from(apps.values()).reduce((sum, n) => sum + n, 0),
      children: Array.from(apps.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([app, count]) => ({
          id: `app-${owner}-${app}`,
          label: app,
          nodeType: 'app' as const,
          appName: app,
          ownerName: owner,
          deploymentCount: count,
          children: [],
        })),
    }));
};

// ============================================================================
// COMPONENT
// ============================================================================

export const AppNavigationTree = memo(
  ({ spaces, selectedApp, onAppSelect, selectionCount = 0, onClearSelection, isOverviewSelected, onOverviewSelect, isLoadingMore = false }: AppNavigationTreeProps) => {
    const { slugById } = useComponentSlugs();
    const treeItems = useMemo(() => buildAppTree(spaces, slugById), [spaces, slugById]);

    const [expandedItems, setExpandedItems] = useState<string[]>(() =>
      treeItems.map((n) => n.id),
    );

    const handleExpandedItemsChange = useCallback(
      (_event: React.SyntheticEvent | null, itemIds: string[]) => {
        setExpandedItems(itemIds);
      },
      [],
    );

    const selectedItemId = selectedApp
      ? `app-${selectedApp.owner}-${selectedApp.name}`
      : undefined;

    const totalApps = useMemo(
      () => treeItems.reduce((sum, owner) => sum + owner.children.length, 0),
      [treeItems],
    );

    const handleSelectedItemsChange = useCallback(
      (_event: React.SyntheticEvent | null, itemId: string | null) => {
        if (!itemId) return;
        // Handle Overview pseudo-item
        if (itemId === OVERVIEW_ITEM_ID) {
          onOverviewSelect();
          return;
        }
        for (const owner of treeItems) {
          for (const app of owner.children) {
            if (app.id === itemId && app.appName && app.ownerName) {
              onAppSelect({ name: app.appName, owner: app.ownerName });
              return;
            }
          }
        }
      },
      [treeItems, onAppSelect, onOverviewSelect],
    );

    return (
      <Container>
        <Header>
          <Typography variant='body2' color='text.secondary' fontWeight={500}>
            Components
            <CountBadge sx={{ ml: 1 }}>
              {isLoadingMore ? (
                <Skeleton
                  variant='rounded'
                  width={10}
                  height={9}
                  sx={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: '3px' }}
                />
              ) : (
                totalApps
              )}
            </CountBadge>
          </Typography>
        </Header>
        <TreeContainer>
          <SimpleTreeView
            expandedItems={expandedItems}
            onExpandedItemsChange={handleExpandedItemsChange}
            selectedItems={isOverviewSelected ? OVERVIEW_ITEM_ID : selectedItemId}
            onSelectedItemsChange={handleSelectedItemsChange}
            slots={{
              expandIcon: ChevronRightIcon,
              collapseIcon: ExpandMoreIcon,
            }}
          >
            <StyledTreeItem
              itemId={OVERVIEW_ITEM_ID}
              label={
                <ItemLabel>
                  <GridViewIcon
                    fontSize='small'
                    sx={{ color: isOverviewSelected ? 'primary.main' : 'text.secondary' }}
                  />
                  <Typography variant='body2' fontWeight={500} noWrap>
                    Overview
                  </Typography>
                </ItemLabel>
              }
            />
            <Divider sx={{ my: 0.5, mx: 1 }} />
            {treeItems.map((ownerNode) => (
              <StyledTreeItem
                key={ownerNode.id}
                itemId={ownerNode.id}
                label={
                  <ItemLabel>
                    <PeopleIcon fontSize='small' sx={{ color: 'text.secondary' }} />
                    <Typography variant='body2' fontWeight={500} noWrap>
                      {ownerNode.label}
                    </Typography>
                    <CountBadge>{ownerNode.children.length}</CountBadge>
                  </ItemLabel>
                }
              >
                {ownerNode.children.map((appNode) => {
                  const isThisAppSelected = selectedApp?.name === appNode.appName && selectedApp?.owner === appNode.ownerName;
                  const hasSelections = isThisAppSelected && selectionCount > 0;
                  return (
                    <SelectableTreeItem
                      key={appNode.id}
                      data-testid={`app-tree-item-${appNode.appName}`}
                      itemId={appNode.id}
                      $hasSelections={hasSelections}
                      onClick={(e) => {
                        // If clicking the already-selected app with selections, clear them
                        if (isThisAppSelected && selectionCount > 0) {
                          e.stopPropagation();
                          onClearSelection?.();
                        }
                      }}
                      label={
                        <ItemLabel>
                          <AppsIcon fontSize='small' sx={{ color: 'primary.main' }} />
                          <Typography variant='body2' noWrap>
                            {appNode.label}
                          </Typography>
                          <CountBadge>{appNode.deploymentCount}</CountBadge>
                        </ItemLabel>
                      }
                    />
                  );
                })}
              </StyledTreeItem>
            ))}
          </SimpleTreeView>
          {/* Partial-load affordance: row-shaped placeholders for the owner
              groups still arriving from the org-wide query, so the deep-linked
              app never looks like the only component that exists. */}
          {isLoadingMore && <AppNavigationTreeRowsSkeleton groupCount={2} />}
        </TreeContainer>
      </Container>
    );
  },
);

AppNavigationTree.displayName = 'AppNavigationTree';
