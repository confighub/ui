// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Copying this workflow's shape into another Space.
 *
 * ⚠️ THIS PAGE ANSWERS IN PLACE; IT DOES NOT LAYER. A custom prerequisite opens
 * inside its own row, the reorder warning appears beside the rail it describes,
 * the fault band hugs what is at fault, and the conflict notice asks where the
 * conflict is. Four instances is an idiom, not four coincidences, so a dialog
 * here would be the first layer this surface has ever put over itself -- and it
 * would cover the workflow the question is about.
 *
 * That is why this is a panel and why the file is not called CloneDialog.
 *
 * What is copied is the SAVED workflow, not the draft: cloning an unsaved edit
 * would put a shape into another Space that does not exist in this one.
 *
 * TWO STRINGS TAKE A PROP RATHER THAN A HARDCODED DEFAULT ONLY. Both were
 * written assuming the source is the workflow already open ("copied as they are
 * saved here", "this workflow now exists ... as well") -- true for that caller,
 * false for a console-level "start a new workflow from an existing one" caller,
 * which has no "here" and is not saying a second copy of the CURRENT workflow
 * now exists. Same panel, same behaviour, different callers need different true
 * sentences rather than one sentence stretched to cover both.
 *
 * Presentation only. The Spaces, the request and its outcome come from outside.
 */

import { SpacePicker } from './SpacePicker';
import type { SpaceOption } from './SpacePicker';

const DEFAULT_HELP =
  'The Stages, their selectors and every custom prerequisite are copied as they are saved here. Nothing about this workflow changes.';

function defaultConfirmed(spaceSlug: string): string {
  return `This workflow now exists in ${spaceSlug} as well. Each Stage's selector was copied exactly, so check them against that Space's own variants before anything is promoted under it.`;
}

interface ClonePanelProps {
  open: boolean;
  spaces: readonly SpaceOption[];
  spacesStatus: 'loading' | 'ready' | 'failed';
  destination: string;
  onDestination: (spaceId: string) => void;
  /** True while the copy is being written. */
  saving: boolean;
  /** Set when the copy was refused, in the server's own words. */
  error: string | null;
  /** Set once the copy exists, so it can be opened instead of leaving this one. */
  clonedTo: { spaceSlug: string; open: () => void } | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Said under the destination control. Defaults to the in-workflow wording. */
  helpText?: string;
  /** Said once the copy exists, given the destination's slug. Defaults to the in-workflow wording. */
  confirmedText?: (spaceSlug: string) => string;
}

export function ClonePanel(props: ClonePanelProps) {
  if (!props.open) return null;

  const { spaces, spacesStatus, destination, saving, error, clonedTo } = props;
  const helpText = props.helpText ?? DEFAULT_HELP;
  const confirmedText = props.confirmedText ?? defaultConfirmed;

  if (clonedTo) {
    return (
      <div className='clonepanel' role='status'>
        <p className='prose'>{confirmedText(clonedTo.spaceSlug)}</p>
        <div className='rowbtns'>
          <button className='btn sm' type='button' data-act='openclone' onClick={clonedTo.open}>
            Open the copy
          </button>
          <button className='btn sm' type='button' onClick={props.onCancel}>
            Stay here
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='clonepanel' role='group' aria-label='Clone to another Space'>
      <SpacePicker
        id='wf-clone-space'
        label='Copy into'
        spaces={spaces}
        value={destination}
        onChange={props.onDestination}
        status={spacesStatus}
        help={helpText}
      />

      {error ? (
        <p className='ferr'>
          <span className='bang'>!</span>
          <span>{error}</span>
        </p>
      ) : null}

      <div className='rowbtns'>
        <button
          className='btn sm primary'
          type='button'
          data-act='confirmclone'
          disabled={!destination || saving}
          onClick={props.onConfirm}
        >
          {saving ? 'Copying…' : 'Copy it there'}
        </button>
        <button className='btn sm' type='button' disabled={saving} onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
