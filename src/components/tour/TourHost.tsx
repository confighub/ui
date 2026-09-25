// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import useMediaQuery from '@mui/material/useMediaQuery';

import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import { writeTourState } from '@/state/slices/tour-storage';
import {
  completeTour,
  exitTour,
  nextStep,
  previousStep,
  selectTourState,
  startTour,
} from '@/state/slices/tourSlice';

import { TOUR_QUERY_PARAM } from './constants';
import { getTour } from './registry';
import { TourCompletion } from './TourCompletion';
import { TourTooltip } from './TourTooltip';
import type { Anchor } from './types';
import { useAnchorElement } from './useAnchorElement';
import { useAnchorRect } from './useAnchorRect';
import { useTourAdvance } from './useTourAdvance';

// Chapter modules register themselves as a side effect of being imported. The
// host needs them loaded before it can look a persisted tour id back up.
import './tours';

// Stable module-level reference (not recreated per render) — the completion
// screen floats next to the same "Get started" nav button the panel itself
// opens from (Layout.tsx), so finishing a tour never covers the thing the
// user just made with a full-screen card. See TourCompletion.tsx's header
// comment for why it floats here instead of centering.
const GET_STARTED_ANCHOR: Anchor = {
  kind: 'selector',
  css: '[data-testid="get-started-nav-button"]',
};

/**
 * Drives the active guided tour. Mount exactly once, in the persistent `Root`
 * wrapper — it must survive route changes and be inside the router so it can
 * navigate.
 *
 * Renders nothing at all unless a registered tour is running.
 */
