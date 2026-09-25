// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { type ExtendedUnitRead } from '@confighub/rtk-query';

import { type UnitTreeNode } from '@/pages/x/unit-dashboard-page/components/TreeNode';

const GROUP_NODE_PREFIX = 'group-';

/** Check if an ID represents a group node (e.g. "group-app-frontend") */
export const isGroupNodeId = (id: string): boolean => id.startsWith(GROUP_NODE_PREFIX);

interface ParsedGroupNode {
  labelKey: string;
  value: string;
}

/** Parse a group node ID into its labelKey and value parts */
export const parseGroupNodeId = (id: string): ParsedGroupNode | null => {
  if (!isGroupNodeId(id)) return null;
  // Format: "group-{labelKey}-{value}"
  const withoutPrefix = id.slice(GROUP_NODE_PREFIX.length);
  const firstDash = withoutPrefix.indexOf('-');
  if (firstDash === -1) return null;
  return {
    labelKey: withoutPrefix.slice(0, firstDash),
    value: withoutPrefix.slice(firstDash + 1),
  };
};

/** Recursively collect all unit IDs under a tree node */
export const collectUnitIds = (node: UnitTreeNode): string[] => {
  if (node.nodeType === 'unit') {
    return [node.id];
  }
  return node.children.flatMap(collectUnitIds);
};

/**
 * Synchronize group and unit selections so that:
 * - Checking a group node selects all its child units
 * - Unchecking a group node deselects all its child units
 * - Unchecking a child unit unchecks the parent group
 * - When all children of a group are individually selected, the group gets checked
 *
 * Requires the previous selection to detect intentional group unchecks.
 */
export const syncGroupSelections = (
  selectedIds: string[],
  prevSelectedIds: string[],
  itemMap: Map<string, UnitTreeNode>,
): string[] => {
  const newSet = new Set(selectedIds);
  const result = new Set<string>();

  // Detect groups that were intentionally unchecked (present before, absent now)
  const uncheckedGroups = new Set<string>();
  for (const id of prevSelectedIds) {
    if (isGroupNodeId(id) && !newSet.has(id)) {
      uncheckedGroups.add(id);
    }
  }

  // Step 1: expand newly checked group IDs into child unit IDs,
  // and remove children of intentionally unchecked groups
  for (const id of selectedIds) {
    if (isGroupNodeId(id)) {
      // Group is checked — select all its children
      const node = itemMap.get(id);
      if (node) {
        for (const unitId of collectUnitIds(node)) {
          result.add(unitId);
        }
      }
    } else {
      result.add(id);
    }
  }

  // Remove children of groups that were intentionally unchecked
  for (const groupId of uncheckedGroups) {
    const node = itemMap.get(groupId);
    if (node) {
      for (const unitId of collectUnitIds(node)) {
        // Only remove if the unit wasn't explicitly in prevSet as an individual selection
        // before the group was checked. Since we can't distinguish that easily,
        // just remove all children when group is unchecked.
        result.delete(unitId);
      }
    }
  }

  // Step 2: for every group node, add it if all children are selected,
  // remove it if not (but skip groups the user just intentionally unchecked)
  for (const [id, node] of itemMap) {
    if (!isGroupNodeId(id)) continue;
    if (uncheckedGroups.has(id)) continue;
    const childUnitIds = collectUnitIds(node);
    if (childUnitIds.length === 0) continue;
    const allChildrenSelected = childUnitIds.every((uid) => result.has(uid));
    if (allChildrenSelected) {
      result.add(id);
    } else {
      result.delete(id);
    }
  }

  return Array.from(result);
};

/** Filter out group node IDs, returning only unit IDs */
export const filterUnitIds = (ids: string[]): string[] =>
  ids.filter((id) => !isGroupNodeId(id));

interface GroupInfo {
  groupValue: string;
  units: ExtendedUnitRead[];
}

interface GroupComparisonResult {
  canCompare: boolean;
  comparisonType: 'app' | 'environment' | null;
  groups: GroupInfo[];
}

/** Try to group units by a label key and check if they form exactly 2 groups */
const tryGroupByLabel = (
  units: ExtendedUnitRead[],
  labelKey: string,
): Map<string, ExtendedUnitRead[]> | null => {
  const groupMap = new Map<string, ExtendedUnitRead[]>();
  for (const unit of units) {
    const value = unit.Unit?.Labels?.[labelKey] ?? '';
    if (!value) continue;
    const existing = groupMap.get(value);
    if (existing) {
      existing.push(unit);
    } else {
      groupMap.set(value, [unit]);
    }
  }
  return groupMap.size === 2 ? groupMap : null;
};

/**
 * Detect if the selected units form exactly 2 distinct groups of the same type.
 * When groupBy specifies a label (app/environment), uses that label key.
 * When groupBy is 'none' or nested, auto-detects by trying both 'app' and 'environment'.
 */
export const detectGroupComparison = (
  units: ExtendedUnitRead[],
  groupBy: GroupByOption,
): GroupComparisonResult => {
  const noMatch: GroupComparisonResult = {
    canCompare: false,
    comparisonType: null,
    groups: [],
  };

  if (units.length < 2) return noMatch;

  // Build ordered list of label keys to try based on groupBy
  const keysToTry: Array<{ labelKey: string; type: 'app' | 'environment' }> = [];
  if (groupBy === 'app' || groupBy === 'app>environment') {
    keysToTry.push({ labelKey: 'app', type: 'app' });
  } else if (groupBy === 'environment' || groupBy === 'environment>app') {
    keysToTry.push({ labelKey: 'environment', type: 'environment' });
  } else {
    // For 'none' or other cases, try both
    keysToTry.push({ labelKey: 'app', type: 'app' });
    keysToTry.push({ labelKey: 'environment', type: 'environment' });
  }

  for (const { labelKey, type } of keysToTry) {
    const groupMap = tryGroupByLabel(units, labelKey);
    if (groupMap) {
      const groups = Array.from(groupMap.entries()).map(([groupValue, groupUnits]) => ({
        groupValue,
        units: groupUnits,
      }));
      return { canCompare: true, comparisonType: type, groups };
    }
  }

  return noMatch;
};

/**
 * Extract the app name from a group ID string.
 * The group ID is prefixed with "group-", so this function removes the prefix.
 * @param groupId - The group ID string (e.g., "group-appName").
 * @returns The app name without the "group-" prefix.
 */
export const getAppNameFromGroupId = (groupId: string): string => {
  if (groupId.startsWith('group-')) {
    return groupId.replace('group-app-', '');
  }
  return groupId; // Return the original string if it doesn't start with "group-"
};