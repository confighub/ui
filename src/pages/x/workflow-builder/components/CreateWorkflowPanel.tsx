// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Starting a new workflow from an existing one, in place on the console.
 *
 * ANSWERS IN PLACE, NOT IN A LAYER -- the same constraint `ClonePanel` states for
 * itself, carried up to the surface that opens it. The console has no open
 * workflow for a dialog to cover, but the page's own idiom is consistent
 * everywhere else on it, and a modal here would be the first exception rather
 * than a reasonable one because nothing happens to be in the way.
 *
 * EXPLAINS BEFORE IT ASKS, the same idiom `NoComponentChosen` uses: a reader who
 * has never made a workflow this way needs the "start from an existing one"
 * premise stated before a source-workflow select makes sense to them.
 *
 * Reuses `ClonePanel` rather than reimplementing its destination step -- gated
 * on `open={sourceId !== ''}`, which is the mechanism `ClonePanel` already has
 * for not rendering. The destination question only makes sense once a source is
 * named, so nothing here decides when to show it; the source choice does.
 *
 * Presentation only. The workflows, the Spaces and the flow's state all come
 * from `useCreateWorkflowFlow`.
 */

import { ClonePanel } from './ClonePanel';
import { WorkflowPicker } from './WorkflowPicker';
import type { CreateWorkflowFlow } from '../api/useCreateWorkflowFlow';
import type { SpaceOption } from './SpacePicker';

interface CreateWorkflowPanelProps {
  flow: CreateWorkflowFlow;
  /**
   * Whether `flow.workflows` is the real list, still loading, or unreachable.
   *
   * Not inferred from `flow.workflows.length`: an empty array means the same
   * thing whether nothing has arrived yet or the read failed, and guessing from
   * length would show "Reading your workflows…" forever on a genuine failure --
   * the read stopped, the count stayed zero, and the two states are
   * indistinguishable from the length alone.
   */
  sourceStatus: 'loading' | 'ready' | 'failed';
  spaces: readonly SpaceOption[];
  spacesStatus: 'loading' | 'ready' | 'failed';
  onOpenClone: (changeWorkflowId: string) => void;
}

export function CreateWorkflowPanel({
  flow,
  sourceStatus,
  spaces,
  spacesStatus,
  onOpenClone,
}: CreateWorkflowPanelProps) {
  if (!flow.open) return null;

  const openClone = () => {
    if (flow.clonedTo) onOpenClone(flow.clonedTo.changeWorkflowId);
  };

  return (
    <div className='newwfpanel' role='group' aria-label='New workflow'>
      <p className='prose'>
        {'Every workflow starts as a copy of another. Pick the one whose shape you want — its Stages, their selectors and every custom prerequisite — and where the copy should live. Nothing about the workflow you copy from changes.'}
      </p>

      <WorkflowPicker
        id='wf-new-source'
        label='Start from'
        workflows={flow.workflows}
        value={flow.sourceId}
        onChange={flow.onSource}
        status={sourceStatus}
      />

      <ClonePanel
        open={flow.sourceId !== ''}
        spaces={spaces}
        spacesStatus={spacesStatus}
        destination={flow.destinationId}
        onDestination={flow.onDestination}
        saving={flow.saving}
        error={flow.error}
        clonedTo={flow.clonedTo ? { spaceSlug: flow.clonedTo.spaceSlug, open: openClone } : null}
        onConfirm={flow.confirm}
        onCancel={flow.cancel}
        helpText='The Stages, their selectors and every custom prerequisite are copied exactly. Nothing about the workflow you are copying from changes.'
        confirmedText={(spaceSlug) =>
          `The new workflow now exists in ${spaceSlug}. Each Stage's selector was copied exactly, so check them against that Space's own variants before anything is promoted under it.`
        }
      />
    </div>
  );
}
