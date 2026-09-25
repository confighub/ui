// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Fuse, { IFuseOptions } from 'fuse.js';
import { FunctionSignature, Invocation } from '@confighub/rtk-query';
import { invocationFunctionName } from '@/utility/invocation-functions';

import { InvocationHistoryItem } from '../types/invoker.types';

/**
 * Search result type that can be either a function or an invocation
 */
export type SearchResultType = 'function' | 'saved-invocation' | 'recent-invocation';

export interface SearchResult {
  type: SearchResultType;
  function: FunctionSignature;
  invocation?: Invocation | InvocationHistoryItem;
  score: number;
  priority: number; // 1 = saved, 2 = recent, 3 = function
  lastUsed?: number;
  toolchainType?: string; // The toolchain type this function/invocation belongs to
  toolchainTypes?: string[]; // All toolchain types this function appears in (for shared functions)
  matches?: {
    key: string;
    indices: readonly (readonly [number, number])[];
  }[];
}

/**
 * Configuration for Fuse.js fuzzy search
 */
const FUSE_OPTIONS: IFuseOptions<unknown> = {
  keys: [
    { name: 'FunctionName', weight: 2 }, // Function names have higher weight
    { name: 'Description', weight: 1 },
    { name: 'DisplayName', weight: 2 }, // Display names for saved invocations
  ],
  threshold: 0.4, // 0 = exact match, 1 = match anything
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 1,
  ignoreLocation: true, // Search entire string, not just at beginning
};

/**
 * Create a searchable dataset from functions
 */
interface FunctionSearchItem {
  type: 'function';
  FunctionName: string;
  Description?: string;
  function: FunctionSignature;
  toolchainType?: string;
  toolchainTypes?: string[];
}

/**
 * Create a searchable dataset from saved invocations
 */
interface SavedInvocationSearchItem {
  type: 'saved-invocation';
  FunctionName: string;
  DisplayName?: string;
  Description?: string;
  invocation: Invocation;
  function: FunctionSignature;
  lastUsed?: number;
  toolchainType?: string;
}

/**
 * Create a searchable dataset from recent invocations
 */
interface RecentInvocationSearchItem {
  type: 'recent-invocation';
  FunctionName: string;
  DisplayName?: string;
  Description?: string;
  invocation: InvocationHistoryItem;
  function: FunctionSignature;
  lastUsed: number;
  toolchainType?: string;
}

type SearchItem = FunctionSearchItem | SavedInvocationSearchItem | RecentInvocationSearchItem;

/**
 * Type for functions grouped by toolchain
 */
export type FunctionsByToolchain = {
  [toolchainType: string]: {
    [functionName: string]: FunctionSignature;
  };
};

/**
 * Prepare search dataset combining functions, saved invocations, and recent invocations
 */
export const prepareSearchDataset = (
  functions: FunctionSignature[],
  savedInvocations: Invocation[],
  recentInvocations: InvocationHistoryItem[],
  functionsByToolchain?: FunctionsByToolchain
): SearchItem[] => {
  const dataset: SearchItem[] = [];

  // Build a map of function name to all toolchain types it appears in
  const functionToolchainMap = new Map<string, string[]>();
  if (functionsByToolchain) {
    Object.entries(functionsByToolchain).forEach(([toolchainType, funcs]) => {
      Object.keys(funcs).forEach((funcName) => {
        const existing = functionToolchainMap.get(funcName) || [];
        existing.push(toolchainType);
        functionToolchainMap.set(funcName, existing);
      });
    });
  }

  // Add saved invocations first (highest priority)
  // Use functionsByToolchain to find function signatures, allowing invocations to show
  // even when their toolchain doesn't match the current filter
  savedInvocations.forEach((invocation) => {
    // An Invocation calls a list of functions; the search entry is labeled and described by the
    // first, which is the whole of a single-function Invocation.
    const functionName = invocationFunctionName(invocation);

    // First try to find in the filtered functions list
    let func = functions.find((f) => f.FunctionName === functionName);

    // If not found and we have functionsByToolchain, look up in the invocation's toolchain
    if (!func && functionsByToolchain && invocation.ToolchainType) {
      const toolchainFuncs = functionsByToolchain[invocation.ToolchainType];
      if (toolchainFuncs && functionName) {
        func = toolchainFuncs[functionName];
      }
    }

    if (func) {
      dataset.push({
        type: 'saved-invocation',
        FunctionName: func.FunctionName || '',
        DisplayName: invocation.DisplayName,
        Description: func.Description,
        invocation,
        function: func,
        toolchainType: invocation.ToolchainType,
      });
    }
  });

  // Add recent invocations (medium priority)
  // Use same logic as saved invocations to find function signatures
  recentInvocations.forEach((invocation) => {
    // First try to find in the filtered functions list
    let func = functions.find((f) => f.FunctionName === invocation.FunctionName);

    // If not found and we have functionsByToolchain, look up in the invocation's toolchain
    if (!func && functionsByToolchain && invocation.ToolchainType) {
      const toolchainFuncs = functionsByToolchain[invocation.ToolchainType];
      if (toolchainFuncs && invocation.FunctionName) {
        func = toolchainFuncs[invocation.FunctionName];
      }
    }

    if (func) {
      dataset.push({
        type: 'recent-invocation',
        FunctionName: func.FunctionName || '',
        DisplayName: invocation.DisplayName,
        Description: func.Description,
        invocation,
        function: func,
        lastUsed: invocation.timestamp,
        toolchainType: invocation.ToolchainType,
      });
    }
  });

  // Add all functions (lower priority)
  // When we have functionsByToolchain, add functions with their toolchain info
  if (functionsByToolchain) {
    const addedFunctions = new Set<string>();

    Object.entries(functionsByToolchain).forEach(([toolchainType, funcs]) => {
      Object.values(funcs).forEach((func) => {
        const funcName = func.FunctionName || '';
        // Only add each function once, but include all its toolchain types
        if (!addedFunctions.has(funcName)) {
          addedFunctions.add(funcName);
          const toolchainTypes = functionToolchainMap.get(funcName) || [toolchainType];
          dataset.push({
            type: 'function',
            FunctionName: funcName,
            Description: func.Description,
            function: func,
            toolchainType: toolchainTypes.length === 1 ? toolchainTypes[0] : undefined,
            toolchainTypes: toolchainTypes.length > 1 ? toolchainTypes : undefined,
          });
        }
      });
    });
  } else {
    // Fallback to original behavior
    functions.forEach((func) => {
      dataset.push({
        type: 'function',
        FunctionName: func.FunctionName || '',
        Description: func.Description,
        function: func,
      });
    });
  }

  return dataset;
};

