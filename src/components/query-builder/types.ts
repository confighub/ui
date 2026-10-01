// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type {
  ExtendedViewRead,
} from '@confighub/rtk-query';

/**
 * Entity types supported by the QueryBuilder
 */
export type EntityType = 'Unit' | 'BridgeWorker' | 'Target' | 'Space' | 'Trigger';

/**
 * Available filter field types
 */
export type FilterFieldType =
  // Common fields (all entities)
  | 'space'
  | 'slug'
  | 'createdAt'
  | 'updatedAt'
  | 'labels'
  // Unit-specific fields
  | 'toolchainType'
  | 'target'
  | 'unitId'
  | 'headRevisionNum'
  | 'lastReleasedRevisionNum'
  | 'lastChangeDescription'
  | 'where'
  | 'whereData'
  | 'resourceType'
  // Computed Unit fields (client-side only)
  | 'upgradeNeeded'
  | 'unreleasedChanges'
  | 'validationErrorsCount'
  | 'checkResult'
  // BridgeWorker-specific fields
  | 'condition'
  | 'lastSeenAt'
  | 'bridgeWorkerId'
  | 'lastMessage'
  | 'ipAddress'
  // Target-specific fields
  | 'targetId'
  // Trigger-specific fields
  | 'event'
  | 'functionName'
  | 'disabled'
  | 'validating'
  | 'triggerId'
  // Saved filter selection

/**
 * Operator types for different field categories
 */
export type StringOperator = 'equals' | 'notEquals' | 'contains' | 'startsWith' | 'endsWith';
export type DateOperator = 'equals' | 'before' | 'after' | 'onOrBefore' | 'onOrAfter';
export type NumberOperator = 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual';
export type SelectOperator = 'equals' | 'notEquals';
export type InOperator = 'in' | 'notIn';
export type BooleanOperator = 'equals';
export type RawOperator = 'raw';
export type LabelOperator = 'equals' | 'notEquals' | 'contains' | 'exists' | 'notExists';

export type FilterOperator = StringOperator | DateOperator | NumberOperator | SelectOperator | InOperator | BooleanOperator | RawOperator | LabelOperator;

