// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { EntityType, FieldConfig, FilterFieldType, FilterOperator } from './types';

/**
 * Returns true when a field config supports both single-select (equals/notEquals)
 * and multi-select (in/notIn) operators with a select value type.
 * These fields should always render the checkbox multi-select dropdown.
 */
export const isMultiSelectConfig = (config: FieldConfig): boolean =>
  config.valueType === 'select' &&
  config.operators.some((op) => op.value === 'in') &&
  config.operators.some((op) => op.value === 'equals');

/**
 * Common operator sets for reuse
 */
const STRING_OPERATORS: FieldConfig['operators'] = [
  { value: 'equals', label: 'is' },
  { value: 'notEquals', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
];

const SELECT_OPERATORS: FieldConfig['operators'] = [
  { value: 'equals', label: 'is' },
  { value: 'notEquals', label: 'is not' },
];

const IN_OPERATORS: FieldConfig['operators'] = [
  { value: 'in', label: 'is one of' },
  { value: 'notIn', label: 'is not one of' },
];

const MULTI_SELECT_OPERATORS: FieldConfig['operators'] = [
  ...IN_OPERATORS,
  ...SELECT_OPERATORS,
];

const DATE_OPERATORS: FieldConfig['operators'] = [
  { value: 'equals', label: 'on' },
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
  { value: 'onOrBefore', label: 'on or before' },
  { value: 'onOrAfter', label: 'on or after' },
];

const NUMBER_OPERATORS: FieldConfig['operators'] = [
  { value: 'equals', label: '=' },
  { value: 'notEquals', label: '!=' },
  { value: 'greaterThan', label: '>' },
  { value: 'lessThan', label: '<' },
  { value: 'greaterOrEqual', label: '>=' },
  { value: 'lessOrEqual', label: '<=' },
];

const VALIDATION_ERRORS_COUNT_OPERATORS: FieldConfig['operators'] = [
  { value: 'greaterOrEqual', label: '>=' },
  { value: 'equals', label: '=' },
  { value: 'notEquals', label: '!=' },
  { value: 'greaterThan', label: '>' },
  { value: 'lessThan', label: '<' },
  { value: 'lessOrEqual', label: '<=' },
];

const BOOLEAN_OPERATORS: FieldConfig['operators'] = [{ value: 'equals', label: 'is' }];

const LABEL_OPERATORS: FieldConfig['operators'] = [
  { value: 'equals', label: 'is' },
  { value: 'notEquals', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'exists', label: 'exists' },
  { value: 'notExists', label: 'does not exist' },
];

/**
 * Field configurations for the query builder
 * Defines available operators and value types for each field
 */
export const FIELD_CONFIGS: Record<FilterFieldType, FieldConfig> = {
  space: {
    type: 'space',
    label: 'Space',
    operators: MULTI_SELECT_OPERATORS,
    valueType: 'select',
    placeholder: 'Select spaces...',
  },
  slug: {
    type: 'slug',
    label: 'Slug',
    operators: [
      ...MULTI_SELECT_OPERATORS,
      { value: 'contains', label: 'contains' },
      { value: 'startsWith', label: 'starts with' },
      { value: 'endsWith', label: 'ends with' },
    ],
    valueType: 'select',
    placeholder: 'Search slugs...',
  },
  toolchainType: {
    type: 'toolchainType',
    label: 'Toolchain',
    operators: MULTI_SELECT_OPERATORS,
    valueType: 'select',
    placeholder: 'Select toolchains...',
  },
  target: {
    type: 'target',
    label: 'Target',
    operators: MULTI_SELECT_OPERATORS,
    valueType: 'select',
    placeholder: 'Select targets...',
  },
  createdAt: {
    type: 'createdAt',
    label: 'Created',
    operators: DATE_OPERATORS,
    valueType: 'date',
    placeholder: 'Select date...',
  },
  updatedAt: {
    type: 'updatedAt',
    label: 'Updated',
    operators: DATE_OPERATORS,
    valueType: 'date',
    placeholder: 'Select date...',
  },
  unitId: {
    type: 'unitId',
    label: 'Unit ID',
    operators: SELECT_OPERATORS,
    valueType: 'text',
    placeholder: 'Enter unit ID...',
  },
  headRevisionNum: {
    type: 'headRevisionNum',
    label: 'Head Revision',
    operators: NUMBER_OPERATORS,
    valueType: 'number',
    placeholder: 'Enter number...',
  },
  lastReleasedRevisionNum: {
    type: 'lastReleasedRevisionNum',
    label: 'Last Released Revision',
    operators: NUMBER_OPERATORS,
    valueType: 'number',
    placeholder: 'Enter number...',
  },
  lastChangeDescription: {
    type: 'lastChangeDescription',
    label: 'Last Change',
    operators: STRING_OPERATORS,
    valueType: 'text',
    placeholder: 'Search description...',
  },
  where: {
    type: 'where',
    label: 'Where',
    operators: [{ value: 'raw', label: 'clause' }],
    valueType: 'raw',
    placeholder: "Slug LIKE '%prod%'",
  },
  whereData: {
    type: 'whereData',
    label: 'Where Data',
    operators: [{ value: 'raw', label: 'clause' }],
    valueType: 'raw',
    placeholder: 'spec.replicas > 1',
  },
  resourceType: {
    type: 'resourceType',
    label: 'Resource Type',
    operators: MULTI_SELECT_OPERATORS,
    valueType: 'select',
    placeholder: 'Select resource types...',
  },
  // Computed Unit fields (client-side only, do not generate WHERE clauses)
  upgradeNeeded: {
    type: 'upgradeNeeded',
    label: 'Upgrade Needed',
    operators: SELECT_OPERATORS,
    valueType: 'select',
    placeholder: 'Select status...',
    options: [
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
    computedField: true,
  },
  unreleasedChanges: {
    type: 'unreleasedChanges',
    label: 'Unreleased Changes',
    operators: SELECT_OPERATORS,
    valueType: 'select',
    placeholder: 'Select status...',
    options: [
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
    computedField: true,
  },
  validationErrorsCount: {
    type: 'validationErrorsCount',
    label: 'Validation Errors Count',
    operators: VALIDATION_ERRORS_COUNT_OPERATORS,
    valueType: 'number',
    placeholder: 'Enter count...',
    computedField: true,
  },
  checkResult: {
    type: 'checkResult',
    label: 'Check Result',
    operators: SELECT_OPERATORS,
    valueType: 'select',
    placeholder: 'Select result...',
    options: [
      { value: 'Pass', label: 'Pass' },
      { value: 'Fail', label: 'Fail' },
      { value: 'N/A', label: 'N/A' },
    ],
    computedField: true,
  },
  // Common entity fields
  labels: {
    type: 'labels',
    label: 'Labels',
    operators: LABEL_OPERATORS,
    valueType: 'labelKeyValue',
    placeholder: 'Select label...',
  },
  // BridgeWorker-specific fields
  condition: {
    type: 'condition',
    label: 'Condition',
    operators: MULTI_SELECT_OPERATORS,
    valueType: 'select',
    placeholder: 'Select conditions...',
    options: [
      { value: 'Ready', label: 'Ready' },
      { value: 'NotReady', label: 'Not Ready' },
      { value: 'Unresponsive', label: 'Unresponsive' },
      { value: 'Disconnected', label: 'Disconnected' },
    ],
  },
  lastSeenAt: {
    type: 'lastSeenAt',
    label: 'Last Seen',
    operators: DATE_OPERATORS,
    valueType: 'date',
    placeholder: 'Select date...',
  },
  bridgeWorkerId: {
    type: 'bridgeWorkerId',
    label: 'Worker ID',
    operators: SELECT_OPERATORS,
    valueType: 'text',
    placeholder: 'Enter worker ID...',
  },
  lastMessage: {
    type: 'lastMessage',
    label: 'Last Message',
    operators: STRING_OPERATORS,
    valueType: 'text',
    placeholder: 'Search messages...',
  },
  ipAddress: {
    type: 'ipAddress',
    label: 'IP Address',
    operators: STRING_OPERATORS,
    valueType: 'text',
    placeholder: 'Enter IP address...',
  },
  // Target-specific fields
  targetId: {
    type: 'targetId',
    label: 'Target ID',
    operators: SELECT_OPERATORS,
    valueType: 'text',
    placeholder: 'Enter target ID...',
  },
  // Trigger-specific fields
  event: {
    type: 'event',
    label: 'Event',
    operators: MULTI_SELECT_OPERATORS,
    valueType: 'select',
    placeholder: 'Select events...',
    options: [
      { value: 'Mutation', label: 'Mutation' },
      { value: 'PostClone', label: 'Post Clone' },
    ],
  },
  functionName: {
    type: 'functionName',
    label: 'Function',
    operators: STRING_OPERATORS,
    valueType: 'text',
    placeholder: 'Enter function name...',
  },
  disabled: {
    type: 'disabled',
    label: 'Disabled',
    operators: BOOLEAN_OPERATORS,
    valueType: 'select',
    placeholder: 'Select...',
    options: [
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
    ],
  },
  validating: {
    type: 'validating',
    label: 'Validating',
    operators: BOOLEAN_OPERATORS,
    valueType: 'select',
    placeholder: 'Select...',
    options: [
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
    ],
  },
  triggerId: {
    type: 'triggerId',
    label: 'Trigger ID',
    operators: SELECT_OPERATORS,
    valueType: 'text',
    placeholder: 'Enter trigger ID...',
  },
};

/**
 * Default toolchain types if none provided
 * Values from internal/models/workerapi/types.go
 */
export const DEFAULT_TOOLCHAIN_TYPES = [
  'Kubernetes/YAML',
  'ConfigHub/YAML',
  'AppConfig/Properties',
  'AppConfig/YAML',
  'AppConfig/TOML',
  'AppConfig/INI',
  'AppConfig/JSON',
  'AppConfig/Env',
  'AppConfig/Text',
];

/**
 * Fields available for Unit filtering (legacy - use getAvailableFieldsForEntity)
 */
export const AVAILABLE_FIELDS: FilterFieldType[] = [
  'space',
  'slug',
  'toolchainType',
  'resourceType',
  'target',
  'createdAt',
  'updatedAt',
  'unitId',
  'headRevisionNum',
  'lastReleasedRevisionNum',
  'lastChangeDescription',
  'where',
  'whereData',
];

/**
 * Entity-specific field mappings
 *
 * Fields are ordered consistently across entities:
 * 1. Common fields first (space, slug, labels, createdAt, updatedAt)
 * 2. Entity-specific fields
 * 3. Advanced/raw filters at the end (where, whereData)
 */
export const ENTITY_AVAILABLE_FIELDS: Record<EntityType, FilterFieldType[]> = {
  Unit: [
    // Common fields
    'space',
    'slug',
    'labels',
    'createdAt',
    'updatedAt',
    // Entity-specific fields
    'toolchainType',
    'resourceType',
    'target',
    'unitId',
    'headRevisionNum',
    'lastReleasedRevisionNum',
    'lastChangeDescription',
    // Computed fields (client-side only)
    'upgradeNeeded',
    'unreleasedChanges',
    'validationErrorsCount',
    // Advanced filters
    'where',
    'whereData',
  ],
  BridgeWorker: [
    // Common fields
    'space',
    'slug',
    'labels',
    'createdAt',
    'updatedAt',
    // Entity-specific fields
    'condition',
    'lastSeenAt',
    'bridgeWorkerId',
    'lastMessage',
    'ipAddress',
    // Advanced filters
    'where',
  ],
  Target: [
    // Common fields
    'space',
    'slug',
    'labels',
    'createdAt',
    'updatedAt',
    // Entity-specific fields
    'targetId',
    // Advanced filters
    'where',
  ],
  Space: [
    // Common fields (no 'space' since this IS a space)
    'slug',
    'labels',
    'createdAt',
    'updatedAt',
    // Advanced filters
    'where',
  ],
  Trigger: [
    // Common fields
    'space',
    'slug',
    'labels',
    'createdAt',
    'updatedAt',
    // Entity-specific fields
    'event',
    'functionName',
    'toolchainType',
    'disabled',
    'validating',
    'triggerId',
    // Advanced filters
    'where',
  ],
};

/**
 * Field descriptions for tooltips
 * Provides helpful context for each filter field
 */
export const FIELD_DESCRIPTIONS: Record<FilterFieldType, string> = {
  // Common fields
  space: 'Filter by the space the resource belongs to',
  slug: 'Filter by the unique identifier slug (e.g., my-deployment-v1)',
  createdAt: 'Filter by when the resource was created',
  updatedAt: 'Filter by when the resource was last modified',
  labels: 'Filter by label key-value pairs (e.g., env=production)',

  // Unit-specific fields
  toolchainType: 'Filter by the toolchain type (Kubernetes, Terraform, etc.)',
  target: 'Filter by the deployment target where units are deployed',
  unitId: 'Filter by the unique unit identifier',
  headRevisionNum: 'Filter by the latest revision number',
  lastReleasedRevisionNum: 'Filter by the most recently applied revision number',
  lastChangeDescription: 'Filter by the description of the most recent change',
  resourceType: 'Kubernetes resource type (required for WHERE DATA queries)',
  where: 'Query unit metadata using ConfigHub query syntax (Slug, SpaceID, Labels, etc.)',
  whereData:
    'Query unit content using JSONPath syntax (spec.replicas, metadata.name, etc.). Requires Resource Type.',

  // Computed Unit fields (client-side filtering only)
  upgradeNeeded: 'Filter by whether the unit needs an upgrade from its upstream unit',
  unreleasedChanges: 'Filter by whether the unit has unapplied changes (head > live revision)',
  validationErrorsCount: 'Filter by the number of validation errors configured for the unit',
  checkResult: 'Filter by compliance check result (Pass, Fail, or N/A)',

  // BridgeWorker-specific fields
  condition: 'Filter by bridge worker condition status',
  lastSeenAt: 'Filter by when the bridge worker was last active',
  bridgeWorkerId: 'Filter by the unique bridge worker identifier',
  lastMessage: 'Filter by the last message from the bridge worker',
  ipAddress: 'Filter by the IP address the bridge worker connected from',

  // Target-specific fields
  targetId: 'Filter by the unique target identifier',


  // Trigger-specific fields
  event: 'Filter by the trigger event type',
  functionName: 'Filter by the function name that the trigger invokes',
  disabled: 'Filter by whether the trigger is disabled',
  validating: 'Filter by whether the trigger is in validation state',
  triggerId: 'Filter by the unique trigger identifier',
};

/**
 * Get available fields for a specific entity type
 */
export const getAvailableFieldsForEntity = (
  entityType: EntityType = 'Unit',
): FilterFieldType[] => {
  return ENTITY_AVAILABLE_FIELDS[entityType] || AVAILABLE_FIELDS;
};

/**
 * Generate a unique ID for a filter condition
 */
export const generateFilterId = (): string => {
  return `filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

/**
 * Get default operator for a field type
 */
export const getDefaultOperator = (field: FilterFieldType): FilterOperator => {
  const config = FIELD_CONFIGS[field];
  // For text inputs, default to 'contains' if available (more intuitive for search)
  if (config.valueType === 'text') {
    const containsOp = config.operators.find((op) => op.value === 'contains');
    if (containsOp) {
      return 'contains';
    }
  }
  // For select inputs, default to 'in' if available (more flexible for multi-select)
  if (config.valueType === 'select') {
    const inOp = config.operators.find((op) => op.value === 'in');
    if (inOp) {
      return 'in';
    }
  }
  return config.operators[0]?.value || 'equals';
};
