// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Starting a new workflow from an existing one.
 *
 * There is no blank-draft path. A ChangeWorkflow is a shape of rollout, and the
 * question a new one answers is "which other component should get this shape" --
 * which is what cloning already says, and what the console's own copy already
 * tells a reader: "Cloning a workflow into another Space is how a second
 * component gets the same shape." Starting from nothing would be a second way to
 * reach the same intent, maintained separately from the one the page already
 * explains.
 *
 * The write, the outcome and the reset-on-leaving are `useCloneFlow`, shared with
 * the in-workflow clone button (`useCloneToSpace`). What is genuinely particular
 * to this caller is picking a SOURCE from a list -- the in-workflow one already
 * has its source, fixed -- so that is the whole of what this file adds.
 *
 * `create` arrives from outside, matching `ClonePanel`'s own convention one level
 * up: this hook is presentation-adjacent, not the source of the write. The
 * caller holds one `useWorkflowSave()` for the whole page: a second instance here
 * would open a second, independent mutation-state slot for the same kind of
 * write the edit-save path already tracks, and nothing needs two.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCloneFlow } from './useCloneFlow';
import type { MappedEntity, MappedWorkflow } from './mapping';
import type { SaveOutcome } from './saveOutcome';
import type { SpaceOption } from '../components/SpacePicker';
import type { WorkflowOption } from '../components/WorkflowPicker';

const NO_WORKFLOWS: WorkflowOption[] = [];

/** Re-exported so a caller of this hook needs only this module. */
export type { CreatedClone } from './useCloneFlow';

export interface CreateWorkflowFlow {
  /** Whether the panel is showing at all. */
  open: boolean;
  begin: () => void;
  cancel: () => void;

  workflows: WorkflowOption[];
  sourceId: string;
  onSource: (changeWorkflowId: string) => void;

  destinationId: string;
  onDestination: (spaceId: string) => void;

  saving: boolean;
  error: string | null;
  clonedTo: { changeWorkflowId: string; spaceSlug: string } | null;

  confirm: () => void;
}

export function useCreateWorkflowFlow(
  entities: readonly MappedEntity[],
  destinationSpaces: readonly SpaceOption[],
  create: (workflow: MappedWorkflow, spaceId: string) => Promise<SaveOutcome>,
  /**
   * Whether the console this flow belongs to is on screen.
   *
   * There is only ever one console, so a boolean is enough here -- unlike the
   * in-workflow caller, which needs to tell one open workflow's session from
   * another's and uses a key rather than a flag for it.
   */
  active: boolean,
): CreateWorkflowFlow {
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState('');

  const workflows = useMemo(() => {
    if (entities.length === 0) return NO_WORKFLOWS;
    return entities.map((e) => ({
      changeWorkflowId: e.identity.changeWorkflowId,
      slug: e.workflow.slug,
      displayName: e.workflow.displayName,
    }));
  }, [entities]);

  const source = useMemo(
    () => entities.find((e) => e.identity.changeWorkflowId === sourceId)?.workflow ?? null,
    [entities, sourceId],
  );

  const { destinationId, onDestination, saving, error, clonedTo, confirm, reset } = useCloneFlow(
    source,
    destinationSpaces,
    create,
    active ? 'console' : null,
  );

  const begin = useCallback(() => {
    setSourceId('');
    reset();
    setOpen(true);
  }, [reset]);

  const cancel = useCallback(() => {
    setOpen(false);
    setSourceId('');
    reset();
  }, [reset]);

  /* `core`'s own effect already clears the destination/outcome state when
     `active` changes; `open` and `sourceId` are this hook's own and are not
     something the shared core knows about, so they are reset here. */
  useEffect(() => {
    if (active) return;
    setOpen(false);
    setSourceId('');
  }, [active]);

  const onSource = useCallback(
    (id: string) => {
      setSourceId(id);
      // A different source invalidates a chosen destination's context along with
      // it, so the whole downstream state clears rather than only the error --
      // one clean step at a time, not a partially-carried-over one.
      reset();
    },
    [reset],
  );

  return {
    open,
    begin,
    cancel,
    workflows,
    sourceId,
    onSource,
    destinationId,
    onDestination,
    saving,
    error,
    clonedTo,
    confirm,
  };
}
