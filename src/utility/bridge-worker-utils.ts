// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Bridge Worker utility functions
import { DEFAULT_TOOLCHAIN_TYPES } from '@/components/query-builder/operators';
import { WorkerInfo } from '@confighub/rtk-query';

/**
 * A Target does not need a worker. Without one there is no ProvidedInfo to derive the
 * provider and toolchain pickers from, so these are the choices offered instead. OCI is
 * what a pull-based Target is; Kubernetes is kept for a Target that a Kubernetes worker
 * will be named on later. The defaults match `cub target create` with no worker.
 */
export const WORKERLESS_PROVIDER_TYPES = ['OCI', 'Kubernetes'];
export const DEFAULT_WORKERLESS_PROVIDER = 'OCI';
export const DEFAULT_WORKERLESS_TOOLCHAIN = 'Any';

/**
 * Toolchain choices for a Target with no worker, given its provider. OCI never routes
 * by toolchain, so `Any` leads; Kubernetes only ever carries Kubernetes/YAML.
 */
export const getWorkerlessToolchains = (providerType: string | undefined): string[] => {
  if (!providerType) {
    return [];
  }
  if (providerType === 'OCI') {
    return [DEFAULT_WORKERLESS_TOOLCHAIN, ...DEFAULT_TOOLCHAIN_TYPES];
  }
  if (providerType === 'Kubernetes') {
    return ['Kubernetes/YAML'];
  }
  return DEFAULT_TOOLCHAIN_TYPES;
};

export interface Target {
  name: string;
  params: Params;
}

export interface Params {
  KubeContext: string;
  KubeNamespace?: string;
}

export interface ConfigType {
  toolchainType: string;
  providerType: string;
  availableTargets: Target[];
}

export interface SupportedConfigTypes {
  supportedConfigTypes: ConfigType[];
}

/**
 * Converts provided info string to an object
 * @param providedInfo - The provided info string from the bridge worker
 * @returns The parsed provided info object or a default object if parsing fails
 */
export const providedInfoToObj = (providedInfo: string): SupportedConfigTypes => {
  let supportedConfigTypes = { supportedConfigTypes: [] } as SupportedConfigTypes;
  try {
    return (supportedConfigTypes = JSON.parse(providedInfo));
  } catch (error) {
    console.log('Error parsing providedInfo:', error);
  }

  return supportedConfigTypes;
};

/**
 * Extracts unique bridge provider types from the provided info struct.
 * @param providedInfo - The WorkerInfo struct from the bridge worker (or undefined)
 * @returns Array of unique ProviderType values; empty array if none are found
 */
export const getAvailableBridges = (providedInfo: WorkerInfo | undefined): string[] => {
  if (!providedInfo?.BridgeWorkerInfo) {
    return [];
  }

  const providerTypes =
    providedInfo.BridgeWorkerInfo.SupportedConfigTypes?.map(
      (configType) => configType?.ProviderType,
    )?.filter((pt): pt is string => pt != null) ?? [];

  // Return unique provider types
  return [...new Set(providerTypes)];
};

/**
 * Returns the unique ToolchainType values advertised by a bridge worker,
 * filtered to a specific ProviderType.
 * @param providedInfo - The WorkerInfo struct from the bridge worker (or undefined)
 * @param providerType - The ProviderType to filter by (or undefined)
 * @returns Array of unique ToolchainType values; empty array if none are found
 */
export const getToolchainsForProvider = (
  providedInfo: WorkerInfo | undefined,
  providerType: string | undefined,
): string[] => {
  if (!providedInfo?.BridgeWorkerInfo || !providerType) {
    return [];
  }

  const toolchainTypes =
    providedInfo.BridgeWorkerInfo.SupportedConfigTypes?.filter(
      (ct) => ct.ProviderType === providerType,
    )
      .map((ct) => ct.ToolchainType)
      .filter((tt): tt is string => tt != null) ?? [];

  return [...new Set(toolchainTypes)];
};

export const getAvailableFunctions = (providedInfo: WorkerInfo): string[] | undefined => {
  // Get all supported functions from all toolchain types
  const supportedFunctions = providedInfo?.FunctionWorkerInfo?.SupportedFunctions;

  if (!supportedFunctions) {
    return undefined;
  }

  // Collect all function names from all toolchain types
  const allFunctionNames: string[] = [];

  // Iterate through all toolchain types (e.g., 'Kubernetes/YAML', etc.)
  Object.values(supportedFunctions).forEach((toolchainFunctions) => {
    if (toolchainFunctions) {
      // Get all function names from this toolchain
      const functionNames = Object.keys(toolchainFunctions);
      allFunctionNames.push(...functionNames);
    }
  });

  // Return names only if the array is not empty, remove duplicates
  const uniqueFunctionNames = [...new Set(allFunctionNames)];
  return uniqueFunctionNames.length > 0 ? uniqueFunctionNames : undefined;
};
