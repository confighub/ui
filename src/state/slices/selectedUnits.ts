// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import { type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import { RootState } from '../store';

export interface GroupComparisonGroup {
  units: ExtendedUnitRead[];
}

export interface SelectedUnitsState {
  units?: Array<ExtendedUnitRead>;
  /** Initiative whose context the Invoker is currently running in. When set,
   *  invocations from the right sidebar wrap themselves in a per-invocation
   *  ChangeSet labeled for this initiative. See
   *  invoker/utils/changeset-run.ts and invoker/hooks/useInvokeInChangeSet.ts. */
  invocationInitiativeId?: string;
  /** The GroupBy dimension currently active in the unit-dashboard components view. */
  unitDashboardGroupBy: GroupByOption;
}

const initialState: SelectedUnitsState = {
  units: [],
  unitDashboardGroupBy: 'space',
};

export const selectedUnitsSlice = createSlice({
  name: 'selectedUnitsSlice',
  initialState,
  reducers: {
    setSelectedUnits(
      state,
      action: PayloadAction<{
        units: Array<ExtendedUnitRead>;
      }>,
    ) {
      state.units = action.payload.units ? [...action.payload.units] : [];
    },
    setInvocationInitiativeId(state, action: PayloadAction<string | undefined>) {
      state.invocationInitiativeId = action.payload;
    },
    setUnitDashboardGroupBy(state, action: PayloadAction<GroupByOption>) {
      state.unitDashboardGroupBy = action.payload;
    },
  },
});

export const selectSelectedUnits = (state: RootState) => state.selectedUnits.units;
export const selectInvocationInitiativeId = (state: RootState) =>
  state.selectedUnits.invocationInitiativeId;
export const selectUnitDashboardGroupBy = (state: RootState): GroupByOption =>
  state.selectedUnits.unitDashboardGroupBy;

export const { setSelectedUnits, setInvocationInitiativeId, setUnitDashboardGroupBy } =
  selectedUnitsSlice.actions;
