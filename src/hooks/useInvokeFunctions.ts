// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import type { ResourceInfo } from '@/components/function-result-list/components/resource-info-list-table/ResourceInfoListTable';
import type { ValidationResultRows } from '@/components/validation-result-table/ValidationResultTable';
import type {
  ExtendedUnitRead,
  FunctionInvocationsResponse,
  FunctionSignature,
  InvokeFunctionsApiArg,
  SpaceRead,
  UnitRead,
} from '@confighub/rtk-query';
import { useInvokeFunctionsMutation } from '@confighub/rtk-query';
import type { Attribute } from '@/types';
import { decodeBase64 } from '@/utility/string-functions';
import { useUnitDataMap } from '@/hooks/useUnitData';

export interface InvocationResultItem {
  id: string;
  unitSlug: string;
  spaceName: string;
  spaceId: string;
  functionName: string;
  success: boolean;
  output: string;
  diff?: string;
  error?: string;
  hasMutations: boolean;
  validationResult?: string;
}

export interface InvocationResults {
  items: InvocationResultItem[];
  errors: string[];
  hasErrors: boolean;
}

export interface IUseInovkeFunctionProps {
  units: Array<ExtendedUnitRead>;
  selectedFunction: FunctionSignature;
  isDryRun?: boolean;
  changeDescription?: string;
}

/** Extracts the first non-empty output value from a response's Outputs map */
const extractOutput = (outputs: Record<string, string> | null | undefined): string => {
  if (!outputs) return '';
  const value = Object.values(outputs).find((v) => v?.trim());
  return value ?? '';
};

/** Extracts a decoded validation result from a response's Outputs map */
const extractValidationResult = (
  outputs: Record<string, string> | null | undefined,
): string | undefined => {
  if (!outputs) return undefined;
  const raw = outputs['ValidationResult'] || outputs['ValidationResultList'];
  return raw ? decodeBase64(raw) : undefined;
};

/** Resolves the matching unit and space for a given response */
const resolveUnitAndSpace = (
  response: FunctionInvocationsResponse,
  units: ExtendedUnitRead[],
): { unit: UnitRead; space: SpaceRead } => {
  const extended = units.find((u) => u.Unit?.UnitID === response.UnitID);
  return {
    unit: extended?.Unit ?? ({} as UnitRead),
    space: extended?.Space ?? ({} as SpaceRead),
  };
};

/** Maps a single invocation response into a clean result item */
const mapResponseToResultItem = (
  response: FunctionInvocationsResponse,
  unit: UnitRead,
  space: SpaceRead,
  functionName: string,
): InvocationResultItem => {
  const hasMutations = (response.Mutations?.length ?? 0) > 0;
  const diff = hasMutations ? (response.ConfigData as string) : undefined;

  return {
    id: unit.UnitID ?? response.UnitID ?? '',
    unitSlug: unit.Slug ?? '',
    spaceName: space.Slug ?? '',
    spaceId: unit.SpaceID ?? '',
    functionName,
    success: response.Success ?? false,
    output: extractOutput(response.Outputs),
    diff,
    error: response.Error?.Message,
    hasMutations,
    validationResult: extractValidationResult(response.Outputs),
  };
};

/** Processes raw invocation responses into structured results */
export const processInvocationResponses = (
  responses: FunctionInvocationsResponse[],
  units: ExtendedUnitRead[],
  functionName: string,
): InvocationResults => {
  const items: InvocationResultItem[] = [];
  const errors: string[] = [];

  for (const response of responses) {
    const { unit, space } = resolveUnitAndSpace(response, units);
    items.push(mapResponseToResultItem(response, unit, space, functionName));

    if (response.Error?.Message) {
      errors.push(response.Error.Message);
    }
  }

  return { items, errors, hasErrors: errors.length > 0 };
};

/** Builds ExtendedUnitRead[] with before/after diff data from invocation results */
/**
 * The before/after pair a mutating invocation would produce, as units the diff view can
 * render. Neither side is a stored Revision -- the "after" has not been written and may never
 * be -- so both are given synthetic Revision ids and returned alongside a map of their
 * configuration, which the diff view uses instead of fetching.
 */
export const buildDiffUnits = (
  invocationResults: InvocationResults,
  units: ExtendedUnitRead[],
  beforeDataFor: (unitId?: string) => string,
): { diffUnits: ExtendedUnitRead[]; dataOverrides: Map<string, string> } => {
  const dataOverrides = new Map<string, string>();
  const diffUnits = invocationResults.items
    .filter((item) => item.hasMutations && item.diff)
    .map((item) => {
      const original = units.find((u) => u.Unit?.UnitID === item.id);
      const liveId = `preview-${item.id}-before`;
      const headId = `preview-${item.id}-after`;
      dataOverrides.set(liveId, beforeDataFor(item.id));
      dataOverrides.set(headId, item.diff ?? '');
      return {
        ...original,
        LastReleasedRevision: { ...original?.HeadRevision, RevisionID: liveId },
        HeadRevision: {
          ...original?.HeadRevision,
          RevisionID: headId,
          RevisionNum: (original?.HeadRevision?.RevisionNum ?? 0) + 1,
        },
      } as ExtendedUnitRead;
    });
  return { diffUnits, dataOverrides };
};

