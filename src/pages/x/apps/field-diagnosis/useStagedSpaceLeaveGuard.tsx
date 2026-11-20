// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Back or Forward to another Space would unmount the Units' values sections, which hold the
// pane's staged changes, and lose them without a word. While changes are staged, such a step
// asks first (team-lead decision on review item 2): Stay keeps the pane, Leave goes. A step that
// stays in the Space (a field opened, a jump inside the Space) is not asked.
import { useCallback, useRef } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogTitle from '@mui/material/DialogTitle';
import { type BlockerFunction, NavigationType, useBlocker } from 'react-router-dom';

const spaceOf = (location: { pathname: string; search: string }) =>
  `${location.pathname}?${new URLSearchParams(location.search).get('space') ?? ''}`;

/** @returns the dialog to render while a step is held. */
export function useStagedSpaceLeaveGuard(staged: number) {
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation, historyAction }) =>
      historyAction === NavigationType.Pop && stagedRef.current > 0 && spaceOf(currentLocation) !== spaceOf(nextLocation),
    [],
  );
  const blocker = useBlocker(shouldBlock);
  const count = stagedRef.current;

  return (
    <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} data-testid="fd-leave-staged">
      <DialogTitle>{`Leave ${count} staged change${count === 1 ? '' : 's'}?`}</DialogTitle>
      <DialogActions>
        <Button onClick={() => blocker.reset?.()}>Stay</Button>
        <Button variant="contained" disableElevation onClick={() => blocker.proceed?.()}>
          Leave
        </Button>
      </DialogActions>
    </Dialog>
  );
}
