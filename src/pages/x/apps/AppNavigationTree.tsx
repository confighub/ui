// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback } from 'react';

import {
  type GroupNavItemProps,
  type GroupNavNodeContext,
  GroupNavPanel,
} from '@/components/group-nav';
import { type ExtendedSpaceRead } from '@confighub/rtk-query';

import { AppNavigationTreeRowsSkeleton } from './AppNavigationTreeSkeleton';
import {
  COMPONENT_CATALOG,
  COMPONENT_FIELD,
  COMPONENT_ICON_MAP,
  type SpaceGroupValueContext,
  getSpaceGroupValue,
} from './componentGroupFields';

// ============================================================================
// TYPES
// ============================================================================

interface AppNavigationTreeProps {
  /** Spaces to build the tree from — every Space on the page in a Component.
   * Never the open graph's own Space set (that's a separate prop on
   * `AppComponentView`), so the tree always shows the full org regardless
   * of which node graph happens to be open. */
  spaces: ExtendedSpaceRead[];
  /** Current grouping levels (e.g. `['Labels.Owner', 'Component']`). */
  levels: string[];
  /** Called on every chip add/remove/change (picker interaction). */
  onEditLevels: (newLevels: string[]) => void;
  /** The tree path to highlight (see `deriveComponentTreePath`) — `null` when
   * nothing should be selected (an open graph whose levels don't resolve
   * back to a highlightable node). */
  selectedGroups: string[] | null;
  /** Called when any tree node (any depth, any field) is clicked — opens the
   * graph of every Space under it. `AppsComponentLayout` resolves whether
   * that's a whole-Component `?app=` or a `?group=` node graph. */
  onNodeOpen: (path: string[]) => void;
  selectionCount?: number;
  onClearSelection?: () => void;
  /** Called when Overview (the tree's `All`-equivalent root) is selected. */
  onOverviewSelect: () => void;
  /** True while `spaces` is a partial (single-app) set from a `?app=` deep-link's priority
   * query — the full org-wide app list is still loading in the background. */
  isLoadingMore?: boolean;
  /** Distinct Space label keys across the page's Spaces, for the field picker's dynamic "Labels" section. */
  labelKeys: string[];
  /** Per-label-key Space counts, for the picker's count badges. */
  labelKeyCounts: Record<string, number>;
  /** Context `getSpaceGroupValue` needs for the ReleaseTarget / summary-only fields. */
  valueCtx: SpaceGroupValueContext;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Left-nav Space picker. A thin wrapper over the shared
 * `GroupNavPanel<ExtendedSpaceRead>` (the same tree the Unit list uses) — see
 * `ui/docs/dev/components.md` ("Navigation tree: node click opens a graph").
 *
 * Every node click opens a graph (`onNodeOpen`) — there is no leaf/group-node
 * branching left here; `AppsComponentLayout` decides the URL FORM (`?app=`
 * vs `?group=`) from the node's own Space set. The chevron (icon container)
 * is the only way to expand/collapse (`expansionTrigger='iconContainer'`),
 * so a content click never fights with drilling into the tree.
 */
export const AppNavigationTree = memo(({
  spaces,
  levels,
  onEditLevels,
  selectedGroups,
  onNodeOpen,
  selectionCount = 0,
  onClearSelection,
  onOverviewSelect,
  isLoadingMore = false,
  labelKeys,
  labelKeyCounts,
  valueCtx,
}: AppNavigationTreeProps) => {
  const getValue = useCallback(
    (space: ExtendedSpaceRead, column: string) => getSpaceGroupValue(space, column, valueCtx),
    [valueCtx],
  );

  const handleTreeSelectGroups = useCallback(
    (path: string[]) => {
      if (path.length === 0) {
        onOverviewSelect();
        return;
      }
      onNodeOpen(path);
    },
    [onNodeOpen, onOverviewSelect],
  );

  // A Component-field node gets `app-tree-item-<name>` (the tour spec's
  // testid, kept at any depth); every other node gets the generic
  // `components-tree-node`, so a spec can target a group node without
  // matching its label text. The selection ring / re-click-to-clear
  // behavior compares against `selectedGroups` (the resolved highlight
  // path), not a Component-specific check — any node, at any depth or
  // field, can be the one whose click opened the currently-open graph.
  const getItemProps = useCallback(
    ({ path, depth }: GroupNavNodeContext): GroupNavItemProps => {
      const isComponentField = levels[depth] === COMPONENT_FIELD;
      const isThisNodeOpen =
        selectedGroups !== null &&
        selectedGroups.length === path.length &&
        selectedGroups.every((v, i) => v === path[i]);
      const hasSelections = isThisNodeOpen && selectionCount > 0;
      return {
        'data-testid': isComponentField ? `app-tree-item-${path[depth]}` : 'components-tree-node',
        $hasSelections: hasSelections,
        onClick: (e) => {
          // Re-clicking the already-open node while it has deployment
          // selections clears them instead of re-opening the same graph.
          if (isThisNodeOpen && selectionCount > 0) {
            e.stopPropagation();
            onClearSelection?.();
          }
        },
      };
    },
    [levels, selectedGroups, selectionCount, onClearSelection],
  );

  return (
    <GroupNavPanel<ExtendedSpaceRead>
      groupByColumns={levels}
      items={spaces}
      getValue={getValue}
      selectedGroups={selectedGroups}
      onSelectGroups={handleTreeSelectGroups}
      allLabel='Overview'
      onEditLevels={onEditLevels}
      availableLabelKeys={labelKeys}
      availableLabelKeyCounts={labelKeyCounts}
      catalog={COMPONENT_CATALOG}
      fieldLabels={COMPONENT_CATALOG.fieldLabels}
      iconMap={COMPONENT_ICON_MAP}
      getItemProps={getItemProps}
      expansionTrigger='iconContainer'
      footer={isLoadingMore ? <AppNavigationTreeRowsSkeleton groupCount={2} /> : undefined}
      // The Components page's own wrapper is a react-resizable-panels `Panel`
      // that already tracks the drag width — fill it instead of sizing off
      // the Unit list's `--group-nav-width` CSS-variable mechanism, which
      // nothing here ever sets.
      fillContainer
    />
  );
});

AppNavigationTree.displayName = 'AppNavigationTree';
