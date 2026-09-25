// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState, useMemo, useCallback } from 'react';
import { FunctionSignature, Invocation } from '@confighub/rtk-query';
import { InvocationHistoryItem } from '../types/invoker.types';
import {
  searchFunctions,
  SearchResult,
  FunctionsByToolchain,
} from '../utils/fuzzy-search.utils';
import { debounce } from 'lodash';

interface UseFuzzySearchOptions {
  functions: FunctionSignature[];
  savedInvocations?: Invocation[];
  recentInvocations?: InvocationHistoryItem[];
  functionsByToolchain?: FunctionsByToolchain;
  debounceMs?: number;
  limit?: number;
}

interface UseFuzzySearchReturn {
  query: string;
  setQuery: (query: string) => void;
  debouncedQuery: string;
  results: SearchResult[];
  savedResults: SearchResult[];
  recentResults: SearchResult[];
  isSearching: boolean;
  hasResults: boolean;
  clearSearch: () => void;
}

/**
 * Hook for fuzzy searching functions, saved invocations, and recent invocations
 */
export const useFuzzySearch = ({
  functions,
  savedInvocations = [],
  recentInvocations = [],
  functionsByToolchain,
  debounceMs = 300,
  limit,
}: UseFuzzySearchOptions): UseFuzzySearchReturn => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Debounced query setter
  const debouncedSetQuery = useMemo(
    () =>
      debounce((value: string) => {
        setDebouncedQuery(value);
        setIsSearching(false);
      }, debounceMs),
    [debounceMs]
  );

  // Update query and trigger debounced search
  const handleSetQuery = useCallback(
    (value: string) => {
      setQuery(value);
      setIsSearching(value.length > 0);
      debouncedSetQuery(value);
    },
    [debouncedSetQuery]
  );

  // Perform the search
  const results = useMemo(() => {
    return searchFunctions(debouncedQuery, functions, savedInvocations, recentInvocations, {
      limit,
      deduplicate: true,
      functionsByToolchain,
    });
  }, [debouncedQuery, functions, savedInvocations, recentInvocations, limit, functionsByToolchain]);

  // Separate saved and recent results from regular function results
  const savedResults = useMemo(() => {
    return results.filter((r) => r.type === 'saved-invocation');
  }, [results]);

  const recentResults = useMemo(() => {
    return results.filter((r) => r.type === 'recent-invocation');
  }, [results]);

  // Regular function results (excluding saved and recent)
  const functionResults = useMemo(() => {
    return results.filter((r) => r.type === 'function');
  }, [results]);

  // Clear search
  const clearSearch = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setIsSearching(false);
  }, []);

  return {
    query,
    setQuery: handleSetQuery,
    debouncedQuery,
    results: functionResults,
    savedResults,
    recentResults,
    isSearching,
    hasResults: functionResults.length > 0,
    clearSearch,
  };
};
