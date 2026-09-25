// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which existing workflow a new one starts from.
 *
 * ⚠️ NOT `SpacePicker`. That control answers a different question -- which Space
 * a row lives in or is written to -- and a workflow is neither of the things it
 * lists. A shared control answering both would be the shape this feature spent a
 * night removing: one control settling two questions, correct for whichever one
 * it was actually tested against.
 *
 * A select, matching `SpacePicker`'s own reasoning for being one: the page has no
 * searchable control anywhere else, and this list is bounded by an organisation's
 * workflows -- definitions, not rollouts, so genuinely few.
 *
 * Presentation only. The workflows, and whether they arrived, come from outside.
 */

export interface WorkflowOption {
  changeWorkflowId: string;
  slug: string;
  displayName: string;
}

interface WorkflowPickerProps {
  id: string;
  label: string;
  workflows: readonly WorkflowOption[];
  /** The chosen workflow, or empty for none yet. */
  value: string;
  onChange: (changeWorkflowId: string) => void;
  status: 'loading' | 'ready' | 'failed';
  help?: string;
}

export function WorkflowPicker({
  id,
  label,
  workflows,
  value,
  onChange,
  status,
  help,
}: WorkflowPickerProps) {
  const unusable = status !== 'ready' || workflows.length === 0;

  let placeholder: string;
  if (status === 'loading') placeholder = 'Reading your workflows…';
  else if (status === 'failed') placeholder = 'Could not read your workflows';
  else if (workflows.length === 0) placeholder = 'No workflow to start from';
  else placeholder = 'Choose a workflow';

  return (
    <label className='field' htmlFor={id}>
      <span className='flabel'>{label}</span>
      <select
        className='sel'
        id={id}
        data-act='pickworkflow'
        value={value}
        disabled={unusable}
        aria-invalid={status === 'failed' || undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value=''>{placeholder}</option>
        {workflows.map((w) => (
          <option value={w.changeWorkflowId} key={w.changeWorkflowId}>
            {w.displayName} ({w.slug})
          </option>
        ))}
      </select>
      {help ? <span className='fhelp'>{help}</span> : null}
    </label>
  );
}
