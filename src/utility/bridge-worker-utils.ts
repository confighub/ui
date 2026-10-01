// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Bridge Worker utility functions
import { BridgeWorkerRead, Permissions, WorkerInfo } from '@confighub/rtk-query';

const TARGET_ACCESS_ACTIONS = ['View', 'ViewChildren'];

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
  for (const action of TARGET_ACCESS_ACTIONS) {
    granted[action] = { UserIDs: { ...(granted[action]?.UserIDs || {}), [userId]: true } };
  }
  return granted;
};

/** Whether the worker's bot user holds both grants a worker needs on a target. */
export const workerHasTargetAccess = (
  permissions: Permissions | undefined,
  worker: BridgeWorkerRead,
): boolean => {
  const userId = worker.UserID;
  return !!userId && TARGET_ACCESS_ACTIONS.every((action) => permissions?.[action]?.UserIDs?.[userId]);
};

/**
 * The target's permissions with access granted to the selected workers and taken from the
 * workers that had it and are no longer selected. Other grants are left as they are.
 */
export const setWorkerTargetAccess = (
  permissions: Permissions | undefined,
  workers: BridgeWorkerRead[],
  selectedWorkerIds: string[],
): Permissions | undefined => {
  let result = permissions;
  for (const worker of workers) {
    const userId = worker.UserID;
    if (!userId) {
      continue;
    }
    if (selectedWorkerIds.includes(worker.BridgeWorkerID || '')) {
      result = grantWorkerTargetAccess(result, worker);
    } else if (workerHasTargetAccess(result, worker)) {
      const revoked: Permissions = { ...(result || {}) };
      for (const action of TARGET_ACCESS_ACTIONS) {
        const others = Object.fromEntries(
          Object.entries(revoked[action]?.UserIDs || {}).filter(([id]) => id !== userId),
        );
        revoked[action] = { ...revoked[action], UserIDs: others };
      }
      result = revoked;
    }
  }
  return result;
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
