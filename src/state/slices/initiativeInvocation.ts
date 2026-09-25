// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import { RootState } from '../store';

/** Tracks the lifecycle of initiative-context function invocations so the
 *  Initiatives page can keep the Recheck button disabled across the whole
 *  invoke→recheck arc and auto-fire a recheck (with race retry) once the
 *  invocation finishes.
 *
 *  `isInvoking` and `isAwaitingRecheck` are flipped atomically in
 *  `invocationCompleted` so the Recheck button never sees a one-frame gap
 *  between "invoke done" and "orchestration started". */
export interface InitiativeInvocationState {
  /** True while the foreground invoke request is in flight. */
  isInvoking: boolean;
  /** True from the moment an invocation completes until the page calls
   *  `recheckCompleted`. Removing this would expose a one-render flicker
   *  where the Recheck button briefly enables before the auto-recheck
   *  effect runs. */
  isAwaitingRecheck: boolean;
  /** Monotonic counter bumped each time an invocation finishes (or aborts)
   *  for a given initiative. Consumers useEffect on this value to react
   *  exactly once per completion. */
  completionSeq: number;
  /** Initiative that the most recent (or current) invocation belongs to. */
  initiativeId: string | null;
  /** Unit IDs touched by the most recent completion. */
  lastUnitIds: string[];
}

const initialState: InitiativeInvocationState = {
  isInvoking: false,
  isAwaitingRecheck: false,
  completionSeq: 0,
  initiativeId: null,
  lastUnitIds: [],
};

export const initiativeInvocationSlice = createSlice({
  name: 'initiativeInvocation',
  initialState,
  reducers: {
    invocationStarted(state, action: PayloadAction<{ initiativeId: string }>) {
      state.isInvoking = true;
      state.initiativeId = action.payload.initiativeId;
    },
    invocationCompleted(state, action: PayloadAction<{ unitIds: string[] }>) {
      state.isInvoking = false;
      state.isAwaitingRecheck = true;
      state.completionSeq += 1;
      state.lastUnitIds = action.payload.unitIds;
    },
    invocationAborted(state) {
      state.isInvoking = false;
    },
    recheckCompleted(state) {
      state.isAwaitingRecheck = false;
    },
  },
});

export const {
  invocationStarted,
  invocationCompleted,
  invocationAborted,
  recheckCompleted,
} = initiativeInvocationSlice.actions;

export const selectInitiativeInvocation = (state: RootState) => state.initiativeInvocation;
