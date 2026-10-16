// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import { RootState } from '../store';

/**
 * A page's request that the global function invoker open, set up for a task. Triggers are made
 * from the invoker: the user picks a function and its arguments, and saves them as a Trigger.
 */
export interface InvokerRequestState {
  /** Bumped by each request, so the same request made twice opens the invoker twice */
  seq: number;
  /** Save the function call as a Trigger in this Space */
  createTriggerInSpaceId: string | null;
}

const initialState: InvokerRequestState = {
  seq: 0,
  createTriggerInSpaceId: null,
};

export const invokerRequestSlice = createSlice({
  name: 'invokerRequest',
  initialState,
  reducers: {
    requestTriggerCreation(state, action: PayloadAction<{ spaceId: string }>) {
      state.seq += 1;
      state.createTriggerInSpaceId = action.payload.spaceId;
    },
    clearInvokerRequest(state) {
      state.createTriggerInSpaceId = null;
    },
  },
});

export const { requestTriggerCreation, clearInvokerRequest } = invokerRequestSlice.actions;

export const selectInvokerRequestSeq = (state: RootState) => state.invokerRequest.seq;

export const selectCreateTriggerInSpaceId = (state: RootState) =>
  state.invokerRequest.createTriggerInSpaceId;
