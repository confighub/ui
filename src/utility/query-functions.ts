// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export const queryToObject = (ALLOWED_OPERATORS: string[], inputString: string) => {
  const result: { [key: string]: { operator: string; value: string } } = {};

  ALLOWED_OPERATORS.forEach((operator) => {
    if (inputString.includes(operator)) {
      const parts = inputString.split(operator);
      if (parts.length === 2) {
        result[parts[0].trim()] = {
          operator,
          value: parts[1].trim(),
        };
      }
    }
  });

  return result;
};

export const formatParamNames = (str: string): string => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between lowercase and uppercase letters
    .split(' ') // Split the string into words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize the first letter of each word
    .join(' '); // Join the words with a space
};

