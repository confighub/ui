// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Client-Side Filters
 *
 * Functions for filtering data client-side when server-side filtering is not possible.
 * Used for computed fields that require cross-field comparisons or derived computations.
 */

import { FIELD_CONFIGS } from './operators';
import type { FilterCondition, SelectOperator, NumberOperator } from './types';
import { assertNever } from './types';

/**
 * Apply client-side filtering for computed fields
 * Used for fields that are computed from unit data and cannot be filtered server-side
 *
 * @param units - Array of units to filter
 * @param conditions - All filter conditions (only computed fields will be applied)
 * @param createUnitRow - Function to compute unit row values (from data-grid-helpers)
 * @returns Filtered array of units
 *
 * ## Agent/API Equivalents for Computed Fields
 *
 * These filters are computed client-side from unit data. To achieve equivalent
 * filtering via the API, use these patterns:
 *
 * | UI Field              | API Equivalent (post-process after fetch)                        |
 * |-----------------------|------------------------------------------------------------------|
 * | upgradeNeeded: Yes    | `unit.UpstreamRevisionNum > 0 && unit.UpstreamRevisionNum > unit.HeadRevisionNum` |
 * | upgradeNeeded: No     | `unit.UpstreamRevisionNum === 0 || unit.UpstreamRevisionNum <= unit.HeadRevisionNum` |
 * | unreleasedChanges: Yes | `unit.TargetID != '' && unit.HeadRevisionNum > unit.LastReleasedRevisionNum` |
 * | unreleasedChanges: No  | `unit.TargetID == '' || unit.HeadRevisionNum <= unit.LastReleasedRevisionNum` |
 * | validationErrorsCount = N   | `(unit.ValidationErrors?.length || 0) === N`                          |
 * | lastActionStatus      | Query with include=UnitEventID, check `unit.Action?.ActionResult` |
 *
 * These cannot be filtered server-side as they require cross-field comparisons
 * or derived computations. Agents should fetch all units and filter locally.
 */
/** Extra context for client-side computed fields that depend on external data */
export interface ClientSideFilterContext {
  /** Map from UnitID to check result value (e.g. 'Pass', 'Fail', 'N/A') */
  checkResultByUnitId?: Map<string, string>;
}

export const applyClientSideFilters = <T extends { Unit?: { UnitID?: string } }>(
  units: T[],
  conditions: FilterCondition[],
  createUnitRow: (unit: T) => Record<string, unknown>,
  context?: ClientSideFilterContext,
): T[] => {
  // Extract computed field conditions that have a value selected
  // Skip conditions with empty values (filter just added, no value chosen yet)
  const computedConditions = conditions.filter(
    (condition) => FIELD_CONFIGS[condition.field]?.computedField && condition.value !== ''
  );

  // If no computed filters, return all units
  if (computedConditions.length === 0) {
    return units;
  }

  // Filter units based on computed conditions
  return units.filter((unit) => {
    // Compute values for this unit
    const row = createUnitRow(unit);

    // Check if unit matches all computed conditions
    return computedConditions.every((condition) => {
      // Map camelCase field names to PascalCase row field names
      const fieldNameMap: Record<string, string> = {
        upgradeNeeded: 'UpgradeNeeded',
        unreleasedChanges: 'UnreleasedChanges',
        validationErrorsCount: 'ValidationErrors',
      };

      const rowFieldName = fieldNameMap[condition.field] || condition.field;
      const fieldValue = row[rowFieldName];
      const filterValue = condition.value;
      const operator = condition.operator;

      // Handle different field types and operators
      switch (condition.field) {
        case 'checkResult': {
          const unitId = unit.Unit?.UnitID ?? '';
          const checkValue = context?.checkResultByUnitId?.get(unitId) ?? '';
          const selectOp = operator as SelectOperator;
          switch (selectOp) {
            case 'equals':
              return checkValue === filterValue;
            case 'notEquals':
              return checkValue !== filterValue;
            default:
              return assertNever(selectOp, 'Unhandled select operator');
          }
        }

        case 'upgradeNeeded':
        case 'unreleasedChanges': {
          // Select operators: equals, notEquals
          const selectOp = operator as SelectOperator;
          switch (selectOp) {
            case 'equals':
              return fieldValue === filterValue;
            case 'notEquals':
              return fieldValue !== filterValue;
            default:
              return assertNever(selectOp, `Unhandled select operator`);
          }
        }

        case 'validationErrorsCount': {
          // Number operators: equals, notEquals, greaterThan, lessThan, greaterOrEqual, lessOrEqual
          const numValue = typeof fieldValue === 'object' && fieldValue !== null
            ? Object.keys(fieldValue).length
            : Number(fieldValue) || 0;
          const numFilter = Number(filterValue) || 0;
          const numOp = operator as NumberOperator;

          switch (numOp) {
            case 'equals':
              return numValue === numFilter;
            case 'notEquals':
              return numValue !== numFilter;
            case 'greaterThan':
              return numValue > numFilter;
            case 'lessThan':
              return numValue < numFilter;
            case 'greaterOrEqual':
              return numValue >= numFilter;
            case 'lessOrEqual':
              return numValue <= numFilter;
            default:
              return assertNever(numOp, `Unhandled number operator`);
          }
        }

        default:
          // Non-computed fields are handled server-side
          return true;
      }
    });
  });
};
