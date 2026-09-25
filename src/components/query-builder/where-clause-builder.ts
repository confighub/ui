// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * WHERE Clause Builder
 *
 * Functions for building SQL-like WHERE clauses from FilterCondition objects.
 * This is the "write" path: UI filters → API query strings.
 */

import { FIELD_CONFIGS } from './operators';
import type { FilterCondition, FilterOperator } from './types';

/**
 * Map filter field names to API attribute names
 * Single source of truth - API_TO_FIELD_MAPPING is auto-generated from this
 */
export const FIELD_TO_API_MAPPING: Record<string, string> = {
  // Common fields
  space: 'SpaceID',
  slug: 'Slug',
  createdAt: 'CreatedAt',
  updatedAt: 'UpdatedAt',
  labels: 'Labels',
  // Unit-specific fields
  toolchainType: 'ToolchainType',
  target: 'TargetID',
  unitId: 'UnitID',
  headRevisionNum: 'HeadRevisionNum',
  lastReleasedRevisionNum: 'LastReleasedRevisionNum',
  lastChangeDescription: 'LastChangeDescription',
  // BridgeWorker-specific fields
  condition: 'Condition',
  lastSeenAt: 'LastSeenAt',
  bridgeWorkerId: 'BridgeWorkerID',
  lastMessage: 'LastMessage',
  ipAddress: 'IPAddress',
  // Target-specific fields
  providerType: 'ProviderType',
  targetId: 'TargetID',
  // Trigger-specific fields
  event: 'Event',
  functionName: 'FunctionName',
  disabled: 'Disabled',
  validating: 'Validating',
  triggerId: 'TriggerID',
};

/** Fields that use numeric values (no quotes in WHERE clause) */
const NUMERIC_FIELDS = new Set(['headRevisionNum', 'lastReleasedRevisionNum']);

/** Fields that use boolean values (no quotes in WHERE clause) */
const BOOLEAN_FIELDS = new Set(['disabled', 'validating']);

/**
 * Escape a string value for use in a WHERE clause.
 * Escapes single quotes for SQL string literals.
 */
