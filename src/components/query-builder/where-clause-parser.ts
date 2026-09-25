// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * WHERE Clause Parser
 *
 * Functions for parsing SQL-like WHERE clauses back into FilterCondition objects.
 * This is the "read" path: API query strings → UI filters.
 */

import type { FilterCondition, FilterFieldType } from './types';
import { FIELD_TO_API_MAPPING } from './where-clause-builder';

/**
 * Reverse mapping from API attribute names to filter field types (multi-value).
 * Some API fields map to multiple filter fields (e.g., TargetID → 'target' and 'targetId').
 * The correct field is resolved at parse time using available fields for the entity type.
 */
const API_TO_FIELDS_MAPPING: Record<string, FilterFieldType[]> = {};
for (const [field, api] of Object.entries(FIELD_TO_API_MAPPING)) {
  if (!API_TO_FIELDS_MAPPING[api]) {
    API_TO_FIELDS_MAPPING[api] = [];
  }
  API_TO_FIELDS_MAPPING[api].push(field as FilterFieldType);
}

/**
 * Resolve an API field name to the correct filter field type.
 * When multiple fields map to the same API name (e.g., 'target' and 'targetId' both
 * map to 'TargetID'), uses availableFields to pick the correct one for the entity type.
 */
const resolveField = (apiField: string, availableFields?: FilterFieldType[]): FilterFieldType | undefined => {
  const candidates = API_TO_FIELDS_MAPPING[apiField];
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  // Multiple candidates — pick the one available for this entity type
  if (availableFields) {
    const match = candidates.find(f => availableFields.includes(f));
    if (match) return match;
  }
  return candidates[0];
};

/**
 * Parse a label filter fragment (Labels.Key OPERATOR value)
 * Returns null if not a label filter
 */
const parseLabelFragment = (
  fragment: string,
  generateId: () => string
): FilterCondition | null => {
  const trimmed = fragment.trim();

  // Label key pattern: alphanumeric, underscore, dot, hyphen, and forward slash
  // This supports keys like "env", "app.kubernetes.io/name", "team-owner"
  const labelKeyPattern = '[a-zA-Z0-9_./-]+';

  // Match Labels.Key = 'value'
  const equalsMatch = trimmed.match(new RegExp(`^Labels\\.(${labelKeyPattern})\\s*=\\s*'([^']*(?:''[^']*)*)'`, 'i'));
  if (equalsMatch) {
    const [, labelKey, value] = equalsMatch;
    return {
      id: generateId(),
      field: 'labels',
      operator: 'equals',
      value: value.replace(/''/g, "'"),
      labelKey,
    };
  }

  // Match Labels.Key != 'value'
  const notEqualsMatch = trimmed.match(new RegExp(`^Labels\\.(${labelKeyPattern})\\s*!=\\s*'([^']*(?:''[^']*)*)'`, 'i'));
  if (notEqualsMatch) {
    const [, labelKey, value] = notEqualsMatch;
    return {
      id: generateId(),
      field: 'labels',
      operator: 'notEquals',
      value: value.replace(/''/g, "'"),
      labelKey,
    };
  }

  // Match Labels.Key ILIKE '%value%' (contains)
  const containsMatch = trimmed.match(new RegExp(`^Labels\\.(${labelKeyPattern})\\s+ILIKE\\s+'%([^']*(?:''[^']*)*)%'`, 'i'));
  if (containsMatch) {
    const [, labelKey, value] = containsMatch;
    return {
      id: generateId(),
      field: 'labels',
      operator: 'contains',
      value: value.replace(/''/g, "'"),
      labelKey,
    };
  }

  // Match Labels.Key IS NOT NULL (exists)
  const existsMatch = trimmed.match(new RegExp(`^Labels\\.(${labelKeyPattern})\\s+IS\\s+NOT\\s+NULL$`, 'i'));
  if (existsMatch) {
    const [, labelKey] = existsMatch;
    return {
      id: generateId(),
      field: 'labels',
      operator: 'exists',
      value: '',
      labelKey,
    };
  }

  // Match Labels.Key IS NULL (notExists)
  const notExistsMatch = trimmed.match(new RegExp(`^Labels\\.(${labelKeyPattern})\\s+IS\\s+NULL$`, 'i'));
  if (notExistsMatch) {
    const [, labelKey] = notExistsMatch;
    return {
      id: generateId(),
      field: 'labels',
      operator: 'notExists',
      value: '',
      labelKey,
    };
  }

  return null;
};

/**
 * Parse comma-separated quoted values from an IN clause
 * e.g., ('value1', 'value2', 'value3') -> ['value1', 'value2', 'value3']
 */
