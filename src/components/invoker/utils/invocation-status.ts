// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export type InvocationStatus = 'success' | 'partial' | 'failed' | 'unknown';

interface SuccessLike {
  Success?: boolean;
}

export const deriveInvocationStatus = (responses: SuccessLike[]): InvocationStatus => {
  if (responses.length === 0) return 'unknown';
  const successCount = responses.filter((r) => r.Success === true).length;
  if (successCount === responses.length) return 'success';
  if (successCount === 0) return 'failed';
  return 'partial';
};