const escapeValue = (value: string): string => {
  return value.replace(/'/g, "''");
};

/**
 * Escape a string value for use in ILIKE patterns.
 * Escapes single quotes AND SQL ILIKE wildcards (% and _).
 */
const escapeIlikeValue = (value: string): string => {
  return value
    .replace(/'/g, "''")
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
};

/**
 * Validate that a value contains only safe characters for use as a field name.
 * Prevents injection via dynamic field names (e.g., label keys).
 */
const isValidFieldName = (value: string): boolean => {
  return /^[a-zA-Z0-9_.-]+$/.test(value);
};

/**
 * Patterns that are suspicious in raw WHERE clauses.
 * These patterns indicate potential SQL injection attempts or dangerous operations.
 *
 * IMPORTANT: This is NOT a security boundary - detection here is for developer
 * awareness only. The backend MUST perform proper validation.
 */
const SUSPICIOUS_SQL_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // Statement terminators (could allow multiple statements)
  { pattern: /;/g, description: 'semicolon (statement terminator)' },
  // SQL comments (could hide malicious code)
  { pattern: /--/g, description: 'SQL comment (--)' },
  { pattern: /\/\*/g, description: 'block comment start (/*)' },
  // Dangerous DDL/DML operations
  { pattern: /\bDROP\b/gi, description: 'DROP statement' },
  { pattern: /\bDELETE\b/gi, description: 'DELETE statement' },
  { pattern: /\bINSERT\b/gi, description: 'INSERT statement' },
  { pattern: /\bUPDATE\b/gi, description: 'UPDATE statement' },
  { pattern: /\bALTER\b/gi, description: 'ALTER statement' },
  { pattern: /\bTRUNCATE\b/gi, description: 'TRUNCATE statement' },
  { pattern: /\bCREATE\b/gi, description: 'CREATE statement' },
  // Command execution
  { pattern: /\bEXEC\b/gi, description: 'EXEC/EXECUTE command' },
  { pattern: /\bEXECUTE\b/gi, description: 'EXECUTE command' },
  { pattern: /\bxp_/gi, description: 'extended stored procedure (xp_)' },
  { pattern: /\bsp_/gi, description: 'stored procedure (sp_)' },
  // Union-based injection
  { pattern: /\bUNION\b/gi, description: 'UNION (possible injection)' },
  // Information schema access
  { pattern: /\binformation_schema\b/gi, description: 'information_schema access' },
  { pattern: /\bpg_/gi, description: 'PostgreSQL system table access (pg_)' },
  { pattern: /\bsys\./gi, description: 'system table access (sys.)' },
];

/**
 * Check a raw WHERE clause for suspicious patterns and log warnings.
 * This is defense-in-depth only - the backend remains the security boundary.
 *
 * @param value - The raw WHERE clause to check
 * @returns Array of detected suspicious patterns (empty if clean)
 */
const detectSuspiciousPatterns = (value: string): string[] => {
  const detected: string[] = [];

  for (const { pattern, description } of SUSPICIOUS_SQL_PATTERNS) {
    if (pattern.test(value)) {
      detected.push(description);
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
    }
  }

  return detected;
};

/**
 * Sanitize raw WHERE clause input.
 *
 * ## CRITICAL SECURITY NOTICE
 *
 * **This function is NOT a security boundary.** Frontend sanitization cannot
 * prevent SQL injection attacks because:
 *
 * 1. Attackers can bypass the frontend entirely (curl, Postman, scripts)
 * 2. Client-side code can be modified by malicious users
 * 3. Network interception can modify requests after frontend validation
 *
 * ## Backend Requirements
 *
 * The backend MUST implement these protections:
 *
 * 1. **Parameterized Queries**: NEVER concatenate user input into SQL strings.
 *    Use prepared statements with parameter binding for all user-provided values.
 *
 * 2. **Allowlist Validation**: Validate that:
 *    - Field names match an allowlist of queryable fields
 *    - Operators are from a known set (=, !=, <, >, LIKE, etc.)
 *    - Data types match expected patterns (dates, numbers, etc.)
 *
 * 3. **Query Structure Validation**: For raw WHERE clauses:
 *    - Parse the SQL to ensure it's a valid WHERE expression
 *    - Reject queries with multiple statements, subqueries, or dangerous keywords
 *    - Consider using a SQL parser library rather than regex
 *
 * 4. **Least Privilege**: Database connections should use accounts with
 *    minimal permissions (SELECT only on specific tables/views).
 *
 * ## What This Function Does
 *
 * This function provides **defense-in-depth** only:
 * - Trims whitespace and limits length to prevent DoS
 * - Logs warnings in development for suspicious patterns
 * - Does NOT block any input (that's the backend's job)
 *
 * The suspicious pattern detection alerts developers during testing but
 * must not be relied upon for security.
 *
 * @param value - The raw WHERE clause input from the user
 * @returns The trimmed and length-limited value (unchanged content)
 */
const sanitizeRawWhereClause = (value: string): string => {
  // Log a warning for raw WHERE clauses - these should be audited
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[QueryBuilder] Raw WHERE clause used - ensure backend validates:',
      value.slice(0, 100)
    );

    // Check for suspicious patterns and log detailed warnings
    const suspiciousPatterns = detectSuspiciousPatterns(value);
    if (suspiciousPatterns.length > 0) {
      console.warn(
        '[QueryBuilder] SUSPICIOUS PATTERNS DETECTED in raw WHERE clause:',
        suspiciousPatterns.join(', '),
        '\nThis may indicate an injection attempt. Backend MUST validate this input.',
        '\nValue preview:', value.slice(0, 200)
      );
    }
  }

  // Basic sanitization: trim whitespace, limit length
  // NOTE: We intentionally do NOT block suspicious patterns here.
  // The backend is the security boundary - we only log for awareness.
  const trimmed = value.trim();
  if (trimmed.length > 10000) {
    console.warn('[QueryBuilder] Raw WHERE clause truncated (exceeded 10000 chars)');
    return trimmed.slice(0, 10000);
  }
  return trimmed;
};

/**
 * Convert a single filter condition to a WHERE clause fragment
 */
