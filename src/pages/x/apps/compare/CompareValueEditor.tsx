// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The inline editor for one compare cell.
 *
 * IT FLOATS ABOVE THE GRID AND NEVER WIDENS A TRACK. A value track holds about
 * eleven characters, which is not an editor; widening one to fit would move
 * every column rule below it, which is the defect two commits were spent
 * removing. So the editor is absolutely positioned out of its cell at a minimum
 * 240px and takes part in no layout at all.
 *
 * It expands LEFTWARD when its cell is near the right edge, because the
 * alternative — letting it push the scroller wider — would make opening an
 * editor scroll the grid.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from '../componentTheme';

export interface CompareValueEditorProps {
  /** The value as it stands, or `''` when the field is not set yet. */
  initialValue: string;
  /** Which deployment and field, for the accessible name. */
  label: string;
  /** True when the editor should open leftward — its cell is near the pane's right edge. */
  alignEnd: boolean;
  onCommit: (next: string) => void;
  onCancel: () => void;
}

/** Below this an editor is a slot, not a field. */
const MIN_EDITOR_PX = 240;

const EDITOR_SX = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: 30,
  minWidth: MIN_EDITOR_PX,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 6px',
  borderRadius: `${componentTheme.radiusSm}px`,
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.accent}`,
  boxShadow: componentTheme.shadowMd,
} as const;

const INPUT_SX = {
  flex: 1,
  minWidth: 0,
  border: 0,
  outline: 'none',
  background: 'transparent',
  fontFamily: componentTheme.fontMono,
  fontSize: 12.5,
  color: componentTheme.fgDefault,
  padding: '2px 2px',
} as const;

const HINT_SX = {
  flex: 'none',
  fontFamily: componentTheme.fontSans,
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.04em',
  color: componentTheme.fgSubtle,
  whiteSpace: 'nowrap',
} as const;

export function CompareValueEditor({
  initialValue,
  label,
  alignEnd,
  onCommit,
  onCancel,
}: CompareValueEditorProps): ReactElement {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  return (
    <Box
      data-testid="compare-value-editor"
      // Anchored to the cell's edge rather than centred on it, so the editor
      // never sits half outside the pane.
      sx={{ ...EDITOR_SX, ...(alignEnd ? { right: 0 } : { left: 0 }) }}
      onClick={(event) => event.stopPropagation()}
    >
      <Box
        component="input"
        ref={inputRef}
        type="text"
        value={value}
        aria-label={`Edit ${label}`}
        onChange={(event) => setValue((event.target as HTMLInputElement).value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit(value);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
        // Leaving the field keeps what was typed, matching the shipped editor:
        // a value the user typed and clicked away from is staged, not discarded.
        onBlur={() => onCommit(value)}
        sx={INPUT_SX}
      />
      <Box component="span" sx={HINT_SX}>↵</Box>
    </Box>
  );
}
