// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import type {
  ExtendedUnitRead,
  FunctionInvocationsResponse,
  FunctionSignature,
} from '@confighub/rtk-query';
import { FunctionResultItem } from '@/types';
import { getFunctionInvocationAsMonad } from '@/utility/object-functions';
import { decodeBase64 } from '@/utility/string-functions';
import { useUnitDataMap } from '@/hooks/useUnitData';

/**
 * Helper function to extract output from the Outputs map
 * Returns the first non-empty output found, regardless of type
 */
const getOutputFromResult = (result: {
  Outputs?: { [key: string]: string } | null;
}): string => {
  if (!result.Outputs) {
    return '';
  }

  // Get the first non-empty output value from the map. Function outputs are still
  // byte-format on the wire, so they decode here -- everything downstream treats
  // FunctionResultItem.code as text, like the Unit data it is otherwise built from.
  for (const [, outputValue] of Object.entries(result.Outputs)) {
    if (outputValue && typeof outputValue === 'string' && outputValue.trim() !== '') {
      return decodeBase64(outputValue);
    }
  }

  return '';
};

export interface UseFunctionInvocationResultsProps {
  functionInvocationResponse: FunctionInvocationsResponse[];
  preInvocationUnits: ExtendedUnitRead[];
  functionSignature: FunctionSignature | null;
  apiError?: string;
}

export interface FunctionInvocationResults {
  items: FunctionResultItem[];
  isMutating: boolean;
  isValidating: boolean;
  errors: string[];
  isLoading: boolean;
}

/**
 * Hook to process function invocation results
 * Converts raw function invocation responses into display-ready items
 */
export const useFunctionInvocationResults = ({
  functionInvocationResponse,
  preInvocationUnits,
  functionSignature,
  apiError,
}: UseFunctionInvocationResultsProps): FunctionInvocationResults => {
  // The "before" side of each result diff: the stored configuration, in one request.
  const { dataFor: unitDataFor } = useUnitDataMap(
    (preInvocationUnits ?? []).map((u) => u.Unit?.UnitID),
  );
  const [results, setResults] = useState<FunctionInvocationResults>({
    items: [],
    isMutating: false,
    isValidating: false,
    errors: [],
    isLoading: true,
  });

  useEffect(() => {
    // Wait for all required data
    if (!functionSignature || functionInvocationResponse.length === 0) {
      setResults({
        items: [],
        isMutating: false,
        isValidating: false,
        errors: apiError ? [apiError] : [],
        isLoading: !apiError && functionInvocationResponse.length === 0,
      });
      return;
    }

    // Handle both API errors and function invocation errors
    const allErrors: string[] = [];

    // Add API error if it exists (total failure case)
    if (apiError) {
      allErrors.push(apiError);
    }

    // Add function invocation errors if they exist (partial failure case)
    const functionErrors = functionInvocationResponse
      ?.map((response) => response?.Error?.Message)
      ?.filter(Boolean) as string[];

    if (functionErrors && functionErrors.length > 0) {
      allErrors.push(...functionErrors);
    }

    const isMutating = functionSignature.Mutating ?? false;
    const isValidating = functionSignature.Validating ?? false;

    const response = functionInvocationResponse.map((resp) =>
      getFunctionInvocationAsMonad(resp, preInvocationUnits || []),
    );

    // Default items (for non-mutating, non-validating functions)
    const items = response.map(({ result, unit, space }) => ({
      id: unit?.UnitID ?? result.UnitID,
      name: `${unit?.Slug}`,
      spaceName: space.Slug,
      function: `${functionSignature.FunctionName ?? ''}`,
      code: getOutputFromResult(result),
      additionalInfo: `Space/${space.DisplayName?.toUpperCase() ?? ''}/Unit/${unit?.DisplayName?.toUpperCase() ?? ''}`,
    }));

    // Validation items
    const validationRows = response.map(({ result, unit, space }) => ({
      id: unit.UnitID,
      name: unit.DisplayName || '',
      isSuccess: result.Success,
      validationResult: decodeBase64(
        result?.Outputs?.['ValidationResult'] ||
          result?.Outputs?.['ValidationResultList'] ||
          '',
      ),
      validationErrors: unit.ValidationErrors || {},
      labels: unit.Labels || {},
      lastChangeDescription: unit.LastChangeDescription || '',
      headRevision: unit.HeadRevisionNum,
      lastReleasedRevision: unit.LastReleasedRevisionNum,
      spaceName: space.Slug,
      spaceId: unit.SpaceID,
    }));

    const validatingItems = [
      {
        name: `${functionSignature.FunctionName?.toUpperCase() ?? ''} VALIDATION RESULTS`,
        description: '',
        rows: validationRows,
      },
    ];

    // Mutation items with diffs
    const mutatingItems = response.map(({ result, unit, space }) => {
      const diff =
        (result.Mutations?.length ?? 0) > 0 ? (result.ConfigData as string) : undefined;
      return {
        id: unit.UnitID,
        spaceName: space.Slug,
        name: `${unit.Slug}`,
        function: `${functionSignature.FunctionName ?? ''}`,
        additionalInfo: `Space/${space.DisplayName?.toUpperCase() ?? ''}/Unit/${unit.DisplayName?.toUpperCase() ?? ''}`,
        description: `DIFF`,
        code: unitDataFor(unit.UnitID),
        diff,
      };
    });

    const itemsToShow =
      (isMutating && mutatingItems) || (isValidating && validatingItems) || items;

    setResults({
      // @ts-expect-error TODO: Fix the typing later
      items: itemsToShow,
      isMutating,
      isValidating,
      errors: allErrors,
      isLoading: false,
    });
  }, [functionInvocationResponse, preInvocationUnits, functionSignature, apiError]);

  return results;
};