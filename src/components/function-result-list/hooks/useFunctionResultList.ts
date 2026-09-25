// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { FunctionResultItem } from '@/types';

interface UseFunctionResultListProps {
  items: FunctionResultItem[];
  isValidating: boolean;
  isMutating: boolean;
}

/**
 * Custom hook to manage function result list state
 */
export const useFunctionResultList = ({ items }: UseFunctionResultListProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'code'>('code');

  /**
   * Parses a single item's code into JSON with UnitName and SpaceName added
   */
  const parseItemData = (item: FunctionResultItem) => {
    if (!item.code) return null;

    try {
      const parsed = JSON.parse(item.code);

      if (Array.isArray(parsed)) {
        return parsed.map((elem) => ({
          ...elem,
          UnitName: item.name,
          SpaceName: item.spaceName,
        }));
      }

      if (parsed && typeof parsed === 'object') {
        return {
          ...parsed,
          UnitName: item.name,
          SpaceName: item.spaceName,
        };
      }

      return parsed;
    } catch (error) {
      console.error('Error parsing data:', error);
      return null;
    }
  };

  /**
   * Combines all items into a single array for table view
   */
  const parseAllItemsData = () => {
    const allData: unknown[] = [];

    items.forEach((item) => {
      const parsed = parseItemData(item);
      if (Array.isArray(parsed)) {
        allData.push(...parsed);
      } else if (parsed && typeof parsed === 'object') {
        allData.push(parsed);
      }
    });

    return allData;
  };

  /**
   * Gets validation rows
   */
  const getValidationRows = () => {
    return items.flatMap((item) => item.rows ?? []);
  };

  return {
    selectedIndex,
    setSelectedIndex,
    viewMode,
    setViewMode,
    parseItemData,
    parseAllItemsData,
    getValidationRows,
  };
};
