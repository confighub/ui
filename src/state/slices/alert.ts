// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { createSlice } from '@reduxjs/toolkit';

import { RootState } from '../store';

export interface IAlert {
  message: string;
  type: 'success' | 'error' | 'warning';
  isOpen: boolean;
}

export const alertSlice = createSlice({
  name: 'alert',
  initialState: {
    message: '',
    type: 'success',
    isOpen: false,
  } as IAlert,
  reducers: {
    setAlert: (state, action) => {
      state.isOpen = action.payload.isOpen;
      state.message = action.payload.message;
      state.type = action.payload.type;
    },
    closeAlert: (state) => {
      state.isOpen = false;
    },
  },
});

export const { setAlert, closeAlert } = alertSlice.actions;

export const selectAlert = (state: RootState) => state.alert;
