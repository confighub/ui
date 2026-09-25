// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Copying the open workflow's shape into another Space.
 *
 * The source is fixed -- the workflow already open -- rather than picked, which
 * is the whole difference from `useCreateWorkflowFlow`. The write, the outcome
 * and the reset-on-leaving are the same `useCloneFlow` that hook uses.
 *
 * `changeWorkflowId` is the session key, not a boolean. A reader can navigate
 * from one open workflow straight to another without ever passing through "no
 * workflow open" -- back to the console and into a different one still would,
 * but opening a different workflow by link, or from a search result, would not
 * -- so a flag that only catches becoming inactive would miss it. Keying on the
 * id catches a CHANGE of workflow as well as leaving one, with one rule.
 *
 * Copies the SAVED workflow, never the draft: `ClonePanel`'s own header
 * explains why, and this hook is the reason that constraint has to be enforced
 * somewhere rather than merely stated -- the caller passes `savedWorkflow`, and
 * this file never sees the draft at all, so there is no draft to reach for by
 * mistake.
 */

import { useCallback, useEffect, useState } from 'react';

import { useCloneFlow, type CreatedClone } from './useCloneFlow';
import type { MappedWorkflow } from './mapping';
import type { SaveOutcome } from './saveOutcome';
import type { SpaceOption } from '../components/SpacePicker';

export type { CreatedClone };

export interface CloneToSpaceFlow {
  open: boolean;
  begin: () => void;
  cancel: () => void;

  destinationId: string;
  onDestination: (spaceId: string) => void;

  saving: boolean;
  error: string | null;
  clonedTo: CreatedClone | null;

  confirm: () => void;
}

export function useCloneToSpace(
  savedWorkflow: MappedWorkflow | null,
  changeWorkflowId: string | null,
  destinationSpaces: readonly SpaceOption[],
  create: (workflow: MappedWorkflow, spaceId: string) => Promise<SaveOutcome>,
): CloneToSpaceFlow {
  const [open, setOpen] = useState(false);

  const { destinationId, onDestination, saving, error, clonedTo, confirm, reset } = useCloneFlow(
    savedWorkflow,
    destinationSpaces,
    create,
    changeWorkflowId,
  );

  const begin = useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const cancel = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  /* The shared core clears its own state whenever `changeWorkflowId` changes;
     `open` is this hook's own, closed here on the same change so a panel left
     open on one workflow does not carry over onto the next. */
  useEffect(() => {
    setOpen(false);
  }, [changeWorkflowId]);

  return { open, begin, cancel, destinationId, onDestination, saving, error, clonedTo, confirm };
}
