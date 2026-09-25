// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export type InitiativePriority = 'HIGH' | 'MEDIUM' | 'LOW';

/** Shared priority badge colours used across initiative cards and headers. */
export const PRIORITY_COLORS: Record<InitiativePriority, { bg: string; color: string }> = {
  HIGH: { bg: '#ffebee', color: '#c62828' },
  MEDIUM: { bg: '#fff3e0', color: '#e65100' },
  LOW: { bg: '#f5f5f5', color: '#757575' },
};

export interface Initiative {
  /** UUID generated at creation time */
  id: string;
  name: string;
  description: string;
  priority: InitiativePriority;
  /** ISO date string */
  deadline?: string;
  /** Links to a saved View in the backend */
  viewId?: string;
  /** Links to a saved Filter in the backend */
  filterId?: string;
  /** Space where the Filter/View/Trigger resources are stored (needed for patch/delete) */
  spaceId?: string;
  /** Cached WHERE clause for unit count queries */
  whereClause: string;
  /** Cached WHERE DATA clause for content-based filtering */
  whereDataClause?: string;
  /** Cached resource type clause for content-based filtering */
  resourceTypeClause?: string;
  createdAt: string;
  /** Trigger ID for the compliance check (vet-kyverno) */
  triggerId?: string;
  /** Kyverno policy YAML used by the compliance check trigger */
  kyvernoPolicy?: string;
  /** Bridge worker ID for the compliance check trigger */
  triggerBridgeWorkerId?: string;
  /** Initiative status — manually controlled by the user */
  status: InitiativeStatus;
  /** ISO date string — set when the initiative is moved to completed */
  completedAt?: string;
  /** Summary of the last compliance check run, stored in View annotation `initiative-check-summary` */
  checkSummary?: CheckSummary;
  /** Enforcement mode derived from the initiative's Trigger.
   *  true → Trigger.Warn=false (blocking ValidationErrors on failure).
   *  false → Trigger.Warn=true (non-blocking ValidationWarnings).
   *  undefined → no compliance trigger (e.g. initiative has no policy). */
  enforced?: boolean;
}

/** Compact summary of the last compliance check run. Stored as JSON in a View annotation
 *  (annotation values are capped at 1024 chars, so we store a summary rather than full results). */
export interface CheckSummary {
  passing: number;
  failing: number;
  notApplicable: number;
  total: number;
  /** ISO timestamp of when the check was run */
  checkedAt: string;
}

export type InitiativeStatus = 'draft' | 'in_progress' | 'completed';

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