export const TourHost = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: true });

  const { tourId, stepIndex, status, completedTourIds } = useAppSelector(selectTourState);

  useEffect(() => {
    writeTourState({ tourId, stepIndex, status, completedTourIds });
  }, [tourId, stepIndex, status, completedTourIds]);

  // `?tour=<id>` is the entry point for links and docs. The param is stripped
  // immediately: tour position belongs in local state, never in a shareable URL.
  const search = location.search;
  const pathname = location.pathname;
  useEffect(() => {
    const params = new URLSearchParams(search);
    const requested = params.get(TOUR_QUERY_PARAM);
    if (!requested) return;

    params.delete(TOUR_QUERY_PARAM);
    navigate({ pathname, search: params.toString() }, { replace: true });
    if (getTour(requested)) dispatch(startTour({ tourId: requested }));
  }, [search, pathname, navigate, dispatch]);

  const tour = getTour(tourId);
  const running = status === 'running' && tour !== null;
  const finished = status === 'finished' && tour !== null;
  const stepCount = tour?.steps.length ?? 0;
  const step = running && stepIndex < stepCount ? tour.steps[stepIndex] : null;

  const handleNext = useCallback(() => {
    if (stepCount === 0) return;
    dispatch(nextStep({ stepCount }));
  }, [dispatch, stepCount]);

  const handleBack = useCallback(() => dispatch(previousStep()), [dispatch]);
  const handleExit = useCallback(() => dispatch(exitTour()), [dispatch]);

  // `completeTour` both records this run in `completedTourIds` (the Getting
  // Started panel's automatic checkmarks) and settles `status` at 'done', so
  // the completion screen never resurfaces once acknowledged either way.
  const nextTourId = tour?.nextTourId;
  const handleContinue = useCallback(() => {
    dispatch(completeTour());
    if (nextTourId) dispatch(startTour({ tourId: nextTourId }));
  }, [dispatch, nextTourId]);
  const handleDismissCompletion = useCallback(() => dispatch(completeTour()), [dispatch]);

  // Push the step's route once per step entry. Keyed on the step rather than on
  // the current pathname so a user who navigates away mid-step is not dragged
  // back on every render.
  const stepKey = step ? `${tourId}:${stepIndex}` : null;
  const navigateTo = step?.navigateTo;
  const navigatedForStepRef = useRef<string | null>(null);
  useEffect(() => {
    if (!stepKey || !navigateTo) return;
    if (navigatedForStepRef.current === stepKey) return;
    navigatedForStepRef.current = stepKey;
    navigate(navigateTo);
  }, [stepKey, navigateTo, navigate]);

  const resolution = useAnchorElement(step?.anchor ?? null);
  const rect = useAnchorRect(resolution.element);
  const anchorMissing = resolution.status === 'missing';

  // Resolved independently of `resolution`/`rect` above: a step's
  // `spotlightAnchor` only ever widens what the RING visually covers. Click
  // detection, `anchorMissing` (and therefore the optional-skip and offer-a-
  // skip behavior), and Popper's placement all stay keyed on `resolution`/
  // `rect` from the real click anchor — a spotlight-only element resolving or
  // not resolving must never change whether the step can be skipped or
  // advanced. Falls back to the click anchor's own rect when unset, so every
  // step that predates this behaves exactly as before.
  const spotlightResolution = useAnchorElement(step?.spotlightAnchor ?? null);
  const spotlightRect = useAnchorRect(spotlightResolution.element);
  const displayRect = step?.spotlightAnchor ? spotlightRect : rect;

  // A step's target can resolve below the fold of a scrollable panel (a
  // config value row far down the tree, a node off the visible canvas) — the
  // spotlight and tooltip would then point at something the user cannot
  // actually see. Keyed on the element itself, not the step: this only fires
  // when a genuinely new element resolves (useAnchorElement's own dedupe),
  // never on the per-frame rect polling that follows. `block: 'nearest'`
  // leaves an already-visible anchor alone instead of re-centering it on
  // every step.
  useEffect(() => {
    if (resolution.status !== 'resolved') return;
    // Never scroll the React Flow canvas. `.react-flow` is a programmatic
    // scroll container (see ComponentFlowGraph's FlowContainer, which now
    // clips it for the same reason), so scrolling it does not bring a node
    // into view — it slides the whole canvas out of position and leaves a
    // residue that persists across steps and chapters. Bringing a node on
    // screen is React Flow's viewport transform's job, not the DOM's.
    if (resolution.element.closest('.react-flow')) return;
    resolution.element.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [resolution.status, resolution.element, reducedMotion]);

  // Resolved unconditionally (hooks can't be called conditionally) — cheap
  // when idle, since `useAnchorElement` short-circuits to 'idle' the instant
  // its `anchor` argument is null.
  const completionResolution = useAnchorElement(finished ? GET_STARTED_ANCHOR : null);
  const completionRect = useAnchorRect(completionResolution.element);

  // An optional step whose anchor never appeared is not an error — the feature
  // simply is not present for this user, so move on silently.
  const optional = step?.optional ?? false;
  useEffect(() => {
    if (!anchorMissing || !optional) return;
    handleNext();
  }, [anchorMissing, optional, handleNext]);

  // While the anchor is missing the advance condition is muted: the user is
  // being offered a manual skip and an auto-advance would fight it.
  useTourAdvance(step?.advance ?? null, running && step !== null && !anchorMissing, handleNext);

  if (finished && tour) {
    const nextTour = tour.nextTourId ? getTour(tour.nextTourId) : null;
    return (
      <TourCompletion
        open
        rect={completionRect}
        tourTitle={tour.title ?? 'This tour'}
        stepCount={stepCount}
        nextTourTitle={nextTour?.title}
        onContinue={handleContinue}
        onDismiss={handleDismissCompletion}
      />
    );
  }

  if (!running || !step) return null;
  if (anchorMissing && optional) return null;

  return (
    <TourTooltip
      open
      rect={displayRect}
      title={step.title}
      body={step.body}
      stepNumber={stepIndex + 1}
      stepCount={stepCount}
      showNext={step.advance.on === 'next'}
      anchorMissing={anchorMissing}
      allowClickThrough={step.allowClickThrough ?? true}
      reducedMotion={reducedMotion}
      dimBackground={step.dimBackground}
      placement={step.placement}
      onNext={handleNext}
      onBack={handleBack}
      onExit={handleExit}
    />
  );
};
