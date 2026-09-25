// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import { TourStatus } from '@/state/slices/tour-storage';
import {
  completeTour,
  exitTour,
  goToStep,
  nextStep,
  pauseTour,
  previousStep,
  resumeTour,
  selectTourState,
  startTour,
} from '@/state/slices/tourSlice';

import { getTour } from './registry';

export interface TourControls {
  /** Id of the tour the user is on, or null. */
  tourId: string | null;
  stepIndex: number;
  status: TourStatus;
  /** True when a registered tour is actively showing steps. */
  isRunning: boolean;
  /** Start (or restart) a registered tour. No-op for an unknown id. */
  start: (tourId: string, stepIndex?: number) => void;
  next: () => void;
  back: () => void;
  goTo: (stepIndex: number) => void;
  pause: () => void;
  resume: () => void;
  complete: () => void;
  /** Dismiss the tour and forget it. */
  exit: () => void;
}

/** Imperative handle for launching and steering tours from anywhere in the app. */
export const useTourControls = (): TourControls => {
  const dispatch = useAppDispatch();
  const { tourId, stepIndex, status } = useAppSelector(selectTourState);

  return useMemo<TourControls>(
    () => ({
      tourId,
      stepIndex,
      status,
      isRunning: status === 'running' && getTour(tourId) !== null,
      start: (id, index) => {
        if (!getTour(id)) return;
        dispatch(startTour({ tourId: id, stepIndex: index }));
      },
      next: () => {
        const stepCount = getTour(tourId)?.steps.length ?? 0;
        if (stepCount === 0) return;
        dispatch(nextStep({ stepCount }));
      },
      back: () => dispatch(previousStep()),
      goTo: (index) => dispatch(goToStep({ stepIndex: index })),
      pause: () => dispatch(pauseTour()),
      resume: () => dispatch(resumeTour()),
      complete: () => dispatch(completeTour()),
      exit: () => dispatch(exitTour()),
    }),
    [dispatch, tourId, stepIndex, status],
  );
};
