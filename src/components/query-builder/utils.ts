// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Query Builder Utilities
 *
 * This file re-exports from specialized modules and contains miscellaneous utilities.
 *
 * Module organization:
 * - where-clause-builder.ts: Building WHERE clauses from FilterCondition objects
 * - where-clause-parser.ts: Parsing WHERE clauses back to FilterCondition objects
 * - client-side-filters.ts: Client-side filtering for computed fields
 * - utils.ts (this file): Re-exports and miscellaneous utilities
 */

import { FIELD_CONFIGS } from './operators';
import type { FilterCondition, FilterFieldType, LabelOptions } from './types';
import { parseWhereClausesToFilters as parseFilters } from './where-clause-parser';

// Re-export from specialized modules
export {
  buildWhereClauses,
  formatDateForApi,
  parseDateFromApi,
  type WhereClauseResult,
} from './where-clause-builder';

export { parseWhereClausesToFilters } from './where-clause-parser';

export { applyClientSideFilters } from './client-side-filters';
export type { ClientSideFilterContext } from './client-side-filters';

// ============================================================================
// Filter Description Utilities
// ============================================================================

/**
 * Filter object shape (subset of ExtendedFilterRead.Filter)
 */
interface FilterInfo {
  Where?: string;
  WhereData?: string;
  FromSpaceID?: string;
  ResourceType?: string;
}

interface FilterDescriptionLookups {
  spaces?: Array<{ id: string; name: string }>;
  targets?: Array<{ id: string; name: string }>;
}

/**
 * Get a human-readable description of what a filter does.
 * Parses the WHERE clause into structured conditions and formats them
 * with resolved names (e.g. space UUIDs become space names).
 */
export const getFilterDescription = (
  filter: FilterInfo | undefined,
  lookups?: FilterDescriptionLookups
): string => {
  if (!filter) return 'No filters defined';

  const conditions = parseFilters(
    filter.Where || '',
    filter.WhereData || '',
    filter.FromSpaceID || '',
    lookups?.spaces || [],
    () => `desc-${Math.random().toString(36).slice(2, 9)}`
  );

  // Add ResourceType as a condition if present (it's stored separately from WHERE)
  if (filter.ResourceType) {
    conditions.push({
      id: 'desc-rt',
      field: 'resourceType',
      operator: 'equals',
      value: filter.ResourceType,
    });
  }

  if (conditions.length === 0) return 'No filters defined';

  const parts = conditions.map((c) => {
    const fieldConfig = FIELD_CONFIGS[c.field];
    const label = fieldConfig?.label || c.field;

    // Resolve IDs to names for space/target fields
    let displayValue = c.value;
    if (c.field === 'space' && lookups?.spaces) {
      const space = lookups.spaces.find((s) => s.id === c.value);
      if (space) displayValue = space.name;
    } else if ((c.field === 'target' || c.field === 'targetId') && lookups?.targets) {
      const target = lookups.targets.find((t) => t.id === c.value);
      if (target) displayValue = target.name;
    }

    if (c.field === 'labels' && c.labelKey) {
      if (!displayValue) return `Labels.${c.labelKey}`;
      return `Labels.${c.labelKey} = ${displayValue}`;
    }

    if (c.operator === 'raw') {
      const truncated = displayValue.length > 25 ? displayValue.slice(0, 25) + '...' : displayValue;
      return `${label}: ${truncated}`;
    }

    if (['equals', 'in'].includes(c.operator)) {
      return `${label}: ${displayValue}`;
    }

    const opLabel = fieldConfig?.operators.find((o) => o.value === c.operator)?.label || c.operator;
    return `${label} ${opLabel.toLowerCase()} ${displayValue}`;
  });

  const maxParts = 3;
  if (parts.length > maxParts) {
    return parts.slice(0, maxParts).join(' · ') + ` (+${parts.length - maxParts} more)`;
  }

  return parts.join(' · ') || 'No filters defined';
};

// ============================================================================
// Label Extraction Utilities
// ============================================================================

/**
 * Entity shape that may contain Labels
 */
interface EntityWithLabels {
  Labels?: { [key: string]: string | null } | null;
}

/**
 * Extract LabelOptions from an array of entities
 * Aggregates all unique label keys and their values across entities
 * Accepts arrays with undefined/null items and filters them out
 */
