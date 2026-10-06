// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback } from 'react';

import {
  type GroupNavItemProps,
  type GroupNavLeafOptions,
  type GroupNavNodeContext,
  GroupNavPanel,
} from '@/components/group-nav';

import {
  COMPONENT_CATALOG,
  COMPONENT_FIELD,
  COMPONENT_ICON_MAP,
  type ComponentGroupValueContext,
  getComponentGroupValue,
} from './componentGroupFields';
import type { ComponentNavItem } from './componentIndex';

// ============================================================================
// TYPES
// ============================================================================

interface AppNavigationTreeProps {
  /** Every Component on the page, including those with no Spaces. Never
   * narrowed by the open graph, so the tree always shows the whole org. */
  items: ComponentNavItem[];
  /** Current grouping levels, already normalized (e.g. `['Labels.Owner']`). */
  levels: string[];
  /** Called on every chip add/remove/change (picker interaction). */
  onEditLevels: (newLevels: string[]) => void;
  /** The tree path to highlight (see `deriveComponentTreePath`) — `null` when
   * nothing should be selected. */
  selectedGroups: string[] | null;
  /** Called when any node except Overview is clicked. `AppsComponentLayout`
   * resolves whether that opens `?app=` or a `?group=` node graph. */
  onNodeOpen: (path: string[]) => void;
  selectionCount?: number;
  onClearSelection?: () => void;
  /** Called when Overview (the tree's `All`-equivalent root) is selected. */
  onOverviewSelect: () => void;
  /** True until the Components and every Space have loaded. The tree shows a
   * skeleton until then, since an owner read from a part of the Spaces can
   * be wrong, and the tree would move once the rest arrived. */
  isLoading?: boolean;
  /** Component label keys, for the field picker's dynamic "Labels" section. */
  labelKeys: string[];
  /** Per-label-key Component counts, for the picker's count badges. */
  labelKeyCounts: Record<string, number>;
  /** Context `getComponentGroupValue` needs for the status levels. */
  valueCtx: ComponentGroupValueContext;
}

const EMPTY_ITEMS: ComponentNavItem[] = [];

/** Each Component is a leaf, labelled by its Slug, counting its variants. */
const COMPONENT_LEAF: GroupNavLeafOptions<ComponentNavItem> = {
  getId: (item) => item.slug,
  getCount: (item) => item.spaces.length,
  iconField: COMPONENT_FIELD,
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Left-nav Component picker. A thin wrapper over the shared
 * `GroupNavPanel<ComponentNavItem>` (the same tree the Unit list uses) — see
 * `ui/docs/dev/components.md` ("Navigation tree").
 *
 * The leaves are the Components; the group nodes above them are grouping
 * levels read from each Component. Every node click opens a graph
 * (`onNodeOpen`); `AppsComponentLayout` decides the URL form. The chevron
 * (icon container) is the only way to expand/collapse
 * (`expansionTrigger='iconContainer'`), so a content click never fights with
 * drilling into the tree.
 */
export const AppNavigationTree = memo(({
  items,
  levels,
  onEditLevels,
  selectedGroups,
  onNodeOpen,
  selectionCount = 0,
  onClearSelection,
  onOverviewSelect,
  isLoading = false,
  labelKeys,
  labelKeyCounts,
  valueCtx,
}: AppNavigationTreeProps) => {
  const getValue = useCallback(
    (item: ComponentNavItem, column: string) => getComponentGroupValue(item, column, valueCtx),
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

  // A Component leaf gets `app-tree-item-<slug>` (the tour spec's testid);
  // every group node gets the generic `components-tree-node`, so a spec can
  // target a group node without matching its label text. The selection ring
  // and re-click-to-clear compare against `selectedGroups` (the resolved
  // highlight path): any node can be the one whose click opened the graph.
  const getItemProps = useCallback(
    ({ path, isLeaf }: GroupNavNodeContext): GroupNavItemProps => {
      const isThisNodeOpen =
        selectedGroups !== null &&
        selectedGroups.length === path.length &&
        selectedGroups.every((v, i) => v === path[i]);
      const hasSelections = isThisNodeOpen && selectionCount > 0;
      return {
        'data-testid': isLeaf ? `app-tree-item-${path[path.length - 1]}` : 'components-tree-node',
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
    [selectedGroups, selectionCount, onClearSelection],
  );

  return (
    <GroupNavPanel<ComponentNavItem>
      groupByColumns={levels}
      // No items while loading: the panel applies its first expansion when
      // its tree first has nodes, and that must be the complete tree.
      items={isLoading ? EMPTY_ITEMS : items}
      getValue={getValue}
      leaf={COMPONENT_LEAF}
      isLoading={isLoading}
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
      // The Components page's own wrapper is a react-resizable-panels `Panel`
      // that already tracks the drag width — fill it instead of sizing off
      // the Unit list's `--group-nav-width` CSS-variable mechanism, which
      // nothing here ever sets.
      fillContainer
    />
  );
});

AppNavigationTree.displayName = 'AppNavigationTree';
