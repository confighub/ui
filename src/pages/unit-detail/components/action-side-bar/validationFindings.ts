// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Issue, ValidationResult } from '@confighub/rtk-query';

/** A failed check that names one field of the Unit's configuration. */
export interface FieldFinding {
  key: string;
  resourceType?: string;
  resourceName?: string;
  path?: string;
  score?: string;
  messages: string[];
  /** What the function found at the path, as text, when it reported it. */
  value?: string;
}

/** A failed check that names no field: it is about the Unit as a whole. */
export interface UnitFinding {
  key: string;
  functionName?: string;
  score?: string;
  messages: string[];
}

export interface ValidationFindings {
  fields: FieldFinding[];
  unit: UnitFinding[];
}

const issueMessages = (issues: Issue[] | undefined): string[] =>
  (issues ?? []).map((issue) => issue.Message ?? '').filter((message) => message !== '');

const MAX_VALUE_LENGTH = 200;

/** Renders a value a function reported as one line of text, shortened if long. */
export const formatFoundValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
};

/**
 * Splits a gate's failed results into the fields they name and the checks that name none.
 *
 * A failed attribute's own issues say what is wrong with it. A result's own issues and details
 * are about the result as a whole, so they are listed once, as a Unit finding, rather than
 * repeated on each field.
 */
export const validationFindings = (
  results: ValidationResult[] | undefined,
): ValidationFindings => {
  const findings: ValidationFindings = { fields: [], unit: [] };
  (results ?? []).forEach((result, resultIndex) => {
    if (result.Passed) {
      return;
    }
    (result.FailedAttributes ?? []).forEach((attribute, attributeIndex) => {
      findings.fields.push({
        key: `${resultIndex}/${attributeIndex}`,
        resourceType: attribute.ResourceType || undefined,
        resourceName: attribute.ResourceName || undefined,
        path: attribute.Path || undefined,
        score: attribute.Score || result.MaxScore || undefined,
        messages: issueMessages(attribute.Issues),
        value: formatFoundValue(attribute.Value),
      });
    });
    const messages = [...issueMessages(result.Issues), ...(result.Details ?? [])];
    if (messages.length > 0 || (result.FailedAttributes ?? []).length === 0) {
      findings.unit.push({
        key: `${resultIndex}`,
        functionName: result.FunctionName || undefined,
        score: result.MaxScore || undefined,
        messages,
      });
    }
  });
  return findings;
};

/**
 * Picks a gate's result out of a live run's results. A run of one Trigger returns a result per
 * function the Trigger runs, and a numbered gate names its function's position (index is
 * zero-based). Returns undefined when the run returned no result for it.
 */
export const selectLiveResult = (
  results: ValidationResult[] | undefined,
  index: number,
): ValidationResult | undefined =>
  results?.find((result) => result?.Index === index) ?? results?.[index];
