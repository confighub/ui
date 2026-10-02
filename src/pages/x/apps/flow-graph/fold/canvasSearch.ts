// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentDeployment } from '../../componentTypes';
import { isMultiComponent, withComponentName } from '../componentFrames';
import { SEARCH_MAX_RESULTS } from './foldConstants';
import { type FoldModel, locationText } from './foldModel';

/** One row of the canvas search results. */
export interface SearchHit {
  /** The Deployment id (the Space ID, the same as its node id). */
  id: string;
  name: string;
  /**
   * Where the Deployment is drawn: "prod Base › retail stack". A folded
   * Deployment has no card on screen until its stack opens, so the result must
   * say where to look before the user jumps there.
   */
  where: string;
}

export interface SearchResult {
  /** At most SEARCH_MAX_RESULTS hits. */
  hits: SearchHit[];
  /** Every match, so the list can say how many it left out. */
  total: number;
}

const NO_RESULT: SearchResult = { hits: [], total: 0 };

/** Where a Deployment that is not a fold member is drawn. */
function treeWhere(
  d: ComponentDeployment,
  byId: ReadonlyMap<string, ComponentDeployment>,
  folded: boolean,
): string {
  const parent = d.parentDeploymentId ? byId.get(d.parentDeploymentId) : undefined;
  if (!parent) return 'Root Base';
  // In a folded graph every node that is not a fold member is a Base of the
  // tree; in the unfolded graph every node is a full card.
  return `${parent.displayName} Base › ${folded ? 'Base' : 'card'}`;
}

/**
 * Find the Deployments of a Component whose name or slug holds the query
 * (case-insensitive). Names that start with the query come first, then A-Z,
 * so typing the start of a name puts that name at the top.
 *
 * @param model the fold model on screen, or null when the graph does not fold
 */
export function searchDeployments(
  query: string,
  deployments: readonly ComponentDeployment[],
  model: FoldModel | null,
): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return NO_RESULT;

  const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
  const multi = isMultiComponent(deployments);
  const matches = deployments
    .map((d) => {
      const name = d.displayName.toLowerCase();
      const slug = d.slug.toLowerCase();
      if (!name.includes(q) && !slug.includes(q)) return null;
      return { d, starts: name.startsWith(q) || slug.startsWith(q) };
    })
    .filter((m): m is { d: ComponentDeployment; starts: boolean } => m !== null)
    .sort(
      (a, b) =>
        Number(b.starts) - Number(a.starts) || a.d.displayName.localeCompare(b.d.displayName),
    );

  const hits = matches.slice(0, SEARCH_MAX_RESULTS).map(({ d }) => ({
    id: d.deploymentId,
    name: d.displayName,
    where: withComponentName(
      model && model.location.has(d.deploymentId)
        ? locationText(d.deploymentId, model, byId)
        : treeWhere(d, byId, model !== null),
      d,
      multi,
    ),
  }));
  return { hits, total: matches.length };
}

/**
 * The part of a name the query matched, as [start, end), for the highlight.
 * Null when only the slug matched, so the row shows the name unmarked.
 */
export function matchRange(name: string, query: string): [number, number] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const start = name.toLowerCase().indexOf(q);
  return start < 0 ? null : [start, start + q.length];
}

export interface PointerPoint {
  x: number;
  y: number;
}

/**
 * A pointer that moves this far or less between down and up is a click. A
 * hand on a trackpad or mouse is never perfectly still, and a click that
 * drifted a pixel or two must still select the card.
 */
export const CLICK_PAN_THRESHOLD_PX = 4;

/**
 * Whether a click came at the end of a pan. In Auto mode a drag on a card
 * pans the canvas, and the browser still fires a click on the card at the
 * end of the drag; that click must not open the card's side pane.
 */
export function isClickAfterPan(
  down: PointerPoint,
  up: PointerPoint,
  threshold: number = CLICK_PAN_THRESHOLD_PX,
): boolean {
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  return dx * dx + dy * dy > threshold * threshold;
}
