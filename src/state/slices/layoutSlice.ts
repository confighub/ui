// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { PayloadAction, createSlice } from '@reduxjs/toolkit';


import { RootState } from '../store';

export type SidebarPanel = 'functions' | 'changesets';

export const SIDE_PANEL_VIEWS = {
  FUNCTIONS: 'functions' as SidebarPanel,
  CHANGESETS: 'changesets' as SidebarPanel,
};

export interface LayoutState {
  isLinkWorkflowMode?: boolean;
}

const initialState: LayoutState = {
  isLinkWorkflowMode: false,
};

export const layoutSlice = createSlice({
  name: 'layoutSlice',
  initialState,
  reducers: {
    setIsLinkWorkflowMode(state, action: PayloadAction<boolean>) {
      state.isLinkWorkflowMode = action.payload;
    },
  },
});

export const selectIsLinkWorkflowMode = (state: RootState) => state.layout.isLinkWorkflowMode;

export const { setIsLinkWorkflowMode } = layoutSlice.actions;
