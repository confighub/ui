// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FunctionArgument } from '@confighub/rtk-query';

/**
 * Format function arguments into a compact display string
 * Shows first N parameters with their values, and indicates if there are more
 *
 * @param args - Array of function arguments
 * @param maxParams - Maximum number of parameters to display (default: 2)
 * @returns Formatted string like "ServiceName: api-server, Environment: prod" or "Param1: val1, +3 more"
 */
export const formatArgumentsCompact = (
  args?: FunctionArgument[] | null,
  maxParams: number = 2
): string => {
  if (!args || args.length === 0) return '';

  // Filter out arguments without parameter names
  const validArgs = args.filter(arg => arg.ParameterName);

  if (validArgs.length === 0) return '';

  // Take only the first N parameters for display
  const displayArgs = validArgs.slice(0, maxParams);
  const remaining = validArgs.length - maxParams;

  // Format each argument as "ParameterName: Value"
  const formatted = displayArgs
    .map(arg => {
      const value = formatArgumentValue(arg.Value);
      return `${arg.ParameterName}: ${value}`;
    })
    .join(', ');

  // Add indicator for remaining parameters
  if (remaining > 0) {
    return `${formatted}, +${remaining} more`;
  }

  return formatted;
};

/**
 * Format function arguments as an array of parameter objects for chip display
 *
 * @param args - Array of function arguments
 * @returns Array of parameter objects with name and value
 */
export interface FormattedArgument {
  name: string;
  value: string;
}

export const formatArgumentsForChips = (
  args?: FunctionArgument[] | null
): FormattedArgument[] => {
  if (!args || args.length === 0) return [];

  // Filter out arguments without parameter names
  const validArgs = args.filter(arg => arg.ParameterName);

  return validArgs.map(arg => ({
    name: arg.ParameterName || '',
    value: formatArgumentValue(arg.Value, 20), // Shorter max length for chips
  }));
};

/**
 * Format a single argument value for compact display
 * Handles different value types and truncates long values
 *
 * @param value - The argument value (string, number, boolean, or undefined)
 * @param maxLength - Maximum length before truncation (default: 30)
 * @returns Formatted value string
 */
const formatArgumentValue = (
  value: string | number | boolean | undefined,
  maxLength: number = 30
): string => {
  if (value === undefined || value === null) {
    return '(empty)';
  }

  const stringValue = String(value);

  // Truncate long values
  if (stringValue.length > maxLength) {
    return `${stringValue.slice(0, maxLength)}...`;
  }

  return stringValue;
};
