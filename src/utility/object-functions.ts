// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  ExtendedUnitRead,
  FunctionInvocationsResponse,
  SpaceRead,
  UnitRead,
} from '@confighub/rtk-query';
import { ValidationResult } from '@/utility/schema-functions';
import { decodeBase64 } from '@/utility/string-functions';

export interface ConfigMonad<T> {
  result: T;
  unit: UnitRead;
  space: SpaceRead;
}

export const commaSeperatedListToObject = (input: string): Record<string, string> => {
  const result: Record<string, string> = {};
  input.split(',').forEach((pair) => {
    const [key, value] = pair.split('=').map((str) => str.trim());
    if (key && value) {
      result[key] = value;
    }
  });
  return result;
};

export const getFunctionInvocationResponse = <T extends FunctionInvocationsResponse>(
  functionInvocationResponse: T | T[],
): T =>
  (Array.isArray(functionInvocationResponse)
    ? functionInvocationResponse[0]
    : functionInvocationResponse) as T;

export const getFunctionInvocationAsMonad = (
  result: FunctionInvocationsResponse | FunctionInvocationsResponse[],
  units: Array<ExtendedUnitRead>,
): ConfigMonad<FunctionInvocationsResponse> => {
  const invocationResponse = getFunctionInvocationResponse(result);
  const unitID = invocationResponse.UnitID;

  const extendedUnit = units.find((unit) => unit?.Unit?.UnitID === unitID);
  const unit = extendedUnit?.Unit ?? ({} as UnitRead);
  const space = extendedUnit?.Space ?? ({} as SpaceRead);

  return {
    result: invocationResponse,
    unit,
    space,
  };
};

export const sumMap = (countMap: { [key: string]: number } | null | undefined) => {
  let total = 0;
  if (countMap === undefined || countMap === null) {
    return 0;
  }
  for (const key in countMap) {
    const value = countMap[key];
    total += value;
  }
  return total;
};

/**
 * Reads the verdict of one validating function from an invocation's ValidationResult output.
 * functionIndex is the function's 0-based position among those invoked: a Trigger whose Invocation
 * runs several functions returns one result for each, and its gates are numbered to match.
 */
export const parseValidationResult = (
  output: string,
  functionIndex = 0,
): { passed: boolean; message: string } => {
  if (!output) return { passed: false, message: 'No output from validation function' };

  try {
    const validationResultList = JSON.parse(
      decodeBase64(output) || '[{ Passed: false }]',
    ) as ValidationResult[];
    const result =
      validationResultList?.find((r) => r?.Index === functionIndex) ??
      validationResultList?.[functionIndex];
    const passed = !!result?.Passed;
    let message = `Passed: ${passed}`;
    if (!passed) {
      if (result?.Details) {
        message += '. Details: ' + result.Details.join(', ');
      } else if (result?.FailedAttributes) {
        const failedPaths = result.FailedAttributes.map(
          (attr) => attr.Path + ' in ' + attr.ResourceType,
        )
          .filter(Boolean)
          .join(', ');
        if (failedPaths) {
          message += '. Failed attributes: ' + failedPaths;
        }
      }
    }
    return {
      passed,
      message: message,
    };
  } catch (error) {
    console.error('Error parsing attribute values:', error);
    return { passed: false, message: 'Error parsing validation result' };
  }
};
