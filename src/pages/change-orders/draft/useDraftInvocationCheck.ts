// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { getApiErrorMessage } from '@/utility/error-functions';
import type { Invocation } from '@confighub/rtk-query';

import { draftCopy } from './draftCopy';
import { useGetDraftInvocationDryRunQuery } from './draftInvokeApi';
import { functionErrorText } from './draftKinds';
import type { DraftProblem } from './draftTypes';
import { isRefusal } from './draftValidation';
import { useRetry } from './useRetry';
import { useSettledValue } from './useSettledValue';
import { DRAFT_VALIDATION_SETTLE_MS } from './useDraftValidation';

export interface DraftInvocationCheck {
  /** `idle`: nothing to save. `passed`: the server would save it. `refused` / `failed`: `problem` says so. */
  status: 'idle' | 'pending' | 'passed' | 'refused' | 'failed';
  problem: DraftProblem | undefined;
  retry: () => void;
}

/**
 * The server's verdict on the Invocation Create would save first, asked before Create is enabled:
 * so a refusal arrives before anything is written, not after half of it.
 */
export function useDraftInvocationCheck(input: { spaceId: string | undefined; save: Invocation | undefined; baseSpaceSlug: string }): DraftInvocationCheck {
  const { spaceId, save, baseSpaceSlug } = input;
  const keyText = spaceId === undefined || save === undefined ? '' : JSON.stringify({ spaceId, invocation: save });
  const settledText = useSettledValue(keyText, DRAFT_VALIDATION_SETTLE_MS);
  const settled = useMemo(() => (settledText === '' ? undefined : (JSON.parse(settledText) as { spaceId: string; invocation: Invocation })), [settledText]);
  const read = useGetDraftInvocationDryRunQuery(settled ?? { spaceId: '', invocation: { Slug: '', ToolchainType: '', FunctionInvocations: [] } }, { skip: settled === undefined });
  const retry = useRetry([read]);
  return useMemo((): DraftInvocationCheck => {
    if (keyText === '') return { status: 'idle', problem: undefined, retry };
    if (keyText !== settledText || read.isFetching || (read.currentData === undefined && !read.isError)) return { status: 'pending', problem: undefined, retry };
    if (read.isError) {
      const status = (read.error as { status?: unknown } | undefined)?.status;
      if (status === 409) {
        const slug = settled?.invocation.Slug ?? '';
        return { status: 'refused', problem: { row: 'name', code: 'invocation-name-taken', message: draftCopy.invoke.problems.invocationNameRaced(slug, baseSpaceSlug), source: 'server', blocks: true }, retry };
      }
      if (isRefusal(status))
        return { status: 'refused', problem: { row: 'what', code: 'invocation-refused', message: functionErrorText(getApiErrorMessage(read.error)), source: 'server', blocks: true }, retry };
      return { status: 'failed', problem: { row: 'create', code: 'dry-run-failed', message: draftCopy.couldNotEstablish, source: 'server', blocks: true }, retry };
    }
    return { status: 'passed', problem: undefined, retry };
  }, [keyText, settledText, settled, read.isFetching, read.currentData, read.isError, read.error, baseSpaceSlug, retry]);
}
