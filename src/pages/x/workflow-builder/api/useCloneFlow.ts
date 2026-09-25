// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What is shared between "clone this workflow" and "start a new one from an
 * existing one": pick a destination, write the copy, hold the outcome.
 *
 * NOT shared: how the source is obtained. The console picks it from a list; the
 * in-workflow clone button already has one, fixed, the currently open and SAVED
 * workflow. That difference is real enough to keep as two callers rather than
 * one hook branching on a mode -- but the write itself, and everything that can
 * go wrong with it, is the same question asked from two doors, and a second copy
 * of that logic would be exactly the thing this feature spent a long night
 * removing.
 *
 * `sessionKey` generalises the console's simple "is this on screen" boolean into
 * something the in-workflow caller also needs: which WORKFLOW this session
 * belongs to, since navigating from one open workflow straight to another never
 * passes through "nothing is open" and a boolean would miss it. Resetting on any
 * CHANGE of key, not only on it becoming falsy, covers both callers with the
 * same rule.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { buildClonedWorkflow } from './cloneWorkflow';
import type { MappedWorkflow } from './mapping';
import type { SaveOutcome } from './saveOutcome';
import type { SpaceOption } from '../components/SpacePicker';

export interface CreatedClone {
  changeWorkflowId: string;
  spaceSlug: string;
}

export interface CloneFlowCore {
  destinationId: string;
  onDestination: (spaceId: string) => void;
  /** True while the copy is being written. */
  saving: boolean;
  /** Set when the write was refused, in the server's own words. */
  error: string | null;
  /** Set once the copy exists. */
  clonedTo: CreatedClone | null;
  confirm: () => void;
  /** Back to the state a fresh session starts in. Callers with their own extra
      state (which source is picked, whether a panel is open) call this from
      their own begin/cancel alongside resetting that state. */
  reset: () => void;
}

export function useCloneFlow(
  source: MappedWorkflow | null,
  destinationSpaces: readonly SpaceOption[],
  create: (workflow: MappedWorkflow, spaceId: string) => Promise<SaveOutcome>,
  sessionKey: string | null,
): CloneFlowCore {
  const [destinationId, setDestinationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clonedTo, setClonedTo] = useState<CreatedClone | null>(null);

  const reset = useCallback(() => {
    setDestinationId('');
    setSaving(false);
    setError(null);
    setClonedTo(null);
  }, []);

  /* Updated every render; read inside `confirm`'s async continuation so a write
     started in one session cannot land in a later one. */
  const currentSessionRef = useRef(sessionKey);
  currentSessionRef.current = sessionKey;

  /* Tracks which key this hook last reset FOR, separately from the ref above,
     because the two answer different questions: that one is "what session is it
     right now", this one is "did the session change since we last cleared up
     after it". */
  const lastResetForRef = useRef(sessionKey);
  useEffect(() => {
    if (lastResetForRef.current === sessionKey) return;
    lastResetForRef.current = sessionKey;
    reset();
  }, [sessionKey, reset]);

  const onDestination = useCallback((id: string) => {
    setDestinationId(id);
    setError(null);
  }, []);

  const confirm = useCallback(() => {
    if (!source) return;
    const destination = destinationSpaces.find((s) => s.spaceId === destinationId);
    // The confirm control is disabled until a destination is chosen and there is
    // a source; this is not a second check on that, only a refusal to act on a
    // call that somehow skipped it.
    if (!destination) return;

    const forSession = currentSessionRef.current;
    setSaving(true);
    setError(null);
    void create(buildClonedWorkflow(source), destination.spaceId).then((outcome) => {
      // The session this write was for is not the one on screen any more --
      // navigated away, or moved on to a different workflow -- so its result
      // belongs to nobody currently looking. The write itself still happened;
      // only applying its outcome to now-stale local state is skipped.
      if (currentSessionRef.current !== forSession) return;
      setSaving(false);
      if (outcome.kind === 'saved') {
        setClonedTo({ changeWorkflowId: outcome.identity.changeWorkflowId, spaceSlug: destination.slug });
        return;
      }
      setError(outcome.message);
    });
  }, [source, destinationSpaces, destinationId, create]);

  return { destinationId, onDestination, saving, error, clonedTo, confirm, reset };
}
