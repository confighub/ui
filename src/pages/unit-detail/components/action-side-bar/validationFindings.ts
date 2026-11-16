// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Issue, ValidationResult } from '@confighub/rtk-query';

/**
 * One thing a function found wrong: the check that found it, when the function names one, and
 * what it says.
 */
export interface FindingIssue {
  identifier?: string;
  message: string;
}

/** A failed check that names one field of the Unit's configuration. */
export interface FieldFinding {
  key: string;
  resourceType?: string;
  resourceName?: string;
  path?: string;
  score?: string;
  issues: FindingIssue[];
  /** What the function found at the path, as text, when it reported it. */
  value?: string;
}

/** A failed check that names no field: it is about the Unit as a whole. */
export interface UnitFinding {
  key: string;
  functionName?: string;
  score?: string;
  issues: FindingIssue[];
}

export interface ValidationFindings {
  fields: FieldFinding[];
  unit: UnitFinding[];
}

export const findingIssues = (issues: Issue[] | undefined): FindingIssue[] =>
  (issues ?? [])
    .filter((issue) => !!issue.Message)
    .map((issue) => ({ identifier: issue.Identifier || undefined, message: issue.Message ?? '' }));

/**
 * The check an issue names, for showing beside its message: none when it is the rule's own name,
 * as it is for a rule that runs one check and is named after it.
 */
export const issueCheck = (issue: FindingIssue, ruleSlug?: string): string | undefined =>
  issue.identifier && issue.identifier !== ruleSlug ? issue.identifier : undefined;

const POD_SECURITY_PREFIX = /^violates PodSecurity "[^"]+": /;

/**
 * An issue's message as shown beside its check: without the `violates PodSecurity "<level>": `
 * that vet-pod-security-standard starts each with, as the PodSecurity admission controller
 * does, since the check and the rule already say it.
 */
export const issueMessage = (message: string): string => message.replace(POD_SECURITY_PREFIX, '');

/**
 * The details of a failed result that say more than its failed attributes do. Functions that
 * report failed attributes also write each attribute's message as a detail, alone or after the
 * resource it is in (vet-cel, vet-validating-admission-policy), for clients that read only the
 * details; those are left out, so a finding is not shown twice.
 */
export const extraDetails = (result: ValidationResult): string[] => {
  const messages = (result.FailedAttributes ?? []).flatMap((attribute) =>
    (attribute.Issues ?? []).map((issue) => issue.Message ?? '').filter((m) => m !== ''),
  );
  return (result.Details ?? []).filter(
    (detail) => !messages.some((m) => detail === m || detail.endsWith(`: ${m}`)),
  );
};

const MAX_VALUE_LENGTH = 200;

/** Renders a value a function reported as one line of text, shortened if long. */
export const formatFoundValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') {
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
        issues: findingIssues(attribute.Issues),
        value: formatFoundValue(attribute.Value),
      });
    });
    const issues = [
      ...findingIssues(result.Issues),
      ...extraDetails(result).map((message) => ({ message })),
    ];
    if (issues.length > 0 || (result.FailedAttributes ?? []).length === 0) {
      findings.unit.push({
        key: `${resultIndex}`,
        functionName: result.FunctionName || undefined,
        score: result.MaxScore || undefined,
        issues,
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