/**
 * Perform fuzzy search on the dataset
 */
export const performFuzzySearch = (
  query: string,
  dataset: SearchItem[]
): SearchResult[] => {
  if (!query || query.trim().length === 0) {
    // Return all items with priority sorting when no query
    return dataset.map((item) => ({
      type: item.type,
      function: item.function,
      invocation: item.type !== 'function' ? item.invocation : undefined,
      score: 0,
      priority: item.type === 'saved-invocation' ? 1 : item.type === 'recent-invocation' ? 2 : 3,
      lastUsed: item.type === 'recent-invocation' ? item.lastUsed : undefined,
      toolchainType: item.toolchainType,
      toolchainTypes: item.type === 'function' ? (item as FunctionSearchItem).toolchainTypes : undefined,
    }));
  }

  const fuse = new Fuse(dataset, FUSE_OPTIONS);
  const results = fuse.search(query);

  return results.map((result) => {
    const item = result.item;
    return {
      type: item.type,
      function: item.function,
      invocation: item.type !== 'function' ? item.invocation : undefined,
      score: result.score || 0,
      priority: item.type === 'saved-invocation' ? 1 : item.type === 'recent-invocation' ? 2 : 3,
      lastUsed: item.type === 'recent-invocation' ? item.lastUsed : undefined,
      toolchainType: item.toolchainType,
      toolchainTypes: item.type === 'function' ? (item as FunctionSearchItem).toolchainTypes : undefined,
      matches: result.matches?.map((m) => ({
        key: m.key || '',
        indices: m.indices as readonly (readonly [number, number])[],
      })),
    };
  });
};

/**
 * Sort search results by priority and score
 */
export const sortSearchResults = (results: SearchResult[]): SearchResult[] => {
  return results.sort((a, b) => {
    // First, sort by priority (1 = saved, 2 = recent, 3 = function)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // Within same priority, sort by score (lower is better for Fuse.js)
    if (a.score !== b.score) {
      return a.score - b.score;
    }

    // For recent invocations, sort by lastUsed (more recent first)
    if (a.type === 'recent-invocation' && b.type === 'recent-invocation') {
      return (b.lastUsed || 0) - (a.lastUsed || 0);
    }

    // Finally, sort alphabetically by function name
    return (a.function.FunctionName || '').localeCompare(b.function.FunctionName || '');
  });
};

/**
 * Deduplicate search results - remove duplicate functions
 * Keep saved/recent invocations, remove plain function entries if they appear as invocations
 */
