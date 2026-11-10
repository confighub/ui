// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** A single policy violation from FailedAttributes in the Kyverno validation result */
export interface PolicyViolation {
  resourceName: string;
  resourceType: string;
  rule: string;
  message: string;
  path?: string;
}

/** Per-unit check result derived from FunctionInvocationsResponse */
export interface UnitCheckResult {
  unitId: string;
  success: boolean;
  /** True when the unit could not be processed (e.g. no config data) — not a policy failure */
  notApplicable?: boolean;
  message?: string;
  details?: string[];
  violations?: PolicyViolation[];
}
