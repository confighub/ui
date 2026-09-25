// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import { RootState } from '../store';
import { TourState, TourStatus, initialTourState, readTourState } from './tour-storage';

export type { TourState, TourStatus };

/**
 * Guided-tour position. Small and fully serializable by design: the step
 * *content* (React nodes, anchor resolvers, advance predicates) is held in the
 * in-memory tour registry, never in Redux.
 *
 * Rehydrated from localStorage at module load so a page reload resumes the tour
 * where the user left it. The reducer never knows how many steps a tour has, so
 * every advance action carries `stepCount`; the host owns the definition.
 */
const initialState: TourState = readTourState() ?? initialTourState;

export const tourSlice = createSlice({
  name: 'tour',
  initialState,
  reducers: {
    startTour(state, action: PayloadAction<{ tourId: string; stepIndex?: number }>) {
      state.tourId = action.payload.tourId;
      state.stepIndex = Math.max(0, action.payload.stepIndex ?? 0);
      state.status = 'running';
    },
    nextStep(state, action: PayloadAction<{ stepCount: number }>) {
      const next = state.stepIndex + 1;
      if (next >= action.payload.stepCount) {
        state.stepIndex = Math.max(0, action.payload.stepCount - 1);
        // Not 'done' yet — 'finished' holds the completion screen up until
        // the user acknowledges it (see TourStatus's doc comment).
        state.status = 'finished';
        return;
      }
      state.stepIndex = next;
    },
    previousStep(state) {
      state.stepIndex = Math.max(0, state.stepIndex - 1);
    },
    goToStep(state, action: PayloadAction<{ stepIndex: number }>) {
      state.stepIndex = Math.max(0, action.payload.stepIndex);
    },
    pauseTour(state) {
      if (state.status === 'running') state.status = 'paused';
    },
    resumeTour(state) {
      if (state.status === 'paused') state.status = 'running';
    },
    /**
     * Acknowledges the completion screen — from its "Continue to the next
     * tour" or its dismiss action, or from a caller that finishes a tour
     * some other way. Records the tour as completed (for the Getting
     * Started panel's automatic checkmarks) and settles status at 'done',
     * so the completion screen never resurfaces for this run.
     */
    completeTour(state) {
      if (state.tourId && !state.completedTourIds.includes(state.tourId)) {
        state.completedTourIds.push(state.tourId);
      }
      state.status = 'done';
    },
    /** User dismissed the tour. Forgets the tour identity so it does not resume. */
    exitTour(state) {
      state.tourId = null;
      state.stepIndex = 0;
      state.status = 'idle';
    },
  },
});

export const selectTourState = (state: RootState): TourState => state.tour;
export const selectTourId = (state: RootState) => state.tour.tourId;
export const selectTourStepIndex = (state: RootState) => state.tour.stepIndex;
export const selectTourStatus = (state: RootState) => state.tour.status;
export const selectCompletedTourIds = (state: RootState) => state.tour.completedTourIds;

export const {
  startTour,
  nextStep,
  previousStep,
  goToStep,
  pauseTour,
  resumeTour,
  completeTour,
  exitTour,
} = tourSlice.actions;