// Operator value sets for type guards
const STRING_OPERATORS: readonly string[] = ['equals', 'notEquals', 'contains', 'startsWith', 'endsWith'];
const DATE_OPERATORS: readonly string[] = ['equals', 'before', 'after', 'onOrBefore', 'onOrAfter'];
const NUMBER_OPERATORS: readonly string[] = ['equals', 'notEquals', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual'];
const SELECT_OPERATORS: readonly string[] = ['equals', 'notEquals'];
const IN_OPERATORS: readonly string[] = ['in', 'notIn'];
const BOOLEAN_OPERATORS: readonly string[] = ['equals'];
const RAW_OPERATORS: readonly string[] = ['raw'];
const LABEL_OPERATORS: readonly string[] = ['equals', 'notEquals', 'contains', 'exists', 'notExists'];

/**
 * Type guard for StringOperator
 */
export function isStringOperator(op: FilterOperator): op is StringOperator {
  return STRING_OPERATORS.includes(op);
}

/**
 * Type guard for DateOperator
 */
export function isDateOperator(op: FilterOperator): op is DateOperator {
  return DATE_OPERATORS.includes(op);
}

/**
 * Type guard for NumberOperator
 */
export function isNumberOperator(op: FilterOperator): op is NumberOperator {
  return NUMBER_OPERATORS.includes(op);
}

/**
 * Type guard for SelectOperator
 */
export function isSelectOperator(op: FilterOperator): op is SelectOperator {
  return SELECT_OPERATORS.includes(op);
}

/**
 * Type guard for InOperator
 */
export function isInOperator(op: FilterOperator): op is InOperator {
  return IN_OPERATORS.includes(op);
}

/**
 * Type guard for BooleanOperator
 */
export function isBooleanOperator(op: FilterOperator): op is BooleanOperator {
  return BOOLEAN_OPERATORS.includes(op);
}

/**
 * Type guard for RawOperator
 */
export function isRawOperator(op: FilterOperator): op is RawOperator {
  return RAW_OPERATORS.includes(op);
}

/**
 * Type guard for LabelOperator
 */
export function isLabelOperator(op: FilterOperator): op is LabelOperator {
  return LABEL_OPERATORS.includes(op);
}

/**
 * Exhaustiveness check helper - throws at compile time if a case is missing
 * @param value - The value that should be exhaustively checked
 * @param message - Optional error message for runtime safety
 */
export function assertNever(value: never, message = 'Unhandled case'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

/**
 * Label options for the labels filter dropdowns
 */
export interface LabelOptions {
  /** All unique label keys across entities */
  keys: string[];
  /** Map of label key to all unique values for that key */
  valuesByKey: Record<string, string[]>;
  /** Number of entities that have each label key */
  countByKey: Record<string, number>;
  /** Number of entities that have each key=value pair */
  countByKeyValue: Record<string, Record<string, number>>;
}

/**
 * A single filter condition
 */
export interface FilterCondition {
  id: string;
  field: FilterFieldType;
  operator: FilterOperator;
  value: string;
  /** For labels filter: the label key being filtered */
  labelKey?: string;
  /** Whether this filter is locked and cannot be removed or changed */
  locked?: boolean;
}

/**
 * Field configuration for the query builder
 */
export interface FieldConfig {
  type: FilterFieldType;
  label: string;
  operators: { value: FilterOperator; label: string }[];
  valueType: 'text' | 'select' | 'date' | 'number' | 'raw' | 'labelKeyValue';
  placeholder?: string;
  /** For select fields with predefined options (e.g., condition status) */
  options?: Array<{ value: string; label: string }>;
  /** If true, this field is computed client-side and should not generate WHERE clauses */
  computedField?: boolean;
}

/**
 * Props for the QueryBuilder component
 */
export interface QueryBuilderProps {
  /** Current filter conditions */
  filters: FilterCondition[];
  /** Callback when filters change */
  onFiltersChange: (filters: FilterCondition[]) => void;
  /** Locked filters that are always shown and cannot be removed */
  lockedFilters?: FilterCondition[];
  /** Entity type to configure available fields (default: 'Unit') */
  entityType?: EntityType;
  /** Available spaces for the space filter */
  spaces?: Array<{ id: string; name: string; labels?: Record<string, string> }>;
  /** Available targets for the target filter */
  targets?: Array<{ id: string; name: string }>;
  /** Available toolchain types */
  toolchainTypes?: string[];
  /** Available bridge workers for the bridgeWorker filter */
  bridgeWorkers?: Array<{ id: string; name: string }>;
  /** Available slugs for the slug autocomplete, with space grouping */
  slugs?: Array<{ slug: string; spaceName: string }>;
  /** Available resource types for the resource type filter */
  resourceTypes?: string[];
  /** Available label keys and values for the labels filter */
  labelOptions?: LabelOptions;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Callback when a saved view is selected */
  onSelectSavedView?: (view: ExtendedViewRead) => void;
  /** Callback to clear/reset the active view (navigate back to sentinel). */
  onRemoveActiveView?: () => void;
}

/**
 * Props for FilterRow component
 * Note: Most configuration (entityType, spaces, targets, etc.) comes from QueryBuilderContext
 */
export interface FilterRowProps {
  condition: FilterCondition;
  onUpdate: (condition: FilterCondition) => void;
  onRemove: () => void;
  disabled?: boolean;
  /** Auto-focus the value input when the filter is first rendered */
  autoFocus?: boolean;
}

/**
 * Props for AddFilterButton component
 */
export interface AddFilterButtonProps {
  onAddFilter: (field: FilterFieldType) => void;
  existingFields: FilterFieldType[];
  entityType?: EntityType;
  disabled?: boolean;
  /** Whether filters are already applied - changes button appearance */
  hasFilters?: boolean;
  /** Whether to hide the saved filter option */
}
