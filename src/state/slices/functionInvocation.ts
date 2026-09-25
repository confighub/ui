// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { FunctionInvocationsResponse, ExtendedUnitRead, UnitRead } from '@confighub/rtk-query';

import { RootState } from '../store';

export interface FunctionInvocationState {
  functions?: Array<FunctionInvocationsResponse>;
  fromUnit?: UnitRead;
  updatedUnit?: UnitRead;
  toUnit?: UnitRead;
  isBulkFunctionInvocation: boolean;
  units?: Array<ExtendedUnitRead>;
  apiError?: string;
}

const initialState: FunctionInvocationState = {
  functions: [],
  fromUnit: {} as UnitRead,
  updatedUnit: {} as UnitRead,
  toUnit: {} as UnitRead,
  isBulkFunctionInvocation: true,
  units: [],
  apiError: undefined,
};

export const functionInvocationSlice = createSlice({
  name: 'functionInvocation',
  initialState,
  reducers: {
    setFunctionInvocationResponse(
      state,
      action: PayloadAction<{
        functions: Array<FunctionInvocationsResponse>;
        units: Array<ExtendedUnitRead>;
        apiError?: string;
      }>,
    ) {
      state.functions = action.payload.functions ? [...action.payload.functions] : [];
      state.units = action.payload.units ? [...action.payload.units] : [];
      state.fromUnit = {} as UnitRead;
      state.updatedUnit = {} as UnitRead;
      state.toUnit = {} as UnitRead;
      state.isBulkFunctionInvocation = true;
      state.apiError = action.payload.apiError;
    },
    setDiff(
      state,
      action: PayloadAction<{
        fromUnit: UnitRead | undefined;
        updatedUnit: UnitRead | undefined;
        toUnit: UnitRead | undefined;
      }>,
    ) {
      state.functions = [];
      state.units = [];
      state.updatedUnit = action.payload.updatedUnit;
      state.fromUnit = action.payload.fromUnit;
      state.toUnit = action.payload.toUnit;
      state.isBulkFunctionInvocation = false;
      state.apiError = undefined;
    },
    clearErrors(state) {
      state.apiError = undefined;
    },
  },
});

export const { setFunctionInvocationResponse, setDiff, clearErrors } = functionInvocationSlice.actions;

export const selectFunctionInvocationResponse = (state: RootState) =>
  state.functionInvocation.functions;

export const selectIsBulkFunctionInvocation = (state: RootState) =>
  state.functionInvocation.isBulkFunctionInvocation;

export const selectFromUnit = (state: RootState) => state.functionInvocation.fromUnit;

export const selectUpdatedUnit = (state: RootState) => state.functionInvocation.updatedUnit;

export const selectToUnit = (state: RootState) => state.functionInvocation.toUnit;

export const selectUnits = (state: RootState) => state.functionInvocation.units;

export const selectApiError = (state: RootState) => state.functionInvocation.apiError;
