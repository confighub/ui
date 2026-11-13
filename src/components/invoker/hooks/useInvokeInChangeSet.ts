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

import { useInitiativeChangeSetLifecycle } from './useInitiativeChangeSetLifecycle';

/** What the invocation is cleared for and the guards it records, as the invoke API takes them. */
export type InvokeGuardParams = Pick<
  InvokeFunctionsOnOrgApiArg,
  'clearance' | 'guards' | 'inheritedGuards'
>;

export interface InvokeInChangeSetArgs extends InvokeGuardParams {
  /** The Space the ChangeSet is found or made in, when none of the Trigger's holds the Units; undefined cancels */
  chooseSpace: () => Promise<string | undefined>;
  // The Space whose executor runs the function, when the Units share one.
  executorSpaceId?: string;
  initiativeId: string;
  /** The Trigger as `<space slug>/<trigger slug>`, which annotates its ChangeSet */
  triggerRef: string;
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
  const { prepareTriggerChangeSet } = useInitiativeChangeSetLifecycle();
  const [invokeFunctions] = useInvokeFunctionsOnOrgMutation();
  const dispatch = useAppDispatch();
  const [isInvoking, setIsInvoking] = useState(false);

  const invoke = useCallback(
    async (args: InvokeInChangeSetArgs): Promise<InvokeInChangeSetResult> => {
      const {
        chooseSpace,
        executorSpaceId,
        initiativeId,
        triggerRef,
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
      let completed = false;
      try {
        // The Trigger's open ChangeSet holding the Units, or its open one in the Space chosen, or
        // a new one there, with the Units in it; Units in another ChangeSet are refused before
        // anything is written. It stays open after the run, for the change to be reviewed there.
        const changeSetId = await prepareTriggerChangeSet({ triggerRef, unitIds, chooseSpace });
        const responses = await run(changeSetId);
        completed = true;
        return { changeSetId, responses };
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
    [prepareTriggerChangeSet, invokeFunctions, dispatch],
  );

  return { invoke, isInvoking };
};