const conditionToWhereFragment = (condition: FilterCondition): string | null => {
  const { field, operator, value, labelKey } = condition;

  // Handle labels field specially - it uses key-value structure
  if (field === 'labels') {
    if (!labelKey) {
      return null; // No key selected
    }

    // Validate label key against the server-side allowlist.
    // Server regex: ^[A-Za-z0-9]([\-_\./A-Za-z0-9]*[A-Za-z0-9])?
    // The frontend isValidFieldName covers the same safe character set.
    // Single quotes are NOT valid in label key names — reject them so we
    // never produce syntactically invalid SQL like `Labels.key''name`.
    const trimmedKey = labelKey.trim();
    if (!isValidFieldName(trimmedKey)) {
      console.warn('[QueryBuilder] Invalid label key rejected:', trimmedKey.slice(0, 50));
      return null;
    }

    // Handle exists/notExists operators (no value needed)
    if (operator === 'exists') {
      return `Labels.${trimmedKey} IS NOT NULL`;
    }
    if (operator === 'notExists') {
      return `Labels.${trimmedKey} IS NULL`;
    }

    // Other operators require a value
    if (!value || value.trim() === '') {
      return null;
    }

    const escapedValue = escapeValue(value.trim());

    switch (operator) {
      case 'equals':
        return `Labels.${trimmedKey} = '${escapedValue}'`;
      case 'notEquals':
        return `Labels.${trimmedKey} != '${escapedValue}'`;
      case 'contains':
        // Use ILIKE-specific escaping for pattern matching
        return `Labels.${trimmedKey} ILIKE '%${escapeIlikeValue(value.trim())}%'`;
      default:
        return null;
    }
  }

  if (!value || value.trim() === '') {
    return null;
  }

  const escapedValue = escapeValue(value.trim());

  // Handle raw WHERE/WHERE DATA clauses
  // WARNING: These pass user input to the API - backend MUST validate
  if (field === 'where' || field === 'whereData') {
    return sanitizeRawWhereClause(value);
  }

  const apiField = FIELD_TO_API_MAPPING[field];
  if (!apiField) {
    return null;
  }

  const isNumeric = NUMERIC_FIELDS.has(field);
  const isBoolean = BOOLEAN_FIELDS.has(field);

  // For ILIKE patterns, we need to escape wildcards in the original value
  const ilikeEscapedValue = escapeIlikeValue(value.trim());

  // Raw value for IN clauses - we need to escape each value individually
  const rawValue = value.trim();

  // Helper to build IN clause from comma-separated values
  // Note: This receives the RAW value (not pre-escaped) and escapes each part individually
  const buildInClause = (f: string, _v: string, negate: boolean): string => {
    const values = rawValue.split(',').map((val) => {
      const trimmed = val.trim();
      return (isNumeric || isBoolean) ? trimmed : `'${escapeValue(trimmed)}'`;
    }).filter((val) => val !== '' && val !== "''");

    if (values.length === 0) {
      return '';
    }
    // Single value: use simple equality
    if (values.length === 1) {
      return negate
        ? `${f} != ${values[0]}`
        : `${f} = ${values[0]}`;
    }
    // Multiple values: use IN clause
    return negate
      ? `${f} NOT IN (${values.join(', ')})`
      : `${f} IN (${values.join(', ')})`;
  };

  // Generate SQL-like clause based on operator
  const operatorMapping: Record<FilterOperator, (f: string, v: string) => string> = {
    // String/select operators
    equals: (f, v) => (isNumeric || isBoolean) ? `${f} = ${v}` : `${f} = '${v}'`,
    notEquals: (f, v) => (isNumeric || isBoolean) ? `${f} != ${v}` : `${f} != '${v}'`,
    contains: (f) => `${f} ILIKE '%${ilikeEscapedValue}%'`,
    startsWith: (f) => `${f} ILIKE '${ilikeEscapedValue}%'`,
    endsWith: (f) => `${f} ILIKE '%${ilikeEscapedValue}'`,
    // IN operators (multi-select)
    in: (f, v) => buildInClause(f, v, false),
    notIn: (f, v) => buildInClause(f, v, true),
    // Date operators
    before: (f, v) => `${f} < '${v}'`,
    after: (f, v) => `${f} > '${v}'`,
    onOrBefore: (f, v) => `${f} <= '${v}'`,
    onOrAfter: (f, v) => `${f} >= '${v}'`,
    // Number operators
    greaterThan: (f, v) => `${f} > ${v}`,
    lessThan: (f, v) => `${f} < ${v}`,
    greaterOrEqual: (f, v) => `${f} >= ${v}`,
    lessOrEqual: (f, v) => `${f} <= ${v}`,
    // Existence operators (used for labels)
    exists: (f) => `${f} IS NOT NULL`,
    notExists: (f) => `${f} IS NULL`,
    // Raw
    raw: (_, v) => v,
  };

  const generator = operatorMapping[operator];
  if (!generator) {
    return null;
  }

  return generator(apiField, escapedValue);
};

/**
 * Result of building WHERE clauses from filters
 */
export interface WhereClauseResult {
  /** Combined WHERE clause for metadata filtering */
  where: string;
  /** WHERE DATA clause for content filtering (if present) */
  whereData: string;
  /** Resource type for whereData queries (required by API when whereData is used) */
  resourceType: string;
}

/**
 * Build WHERE clause strings from an array of filter conditions
 * Combines all conditions with AND logic
 */
export const buildWhereClauses = (conditions: FilterCondition[]): WhereClauseResult => {
  const whereFragments: string[] = [];
  const whereDataFragments: string[] = [];
  let resourceType = '';

  for (const condition of conditions) {
    // Skip computed fields - they are filtered client-side only
    const fieldConfig = FIELD_CONFIGS[condition.field];
    if (fieldConfig?.computedField) {
      continue;
    }

    // Extract resourceType separately (not part of WHERE clause)
    // Skip if no value is set
    if (condition.field === 'resourceType') {
      if (condition.value) {
        resourceType = condition.value;
      }
      continue;
    }

    // Skip whereData conditions with no value
    if (condition.field === 'whereData' && !condition.value?.trim()) {
      continue;
    }

    const fragment = conditionToWhereFragment(condition);
    if (fragment) {
      if (condition.field === 'whereData') {
        whereDataFragments.push(fragment);
      } else {
        whereFragments.push(fragment);
      }
    }
  }

  return {
    where: whereFragments.join(' AND '),
    whereData: whereDataFragments.join(' AND '),
    resourceType,
  };
};

/**
 * Format a date value for the API (ISO format)
 */
export const formatDateForApi = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Parse a date string from the API
 */
export const parseDateFromApi = (dateString: string): Date | null => {
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};
