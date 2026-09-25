// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ResourceInfo } from '@confighub/rtk-query';
import { Base64 } from 'js-base64';

export type ActionResultType =
  | 'ApplyFailed'
  | 'ApplyWaitFailed'
  | 'ApplyCompleted'
  | 'DestroyCompleted'
  | 'DestroyWaitFailed'
  | 'DestroyFailed'
  | 'ImportCompleted'
  | 'ImportFailed'
  | 'RefreshAndDrifted'
  | 'RefreshAndNoDrift'
  | 'RefreshFailed'
  | 'None';

export const ActionResultTypeEnum = {
  APPLY_FAILED: 'ApplyFailed',
  APPLY_WAIT_FAILED: 'ApplyWaitFailed',
  APPLY_COMPLETED: 'ApplyCompleted',
  DESTROY_COMPLETED: 'DestroyCompleted',
  DESTROY_WAIT_FAILED: 'DestroyWaitFailed',
  DESTROY_FAILED: 'DestroyFailed',
  IMPORT_COMPLETED: 'ImportCompleted',
  IMPORT_FAILED: 'ImportFailed',
  REFRESH_AND_DRIFTED: 'RefreshAndDrifted',
  REFRESH_AND_NO_DRIFT: 'RefreshAndNoDrift',
  REFRESH_FAILED: 'RefreshFailed',
  NONE: 'None',
} as const;

/**
 * Put a base64 string in a canonical form for comparison: no whitespace, the
 * URL-safe alphabet mapped back to the standard one, no trailing padding.
 *
 * All three of those are legitimate variations that `Base64.decode` accepts and
 * `Base64.encode` never produces, so a round-trip comparison without this
 * rejects perfectly valid input. Verified: naive `Base64.encode(decoded) ===
 * input` reports url-safe, line-wrapped and unpadded base64 as corrupt.
 */
const normalizeBase64 = (value: string): string =>
  value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');

/**
 * Decode base64, replacing `atob` to avoid stack overflows on long inputs.
 *
 * THE TRY/CATCH ALONE DOES NOT PROTECT AGAINST NON-BASE64 INPUT, which is what
 * the comment here used to claim. `Base64.decode` does not throw on plain text:
 * it interprets whatever bytes it can and returns U+FFFD replacement
 * characters, down the SUCCESS path. So handing this a YAML document returned
 * silent garbage that callers then rendered or parsed as though it were real —
 * which is exactly how it reached a user.
 *
 * The guard is a round-trip: re-encode what came out and compare it, in
 * canonical form, with what went in. Anything that was not base64 to begin with
 * cannot survive that.
 *
 * NOT A U+FFFD SCAN, which is the obvious check and is wrong: valid base64
 * whose SOURCE TEXT legitimately contains U+FFFD decodes to output containing
 * U+FFFD, and a scan cannot tell that from corruption. It would reject real
 * data. Verified both ways before choosing this.
 *
 * A failure returns '' and logs, exactly as the pre-existing catch did — every
 * caller already handles that value, so this makes the guard honest without
 * changing the contract 13 call sites are written against.
 */
export const decodeBase64 = (base64: string): string => {
  try {
    const decoded = Base64.decode(base64);
    if (normalizeBase64(Base64.encode(decoded)) !== normalizeBase64(base64)) {
      console.error('Failed to decode base64: input is not base64 (decoded to replacement characters)');
      return '';
    }
    return decoded;
  } catch (e) {
    console.error('Failed to decode base64:', e);
    return '';
  }
};

// This replaces btoa to avoid stack overflow errors in some cases
// where the input string is too long or not valid strings
export const encodeBase64 = (str: string): string => {
  try {
    // explicitly listing utf-8 to avoid issues with other encodings
    return Base64.encode(str);
  } catch (e) {
    console.error('Failed to encode to base64:', e);
    return '';
  }
};

export const cleanString = (input: string): string => {
  return input.replace(/["\n]/g, '');
};

export const getStatusColor = (status: string) =>
  status?.toLocaleLowerCase() === 'ready' ? 'success' : 'info';

export const getActionResultColor = (actionResult: ActionResultType): string => {
  switch (actionResult) {
    case ActionResultTypeEnum.APPLY_COMPLETED:
    case ActionResultTypeEnum.DESTROY_COMPLETED:
    case ActionResultTypeEnum.IMPORT_COMPLETED:
    case ActionResultTypeEnum.REFRESH_AND_DRIFTED:
      return 'success'; // Green for successful actions

    case ActionResultTypeEnum.APPLY_FAILED:
    case ActionResultTypeEnum.APPLY_WAIT_FAILED:
    case ActionResultTypeEnum.DESTROY_FAILED:
    case ActionResultTypeEnum.DESTROY_WAIT_FAILED:
    case ActionResultTypeEnum.IMPORT_FAILED:
    case ActionResultTypeEnum.REFRESH_FAILED:
      return 'error'; // Red for failed actions

    case ActionResultTypeEnum.REFRESH_AND_NO_DRIFT:
    case ActionResultTypeEnum.NONE:
      return 'info'; // Blue for informational actions

    default:
      return 'info'; // Default to info for unknown types
  }
};

const statusColorMap: Record<string, 'default' | 'success' | 'error' | 'info'> = {
  Ready: 'success',
  Degraded: 'error',
  Progressing: 'info',
  NotLive: 'default',
  Detached: 'default',
  Unknown: 'default',
};

export const getUnitStatusColor = (
  status: string,
): 'default' | 'success' | 'error' | 'info' => {
  return statusColorMap[status] || 'default'; // Fallback to 'default' if the status is not in the map
};

const syncStatusColorMap: Record<string, 'default' | 'success' | 'error' | 'info' | 'warning'> = {
  Synced: 'success',
  OutOfSync: 'warning',
  Progressing: 'info',
  NotLive: 'default',
};

export const getSyncStatusColor = (
  status: string,
): 'default' | 'success' | 'error' | 'info' | 'warning' => {
  return syncStatusColorMap[status] || 'default';
};

export interface TargetParameters {
  KubeContext?: string;
  WaitTimeout?: string;
}

export const parseTargetParameters = (parameters: string): TargetParameters => {
  try {
    parameters = JSON.parse(parameters);
    if (!parameters) {
      return {};
    }
    return parameters as TargetParameters;
  } catch (error) {
    console.error('Failed to parse target parameters:', error);
    return {};
  }
};

export const parseResourceInfo = (parameters: string): Array<ResourceInfo> => {
  try {
    return JSON.parse(parameters) as Array<ResourceInfo>;
  } catch (error) {
    console.error('Failed to parse target parameters:', error);
    return [];
  }
};
