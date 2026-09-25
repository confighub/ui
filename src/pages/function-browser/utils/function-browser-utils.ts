// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { DEFAULT_TOOLCHAIN_TYPES } from '@/components/query-builder';
import { FunctionSignature } from '@confighub/rtk-query';

export type ProcessedFunction = FunctionSignature & {
  resourceTypes: string[];
  toolchainType: string; // Add toolchain type to processed functions
};

export type FilterType = 'all' | 'non_mutating' | 'mutating' | 'non_validating' | 'validating';

export const FILTER_OPTIONS = {
  All: 'all' as FilterType,
  Non_Mutating: 'non_mutating' as FilterType,
  Mutating: 'mutating' as FilterType,
  Non_Validating: 'non_validating' as FilterType,
  Validating: 'validating' as FilterType,
};

export const VIEW_OPTIONS = {
  List: 'List',
  Grid: 'Grid',
};

export type ViewOptions = keyof typeof VIEW_OPTIONS;

// Actual toolchain types for units - derived from the single source of truth
export type ToolchainType = (typeof DEFAULT_TOOLCHAIN_TYPES)[number];

// Toolchain types including 'All' for filtering in the function browser
export type ToolchainFilterType = 'All' | ToolchainType;

export const TOOLCHAIN_TYPES: ToolchainType[] = [...DEFAULT_TOOLCHAIN_TYPES];

export const TOOLCHAIN_FILTER_TYPES: ToolchainFilterType[] = ['All', ...TOOLCHAIN_TYPES];

/**
 * Flattens and groups functions by name across different resource types
 */
export const processFunctions = (
  functions: Record<string, Record<string, FunctionSignature>>,
): ProcessedFunction[] => {
  if (!functions || typeof functions !== 'object') {
    return [];
  }

  // Flatten all functions with their resource types and toolchain type
  const flattened: ProcessedFunction[] = [];

  Object.entries(functions).forEach(([toolchainType, funcs]) => {
    if (funcs && typeof funcs === 'object') {
      Object.entries(funcs).forEach(([, func]) => {
        flattened.push({
          ...func,
          resourceTypes: [toolchainType],
          toolchainType: toolchainType, // Store the toolchain type
        });
      });
    }
  });

  // Group functions by name across different toolchain types
  const grouped: Record<string, ProcessedFunction> = {};

  flattened.forEach((func) => {
    const functionName = func.FunctionName;
    if (!functionName) return;

    if (grouped[functionName]) {
      // Merge resource types for functions that appear in multiple contexts
      grouped[functionName].resourceTypes = [
        ...new Set([...grouped[functionName].resourceTypes, ...func.resourceTypes]),
      ];
      // Keep the first toolchain type encountered, or you could modify this logic
      // to handle functions that span multiple toolchains differently
    } else {
      grouped[functionName] = { ...func };
    }
  });

  return Object.values(grouped);
};

/**
 * Filters functions based on the selected filter type
 */
export const filterFunctionsByType = (
  functions: ProcessedFunction[],
  selectedFilter: FilterType,
): ProcessedFunction[] => {
  if (selectedFilter === FILTER_OPTIONS.All) {
    return functions;
  }

  return functions.filter((func) => {
    switch (selectedFilter) {
      case FILTER_OPTIONS.Mutating:
        return func.Mutating;
      case FILTER_OPTIONS.Non_Mutating:
        return !func.Mutating;
      case FILTER_OPTIONS.Non_Validating:
        return !func.Validating;
      case FILTER_OPTIONS.Validating:
        return func.Validating;
      default:
        return true;
    }
  });
};

/**
 * Filters functions based on the selected toolchain type
 */
export const filterFunctionsByToolchain = (
  functions: ProcessedFunction[],
  selectedToolchain: ToolchainFilterType,
): ProcessedFunction[] => {
  if (selectedToolchain === 'All') {
    return functions;
  }

  return functions.filter((func) => {
    // Check if the function's resource types include the selected toolchain
    return func.resourceTypes.includes(selectedToolchain);
  });
};

/**
 * Searches functions by name, description, or resource types
 */
export const searchFunctions = (
  functions: ProcessedFunction[],
  searchQuery: string,
): ProcessedFunction[] => {
  if (!searchQuery.trim()) {
    return functions;
  }

  const query = searchQuery.toLowerCase();

  return functions.filter((func) => {
    const matchesName = func.FunctionName?.toLowerCase().includes(query) ?? false;
    const matchesDescription = func.Description?.toLowerCase().includes(query) ?? false;
    const matchesResourceType = func.resourceTypes.some((type) =>
      type.toLowerCase().includes(query),
    );

    return matchesName || matchesDescription || matchesResourceType;
  });
};

/**
 * Combined filter and search function with toolchain filtering
 */
export const filterAndSearchFunctions = (
  functions: ProcessedFunction[],
  selectedFilter: FilterType,
  selectedToolchain: ToolchainFilterType = 'All',
  searchQuery?: string,
): ProcessedFunction[] => {
  let filtered = filterFunctionsByType(functions, selectedFilter);
  filtered = filterFunctionsByToolchain(filtered, selectedToolchain);

  if (searchQuery) {
    filtered = searchFunctions(filtered, searchQuery);
  }

  return filtered;
};
