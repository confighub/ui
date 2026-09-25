// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FunctionResultItem } from '@/types';
import { EMPTY_OUTPUT } from '@/utility/constants';
  
/**
 * Counts mutation results (changed vs not changed)
 */
export const getMutationCounts = (items: FunctionResultItem[]) => {
  const failureCount = items.filter((item) => !item?.diff).length;

  return {
    successCount: items.length - failureCount,
    failureCount,
    successLabel: 'Changes',
    failureLabel: 'Not Changed',
  };
};

/**
 * Counts default results (results vs empty)
 */
export const getDefaultCounts = (items: FunctionResultItem[]) => {
  const failureCount = items.filter(
    (item) => !item?.code || item.code.toLocaleUpperCase() === EMPTY_OUTPUT,
  ).length;

  return {
    successCount: items.length - failureCount,
    failureCount,
    successLabel: 'Results',
    failureLabel: 'Empty',
  };
};

/**
 * Safely parses validation result and returns count of failed validations
 */
export const parseValidationResult = (validationResult: string) => {
  try {
    const validationData = JSON.parse(validationResult);

    if (Array.isArray(validationData)) {
      return validationData.filter((result) => result.Passed === false).length;
    }

    return 0;
  } catch {
    return 0;
  }
};

export const isAttributeValueListResult = (item: FunctionResultItem): boolean => {
  if (!item.code || item.code === EMPTY_OUTPUT) return false;

  try {
    const parsed = JSON.parse(item.code);

    // Check if it's an array and has the expected AttributeValueList structure
    return (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (item) =>
          typeof item === 'object' &&
          'ResourceName' in item &&
          'ResourceType' in item &&
          'AttributeName' in item &&
          'Value' in item,
      )
    );
  } catch {
    return false;
  }
};

/**
 * FIXED: Filters validation rows based on pass/fail status
 * Returns a new items array with filtered rows, doesn't mutate original data
 */
export const filterValidationResults = (items: FunctionResultItem[], showPassed: boolean): FunctionResultItem[] => {
  return items.map(item => {
    // Create a new item with filtered rows
    const filteredRows = (item.rows ?? []).filter(row => {
      try {
        const validationData = JSON.parse(row.validationResult);
    
        if (Array.isArray(validationData)) {
          // Check if this row has any validations matching the filter
          const hasMatchingValidations = validationData.some((result) => result.Passed === showPassed);
          return hasMatchingValidations;
        }
    
        return false;
      } catch {
        return false;
      }
    });

    // Return a new item object with filtered rows
    return {
      ...item,
      rows: filteredRows
    };
  }).filter(item => item.rows && item.rows.length > 0); // Remove items with no matching rows
};

/**
 * Updated validation counts to work with row-level filtering
 */
export const getValidationCounts = (items: FunctionResultItem[]) => {
  const rows = items.flatMap((item) => item.rows ?? []);

  let totalPassed = 0;
  let totalFailed = 0;

  rows.forEach((row) => {
    try {
      const validationData = JSON.parse(row.validationResult);
      
      if (Array.isArray(validationData)) {
        const passed = validationData.filter((result) => result.Passed === true).length;
        const failed = validationData.filter((result) => result.Passed === false).length;
        
        totalPassed += passed;
        totalFailed += failed;
      }
    } catch {
      // If we can't parse, don't count anything
    }
  });

  return {
    successCount: totalPassed,
    failureCount: totalFailed,
    successLabel: 'Passed',
    failureLabel: 'Failed',
  };
};

/**
 * Updated to check for passed/failed validation rows
 */
export const hasValidationResults = (items: FunctionResultItem[], checkForPassed: boolean) => {
  const rows = items.flatMap((item) => item.rows ?? []);
  
  return rows.some((row) => {
    try {
      const validationData = JSON.parse(row.validationResult);
      
      if (Array.isArray(validationData)) {
        return validationData.some((result) => result.Passed === checkForPassed);
      }
      
      return false;
    } catch {
      return false;
    }
  });
};