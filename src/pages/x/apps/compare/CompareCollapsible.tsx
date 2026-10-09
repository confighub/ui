// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A "Compare" header that folds the selector row below it away.
 *
 * Both tabs of the side pane open on a row of compare slots — the deployments
 * on the Configuration tab, the two releases on the Releases tab. Once a reader
 * has picked what to compare, the row only takes height from the grid or diff
 * under it, and the column heads there already name each side. Folding it
 * gives that height back.
 *
 * The body is kept mounted when folded: `Collapse` hides it (and takes it out
 * of the tab order), so a picker's own state survives a fold and an unfold.
 *
 * The choice is remembered per `storageKey`, in localStorage, so it holds
 * across a tab switch, a node switch and a reload. It is a view preference,
 * not a selection, so it does not belong in the URL.
 */

import { useCallback, useId, type ReactElement, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';

import { useLocalStorage } from '@/components/invoker/hooks/useLocalStorage';

import { componentTheme } from '../componentTheme';
import { paneType } from '../releasePaneStyles';
import { FoldChevron } from './CompareGrid';

export interface CompareCollapsibleProps {
  /** Where the folded state is remembered. One key per surface, so each tab keeps its own. */
  storageKey: string;
  /** Prefix for `-header` and `-body` test ids. */
  testId: string;
  children: ReactNode;
}

const HEADER_SX = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  margin: 0,
  padding: '7px 12px 0',
  border: 0,
  background: componentTheme.bgSubtle,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: componentTheme.fontSans,
  fontSize: paneType.body,
  fontWeight: 700,
  lineHeight: 1.3,
  color: componentTheme.fgMuted,
  '&:hover': { color: componentTheme.fgDefault },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '-2px' },
  // Folded, the header is the whole band, so it draws the rule the slot row
  // would otherwise draw under it.
  '&[aria-expanded="false"]': {
    paddingBottom: '7px',
    borderBottom: `1px solid ${componentTheme.borderDefault}`,
  },
} as const;

export function CompareCollapsible({ storageKey, testId, children }: CompareCollapsibleProps): ReactElement {
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(storageKey, false);
  const bodyId = useId();
  const expanded = !collapsed;

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  return (
    <>
      <Box
        component="button"
        type="button"
        data-testid={`${testId}-header`}
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={toggle}
        sx={HEADER_SX}
      >
        <FoldChevron open={expanded} />
        Compare
      </Box>
      <Collapse in={expanded} id={bodyId} data-testid={`${testId}-body`} sx={{ flex: 'none' }}>
        {children}
      </Collapse>
    </>
  );
}