export const deduplicateResults = (results: SearchResult[]): SearchResult[] => {
  const seen = new Set<string>();
  const deduplicated: SearchResult[] = [];

  for (const result of results) {
    // Key invocations by their identity (InvocationID for saved, id for recent),
    // not by FunctionName — otherwise several saved Invocations of the same
    // function (e.g. rbac-add-verb and rbac-remove-verb, both set-yq) collapse
    // to a single row.
    const invocationId =
      (result.invocation as { InvocationID?: string; id?: string } | undefined)?.InvocationID ??
      (result.invocation as { id?: string } | undefined)?.id;
    const key =
      result.type === 'function'
        ? `function-${result.function.FunctionName}`
        : `${result.type}-${invocationId ?? result.function.FunctionName}`;
    const functionKey = `function-${result.function.FunctionName}`;

    // Deduplicate within each type, but allow all three types to coexist
    if (result.type === 'saved-invocation' || result.type === 'recent-invocation') {
      // Only prevent duplicate saved or recent entries
      if (!seen.has(key)) {
        deduplicated.push(result);
        seen.add(key);
        // Don't mark the plain function as seen - allow it to appear separately
      }
    } else if (result.type === 'function') {
      // Always add plain functions (one per function name)
      if (!seen.has(functionKey)) {
        deduplicated.push(result);
        seen.add(functionKey);
      }
    }
  }

  return deduplicated;
};

/**
 * Main search function that combines all the steps
 */
export const searchFunctions = (
  query: string,
  functions: FunctionSignature[],
  savedInvocations: Invocation[],
  recentInvocations: InvocationHistoryItem[],
  options?: {
    limit?: number;
    deduplicate?: boolean;
    functionsByToolchain?: FunctionsByToolchain;
  }
): SearchResult[] => {
  const dataset = prepareSearchDataset(functions, savedInvocations, recentInvocations, options?.functionsByToolchain);
  const results = performFuzzySearch(query, dataset);
  const sorted = sortSearchResults(results);
  const deduplicated = options?.deduplicate !== false ? deduplicateResults(sorted) : sorted;

  if (options?.limit) {
    return deduplicated.slice(0, options.limit);
  }

  return deduplicated;
};

/**
 * Group search results by toolchain type
 * Shared functions (appearing in all toolchains) are grouped under 'Shared'
 */
export const groupResultsByToolchain = (
  results: SearchResult[],
  availableToolchainTypes: string[]
): Map<string, SearchResult[]> => {
  const groups = new Map<string, SearchResult[]>();
  const totalToolchains = availableToolchainTypes.length;

  // Initialize groups
  groups.set('Shared', []);
  availableToolchainTypes.forEach(type => {
    groups.set(type, []);
  });

  results.forEach(result => {
    if (result.type === 'function') {
      // Check if it's a shared function (appears in all toolchains)
      if (result.toolchainTypes && result.toolchainTypes.length === totalToolchains) {
        groups.get('Shared')!.push(result);
      } else if (result.toolchainType) {
        // Single toolchain function
        const group = groups.get(result.toolchainType);
        if (group) {
          group.push(result);
        }
      } else if (result.toolchainTypes && result.toolchainTypes.length > 0) {
        // Function appears in some but not all toolchains - add to first toolchain
        const firstType = result.toolchainTypes[0];
        const group = groups.get(firstType);
        if (group) {
          group.push(result);
        }
      }
    } else {
      // Saved or recent invocations go to their toolchain type
      const toolchainType = result.toolchainType;
      if (toolchainType) {
        const group = groups.get(toolchainType);
        if (group) {
          group.push(result);
        }
      }
    }
  });

  // Remove empty groups
  const nonEmptyGroups = new Map<string, SearchResult[]>();
  if ((groups.get('Shared')?.length || 0) > 0) {
    nonEmptyGroups.set('Shared', groups.get('Shared')!);
  }
  availableToolchainTypes.forEach(type => {
    const group = groups.get(type);
    if (group && group.length > 0) {
      nonEmptyGroups.set(type, group);
    }
  });

  return nonEmptyGroups;
};

/**
 * Highlight matching text in a string based on match indices
 */
export const highlightMatches = (
  text: string,
  matches?: { key: string; indices: readonly (readonly [number, number])[] }[],
  targetKey?: string
): { text: string; isMatch: boolean }[] => {
  if (!matches || !targetKey) {
    return [{ text, isMatch: false }];
  }

  const match = matches.find((m) => m.key === targetKey);
  if (!match || match.indices.length === 0) {
    return [{ text, isMatch: false }];
  }

  const result: { text: string; isMatch: boolean }[] = [];
  let lastIndex = 0;

  // Sort indices by start position - convert to mutable array for sorting
  const sortedIndices = [...match.indices].map(([start, end]) => [start, end] as const).sort((a, b) => a[0] - b[0]);

  sortedIndices.forEach(([start, end]) => {
    // Add non-matching text before this match
    if (start > lastIndex) {
      result.push({ text: text.slice(lastIndex, start), isMatch: false });
    }

    // Add matching text
    result.push({ text: text.slice(start, end + 1), isMatch: true });
    lastIndex = end + 1;
  });

  // Add remaining non-matching text
  if (lastIndex < text.length) {
    result.push({ text: text.slice(lastIndex), isMatch: false });
  }

  return result;
};
