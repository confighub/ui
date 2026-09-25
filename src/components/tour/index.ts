// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Guided-tour engine.
 *
 * Defining a chapter:
 *
 * ```ts
 * export const componentsTour = defineTour({
 *   id: 'components',
 *   title: 'Components',
 *   steps: [
 *     {
 *       id: 'open-create',
 *       anchor: { kind: 'selector', css: '[data-testid="create-component"]' },
 *       title: 'Create a component',
 *       body: 'Start here.',
 *       advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="create-component"]' } },
 *       navigateTo: '/components',
 *     },
 *   ],
 * });
 * ```
 *
 * Add the module to `tours/index.ts` so it registers, then start it with
 * `useTourControls().start('components')` or the `?tour=components` URL param.
 */
export { TourHost } from './TourHost';
export { TourCue, TourCommand } from './TourCue';
export {
  GETTING_STARTED_TOUR_ID,
  EXPLORE_AND_INSPECT_TOUR_ID,
  DEPLOY_AND_RELEASE_TOUR_ID,
  CHANGE_AND_PROMOTE_TOUR_ID,
  OWNERSHIP_AND_PROD_TOUR_ID,
  PROD_AND_NEXT_TOUR_ID,
} from './tours';
export { defineTour, getTour, listTours } from './registry';
export { useTourControls } from './useTourControls';
export { TOUR_QUERY_PARAM, TOUR_Z_INDEX } from './constants';
export type { Anchor, Advance, AnchorRect, TourDefinition, TourStep } from './types';
export type { TourControls } from './useTourControls';
