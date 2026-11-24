// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode, createContext, useCallback, useContext, useEffect, useId, useMemo, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

interface LeaveGuardValue {
  setDirty: (id: string, dirty: boolean) => void;
  allowNext: () => void;
}

const LeaveGuardContext = createContext<LeaveGuardValue>({ setDirty: () => {}, allowNext: () => {} });

/**
 * Asks before a navigation discards unsaved edits. Links open in the same tab,
 * so a surface that holds edits which are in neither the address nor the
 * server says so with `useLeaveGuard(dirty)`. A plain click that would leave
 * the page then asks first. A change of the query on the same page does not
 * ask, and a ⌘/Ctrl-click opens a new tab and leaves the edits alone.
 *
 * `Layout` renders one provider around the pages.
 */
export const LeaveGuardProvider = ({ children }: { children: ReactNode }) => {
  const dirty = useRef(new Set<string>());
  const allowed = useRef(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowed.current) {
      allowed.current = false;
      return false;
    }
    return dirty.current.size > 0 && currentLocation.pathname !== nextLocation.pathname;
  });

  // A reload or a closed tab discards the edits too; the browser shows its own question.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const value = useMemo<LeaveGuardValue>(
    () => ({
      setDirty: (id, isDirty) => {
        if (isDirty) dirty.current.add(id);
        else dirty.current.delete(id);
      },
      allowNext: () => {
        allowed.current = true;
      },
    }),
    [],
  );

  const blocked = blocker.state === 'blocked';
  return (
    <LeaveGuardContext.Provider value={value}>
      {children}
      <Dialog open={blocked} onClose={() => blocker.reset?.()} data-testid='leave-guard'>
        <DialogTitle>Leave this page?</DialogTitle>
        <DialogContent>
          <Typography>Your unsaved changes will be lost.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()} variant='outlined' data-testid='leave-guard-stay'>
            Stay
          </Button>
          <Button onClick={() => blocker.proceed?.()} color='primary' variant='contained' data-testid='leave-guard-leave'>
            Leave
          </Button>
        </DialogActions>
      </Dialog>
    </LeaveGuardContext.Provider>
  );
};

/**
 * Says that this surface holds unsaved edits while `dirty` is true. Returns
 * `allowNext`, for the surface's own navigation after a save, when `dirty` has
 * not yet turned false.
 */
export function useLeaveGuard(dirty: boolean): () => void {
  const id = useId();
  const { setDirty, allowNext } = useContext(LeaveGuardContext);
  useEffect(() => {
    setDirty(id, dirty);
    return () => setDirty(id, false);
  }, [id, dirty, setDirty]);
  return useCallback(() => allowNext(), [allowNext]);
}
