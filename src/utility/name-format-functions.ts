// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export const formatResourceName = (str: string): string => {
  return str
    .split('/')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const removeNumbersFromPath = (path: string): string => {
  return path.replace(/\d+/g, '');
};

export const capitalizeFirstLetter = (str: string): string => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const addSpacesToCamelCase = (text: string): string => {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2');
};

export const getInitials = (name: string): string => {
  if (!name) return '';
  const [firstName, lastName] = name.split(' ');
  const firstInitial = firstName?.charAt(0).toUpperCase() || '';
  const lastInitial = lastName?.charAt(0).toUpperCase() || '';
  return `${firstInitial}${lastInitial}`;
};

/**
 * Returns the name of the function behind a gate, without the position a Trigger running an
 * Invocation of several functions gives it.
 */
export const formatApplyGate = (input: string): string => parseGateName(input).functionName;

export interface ParsedGateName {
  spaceSlug?: string;
  triggerSlug: string;
  functionName: string;
  // The function's 1-based position in its Trigger's Invocation, when that has several functions.
  functionIndex?: number;
}

/**
 * Parses a gate name into its components.
 * 3-part format: "space-slug/trigger-slug/function-name"
 * 2-part format (legacy): "trigger-slug/function-name"
 * The function part may carry its position in the Trigger's Invocation: "vet-cel:2".
 */
export const parseGateName = (gateName: string): ParsedGateName => {
  const parts = gateName.split('/');
  let parsed: ParsedGateName;
  if (parts.length >= 3) {
    parsed = {
      spaceSlug: parts[0],
      triggerSlug: parts[1],
      functionName: parts.slice(2).join('/'),
    };
  } else if (parts.length === 2) {
    parsed = { triggerSlug: parts[0], functionName: parts[1] };
  } else {
    return { triggerSlug: gateName, functionName: '' };
  }
  const match = /^(.*):([1-9][0-9]*)$/.exec(parsed.functionName);
  if (match) {
    parsed.functionName = match[1];
    parsed.functionIndex = Number(match[2]);
  }
  return parsed;
};