export const extractLabelOptions = (
  entities: Array<EntityWithLabels | null | undefined>
): LabelOptions => {
  const keysSet = new Set<string>();
  const valuesByKey: Record<string, Set<string>> = {};
  const countByKey: Record<string, number> = {};
  const countByKeyValue: Record<string, Record<string, number>> = {};

  for (const entity of entities) {
    if (!entity?.Labels) continue;

    for (const [key, value] of Object.entries(entity.Labels)) {
      keysSet.add(key);
      countByKey[key] = (countByKey[key] || 0) + 1;

      if (!valuesByKey[key]) {
        valuesByKey[key] = new Set();
      }
      if (!countByKeyValue[key]) {
        countByKeyValue[key] = {};
      }

      if (value !== null && value !== undefined) {
        valuesByKey[key].add(value);
        countByKeyValue[key][value] = (countByKeyValue[key][value] || 0) + 1;
      }
    }
  }

  // Convert sets to sorted arrays
  const keys = Array.from(keysSet).sort();
  const valuesMap: Record<string, string[]> = {};

  for (const key of keys) {
    valuesMap[key] = Array.from(valuesByKey[key] || []).sort();
  }

  return {
    keys,
    valuesByKey: valuesMap,
    countByKey,
    countByKeyValue,
  };
};

// ============================================================================
// Slug Extraction Utilities
// ============================================================================

/**
 * Entity shape that may contain a Slug (and optionally a parent space name)
 */
interface EntityWithSlug {
  Slug?: string | null;
}

/**
 * Extract slug options from entity data for the slug autocomplete filter.
 * Works with any entity type (Unit, Space, Target, BridgeWorker, Trigger).
 *
 * @param entities - Array of entity objects (e.g., unit.Unit, space.Space)
 * @param spaceName - Optional function to resolve the space name for each entity.
 *   If not provided, spaceName defaults to empty string (no grouping).
 */
export const extractSlugs = <T extends EntityWithSlug>(
  entities: Array<T | null | undefined>,
  spaceName?: (entity: T) => string,
): Array<{ slug: string; spaceName: string }> => {
  const result: Array<{ slug: string; spaceName: string }> = [];
  const seen = new Set<string>();

  for (const entity of entities) {
    const slug = entity?.Slug;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push({
      slug,
      spaceName: spaceName ? spaceName(entity) : '',
    });
  }

  return result;
};

// ============================================================================
// Filter Comparison Utilities
// ============================================================================

/**
 * Compare two FilterCondition arrays for equality
 * Ignores `id` field (generated), compares semantic content only
 * Order-sensitive comparison
 */
export const areFilterConditionsEqual = (
  a: FilterCondition[],
  b: FilterCondition[]
): boolean => {
  if (a.length !== b.length) return false;

  return a.every((condA, index) => {
    const condB = b[index];
    return (
      condA.field === condB.field &&
      condA.operator === condB.operator &&
      condA.value === condB.value &&
      condA.labelKey === condB.labelKey
    );
  });
};

// ============================================================================
// Saved Filter Expansion
// ============================================================================

/**
 * Filter object shape for saved filter expansion
 */
interface SavedFilterInfo {
  FilterID?: string;
  Where?: string;
  WhereData?: string;
  FromSpaceID?: string;
  ResourceType?: string;
}

/**
 * Expand a saved filter into an array of FilterCondition objects.
 * This is the single source of truth for converting a saved filter to UI conditions.
 *
 * Used by:
 * - useQueryBuilder: URL initialization from filterID
 * - useQueryBuilder: handleSelectSavedView callback
 * - useSavedFilterTracking: originalConditions memoization
 *
 * @param filter - The saved filter to expand
 * @param spaces - Available spaces for lookup (needed for parsing)
 * @param generateId - Function to generate unique IDs for each condition
 * @returns Array of FilterCondition objects
 */
export const expandSavedFilterToConditions = (
  filter: SavedFilterInfo,
  spaces: Array<{ id: string; name: string }>,
  generateId: () => string,
  availableFields?: FilterFieldType[]
): FilterCondition[] => {
  // Parse the filter's WHERE clauses into filter conditions
  const parsedFilters = parseFilters(
    filter.Where || '',
    filter.WhereData || '',
    filter.FromSpaceID || '',
    spaces,
    generateId,
    availableFields
  );

  // Build expanded conditions (either parsed or raw fallback)
  let expandedFilters: FilterCondition[];

  // If we couldn't parse anything but there are raw clauses, create raw filter blocks
  if (parsedFilters.length === 0) {
    const rawFilters: FilterCondition[] = [];
    if (filter.Where) {
      rawFilters.push({
        id: generateId(),
        field: 'where',
        operator: 'raw',
        value: filter.Where,
      });
    }
    if (filter.WhereData) {
      rawFilters.push({
        id: generateId(),
        field: 'whereData',
        operator: 'raw',
        value: filter.WhereData,
      });
    }
    if (filter.ResourceType) {
      rawFilters.push({
        id: generateId(),
        field: 'resourceType',
        operator: 'equals',
        value: filter.ResourceType,
      });
    }
    expandedFilters = rawFilters;
  } else {
    expandedFilters = [...parsedFilters];
    if (filter.ResourceType) {
      expandedFilters.push({
        id: generateId(),
        field: 'resourceType',
        operator: 'equals',
        value: filter.ResourceType,
      });
    }
  }

  return expandedFilters;
};
