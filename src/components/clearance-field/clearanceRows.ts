// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// A clearance is edited as a list of rows, one per requirement, the way the Trigger and Link
// drawers show it. These convert between the stored Clearance and the rows a form holds.

import type { Clearance, ClearanceRequirement } from '@confighub/rtk-query';

/** The operators a clearance requirement takes. In and NotIn compare against Values. */
export const CLEARANCE_OPERATORS = ['Exists', 'In', 'NotIn', 'DoesNotExist'] as const;
export type ClearanceOperator = (typeof CLEARANCE_OPERATORS)[number];

/** One clearance requirement as a form edits it: Values as one comma-separated string. */
export interface ClearanceRow {
  Key: string;
  Operator: ClearanceOperator;
  Values: string;
}

/** Whether an operator compares against values. */
export const operatorTakesValues = (operator: string | undefined): boolean =>
  operator === 'In' || operator === 'NotIn';

const isOperator = (value: string | undefined): value is ClearanceOperator =>
  (CLEARANCE_OPERATORS as readonly string[]).includes(value ?? '');

/** The rows for a stored clearance. */
export const clearanceToRows = (clearance: Clearance | undefined | null): ClearanceRow[] =>
  (clearance ?? []).map((requirement) => ({
    Key: requirement.Key || '',
    Operator: isOperator(requirement.Operator) ? requirement.Operator : 'Exists',
    Values: (requirement.Values ?? []).join(', '),
  }));

/** A clearance row as the API takes it, or undefined for a row with no key. */
export const clearanceRequirement = (row: ClearanceRow): ClearanceRequirement | undefined => {
  const key = row.Key.trim();
  if (!key) return undefined;
  const requirement: ClearanceRequirement = { Key: key, Operator: row.Operator };
  if (operatorTakesValues(row.Operator)) {
    requirement.Values = row.Values.split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return requirement;
};

/** The clearance the rows describe, leaving out rows with no key. */
export const rowsToClearance = (rows: ClearanceRow[] | undefined | null): Clearance =>
  (rows ?? []).map(clearanceRequirement).filter((r): r is ClearanceRequirement => !!r);
