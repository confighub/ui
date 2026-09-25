// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { InvocationHistoryItem } from '../types/invoker.types';
import {
  addToInvocationHistory,
  filterHistoryByToolchain,
  getInvocationHistory,
  getRecentInvocations,
  getMostFrequentFunctions,
  groupHistoryByDate,
  removeFromInvocationHistory,
} from '../utils/invocation-history.utils';

/**
 * Hook for managing invocation history in localStorage
 */
export const useInvocationHistory = (toolchainFilter?: string) => {
  const [history, setHistory] = useLocalStorage<InvocationHistoryItem[]>(
    'confighub_invocation_history',
    []
  );

  // Add a new invocation to history
  const addInvocation = useCallback(
    (item: InvocationHistoryItem) => {
      addToInvocationHistory(item);
      // Trigger re-read from localStorage to update state
      setHistory(getInvocationHistory());
    },
    [setHistory]
  );

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  // Remove a single item from history
  const removeInvocation = useCallback(
    (id: string) => {
      removeFromInvocationHistory(id);
      // Trigger re-read from localStorage to update state
      setHistory(getInvocationHistory());
    },
    [setHistory]
  );

  // Get filtered history based on toolchain type
  const filteredHistory = useMemo(() => {
    if (!toolchainFilter) return history;
    return filterHistoryByToolchain(history, toolchainFilter);
  }, [history, toolchainFilter]);

  // Get recent invocations (last 7 days)
  const recentInvocations = useMemo(() => {
    return getRecentInvocations(filteredHistory);
  }, [filteredHistory]);

  // Get most frequent functions
  const frequentFunctions = useMemo(() => {
    return getMostFrequentFunctions(filteredHistory);
  }, [filteredHistory]);

  // Get history grouped by date for display
  const groupedHistory = useMemo(() => {
    return groupHistoryByDate(filteredHistory);
  }, [filteredHistory]);

  // Get total count
  const count = filteredHistory.length;

  return {
    history: filteredHistory,
    allHistory: history,
    recentInvocations,
    frequentFunctions,
    groupedHistory,
    count,
    addInvocation,
    removeInvocation,
    clearHistory,
  };
};
