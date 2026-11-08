// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react';

import { useAppDispatch } from '@/hooks/useApp';
import {
  invocationAborted,
  invocationCompleted,
  invocationStarted,
} from '@/state/slices/initiativeInvocation';
import {
  type FunctionInvocation,
  type FunctionInvocationsResponse,
  type InvokeFunctionsOnOrgApiArg,
  confighubApi,
  useInvokeFunctionsOnOrgMutation,
} from '@confighub/rtk-query';

import {
  INVOCATION_ANNOTATION_KEY,
  useInitiativeChangeSetLifecycle,
} from './useInitiativeChangeSetLifecycle';

/** What the invocation is cleared for and the guards it records, as the invoke API takes them. */
export type InvokeGuardParams = Pick<
  InvokeFunctionsOnOrgApiArg,
  'clearance' | 'guards' | 'inheritedGuards'
>;

export interface InvokeInChangeSetArgs extends InvokeGuardParams {
  // The Space the ChangeSet is created in.
  spaceId: string;
  // The Space whose executor runs the function, when the Units share one.
  executorSpaceId?: string;
  initiativeId: string;
  unitIds: string[];
  toolchainType: string;
  functionInvocation: FunctionInvocation;
  dryRun: boolean;
  /** Why the change is made; it becomes the description of each Revision it makes. */
  changeDescription?: string;
}

export interface InvokeInChangeSetResult {
  /** The ChangeSet the write was made in; none for a dry run. */
  changeSetId?: string;
  responses: FunctionInvocationsResponse[];
}

const unitIdsWhere = (unitIds: string[]): string =>
  `UnitID IN (${unitIds.map((id) => `'${id}'`).join(',')})`;

export const useInvokeInChangeSet = () => {
  const { openChangeSet, closeChangeSet } = useInitiativeChangeSetLifecycle();
  const [invokeFunctions] = useInvokeFunctionsOnOrgMutation();
  const dispatch = useAppDispatch();
  const [isInvoking, setIsInvoking] = useState(false);

  const invoke = useCallback(
    async (args: InvokeInChangeSetArgs): Promise<InvokeInChangeSetResult> => {
      const {
        spaceId,
        executorSpaceId,
        initiativeId,
        unitIds,
        toolchainType,
        functionInvocation,
        dryRun,
        clearance,
        guards,
        inheritedGuards,
        changeDescription,
      } = args;
      const run = (changeSetId?: string) =>
        invokeFunctions({
          executorSpace: executorSpaceId,
          where: unitIdsWhere(unitIds),
          dryRun: dryRun ? 'true' : undefined,
          clearance,
          guards,
          inheritedGuards,
          include: 'Diff',
          changeSetId,
          functionInvocationsRequest: {
            ToolchainType: toolchainType,
            FunctionInvocations: [functionInvocation],
            ChangeDescription: changeDescription,
          },
        }).unwrap();

      // A dry run writes nothing, so it needs no ChangeSet, which the server does not ask of a
      // dry run. Opening one would lock the Units, and a dry run that asks before a guarded write
      // would hold them while the person decides, and leave the ChangeSet behind if they cancel.
      if (dryRun) {
        setIsInvoking(true);
        try {
          return { responses: await run() };
        } finally {
          setIsInvoking(false);
        }
      }

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

        const responses = await run(changeSetId);

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
            console.error(
              `[useInvokeInChangeSet] orphan changeset ${changeSetId} could not be closed:`,
              closeErr,
            );
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
        // can't observe directly) before
        // firing its follow-up Recheck.
        dispatch(completed ? invocationCompleted({ unitIds }) : invocationAborted());
        setIsInvoking(false);
      }
    },
    [openChangeSet, closeChangeSet, invokeFunctions, dispatch],
  );

  return { invoke, isInvoking };
};
