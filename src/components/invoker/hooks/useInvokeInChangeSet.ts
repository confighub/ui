// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useState } from 'react';

import { useAppDispatch } from '@/hooks/useApp';
import {
  confighubApi,
  type FunctionInvocation,
  type FunctionInvocationsResponse,
  useInvokeFunctionsMutation,
} from '@confighub/rtk-query';
import {
  invocationAborted,
  invocationCompleted,
  invocationStarted,
} from '@/state/slices/initiativeInvocation';

import {
  INVOCATION_ANNOTATION_KEY,
  useInitiativeChangeSetLifecycle,
} from './useInitiativeChangeSetLifecycle';

export interface InvokeInChangeSetArgs {
  spaceId: string;
  initiativeId: string;
  unitIds: string[];
  toolchainType: string;
  functionInvocation: FunctionInvocation;
  dryRun: boolean;
}

export interface InvokeInChangeSetResult {
  changeSetId: string;
  responses: FunctionInvocationsResponse[];
}

const unitIdsWhere = (unitIds: string[]): string =>
  `UnitID IN (${unitIds.map((id) => `'${id}'`).join(',')})`;

export const useInvokeInChangeSet = () => {
  const { openChangeSet, closeChangeSet } = useInitiativeChangeSetLifecycle();
  const [invokeFunctions] = useInvokeFunctionsMutation();
  const dispatch = useAppDispatch();
  const [isInvoking, setIsInvoking] = useState(false);

  const invoke = useCallback(
    async (args: InvokeInChangeSetArgs): Promise<InvokeInChangeSetResult> => {
      const { spaceId, initiativeId, unitIds, toolchainType, functionInvocation, dryRun } = args;
      setIsInvoking(true);
      dispatch(invocationStarted({ initiativeId }));
      let changeSetId: string | undefined;
      let completed = false;
      try {
        const opened = await openChangeSet({
          spaceId,
          initiativeId,
          unitIds,
          displayName: functionInvocation.FunctionName ?? 'invocation',
          annotations: {
            [INVOCATION_ANNOTATION_KEY]: JSON.stringify({
              FunctionName: functionInvocation.FunctionName,
              Arguments: functionInvocation.Arguments ?? [],
            }),
          },
          extraLabels: {},
        });
        changeSetId = opened.changeSetId;

        const responses = await invokeFunctions({
          spaceId,
          where: unitIdsWhere(unitIds),
          dryRun: dryRun ? 'true' : undefined,
          changeSetId,
          functionInvocationsRequest: {
            ToolchainType: toolchainType,
            FunctionInvocations: [functionInvocation],
          },
        }).unwrap();

        await closeChangeSet({ spaceId, unitIds });

        completed = true;
        return { changeSetId, responses };
      } catch (err) {
        // If CS is already open, try to close it so units aren't stranded. We
        // accept orphans as an explicit design decision (force-unlock UX
        // handles them), so failure of the close is swallowed here.
        if (changeSetId) {
          try {
            await closeChangeSet({ spaceId, unitIds });
          } catch (closeErr) {
            console.error(`[useInvokeInChangeSet] orphan changeset ${changeSetId} could not be closed:`, closeErr);
          }
        }
        throw err;
      } finally {
        // invokeFunctions' generated invalidatesTags only covers `Function`, so
        // the Revision list and ChangeSet transitions stay stale after invoke.
        // Invalidate here so the initiative timeline sees new affected units
        // without a page refresh.
        dispatch(confighubApi.util.invalidateTags(['Revision', 'ChangeSet', 'Unit']));
        // Signal completion/abort to the initiative page. The page is
        // responsible for waiting on the backend's resolve queue (which we
        // can't observe directly without the trigger's worker context) before
        // firing its follow-up Recheck.
        dispatch(completed ? invocationCompleted({ unitIds }) : invocationAborted());
        setIsInvoking(false);
      }
    },
    [openChangeSet, closeChangeSet, invokeFunctions, dispatch],
  );

  return { invoke, isInvoking };
};
