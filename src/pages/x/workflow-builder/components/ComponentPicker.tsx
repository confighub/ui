// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which component to preview this workflow against.
 *
 * ⚠️ THIS IS NOT `SpacePicker`, AND THE TWO MUST NOT CONVERGE. That one chooses
 * the Space a workflow LIVES IN: required for every write, stored, part of the
 * entity's address. This one chooses a component to LOOK THROUGH: optional,
 * never stored, never sent, and gone when the page closes. A Space's own
 * `Component` label is neither guaranteed singular nor guaranteed present, so
 * one control cannot honestly answer both questions.
 *
 * ⚠️ AND IT IS TYPE-TO-FILTER, NOT A DROPDOWN, BECAUSE OF HOW MANY THERE ARE.
 * A real instance carries 177 distinct components across 300 labelled Spaces --
 * `cert-manager`, `traefik`, `catalog-api`, and a long tail with a handful of
 * Spaces each. A select of 177 options is a scroll, not a choice. This is a text
 * field with a `datalist`, so typing narrows natively: no custom listbox, no
 * keyboard behaviour to reimplement, and it degrades to a plain field.
 *
 * The cost of a free-text field is that a value can be typed that does not exist,
 * so one that matches nothing says so rather than silently resolving against
 * nothing.
 */

import { useId } from 'react';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Tooltip from '@mui/material/Tooltip';

interface ComponentPickerProps {
  components: readonly string[];
  /** The chosen component, or empty for none yet. */
  value: string;
  onChange: (component: string) => void;
  status: 'loading' | 'ready' | 'failed';
}

export function ComponentPicker({ components, value, onChange, status }: ComponentPickerProps) {
  const listId = useId();
  const unusable = status !== 'ready' || components.length === 0;
  const unknown = value.length > 0 && !components.includes(value);

  let placeholder: string;
  if (status === 'loading') placeholder = 'Reading the components…';
  else if (status === 'failed') placeholder = 'Could not read the components';
  else if (components.length === 0) placeholder = 'No component to preview against';
  else placeholder = 'Type to find a component';

  return (
    <label className='field compfield' htmlFor='wf-preview-component'>
      <span className='flabel'>
        {'Preview with Component '}
        <Tooltip title='Only for this preview. Not saved with the workflow.'>
          <InfoOutlinedIcon fontSize='inherit' className='infoicon' />
        </Tooltip>
      </span>
      <input
        className='input'
        id='wf-preview-component'
        data-act='pickcomponent'
        list={listId}
        value={value}
        disabled={unusable}
        placeholder={placeholder}
        aria-invalid={status === 'failed' || unknown || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {components.map((c) => (
          <option value={c} key={c} />
        ))}
      </datalist>

      {unknown ? (
        <span className='ferr'>
          <span className='bang'>!</span>
          <span>{`No component is labelled ${value}. Nothing will resolve until this names one.`}</span>
        </span>
      ) : null}
    </label>
  );
}
