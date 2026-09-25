// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { InvocationHistoryItem } from '../types/invoker.types';

const HISTORY_KEY = 'confighub_invocation_history';
const MAX_HISTORY_ITEMS = 20;

/**
 * Decode a base64 encoded string
 * Returns the decoded string or the original if decoding fails
 */
export const decodeBase64Value = (value: string): string => {
  try {
    return atob(value);
  } catch (error) {
    console.warn('Failed to decode base64 value:', error);
    return value; // Return original if decode fails
  }
};

/**
 * Get invocation history from localStorage
 */
export const getInvocationHistory = (): InvocationHistoryItem[] => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as InvocationHistoryItem[];
  } catch (error) {
    console.error('Failed to load invocation history:', error);
    return [];
  }
};

/**
 * Save invocation to history (auto-saves on execution)
 */
export const addToInvocationHistory = (item: InvocationHistoryItem): void => {
  try {
    const history = getInvocationHistory();

    // Add new item at the beginning
    const updated = [item, ...history];

    // Keep only the last MAX_HISTORY_ITEMS
    const trimmed = updated.slice(0, MAX_HISTORY_ITEMS);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save invocation history:', error);
  }
};

/**
 * Clear invocation history
 */
export const clearInvocationHistory = (): void => {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error('Failed to clear invocation history:', error);
  }
};

/**
 * Remove a specific item from invocation history by id
 */
export const removeFromInvocationHistory = (id: string): void => {
  try {
    const history = getInvocationHistory();
    const updated = history.filter((item) => item.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to remove from invocation history:', error);
  }
};

/**
 * Filter history by toolchain type
 */
export const filterHistoryByToolchain = (
  history: InvocationHistoryItem[],
  toolchainType?: string
): InvocationHistoryItem[] => {
  if (!toolchainType) return history;
  return history.filter((item) => item.ToolchainType === toolchainType);
};

/**
 * Get most recent invocations (last 7 days)
 */
export const getRecentInvocations = (
  history: InvocationHistoryItem[],
  days = 7
): InvocationHistoryItem[] => {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter((item) => item.timestamp >= cutoff);
};

/**
 * Get most frequent functions from history
 */
export const getMostFrequentFunctions = (
  history: InvocationHistoryItem[],
  limit = 5
): Array<{ functionName: string; count: number; lastUsed: number }> => {
  const counts = history.reduce(
    (acc, item) => {
      const existing = acc[item.FunctionName] || { count: 0, lastUsed: 0 };
      acc[item.FunctionName] = {
        count: existing.count + 1,
        lastUsed: Math.max(existing.lastUsed, item.timestamp),
      };
      return acc;
    },
    {} as Record<string, { count: number; lastUsed: number }>
  );

  return Object.entries(counts)
    .map(([functionName, data]) => ({ functionName, ...data }))
    .sort((a, b) => {
      // Sort by count first, then by recency
      if (b.count !== a.count) return b.count - a.count;
      return b.lastUsed - a.lastUsed;
    })
    .slice(0, limit);
};

/**
 * Group history items by date for display
 */
export const groupHistoryByDate = (
  history: InvocationHistoryItem[]
): Record<string, InvocationHistoryItem[]> => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const lastWeek = today - 7 * 24 * 60 * 60 * 1000;

  const groups: Record<string, InvocationHistoryItem[]> = {
    Today: [],
    Yesterday: [],
    'Last 7 days': [],
    Older: [],
  };

  history.forEach((item) => {
    if (item.timestamp >= today) {
      groups['Today'].push(item);
    } else if (item.timestamp >= yesterday) {
      groups['Yesterday'].push(item);
    } else if (item.timestamp >= lastWeek) {
      groups['Last 7 days'].push(item);
    } else {
      groups['Older'].push(item);
    }
  });

  // Remove empty groups
  Object.keys(groups).forEach((key) => {
    if (groups[key].length === 0) {
      delete groups[key];
    }
  });

  return groups;
};