const parseInClauseValues = (valueList: string): string[] => {
  const values: string[] = [];
  // Match 'value' patterns, handling escaped quotes ('')
  const regex = /'([^']*(?:''[^']*)*)'/g;
  let match;
  while ((match = regex.exec(valueList)) !== null) {
    values.push(match[1].replace(/''/g, "'"));
  }
  return values;
};

/**
 * Parse a single WHERE clause fragment into a filter condition
 * Returns null if the fragment cannot be parsed
 */
const parseWhereFragment = (
  fragment: string,
  generateId: () => string,
  availableFields?: FilterFieldType[]
): FilterCondition | null => {
  const trimmed = fragment.trim();
  if (!trimmed) return null;

  // Try label filters first (Labels.Key format)
  const labelCondition = parseLabelFragment(trimmed, generateId);
  if (labelCondition) {
    return labelCondition;
  }

  // Try IN clause: Field IN ('value1', 'value2', ...)
  const inMatch = trimmed.match(/^(\w+)\s+IN\s*\(([^)]+)\)/i);
  if (inMatch) {
    const [, apiField, valueList] = inMatch;
    const field = resolveField(apiField, availableFields);
    const values = parseInClauseValues(valueList);
    if (field && values.length > 0) {
      return {
        id: generateId(),
        field,
        operator: 'in',
        value: values.join(','),
      };
    }
  }

  // Try NOT IN clause: Field NOT IN ('value1', 'value2', ...)
  const notInMatch = trimmed.match(/^(\w+)\s+NOT\s+IN\s*\(([^)]+)\)/i);
  if (notInMatch) {
    const [, apiField, valueList] = notInMatch;
    const field = resolveField(apiField, availableFields);
    const values = parseInClauseValues(valueList);
    if (field && values.length > 0) {
      return {
        id: generateId(),
        field,
        operator: 'notIn',
        value: values.join(','),
      };
    }
  }

  // Try to match patterns like: FieldName OPERATOR 'value'
  // Patterns:
  //   Field = 'value'
  //   Field != 'value'
  //   Field ILIKE '%value%' (contains)
  //   Field ILIKE 'value%' (startsWith)
  //   Field ILIKE '%value' (endsWith)
  //   Field < 'value' (before)
  //   Field > 'value' (after)
  //   Field <= 'value' (onOrBefore)
  //   Field >= 'value' (onOrAfter)

  // Match equals: Field = 'value'
  const equalsMatch = trimmed.match(/^(\w+)\s*=\s*'([^']*(?:''[^']*)*)'/i);
  if (equalsMatch) {
    const [, apiField, value] = equalsMatch;
    const field = resolveField(apiField, availableFields);
    if (field) {
      return {
        id: generateId(),
        field,
        operator: 'equals',
        value: value.replace(/''/g, "'"),
      };
    }
  }

  // Match not equals: Field != 'value'
  const notEqualsMatch = trimmed.match(/^(\w+)\s*!=\s*'([^']*(?:''[^']*)*)'/i);
  if (notEqualsMatch) {
    const [, apiField, value] = notEqualsMatch;
    const field = resolveField(apiField, availableFields);
    if (field) {
      return {
        id: generateId(),
        field,
        operator: 'notEquals',
        value: value.replace(/''/g, "'"),
      };
    }
  }

  // Match contains: Field ILIKE '%value%'
  const containsMatch = trimmed.match(/^(\w+)\s+ILIKE\s+'%([^']*(?:''[^']*)*)%'/i);
  if (containsMatch) {
    const [, apiField, value] = containsMatch;
    const field = resolveField(apiField, availableFields);
    if (field) {
      return {
        id: generateId(),
        field,
        operator: 'contains',
        value: value.replace(/''/g, "'"),
      };
    }
  }

  // Match startsWith: Field ILIKE 'value%' (but not '%value%')
  const startsWithMatch = trimmed.match(/^(\w+)\s+ILIKE\s+'([^'%][^']*(?:''[^']*)*)%'/i);
  if (startsWithMatch) {
    const [, apiField, value] = startsWithMatch;
    const field = resolveField(apiField, availableFields);
    if (field) {
      return {
        id: generateId(),
        field,
        operator: 'startsWith',
        value: value.replace(/''/g, "'"),
      };
    }
  }

  // Match endsWith: Field ILIKE '%value' (but not '%value%')
  const endsWithMatch = trimmed.match(/^(\w+)\s+ILIKE\s+'%([^']*(?:''[^']*)*[^'%])'/i);
  if (endsWithMatch) {
    const [, apiField, value] = endsWithMatch;
    const field = resolveField(apiField, availableFields);
    if (field) {
      return {
        id: generateId(),
        field,
        operator: 'endsWith',
        value: value.replace(/''/g, "'"),
      };
    }
  }

  // Match less than (before): Field < 'value'
  const beforeMatch = trimmed.match(/^(\w+)\s*<\s*'([^']*(?:''[^']*)*)'/i);
  if (beforeMatch) {
    const [, apiField, value] = beforeMatch;
    const field = resolveField(apiField, availableFields);
    if (field) {
      return {
        id: generateId(),
        field,
        operator: 'before',
        value: value.replace(/''/g, "'"),
      };
    }
  }

  // Match greater than (after): Field > 'value'
  const afterMatch = trimmed.match(/^(\w+)\s*>\s*'([^']*(?:''[^']*)*)'/i);
  if (afterMatch) {
    const [, apiField, value] = afterMatch;
    const field = resolveField(apiField, availableFields);
    if (field) {
      return {
        id: generateId(),
        field,
        operator: 'after',
        value: value.replace(/''/g, "'"),
      };
    }
  }

  // Match less than or equal (onOrBefore): Field <= 'value'
  const onOrBeforeMatch = trimmed.match(/^(\w+)\s*<=\s*'([^']*(?:''[^']*)*)'/i);
  if (onOrBeforeMatch) {
    const [, apiField, value] = onOrBeforeMatch;
    const field = resolveField(apiField, availableFields);
    if (field) {
      return {
        id: generateId(),
        field,
        operator: 'onOrBefore',
        value: value.replace(/''/g, "'"),
      };
    }
  }

  // Match greater than or equal (onOrAfter): Field >= 'value'
  const onOrAfterMatch = trimmed.match(/^(\w+)\s*>=\s*'([^']*(?:''[^']*)*)'/i);
  if (onOrAfterMatch) {
    const [, apiField, value] = onOrAfterMatch;
    const field = resolveField(apiField, availableFields);
    if (field) {
      return {
        id: generateId(),
        field,
        operator: 'onOrAfter',
        value: value.replace(/''/g, "'"),
      };
    }
  }

  // Could not parse - return null (caller will handle as raw)
  return null;
};

/**
 * Split a WHERE clause string by AND, respecting quoted strings
 */
const splitByAnd = (whereClause: string): string[] => {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let i = 0;

  while (i < whereClause.length) {
    const char = whereClause[i];

    if (char === "'" && !inQuote) {
      inQuote = true;
      current += char;
      i++;
    } else if (char === "'" && inQuote) {
      // Check for escaped quote ('')
      if (whereClause[i + 1] === "'") {
        current += "''";
        i += 2;
      } else {
        inQuote = false;
        current += char;
        i++;
      }
    } else if (!inQuote && whereClause.slice(i, i + 5).toUpperCase() === ' AND ') {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      i += 5;
    } else {
      current += char;
      i++;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
};

/**
 * Parse WHERE clause strings back into FilterCondition[] objects
 *
 * @param whereClause - The WHERE clause string (e.g., "Slug ILIKE '%prod%' AND SpaceID = 'abc'")
 * @param whereDataClause - The WHERE DATA clause string for content filtering
 * @param spaceId - Space ID from URL params (may be separate from WHERE clause)
 * @param spaces - Available spaces for lookup (needed to validate space IDs)
 * @returns Array of FilterCondition objects
 */
export const parseWhereClausesToFilters = (
  whereClause: string,
  whereDataClause: string,
  spaceId: string,
  _spaces: Array<{ id: string; name: string }>,
  generateId: () => string = () => `filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  availableFields?: FilterFieldType[]
): FilterCondition[] => {
  const conditions: FilterCondition[] = [];
  const parsedFragments = new Set<string>();

  // Parse WHERE clause
  if (whereClause.trim()) {
    const fragments = splitByAnd(whereClause);

    for (const fragment of fragments) {
      const condition = parseWhereFragment(fragment, generateId, availableFields);
      if (condition) {
        conditions.push(condition);
        parsedFragments.add(fragment);
      }
    }

    // Any fragments we couldn't parse become raw WHERE conditions
    const unparsedFragments = fragments.filter(f => !parsedFragments.has(f));
    if (unparsedFragments.length > 0) {
      conditions.push({
        id: generateId(),
        field: 'where',
        operator: 'raw',
        value: unparsedFragments.join(' AND '),
      });
    }
  }

  // Handle separate spaceId parameter (if not already in WHERE clause)
  if (spaceId && !conditions.some(c => c.field === 'space')) {
    // Always add the space filter if we have a spaceId
    // The space might not be in our cached list but still be valid
    conditions.push({
      id: generateId(),
      field: 'space',
      operator: 'equals',
      value: spaceId,
    });
  }

  // Parse WHERE DATA clause
  if (whereDataClause.trim()) {
    conditions.push({
      id: generateId(),
      field: 'whereData',
      operator: 'raw',
      value: whereDataClause.trim(),
    });
  }

  return conditions;
};