/** Maps result items back to ValidationResultRows using the original unit data */
const toValidationRows = (
  items: InvocationResultItem[],
  units: ExtendedUnitRead[],
): ValidationResultRows[] => {
  const rows: ValidationResultRows[] = [];

  for (const item of items) {
    const extended = units.find((u) => u.Unit?.UnitID === item.id);
    const unit = extended?.Unit;
    if (!unit) continue;

    rows.push({
      id: item.id,
      name: unit.DisplayName || item.unitSlug,
      isSuccess: item.success,
      validationResult: item.validationResult ?? '',
      validationErrors: unit.ValidationErrors || {},
      labels: unit.Labels || {},
      lastChangeDescription: unit.LastChangeDescription || '',
      headRevision: unit.HeadRevisionNum ?? 0,
      lastReleasedRevision: unit.LastReleasedRevisionNum ?? 0,
      spaceName: item.spaceName,
      spaceId: item.spaceId,
    });
  }

  return rows;
};

/** Decodes and parses base64-encoded JSON output into typed data */
const parseOutputData = <T>(output: string): T[] => {
  if (!output) return [];
  try {
    const decoded = decodeBase64(output);
    const parsed: unknown = JSON.parse(decoded);
    return Array.isArray(parsed) ? (parsed as T[]) : [parsed as T];
  } catch {
    return [];
  }
};

export const useInvokeFunction = ({
  units,
  selectedFunction,
  isDryRun = false,
  changeDescription,
}: IUseInovkeFunctionProps) => {
  // The "before" side of a preview diff is the stored configuration, fetched in one request.
  const { dataFor: unitDataFor } = useUnitDataMap(units.map((u) => u.Unit?.UnitID));
  const [invokeFunctionMutation, { isLoading: isInvoking }] = useInvokeFunctionsMutation();
  const [results, setResults] = useState<InvocationResults | null>(null);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const handleFunctionInvoke = async (args: Record<string, string>) => {
    setResults(null);
    setErrorMessages([]);

    const settled = await Promise.allSettled(
      units?.map(async (extended) => {
        const unit = extended.Unit || ({} as UnitRead);
        const input: InvokeFunctionsApiArg = {
          spaceId: unit?.SpaceID || '',
          where: `UnitID='${unit?.UnitID}'`,
          // A dry run is a query parameter of the invoke API, not a field of the request body.
          dryRun: isDryRun ? 'true' : undefined,
          functionInvocationsRequest: {
            ToolchainType: unit.ToolchainType,
            ChangeDescription: changeDescription || undefined,
            FunctionInvocations: [
              {
                FunctionName: selectedFunction?.FunctionName || '',
                // An optional parameter left unfilled has no value, and the server refuses an
                // argument without one, so it is left out.
                Arguments: Object.entries(args)
                  .filter(([, value]) => value !== undefined && value !== null && value !== '')
                  .map(([key, value]) => ({
                    ParameterName: key,
                    Value: String(value),
                  })),
              },
            ],
          },
        };

        return await invokeFunctionMutation(input).unwrap();
      }),
    );

    const successfulResponses: FunctionInvocationsResponse[][] = [];
    const requestErrors: string[] = [];

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulResponses.push(result.value);
      } else {
        const unit = units[index]?.Unit;
        const reason = result.reason as { data?: { message?: string } };
        const message = reason?.data?.message || 'Unknown error';
        requestErrors.push(`${unit?.Slug || 'Unknown unit'}: ${message}`);
      }
    });

    const flatResponses = successfulResponses.flat();
    const processed = processInvocationResponses(
      flatResponses,
      units,
      selectedFunction?.FunctionName || '',
    );

    const allErrors = [...requestErrors, ...processed.errors];
    const finalResults: InvocationResults = {
      ...processed,
      errors: allErrors,
      hasErrors: allErrors.length > 0,
    };

    setResults(finalResults);
    setErrorMessages(allErrors);

    return finalResults;
  };

  const getValidationRows = (): ValidationResultRows[] => {
    if (!results) return [];
    return toValidationRows(results.items, units);
  };

  const getAttributeValueData = (): Attribute[] => {
    if (!results) return [];
    return results.items.flatMap((item) =>
      parseOutputData<Attribute>(item.output).map((attr) => ({
        ...attr,
        UnitName: item.unitSlug,
        SpaceName: item.spaceName,
      })),
    );
  };

  const getResourceInfoData = (): ResourceInfo[] => {
    if (!results) return [];
    return results.items.flatMap((item) =>
      parseOutputData<ResourceInfo>(item.output).map((resource) => ({
        ...resource,
        UnitName: item.unitSlug,
        SpaceName: item.spaceName,
      })),
    );
  };

  /** Maps mutation results back onto ExtendedUnitRead[] for use with DiffTreeView, with the
   *  configuration of both sides, neither of which is a stored Revision. */
  const getDiffUnits = (): { diffUnits: ExtendedUnitRead[]; dataOverrides: Map<string, string> } => {
    if (!results) return { diffUnits: [], dataOverrides: new Map() };
    return buildDiffUnits(results, units, unitDataFor);
  };

  return {
    handleFunctionInvoke,
    isInvoking,
    results,
    getValidationRows,
    getAttributeValueData,
    getResourceInfoData,
    getDiffUnits,
    errorMessages,
    setErrorMessages
  };
};