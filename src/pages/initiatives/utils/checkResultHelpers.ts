// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedUnitRead, FunctionInvocationsResponse } from '@confighub/rtk-query';
import type { PolicyViolation, UnitCheckResult } from '@/types/initiative';
import { BASE_COLUMNS, buildIncludeParameter, buildSelectParameter } from '@/utility/column-delta-functions';
import type { BaseColumnKeys } from '@/utility/column-delta-functions';
import { decodeBase64 } from '@/utility/string-functions';

/** Default column visibility for initiative views. */
export const INITIATIVE_COLUMNS: Record<string, boolean> = { ...BASE_COLUMNS, TestResult: true, ValidationErrors: false, 'Labels.Team': true, 'Labels.App': true };

/** Visible column keys for initiative views, used to compute include/select API params */
const INITIATIVE_VISIBLE_COLUMNS = Object.entries(INITIATIVE_COLUMNS)
  .filter(([, visible]) => visible)
  .map(([key]) => key) as BaseColumnKeys[];

/** Pre-computed include parameter for initiative unit queries */
export const INITIATIVE_INCLUDE = buildIncludeParameter(INITIATIVE_VISIBLE_COLUMNS);

/** Pre-computed select parameter for initiative unit queries.
 *  ValidationErrors is always fetched even though the column is hidden — needed for
 *  validationErrorsCount client-side filtering via the query builder. */
export const INITIATIVE_SELECT = buildSelectParameter([
  ...INITIATIVE_VISIBLE_COLUMNS,
  'ValidationErrors' as BaseColumnKeys,
]);

interface ValidationResultEntry {
  Passed?: boolean;
  Details?: string[];
  FailedAttributes?: Array<{
    ResourceName?: string;
    ResourceNameWithoutScope?: string;
    ResourceType?: string;
    Issues?: Array<{
      Identifier?: string;
      Message?: string;
    }>;
  }>;
}

function parseValidationResults(outputs: FunctionInvocationsResponse['Outputs']): ValidationResultEntry[] | null {
  const raw = outputs?.['ValidationResult'] ?? outputs?.['ValidationResultList'];
  if (!raw) return null;
  try {
    const decoded = decodeBase64(raw);
    if (!decoded) return null;
    const results = JSON.parse(decoded) as ValidationResultEntry[];
    return Array.isArray(results) ? results : null;
  } catch {
    return null;
  }
}

function extractViolations(results: ValidationResultEntry[]): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const entry of results) {
    for (const attr of entry.FailedAttributes ?? []) {
      for (const issue of attr.Issues ?? []) {
        const rule = issue.Identifier?.split('/').pop() ?? 'unknown';
        const msg = issue.Message ?? '';
        // Extract path from message if present (Kyverno format: "... at path /some/path/")
        const pathMatch = msg.match(/at path (\/\S+)/);
        violations.push({
          resourceName: attr.ResourceNameWithoutScope ?? attr.ResourceName ?? 'unknown',
          resourceType: attr.ResourceType?.split('/').pop() ?? '',
          rule,
          message: msg.replace(/\s*rule \S+ failed at path \/\S+\/?/, '').trim(),
          path: pathMatch?.[1],
        });
      }
    }
  }
  return violations;
}

/**
 * Checks whether the validation output from a function invocation indicates all checks passed.
 * The Outputs map contains base64-encoded JSON keyed by output type. For validating functions
 * like vet-kyverno, the result is under "ValidationResult" or "ValidationResultList" and
 * contains an array of objects with a "Passed" boolean.
 */
export function didValidationPass(
  outputs: FunctionInvocationsResponse['Outputs'],
): boolean | undefined {
  const results = parseValidationResults(outputs);
  if (!results || results.length === 0) return undefined;
  return results.every((r) => r.Passed === true);
}

/**
 * Converts raw FunctionInvocationsResponse[] into UnitCheckResult[]
 * keyed by UnitID.
 *
 * A unit is considered "passing" only when:
 *  1. The function executed without errors (Success === true), AND
 *  2. The validation output (if present) reports Passed === true for every result entry.
 */
export interface GroupedCheckResults {
  failing: ExtendedUnitRead[];
  passing: ExtendedUnitRead[];
  notApplicable: ExtendedUnitRead[];
}

export function groupCheckResults(
  units: ExtendedUnitRead[],
  checkResults: UnitCheckResult[],
): GroupedCheckResults {
  const resultMap = new Map<string, UnitCheckResult>(
    checkResults.map((r) => [r.unitId, r]),
  );
  const failing: ExtendedUnitRead[] = [];
  const passing: ExtendedUnitRead[] = [];
  const notApplicable: ExtendedUnitRead[] = [];
  for (const unit of units) {
    const result = resultMap.get(unit.Unit?.UnitID ?? '');
    if (!result || result.notApplicable) {
      notApplicable.push(unit);
    } else if (result.success) {
      passing.push(unit);
    } else {
      failing.push(unit);
    }
  }
  return { failing, passing, notApplicable };
}

export function toUnitCheckResults(responses: FunctionInvocationsResponse[]): UnitCheckResult[] {
  return responses.map((r) => {
    // 422 Unprocessable means the unit had no config data to validate — not a policy failure
    if (r.Error?.Status === 422) {
      return { unitId: r.UnitID ?? 'unknown', success: false, notApplicable: true, message: r.Error.Message };
    }

    const execSuccess = r.Success ?? false;
    const validationPassed = didValidationPass(r.Outputs);
    const success = execSuccess && (validationPassed ?? false);

    let message = r.Error?.Message;
    if (execSuccess && validationPassed === false && !message) {
      message = 'Kyverno policy validation failed';
    }

    let details = r.Error?.Details;
    let violations: PolicyViolation[] | undefined;

    const parsedResults = parseValidationResults(r.Outputs);
    if (parsedResults) {
      if (!details && validationPassed === false) {
        const allDetails = parsedResults.flatMap((vr) => vr.Details ?? []);
        if (allDetails.length > 0) details = allDetails;
      }
      const extracted = extractViolations(parsedResults);
      if (extracted.length > 0) violations = extracted;
    }

    return { unitId: r.UnitID ?? 'unknown', success, message, details, violations };
  });
}
