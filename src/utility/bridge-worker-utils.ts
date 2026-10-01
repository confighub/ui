// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Bridge Worker utility functions
import { BridgeWorkerRead, Permissions, WorkerInfo } from '@confighub/rtk-query';

/**
 * Returns permissions that also grant the worker's bot user View and ViewChildren on a
 * target: View to find the target, ViewChildren to pull the releases published for it.
 * A worker without a bot user leaves the permissions unchanged.
 */
export const grantWorkerTargetAccess = (
  permissions: Permissions | undefined,
  worker: BridgeWorkerRead | undefined,
): Permissions | undefined => {
  const userId = worker?.UserID;
  if (!userId) {
    return permissions;
  }
  const granted: Permissions = { ...(permissions || {}) };
  for (const action of ['View', 'ViewChildren']) {
    granted[action] = { UserIDs: { ...(granted[action]?.UserIDs || {}), [userId]: true } };
  }
  return granted;
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
