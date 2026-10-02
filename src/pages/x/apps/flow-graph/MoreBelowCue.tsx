// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';

const CueButton = styled('button')({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 30,
  padding: '0 12px',
  borderRadius: 999,
  border: `1px solid ${componentTheme.borderDefault}`,
  background: componentTheme.bgDefault,
  boxShadow: componentTheme.shadowMd,
  fontFamily: componentTheme.fontSans,
  fontSize: 12,
  fontWeight: 600,
  color: componentTheme.fgDefault,
  cursor: 'pointer',
  transition: 'background-color 0.15s',
  '&:hover': { background: componentTheme.bgInset },
  '&:focus-visible': {
    outline: `2px solid ${componentTheme.accentFocusRing}`,
    outlineOffset: 2,
  },
  '& svg': { fontSize: 14 },
});

/**
 * Shown when a folded graph is taller than the canvas at the readable zoom
 * floor. Fit shows the top instead of shrinking the graph until names are
 * unreadable, so the part below needs a visible way to reach it; a click
 * pans down by most of a screen and never changes the zoom.
 */
export function MoreBelowCue({ onClick }: { onClick: () => void }) {
  return (
    <CueButton type='button' data-testid='flow-more-below' onClick={onClick}>
      More below
      <ArrowDownwardIcon aria-hidden />
    </CueButton>
  );
}
