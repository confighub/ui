// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which Space a ChangeWorkflow row lives in.
 *
 * ⚠️ THIS IS NOT A COMPONENT CHOOSER. Every write is addressed
 * `/api/space/:space_id/change_workflow/...`, so a Space has to be named before
 * a workflow can be created or cloned. What a Stage's selector previews against
 * is a different question with a different answer, and a Space's own
 * `Labels.Component` is neither guaranteed present nor guaranteed singular -- so
 * one control cannot honestly answer both.
 *
 * It is a select because the page already answers "which Space" with one, in the
 * console's own filter bar. A searchable control would be a new kind of thing on
 * a surface that has none, and the list is the Spaces a person may write to
 * rather than every Space in the estate. If that list grows past the point a
 * select can carry, this is where the search goes.
 *
 * Presentation only. The Spaces, and whether they arrived, come from outside.
 */

export interface SpaceOption {
  spaceId: string;
  slug: string;
}

interface SpacePickerProps {
  id: string;
  label: string;
  spaces: readonly SpaceOption[];
  /** The chosen Space, or empty for none yet. */
  value: string;
  onChange: (spaceId: string) => void;
  status: 'loading' | 'ready' | 'failed';
  /** Said under the control when it matters why a choice is required. */
  help?: string;
}

export function SpacePicker({
  id,
  label,
  spaces,
  value,
  onChange,
  status,
  help,
}: SpacePickerProps) {
  const unusable = status !== 'ready' || spaces.length === 0;

  let placeholder: string;
  if (status === 'loading') placeholder = 'Reading your Spaces…';
  else if (status === 'failed') placeholder = 'Could not read your Spaces';
  else if (spaces.length === 0) placeholder = 'No Space you can write to';
  else placeholder = 'Choose a Space';

  return (
    <label className='field' htmlFor={id}>
      <span className='flabel'>{label}</span>
      <select
        className='sel'
        id={id}
        data-act='pickspace'
        value={value}
        disabled={unusable}
        aria-invalid={status === 'failed' || undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value=''>{placeholder}</option>
        {spaces.map((s) => (
          <option value={s.spaceId} key={s.spaceId}>
            {s.slug}
          </option>
        ))}
      </select>
      {help ? <span className='fhelp'>{help}</span> : null}
    </label>
  );
}
