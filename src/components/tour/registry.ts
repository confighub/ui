// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { TourDefinition } from './types';

/**
 * In-memory registry of tour definitions.
 *
 * Tours cannot live in Redux — their steps hold React nodes and closures, which
 * would break the store's serializability contract — so Redux keeps only the
 * tour id and the host looks the definition up here.
 */
const tours = new Map<string, TourDefinition>();

/**
 * Register a tour and return it, so a chapter module can do
 * `export const myTour = defineTour({ ... })` at module scope.
 *
 * Re-registering the same id replaces the definition, which is what Vite HMR
 * needs when a chapter file is edited.
 */
export const defineTour = (tour: TourDefinition): TourDefinition => {
  if (tour.steps.length === 0) {
    throw new Error(`Tour "${tour.id}" must define at least one step`);
  }
  tours.set(tour.id, tour);
  return tour;
};

export const getTour = (id: string | null | undefined): TourDefinition | null =>
  id ? (tours.get(id) ?? null) : null;

export const listTours = (): TourDefinition[] => [...tours.values()];
