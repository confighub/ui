// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Writing a ChangeWorkflow: create, update, delete.
 *
 * Every write is space-scoped (`/api/space/:space_id/change_workflow/...`), so a Space
 * is required before anything can be written at all.
 *
 * ON `finally`: a 403 does not settle. `baseQueryWithReauth` returns a permanently
 * pending promise on 403 (`confighubapi.ts:131`) so that nothing renders while the
 * browser navigates to `/access-denied`. An `await` on that call therefore never
 * returns, and any cleanup written in a `finally` never runs. Nothing in this file
 * depends on one: the pending state comes from the mutation's own `isLoading`, so a
 * caller cannot be left holding a flag that only a `finally` would have cleared.
 */

import { useCallback } from 'react';

import {
  useCreateChangeWorkflowMutation,
  useDeleteChangeWorkflowMutation,
  useUpdateChangeWorkflowMutation,
} from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { applySaved, toWire, type MappedWorkflow, type WorkflowIdentity } from './mapping';
import { classifySaveError, type SaveOutcome } from './saveOutcome';

/** What `unwrap()` rejects with. */
type MutationError = FetchBaseQueryError | SerializedError;

export interface DeleteOutcome {
  ok: boolean;
  message?: string;
}

export interface WorkflowSave {
  /**
   * Update in place, sending back the Version this edit began with.
   *
   * `identity` is deliberately allowed to be undefined so that the refusal below is
   * REACHABLE and explicit rather than a type-level assumption someone can satisfy with
   * a cast. See the guard's own comment for why writing without one is unsafe.
   */
  save: (
    workflow: MappedWorkflow,
    identity: WorkflowIdentity | undefined,
  ) => Promise<SaveOutcome>;
  /** Write a workflow that does not exist yet, into `spaceId`. */
  create: (workflow: MappedWorkflow, spaceId: string) => Promise<SaveOutcome>;
  remove: (identity: WorkflowIdentity) => Promise<DeleteOutcome>;
  isSaving: boolean;
  isDeleting: boolean;
}

export function useWorkflowSave(): WorkflowSave {
  const [createWorkflow, { isLoading: isCreating }] = useCreateChangeWorkflowMutation();
  const [updateWorkflow, { isLoading: isUpdating }] = useUpdateChangeWorkflowMutation();
  const [deleteWorkflow, { isLoading: isDeleting }] = useDeleteChangeWorkflowMutation();

  const save = useCallback<WorkflowSave['save']>(
    async (workflow, identity) => {
      /*
       * REFUSE TO WRITE WITHOUT A VERSION THAT WAS READ.
       *
       * Not a defensive nicety. The server's check is `vNew < vOld`, so it catches a
       * version that is too OLD and says nothing about one that is absent or current.
       * Writing without an identity read at the start of this edit removes the only
       * protection there is against two authors overwriting each other, and removes it
       * silently -- no error, no banner, nothing for anyone to notice.
       *
       * Failing the save is the right outcome: a save that cannot be made safely has
       * not happened, and saying so is better than appearing to succeed.
       */
      if (!identity) {
        return {
          kind: 'failed',
          message: 'This workflow is not loaded yet, so it cannot be saved.',
        };
      }
      try {
        const saved = await updateWorkflow({
          spaceId: identity.spaceId,
          changeWorkflowId: identity.changeWorkflowId,
          changeWorkflow: toWire(workflow, identity),
        }).unwrap();
        const next = applySaved(workflow, saved);
        return { kind: 'saved', workflow: next.workflow, identity: next.identity };
      } catch (error) {
        return classifySaveError(error as MutationError);
      }
    },
    [updateWorkflow],
  );

  const create = useCallback<WorkflowSave['create']>(
    async (workflow, spaceId) => {
      // A workflow that does not exist yet has no Version to defend and no id to send.
      const identity: WorkflowIdentity = { changeWorkflowId: '', spaceId, version: 0 };
      try {
        const saved = await createWorkflow({
          spaceId,
          changeWorkflow: toWire(workflow, identity),
        }).unwrap();
        const next = applySaved(workflow, saved);
        return { kind: 'saved', workflow: next.workflow, identity: next.identity };
      } catch (error) {
        return classifySaveError(error as MutationError);
      }
    },
    [createWorkflow],
  );

  const remove = useCallback<WorkflowSave['remove']>(
    async (identity) => {
      try {
        const response = await deleteWorkflow({
          spaceId: identity.spaceId,
          changeWorkflowId: identity.changeWorkflowId,
        }).unwrap();
        // Delete answers with a body that can carry its own error alongside a 200, which
        // is the one place the structured `ResponseError` shape reaches a client at all.
        if (response?.Error?.Message) {
          return { ok: false, message: response.Error.Message };
        }
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: getApiErrorMessage(error, 'The workflow could not be deleted.'),
        };
      }
    },
    [deleteWorkflow],
  );

  return { save, create, remove, isSaving: isCreating || isUpdating, isDeleting };
}
