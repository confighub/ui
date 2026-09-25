// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FunctionArgument, FunctionSignature, Invocation, FunctionInvocationsResponse } from '@confighub/rtk-query';

/**
 * The state of the floating function invoker
 */
export type InvokerState = 'minimized' | 'open';

/**
 * Context information about the current page and selection
 */
export interface InvokerContext {
  selectedUnits: Array<{
    id: string;
    name: string;
    toolchainType: string;
    spaceId: string;
    /** Human-readable space slug — optional because some callers only know
     *  the spaceId. Falls back gracefully in display code. */
    spaceName?: string;
  }>;

  // Common
  primaryToolchainType?: string;

  // Map UnitID to Slug for display purposes
  unitIdToSlugMap?: Record<string, string>;
}

/**
 * One function call, as run from the invoker, stored in localStorage history
 * Property names match the FunctionInvocation type from the API for consistency
 */
export interface InvocationHistoryItem {
  id: string; // UUID for deduplication (not in API type, used for localStorage)
  FunctionName: string; // Matches FunctionInvocation.FunctionName
  DisplayName?: string; // Matches Invocation.DisplayName
  ToolchainType: string; // Matches Invocation.ToolchainType
  Arguments: FunctionArgument[]; // Matches FunctionInvocation.Arguments
  timestamp: number; // Timestamp for sorting (not in API type, used for localStorage)
  context?: {
    // Additional context for display (not in API type)
    unitIds?: string[];
    unitNames?: string[];
  };
  success?: boolean; // Success indicator (not in API type, used for display)
  // Store the invocation result to restore it when clicking on history
  result?: {
    success: boolean;
    message?: string;
    responses?: FunctionInvocationsResponse[];
  };
}

/**
 * Suggested function with metadata for ranking
 */
export interface SuggestedFunction {
  function: FunctionSignature;
  source: 'saved' | 'recent' | 'frequent';
  invocation?: Invocation | InvocationHistoryItem;
  priority: number;
  lastUsed?: number;
  useCount?: number;
}

/**
 * Form data for function parameters
 */
export type FunctionParameterFormData = Record<string, string | boolean | number>;

/**
 * Save options for invocations and triggers
 */
export interface SaveInvocationOptions {
  mode: 'new' | 'overwrite';
  invocationId?: string;
  triggerId?: string;
  displayName?: string;
  // Extended fields from SaveInvocationDialogOptions
  type?: 'invocation' | 'trigger';
  spaceId?: string;
  toolchainType?: string;
  eventType?: 'Mutation' | 'PostClone';
  disabled?: boolean;
  enforced?: boolean;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  bridgeWorkerId?: string;
}
